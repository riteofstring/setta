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

type ChatSendAction string

const (
	ChatSendActionSend ChatSendAction = "send"
)

type ChatStopAction string

const (
	ChatStopActionStop ChatStopAction = "stop"
)

type ChatSendEvent struct {
	Action      ChatSendAction       `json:"action"`
	SectionID   string               `json:"sectionId"`
	MessageID   string               `json:"messageId"`
	Text        string               `json:"text"`
	Attachments []ChatFileAttachment `json:"attachments"`
	Role        ChatRole             `json:"role"`
	TimestampMS int64                `json:"timestampMs"`
	Managed     bool                 `json:"managed"`
}

type ChatStopEvent struct {
	Action      ChatStopAction `json:"action"`
	SectionID   string         `json:"sectionId"`
	TimestampMS int64          `json:"timestampMs"`
	Managed     bool           `json:"managed"`
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
	ID          string               `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole             `json:"role" py_default:"ChatRole.system"`
	CreatedAt   int                  `json:"createdAt" py_default:"0"`
	Content     []map[string]any     `json:"content" py_type:"list[MessageTextContent | MessageImageURLContent | MessageThinkingContent]" py_default:"Field(default_factory=list)"`
	Attachments []ChatFileAttachment `json:"attachments" py_default:"Field(default_factory=list)"`
}

type AssistantChatMessage struct {
	ID          string               `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole             `json:"role" py_default:"ChatRole.assistant"`
	CreatedAt   int                  `json:"createdAt" py_default:"0"`
	Content     []map[string]any     `json:"content" py_type:"list[MessageTextContent | MessageImageURLContent | MessageThinkingContent]" py_default:"Field(default_factory=list)"`
	Attachments []ChatFileAttachment `json:"attachments" py_default:"Field(default_factory=list)"`
	ToolCalls   []ToolCall           `json:"tool_calls,omitempty"`
}

type UserChatMessage struct {
	ID          string               `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole             `json:"role" py_default:"ChatRole.user"`
	CreatedAt   int                  `json:"createdAt" py_default:"0"`
	Content     []map[string]any     `json:"content" py_type:"list[MessageTextContent | MessageImageURLContent | MessageThinkingContent]" py_default:"Field(default_factory=list)"`
	Attachments []ChatFileAttachment `json:"attachments" py_default:"Field(default_factory=list)"`
}

type ToolChatMessage struct {
	ID          string           `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole         `json:"role" py_default:"ChatRole.tool"`
	CreatedAt   int              `json:"createdAt" py_default:"0"`
	ToolCallID  string           `json:"tool_call_id"`
	ToolName    *string          `json:"tool_name,omitempty"`
	Arguments   any              `json:"arguments" py_default:"Field(default_factory=dict)"`
	Result      any              `json:"result" py_default:"None"`
	Content     []map[string]any `json:"content" py_type:"list[TextContent | ImageContent | EmbeddedResource | ToolReferenceContent]" py_import:"from mcp.types import EmbeddedResource, ImageContent, TextContent" py_default:"Field(default_factory=list)"`
	IsError     bool             `json:"is_error" py_default:"False"`
	StartedAt   time.Time        `json:"started_at" py_import:"from setta.utils.timestamps import get_now_timestamp" py_default:"Field(default_factory=get_now_timestamp)"`
	CompletedAt *time.Time       `json:"completed_at,omitempty"`
}
