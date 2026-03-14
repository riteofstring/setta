package externalagents

import (
	"encoding/json"
	"strings"
)

type openCodeToolCallMetadata struct {
	ToolCallID string
	ToolName   string
}

type openCodeToolResultMetadata struct {
	ToolCallID string
	ToolName   string
	Result     any
	IsError    bool
}

func applyOpenCodeToolPart(state *ChatState, messageID string, part map[string]any) (openCodeToolCallMetadata, *openCodeToolResultMetadata) {
	toolCallID := strings.TrimSpace(stringValue(part["callID"]))
	if toolCallID == "" {
		return openCodeToolCallMetadata{}, nil
	}
	toolName := normalizeOpenCodeToolName(stringValue(part["tool"]))
	toolState, _ := mapValue(part["state"])
	if toolState == nil {
		toolState = map[string]any{}
	}
	setOpenCodeToolCallArguments(state, toolCallID, toolState)
	arguments := extractOpenCodeToolArgumentsDict(toolState)
	upsertAssistantToolCall(state, messageID, toolCallID, toolName, arguments)
	return openCodeToolCallMetadata{
		ToolCallID: toolCallID,
		ToolName:   toolName,
	}, buildOpenCodeToolResultFromState(state, toolCallID, toolName, arguments, toolState)
}

func applyOpenCodeGenericPayload(state *ChatState, payload map[string]any) (bool, []openCodeToolCallMetadata, []openCodeToolResultMetadata) {
	if len(payload) == 0 {
		return false, []openCodeToolCallMetadata{}, []openCodeToolResultMetadata{}
	}
	changed := false
	messageID := extractOpenCodeMessageID(payload)
	if text := extractOpenCodePayloadText(payload); text != "" && messageID != "" {
		appendAssistantDelta(state, messageID, text)
		changed = true
	}

	toolCalls := []openCodeToolCallMetadata{}
	for _, toolPayload := range extractOpenCodeToolCallPayloads(payload) {
		call := applyOpenCodeToolCallPayload(state, messageID, toolPayload)
		if call.ToolCallID == "" {
			continue
		}
		toolCalls = append(toolCalls, call)
		changed = true
	}

	toolResults := []openCodeToolResultMetadata{}
	if metadata := buildOpenCodeToolResultFromPayload(state, payload); metadata != nil {
		toolResults = append(toolResults, *metadata)
		changed = true
	}
	return changed, toolCalls, toolResults
}

func applyOpenCodeToolCallPayload(state *ChatState, messageID string, payload map[string]any) openCodeToolCallMetadata {
	toolCallID := extractOpenCodeToolCallID(payload, true)
	if toolCallID == "" {
		return openCodeToolCallMetadata{}
	}
	toolName := extractOpenCodeToolName(payload)
	setOpenCodeToolCallArguments(state, toolCallID, payload)
	if messageID != "" {
		upsertAssistantToolCall(state, messageID, toolCallID, toolName, extractOpenCodeToolArgumentsDict(payload))
	}
	return openCodeToolCallMetadata{
		ToolCallID: toolCallID,
		ToolName:   toolName,
	}
}

func buildOpenCodeToolResultFromState(state *ChatState, toolCallID string, toolName string, arguments map[string]any, toolState map[string]any) *openCodeToolResultMetadata {
	status := strings.ToLower(strings.TrimSpace(stringValue(toolState["status"])))
	if status != "completed" && status != "error" {
		return nil
	}
	if toolResultMessagePresent(state, toolCallID) {
		return nil
	}
	var (
		result  any
		isError bool
	)
	if status == "error" {
		result = deepCloneJSONValue(toolState["error"])
		isError = true
	} else {
		result = deepCloneJSONValue(toolState["output"])
	}
	if result == nil {
		return nil
	}
	appendToolResultMessage(
		state,
		toolCallID,
		toolName,
		arguments,
		result,
		formatToolResultContent(result),
		isError,
	)
	return &openCodeToolResultMetadata{
		ToolCallID: toolCallID,
		ToolName:   toolName,
		Result:     result,
		IsError:    isError,
	}
}

func buildOpenCodeToolResultFromPayload(state *ChatState, payload map[string]any) *openCodeToolResultMetadata {
	toolCallID := extractOpenCodeToolCallID(payload, false)
	if toolCallID == "" || toolResultMessagePresent(state, toolCallID) {
		return nil
	}
	result := extractOpenCodeToolResultValue(payload)
	if result == nil {
		return nil
	}
	toolName := extractOpenCodeToolName(payload)
	arguments := extractOpenCodeToolArgumentsDict(payload)
	if toolName == "" || len(arguments) == 0 {
		stateToolName, stateArguments := lookupToolCallContext(state, toolCallID)
		if toolName == "" {
			toolName = stateToolName
		}
		if len(arguments) == 0 {
			arguments = stateArguments
		}
	}
	isError := extractOpenCodeToolError(payload)
	clonedResult := deepCloneJSONValue(result)
	appendToolResultMessage(
		state,
		toolCallID,
		toolName,
		arguments,
		clonedResult,
		formatToolResultContent(clonedResult),
		isError,
	)
	return &openCodeToolResultMetadata{
		ToolCallID: toolCallID,
		ToolName:   toolName,
		Result:     clonedResult,
		IsError:    isError,
	}
}

func setOpenCodeToolCallArguments(state *ChatState, toolCallID string, payload map[string]any) {
	raw := extractOpenCodeToolArgumentsRaw(payload)
	if raw != "" {
		setToolCallArgumentsRaw(state, toolCallID, raw)
		return
	}
	arguments := extractOpenCodeToolArgumentsDict(payload)
	if len(arguments) > 0 {
		setToolCallArguments(state, toolCallID, arguments)
	}
}

