package realtime

import (
	"reflect"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/settingsstate"
	"setta/internal/transcriptionprofiles"
)

const (
	MessageTypeNotification                 = "Notification"
	MessageTypeAllProjectMetadata           = "AllProjectMetadata"
	MessageTypeAllConnections               = "AllConnections"
	MessageTypeFrontendIdentity             = "FrontendIdentity"
	MessageTypeListenerCoverageSnapshot     = "ListenerCoverageSnapshot"
	MessageTypeUpdateArtifacts              = "UpdateArtifacts"
	MessageTypeLLMStreamingResponse         = "LLMStreamingResponse"
	MessageTypeAIFollowToolArgumentsUpdate  = "AIFollowToolArgumentsUpdate"
	MessageTypeAIFollowToolResultUpdate     = "AIFollowToolResultUpdate"
	MessageTypeUISettingReveal              = "UISettingReveal"
	MessageTypeUISettingRevealResult        = "UISettingRevealResult"
	MessageTypeLSPDiagnostics               = "LSPDiagnostics"
	MessageTypeNameValidationErrors         = "NameValidationErrors"
	MessageTypeLLMConfigUpdated             = "LLMConfigUpdated"
	MessageTypeLLMAPIKeysUpdated            = "LLMApiKeysUpdated"
	MessageTypeExternalAgentConfigsUpdated  = "ExternalAgentConfigsUpdated"
	MessageTypeEngineConfigsUpdated         = "EngineConfigsUpdated"
	MessageTypeAgentProfilesUpdated         = "AgentProfilesUpdated"
	MessageTypeAgentRunUpdated              = "AgentRunUpdated"
	MessageTypePromptTemplatesUpdated       = "PromptTemplatesUpdated"
	MessageTypeTranscriptionProfilesUpdated = "TranscriptionProfilesUpdated"
	MessageTypeUpdateFrontendProjectState   = "UpdateFrontendProjectState"
	MessageTypeUpdateSettings               = "UpdateSettings"
	MessageTypeReturnRenameRefactorResults  = "ReturnRenameRefactorResults"
	MessageTypeRealtimeUIChange             = "RealtimeUIChange"
	MessageTypeRealtimeDependencyEvent      = "RealtimeDependencyEvent"
)

type WebsocketMessageType string

const (
	WebsocketMessageTypeNotification                 WebsocketMessageType = MessageTypeNotification
	WebsocketMessageTypeAllProjectMetadata           WebsocketMessageType = MessageTypeAllProjectMetadata
	WebsocketMessageTypeAllConnections               WebsocketMessageType = MessageTypeAllConnections
	WebsocketMessageTypeFrontendIdentity             WebsocketMessageType = MessageTypeFrontendIdentity
	WebsocketMessageTypeListenerCoverageSnapshot     WebsocketMessageType = MessageTypeListenerCoverageSnapshot
	WebsocketMessageTypeUpdateArtifacts              WebsocketMessageType = MessageTypeUpdateArtifacts
	WebsocketMessageTypeLLMStreamingResponse         WebsocketMessageType = MessageTypeLLMStreamingResponse
	WebsocketMessageTypeAIFollowToolArgumentsUpdate  WebsocketMessageType = MessageTypeAIFollowToolArgumentsUpdate
	WebsocketMessageTypeAIFollowToolResultUpdate     WebsocketMessageType = MessageTypeAIFollowToolResultUpdate
	WebsocketMessageTypeUISettingReveal              WebsocketMessageType = MessageTypeUISettingReveal
	WebsocketMessageTypeLSPDiagnostics               WebsocketMessageType = MessageTypeLSPDiagnostics
	WebsocketMessageTypeNameValidationErrors         WebsocketMessageType = MessageTypeNameValidationErrors
	WebsocketMessageTypeLLMConfigUpdated             WebsocketMessageType = MessageTypeLLMConfigUpdated
	WebsocketMessageTypeLLMAPIKeysUpdated            WebsocketMessageType = MessageTypeLLMAPIKeysUpdated
	WebsocketMessageTypeExternalAgentConfigsUpdated  WebsocketMessageType = MessageTypeExternalAgentConfigsUpdated
	WebsocketMessageTypeEngineConfigsUpdated         WebsocketMessageType = MessageTypeEngineConfigsUpdated
	WebsocketMessageTypeAgentProfilesUpdated         WebsocketMessageType = MessageTypeAgentProfilesUpdated
	WebsocketMessageTypeAgentRunUpdated              WebsocketMessageType = MessageTypeAgentRunUpdated
	WebsocketMessageTypePromptTemplatesUpdated       WebsocketMessageType = MessageTypePromptTemplatesUpdated
	WebsocketMessageTypeTranscriptionProfilesUpdated WebsocketMessageType = MessageTypeTranscriptionProfilesUpdated
	WebsocketMessageTypeUpdateFrontendProjectState   WebsocketMessageType = MessageTypeUpdateFrontendProjectState
	WebsocketMessageTypeUpdateSettings               WebsocketMessageType = MessageTypeUpdateSettings
	WebsocketMessageTypeReturnRenameRefactorResults  WebsocketMessageType = MessageTypeReturnRenameRefactorResults
	WebsocketMessageTypeBackendLogEvent              WebsocketMessageType = "BackendLogEvent"
)

