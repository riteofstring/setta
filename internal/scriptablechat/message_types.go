package scriptablechat

import (
	"reflect"
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
	Type string `json:"type" ts_type:"\"text\""`
	Text string `json:"text"`
}

type MessageImageURL struct {
	URL    string  `json:"url"`
	Detail *string `json:"detail,omitempty" ts_type:"\"auto\" | \"low\" | \"high\" | null"`
}

type MessageImageURLContent struct {
	Type     string          `json:"type" ts_type:"\"image_url\""`
	ImageURL MessageImageURL `json:"image_url"`
}

type MessageThinkingContent struct {
	Type      string  `json:"type" ts_type:"\"thinking\""`
	Thinking  string  `json:"thinking"`
	Summary   *string `json:"summary,omitempty"`
	Signature *string `json:"signature,omitempty"`
}

type MessageContent struct{}

func (MessageContent) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(MessageTextContent{}),
		reflect.TypeOf(MessageImageURLContent{}),
		reflect.TypeOf(MessageThinkingContent{}),
	}
}

type ToolReferenceContent struct {
	Type     string `json:"type" ts_type:"\"tool_reference\""`
	ToolName string `json:"tool_name"`
}

type ToolCallFunction struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments" ts_type:"{ [key: string]: JSONValue | undefined }"`
}

type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type" ts_type:"\"function\""`
	Function ToolCallFunction `json:"function"`
}

type BaseChatMessageUnion struct{}

func (BaseChatMessageUnion) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(SystemChatMessage{}),
		reflect.TypeOf(AssistantChatMessage{}),
		reflect.TypeOf(UserChatMessage{}),
		reflect.TypeOf(ToolChatMessage{}),
	}
}

type SystemChatMessage struct {
	ID          string               `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole             `json:"role" py_default:"ChatRole.system" ts_type:"typeof ChatRoleEnum.system"`
	CreatedAt   int                  `json:"createdAt" py_default:"0"`
	Content     []map[string]any     `json:"content" py_type:"list[MessageTextContent | MessageImageURLContent | MessageThinkingContent]" py_default:"Field(default_factory=list)" ts_type:"Array<MessageContent>"`
	Attachments []ChatFileAttachment `json:"attachments" py_default:"Field(default_factory=list)"`
}

type AssistantChatMessage struct {
	ID          string               `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole             `json:"role" py_default:"ChatRole.assistant" ts_type:"typeof ChatRoleEnum.assistant"`
	CreatedAt   int                  `json:"createdAt" py_default:"0"`
	Content     []map[string]any     `json:"content" py_type:"list[MessageTextContent | MessageImageURLContent | MessageThinkingContent]" py_default:"Field(default_factory=list)" ts_type:"Array<MessageContent>"`
	Attachments []ChatFileAttachment `json:"attachments" py_default:"Field(default_factory=list)"`
	ToolCalls   []ToolCall           `json:"tool_calls,omitempty"`
}

type UserChatMessage struct {
	ID          string               `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole             `json:"role" py_default:"ChatRole.user" ts_type:"typeof ChatRoleEnum.user"`
	CreatedAt   int                  `json:"createdAt" py_default:"0"`
	Content     []map[string]any     `json:"content" py_type:"list[MessageTextContent | MessageImageURLContent | MessageThinkingContent]" py_default:"Field(default_factory=list)" ts_type:"Array<MessageContent>"`
	Attachments []ChatFileAttachment `json:"attachments" py_default:"Field(default_factory=list)"`
}

type ToolChatMessage struct {
	ID          string           `json:"id" py_type:"ID" py_import:"from setta.types.id import ID, create_new_id" py_default:"Field(default_factory=create_new_id)"`
	Role        ChatRole         `json:"role" py_default:"ChatRole.tool" ts_type:"typeof ChatRoleEnum.tool"`
	CreatedAt   int              `json:"createdAt" py_default:"0"`
	ToolCallID  string           `json:"tool_call_id"`
	ToolName    *string          `json:"tool_name,omitempty"`
	Arguments   any              `json:"arguments" py_default:"Field(default_factory=dict)" ts_type:"JSONValue"`
	Result      any              `json:"result" py_default:"None" ts_type:"JSONValue"`
	Content     []map[string]any `json:"content" py_type:"list[TextContent | ImageContent | EmbeddedResource | ToolReferenceContent]" py_import:"from mcp.types import EmbeddedResource, ImageContent, TextContent" py_default:"Field(default_factory=list)" ts_type:"Array<ToolReferenceContent | Record<string, unknown>>"`
	IsError     bool             `json:"is_error" py_default:"False"`
	StartedAt   time.Time        `json:"started_at" py_import:"from setta.utils.timestamps import get_now_timestamp" py_default:"Field(default_factory=get_now_timestamp)" ts_create_expr:"\"\""`
	CompletedAt *time.Time       `json:"completed_at,omitempty"`
}
