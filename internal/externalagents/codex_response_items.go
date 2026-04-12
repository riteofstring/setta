package externalagents

import (
	"encoding/json"
	"strings"
)

type codexToolResultMetadata struct {
	ToolCallID string
	ToolName   string
	IsError    bool
}

func applyCodexResponseItem(state *ChatState, payload map[string]any) (bool, *codexToolResultMetadata, error) {
	if state == nil {
		return false, nil, nil
	}
	responsePayload, ok := mapValue(payload["payload"])
	if !ok {
		return false, nil, nil
	}
	switch strings.TrimSpace(stringValue(responsePayload["type"])) {
	case "message":
		return applyCodexResponseMessage(state, responsePayload), nil, nil
	case "reasoning":
		return applyCodexResponseReasoning(state, responsePayload), nil, nil
	case "function_call":
		return applyCodexResponseFunctionCall(state, responsePayload), nil, nil
	case "function_call_output":
		metadata := applyCodexResponseFunctionCallOutput(state, responsePayload)
		if metadata == nil {
			return false, nil, nil
		}
		return true, metadata, nil
	default:
		return false, nil, nil
	}
}

func applyCodexResponseMessage(state *ChatState, payload map[string]any) bool {
	content := buildCodexAssistantContent(payload)
	if len(content) == 0 {
		return false
	}
	messageID := strings.TrimSpace(stringValue(payload["id"]))
	if messageID == "" {
		messageID = trailingCodexResponseMessageID(state)
	}
	if messageID == "" {
		messageID = "resp_" + newChatID()
	}
	replaceAssistantMessageContent(state, messageID, content)
	return true
}

func applyCodexResponseReasoning(state *ChatState, payload map[string]any) bool {
	content := buildCodexAssistantContent(payload)
	if len(content) == 0 {
		return false
	}
	messageID := strings.TrimSpace(stringValue(payload["id"]))
	if messageID == "" {
		messageID = "resp_" + newChatID()
	}
	replaceAssistantMessageContent(state, messageID, content)
	return true
}

func applyCodexResponseFunctionCall(state *ChatState, payload map[string]any) bool {
	toolCallID := strings.TrimSpace(stringValue(payload["call_id"]))
	if toolCallID == "" {
		return false
	}
	messageID := trailingCodexResponseMessageID(state)
	if messageID == "" {
		messageID = "resp_" + newChatID()
		upsertAssistantMessage(state, messageID, "")
	}
	toolName := strings.TrimSpace(stringValue(payload["name"]))
	arguments, rawArguments := decodeCodexToolArguments(payload["arguments"])
	if rawArguments != "" {
		setToolCallArgumentsRaw(state, toolCallID, rawArguments)
	}
	upsertAssistantToolCall(state, messageID, toolCallID, toolName, arguments)
	return true
}

func applyCodexResponseFunctionCallOutput(state *ChatState, payload map[string]any) *codexToolResultMetadata {
	toolCallID := strings.TrimSpace(stringValue(payload["call_id"]))
	if toolCallID == "" || codexToolResultAlreadyPresent(state, toolCallID) {
		return nil
	}
	toolName, arguments, ok := findAssistantToolCall(state, toolCallID)
	if !ok {
		return nil
	}
	result := normalizeCodexToolResultValue(payload["output"])
	isError := codexToolResultIsError(payload)
	appendToolResultMessage(
		state,
		toolCallID,
		toolName,
		arguments,
		result,
		formatToolResultContent(result),
		isError,
	)
	return &codexToolResultMetadata{
		ToolCallID: toolCallID,
		ToolName:   toolName,
		IsError:    isError,
	}
}

func buildCodexAssistantContent(payload map[string]any) []any {
	switch strings.TrimSpace(stringValue(payload["type"])) {
	case "reasoning":
		return buildCodexReasoningContent(payload)
	case "message":
		return buildCodexMessageContent(payload)
	default:
		return []any{}
	}
}

func buildCodexMessageContent(payload map[string]any) []any {
	rawContent, ok := payload["content"].([]any)
	if !ok {
		return buildCodexTextContent(strings.TrimSpace(stringValue(payload["text"])))
	}
	content := collectCodexMessageContent(rawContent)
	if len(content) != 0 {
		return content
	}
	return buildCodexTextContent(extractCodexResponseItemText(payload))
}

func collectCodexMessageContent(rawContent []any) []any {
	content := make([]any, 0, len(rawContent))
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		content = append(content, buildCodexMessageEntryContent(entry)...)
	}
	return content
}

func buildCodexMessageEntryContent(entry map[string]any) []any {
	switch strings.TrimSpace(stringValue(entry["type"])) {
	case "reasoning":
		return buildCodexReasoningContent(entry)
	case "", "text", "output_text":
		return buildCodexTextContent(stringValue(entry["text"]))
	default:
		return nil
	}
}