type NotificationType string

const (
	NotificationTypeError   NotificationType = "error"
	NotificationTypeWarning NotificationType = "warning"
	NotificationTypeInfo    NotificationType = "info"
	NotificationTypeSave    NotificationType = "save"
)

type StreamingEventType string

const (
	StreamingEventTypeMessageStart        StreamingEventType = "message_start"
	StreamingEventTypeDelta               StreamingEventType = "delta"
	StreamingEventTypeToolCallDelta       StreamingEventType = "tool_call_delta"
	StreamingEventTypeToolArgumentPreview StreamingEventType = "tool_argument_preview_delta"
	StreamingEventTypeToolResult          StreamingEventType = "tool_result"
	StreamingEventTypeMessageStop         StreamingEventType = "message_stop"
	StreamingEventTypeMessageFinalized    StreamingEventType = "message_finalized"
)

const (
	MessageContentTypeTextDelta     = "text_delta"
	MessageContentTypeThinkingDelta = "thinking_delta"
)

type FrontendIdentityContent struct {
	FrontendAffinityToken string `json:"frontendAffinityToken"`
}

type AIFollowToolArgumentsUpdateContent struct {
	ProjectConfigID string              `json:"projectConfigId"`
	ChatID          string              `json:"chatId"`
	IDsByType       map[string][]string `json:"idsByType"`
}

type AIFollowToolResultUpdateContent struct {
	ProjectConfigID string              `json:"projectConfigId"`
	ChatID          string              `json:"chatId"`
	IDsByType       map[string][]string `json:"idsByType"`
}

type MessageTextDelta struct {
	Type  string `json:"type" ts_type:"\"text_delta\""`
	Index int    `json:"index"`
	Text  string `json:"text"`
}

type MessageThinkingDelta struct {
	Type      string  `json:"type" ts_type:"\"thinking_delta\""`
	Index     int     `json:"index"`
	Thinking  string  `json:"thinking"`
	Summary   *string `json:"summary" ts_optional:"true"`
	Signature *string `json:"signature" ts_optional:"true"`
}

type MessageContentDelta struct{}

func (MessageContentDelta) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(MessageTextDelta{}),
		reflect.TypeOf(MessageThinkingDelta{}),
	}
}

type MessageStartEvent struct {
	Type    StreamingEventType `json:"type" ts_type:"typeof StreamingEventTypeEnum.MESSAGE_START"`
	Message map[string]any     `json:"message" ts_type:"BaseChatMessageUnion"`
}

