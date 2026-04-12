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
	toolCallID, toolName, buffer, ok := validateToolPreviewEventInputs(messageID, state, metadata)
	if !ok {
		return nil, nil
	}

	tokens, err := scanPartialJSONStrings(buffer)
	if err != nil {
		return nil, err
	}

	previewValue, targetIDsByType, ok := resolveToolPreviewPayload(
		tokens,
		metadata,
		temporaryToCanonical,
	)
	if !ok {
		return nil, nil
	}
	return a.finalizePreviewEvent(
		messageID,
		state.index,
		toolCallID,
		toolName,
		argumentsDelta,
		metadata.PreviewKind,
		previewValue,
		targetIDsByType,
	), nil
}

func extractPreviewTargetIDsFromTokens(tokens []partialJSONStringToken, pathsByType map[tools.IDType][]string) map[tools.IDType][]string {
	keysByType := previewKeysByType(pathsByType)
	if len(keysByType) == 0 {
		return nil
	}
	return collectPreviewTargetIDs(tokens, previewKeyOwners(keysByType))
}

func canonicalizePreviewTargetIDsByType(idsByType map[tools.IDType][]string, requiredPathsByType map[tools.IDType][]string, temporaryToCanonical map[string]string) (map[string][]string, bool) {
	if len(requiredPathsByType) == 0 {
		return map[string][]string{}, true
	}
	if len(idsByType) == 0 || len(temporaryToCanonical) == 0 {
		return nil, false
	}
	filtered := resolveCanonicalPreviewIDs(idsByType, temporaryToCanonical)
	if !previewTargetIDsSatisfied(filtered, requiredPathsByType) {
		return nil, false
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
	token := buffer[index]
	if token == '"' {
		return s.consumeString(buffer, index)
	}
	if s.consumeStructuralToken(token) {
		return index + 1, false, nil
	}
	if container := s.currentContainer(); container != nil && container.shouldConsumeNonStringValue(token) {
		return consumeNonStringValue(buffer, index, container), false, nil
	}
	return index + 1, false, nil
}

func (s *partialJSONScanner) consumeStructuralToken(token byte) bool {
	switch token {
	case '{':
		s.pushContainer(jsonContainerState{
			kind:         jsonContainerObject,
			expectingKey: true,
		})
		return true
	case '[':
		s.pushContainer(jsonContainerState{kind: jsonContainerArray})
		return true
	case ':':
		s.updateCurrentContainer(func(container *jsonContainerState) {
			container.noteObjectValueStart()
		})
		return true
	case ',':
		s.updateCurrentContainer(func(container *jsonContainerState) {
			container.noteObjectEntrySeparator()
		})
		return true
	case '}':
		s.popContainer(jsonContainerObject)
		return true
	case ']':
		s.popContainer(jsonContainerArray)
		return true
	default:
		return false
	}
}

func (s *partialJSONScanner) updateCurrentContainer(update func(*jsonContainerState)) {
	if container := s.currentContainer(); container != nil {
		update(container)
	}
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
		nextIndex, complete, terminal, err := appendPartialJSONStringFragment(&parsed, buffer, index)
		if err != nil {
			return "", 0, false, err
		}
		if terminal {
			return parsed.String(), nextIndex, complete, nil
		}
		index = nextIndex
	}
	return parsed.String(), len(buffer), false, nil
}

func validateToolPreviewEventInputs(messageID string, state *toolCallState, metadata *tools.ToolArgumentPreviewMetadata) (string, string, string, bool) {
	if state == nil || metadata == nil || strings.TrimSpace(messageID) == "" {
		return "", "", "", false
	}
	toolCallID := strings.TrimSpace(state.id)
	toolName := strings.TrimSpace(state.name)
	buffer := state.arguments.String()
	if toolCallID == "" || toolName == "" || buffer == "" {
		return "", "", "", false
	}
	return toolCallID, toolName, buffer, true
}

func resolveToolPreviewPayload(tokens []partialJSONStringToken, metadata *tools.ToolArgumentPreviewMetadata, temporaryToCanonical map[string]string) (string, map[string][]string, bool) {
	previewValue, ok := extractPreviewValueFromTokens(tokens, metadata.PreviewValuePath)
	if !ok {
		return "", nil, false
	}
	targetIDsByType, ok := canonicalizePreviewTargetIDsByType(
		extractPreviewTargetIDsFromTokens(tokens, metadata.TargetIDPathsByType),
		metadata.TargetIDPathsByType,
		temporaryToCanonical,
	)
	if !ok {
		return "", nil, false
	}
	return previewValue, targetIDsByType, true
}

func (a *toolPreviewAccumulator) previewState(index int) *toolPreviewState {
	current := a.byIndex[index]
	if current != nil {
		return current
	}
	current = &toolPreviewState{}
	a.byIndex[index] = current
	return current
}

