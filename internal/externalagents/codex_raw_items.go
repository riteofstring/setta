package externalagents

import (
	"encoding/json"
	"reflect"
	"strings"
)

const (
	codexCommandExecutionItemType = "commandExecution"
	codexFileChangeItemType       = "fileChange"
	codexMCPToolCallItemType      = "mcpToolCall"
	codexCommandExecutionToolName = "command_execution"
	codexFileChangeToolName       = "file_change"
)

var codexGenericToolItemTypes = map[string]struct{}{
	"collabToolCall":    {},
	"webSearch":         {},
	"imageView":         {},
	"enteredReviewMode": {},
	"exitedReviewMode":  {},
	"compacted":         {},
}

type codexEventState struct {
	lastAssistantMessageID   string
	assistantMessageOpen     bool
	syntheticAssistantID     string
	commandOutputByItemID    map[string][]string
	fileChangeOutputByItemID map[string][]string
	latestUsagePayload       map[string]any
}

func newCodexEventState() *codexEventState {
	return &codexEventState{
		commandOutputByItemID:    map[string][]string{},
		fileChangeOutputByItemID: map[string][]string{},
	}
}

func (s *codexEventState) resetTurn() {
	if s == nil {
		return
	}
	s.lastAssistantMessageID = ""
	s.assistantMessageOpen = false
	s.syntheticAssistantID = ""
	s.commandOutputByItemID = map[string][]string{}
	s.fileChangeOutputByItemID = map[string][]string{}
}

func (s *codexEventState) setUsagePayload(payload map[string]any) bool {
	if s == nil || payload == nil {
		return false
	}
	cloned, ok := deepCloneJSONValue(payload).(map[string]any)
	if !ok || cloned == nil {
		return false
	}
	if reflect.DeepEqual(s.latestUsagePayload, cloned) {
		return false
	}
	s.latestUsagePayload = cloned
	return true
}

func (s *codexEventState) usagePayload() map[string]any {
	if s == nil || s.latestUsagePayload == nil {
		return nil
	}
	cloned, _ := deepCloneJSONValue(s.latestUsagePayload).(map[string]any)
	return cloned
}

func (s *codexEventState) resolveToolMessageID(state *ChatState) string {
	if s != nil && s.assistantMessageOpen && strings.TrimSpace(s.lastAssistantMessageID) != "" {
		return s.lastAssistantMessageID
	}
	return trailingCodexResponseMessageID(state)
}

func (s *codexEventState) ensureToolMessageID(state *ChatState) string {
	messageID := s.resolveToolMessageID(state)
	if messageID != "" {
		return messageID
	}
	messageID = "codex_" + newChatID()
	upsertAssistantMessage(state, messageID, "")
	if s != nil {
		s.lastAssistantMessageID = messageID
		s.assistantMessageOpen = true
		s.syntheticAssistantID = messageID
	}
	return messageID
}

func (s *codexEventState) adoptSyntheticAssistantMessage(state *ChatState, messageID string) string {
	trimmedMessageID := strings.TrimSpace(messageID)
	if s == nil || trimmedMessageID == "" {
		return trimmedMessageID
	}
	syntheticID := strings.TrimSpace(s.syntheticAssistantID)
	if syntheticID == "" || syntheticID == trimmedMessageID {
		s.syntheticAssistantID = ""
		return trimmedMessageID
	}
	syntheticIndex := findMessageIndex(state.Messages, syntheticID)
	if syntheticIndex == -1 {
		s.syntheticAssistantID = ""
		return trimmedMessageID
	}
	actualIndex := findMessageIndex(state.Messages, trimmedMessageID)
	if actualIndex == -1 {
		message := cloneMessageOrPanic(state.Messages[syntheticIndex])
		message["id"] = trimmedMessageID
		state.Messages[syntheticIndex] = message
		s.syntheticAssistantID = ""
		return trimmedMessageID
	}
	syntheticMessage := cloneMessageOrPanic(state.Messages[syntheticIndex])
	rawToolCalls, _ := syntheticMessage["tool_calls"].([]any)
	for _, rawToolCall := range rawToolCalls {
		toolCall, ok := rawToolCall.(map[string]any)
		if !ok {
			continue
		}
		toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
		function, _ := mapValue(toolCall["function"])
		toolName := ""
		arguments := map[string]any{}
		if function != nil {
			toolName = strings.TrimSpace(stringValue(function["name"]))
			if parsedArguments, ok := mapValue(function["arguments"]); ok && parsedArguments != nil {
				arguments = cloneAnyMap(parsedArguments)
			}
		}
		if toolCallID == "" {
			continue
		}
		upsertAssistantToolCall(state, trimmedMessageID, toolCallID, toolName, arguments)
	}
	state.Messages = append(state.Messages[:syntheticIndex], state.Messages[syntheticIndex+1:]...)
	s.syntheticAssistantID = ""
	return trimmedMessageID
}

