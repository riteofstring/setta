package frontendbindings

import (
	"setta/internal/externalagentconfigs"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/prompttemplates"
)

type APIKeys map[string]string

type MCPServerTransport llmconfig.Transport

type MCPServerConfig llmconfig.ServerConfig

type LLMConfig llmconfig.Config

type AllLLMConfigs llmconfig.AllConfigs

type PromptFormat prompttemplates.Format

type PromptTemplate prompttemplates.Template

type ExternalAgentToolType externalagentconfigs.ToolType

type ExternalAgentRunMode externalagentconfigs.RunMode

type ExternalAgentSettingsMode externalagentconfigs.SettingsMode

type ExternalAgentWorkingDirStrategy externalagentconfigs.WorkingDirStrategy

type ClaudeSettingsSource externalagentconfigs.ClaudeSettingsSource

type ClaudeSettingsPermissions externalagentconfigs.ClaudeSettingsPermissions

type ClaudeSettingsManaged externalagentconfigs.ClaudeSettingsManaged

type ExternalAgentSettingsManagedBlock externalagentconfigs.SettingsManagedBlock

type ExternalAgentConfig externalagentconfigs.Config

type ExternalAgentEnvVarStatus externalagentconfigs.EnvVarStatus

type ExternalAgentPreflightStatus httpapi.ExternalAgentPreflightStatus
