package externalagents

import (
	"encoding/json"
	"sort"
	"strings"
)

const askUserQuestionToolName = "AskUserQuestion"

func appendAssistantThinkingUpdate(
	state *ChatState,
	messageID string,
	thinking string,
	summary *string,
	signature *string,
) {
	entry := newAssistantThinkingEntry(thinking, summary, signature)
	index := findMessageIndex(state.Messages, messageID)
	if index == -1 {
		state.Messages = append(state.Messages, newAssistantThinkingMessage(messageID, entry))
		return
	}
	message := cloneMessageOrPanic(state.Messages[index])
	message["content"] = appendAssistantThinkingContent(message["content"], entry, thinking)
	state.Messages[index] = message
}

func newAssistantThinkingMessage(messageID string, entry map[string]any) map[string]any {
	return map[string]any{
		"id":      messageID,
		"role":    "assistant",
		"content": []any{entry},
	}
}

func newAssistantThinkingEntry(thinking string, summary *string, signature *string) map[string]any {
	entry := map[string]any{
		"type":     "thinking",
		"thinking": thinking,
	}
	if summary != nil {
		entry["summary"] = *summary
	}
	if signature != nil {
		entry["signature"] = *signature
	}
	return entry
}

func appendAssistantThinkingContent(rawContent any, entry map[string]any, thinking string) []any {
	content, _ := rawContent.([]any)
	if len(content) == 0 {
		return []any{entry}
	}
	lastEntry, ok := content[len(content)-1].(map[string]any)
	if !ok || !isThinkingContentEntry(lastEntry) {
		return append(append([]any(nil), content...), entry)
	}
	nextContent := append([]any(nil), content...)
	nextContent[len(nextContent)-1] = mergeAssistantThinkingEntry(lastEntry, entry, thinking)
	return nextContent
}

func isThinkingContentEntry(entry map[string]any) bool {
	return strings.TrimSpace(stringValue(entry["type"])) == "thinking"
}

func mergeAssistantThinkingEntry(current map[string]any, update map[string]any, thinking string) map[string]any {
	nextEntry := cloneAnyMap(current)
	if thinking != "" {
		nextEntry["thinking"] = stringValue(nextEntry["thinking"]) + thinking
	}
	if summary, ok := update["summary"]; ok {
		nextEntry["summary"] = summary
	}
	if signature, ok := update["signature"]; ok {
		nextEntry["signature"] = signature
	}
	return nextEntry
}

func upsertAssistantToolCall(state *ChatState, messageID string, toolCallID string, toolName string, arguments map[string]any) {
	index := findMessageIndex(state.Messages, messageID)
	message := map[string]any{
		"id":      messageID,
		"role":    "assistant",
		"content": []any{},
	}
	if index != -1 {
		message = cloneMessageOrPanic(state.Messages[index])
	}
	toolCalls, _ := message["tool_calls"].([]any)
	updated := false
	for i, rawToolCall := range toolCalls {
		toolCall, ok := rawToolCall.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(toolCall["id"])) != toolCallID {
			continue
		}
		nextToolCall := cloneAnyMap(toolCall)
		function, _ := mapValue(nextToolCall["function"])
		if function == nil {
			function = map[string]any{}
		}
		if strings.TrimSpace(toolName) != "" {
			function["name"] = toolName
		}
		function["arguments"] = cloneAnyMap(arguments)
		nextToolCall["function"] = function
		toolCalls[i] = nextToolCall
		updated = true
		break
	}
	if !updated {
		toolCalls = append(toolCalls, map[string]any{
			"id": toolCallID,
			"function": map[string]any{
				"name":      toolName,
				"arguments": cloneAnyMap(arguments),
			},
		})
	}
	message["tool_calls"] = toolCalls
	if index == -1 {
		state.Messages = append(state.Messages, message)
		return
	}
	state.Messages[index] = message
}

func setToolCallArguments(state *ChatState, toolCallID string, arguments map[string]any) {
	encoded, err := json.Marshal(arguments)
	if err != nil {
		return
	}
	setToolCallArgumentsRaw(state, toolCallID, string(encoded))
}

func setToolCallArgumentsRaw(state *ChatState, toolCallID string, encoded string) {
	if state.ToolCallArguments == nil {
		state.ToolCallArguments = map[string]string{}
	}
	state.ToolCallArguments[toolCallID] = encoded
}

func replaceAssistantMessageContent(state *ChatState, messageID string, content []any) {
	message := map[string]any{
		"id":      messageID,
		"role":    "assistant",
		"content": []any{},
	}
	index := findMessageIndex(state.Messages, messageID)
	if index != -1 {
		message = cloneMessageOrPanic(state.Messages[index])
	}
	message["content"] = deepCloneJSONValue(content)
	if index == -1 {
		state.Messages = append(state.Messages, message)
		return
	}
	state.Messages[index] = message
}

