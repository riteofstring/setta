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

type DeleteAgentProfileRequestInput struct {
	ProfileID string `json:"profileId"`
}

type PromptTemplateListResponse []PromptTemplate

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

type CreateExternalAgentConfigRequestInput struct {
	Name                    *string                            `json:"name,omitempty"`
	Description             *string                            `json:"description,omitempty"`
	ToolType                *ExternalAgentToolType             `json:"toolType,omitempty"`
	PluginAdapterID         *string                            `json:"pluginAdapterId,omitempty"`
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

type EngineConfigResponse struct{}

type EngineConfigListResponse struct{}

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