type MessageDeltaEvent struct {
	Type      StreamingEventType `json:"type" ts_type:"typeof StreamingEventTypeEnum.DELTA"`
	MessageID string             `json:"message_id"`
	Content   []any              `json:"content" ts_type:"Array<MessageContentDelta> | null" ts_optional:"true"`
}

type ToolCallDeltaEvent struct {
	Type           StreamingEventType `json:"type" ts_type:"typeof StreamingEventTypeEnum.TOOL_CALL_DELTA"`
	MessageID      string             `json:"message_id"`
	ToolCallID     string             `json:"tool_call_id"`
	ArgumentsDelta string             `json:"arguments_delta"`
	ToolName       *string            `json:"tool_name" ts_optional:"true"`
}

type ToolResultEvent struct {
	Type   StreamingEventType `json:"type" ts_type:"typeof StreamingEventTypeEnum.TOOL_RESULT"`
	Result map[string]any     `json:"result" ts_type:"ToolChatMessage"`
}

type ToolArgumentPreviewDeltaEvent struct {
	Type              StreamingEventType  `json:"type" ts_type:"typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA"`
	MessageID         string              `json:"message_id"`
	ToolCallID        string              `json:"tool_call_id"`
	ToolName          string              `json:"tool_name"`
	ArgumentsDelta    string              `json:"arguments_delta"`
	PreviewKind       string              `json:"preview_kind"`
	TargetIDsByType   map[string][]string `json:"target_ids_by_type"`
	PreviewValueDelta string              `json:"preview_value_delta"`
}

type MessageStopEvent struct {
	Type      StreamingEventType `json:"type" ts_type:"typeof StreamingEventTypeEnum.MESSAGE_STOP"`
	MessageID string             `json:"message_id"`
}

type MessageFinalizedEvent struct {
	Type    StreamingEventType `json:"type" ts_type:"typeof StreamingEventTypeEnum.MESSAGE_FINALIZED"`
	Message map[string]any     `json:"message" ts_type:"BaseChatMessageUnion"`
}

type LLMStreamingResponseChunk struct{}

func (LLMStreamingResponseChunk) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(MessageStartEvent{}),
		reflect.TypeOf(MessageDeltaEvent{}),
		reflect.TypeOf(ToolCallDeltaEvent{}),
		reflect.TypeOf(ToolResultEvent{}),
		reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}),
		reflect.TypeOf(MessageStopEvent{}),
		reflect.TypeOf(MessageFinalizedEvent{}),
	}
}

type LLMStreamingResponseContent struct {
	ChatID          string  `json:"chatId"`
	Chunk           any     `json:"chunk" ts_type:"LLMStreamingResponseChunk"`
	SectionID       *string `json:"sectionId" ts_optional:"true"`
	ProjectConfigID *string `json:"projectConfigId" ts_optional:"true"`
}

type LLMStreamingResponseMessage struct {
	ID          *string                     `json:"id"`
	MessageType WebsocketMessageType        `json:"messageType"`
	Content     LLMStreamingResponseContent `json:"content"`
}

type UISettingRevealActivationStep struct {
	Type      string `json:"type"`
	ItemValue string `json:"itemValue"`
}

type UISettingRevealTarget struct {
	SettingID             string                          `json:"settingId"`
	Side                  string                          `json:"side"`
	OverviewTabKey        *string                         `json:"overviewTabKey,omitempty"`
	UIEditorTabName       *string                         `json:"uiEditorTabName,omitempty"`
	PluginID              *string                         `json:"pluginId,omitempty"`
	PaneID                *string                         `json:"paneId,omitempty"`
	Strategy              string                          `json:"strategy"`
	AnchorID              *string                         `json:"anchorId,omitempty"`
	PluginRevealKey       *string                         `json:"pluginRevealKey,omitempty"`
	RevealActivationSteps []UISettingRevealActivationStep `json:"revealActivationSteps,omitempty" ts_optional:"false"`
}

