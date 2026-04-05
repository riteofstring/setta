package managedllm

import (
	"fmt"
	"strconv"
	"strings"

	"setta/internal/realtime"
	"setta/internal/tools"
)

type toolPreviewAccumulator struct {
	byIndex map[int]*toolPreviewState
}

type toolPreviewState struct {
	previewValue    string
	targetIDsByType map[string][]string
}

type partialJSONStringToken struct {
	Value      string
	Kind       string
	OwnerKey   string
	IsComplete bool
}

const (
	jsonContainerObject = "object"
	jsonContainerArray  = "array"
)

type jsonContainerState struct {
	kind           string
	valueOwnerKey  string
	objectKeyOwner string
	expectingKey   bool
	expectingValue bool
	pendingKey     string
	hasPendingKey  bool
}

type partialJSONScanner struct {
	tokens     []partialJSONStringToken
	containers []jsonContainerState
}

func newToolPreviewAccumulator() *toolPreviewAccumulator {
	return &toolPreviewAccumulator{
		byIndex: map[int]*toolPreviewState{},
	}
}

func (a *toolPreviewAccumulator) buildEvent(messageID string, state *toolCallState, metadata *tools.ToolArgumentPreviewMetadata, argumentsDelta string, temporaryToCanonical map[string]string) (*realtime.ToolArgumentPreviewDeltaEvent, error) {
	if a == nil || state == nil || metadata == nil {
		return nil, nil
	}
	if strings.TrimSpace(messageID) == "" {
		return nil, nil
	}
	toolCallID := strings.TrimSpace(state.id)
	toolName := strings.TrimSpace(state.name)
	if toolCallID == "" || toolName == "" {
		return nil, nil
	}
	buffer := state.arguments.String()
	if buffer == "" {
		return nil, nil
	}

	tokens, err := scanPartialJSONStrings(buffer)
	if err != nil {
		return nil, err
	}
	previewValue, ok := extractPreviewValueFromTokens(tokens, metadata.PreviewValuePath)
	if !ok {
		return nil, nil
	}

	targetIDsByType, ok := canonicalizePreviewTargetIDsByType(
		extractPreviewTargetIDsFromTokens(tokens, metadata.TargetIDPathsByType),
		metadata.TargetIDPathsByType,
		temporaryToCanonical,
	)
	if !ok {
		return nil, nil
	}

	current := a.byIndex[state.index]
	if current == nil {
		current = &toolPreviewState{}
		a.byIndex[state.index] = current
	}

	previewValue = coalescePreviewValue(current.previewValue, previewValue)
	if current.previewValue != "" && !strings.HasPrefix(previewValue, current.previewValue) {
		return nil, nil
	}
	previewDelta := previewValue[len(current.previewValue):]
	if previewDelta == "" && previewIDSetsEqual(current.targetIDsByType, targetIDsByType) {
		return nil, nil
	}

	current.previewValue = previewValue
	current.targetIDsByType = cloneStringSliceMap(targetIDsByType)

	return &realtime.ToolArgumentPreviewDeltaEvent{
		Type:              realtime.StreamingEventTypeToolArgumentPreview,
		MessageID:         messageID,
		ToolCallID:        toolCallID,
		ToolName:          toolName,
		ArgumentsDelta:    argumentsDelta,
		PreviewKind:       string(metadata.PreviewKind),
		TargetIDsByType:   cloneStringSliceMap(targetIDsByType),
		PreviewValueDelta: previewDelta,
	}, nil
}

func extractPreviewTargetIDsFromTokens(tokens []partialJSONStringToken, pathsByType map[tools.IDType][]string) map[tools.IDType][]string {
	keysByType := map[tools.IDType]map[string]struct{}{}
	for idType, paths := range pathsByType {
		for _, path := range paths {
			key := previewPathKey(path)
			if key == "" {
				continue
			}
			if keysByType[idType] == nil {
				keysByType[idType] = map[string]struct{}{}
			}
			keysByType[idType][key] = struct{}{}
		}
	}
	if len(keysByType) == 0 {
		return nil
	}

	keyToTypes := map[string][]tools.IDType{}
	for idType, keys := range keysByType {
		for key := range keys {
			keyToTypes[key] = append(keyToTypes[key], idType)
		}
	}

	combined := map[tools.IDType][]string{}
	for _, token := range tokens {
		if !token.IsComplete || token.Value == "" || token.OwnerKey == "" {
			continue
		}
		for _, idType := range keyToTypes[token.OwnerKey] {
			combined[idType] = appendUniqueString(combined[idType], token.Value)
		}
	}
	return combined
}

