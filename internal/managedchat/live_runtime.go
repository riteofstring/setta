package managedchat

import (
	"context"
	"errors"
	"fmt"
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
	active map[string]*ChatState
}

func NewLiveRuntime(options LiveRuntimeOptions) *LiveRuntime {
	return &LiveRuntime{
		broadcaster: options.Broadcaster,
		active:      map[string]*ChatState{},
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
	r.active[runID] = state.Clone()
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
	if !ok || state == nil {
		return nil, nil
	}
	return state.Clone(), nil
}

func (r *LiveRuntime) ApplyChunk(ctx context.Context, params StreamChunkParams) error {
	if r == nil {
		return nil
	}
	runID := strings.TrimSpace(params.RunID)
	if runID == "" {
		return fmt.Errorf("%w: run id is required", ErrLiveRunNotActive)
	}
	chatID := strings.TrimSpace(params.ChatID)
	if chatID == "" {
		return fmt.Errorf("managed live chat chunk requires chat id")
	}

	r.mu.Lock()
	current, ok := r.active[runID]
	if !ok || current == nil {
		r.mu.Unlock()
		return ErrLiveRunNotActive
	}
	nextState, err := applyStreamChunk(*current, params.Chunk)
	if err != nil {
		r.mu.Unlock()
		return err
	}
	r.active[runID] = nextState.Clone()
	r.mu.Unlock()

	if r.broadcaster == nil {
		return nil
	}
	_, err = r.broadcaster.BroadcastJSON(ctx, realtime.NewLLMStreamingResponseMessage(realtime.LLMStreamingResponseContent{
		ChatID:          chatID,
		Chunk:           cloneStreamChunk(params.Chunk),
		SectionID:       cloneStringPointer(params.SectionID),
		ProjectConfigID: cloneStringPointer(params.ProjectConfigID),
	}), realtime.Selection{Type: realtime.ConnectionTypeFrontend})
	return err
}

func applyStreamChunk(state ChatState, chunk any) (*ChatState, error) {
	next := state.Clone()
	if next == nil {
		next = &ChatState{Messages: []map[string]any{}}
	}

	switch typed := chunk.(type) {
	case realtime.MessageStartEvent:
		message, err := normalizeMessage(typed.Message)
		if err != nil {
			return nil, err
		}
		next.Messages = upsertChatMessage(next.Messages, message)
		next.WaitingForResponse = true
		return next, nil
	case *realtime.MessageStartEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	case realtime.MessageDeltaEvent:
		next.Messages = applyMessageDelta(next.Messages, typed)
		return next, nil
	case *realtime.MessageDeltaEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	case realtime.ToolCallDeltaEvent:
		next.Messages = applyToolCallDelta(next.Messages, typed.MessageID, typed.ToolCallID, typed.ToolName)
		return next, nil
	case *realtime.ToolCallDeltaEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	case realtime.ToolArgumentPreviewDeltaEvent:
		toolName := stringPtr(strings.TrimSpace(typed.ToolName))
		next.Messages = applyToolCallDelta(next.Messages, typed.MessageID, typed.ToolCallID, toolName)
		return next, nil
	case *realtime.ToolArgumentPreviewDeltaEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	case realtime.ToolResultEvent:
		message, err := normalizeMessage(typed.Result)
		if err != nil {
			return nil, err
		}
		next.Messages = upsertChatMessage(next.Messages, message)
		return next, nil
	case *realtime.ToolResultEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	case realtime.MessageStopEvent:
		next.WaitingForResponse = false
		return next, nil
	case *realtime.MessageStopEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	case realtime.MessageFinalizedEvent:
		message, err := normalizeMessage(typed.Message)
		if err != nil {
			return nil, err
		}
		next.Messages = upsertChatMessage(next.Messages, message)
		next.WaitingForResponse = false
		return next, nil
	case *realtime.MessageFinalizedEvent:
		if typed == nil {
			return next, nil
		}
		return applyStreamChunk(*next, *typed)
	default:
		return next, nil
	}
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
		nextToolCall["function"] = function
		toolCalls[entryIndex] = nextToolCall
		message["tool_calls"] = toolCalls
		updated[index] = message
		return updated
	}
	toolCalls = append(toolCalls, map[string]any{
		"id": trimmedToolCallID,
		"function": map[string]any{
			"name":      name,
			"arguments": map[string]any{},
		},
	})
	message["tool_calls"] = toolCalls
	updated[index] = message
	return updated
}

func cloneStreamChunk(chunk any) any {
	switch typed := chunk.(type) {
	case realtime.MessageStartEvent:
		return realtime.MessageStartEvent{
			Type:    typed.Type,
			Message: cloneAnyMap(typed.Message),
		}
	case *realtime.MessageStartEvent:
		if typed == nil {
			return nil
		}
		return cloneStreamChunk(*typed)
	case realtime.MessageDeltaEvent:
		return realtime.MessageDeltaEvent{
			Type:      typed.Type,
			MessageID: typed.MessageID,
			Content:   cloneContentList(typed.Content),
		}
	case *realtime.MessageDeltaEvent:
		if typed == nil {
			return nil
		}
		return cloneStreamChunk(*typed)
	case realtime.ToolCallDeltaEvent:
		return typed
	case *realtime.ToolCallDeltaEvent:
		if typed == nil {
			return nil
		}
		return *typed
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
	case *realtime.ToolArgumentPreviewDeltaEvent:
		if typed == nil {
			return nil
		}
		return cloneStreamChunk(*typed)
	case realtime.ToolResultEvent:
		return realtime.ToolResultEvent{
			Type:   typed.Type,
			Result: cloneAnyMap(typed.Result),
		}
	case *realtime.ToolResultEvent:
		if typed == nil {
			return nil
		}
		return cloneStreamChunk(*typed)
	case realtime.MessageStopEvent:
		return typed
	case *realtime.MessageStopEvent:
		if typed == nil {
			return nil
		}
		return *typed
	case realtime.MessageFinalizedEvent:
		return realtime.MessageFinalizedEvent{
			Type:    typed.Type,
			Message: cloneAnyMap(typed.Message),
		}
	case *realtime.MessageFinalizedEvent:
		if typed == nil {
			return nil
		}
		return cloneStreamChunk(*typed)
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