func appendToolResultMessage(
	state *ChatState,
	toolCallID string,
	toolName string,
	arguments map[string]any,
	result any,
	content string,
	isError bool,
) {
	if state.ToolCallArguments != nil {
		delete(state.ToolCallArguments, toolCallID)
	}
	message := map[string]any{
		"id":           "tool-result-" + toolCallID,
		"role":         "tool",
		"tool_call_id": toolCallID,
		"tool_name":    toolName,
		"arguments":    cloneAnyMap(arguments),
		"result":       deepCloneJSONValue(result),
		"is_error":     isError,
		"content":      []any{},
	}
	if strings.TrimSpace(content) != "" {
		message["content"] = []any{
			map[string]any{
				"type": "text",
				"text": content,
			},
		}
	}
	state.Messages = append(state.Messages, message)
}

func toolResultMessagePresent(state *ChatState, toolCallID string) bool {
	if state == nil || strings.TrimSpace(toolCallID) == "" {
		return false
	}
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

func lookupToolCallContext(state *ChatState, toolCallID string) (string, map[string]any) {
	if state == nil {
		return "", map[string]any{}
	}
	trimmedToolCallID := strings.TrimSpace(toolCallID)
	if trimmedToolCallID == "" {
		return "", map[string]any{}
	}
	if name, arguments, ok := lookupToolCallContextFromMessages(state.Messages, trimmedToolCallID); ok {
		return name, arguments
	}
	return lookupToolCallContextFromEncodedArguments(state.ToolCallArguments, trimmedToolCallID)
}

func lookupToolCallContextFromMessages(messages []map[string]any, toolCallID string) (string, map[string]any, bool) {
	for _, message := range messages {
		if name, arguments, ok := lookupToolCallContextFromMessage(message, toolCallID); ok {
			return name, arguments, true
		}
	}
	return "", nil, false
}

func lookupToolCallContextFromMessage(message map[string]any, toolCallID string) (string, map[string]any, bool) {
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok {
		return "", nil, false
	}
	for _, rawToolCall := range rawToolCalls {
		if name, arguments, ok := lookupToolCallContextFromToolCall(rawToolCall, toolCallID); ok {
			return name, arguments, true
		}
	}
	return "", nil, false
}

func lookupToolCallContextFromToolCall(rawToolCall any, toolCallID string) (string, map[string]any, bool) {
	toolCall, ok := rawToolCall.(map[string]any)
	if !ok {
		return "", nil, false
	}
	if strings.TrimSpace(stringValue(toolCall["id"])) != toolCallID {
		return "", nil, false
	}
	function, _ := mapValue(toolCall["function"])
	if function == nil {
		return "", map[string]any{}, true
	}
	name := strings.TrimSpace(stringValue(function["name"]))
	arguments, _ := mapValue(function["arguments"])
	if arguments == nil {
		arguments = map[string]any{}
	}
	return name, cloneAnyMap(arguments), true
}

func lookupToolCallContextFromEncodedArguments(encodedByToolCallID map[string]string, toolCallID string) (string, map[string]any) {
	if encodedByToolCallID == nil {
		return "", map[string]any{}
	}
	encoded := strings.TrimSpace(encodedByToolCallID[toolCallID])
	if encoded == "" {
		return "", map[string]any{}
	}
	parsed := map[string]any{}
	if err := json.Unmarshal([]byte(encoded), &parsed); err != nil {
		return "", map[string]any{}
	}
	return "", parsed
}

func appendQuestionResultMessage(state *ChatState, toolCallID string, answers map[string]string) {
	if state.ToolCallArguments != nil {
		delete(state.ToolCallArguments, toolCallID)
	}
	state.Messages = append(state.Messages, map[string]any{
		"id":           "tool-result-" + toolCallID,
		"role":         "tool",
		"tool_call_id": toolCallID,
		"tool_name":    askUserQuestionToolName,
		"arguments":    map[string]any{},
		"result": map[string]any{
			"answers": stringMapToAnyMap(answers),
		},
		"content": []any{
			map[string]any{
				"type": "text",
				"text": formatQuestionAnswers(answers),
			},
		},
		"is_error": false,
	})
}

func formatQuestionAnswers(answers map[string]string) string {
	if len(answers) == 0 {
		return ""
	}
	keys := make([]string, 0, len(answers))
	for key := range answers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		lines = append(lines, trimmedKey+": "+strings.TrimSpace(answers[key]))
	}
	return strings.Join(lines, "\n")
}
