package frontendbindings

import (
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/prompttemplates"
)

type APIKeys map[string]string

type MCPServerTransport llmconfig.Transport

const (
	MCPServerTransportSSE            MCPServerTransport = MCPServerTransport(llmconfig.TransportSSE)
	MCPServerTransportStreamableHTTP MCPServerTransport = MCPServerTransport(llmconfig.TransportStreamableHTTP)
	MCPServerTransportStdio          MCPServerTransport = MCPServerTransport(llmconfig.TransportStdio)
)

type MCPServerConfig llmconfig.ServerConfig

type LLMConfig llmconfig.Config

type AllLLMConfigs llmconfig.AllConfigs

type PromptFormat prompttemplates.Format

const (
	PromptFormatJinja PromptFormat = PromptFormat(prompttemplates.FormatJinja)
)

type PromptTemplate prompttemplates.Template

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

type ClaudeSettingsSource externalagentconfigs.ClaudeSettingsSource

const (
	ClaudeSettingsSourceUser    ClaudeSettingsSource = ClaudeSettingsSource(externalagentconfigs.ClaudeSettingsSourceUser)
	ClaudeSettingsSourceProject ClaudeSettingsSource = ClaudeSettingsSource(externalagentconfigs.ClaudeSettingsSourceProject)
	ClaudeSettingsSourceLocal   ClaudeSettingsSource = ClaudeSettingsSource(externalagentconfigs.ClaudeSettingsSourceLocal)
)

type ClaudeSettingsPermissions externalagentconfigs.ClaudeSettingsPermissions

type ClaudeSettingsManaged externalagentconfigs.ClaudeSettingsManaged

type OpenCodeSettingsManaged externalagentconfigs.OpenCodeSettingsManaged

type ExternalAgentSettingsManagedBlock externalagentconfigs.SettingsManagedBlock

type ExternalAgentConfig externalagentconfigs.Config

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
