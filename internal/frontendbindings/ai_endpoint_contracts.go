package frontendbindings

import (
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/notifications"
	"setta/internal/runchains"
)

type SettaNotificationType string

const (
	SettaNotificationTypeError   SettaNotificationType = SettaNotificationType(notifications.TypeError)
	SettaNotificationTypeWarning SettaNotificationType = SettaNotificationType(notifications.TypeWarning)
	SettaNotificationTypeInfo    SettaNotificationType = SettaNotificationType(notifications.TypeInfo)
	SettaNotificationTypeSave    SettaNotificationType = SettaNotificationType(notifications.TypeSave)
)

type SettaNotification struct {
	ID              string                `json:"id"`
	ProjectConfigID string                `json:"projectConfigId"`
	Type            SettaNotificationType `json:"type"`
	Message         string                `json:"message"`
	Temporary       bool                  `json:"temporary"`
	Timestamp       string                `json:"timestamp"`
	Metadata        map[string]any        `json:"metadata"`
	ReadStatus      bool                  `json:"read_status"`
}

type ChatContextUsage struct {
	ContextWindowTokens *int `json:"contextWindowTokens,omitempty"`
	ContextUsedTokens   *int `json:"contextUsedTokens,omitempty"`
	Estimated           bool `json:"estimated"`
}

type ManagedAPIKeysSnapshot llmconfig.ManagedAPIKeysSnapshot

type SetLLMAPIKeysRequestInput struct {
	APIKeys          APIKeys `json:"apiKeys"`
	ExpectedRevision int     `json:"expectedRevision"`
}

type CreateAgentProfileRequestInput httpapi.CreateAgentProfileRequest

type GetAgentProfileRequestInput httpapi.GetAgentProfileRequest

type DeleteAgentProfileRequestInput httpapi.DeleteAgentProfileRequest

type PromptTemplateListResponse []PromptTemplate

type GetPromptTemplateRequestInput httpapi.GetPromptTemplateRequest

type CreatePromptTemplateRequestInput httpapi.CreatePromptTemplateRequest

type UpdatePromptTemplateRequestInput struct {
	Template PromptTemplate `json:"template"`
}

type DeletePromptTemplateRequestInput httpapi.DeletePromptTemplateRequest

type ExternalAgentConfigListResponse []ExternalAgentConfig

type ExternalAgentPreflightStatusListResponse []ExternalAgentPreflightStatus

type GetExternalAgentConfigRequestInput httpapi.GetExternalAgentConfigRequest

type CreateExternalAgentConfigRequestInput struct {
	Name                    *string                            `json:"name,omitempty"`
	Description             *string                            `json:"description,omitempty"`
	ToolType                *ExternalAgentToolType             `json:"toolType,omitempty"`
	RunMode                 *ExternalAgentRunMode              `json:"runMode,omitempty"`
	CommandPath             *string                            `json:"commandPath,omitempty"`
	BaseURL                 *string                            `json:"baseUrl,omitempty"`
	DefaultModel            *string                            `json:"defaultModel,omitempty"`
	SandboxPolicy           *string                            `json:"sandboxPolicy,omitempty"`
	ApprovalPolicy          *string                            `json:"approvalPolicy,omitempty"`
	SettingsMode            *ExternalAgentSettingsMode         `json:"settingsMode,omitempty"`
	SettingsSources         *[]ClaudeSettingsSource            `json:"settingsSources,omitempty"`
	SettingsFilePath        *string                            `json:"settingsFilePath,omitempty"`
	SettingsManagedBlock    *ExternalAgentSettingsManagedBlock `json:"settingsManagedBlock,omitempty"`
	SettingsAllowSettaEdits *bool                              `json:"settingsAllowSettaEdits,omitempty"`
	EnvVarWhitelist         []string                           `json:"envVarWhitelist"`
	WorkingDirStrategy      *ExternalAgentWorkingDirStrategy   `json:"workingDirStrategy,omitempty"`
	WorkingDir              *string                            `json:"workingDir,omitempty"`
	CodexSkipGitRepoCheck   *bool                              `json:"codexSkipGitRepoCheck,omitempty"`
}