func applyCodexStreamEvent(state *ChatState, eventState *codexEventState, payload map[string]any) (bool, *codexToolResultMetadata, error) {
	if state == nil {
		return false, nil, nil
	}
	method := strings.TrimSpace(stringValue(payload["method"]))
	switch method {
	case "turn/started":
		if eventState != nil {
			eventState.resetTurn()
		}
		return false, nil, nil
	case "item/started":
		item, ok := codexEventItem(payload)
		if !ok {
			return false, nil, nil
		}
		itemType := strings.TrimSpace(stringValue(item["type"]))
		if isCodexAssistantMessageType(itemType) {
			messageID := codexEventItemID(payload, item)
			if messageID == "" {
				return false, nil, nil
			}
			if eventState != nil {
				messageID = eventState.adoptSyntheticAssistantMessage(state, messageID)
				eventState.lastAssistantMessageID = messageID
				eventState.assistantMessageOpen = true
			}
			return false, nil, nil
		}
		if isCodexRawToolItemType(itemType) {
			changed, toolResult := applyCodexRawToolItem(state, eventState, payload, item, method)
			return changed, toolResult, nil
		}
		return false, nil, nil
	case "item/assistantMessage/delta", "item/agentMessage/delta", "item/message/delta":
		params, ok := mapValue(payload["params"])
		if !ok {
			return false, nil, nil
		}
		messageID := strings.TrimSpace(stringValue(params["itemId"]))
		delta, ok := mapValue(params["delta"])
		if !ok {
			return false, nil, nil
		}
		text := stringValue(delta["text"])
		if messageID == "" || text == "" {
			return false, nil, nil
		}
		if eventState != nil {
			messageID = eventState.adoptSyntheticAssistantMessage(state, messageID)
			eventState.lastAssistantMessageID = messageID
			eventState.assistantMessageOpen = true
		}
		appendAssistantDelta(state, messageID, text)
		return true, nil, nil
	case "item/completed":
		item, ok := codexEventItem(payload)
		if !ok {
			return false, nil, nil
		}
		itemType := strings.TrimSpace(stringValue(item["type"]))
		if isCodexAssistantMessageType(itemType) {
			messageID := codexEventItemID(payload, item)
			text := extractCodexMessageText(item)
			if messageID == "" {
				return false, nil, nil
			}
			if eventState != nil {
				messageID = eventState.adoptSyntheticAssistantMessage(state, messageID)
				eventState.lastAssistantMessageID = messageID
				eventState.assistantMessageOpen = false
				if eventState.syntheticAssistantID == messageID {
					eventState.syntheticAssistantID = ""
				}
			}
			upsertAssistantMessage(state, messageID, text)
			return true, nil, nil
		}
		if isCodexRawToolItemType(itemType) {
			changed, toolResult := applyCodexRawToolItem(state, eventState, payload, item, method)
			return changed, toolResult, nil
		}
		return false, nil, nil
	case "item.commandExecution.outputDelta":
		itemID := codexEventItemID(payload, nil)
		deltaText := extractCodexOutputDeltaText(payload)
		if eventState == nil || itemID == "" || deltaText == "" {
			return false, nil, nil
		}
		eventState.commandOutputByItemID[itemID] = append(eventState.commandOutputByItemID[itemID], deltaText)
		return false, nil, nil
	case "item.fileChange.outputDelta":
		itemID := codexEventItemID(payload, nil)
		deltaText := extractCodexOutputDeltaText(payload)
		if eventState == nil || itemID == "" || deltaText == "" {
			return false, nil, nil
		}
		eventState.fileChangeOutputByItemID[itemID] = append(eventState.fileChangeOutputByItemID[itemID], deltaText)
		return false, nil, nil
	default:
		return false, nil, nil
	}
}