func extractOpenCodeMessageID(payload map[string]any) string {
	for _, key := range []string{"messageId", "messageID", "id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if message, ok := mapValue(payload["message"]); ok {
		if value := strings.TrimSpace(stringValue(message["id"])); value != "" {
			return value
		}
	}
	if properties, ok := mapValue(payload["properties"]); ok {
		if info, ok := mapValue(properties["info"]); ok {
			if value := strings.TrimSpace(stringValue(info["id"])); value != "" {
				return value
			}
		}
		if part, ok := mapValue(properties["part"]); ok {
			if value := strings.TrimSpace(stringValue(part["messageID"])); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractOpenCodePayloadText(payload map[string]any) string {
	for _, key := range []string{"text", "message", "delta"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if message, ok := mapValue(payload["message"]); ok {
		for _, key := range []string{"text", "message", "delta"} {
			if value := strings.TrimSpace(stringValue(message[key])); value != "" {
				return value
			}
		}
		if content, ok := message["content"].([]any); ok {
			return extractOpenCodeTextFromParts(content)
		}
	}
	if content, ok := payload["content"].([]any); ok {
		return extractOpenCodeTextFromParts(content)
	}
	return ""
}

func extractOpenCodeTextFromParts(parts []any) string {
	if len(parts) == 0 {
		return ""
	}
	texts := make([]string, 0, len(parts))
	for _, rawPart := range parts {
		switch part := rawPart.(type) {
		case string:
			if text := strings.TrimSpace(part); text != "" {
				texts = append(texts, text)
			}
		case map[string]any:
			if text := strings.TrimSpace(stringValue(part["text"])); text != "" {
				texts = append(texts, text)
				continue
			}
			if delta := strings.TrimSpace(stringValue(part["delta"])); delta != "" {
				texts = append(texts, delta)
			}
		}
	}
	return strings.Join(texts, "")
}

func extractOpenCodeToolCallPayloads(payload map[string]any) []map[string]any {
	output := []map[string]any{}
	appendOpenCodePayloadEntries(&output, payload, []string{"tool_calls", "toolCalls", "tool_call", "toolCall"})
	for _, key := range []string{"message", "item", "data", "response", "properties"} {
		nested, ok := mapValue(payload[key])
		if !ok {
			continue
		}
		appendOpenCodePayloadEntries(&output, nested, []string{"tool_calls", "toolCalls", "tool_call", "toolCall"})
	}
	return output
}

func appendOpenCodePayloadEntries(destination *[]map[string]any, payload map[string]any, keys []string) {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case map[string]any:
			*destination = append(*destination, cloneAnyMap(typed))
		case []any:
			for _, rawEntry := range typed {
				entry, ok := rawEntry.(map[string]any)
				if !ok {
					continue
				}
				*destination = append(*destination, cloneAnyMap(entry))
			}
		}
	}
}

func extractOpenCodeToolCallID(payload map[string]any, allowPlainID bool) string {
	for _, key := range []string{"tool_call_id", "toolCallId", "call_id", "tool_use_id", "toolUseId"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if allowPlainID {
		if value := strings.TrimSpace(stringValue(payload["id"])); value != "" {
			return value
		}
	}
	if function, ok := mapValue(payload["function"]); ok {
		for _, key := range []string{"call_id", "id"} {
			if value := strings.TrimSpace(stringValue(function[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractOpenCodeToolName(payload map[string]any) string {
	for _, key := range []string{"tool_name", "toolName", "name"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return normalizeOpenCodeToolName(value)
		}
	}
	if function, ok := mapValue(payload["function"]); ok {
		if value := strings.TrimSpace(stringValue(function["name"])); value != "" {
			return normalizeOpenCodeToolName(value)
		}
	}
	return ""
}

func extractOpenCodeToolArgumentsValue(payload map[string]any) any {
	for _, key := range []string{"arguments", "args", "input", "raw", "arguments_delta", "partial_json", "delta"} {
		if value, ok := payload[key]; ok && value != nil {
			return value
		}
	}
	if function, ok := mapValue(payload["function"]); ok {
		if value, ok := function["arguments"]; ok && value != nil {
			return value
		}
	}
	return nil
}

func extractOpenCodeToolArgumentsRaw(payload map[string]any) string {
	value := extractOpenCodeToolArgumentsValue(payload)
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any, []any:
		encoded, err := json.Marshal(typed)
		if err == nil {
			return string(encoded)
		}
	}
	return ""
}

func extractOpenCodeToolArgumentsDict(payload map[string]any) map[string]any {
	value := extractOpenCodeToolArgumentsValue(payload)
	switch typed := value.(type) {
	case map[string]any:
		return cloneAnyMap(typed)
	case string:
		parsed := map[string]any{}
		if err := json.Unmarshal([]byte(typed), &parsed); err == nil {
			return parsed
		}
	}
	return map[string]any{}
}

func extractOpenCodeToolResultValue(payload map[string]any) any {
	for _, key := range []string{"result", "output", "tool_result", "toolResult", "content"} {
		if value, ok := payload[key]; ok && value != nil {
			return value
		}
	}
	return nil
}

func extractOpenCodeToolError(payload map[string]any) bool {
	for _, key := range []string{"is_error", "isError"} {
		if value, ok := payload[key].(bool); ok {
			return value
		}
	}
	if value, ok := payload["error"].(bool); ok {
		return value
	}
	return false
}