type UpdateExternalAgentConfigRequestInput struct {
	Config ExternalAgentConfig `json:"config"`
}

type DeleteExternalAgentConfigRequestInput httpapi.DeleteExternalAgentConfigRequest

type DeleteTranscriptionProfileRequestInput struct {
	ProfileID string `json:"profileId"`
}

type GetLLMResponseResponse string

type StopLLMChatResponse struct {
	AlreadyStopped   bool    `json:"alreadyStopped"`
	StoppedRunID     *string `json:"stoppedRunId,omitempty"`
	StoppedMessageID *string `json:"stoppedMessageId,omitempty"`
}

type TranscriptionSessionDeltaResponse httpapi.TranscriptionSessionDeltaResponse

type GetAgentRunRequestInput httpapi.GetAgentRunRequest

type StartAgentRunRequestInput httpapi.StartAgentRunRequest

type StopAgentRunRequestInput httpapi.StopAgentRunRequest

type StartStateMachineRunRequestInput httpapi.StartStateMachineRunRequest

type StopStateMachineRunRequestInput httpapi.StopStateMachineRunRequest

type ResetStateMachineRequestInput httpapi.ResetStateMachineRequest

type GetStateMachineRunRequestInput httpapi.GetStateMachineRunRequest

type StateMachineRunControlResponse httpapi.StateMachineRunControlResponse

type RunDetachedRequestInput httpapi.RunDetachedRequest

type RunDetachedResponse httpapi.RunDetachedResponse

type GetRunStatusRequestInput httpapi.GetRunStatusRequest

type CancelRunRequestInput httpapi.CancelRunRequest

type GetRunnerSummaryRequestInput httpapi.GetRunnerSummaryRequest

type RunChainStepInput runchains.StepInput

type RunChainSpecInput runchains.SpecInput

type StartRunChainRequestInput httpapi.StartRunChainRequest

type StopRunChainRequestInput httpapi.StopRunChainRequest

type GetEngineConfigRequestInput httpapi.GetEngineConfigRequest

type CreateEngineConfigRequestInput httpapi.CreateEngineConfigRequest

type DeleteEngineConfigRequestInput httpapi.DeleteEngineConfigRequest

type UpdateAgentProfileRequestInput struct {
	Profile AgentProfile `json:"profile"`
}

type UpdateEngineConfigRequestInput struct {
	Config EngineConfig `json:"config"`
}

type CreateTranscriptionProfileRequestInput struct {
	Name                     string                     `json:"name"`
	TranscriptionLlmConfigID string                     `json:"transcriptionLlmConfigId"`
	TransportMode            TranscriptionTransportMode `json:"transportMode"`
	ChunkMS                  int                        `json:"chunkMs"`
	Language                 *string                    `json:"language,omitempty"`
}

type UpdateTranscriptionProfileRequestInput struct {
	Profile TranscriptionProfile `json:"profile"`
}

type SetChatSectionStateRequestInput httpapi.SetChatSectionStateRequest

type GetChatSectionChatIDResponse string

type GetLLMChatResponse struct {
	Messages           []BaseChatMessageUnion `json:"messages"`
	WaitingForResponse bool                   `json:"waitingForResponse"`
	LLMConfig          *LLMConfig             `json:"llmConfig,omitempty"`
	ContextUsage       *ChatContextUsage      `json:"contextUsage,omitempty"`
}

type ExternalAgentChatResponse struct {
	Messages           []BaseChatMessageUnion `json:"messages"`
	WaitingForResponse bool                   `json:"waitingForResponse"`
	ToolCallArguments  map[string]string      `json:"toolCallArguments"`
	ContextUsage       *ChatContextUsage      `json:"contextUsage,omitempty"`
}
