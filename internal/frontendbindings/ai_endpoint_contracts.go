package frontendbindings

import "setta/internal/notifications"

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

type ManagedAPIKeysSnapshot struct {
	APIKeys   APIKeys `json:"apiKeys"`
	Revision  int     `json:"revision"`
	Corrupt   bool    `json:"corrupt"`
	ErrorCode *string `json:"errorCode,omitempty"`
	Message   *string `json:"message,omitempty"`
}

type SetLLMAPIKeysRequestInput struct {
	APIKeys          APIKeys `json:"apiKeys"`
	ExpectedRevision int     `json:"expectedRevision"`
}

type CreateAgentProfileRequestInput struct {
	Name                        *string  `json:"name,omitempty"`
	Description                 *string  `json:"description,omitempty"`
	SystemPrompt                *string  `json:"systemPrompt,omitempty"`
	EnableBackgroundSummaryFill *bool    `json:"enableBackgroundSummaryFill,omitempty"`
	EnableLlmChatTitles         *bool    `json:"enableLlmChatTitles,omitempty"`
	EngineConfigID              *string  `json:"engineConfigId,omitempty"`
	ToolAllowlist               []string `json:"toolAllowlist"`
	MemoryScope                 *string  `json:"memoryScope,omitempty"`
}

type GetAgentProfileRequestInput struct {
	ProfileID string `json:"profileId"`
}

type DeleteAgentProfileRequestInput struct {
	ProfileID string `json:"profileId"`
}

type PromptTemplateListResponse []PromptTemplate

type GetPromptTemplateRequestInput struct {
	TemplateID string `json:"templateId"`
}

type CreatePromptTemplateRequestInput struct {
	Name        *string        `json:"name,omitempty"`
	Description *string        `json:"description,omitempty"`
	Template    *string        `json:"template,omitempty"`
	Format      *PromptFormat  `json:"format,omitempty"`
	InputSchema map[string]any `json:"inputSchema"`
	Metadata    map[string]any `json:"metadata"`
}

type UpdatePromptTemplateRequestInput struct {
	Template PromptTemplate `json:"template"`
}

type DeletePromptTemplateRequestInput struct {
	TemplateID string `json:"templateId"`
}

type ExternalAgentConfigListResponse []ExternalAgentConfig

type ExternalAgentPreflightStatusListResponse []ExternalAgentPreflightStatus

type GetExternalAgentConfigRequestInput struct {
	ConfigID string `json:"configId"`
}

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

type DeleteExternalAgentConfigRequestInput struct {
	ConfigID string `json:"configId"`
}

type DeleteTranscriptionProfileRequestInput struct {
	ProfileID string `json:"profileId"`
}

type GetLLMResponseResponse string

type StopLLMChatResponse struct {
	AlreadyStopped   bool    `json:"alreadyStopped"`
	StoppedRunID     *string `json:"stoppedRunId,omitempty"`
	StoppedMessageID *string `json:"stoppedMessageId,omitempty"`
}

type TranscriptionSessionDeltaResponse struct {
	AppendText string `json:"appendText"`
	FullText   string `json:"fullText"`
	IsFinal    bool   `json:"isFinal"`
}

type AgentProfileResponse struct{}

type AgentProfileListResponse struct{}

type AgentRunResponse struct{}

type AgentRunListResponse struct{}

type GetAgentRunRequestInput struct {
	RunID string `json:"runId"`
}

type StartAgentRunRequestInput struct {
	ProfileID string         `json:"profileId"`
	Inputs    map[string]any `json:"inputs"`
}

type StopAgentRunRequestInput struct {
	RunID string `json:"runId"`
}

type StartStateMachineRunRequestInput struct {
	ProjectConfigID string  `json:"projectConfigId"`
	MachineGroupID  string  `json:"machineGroupId"`
	StartSectionID  *string `json:"startSectionId,omitempty"`
}

type StopStateMachineRunRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	MachineGroupID  string `json:"machineGroupId"`
}

type ResetStateMachineRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	MachineGroupID  string `json:"machineGroupId"`
}

type GetStateMachineRunRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	MachineGroupID  string `json:"machineGroupId"`
}

type StateMachineRunControlResponse struct {
	AlreadyStopped bool    `json:"alreadyStopped"`
	StoppedRunID   *string `json:"stoppedRunId,omitempty"`
}

type RunDetachedRequestInput struct {
	ProjectID               string            `json:"projectConfigId"`
	EntrySectionID          string            `json:"entrySectionId"`
	RunSnapshotMode         RunSnapshotMode   `json:"runSnapshotMode"`
	SectionVariantOverrides map[string]string `json:"sectionVariantOverrides"`
	ParamOverrides          map[string]string `json:"paramOverrides"`
	Tags                    map[string]string `json:"tags"`
}

type RunDetachedResponse struct {
	RunID  string            `json:"runId"`
	Status DetachedRunStatus `json:"status"`
}

type GetRunStatusRequestInput struct {
	RunID string `json:"runId"`
}

type CancelRunRequestInput struct {
	RunID string `json:"runId"`
}

type RunChainStepInput struct {
	ID                     string           `json:"id"`
	Name                   string           `json:"name"`
	EngineConfigID         string           `json:"engineConfigId"`
	AgentProfileID         *string          `json:"agentProfileId,omitempty"`
	Prompt                 *string          `json:"prompt,omitempty"`
	Messages               []map[string]any `json:"messages,omitempty"`
	Inputs                 map[string]any   `json:"inputs,omitempty"`
	IncludePreviousOutputs *bool            `json:"includePreviousOutputs,omitempty"`
}

type RunChainSpecInput struct {
	ID            string              `json:"id"`
	Name          string              `json:"name"`
	Steps         []RunChainStepInput `json:"steps"`
	StopOnFailure *bool               `json:"stopOnFailure,omitempty"`
}

type StartRunChainRequestInput struct {
	Spec   RunChainSpecInput `json:"spec"`
	Inputs map[string]any    `json:"inputs"`
}

type StopRunChainRequestInput struct {
	RunID string `json:"runId"`
}

type EngineConfigResponse struct{}

type EngineConfigListResponse struct{}

type GetEngineConfigRequestInput struct {
	ConfigID string `json:"configId"`
}

type CreateEngineConfigRequestInput struct {
	Name                  *string               `json:"name,omitempty"`
	EngineType            *EngineType           `json:"engineType,omitempty"`
	SettaLLMConfigID      *string               `json:"settaLlmConfigId,omitempty"`
	ExternalAgentConfigID *string               `json:"externalAgentConfigId,omitempty"`
	Defaults              *EngineConfigDefaults `json:"defaults,omitempty"`
}

type DeleteEngineConfigRequestInput struct {
	ConfigID string `json:"configId"`
}

type TranscriptionProfileResponse struct{}

type TranscriptionProfileListResponse struct{}

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

type SetChatSectionStateRequestInput struct {
	FrontendOpID    *string          `json:"frontendOpId,omitempty"`
	ProjectConfigID string           `json:"projectConfigId"`
	SectionID       string           `json:"sectionId"`
	State           ChatSectionState `json:"state"`
}

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
