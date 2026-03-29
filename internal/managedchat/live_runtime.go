package managedchat

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	"setta/internal/agentruns"
	"setta/internal/realtime"
)

var ErrLiveRunNotActive = errors.New("managed live chat run is not active")

type StreamBroadcaster interface {
	BroadcastJSON(ctx context.Context, message any, selection realtime.Selection) (int, error)
}

type LiveRuntimeOptions struct {
	Broadcaster StreamBroadcaster
}

type StreamChunkParams struct {
	RunID           string
	ChatID          string
	ProjectConfigID *string
	SectionID       *string
	Chunk           any
}

type LiveRuntime struct {
	broadcaster StreamBroadcaster

	mu     sync.RWMutex
	active map[string]*liveRunState

	followByChat map[managedAIFollowChatKey]managedAIFollowEntry
}

type liveRunState struct {
	ChatState       *ChatState
	ProjectConfigID string
	ChatID          string
}

type managedAIFollowChatKey struct {
	ProjectConfigID string
	ChatID          string
}

type managedAIFollowEntry struct {
	RunID     string
	IDsByType map[string][]string
}

func NewLiveRuntime(options LiveRuntimeOptions) *LiveRuntime {
	return &LiveRuntime{
		broadcaster:  options.Broadcaster,
		active:       map[string]*liveRunState{},
		followByChat: map[managedAIFollowChatKey]managedAIFollowEntry{},
	}
}

func (r *LiveRuntime) ActivateRun(run agentruns.Run) {
	if r == nil {
		return
	}
	runID := strings.TrimSpace(run.ID)
	if runID == "" {
		return
	}
	state, err := buildChatStateFromRun(run.Clone())
	if err != nil {
		return
	}
	r.mu.Lock()
	r.active[runID] = &liveRunState{
		ChatState:       state.Clone(),
		ProjectConfigID: resolveRunInputString(run, "projectConfigId"),
		ChatID:          resolveRunInputString(run, "chatId"),
	}
	r.mu.Unlock()
}

func (r *LiveRuntime) DeactivateRun(runID string) {
	if r == nil {
		return
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return
	}
	r.mu.Lock()
	if state, ok := r.active[trimmedRunID]; ok {
		if key, ok := state.followKey(); ok {
			if entry, exists := r.followByChat[key]; exists && entry.RunID == trimmedRunID {
				delete(r.followByChat, key)
			}
		}
	}
	delete(r.active, trimmedRunID)
	r.mu.Unlock()
}

