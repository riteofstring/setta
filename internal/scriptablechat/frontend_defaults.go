package scriptablechat

func FrontendDefaultMessageTextContent() MessageTextContent {
	return MessageTextContent{
		Type: "text",
		Text: "",
	}
}

func FrontendDefaultMessageThinkingContent() MessageThinkingContent {
	summary := ""
	signature := ""
	return MessageThinkingContent{
		Type:      "thinking",
		Thinking:  "",
		Summary:   &summary,
		Signature: &signature,
	}
}

func FrontendDefaultToolCallFunction() ToolCallFunction {
	return ToolCallFunction{
		Name:      "",
		Arguments: map[string]any{},
	}
}

func FrontendDefaultToolCall() ToolCall {
	return ToolCall{
		ID:       "",
		Type:     "function",
		Function: FrontendDefaultToolCallFunction(),
	}
}

func FrontendDefaultSystemChatMessage() SystemChatMessage {
	return SystemChatMessage{
		ID:          "",
		Role:        ChatRoleSystem,
		Content:     []map[string]any{},
		Attachments: []ChatFileAttachment{},
	}
}

func FrontendDefaultAssistantChatMessage() AssistantChatMessage {
	return AssistantChatMessage{
		ID:          "",
		Role:        ChatRoleAssistant,
		Content:     []map[string]any{},
		Attachments: []ChatFileAttachment{},
	}
}

func FrontendDefaultUserChatMessage() UserChatMessage {
	return UserChatMessage{
		ID:          "",
		Role:        ChatRoleUser,
		Content:     []map[string]any{},
		Attachments: []ChatFileAttachment{},
	}
}

func FrontendDefaultToolChatMessage() map[string]any {
	return map[string]any{
		"id":           "",
		"role":         ChatRoleTool,
		"createdAt":    0,
		"tool_call_id": "",
		"tool_name":    nil,
		"arguments":    map[string]any{},
		"result":       nil,
		"content":      []any{},
		"is_error":     false,
		"started_at":   "",
		"completed_at": nil,
	}
}