func canonicalizePreviewTargetIDsByType(idsByType map[tools.IDType][]string, requiredPathsByType map[tools.IDType][]string, temporaryToCanonical map[string]string) (map[string][]string, bool) {
	if len(requiredPathsByType) == 0 {
		return map[string][]string{}, true
	}
	if len(idsByType) == 0 || len(temporaryToCanonical) == 0 {
		return nil, false
	}

	filtered := map[string][]string{}
	for idType, ids := range idsByType {
		if len(ids) == 0 {
			continue
		}
		resolved := make([]string, 0, len(ids))
		for _, id := range ids {
			canonical, ok := temporaryToCanonical[id]
			if !ok || strings.TrimSpace(canonical) == "" {
				continue
			}
			resolved = appendUniqueString(resolved, canonical)
		}
		if len(resolved) != 0 {
			filtered[string(idType)] = resolved
		}
	}

	for idType, paths := range requiredPathsByType {
		if len(paths) == 0 {
			continue
		}
		if len(filtered[string(idType)]) == 0 {
			return nil, false
		}
	}
	return filtered, true
}

func extractPreviewValueFromTokens(tokens []partialJSONStringToken, previewValuePath string) (string, bool) {
	key := previewPathKey(previewValuePath)
	if key == "" {
		return "", false
	}
	var lastValue string
	found := false
	for _, token := range tokens {
		if token.Kind != "value" || token.OwnerKey != key {
			continue
		}
		lastValue = token.Value
		found = true
	}
	return lastValue, found
}

func previewPathKey(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" || trimmed == "$" {
		return ""
	}
	segments := strings.Split(trimmed, ".")
	for index := len(segments) - 1; index >= 0; index-- {
		segment := strings.TrimSpace(segments[index])
		if segment != "" {
			return segment
		}
	}
	return ""
}

func coalescePreviewValue(lastValue string, nextValue string) string {
	if lastValue == "" {
		return nextValue
	}
	if len(nextValue) < len(lastValue) && strings.HasPrefix(lastValue, nextValue) {
		return lastValue
	}
	return nextValue
}

func previewIDSetsEqual(left map[string][]string, right map[string][]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValues := range left {
		rightValues, ok := right[key]
		if !ok {
			return false
		}
		if len(leftValues) != len(rightValues) {
			return false
		}
		rightSet := map[string]struct{}{}
		for _, value := range rightValues {
			rightSet[value] = struct{}{}
		}
		for _, value := range leftValues {
			if _, ok := rightSet[value]; !ok {
				return false
			}
		}
	}
	return true
}

