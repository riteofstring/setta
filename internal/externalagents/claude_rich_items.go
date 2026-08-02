package externalagents

import "strings"

type claudeToolResultBuffer struct {
	Text    string
	IsError bool
}

type claudeToolResultMetadata struct {
	ToolCallID string
	ToolName   string
	Result     any
	IsError    bool
}

func appendClaudeToolResultChunk(
	buffers map[string]*claudeToolResultBuffer,
	toolCallID string,
	content any,
	isError bool,
) {
	trimmedToolCallID := strings.TrimSpace(toolCallID)
	if trimmedToolCallID == "" || buffers == nil {
		return
	}
	buffer := buffers[trimmedToolCallID]
	if buffer == nil {
		buffer = &claudeToolResultBuffer{}
		buffers[trimmedToolCallID] = buffer
	}
	if text := extractClaudeToolResultText(content); text != "" {
		buffer.Text += text
	}
	if isError {
		buffer.IsError = true
	}
}

func applyClaudeToolResult(
	state *ChatState,
	toolCallID string,
	content string,
	isError bool,
) *claudeToolResultMetadata {
	trimmedToolCallID := strings.TrimSpace(toolCallID)
	if state == nil || trimmedToolCallID == "" || toolResultMessagePresent(state, trimmedToolCallID) {
		return nil
	}
	toolName, arguments := lookupToolCallContext(state, trimmedToolCallID)
	var result any
	if content != "" {
		result = content
	}
	appendToolResultMessage(
		state,
		trimmedToolCallID,
		toolName,
		arguments,
		result,
		content,
		isError,
	)
	return &claudeToolResultMetadata{
		ToolCallID: trimmedToolCallID,
		ToolName:   toolName,
		Result:     result,
		IsError:    isError,
	}
}

func buildClaudeToolResultFromContentBlock(state *ChatState, contentBlock map[string]any) *claudeToolResultMetadata {
	if len(contentBlock) == 0 {
		return nil
	}
	return applyClaudeToolResult(
		state,
		stringValue(contentBlock["tool_use_id"]),
		extractClaudeToolResultText(contentBlock["content"]),
		boolValue(contentBlock["is_error"]),
	)
}

func extractClaudeToolResultText(payload any) string {
	switch typed := payload.(type) {
	case string:
		return typed
	case map[string]any:
		if text := stringValue(typed["text"]); text != "" {
			return text
		}
		if content, ok := typed["content"]; ok {
			return extractClaudeToolResultText(content)
		}
	case []any:
		if len(typed) == 0 {
			return ""
		}
		parts := make([]string, 0, len(typed))
		for _, entry := range typed {
			part := extractClaudeToolResultText(entry)
			if part != "" {
				parts = append(parts, part)
			}
		}
		return strings.Join(parts, "")
	}
	return ""
}
