package scriptablechat

import (
	"time"
)

type ChatRole string

const (
	ChatRoleSystem    ChatRole = "system"
	ChatRoleUser      ChatRole = "user"
	ChatRoleAssistant ChatRole = "assistant"
	ChatRoleTool      ChatRole = "tool"
)

type ChatFileAttachment struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	MimeType *string `json:"mimeType,omitempty"`
	Size     *int    `json:"size,omitempty"`
}

type MessageTextContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type MessageImageURL struct {
	URL    string  `json:"url"`
	Detail *string `json:"detail,omitempty"`
}

type MessageImageURLContent struct {
	Type     string          `json:"type"`
	ImageURL MessageImageURL `json:"image_url"`
}

type MessageThinkingContent struct {
	Type      string  `json:"type"`
	Thinking  string  `json:"thinking"`
	Summary   *string `json:"summary,omitempty"`
	Signature *string `json:"signature,omitempty"`
}

type ToolReferenceContent struct {
	Type     string `json:"type"`
	ToolName string `json:"tool_name"`
}

type ToolCallFunction struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function ToolCallFunction `json:"function"`
}

type SystemChatMessage struct {
	ID          string               `json:"id"`
	Role        ChatRole             `json:"role"`
	CreatedAt   int                  `json:"createdAt"`
	Content     []map[string]any     `json:"content"`
	Attachments []ChatFileAttachment `json:"attachments"`
}

type AssistantChatMessage struct {
	ID          string               `json:"id"`
	Role        ChatRole             `json:"role"`
	CreatedAt   int                  `json:"createdAt"`
	Content     []map[string]any     `json:"content"`
	Attachments []ChatFileAttachment `json:"attachments"`
	ToolCalls   []ToolCall           `json:"tool_calls,omitempty"`
}

type UserChatMessage struct {
	ID          string               `json:"id"`
	Role        ChatRole             `json:"role"`
	CreatedAt   int                  `json:"createdAt"`
	Content     []map[string]any     `json:"content"`
	Attachments []ChatFileAttachment `json:"attachments"`
}

type ToolChatMessage struct {
	ID          string           `json:"id"`
	Role        ChatRole         `json:"role"`
	CreatedAt   int              `json:"createdAt"`
	ToolCallID  string           `json:"tool_call_id"`
	ToolName    *string          `json:"tool_name,omitempty"`
	Arguments   any              `json:"arguments"`
	Result      any              `json:"result"`
	Content     []map[string]any `json:"content"`
	IsError     bool             `json:"is_error"`
	StartedAt   time.Time        `json:"started_at"`
	CompletedAt *time.Time       `json:"completed_at,omitempty"`
}
