package scriptablechat

import "time"

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

func FrontendDefaultToolChatMessage() ToolChatMessage {
	return ToolChatMessage{
		ID:          "",
		Role:        ChatRoleTool,
		CreatedAt:   0,
		ToolCallID:  "",
		ToolName:    nil,
		Arguments:   map[string]any{},
		Result:      nil,
		Content:     []map[string]any{},
		IsError:     false,
		StartedAt:   time.Time{},
		CompletedAt: nil,
	}
}