func (a *toolPreviewAccumulator) finalizePreviewEvent(messageID string, stateIndex int, toolCallID string, toolName string, argumentsDelta string, previewKind tools.PreviewKind, previewValue string, targetIDsByType map[string][]string) *realtime.ToolArgumentPreviewDeltaEvent {
	current := a.previewState(stateIndex)
	previewValue = coalescePreviewValue(current.previewValue, previewValue)
	if !previewProgressed(current, previewValue, targetIDsByType) {
		return nil
	}
	previewDelta := previewValue[len(current.previewValue):]
	current.previewValue = previewValue
	current.targetIDsByType = cloneStringSliceMap(targetIDsByType)
	return &realtime.ToolArgumentPreviewDeltaEvent{
		Type:              realtime.StreamingEventTypeToolArgumentPreview,
		MessageID:         messageID,
		ToolCallID:        toolCallID,
		ToolName:          toolName,
		ArgumentsDelta:    argumentsDelta,
		PreviewKind:       previewKind,
		TargetIDsByType:   realtime.NewToolArgumentPreviewTargetIDsFromMap(targetIDsByType),
		PreviewValueDelta: previewDelta,
	}
}

func previewProgressed(current *toolPreviewState, previewValue string, targetIDsByType map[string][]string) bool {
	if current.previewValue != "" && !strings.HasPrefix(previewValue, current.previewValue) {
		return false
	}
	previewDelta := previewValue[len(current.previewValue):]
	return previewDelta != "" || !previewIDSetsEqual(current.targetIDsByType, targetIDsByType)
}

func previewKeysByType(pathsByType map[tools.IDType][]string) map[tools.IDType]map[string]struct{} {
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
	return keysByType
}

func previewKeyOwners(keysByType map[tools.IDType]map[string]struct{}) map[string][]tools.IDType {
	keyToTypes := map[string][]tools.IDType{}
	for idType, keys := range keysByType {
		for key := range keys {
			keyToTypes[key] = append(keyToTypes[key], idType)
		}
	}
	return keyToTypes
}

func collectPreviewTargetIDs(tokens []partialJSONStringToken, keyToTypes map[string][]tools.IDType) map[tools.IDType][]string {
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

func resolveCanonicalPreviewIDs(idsByType map[tools.IDType][]string, temporaryToCanonical map[string]string) map[string][]string {
	filtered := map[string][]string{}
	for idType, ids := range idsByType {
		resolved := resolveCanonicalPreviewIDsForType(ids, temporaryToCanonical)
		if len(resolved) != 0 {
			filtered[string(idType)] = resolved
		}
	}
	return filtered
}

func resolveCanonicalPreviewIDsForType(ids []string, temporaryToCanonical map[string]string) []string {
	if len(ids) == 0 {
		return nil
	}
	resolved := make([]string, 0, len(ids))
	for _, id := range ids {
		canonical, ok := temporaryToCanonical[id]
		if !ok || strings.TrimSpace(canonical) == "" {
			continue
		}
		resolved = appendUniqueString(resolved, canonical)
	}
	return resolved
}

func previewTargetIDsSatisfied(filtered map[string][]string, requiredPathsByType map[tools.IDType][]string) bool {
	for idType, paths := range requiredPathsByType {
		if len(paths) == 0 {
			continue
		}
		if len(filtered[string(idType)]) == 0 {
			return false
		}
	}
	return true
}

func appendPartialJSONStringFragment(parsed *strings.Builder, buffer string, index int) (int, bool, bool, error) {
	char := buffer[index]
	if char == '"' {
		return index + 1, true, true, nil
	}
	if char != '\\' {
		parsed.WriteByte(char)
		return index + 1, false, false, nil
	}
	return appendEscapedPartialJSONStringFragment(parsed, buffer, index+1)
}

func appendEscapedPartialJSONStringFragment(parsed *strings.Builder, buffer string, index int) (int, bool, bool, error) {
	if index >= len(buffer) {
		return len(buffer), false, true, nil
	}
	escape := buffer[index]
	switch escape {
	case '"', '\\', '/':
		parsed.WriteByte(escape)
		return index + 1, false, false, nil
	case 'b':
		parsed.WriteByte('\b')
		return index + 1, false, false, nil
	case 'f':
		parsed.WriteByte('\f')
		return index + 1, false, false, nil
	case 'n':
		parsed.WriteByte('\n')
		return index + 1, false, false, nil
	case 'r':
		parsed.WriteByte('\r')
		return index + 1, false, false, nil
	case 't':
		parsed.WriteByte('\t')
		return index + 1, false, false, nil
	case 'u':
		return appendUnicodeEscape(parsed, buffer, index)
	default:
		parsed.WriteByte(escape)
		return index + 1, false, false, nil
	}
}

func appendUnicodeEscape(parsed *strings.Builder, buffer string, index int) (int, bool, bool, error) {
	if index+4 >= len(buffer) {
		return len(buffer), false, true, nil
	}
	code := buffer[index+1 : index+5]
	value, err := strconv.ParseUint(code, 16, 64)
	if err != nil {
		return 0, false, false, fmt.Errorf("decode partial json unicode escape %q: %w", code, err)
	}
	parsed.WriteRune(rune(value))
	return index + 5, false, false, nil
}

func isWhitespace(value byte) bool {
	switch value {
	case ' ', '\n', '\r', '\t':
		return true
	default:
		return false
	}
}
