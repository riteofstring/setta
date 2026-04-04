package listenerendpoints

import (
	"reflect"

	"setta/internal/projectstate"
)

const (
	EndpointCreateChat           = "route_create_chat"
	EndpointGetChat              = "route_get_chat"
	EndpointAppendChatMessages   = "route_append_chat_messages"
	EndpointDeleteChat           = "route_delete_chat"
	EndpointSetChatSystemPrompt  = "route_set_chat_system_prompt"
	EndpointGetAllChatMetadata   = "route_get_all_chat_metadata"
	EndpointGetChatSectionChatID = "route_get_chat_section_chat_id"
	EndpointSetChatSectionChatID = "route_set_chat_section_chat_id"
	EndpointEmitChatStreamDelta  = "route_emit_chat_stream_delta"
	EndpointRunMCPTools          = "route_run_mcp_tools"
	EndpointSetChatSectionState  = "route_set_chat_section_state"
)

// These payload contracts define the Python listener router endpoint surface.
// They intentionally omit frontend-only fields like frontendOpId while keeping
// projectConfigId optional because the listener websocket runtime injects the
// active project id when callers do not provide it explicitly.
type ListenerCreateChatRequestPayload struct {
	ProjectConfigID *string        `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	EngineConfigID  *string        `json:"engineConfigId,omitempty" py_type:"ID | None" py_import:"from setta.types.id import ID"`
	FirstMessage    map[string]any `json:"firstMessage" py_type:"BaseChatMessageUnion" py_import:"from setta.types.chat import BaseChatMessageUnion"`
}

type ListenerGetChatRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID          string  `json:"chatId" py_type:"ID" py_import:"from setta.types.id import ID"`
}

type ListenerAppendChatMessagesRequestPayload struct {
	ProjectConfigID *string          `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID          string           `json:"chatId" py_type:"ID" py_import:"from setta.types.id import ID"`
	Messages        []map[string]any `json:"messages" py_type:"list[BaseChatMessageUnion]" py_import:"from setta.types.chat import BaseChatMessageUnion"`
}

type ListenerDeleteChatRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID          string  `json:"chatId" py_type:"ID" py_import:"from setta.types.id import ID"`
}

type ListenerSetChatSystemPromptRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID          string  `json:"chatId" py_type:"ID" py_import:"from setta.types.id import ID"`
	SystemPrompt    string  `json:"systemPrompt"`
}

type ListenerGetAllChatMetadataRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
}

type ListenerGetChatSectionChatIDRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	SectionID       string  `json:"sectionId" py_type:"ID" py_import:"from setta.types.id import ID"`
}

type ListenerSetChatSectionChatIDRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	SectionID       string  `json:"sectionId" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID          *string `json:"chatId" py_type:"ID | None" py_import:"from setta.types.id import ID"`
}

type ListenerEmitChatStreamDeltaRequestPayload struct {
	ProjectConfigID *string `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	SectionID       string  `json:"sectionId" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID          string  `json:"chatId" py_type:"ID" py_import:"from setta.types.id import ID"`
	Chunk           any     `json:"chunk" py_type:"LLMStreamingResponseChunk" py_import:"from setta.types.chat import LLMStreamingResponseChunk"`
}

type ListenerRunMCPToolsRequestPayload struct {
	ProjectConfigID       *string          `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	ChatID                string           `json:"chatId" py_type:"ID" py_import:"from setta.types.id import ID"`
	SectionID             string           `json:"sectionId" py_type:"ID" py_import:"from setta.types.id import ID"`
	FrontendAffinityToken *string          `json:"frontendAffinityToken,omitempty" py_type:"str | None"`
	ToolCalls             []map[string]any `json:"toolCalls" py_type:"list[ToolCall]" py_import:"from setta.types.generated.go_shared_types import ToolCall"`
}