func applyCodexRawToolItem(state *ChatState, eventState *codexEventState, payload map[string]any, item map[string]any, method string) (bool, *codexToolResultMetadata) {
	itemType := strings.TrimSpace(stringValue(item["type"]))
	itemID := codexEventItemID(payload, item)
	if state == nil || itemID == "" || !isCodexRawToolItemType(itemType) {
		return false, nil
	}
	changed := false
	if !codexToolCallPresent(state, itemID) {
		messageID := ""
		if eventState != nil {
			messageID = eventState.ensureToolMessageID(state)
		}
		if messageID == "" {
			messageID = "codex_" + newChatID()
			upsertAssistantMessage(state, messageID, "")
		}
		toolName, arguments, rawArguments, ok := buildCodexRawToolCall(itemType, item)
		if ok {
			if rawArguments != "" {
				setToolCallArgumentsRaw(state, itemID, rawArguments)
			}
			upsertAssistantToolCall(state, messageID, itemID, toolName, arguments)
			changed = true
		}
	}
	if !codexRawToolItemTerminal(method, itemType, item) || toolResultMessagePresent(state, itemID) {
		return changed, nil
	}
	resolved := cloneAnyMap(item)
	if itemType == codexCommandExecutionItemType {
		if resolved["aggregatedOutput"] == nil && resolved["aggregated_output"] == nil && eventState != nil {
			if buffered := eventState.commandOutputByItemID[itemID]; len(buffered) > 0 {
				resolved["aggregatedOutput"] = strings.Join(buffered, "")
			}
		}
		if eventState != nil {
			delete(eventState.commandOutputByItemID, itemID)
		}
	}
	if itemType == codexFileChangeItemType {
		if resolved["diff"] == nil && eventState != nil {
			if buffered := eventState.fileChangeOutputByItemID[itemID]; len(buffered) > 0 {
				resolved["diff"] = strings.Join(buffered, "")
			}
		}
		if eventState != nil {
			delete(eventState.fileChangeOutputByItemID, itemID)
		}
	}
	metadata := appendCodexRawToolResult(state, itemID, itemType, resolved)
	if metadata != nil {
		changed = true
	}
	return changed, metadata
}

func codexEventItem(payload map[string]any) (map[string]any, bool) {
	if item, ok := mapValue(payload["item"]); ok && item != nil {
		return item, true
	}
	params, ok := mapValue(payload["params"])
	if !ok {
		return nil, false
	}
	item, ok := mapValue(params["item"])
	if !ok || item == nil {
		return nil, false
	}
	return item, true
}

func codexEventItemID(payload map[string]any, item map[string]any) string {
	if params, ok := mapValue(payload["params"]); ok {
		for _, key := range []string{"itemId", "item_id"} {
			if value := strings.TrimSpace(stringValue(params[key])); value != "" {
				return value
			}
		}
	}
	for _, key := range []string{"itemId", "item_id", "id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if item != nil {
		if value := strings.TrimSpace(stringValue(item["id"])); value != "" {
			return value
		}
	}
	return ""
}

func isCodexAssistantMessageType(itemType string) bool {
	switch itemType {
	case "assistantMessage", "agentMessage", "message":
		return true
	default:
		return false
	}
}

func isCodexRawToolItemType(itemType string) bool {
	switch itemType {
	case codexCommandExecutionItemType, codexFileChangeItemType, codexMCPToolCallItemType:
		return true
	default:
		_, ok := codexGenericToolItemTypes[itemType]
		return ok
	}
}

func codexToolCallPresent(state *ChatState, toolCallID string) bool {
	_, _, ok := findAssistantToolCall(state, toolCallID)
	return ok
}

func buildCodexRawToolCall(itemType string, item map[string]any) (string, map[string]any, string, bool) {
	switch itemType {
	case codexCommandExecutionItemType:
		command := strings.TrimSpace(stringValue(item["command"]))
		if command == "" {
			return "", nil, "", false
		}
		arguments := map[string]any{"command": command}
		rawArguments := mustMarshalJSON(arguments)
		return codexCommandExecutionToolName, arguments, rawArguments, true
	case codexFileChangeItemType:
		arguments := map[string]any{}
		if path := strings.TrimSpace(stringValue(item["path"])); path != "" {
			arguments["path"] = path
		} else if filePath := strings.TrimSpace(stringValue(item["filePath"])); filePath != "" {
			arguments["path"] = filePath
		}
		if diff := stringValue(item["diff"]); diff != "" {
			arguments["diff"] = diff
		}
		if len(arguments) == 0 {
			return "", nil, "", false
		}
		return codexFileChangeToolName, arguments, mustMarshalJSON(arguments), true
	case codexMCPToolCallItemType:
		toolName := normalizeCodexMCPToolName(item)
		if toolName == "" {
			return "", nil, "", false
		}
		rawArgumentsSource := item["input"]
		if rawArgumentsSource == nil {
			rawArgumentsSource = item["arguments"]
		}
		arguments, rawArguments := normalizeCodexRawArguments(rawArgumentsSource)
		if rawArgumentsSource == nil {
			return "", nil, "", false
		}
		return toolName, arguments, rawArguments, true
	default:
		argumentsSource := extractCodexGenericToolArguments(item)
		arguments, rawArguments := normalizeCodexRawArguments(argumentsSource)
		if rawArguments == "" {
			rawArguments = mustMarshalJSON(argumentsSource)
		}
		return itemType, arguments, rawArguments, true
	}
}

