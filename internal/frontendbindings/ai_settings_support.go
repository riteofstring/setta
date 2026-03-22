package frontendbindings

import (
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

type APIKeys map[string]string

type MCPServerTransport llmconfig.Transport

const (
	MCPServerTransportSSE            MCPServerTransport = MCPServerTransport(llmconfig.TransportSSE)
	MCPServerTransportStreamableHTTP MCPServerTransport = MCPServerTransport(llmconfig.TransportStreamableHTTP)
	MCPServerTransportStdio          MCPServerTransport = MCPServerTransport(llmconfig.TransportStdio)
)

type MCPServerConfig struct {
	Transport            MCPServerTransport `json:"transport"`
	URL                  *string            `json:"url,omitempty"`
	Command              *string            `json:"command,omitempty"`
	Args                 *[]string          `json:"args,omitempty"`
	Env                  *map[string]string `json:"env,omitempty"`
	HTTPHeaders          *map[string]string `json:"http_headers,omitempty"`
	CWD                  *string            `json:"cwd,omitempty"`
	Encoding             *string            `json:"encoding,omitempty"`
	EncodingErrorHandler *string            `json:"encoding_error_handler,omitempty"`
}

type LLMConfig struct {
	ID           string          `json:"id"`
	Model        string          `json:"model"`
	Provider     *string         `json:"provider,omitempty"`
	BaseURL      *string         `json:"base_url,omitempty"`
	APIKeyEnv    *string         `json:"api_key_env,omitempty"`
	OtherParams  *map[string]any `json:"other_params,omitempty"`
	MCPServerIDs *[]string       `json:"mcpServerIds,omitempty"`
	Temporary    bool            `json:"temporary"`
}

type AllLLMConfigs struct {
	Configs             map[string]LLMConfig       `json:"configs"`
	MCPServers          map[string]MCPServerConfig `json:"mcpServers"`
	DefaultMCPServerIDs []string                   `json:"defaultMcpServerIds"`
	DefaultConfigID     *string                    `json:"default_config_id,omitempty"`
	CodexMCPImportedAt  *string                    `json:"codexMcpImportedAt,omitempty"`
}

type PromptFormat projectstate.PromptFormat

const (
	PromptFormatJinja PromptFormat = PromptFormat(projectstate.PromptFormatJinja)
)

type PromptTemplate struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Template    string         `json:"template"`
	Format      PromptFormat   `json:"format"`
	InputSchema map[string]any `json:"inputSchema"`
	Metadata    map[string]any `json:"metadata"`
}

type ExternalAgentToolType externalagentconfigs.ToolType

const (
	ExternalAgentToolTypeClaudeCode ExternalAgentToolType = ExternalAgentToolType(externalagentconfigs.ToolTypeClaudeCode)
	ExternalAgentToolTypeCodex      ExternalAgentToolType = ExternalAgentToolType(externalagentconfigs.ToolTypeCodex)
	ExternalAgentToolTypeOpenCode   ExternalAgentToolType = ExternalAgentToolType(externalagentconfigs.ToolTypeOpenCode)
)

type ExternalAgentRunMode externalagentconfigs.RunMode

const (
	ExternalAgentRunModeMCP       ExternalAgentRunMode = ExternalAgentRunMode(externalagentconfigs.RunModeMCP)
	ExternalAgentRunModeServer    ExternalAgentRunMode = ExternalAgentRunMode(externalagentconfigs.RunModeServer)
	ExternalAgentRunModeSDK       ExternalAgentRunMode = ExternalAgentRunMode(externalagentconfigs.RunModeSDK)
	ExternalAgentRunModeAppServer ExternalAgentRunMode = ExternalAgentRunMode(externalagentconfigs.RunModeAppServer)
)

type ExternalAgentSettingsMode externalagentconfigs.SettingsMode

const (
	ExternalAgentSettingsModeReadOnly       ExternalAgentSettingsMode = ExternalAgentSettingsMode(externalagentconfigs.SettingsModeReadOnly)
	ExternalAgentSettingsModeManagedLocal   ExternalAgentSettingsMode = ExternalAgentSettingsMode(externalagentconfigs.SettingsModeManagedLocal)
	ExternalAgentSettingsModeManagedProject ExternalAgentSettingsMode = ExternalAgentSettingsMode(externalagentconfigs.SettingsModeManagedProject)
	ExternalAgentSettingsModeExplicitPath   ExternalAgentSettingsMode = ExternalAgentSettingsMode(externalagentconfigs.SettingsModeExplicitPath)
)

type ExternalAgentWorkingDirStrategy externalagentconfigs.WorkingDirStrategy