type UISettingRevealContent struct {
	ProjectConfigID string                  `json:"projectConfigId"`
	ChatID          *string                 `json:"chatId,omitempty"`
	ActiveSectionID *string                 `json:"activeSectionId,omitempty"`
	Reveals         []UISettingRevealTarget `json:"reveals"`
	DurationMS      int                     `json:"durationMs" ts_parse_fallback:"3000"`
	RequestID       string                  `json:"requestId"`
}

type UISettingRevealMessage struct {
	ID          *string                `json:"id"`
	MessageType WebsocketMessageType   `json:"messageType"`
	Content     UISettingRevealContent `json:"content"`
}

type UISettingRevealResultStatus struct {
	SettingID    string  `json:"settingId"`
	Status       string  `json:"status" ts_type:"\"revealed\" | \"failed\""`
	ErrorCode    *string `json:"errorCode" ts_optional:"true"`
	ErrorMessage *string `json:"errorMessage" ts_optional:"true"`
}

type UISettingRevealResultContent struct {
	ProjectConfigID string                        `json:"projectConfigId"`
	RequestID       string                        `json:"requestId"`
	Statuses        []UISettingRevealResultStatus `json:"statuses"`
}

type NotificationContent struct {
	ID              string           `json:"id"`
	ProjectConfigID string           `json:"projectConfigId"`
	Type            NotificationType `json:"type"`
	Message         string           `json:"message"`
	Temporary       bool             `json:"temporary"`
	Timestamp       string           `json:"timestamp"`
	Metadata        map[string]any   `json:"metadata"`
	ReadStatus      bool             `json:"read_status"`
}

type NotificationMessage struct {
	ID          *string              `json:"id"`
	MessageType WebsocketMessageType `json:"messageType"`
	Content     NotificationContent  `json:"content"`
}