func appendCodexRawToolResult(state *ChatState, itemID string, itemType string, item map[string]any) *codexToolResultMetadata {
	if state == nil || itemID == "" {
		return nil
	}
	switch itemType {
	case codexCommandExecutionItemType:
		command := strings.TrimSpace(stringValue(item["command"]))
		arguments := map[string]any{}
		if command != "" {
			arguments["command"] = command
		}
		result := map[string]any{
			"command":           command,
			"aggregated_output": resolveCodexCommandOutput(item),
			"exit_code":         resolveCodexExitCodeValue(item),
			"status":            strings.TrimSpace(stringValue(item["status"])),
		}
		appendToolResultMessage(
			state,
			itemID,
			codexCommandExecutionToolName,
			arguments,
			result,
			formatToolResultContent(result["aggregated_output"]),
			codexCommandExecutionIsError(item),
		)
		return &codexToolResultMetadata{
			ToolCallID: itemID,
			ToolName:   codexCommandExecutionToolName,
			IsError:    codexCommandExecutionIsError(item),
		}
	case codexFileChangeItemType:
		path := strings.TrimSpace(stringValue(item["path"]))
		if path == "" {
			path = strings.TrimSpace(stringValue(item["filePath"]))
		}
		arguments := map[string]any{}
		if path != "" {
			arguments["path"] = path
		}
		result := map[string]any{
			"path":   path,
			"diff":   item["diff"],
			"status": strings.TrimSpace(stringValue(item["status"])),
		}
		appendToolResultMessage(
			state,
			itemID,
			codexFileChangeToolName,
			arguments,
			result,
			formatToolResultContent(result["diff"]),
			codexToolResultIsError(item),
		)
		return &codexToolResultMetadata{
			ToolCallID: itemID,
			ToolName:   codexFileChangeToolName,
			IsError:    codexToolResultIsError(item),
		}
	case codexMCPToolCallItemType:
		toolName, arguments := lookupToolCallContext(state, itemID)
		if toolName == "" {
			toolName = normalizeCodexMCPToolName(item)
		}
		if toolName == "" {
			return nil
		}
		result := item["output"]
		if result == nil {
			result = item["result"]
		}
		appendToolResultMessage(
			state,
			itemID,
			toolName,
			arguments,
			deepCloneJSONValue(result),
			formatToolResultContent(result),
			codexToolResultIsError(item),
		)
		return &codexToolResultMetadata{
			ToolCallID: itemID,
			ToolName:   toolName,
			IsError:    codexToolResultIsError(item),
		}
	default:
		toolName, arguments := lookupToolCallContext(state, itemID)
		if toolName == "" {
			toolName = itemType
		}
		result := extractCodexGenericToolOutput(item)
		appendToolResultMessage(
			state,
			itemID,
			toolName,
			arguments,
			deepCloneJSONValue(result),
			formatToolResultContent(result),
			codexToolResultIsError(item),
		)
		return &codexToolResultMetadata{
			ToolCallID: itemID,
			ToolName:   toolName,
			IsError:    codexToolResultIsError(item),
		}
	}
}

func codexRawToolItemTerminal(method string, itemType string, item map[string]any) bool {
	if strings.HasSuffix(method, "/completed") {
		return true
	}
	switch itemType {
	case codexCommandExecutionItemType:
		return codexCommandExecutionTerminal(item)
	case codexFileChangeItemType:
		return codexTerminalStatus(item)
	case codexMCPToolCallItemType:
		return codexTerminalStatus(item) || item["output"] != nil || item["result"] != nil
	default:
		return codexTerminalStatus(item) || item["output"] != nil || item["result"] != nil || item["results"] != nil
	}
}

func codexCommandExecutionTerminal(item map[string]any) bool {
	if codexTerminalStatus(item) {
		return true
	}
	return item["exitCode"] != nil || item["exit_code"] != nil
}