func (r *LiveRuntime) GetLiveChatState(runID string) (*ChatState, error) {
	if r == nil {
		return nil, nil
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return nil, nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	state, ok := r.active[trimmedRunID]
	if !ok || state == nil || state.ChatState == nil {
		return nil, nil
	}
	return state.ChatState.Clone(), nil
}

func (r *LiveRuntime) AIFollowSnapshot(projectConfigID string) []realtime.AIFollowToolArgumentsUpdateContent {
	if r == nil {
		return []realtime.AIFollowToolArgumentsUpdateContent{}
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	keys := make([]managedAIFollowChatKey, 0, len(r.followByChat))
	for key, entry := range r.followByChat {
		if key.ProjectConfigID != projectConfigID || len(entry.IDsByType) == 0 {
			continue
		}
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i int, j int) bool {
		return keys[i].ChatID < keys[j].ChatID
	})

	snapshot := make([]realtime.AIFollowToolArgumentsUpdateContent, 0, len(keys))
	for _, key := range keys {
		entry := r.followByChat[key]
		snapshot = append(snapshot, realtime.AIFollowToolArgumentsUpdateContent{
			ProjectConfigID: key.ProjectConfigID,
			ChatID:          key.ChatID,
			IDsByType:       cloneStringSliceMap(entry.IDsByType),
		})
	}
	return snapshot
}

func (r *LiveRuntime) ApplyChunk(ctx context.Context, params StreamChunkParams) error {
	return r.applyChunk(ctx, params)
}

func (s *liveRunState) followKey() (managedAIFollowChatKey, bool) {
	if s == nil {
		return managedAIFollowChatKey{}, false
	}
	projectConfigID := strings.TrimSpace(s.ProjectConfigID)
	chatID := strings.TrimSpace(s.ChatID)
	if projectConfigID == "" || chatID == "" {
		return managedAIFollowChatKey{}, false
	}
	return managedAIFollowChatKey{
		ProjectConfigID: projectConfigID,
		ChatID:          chatID,
	}, true
}

func extractManagedAIFollowIDsByType(chunk any) (map[string][]string, bool) {
	switch typed := chunk.(type) {
	case realtime.ToolArgumentPreviewDeltaEvent:
		return normalizeManagedAIFollowIDsByType(typed.TargetIDsByType), true
	case *realtime.ToolArgumentPreviewDeltaEvent:
		if typed == nil {
			return nil, false
		}
		return extractManagedAIFollowIDsByType(*typed)
	default:
		return nil, false
	}
}

func normalizeManagedAIFollowIDsByType(input map[string][]string) map[string][]string {
	if len(input) == 0 {
		return nil
	}
	normalized := make(map[string][]string, len(input))
	for rawType, ids := range input {
		idType := strings.TrimSpace(rawType)
		if idType == "" {
			continue
		}
		seen := map[string]struct{}{}
		values := make([]string, 0, len(ids))
		for _, rawID := range ids {
			id := strings.TrimSpace(rawID)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			values = append(values, id)
		}
		if len(values) == 0 {
			continue
		}
		sort.Strings(values)
		normalized[idType] = values
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func stringSliceMapsEqual(left map[string][]string, right map[string][]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValues := range left {
		rightValues, ok := right[key]
		if !ok || len(leftValues) != len(rightValues) {
			return false
		}
		for index := range leftValues {
			if leftValues[index] != rightValues[index] {
				return false
			}
		}
	}
	return true
}

func applyStreamChunk(state ChatState, chunk any) (*ChatState, error) {
	next := state.Clone()
	if next == nil {
		next = &ChatState{
			Messages:          []map[string]any{},
			ToolCallArguments: map[string]string{},
		}
	}

	switch typed := dereferenceStreamChunk(chunk).(type) {
	case nil:
		return next, nil
	case realtime.MessageStartEvent:
		return applyMessageStartChunk(next, typed)
	case realtime.MessageDeltaEvent:
		next.Messages = applyMessageDelta(next.Messages, typed)
		return next, nil
	case realtime.ToolCallDeltaEvent:
		next.Messages = applyToolCallDelta(
			next.Messages,
			typed.MessageID,
			typed.ToolCallID,
			typed.ToolName,
		)
		next.ToolCallArguments = appendToolCallArgumentsDelta(
			next.ToolCallArguments,
			typed.ToolCallID,
			typed.ArgumentsDelta,
		)
		return next, nil
	case realtime.ToolArgumentPreviewDeltaEvent:
		return applyToolArgumentPreviewChunk(next, typed), nil
	case realtime.ToolResultEvent:
		return applyToolResultChunk(next, typed)
	case realtime.MessageStopEvent:
		next.WaitingForResponse = false
		return next, nil
	case realtime.MessageFinalizedEvent:
		return applyMessageFinalizedChunk(next, typed)
	default:
		return next, nil
	}
}

func applyMessageStartChunk(next *ChatState, chunk realtime.MessageStartEvent) (*ChatState, error) {
	message, err := normalizeMessage(chunk.Message)
	if err != nil {
		return nil, err
	}
	if shouldIgnoreResponsePlaceholderMessage(message) {
		return next, nil
	}
	next.Messages = upsertChatMessage(next.Messages, message)
	next.WaitingForResponse = true
	return next, nil
}

func applyToolArgumentPreviewChunk(next *ChatState, chunk realtime.ToolArgumentPreviewDeltaEvent) *ChatState {
	toolName := stringPtr(strings.TrimSpace(chunk.ToolName))
	next.Messages = applyToolCallDelta(next.Messages, chunk.MessageID, chunk.ToolCallID, toolName)
	next.ToolCallArguments = appendToolCallArgumentsDelta(
		next.ToolCallArguments,
		chunk.ToolCallID,
		chunk.ArgumentsDelta,
	)
	return next
}

func applyToolResultChunk(next *ChatState, chunk realtime.ToolResultEvent) (*ChatState, error) {
	message, err := normalizeMessage(chunk.Result)
	if err != nil {
		return nil, err
	}
	next.Messages = upsertChatMessage(next.Messages, message)
	return next, nil
}

func applyMessageFinalizedChunk(next *ChatState, chunk realtime.MessageFinalizedEvent) (*ChatState, error) {
	message, err := normalizeMessage(chunk.Message)
	if err != nil {
		return nil, err
	}
	if shouldIgnoreResponsePlaceholderMessage(message) {
		return next, nil
	}
	targetID := ""
	if role, roleErr := messageRole(message); roleErr == nil && role == "assistant" {
		message, targetID = resolveFinalizedAssistantMessageUpdate(next.Messages, message)
	}
	next.Messages = upsertChatMessageByID(next.Messages, message, targetID)
	next.ToolCallArguments = map[string]string{}
	next.WaitingForResponse = false
	return next, nil
}

func upsertChatMessage(messages []map[string]any, message map[string]any) []map[string]any {
	targetMessageID, err := messageID(message)
	if err != nil {
		return cloneMessageSlice(messages)
	}
	updated := cloneMessageSlice(messages)
	for index, entry := range updated {
		entryID, err := messageID(entry)
		if err != nil {
			continue
		}
		if entryID != targetMessageID {
			continue
		}
		updated[index] = cloneAnyMap(message)
		return updated
	}
	return append(updated, cloneAnyMap(message))
}

func ensureAssistantMessage(messages []map[string]any, targetMessageID string) []map[string]any {
	trimmedMessageID := strings.TrimSpace(targetMessageID)
	if trimmedMessageID == "" {
		return cloneMessageSlice(messages)
	}
	for _, entry := range messages {
		entryID, err := messageID(entry)
		if err != nil || entryID != trimmedMessageID {
			continue
		}
		role, err := messageRole(entry)
		if err == nil && role == "assistant" {
			return cloneMessageSlice(messages)
		}
	}
	updated := cloneMessageSlice(messages)
	updated = append(updated, map[string]any{
		"id":      trimmedMessageID,
		"role":    "assistant",
		"content": []any{},
	})
	return updated
}

func applyMessageDelta(messages []map[string]any, chunk realtime.MessageDeltaEvent) []map[string]any {
	if strings.TrimSpace(chunk.MessageID) == "" || len(chunk.Content) == 0 {
		return cloneMessageSlice(messages)
	}
	updated := ensureAssistantMessage(messages, chunk.MessageID)
	index := findMessageIndex(updated, chunk.MessageID)
	if index == -1 {
		return updated
	}
	message := cloneAnyMap(updated[index])
	content := cloneContentList(message["content"])
	for _, rawDelta := range chunk.Content {
		switch delta := rawDelta.(type) {
		case realtime.MessageTextDelta:
			content = applyTextDelta(content, delta)
		case *realtime.MessageTextDelta:
			if delta != nil {
				content = applyTextDelta(content, *delta)
			}
		case realtime.MessageThinkingDelta:
			content = applyThinkingDelta(content, delta)
		case *realtime.MessageThinkingDelta:
			if delta != nil {
				content = applyThinkingDelta(content, *delta)
			}
		case map[string]any:
			normalized, ok := normalizeContentDelta(delta)
			if !ok {
				continue
			}
			switch typed := normalized.(type) {
			case realtime.MessageTextDelta:
				content = applyTextDelta(content, typed)
			case realtime.MessageThinkingDelta:
				content = applyThinkingDelta(content, typed)
			}
		}
	}
	message["content"] = content
	updated[index] = message
	return updated
}

func normalizeContentDelta(raw map[string]any) (any, bool) {
	deltaType := strings.TrimSpace(stringValue(raw["type"]))
	indexValue, ok := extractInt(raw["index"])
	if !ok {
		indexValue = 0
	}
	switch deltaType {
	case realtime.MessageContentTypeTextDelta:
		return realtime.MessageTextDelta{
			Type:  deltaType,
			Index: indexValue,
			Text:  stringValue(raw["text"]),
		}, true
	case realtime.MessageContentTypeThinkingDelta:
		var summary *string
		if rawSummary, ok := raw["summary"]; ok {
			summary = optionalString(rawSummary)
		}
		var signature *string
		if rawSignature, ok := raw["signature"]; ok {
			signature = optionalString(rawSignature)
		}
		return realtime.MessageThinkingDelta{
			Type:      deltaType,
			Index:     indexValue,
			Thinking:  stringValue(raw["thinking"]),
			Summary:   summary,
			Signature: signature,
		}, true
	default:
		return nil, false
	}
}

func applyTextDelta(content []any, delta realtime.MessageTextDelta) []any {
	index := normalizeContentIndex(delta.Index, len(content))
	updated, block := ensureTextBlock(content, index)
	block["text"] = stringValue(block["text"]) + delta.Text
	return updated
}

func applyThinkingDelta(content []any, delta realtime.MessageThinkingDelta) []any {
	index := normalizeContentIndex(delta.Index, len(content))
	updated, block := ensureThinkingBlock(content, index)
	block["thinking"] = stringValue(block["thinking"]) + delta.Thinking
	if delta.Summary != nil {
		block["summary"] = *delta.Summary
	}
	if delta.Signature != nil {
		block["signature"] = *delta.Signature
	}
	return updated
}

func applyToolCallDelta(messages []map[string]any, messageID string, toolCallID string, toolName *string) []map[string]any {
	trimmedMessageID := strings.TrimSpace(messageID)
	trimmedToolCallID := strings.TrimSpace(toolCallID)
	if trimmedMessageID == "" || trimmedToolCallID == "" {
		return cloneMessageSlice(messages)
	}
	updated := ensureAssistantMessage(messages, trimmedMessageID)
	index := findMessageIndex(updated, trimmedMessageID)
	if index == -1 {
		return updated
	}
	message := cloneAnyMap(updated[index])
	rawToolCalls, _ := message["tool_calls"].([]any)
	toolCalls := cloneContentList(rawToolCalls)
	name := ""
	if toolName != nil {
		name = strings.TrimSpace(*toolName)
	}
	for entryIndex, rawEntry := range toolCalls {
		toolCall, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(toolCall["id"])) != trimmedToolCallID {
			continue
		}
		nextToolCall := cloneAnyMap(toolCall)
		function, _ := nextToolCall["function"].(map[string]any)
		function = cloneAnyMap(function)
		if function == nil {
			function = map[string]any{}
		}
		if name != "" {
			function["name"] = name
		}
		if _, ok := function["arguments"]; !ok {
			function["arguments"] = map[string]any{}
		}
		if _, ok := nextToolCall["type"]; !ok {
			nextToolCall["type"] = "function"
		}
		nextToolCall["function"] = function
		toolCalls[entryIndex] = nextToolCall
		message["tool_calls"] = toolCalls
		updated[index] = message
		return updated
	}
	toolCalls = append(toolCalls, map[string]any{
		"id":   trimmedToolCallID,
		"type": "function",
		"function": map[string]any{
			"name":      name,
			"arguments": map[string]any{},
		},
	})
	message["tool_calls"] = toolCalls
	updated[index] = message
	return updated
}

func appendToolCallArgumentsDelta(
	toolCallArguments map[string]string,
	toolCallID string,
	argumentsDelta string,
) map[string]string {
	trimmedToolCallID := strings.TrimSpace(toolCallID)
	if trimmedToolCallID == "" {
		return cloneStringMap(toolCallArguments)
	}
	next := cloneStringMap(toolCallArguments)
	next[trimmedToolCallID] = next[trimmedToolCallID] + argumentsDelta
	return next
}

func dereferenceStreamChunk(chunk any) any {
	switch typed := chunk.(type) {
	case *realtime.MessageStartEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case *realtime.MessageDeltaEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case *realtime.ToolCallDeltaEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case *realtime.ToolArgumentPreviewDeltaEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case *realtime.ToolResultEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case *realtime.MessageStopEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case *realtime.MessageFinalizedEvent:
		if typed == nil {
			return nil
		}
		return *typed
	default:
		return chunk
	}
}

func cloneStreamChunk(chunk any) any {
	switch typed := dereferenceStreamChunk(chunk).(type) {
	case nil:
		return nil
	case realtime.MessageStartEvent:
		return realtime.MessageStartEvent{
			Type:    typed.Type,
			Message: cloneAnyMap(typed.Message),
		}
	case realtime.MessageDeltaEvent:
		return realtime.MessageDeltaEvent{
			Type:      typed.Type,
			MessageID: typed.MessageID,
			Content:   cloneContentList(typed.Content),
		}
	case realtime.ToolCallDeltaEvent:
		return typed
	case realtime.ToolArgumentPreviewDeltaEvent:
		return realtime.ToolArgumentPreviewDeltaEvent{
			Type:              typed.Type,
			MessageID:         typed.MessageID,
			ToolCallID:        typed.ToolCallID,
			ToolName:          typed.ToolName,
			ArgumentsDelta:    typed.ArgumentsDelta,
			PreviewKind:       typed.PreviewKind,
			TargetIDsByType:   cloneStringSliceMap(typed.TargetIDsByType),
			PreviewValueDelta: typed.PreviewValueDelta,
		}
	case realtime.ToolResultEvent:
		return realtime.ToolResultEvent{
			Type:   typed.Type,
			Result: cloneAnyMap(typed.Result),
		}
	case realtime.MessageStopEvent:
		return typed
	case realtime.MessageFinalizedEvent:
		return realtime.MessageFinalizedEvent{
			Type:    typed.Type,
			Message: cloneAnyMap(typed.Message),
		}
	default:
		return chunk
	}
}

func findMessageIndex(messages []map[string]any, targetID string) int {
	trimmedTargetID := strings.TrimSpace(targetID)
	if trimmedTargetID == "" {
		return -1
	}
	for index, message := range messages {
		messageID, err := messageID(message)
		if err != nil {
			continue
		}
		if messageID == trimmedTargetID {
			return index
		}
	}
	return -1
}

func normalizeContentIndex(index int, contentLen int) int {
	if index < 0 {
		return contentLen
	}
	return index
}

func ensureTextBlock(content []any, index int) ([]any, map[string]any) {
	for len(content) <= index {
		content = append(content, map[string]any{
			"type": "text",
			"text": "",
		})
	}
	block, _ := content[index].(map[string]any)
	block = cloneAnyMap(block)
	if block == nil || strings.TrimSpace(stringValue(block["type"])) != "text" {
		block = map[string]any{
			"type": "text",
			"text": "",
		}
	}
	content[index] = block
	return content, block
}

func ensureThinkingBlock(content []any, index int) ([]any, map[string]any) {
	for len(content) <= index {
		content = append(content, map[string]any{
			"type":     "thinking",
			"thinking": "",
		})
	}
	block, _ := content[index].(map[string]any)
	block = cloneAnyMap(block)
	if block == nil || strings.TrimSpace(stringValue(block["type"])) != "thinking" {
		block = map[string]any{
			"type":     "thinking",
			"thinking": "",
		}
	}
	content[index] = block
	return content, block
}

func cloneContentList(raw any) []any {
	typed, _ := raw.([]any)
	if typed == nil {
		return []any{}
	}
	cloned := make([]any, 0, len(typed))
	for _, entry := range typed {
		cloned = append(cloned, cloneAnyValue(entry))
	}
	return cloned
}

func cloneStringSliceMap(input map[string][]string) map[string][]string {
	if len(input) == 0 {
		return nil
	}
	cloned := make(map[string][]string, len(input))
	for key, values := range input {
		cloned[key] = append([]string(nil), values...)
	}
	return cloned
}

func stringValue(raw any) string {
	value, _ := raw.(string)
	return value
}

func optionalString(raw any) *string {
	value, ok := raw.(string)
	if !ok {
		return nil
	}
	return stringPtr(value)
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	return stringPtr(*value)
}

func extractInt(raw any) (int, bool) {
	switch typed := raw.(type) {
	case int:
		return typed, true
	case int32:
		return int(typed), true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	default:
		return 0, false
	}
}