type AllProjectMetadataContent struct {
	DefaultProjectConfigID *string                              `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
}

type AllProjectMetadataMessage struct {
	ID          *string                   `json:"id"`
	MessageType WebsocketMessageType      `json:"messageType"`
	Content     AllProjectMetadataContent `json:"content"`
}

type FrontendIdentityMessage struct {
	MessageType WebsocketMessageType    `json:"messageType"`
	Content     FrontendIdentityContent `json:"content"`
}

type ListenerCoverageSnapshotMessage struct {
	MessageType WebsocketMessageType     `json:"messageType"`
	Content     ListenerCoverageSnapshot `json:"content"`
}

type LLMStreamingResponseEnvelope = LLMStreamingResponseMessage

type AIFollowToolArgumentsUpdateMessage struct {
	MessageType WebsocketMessageType               `json:"messageType"`
	Content     AIFollowToolArgumentsUpdateContent `json:"content"`
}

type AIFollowToolResultUpdateMessage struct {
	MessageType WebsocketMessageType            `json:"messageType"`
	Content     AIFollowToolResultUpdateContent `json:"content"`
}

type UISettingRevealResultMessage struct {
	ID          *string                      `json:"id"`
	MessageType string                       `json:"messageType" ts_type:"typeof MessageTypeEnum.UISettingRevealResult"`
	Content     UISettingRevealResultContent `json:"content"`
}

type AllConnectionsMessage struct {
	MessageType WebsocketMessageType `json:"messageType"`
	Content     []Connection         `json:"content"`
}

type LSPDiagnosticsMessage struct {
	MessageType WebsocketMessageType               `json:"messageType"`
	Content     projectstate.LSPDiagnosticsPayload `json:"content"`
}

type NameValidationErrorsMessage struct {
	MessageType WebsocketMessageType              `json:"messageType"`
	Content     projectstate.NameValidationErrors `json:"content"`
}

type LLMConfigUpdatedMessage struct {
	MessageType WebsocketMessageType `json:"messageType"`
	Content     llmconfig.AllConfigs `json:"content"`
}

type LLMAPIKeysUpdatedMessage struct {
	MessageType WebsocketMessageType             `json:"messageType"`
	Content     llmconfig.ManagedAPIKeysSnapshot `json:"content"`
}

type ExternalAgentConfigsUpdatedContent struct {
	Configs []externalagentconfigs.Config `json:"configs"`
}

type ExternalAgentConfigsUpdatedMessage struct {
	MessageType WebsocketMessageType               `json:"messageType"`
	Content     ExternalAgentConfigsUpdatedContent `json:"content"`
}

type EngineConfigsUpdatedContent struct {
	Configs []agentruns.EngineConfig `json:"configs"`
}

type EngineConfigsUpdatedMessage struct {
	MessageType WebsocketMessageType        `json:"messageType"`
	Content     EngineConfigsUpdatedContent `json:"content"`
}

type AgentProfilesUpdatedContent struct {
	Profiles []agentprofiles.Profile `json:"profiles"`
}

type AgentProfilesUpdatedMessage struct {
	MessageType WebsocketMessageType        `json:"messageType"`
	Content     AgentProfilesUpdatedContent `json:"content"`
}

type PromptTemplatesUpdatedContent struct {
	Templates []prompttemplates.Template `json:"templates"`
}

type PromptTemplatesUpdatedMessage struct {
	MessageType WebsocketMessageType          `json:"messageType"`
	Content     PromptTemplatesUpdatedContent `json:"content"`
}

type TranscriptionProfilesUpdatedContent struct {
	Profiles []transcriptionprofiles.Profile `json:"profiles"`
}

type TranscriptionProfilesUpdatedMessage struct {
	MessageType WebsocketMessageType                `json:"messageType"`
	Content     TranscriptionProfilesUpdatedContent `json:"content"`
}

type AgentRunUpdatedMessage struct {
	ID          *string              `json:"id"`
	MessageType WebsocketMessageType `json:"messageType"`
	Content     agentruns.Run        `json:"content"`
}

type UpdateArtifactsContent struct {
	Artifacts  []any  `json:"artifacts" ts_type:"Array<ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact>"`
	UpdateType string `json:"updateType" ts_type:"\"update\" | \"delete\""`
}

type UpdateArtifactsMessage struct {
	ID          *string                `json:"id"`
	MessageType WebsocketMessageType   `json:"messageType"`
	Content     UpdateArtifactsContent `json:"content"`
}

type ProjectStateUpdateContent struct {
	ProjectState   projectview.SingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

type ProjectStateUpdateMessage struct {
	ID          *string                   `json:"id"`
	MessageType WebsocketMessageType      `json:"messageType"`
	Content     ProjectStateUpdateContent `json:"content"`
}

type SettingsUpdateMessage struct {
	MessageType WebsocketMessageType   `json:"messageType"`
	Content     settingsstate.Document `json:"content"`
}

type RenameReferenceDependencyKey struct {
	Type      string `json:"type"`
	SectionID string `json:"sectionId"`
	CodeObjID string `json:"codeObjId,omitempty"`
}

type RenameReferenceChangedValue struct {
	DepKey   RenameReferenceDependencyKey `json:"depKey"`
	NewValue string                       `json:"newValue"`
}

type RenameRefactorBroadcastContent struct {
	ProjectConfigID   string                          `json:"projectConfigId"`
	FrontendOpID      string                          `json:"frontendOpId"`
	RenameMode        projectstate.RenameRefactorMode `json:"renameMode"`
	ChangedNodeValues []RenameReferenceChangedValue   `json:"changedNodeValues"`
}

type RenameRefactorResultsMessage struct {
	ID          *string                        `json:"id"`
	MessageType WebsocketMessageType           `json:"messageType"`
	Content     RenameRefactorBroadcastContent `json:"content"`
}

func NewFrontendIdentityMessage(frontendAffinityToken string) FrontendIdentityMessage {
	return FrontendIdentityMessage{
		MessageType: WebsocketMessageTypeFrontendIdentity,
		Content: FrontendIdentityContent{
			FrontendAffinityToken: frontendAffinityToken,
		},
	}
}

func NewListenerCoverageSnapshotMessage(content ListenerCoverageSnapshot) ListenerCoverageSnapshotMessage {
	return ListenerCoverageSnapshotMessage{
		MessageType: WebsocketMessageTypeListenerCoverageSnapshot,
		Content: ListenerCoverageSnapshot{
			ProjectID:           content.ProjectID,
			Dependencies:        append([]ListenerCoverageDependency(nil), content.Dependencies...),
			HasRealtimeWildcard: content.HasRealtimeWildcard,
		},
	}
}

func NewUpdateArtifactsMessage(content UpdateArtifactsContent) UpdateArtifactsMessage {
	return UpdateArtifactsMessage{
		MessageType: WebsocketMessageTypeUpdateArtifacts,
		Content:     content,
	}
}

func NewLLMStreamingResponseMessage(content LLMStreamingResponseContent) LLMStreamingResponseMessage {
	return LLMStreamingResponseMessage{
		MessageType: WebsocketMessageTypeLLMStreamingResponse,
		Content:     content,
	}
}

func NewAIFollowToolArgumentsUpdateMessage(content AIFollowToolArgumentsUpdateContent) AIFollowToolArgumentsUpdateMessage {
	return AIFollowToolArgumentsUpdateMessage{
		MessageType: WebsocketMessageTypeAIFollowToolArgumentsUpdate,
		Content:     content,
	}
}

func NewAIFollowToolResultUpdateMessage(content AIFollowToolResultUpdateContent) AIFollowToolResultUpdateMessage {
	return AIFollowToolResultUpdateMessage{
		MessageType: WebsocketMessageTypeAIFollowToolResultUpdate,
		Content:     content,
	}
}

func NewUISettingRevealMessage(content UISettingRevealContent) UISettingRevealMessage {
	return UISettingRevealMessage{
		MessageType: WebsocketMessageTypeUISettingReveal,
		Content:     content,
	}
}

func NewUISettingRevealResultMessage(content UISettingRevealResultContent) UISettingRevealResultMessage {
	return UISettingRevealResultMessage{
		MessageType: MessageTypeUISettingRevealResult,
		Content:     content,
	}
}

func NewNotificationMessage(content NotificationContent) NotificationMessage {
	return NotificationMessage{
		MessageType: WebsocketMessageTypeNotification,
		Content:     content,
	}
}

func NewAllProjectMetadataMessage(content AllProjectMetadataContent) AllProjectMetadataMessage {
	return AllProjectMetadataMessage{
		MessageType: WebsocketMessageTypeAllProjectMetadata,
		Content:     content,
	}
}

func NewAllConnectionsMessage(connections []Connection) AllConnectionsMessage {
	return AllConnectionsMessage{
		MessageType: WebsocketMessageTypeAllConnections,
		Content:     connections,
	}
}

func NewLSPDiagnosticsMessage(content projectstate.LSPDiagnosticsPayload) LSPDiagnosticsMessage {
	return LSPDiagnosticsMessage{
		MessageType: WebsocketMessageTypeLSPDiagnostics,
		Content:     content,
	}
}

func NewNameValidationErrorsMessage(content projectstate.NameValidationErrors) NameValidationErrorsMessage {
	return NameValidationErrorsMessage{
		MessageType: WebsocketMessageTypeNameValidationErrors,
		Content:     content,
	}
}

func NewLLMConfigUpdatedMessage(content llmconfig.AllConfigs) LLMConfigUpdatedMessage {
	return LLMConfigUpdatedMessage{
		MessageType: WebsocketMessageTypeLLMConfigUpdated,
		Content:     content,
	}
}

func NewLLMAPIKeysUpdatedMessage(content llmconfig.ManagedAPIKeysSnapshot) LLMAPIKeysUpdatedMessage {
	return LLMAPIKeysUpdatedMessage{
		MessageType: WebsocketMessageTypeLLMAPIKeysUpdated,
		Content:     content,
	}
}

func NewExternalAgentConfigsUpdatedMessage(content []externalagentconfigs.Config) ExternalAgentConfigsUpdatedMessage {
	configs := append([]externalagentconfigs.Config(nil), content...)
	if configs == nil {
		configs = []externalagentconfigs.Config{}
	}
	return ExternalAgentConfigsUpdatedMessage{
		MessageType: WebsocketMessageTypeExternalAgentConfigsUpdated,
		Content: ExternalAgentConfigsUpdatedContent{
			Configs: configs,
		},
	}
}

func NewEngineConfigsUpdatedMessage(content []agentruns.EngineConfig) EngineConfigsUpdatedMessage {
	configs := append([]agentruns.EngineConfig(nil), content...)
	if configs == nil {
		configs = []agentruns.EngineConfig{}
	}
	return EngineConfigsUpdatedMessage{
		MessageType: WebsocketMessageTypeEngineConfigsUpdated,
		Content: EngineConfigsUpdatedContent{
			Configs: configs,
		},
	}
}

func NewAgentProfilesUpdatedMessage(content []agentprofiles.Profile) AgentProfilesUpdatedMessage {
	profiles := append([]agentprofiles.Profile(nil), content...)
	if profiles == nil {
		profiles = []agentprofiles.Profile{}
	}
	return AgentProfilesUpdatedMessage{
		MessageType: WebsocketMessageTypeAgentProfilesUpdated,
		Content: AgentProfilesUpdatedContent{
			Profiles: profiles,
		},
	}
}

func NewPromptTemplatesUpdatedMessage(content []prompttemplates.Template) PromptTemplatesUpdatedMessage {
	templates := append([]prompttemplates.Template(nil), content...)
	if templates == nil {
		templates = []prompttemplates.Template{}
	}
	return PromptTemplatesUpdatedMessage{
		MessageType: WebsocketMessageTypePromptTemplatesUpdated,
		Content: PromptTemplatesUpdatedContent{
			Templates: templates,
		},
	}
}

func NewTranscriptionProfilesUpdatedMessage(content []transcriptionprofiles.Profile) TranscriptionProfilesUpdatedMessage {
	profiles := append([]transcriptionprofiles.Profile(nil), content...)
	if profiles == nil {
		profiles = []transcriptionprofiles.Profile{}
	}
	return TranscriptionProfilesUpdatedMessage{
		MessageType: WebsocketMessageTypeTranscriptionProfilesUpdated,
		Content: TranscriptionProfilesUpdatedContent{
			Profiles: profiles,
		},
	}
}

func NewAgentRunUpdatedMessage(content agentruns.Run) AgentRunUpdatedMessage {
	return AgentRunUpdatedMessage{
		MessageType: WebsocketMessageTypeAgentRunUpdated,
		Content:     content.Clone(),
	}
}

func NewProjectStateUpdateMessage(content ProjectStateUpdateContent) ProjectStateUpdateMessage {
	return ProjectStateUpdateMessage{
		MessageType: WebsocketMessageTypeUpdateFrontendProjectState,
		Content:     content,
	}
}

func NewSettingsUpdateMessage(content settingsstate.Document) SettingsUpdateMessage {
	return SettingsUpdateMessage{
		MessageType: WebsocketMessageTypeUpdateSettings,
		Content:     content.Clone(),
	}
}

func NewRenameRefactorResultsMessage(content RenameRefactorBroadcastContent) RenameRefactorResultsMessage {
	return RenameRefactorResultsMessage{
		MessageType: WebsocketMessageTypeReturnRenameRefactorResults,
		Content:     content,
	}
}

func NewRenameReferenceDependencyKey(sectionID string, codeObjID string) RenameReferenceDependencyKey {
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return RenameReferenceDependencyKey{
			Type:      "Section",
			SectionID: strings.TrimSpace(sectionID),
		}
	}
	return RenameReferenceDependencyKey{
		Type:      "SectionParam",
		SectionID: strings.TrimSpace(sectionID),
		CodeObjID: trimmedCodeObjID,
	}
}