func codexTerminalStatus(item map[string]any) bool {
	status := strings.ToLower(strings.TrimSpace(stringValue(item["status"])))
	return status == "completed" || status == "failed" || status == "error"
}

func codexCommandExecutionIsError(item map[string]any) bool {
	if codexToolResultIsError(item) {
		return true
	}
	if !codexExitCodePresent(item) {
		return false
	}
	return resolveCodexExitCode(item) != 0
}

func resolveCodexExitCode(item map[string]any) int {
	switch typed := item["exitCode"].(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	}
	switch typed := item["exit_code"].(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	}
	return 0
}

func resolveCodexExitCodeValue(item map[string]any) any {
	if value, ok := item["exitCode"]; ok && value != nil {
		return value
	}
	if value, ok := item["exit_code"]; ok && value != nil {
		return value
	}
	return nil
}

func codexExitCodePresent(item map[string]any) bool {
	if value, ok := item["exitCode"]; ok && value != nil {
		return true
	}
	if value, ok := item["exit_code"]; ok && value != nil {
		return true
	}
	return false
}

func resolveCodexCommandOutput(item map[string]any) any {
	if value := item["aggregatedOutput"]; value != nil {
		return value
	}
	if value := item["aggregated_output"]; value != nil {
		return value
	}
	stdout := item["stdout"]
	stderr := item["stderr"]
	output := item["output"]
	parts := []string{}
	if text := strings.TrimSpace(stringValue(stdout)); text != "" {
		parts = append(parts, text)
	}
	if text := strings.TrimSpace(stringValue(output)); text != "" {
		parts = append(parts, text)
	}
	if text := strings.TrimSpace(stringValue(stderr)); text != "" {
		parts = append(parts, text)
	}
	if len(parts) == 0 {
		return nil
	}
	return strings.Join(parts, "")
}

func normalizeCodexMCPToolName(item map[string]any) string {
	toolName := strings.TrimSpace(stringValue(item["toolName"]))
	if toolName == "" {
		toolName = strings.TrimSpace(stringValue(item["tool_name"]))
	}
	if toolName == "" {
		toolName = strings.TrimSpace(stringValue(item["name"]))
	}
	if toolName == "" {
		toolName = strings.TrimSpace(stringValue(item["tool"]))
	}
	if toolName == "" {
		return ""
	}
	serverName := strings.TrimSpace(stringValue(item["server"]))
	if serverName != "" && !strings.HasPrefix(toolName, "mcp__") {
		return "mcp__" + serverName + "__" + toolName
	}
	return toolName
}

func normalizeCodexRawArguments(raw any) (map[string]any, string) {
	switch typed := raw.(type) {
	case nil:
		return map[string]any{}, ""
	case map[string]any, string:
		return decodeCodexToolArguments(typed)
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return map[string]any{}, ""
		}
		return map[string]any{}, string(encoded)
	}
}

func extractCodexGenericToolArguments(item map[string]any) any {
	if value := item["input"]; value != nil {
		return value
	}
	if value := item["arguments"]; value != nil {
		return value
	}
	filtered := map[string]any{}
	for key, value := range item {
		switch key {
		case "type", "id", "status", "output", "result", "results":
			continue
		default:
			filtered[key] = deepCloneJSONValue(value)
		}
	}
	return filtered
}

func extractCodexGenericToolOutput(item map[string]any) any {
	if value := item["output"]; value != nil {
		return value
	}
	if value := item["result"]; value != nil {
		return value
	}
	if value := item["results"]; value != nil {
		return value
	}
	if value := item["text"]; value != nil {
		return value
	}
	return item
}

func extractCodexOutputDeltaText(payload map[string]any) string {
	if params, ok := mapValue(payload["params"]); ok {
		raw := params["delta"]
		if raw == nil {
			raw = params["text"]
		}
		if text := extractCodexOutputDeltaValue(raw); text != "" {
			return text
		}
	}
	if text := extractCodexOutputDeltaValue(payload["delta"]); text != "" {
		return text
	}
	return extractCodexOutputDeltaValue(payload["text"])
}

func extractCodexOutputDeltaValue(raw any) string {
	switch typed := raw.(type) {
	case string:
		return typed
	case map[string]any:
		parts := []string{}
		for _, key := range []string{"stdout", "stderr", "text", "delta"} {
			if text := stringValue(typed[key]); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "")
	default:
		return ""
	}
}

func mustMarshalJSON(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}
