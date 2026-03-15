package realtime

import (
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

type NotificationType string

const (
	NotificationTypeError   NotificationType = "error"
	NotificationTypeWarning NotificationType = "warning"
	NotificationTypeInfo    NotificationType = "info"
	NotificationTypeSave    NotificationType = "save"
)

const (
	StreamingEventTypeMessageStart        = "message_start"
	StreamingEventTypeDelta               = "delta"
	StreamingEventTypeToolCallDelta       = "tool_call_delta"
	StreamingEventTypeToolArgumentPreview = "tool_argument_preview_delta"
	StreamingEventTypeToolResult          = "tool_result"
	StreamingEventTypeMessageStop         = "message_stop"
	StreamingEventTypeMessageFinalized    = "message_finalized"
	MessageContentTypeTextDelta           = "text_delta"
	MessageContentTypeThinkingDelta       = "thinking_delta"
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
	Type  string `json:"type"`
	Index int    `json:"index"`
	Text  string `json:"text"`
}

type MessageThinkingDelta struct {
	Type      string  `json:"type"`
	Index     int     `json:"index"`
	Thinking  string  `json:"thinking"`
	Summary   *string `json:"summary"`
	Signature *string `json:"signature"`
}

type MessageStartEvent struct {
	Type    string         `json:"type"`
	Message map[string]any `json:"message"`
}

type MessageDeltaEvent struct {
	Type      string `json:"type"`
	MessageID string `json:"message_id"`
	Content   []any  `json:"content"`
}

type ToolCallDeltaEvent struct {
	Type           string  `json:"type"`
	MessageID      string  `json:"message_id"`
	ToolCallID     string  `json:"tool_call_id"`
	ArgumentsDelta string  `json:"arguments_delta"`
	ToolName       *string `json:"tool_name"`
}

type ToolResultEvent struct {
	Type   string         `json:"type"`
	Result map[string]any `json:"result"`
}

type ToolArgumentPreviewDeltaEvent struct {
	Type              string              `json:"type"`
	MessageID         string              `json:"message_id"`
	ToolCallID        string              `json:"tool_call_id"`
	ToolName          string              `json:"tool_name"`
	ArgumentsDelta    string              `json:"arguments_delta"`
	PreviewKind       string              `json:"preview_kind"`
	TargetIDsByType   map[string][]string `json:"target_ids_by_type"`
	PreviewValueDelta string              `json:"preview_value_delta"`
}

type MessageStopEvent struct {
	Type      string `json:"type"`
	MessageID string `json:"message_id"`
}

type MessageFinalizedEvent struct {
	Type    string         `json:"type"`
	Message map[string]any `json:"message"`
}

type LLMStreamingResponseContent struct {
	ChatID          string  `json:"chatId"`
	Chunk           any     `json:"chunk"`
	SectionID       *string `json:"sectionId"`
	ProjectConfigID *string `json:"projectConfigId"`
}

type LLMStreamingResponseMessage struct {
	ID          *string                     `json:"id"`
	MessageType string                      `json:"messageType"`
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
	RevealActivationSteps []UISettingRevealActivationStep `json:"revealActivationSteps,omitempty"`
}

type UISettingRevealContent struct {
	ProjectConfigID string                  `json:"projectConfigId"`
	ChatID          *string                 `json:"chatId,omitempty"`
	ActiveSectionID *string                 `json:"activeSectionId,omitempty"`
	Reveals         []UISettingRevealTarget `json:"reveals"`
	DurationMS      int                     `json:"durationMs"`
	RequestID       string                  `json:"requestId"`
}

type UISettingRevealMessage struct {
	ID          *string                `json:"id"`
	MessageType string                 `json:"messageType"`
	Content     UISettingRevealContent `json:"content"`
}

type UISettingRevealResultStatus struct {
	SettingID    string  `json:"settingId"`
	Status       string  `json:"status"`
	ErrorCode    *string `json:"errorCode"`
	ErrorMessage *string `json:"errorMessage"`
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
	ID          *string             `json:"id"`
	MessageType string              `json:"messageType"`
	Content     NotificationContent `json:"content"`
}

type AllProjectMetadataContent struct {
	DefaultProjectConfigID *string                              `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
}

type AllProjectMetadataMessage struct {
	ID          *string                   `json:"id"`
	MessageType string                    `json:"messageType"`
	Content     AllProjectMetadataContent `json:"content"`
}

type FrontendIdentityMessage struct {
	MessageType string                  `json:"messageType"`
	Content     FrontendIdentityContent `json:"content"`
}

type ListenerCoverageSnapshotMessage struct {
	MessageType string                   `json:"messageType"`
	Content     ListenerCoverageSnapshot `json:"content"`
}

type LLMStreamingResponseEnvelope = LLMStreamingResponseMessage

type AIFollowToolArgumentsUpdateMessage struct {
	MessageType string                             `json:"messageType"`
	Content     AIFollowToolArgumentsUpdateContent `json:"content"`
}

type AIFollowToolResultUpdateMessage struct {
	MessageType string                          `json:"messageType"`
	Content     AIFollowToolResultUpdateContent `json:"content"`
}

type UISettingRevealResultMessage struct {
	ID          *string                      `json:"id"`
	MessageType string                       `json:"messageType"`
	Content     UISettingRevealResultContent `json:"content"`
}

type AllConnectionsMessage struct {
	MessageType string       `json:"messageType"`
	Content     []Connection `json:"content"`
}

type LSPDiagnosticsMessage struct {
	MessageType string                             `json:"messageType"`
	Content     projectstate.LSPDiagnosticsPayload `json:"content"`
}

type NameValidationErrorsMessage struct {
	MessageType string                            `json:"messageType"`
	Content     projectstate.NameValidationErrors `json:"content"`
}

type LLMConfigUpdatedMessage struct {
	MessageType string               `json:"messageType"`
	Content     llmconfig.AllConfigs `json:"content"`
}

type LLMAPIKeysUpdatedMessage struct {
	MessageType string                           `json:"messageType"`
	Content     llmconfig.ManagedAPIKeysSnapshot `json:"content"`
}

type ExternalAgentConfigsUpdatedContent struct {
	Configs []externalagentconfigs.Config `json:"configs"`
}

type ExternalAgentConfigsUpdatedMessage struct {
	MessageType string                             `json:"messageType"`
	Content     ExternalAgentConfigsUpdatedContent `json:"content"`
}

type EngineConfigsUpdatedContent struct {
	Configs []agentruns.EngineConfig `json:"configs"`
}

type EngineConfigsUpdatedMessage struct {
	MessageType string                      `json:"messageType"`
	Content     EngineConfigsUpdatedContent `json:"content"`
}

type AgentProfilesUpdatedContent struct {
	Profiles []agentprofiles.Profile `json:"profiles"`
}

type AgentProfilesUpdatedMessage struct {
	MessageType string                      `json:"messageType"`
	Content     AgentProfilesUpdatedContent `json:"content"`
}

type PromptTemplatesUpdatedContent struct {
	Templates []prompttemplates.Template `json:"templates"`
}

type PromptTemplatesUpdatedMessage struct {
	MessageType string                        `json:"messageType"`
	Content     PromptTemplatesUpdatedContent `json:"content"`
}

type TranscriptionProfilesUpdatedContent struct {
	Profiles []transcriptionprofiles.Profile `json:"profiles"`
}

type TranscriptionProfilesUpdatedMessage struct {
	MessageType string                              `json:"messageType"`
	Content     TranscriptionProfilesUpdatedContent `json:"content"`
}

type AgentRunUpdatedMessage struct {
	ID          *string       `json:"id"`
	MessageType string        `json:"messageType"`
	Content     agentruns.Run `json:"content"`
}

type UpdateArtifactsContent struct {
	Artifacts  []any  `json:"artifacts"`
	UpdateType string `json:"updateType"`
}

type UpdateArtifactsMessage struct {
	ID          *string                `json:"id"`
	MessageType string                 `json:"messageType"`
	Content     UpdateArtifactsContent `json:"content"`
}

type ProjectStateUpdateContent struct {
	ProjectState   projectview.SingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

type ProjectStateUpdateMessage struct {
	ID          *string                   `json:"id"`
	MessageType string                    `json:"messageType"`
	Content     ProjectStateUpdateContent `json:"content"`
}

type SettingsUpdateMessage struct {
	MessageType string                 `json:"messageType"`
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
	MessageType string                         `json:"messageType"`
	Content     RenameRefactorBroadcastContent `json:"content"`
}

func NewFrontendIdentityMessage(frontendAffinityToken string) FrontendIdentityMessage {
	return FrontendIdentityMessage{
		MessageType: MessageTypeFrontendIdentity,
		Content: FrontendIdentityContent{
			FrontendAffinityToken: frontendAffinityToken,
		},
	}
}

func NewListenerCoverageSnapshotMessage(content ListenerCoverageSnapshot) ListenerCoverageSnapshotMessage {
	return ListenerCoverageSnapshotMessage{
		MessageType: MessageTypeListenerCoverageSnapshot,
		Content: ListenerCoverageSnapshot{
			ProjectID:           content.ProjectID,
			Dependencies:        append([]ListenerCoverageDependency(nil), content.Dependencies...),
			HasRealtimeWildcard: content.HasRealtimeWildcard,
		},
	}
}

func NewUpdateArtifactsMessage(content UpdateArtifactsContent) UpdateArtifactsMessage {
	return UpdateArtifactsMessage{
		MessageType: MessageTypeUpdateArtifacts,
		Content:     content,
	}
}

func NewLLMStreamingResponseMessage(content LLMStreamingResponseContent) LLMStreamingResponseMessage {
	return LLMStreamingResponseMessage{
		MessageType: MessageTypeLLMStreamingResponse,
		Content:     content,
	}
}

func NewAIFollowToolArgumentsUpdateMessage(content AIFollowToolArgumentsUpdateContent) AIFollowToolArgumentsUpdateMessage {
	return AIFollowToolArgumentsUpdateMessage{
		MessageType: MessageTypeAIFollowToolArgumentsUpdate,
		Content:     content,
	}
}

func NewAIFollowToolResultUpdateMessage(content AIFollowToolResultUpdateContent) AIFollowToolResultUpdateMessage {
	return AIFollowToolResultUpdateMessage{
		MessageType: MessageTypeAIFollowToolResultUpdate,
		Content:     content,
	}
}

func NewUISettingRevealMessage(content UISettingRevealContent) UISettingRevealMessage {
	return UISettingRevealMessage{
		MessageType: MessageTypeUISettingReveal,
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
		MessageType: MessageTypeNotification,
		Content:     content,
	}
}

func NewAllProjectMetadataMessage(content AllProjectMetadataContent) AllProjectMetadataMessage {
	return AllProjectMetadataMessage{
		MessageType: MessageTypeAllProjectMetadata,
		Content:     content,
	}
}

func NewAllConnectionsMessage(connections []Connection) AllConnectionsMessage {
	return AllConnectionsMessage{
		MessageType: MessageTypeAllConnections,
		Content:     connections,
	}
}

func NewLSPDiagnosticsMessage(content projectstate.LSPDiagnosticsPayload) LSPDiagnosticsMessage {
	return LSPDiagnosticsMessage{
		MessageType: MessageTypeLSPDiagnostics,
		Content:     content,
	}
}

func NewNameValidationErrorsMessage(content projectstate.NameValidationErrors) NameValidationErrorsMessage {
	return NameValidationErrorsMessage{
		MessageType: MessageTypeNameValidationErrors,
		Content:     content,
	}
}

func NewLLMConfigUpdatedMessage(content llmconfig.AllConfigs) LLMConfigUpdatedMessage {
	return LLMConfigUpdatedMessage{
		MessageType: MessageTypeLLMConfigUpdated,
		Content:     content,
	}
}

func NewLLMAPIKeysUpdatedMessage(content llmconfig.ManagedAPIKeysSnapshot) LLMAPIKeysUpdatedMessage {
	return LLMAPIKeysUpdatedMessage{
		MessageType: MessageTypeLLMAPIKeysUpdated,
		Content:     content,
	}
}

func NewExternalAgentConfigsUpdatedMessage(content []externalagentconfigs.Config) ExternalAgentConfigsUpdatedMessage {
	configs := append([]externalagentconfigs.Config(nil), content...)
	if configs == nil {
		configs = []externalagentconfigs.Config{}
	}
	return ExternalAgentConfigsUpdatedMessage{
		MessageType: MessageTypeExternalAgentConfigsUpdated,
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
		MessageType: MessageTypeEngineConfigsUpdated,
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
		MessageType: MessageTypeAgentProfilesUpdated,
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
		MessageType: MessageTypePromptTemplatesUpdated,
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
		MessageType: MessageTypeTranscriptionProfilesUpdated,
		Content: TranscriptionProfilesUpdatedContent{
			Profiles: profiles,
		},
	}
}

func NewAgentRunUpdatedMessage(content agentruns.Run) AgentRunUpdatedMessage {
	return AgentRunUpdatedMessage{
		MessageType: MessageTypeAgentRunUpdated,
		Content:     content.Clone(),
	}
}

func NewProjectStateUpdateMessage(content ProjectStateUpdateContent) ProjectStateUpdateMessage {
	return ProjectStateUpdateMessage{
		MessageType: MessageTypeUpdateFrontendProjectState,
		Content:     content,
	}
}

func NewSettingsUpdateMessage(content settingsstate.Document) SettingsUpdateMessage {
	return SettingsUpdateMessage{
		MessageType: MessageTypeUpdateSettings,
		Content:     content.Clone(),
	}
}

func NewRenameRefactorResultsMessage(content RenameRefactorBroadcastContent) RenameRefactorResultsMessage {
	return RenameRefactorResultsMessage{
		MessageType: MessageTypeReturnRenameRefactorResults,
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