func appendUniqueString(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func cloneStringSliceMap(values map[string][]string) map[string][]string {
	if values == nil {
		return nil
	}
	cloned := make(map[string][]string, len(values))
	for key, entries := range values {
		cloned[key] = append([]string(nil), entries...)
	}
	return cloned
}

func scanPartialJSONStrings(buffer string) ([]partialJSONStringToken, error) {
	scanner := partialJSONScanner{}
	for i := 0; i < len(buffer); {
		nextIndex, isTerminal, err := scanner.consume(buffer, i)
		if err != nil {
			return nil, err
		}
		i = nextIndex
		if isTerminal {
			return scanner.tokens, nil
		}
	}
	return scanner.tokens, nil
}

func (s *partialJSONScanner) consume(buffer string, index int) (int, bool, error) {
	switch buffer[index] {
	case '"':
		return s.consumeString(buffer, index)
	case '{':
		s.pushContainer(jsonContainerState{
			kind:         jsonContainerObject,
			expectingKey: true,
		})
	case '[':
		s.pushContainer(jsonContainerState{kind: jsonContainerArray})
	case ':':
		if container := s.currentContainer(); container != nil {
			container.noteObjectValueStart()
		}
	case ',':
		if container := s.currentContainer(); container != nil {
			container.noteObjectEntrySeparator()
		}
	case '}':
		s.popContainer(jsonContainerObject)
	case ']':
		s.popContainer(jsonContainerArray)
	default:
		if container := s.currentContainer(); container != nil && container.shouldConsumeNonStringValue(buffer[index]) {
			return consumeNonStringValue(buffer, index, container), false, nil
		}
	}
	return index + 1, false, nil
}

func (s *partialJSONScanner) consumeString(buffer string, startIndex int) (int, bool, error) {
	value, nextIndex, isComplete, err := parsePartialJSONStringWithEnd(buffer, startIndex+1)
	if err != nil {
		return 0, false, err
	}
	s.appendStringToken(value, isComplete)
	return nextIndex, !isComplete, nil
}

func (s *partialJSONScanner) appendStringToken(value string, isComplete bool) {
	token := partialJSONStringToken{
		Value:      value,
		Kind:       "value",
		IsComplete: isComplete,
	}
	if container := s.currentContainer(); container != nil {
		token = container.classifyStringToken(value, isComplete)
		container.recordCompletedStringToken(token)
	}
	s.tokens = append(s.tokens, token)
}

func (s *partialJSONScanner) currentContainer() *jsonContainerState {
	if len(s.containers) == 0 {
		return nil
	}
	return &s.containers[len(s.containers)-1]
}

func (s *partialJSONScanner) pushContainer(container jsonContainerState) {
	if parent := s.currentContainer(); parent != nil {
		parent.attachChild(&container)
	}
	s.containers = append(s.containers, container)
}

func (s *partialJSONScanner) popContainer(kind string) {
	if len(s.containers) == 0 || s.containers[len(s.containers)-1].kind != kind {
		return
	}
	s.containers = s.containers[:len(s.containers)-1]
}

func (c *jsonContainerState) classifyStringToken(value string, isComplete bool) partialJSONStringToken {
	token := partialJSONStringToken{
		Value:      value,
		Kind:       "value",
		IsComplete: isComplete,
	}
	switch c.kind {
	case jsonContainerObject:
		switch {
		case c.expectingKey:
			token.Kind = "key"
			token.OwnerKey = c.objectKeyOwner
		case c.expectingValue:
			token.OwnerKey = c.pendingKey
		}
	case jsonContainerArray:
		token.OwnerKey = c.valueOwnerKey
	}
	return token
}

func (c *jsonContainerState) recordCompletedStringToken(token partialJSONStringToken) {
	if !token.IsComplete || c.kind != jsonContainerObject {
		return
	}
	switch token.Kind {
	case "key":
		c.pendingKey = token.Value
		c.hasPendingKey = true
		c.expectingKey = false
	case "value":
		if c.expectingValue {
			c.clearPendingValue()
		}
	}
}

func (c *jsonContainerState) attachChild(child *jsonContainerState) {
	switch {
	case c.kind == jsonContainerObject && c.expectingValue && c.hasPendingKey:
		child.valueOwnerKey = c.pendingKey
		if child.kind == jsonContainerObject {
			child.objectKeyOwner = c.pendingKey
		}
		c.clearPendingValue()
	case c.kind == jsonContainerArray:
		child.valueOwnerKey = c.valueOwnerKey
	}
}

func (c *jsonContainerState) noteObjectValueStart() {
	if c.kind == jsonContainerObject && c.hasPendingKey && !c.expectingValue {
		c.expectingValue = true
	}
}

func (c *jsonContainerState) noteObjectEntrySeparator() {
	if c.kind != jsonContainerObject {
		return
	}
	c.expectingKey = true
	c.clearPendingValue()
}

func (c *jsonContainerState) shouldConsumeNonStringValue(char byte) bool {
	return c.kind == jsonContainerObject && c.expectingValue && !isWhitespace(char)
}

func (c *jsonContainerState) clearPendingValue() {
	c.expectingValue = false
	c.pendingKey = ""
	c.hasPendingKey = false
}

func consumeNonStringValue(buffer string, startIndex int, container *jsonContainerState) int {
	container.expectingValue = false
	container.pendingKey = ""
	container.hasPendingKey = false
	index := startIndex
	for index < len(buffer) && !strings.ContainsRune(",]}", rune(buffer[index])) {
		index++
	}
	return index
}

func parsePartialJSONStringWithEnd(buffer string, startIndex int) (string, int, bool, error) {
	var parsed strings.Builder
	index := startIndex
	for index < len(buffer) {
		char := buffer[index]
		if char == '"' {
			return parsed.String(), index + 1, true, nil
		}
		if char != '\\' {
			parsed.WriteByte(char)
			index++
			continue
		}
		index++
		if index >= len(buffer) {
			return parsed.String(), len(buffer), false, nil
		}
		escape := buffer[index]
		switch escape {
		case '"', '\\', '/':
			parsed.WriteByte(escape)
		case 'b':
			parsed.WriteByte('\b')
		case 'f':
			parsed.WriteByte('\f')
		case 'n':
			parsed.WriteByte('\n')
		case 'r':
			parsed.WriteByte('\r')
		case 't':
			parsed.WriteByte('\t')
		case 'u':
			if index+4 >= len(buffer) {
				return parsed.String(), len(buffer), false, nil
			}
			code := buffer[index+1 : index+5]
			value, err := strconv.ParseUint(code, 16, 64)
			if err != nil {
				return "", 0, false, fmt.Errorf("decode partial json unicode escape %q: %w", code, err)
			}
			parsed.WriteRune(rune(value))
			index += 5
			continue
		default:
			parsed.WriteByte(escape)
		}
		index++
	}
	return parsed.String(), len(buffer), false, nil
}

func isWhitespace(value byte) bool {
	switch value {
	case ' ', '\n', '\r', '\t':
		return true
	default:
		return false
	}
}