type ListenerSetChatSectionStateRequestPayload struct {
	ProjectConfigID *string                       `json:"projectConfigId,omitempty" py_type:"ID" py_import:"from setta.types.id import ID"`
	SectionID       string                        `json:"sectionId" py_type:"ID" py_import:"from setta.types.id import ID"`
	State           projectstate.ChatSectionState `json:"state" py_type:"ChatSectionState" py_import:"from setta.types.chat import ChatSectionState"`
}

type pythonClientEndpointSpec struct {
	EndpointName    string
	MethodName      string
	RequestType     reflect.Type
	ResponseType    string
	ResponseImports []string
}

var pythonClientEndpointSpecs = []pythonClientEndpointSpec{
	{
		EndpointName: EndpointCreateChat,
		MethodName:   "create_chat",
		RequestType:  reflect.TypeOf(ListenerCreateChatRequestPayload{}),
		ResponseType: "Chat",
		ResponseImports: []string{
			"from setta.types.chat import Chat",
		},
	},
	{
		EndpointName: EndpointGetChat,
		MethodName:   "get_chat",
		RequestType:  reflect.TypeOf(ListenerGetChatRequestPayload{}),
		ResponseType: "Chat",
		ResponseImports: []string{
			"from setta.types.chat import Chat",
		},
	},
	{
		EndpointName: EndpointAppendChatMessages,
		MethodName:   "append_chat_messages",
		RequestType:  reflect.TypeOf(ListenerAppendChatMessagesRequestPayload{}),
		ResponseType: "Chat",
		ResponseImports: []string{
			"from setta.types.chat import Chat",
		},
	},
	{
		EndpointName: EndpointDeleteChat,
		MethodName:   "delete_chat",
		RequestType:  reflect.TypeOf(ListenerDeleteChatRequestPayload{}),
		ResponseType: "None",
	},
	{
		EndpointName: EndpointSetChatSystemPrompt,
		MethodName:   "set_chat_system_prompt",
		RequestType:  reflect.TypeOf(ListenerSetChatSystemPromptRequestPayload{}),
		ResponseType: "Chat",
		ResponseImports: []string{
			"from setta.types.chat import Chat",
		},
	},
	{
		EndpointName: EndpointGetAllChatMetadata,
		MethodName:   "get_all_chat_metadata",
		RequestType:  reflect.TypeOf(ListenerGetAllChatMetadataRequestPayload{}),
		ResponseType: "list[ChatMetadata]",
		ResponseImports: []string{
			"from setta.types.generated.go_shared_types import ChatMetadata",
		},
	},
	{
		EndpointName: EndpointGetChatSectionChatID,
		MethodName:   "get_chat_section_chat_id",
		RequestType:  reflect.TypeOf(ListenerGetChatSectionChatIDRequestPayload{}),
		ResponseType: "str | None",
	},
	{
		EndpointName: EndpointSetChatSectionChatID,
		MethodName:   "set_chat_section_chat_id",
		RequestType:  reflect.TypeOf(ListenerSetChatSectionChatIDRequestPayload{}),
		ResponseType: "None",
	},
	{
		EndpointName: EndpointEmitChatStreamDelta,
		MethodName:   "emit_chat_stream_delta",
		RequestType:  reflect.TypeOf(ListenerEmitChatStreamDeltaRequestPayload{}),
		ResponseType: "None",
	},
	{
		EndpointName: EndpointRunMCPTools,
		MethodName:   "run_mcp_tools",
		RequestType:  reflect.TypeOf(ListenerRunMCPToolsRequestPayload{}),
		ResponseType: "list[ToolChatMessage]",
		ResponseImports: []string{
			"from setta.types.generated.go_shared_types import ToolChatMessage",
		},
	},
	{
		EndpointName: EndpointSetChatSectionState,
		MethodName:   "set_chat_section_state",
		RequestType:  reflect.TypeOf(ListenerSetChatSectionStateRequestPayload{}),
		ResponseType: "None",
	},
}