func buildCodexTextContent(raw string) []any {
	text := strings.TrimSpace(raw)
	if text == "" {
		return []any{}
	}
	return []any{map[string]any{"type": "text", "text": text}}
}

func buildCodexReasoningContent(payload map[string]any) []any {
	thinking := extractCodexTextParts(payload["content"])
	summary := extractCodexTextParts(payload["summary"])
	if thinking == "" && summary == "" {
		return []any{}
	}
	return []any{
		map[string]any{
			"type":     "thinking",
			"thinking": thinking,
			"summary":  summary,
		},
	}
}

func extractCodexTextParts(raw any) string {
	switch typed := raw.(type) {
	case []any:
		parts := make([]string, 0, len(typed))
		for _, rawEntry := range typed {
			entry, ok := rawEntry.(map[string]any)
			if !ok {
				continue
			}
			text := strings.TrimSpace(stringValue(entry["text"]))
			if text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n")
	case string:
		return strings.TrimSpace(typed)
	default:
		return ""
	}
}

func trailingCodexResponseMessageID(state *ChatState) string {
	if state == nil || len(state.Messages) == 0 {
		return ""
	}
	for index := len(state.Messages) - 1; index >= 0; index-- {
		message := state.Messages[index]
		role, err := messageRole(message)
		if err != nil || role != "assistant" {
			continue
		}
		if !messageContentEmpty(message) {
			continue
		}
		messageID, err := messageID(message)
		if err != nil {
			return ""
		}
		return messageID
	}
	return ""
}

func decodeCodexToolArguments(raw any) (map[string]any, string) {
	switch typed := raw.(type) {
	case map[string]any:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return cloneAnyMap(typed), ""
		}
		return cloneAnyMap(typed), string(encoded)
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return map[string]any{}, ""
		}
		if decoded, ok := decodeJSONObject(trimmed); ok {
			return decoded, trimmed
		}
		return map[string]any{}, trimmed
	default:
		return map[string]any{}, ""
	}
}

func findAssistantToolCall(state *ChatState, toolCallID string) (string, map[string]any, bool) {
	for _, message := range state.Messages {
		rawToolCalls, ok := message["tool_calls"].([]any)
		if !ok {
			continue
		}
		for _, rawToolCall := range rawToolCalls {
			toolCall, ok := rawToolCall.(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(stringValue(toolCall["id"])) != toolCallID {
				continue
			}
			function, _ := mapValue(toolCall["function"])
			if function == nil {
				return "", map[string]any{}, true
			}
			arguments, _ := mapValue(function["arguments"])
			if arguments == nil {
				arguments = map[string]any{}
			}
			return strings.TrimSpace(stringValue(function["name"])), cloneAnyMap(arguments), true
		}
	}
	return "", nil, false
}

func codexToolResultAlreadyPresent(state *ChatState, toolCallID string) bool {
	for _, message := range state.Messages {
		role, err := messageRole(message)
		if err != nil || role != "tool" {
			continue
		}
		if strings.TrimSpace(stringValue(message["tool_call_id"])) == toolCallID {
			return true
		}
	}
	return false
}

func normalizeCodexToolResultValue(raw any) any {
	switch typed := raw.(type) {
	case string:
		return normalizeCodexToolResultString(typed)
	case []any:
		if text, ok := unwrapCodexTextBlockPayload(typed); ok {
			return normalizeCodexToolResultString(text)
		}
		return deepCloneJSONValue(typed)
	case map[string]any:
		return deepCloneJSONValue(typed)
	default:
		return raw
	}
}

func normalizeCodexToolResultString(raw string) any {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	var parsed any
	if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil {
		if text, ok := unwrapCodexTextBlockPayload(parsed); ok {
			return normalizeCodexToolResultString(text)
		}
		return parsed
	}
	return trimmed
}

func unwrapCodexTextBlockPayload(raw any) (string, bool) {
	entries, ok := raw.([]any)
	if !ok || len(entries) == 0 {
		return "", false
	}
	parts := make([]string, 0, len(entries))
	for _, rawEntry := range entries {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			return "", false
		}
		entryType := strings.TrimSpace(stringValue(entry["type"]))
		if entryType != "" && entryType != "text" && entryType != "output_text" {
			return "", false
		}
		text := strings.TrimSpace(stringValue(entry["text"]))
		if text == "" {
			continue
		}
		parts = append(parts, text)
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, "\n"), true
}

func formatToolResultContent(result any) string {
	switch typed := result.(type) {
	case nil:
		return ""
	case string:
		return typed
	default:
		encoded, err := json.MarshalIndent(typed, "", "  ")
		if err != nil {
			return ""
		}
		return string(encoded)
	}
}

func codexToolResultIsError(payload map[string]any) bool {
	if boolValue(payload["is_error"]) || boolValue(payload["isError"]) {
		return true
	}
	status := strings.ToLower(strings.TrimSpace(stringValue(payload["status"])))
	return status == "error" || status == "failed"
}