const (
	ExternalAgentWorkingDirStrategyProjectRoot ExternalAgentWorkingDirStrategy = ExternalAgentWorkingDirStrategy(externalagentconfigs.WorkingDirStrategyProjectRoot)
	ExternalAgentWorkingDirStrategyTempDir     ExternalAgentWorkingDirStrategy = ExternalAgentWorkingDirStrategy(externalagentconfigs.WorkingDirStrategyTempDir)
	ExternalAgentWorkingDirStrategyCustom      ExternalAgentWorkingDirStrategy = ExternalAgentWorkingDirStrategy(externalagentconfigs.WorkingDirStrategyCustom)
)

// Claude settings sources stay as an explicit frontend contract enum even
// though the Go runtime currently stores the values as raw strings.
type ClaudeSettingsSource string

const (
	ClaudeSettingsSourceUser    ClaudeSettingsSource = "user"
	ClaudeSettingsSourceProject ClaudeSettingsSource = "project"
	ClaudeSettingsSourceLocal   ClaudeSettingsSource = "local"
)

type ClaudeSettingsPermissions struct {
	Allow []string `json:"allow"`
	Ask   []string `json:"ask"`
	Deny  []string `json:"deny"`
}

type ClaudeSettingsManaged struct {
	Permissions *ClaudeSettingsPermissions `json:"permissions,omitempty"`
	DefaultMode *string                    `json:"defaultMode,omitempty"`
	MCP         *map[string]any            `json:"mcp,omitempty"`
}

type CodexSettingsManaged struct {
	ApprovalPolicy *string   `json:"approvalPolicy,omitempty"`
	SandboxMode    *string   `json:"sandboxMode,omitempty"`
	EnabledTools   *[]string `json:"enabledTools,omitempty"`
	Model          *string   `json:"model,omitempty"`
}

type OpenCodeSettingsManaged struct {
	Permission any             `json:"permission,omitempty"`
	MCP        *map[string]any `json:"mcp,omitempty"`
	Model      *string         `json:"model,omitempty"`
}

type ExternalAgentSettingsManagedBlock struct {
	Claude   *ClaudeSettingsManaged   `json:"claude,omitempty"`
	Codex    *CodexSettingsManaged    `json:"codex,omitempty"`
	OpenCode *OpenCodeSettingsManaged `json:"opencode,omitempty"`
}

type ExternalAgentConfig struct {
	ID                      string                             `json:"id"`
	Name                    string                             `json:"name"`
	Description             string                             `json:"description"`
	ToolType                ExternalAgentToolType              `json:"toolType"`
	RunMode                 ExternalAgentRunMode               `json:"runMode"`
	CommandPath             *string                            `json:"commandPath,omitempty"`
	BaseURL                 *string                            `json:"baseUrl,omitempty"`
	DefaultModel            *string                            `json:"defaultModel,omitempty"`
	SandboxPolicy           *string                            `json:"sandboxPolicy,omitempty"`
	ApprovalPolicy          *string                            `json:"approvalPolicy,omitempty"`
	SettingsMode            ExternalAgentSettingsMode          `json:"settingsMode"`
	SettingsSources         *[]ClaudeSettingsSource            `json:"settingsSources,omitempty"`
	SettingsFilePath        *string                            `json:"settingsFilePath,omitempty"`
	SettingsManagedBlock    *ExternalAgentSettingsManagedBlock `json:"settingsManagedBlock,omitempty"`
	SettingsAllowSettaEdits bool                               `json:"settingsAllowSettaEdits"`
	EnvVarWhitelist         []string                           `json:"envVarWhitelist"`
	WorkingDirStrategy      ExternalAgentWorkingDirStrategy    `json:"workingDirStrategy"`
	WorkingDir              *string                            `json:"workingDir,omitempty"`
	CodexSkipGitRepoCheck   *bool                              `json:"codexSkipGitRepoCheck,omitempty"`
}

type ExternalAgentEnvVarStatus externalagentconfigs.EnvVarStatus

type ExternalAgentPreflightStatus struct {
	ConfigID    string                    `json:"configId"`
	Name        string                    `json:"name"`
	ToolType    ExternalAgentToolType     `json:"toolType"`
	RunMode     ExternalAgentRunMode      `json:"runMode"`
	Supported   bool                      `json:"supported"`
	Available   bool                      `json:"available"`
	Issues      []string                  `json:"issues"`
	NodePath    *string                   `json:"nodePath,omitempty"`
	NodeVersion *string                   `json:"nodeVersion,omitempty"`
	SDKVersion  *string                   `json:"sdkVersion,omitempty"`
	CLIVersion  *string                   `json:"cliVersion,omitempty"`
	BaseURL     *string                   `json:"baseUrl,omitempty"`
	WorkingDir  *string                   `json:"workingDir,omitempty"`
	EnvVars     ExternalAgentEnvVarStatus `json:"envVars"`
}
