package externalagents

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func isCodexApprovalRequest(payload map[string]any) bool {
	method := strings.TrimSpace(stringValue(payload["method"]))
	return strings.HasSuffix(method, "/requestApproval")
}

func buildCodexApprovalState(request StartRequest, payload map[string]any) (ApprovalState, map[string]any, error) {
	approvalID := strings.TrimSpace(codexApprovalID(payload["id"]))
	if approvalID == "" {
		return ApprovalState{}, nil, fmt.Errorf("codex approval request missing id")
	}
	item, _ := approvalItem(payload)
	toolName := strings.TrimSpace(stringValue(item["type"]))
	arguments := map[string]any{
		"approvalId": approvalID,
		"toolName":   toolName,
		"tool":       toolName,
	}
	inputPayload := map[string]any{}
	for key, value := range item {
		switch key {
		case "id", "type", "status":
			continue
		default:
			inputPayload[key] = deepCloneJSONValue(value)
		}
	}
	arguments["input"] = inputPayload
	if command := strings.TrimSpace(stringValue(item["command"])); command != "" {
		arguments["command"] = command
	}
	if diff := strings.TrimSpace(stringValue(item["diff"])); diff != "" {
		arguments["diff"] = diff
	}
	return ApprovalState{
		ApprovalID:      approvalID,
		RunID:           request.Run.ID,
		ProjectConfigID: request.ProjectConfigID,
		ChatID:          request.ChatID,
		SectionID:       cloneOptionalString(request.SectionID),
	}, arguments, nil
}

func approvalItem(payload map[string]any) (map[string]any, bool) {
	params, ok := mapValue(payload["params"])
	if !ok {
		return nil, false
	}
	item, ok := mapValue(params["item"])
	return item, ok
}

func codexApprovalID(raw any) string {
	switch value := raw.(type) {
	case string:
		return value
	case float64:
		if value == float64(int64(value)) {
			return strconv.FormatInt(int64(value), 10)
		}
	case int:
		return strconv.Itoa(value)
	case int64:
		return strconv.FormatInt(value, 10)
	}
	return ""
}

func extractCodexResponseItemText(payload map[string]any) string {
	rawContent, ok := payload["content"].([]any)
	if !ok {
		return ""
	}
	lines := []string{}
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		entryType := strings.TrimSpace(stringValue(entry["type"]))
		switch entryType {
		case "", "text", "output_text":
			if text := strings.TrimSpace(stringValue(entry["text"])); text != "" {
				lines = append(lines, text)
			}
		}
	}
	return strings.Join(lines, "\n")
}

func extractCodexMessageText(item map[string]any) string {
	if text := strings.TrimSpace(stringValue(item["text"])); text != "" {
		return text
	}
	rawContent, ok := item["content"].([]any)
	if !ok {
		return ""
	}
	lines := []string{}
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		if text := strings.TrimSpace(stringValue(entry["text"])); text != "" {
			lines = append(lines, text)
		}
	}
	return strings.Join(lines, "\n")
}

func appendAssistantDelta(state *ChatState, messageID string, delta string) {
	index := findMessageIndex(state.Messages, messageID)
	if index == -1 {
		state.Messages = append(state.Messages, map[string]any{
			"id":      messageID,
			"role":    "assistant",
			"content": []any{map[string]any{"type": "text", "text": delta}},
		})
		return
	}
	message := cloneMessageOrPanic(state.Messages[index])
	content, _ := message["content"].([]any)
	if len(content) == 0 {
		message["content"] = []any{map[string]any{"type": "text", "text": delta}}
		state.Messages[index] = message
		return
	}
	lastEntry, ok := content[len(content)-1].(map[string]any)
	if !ok {
		content = append(content, map[string]any{"type": "text", "text": delta})
		message["content"] = content
		state.Messages[index] = message
		return
	}
	if strings.TrimSpace(stringValue(lastEntry["type"])) != "text" {
		content = append(content, map[string]any{"type": "text", "text": delta})
		message["content"] = content
		state.Messages[index] = message
		return
	}
	lastEntry = cloneAnyMap(lastEntry)
	lastEntry["text"] = stringValue(lastEntry["text"]) + delta
	content[len(content)-1] = lastEntry
	message["content"] = content
	state.Messages[index] = message
}

func upsertAssistantMessage(state *ChatState, messageID string, text string) {
	message := map[string]any{
		"id":      messageID,
		"role":    "assistant",
		"content": []any{},
	}
	if text != "" {
		message["content"] = []any{map[string]any{"type": "text", "text": text}}
	}
	index := findMessageIndex(state.Messages, messageID)
	if index == -1 {
		state.Messages = append(state.Messages, message)
		return
	}
	existing := cloneMessageOrPanic(state.Messages[index])
	if rawToolCalls, ok := existing["tool_calls"]; ok {
		message["tool_calls"] = deepCloneJSONValue(rawToolCalls)
	}
	state.Messages[index] = message
}

func appendApprovalRequestMessage(state *ChatState, approvalID string, arguments map[string]any) {
	if state.ToolCallArguments == nil {
		state.ToolCallArguments = map[string]string{}
	}
	if encoded, err := json.Marshal(arguments); err == nil {
		state.ToolCallArguments[approvalID] = string(encoded)
	}
	upsertApprovalMessage(state, approvalID, arguments)
}

func appendApprovalResultMessage(state *ChatState, approvalID string, approved bool) {
	if state.ToolCallArguments != nil {
		delete(state.ToolCallArguments, approvalID)
	}
	state.Messages = append(state.Messages, map[string]any{
		"id":           "tool-result-" + approvalID,
		"role":         "tool",
		"tool_call_id": approvalID,
		"tool_name":    ApprovalToolName,
		"arguments":    map[string]any{},
		"result": map[string]any{
			"approved": approved,
		},
		"content": []any{
			map[string]any{
				"type": "text",
				"text": approvalDecisionText(approved),
			},
		},
		"is_error": !approved,
	})
}

func upsertApprovalMessage(state *ChatState, approvalID string, arguments map[string]any) {
	message := map[string]any{
		"id":      approvalID,
		"role":    "assistant",
		"content": []any{},
		"tool_calls": []any{
			map[string]any{
				"id": approvalID,
				"function": map[string]any{
					"name":      ApprovalToolName,
					"arguments": cloneAnyMap(arguments),
				},
			},
		},
	}
	index := findMessageIndex(state.Messages, approvalID)
	if index == -1 {
		state.Messages = append(state.Messages, message)
		return
	}
	state.Messages[index] = message
}

func approvalDecisionText(approved bool) string {
	if approved {
		return "Approved"
	}
	return "Denied"
}

func extractThreadID(payload map[string]any) string {
	if payload == nil {
		return ""
	}
	for _, key := range []string{"threadId", "thread_id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if thread, ok := mapValue(payload["thread"]); ok {
		for _, key := range []string{"id", "threadId"} {
			if value := strings.TrimSpace(stringValue(thread[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func responsePayloadID(payload map[string]any) (int, bool) {
	if _, hasMethod := payload["method"]; hasMethod {
		return 0, false
	}
	rawID, ok := payload["id"]
	if !ok {
		return 0, false
	}
	switch value := rawID.(type) {
	case float64:
		return int(value), true
	case int:
		return value, true
	case int64:
		return int(value), true
	default:
		return 0, false
	}
}

func findMessageIndex(messages []map[string]any, targetID string) int {
	for index, message := range messages {
		messageID, err := messageID(message)
		if err == nil && messageID == targetID {
			return index
		}
	}
	return -1
}
