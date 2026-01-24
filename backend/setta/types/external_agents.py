from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.id import ID


class ExternalAgentToolType(str, Enum):
    claude_code = "claude_code"
    codex = "codex"
    opencode = "opencode"


class ExternalAgentRunMode(str, Enum):
    mcp = "mcp"
    server = "server"
    sdk = "sdk"


class ExternalAgentWorkingDirStrategy(str, Enum):
    project_root = "project_root"
    temp_dir = "temp_dir"
    custom = "custom"


class ExternalAgentSettingsMode(str, Enum):
    read_only = "read_only"
    managed_local = "managed_local"
    managed_project = "managed_project"
    explicit_path = "explicit_path"


class ClaudeSettingsSource(str, Enum):
    user = "user"
    project = "project"
    local = "local"


class ClaudeSettingsPermissions(BaseModel, extra="forbid"):
    allow: list[str] = Field(default_factory=list)
    ask: list[str] = Field(default_factory=list)
    deny: list[str] = Field(default_factory=list)


class ClaudeSettingsManaged(BaseModel, extra="forbid"):
    permissions: ClaudeSettingsPermissions | None = None
    defaultMode: str | None = None
    mcp: dict[str, Any] | None = None


class CodexSettingsManaged(BaseModel, extra="forbid"):
    approvalPolicy: str | None = None
    sandboxMode: str | None = None
    enabledTools: list[str] | None = None
    model: str | None = None


class OpenCodeSettingsManaged(BaseModel, extra="forbid"):
    permission: dict[str, str | dict[str, str]] | None = None
    mcp: dict[str, Any] | None = None
    model: str | None = None


class ExternalAgentSettingsManagedBlock(BaseModel, extra="forbid"):
    claude: ClaudeSettingsManaged | None = None
    codex: CodexSettingsManaged | None = None
    opencode: OpenCodeSettingsManaged | None = None


class ExternalAgentConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str
    description: str = ""
    toolType: ExternalAgentToolType
    runMode: ExternalAgentRunMode
    commandPath: str | None = None
    baseUrl: str | None = None
    defaultModel: str | None = None
    sandboxPolicy: str | None = None
    approvalPolicy: str | None = None
    settingsMode: ExternalAgentSettingsMode = ExternalAgentSettingsMode.managed_local
    settingsSources: list[ClaudeSettingsSource] | None = None
    settingsFilePath: str | None = None
    settingsAllowSettaEdits: bool = True
    settingsManagedBlock: ExternalAgentSettingsManagedBlock | None = None
    envVarWhitelist: list[str] = Field(default_factory=list)
    workingDirStrategy: ExternalAgentWorkingDirStrategy = (
        ExternalAgentWorkingDirStrategy.project_root
    )
    workingDir: str | None = None


class ExternalAgentConfigList(BaseModel, extra="forbid"):
    configs: list[ExternalAgentConfig]


class ExternalAgentEnvVarStatus(BaseModel, extra="forbid"):
    present: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


class ExternalAgentPreflightStatus(BaseModel, extra="forbid"):
    configId: ID
    name: str
    toolType: ExternalAgentToolType
    runMode: ExternalAgentRunMode
    supported: bool
    available: bool
    issues: list[str] = Field(default_factory=list)
    nodePath: str | None = None
    nodeVersion: str | None = None
    sdkVersion: str | None = None
    cliVersion: str | None = None
    baseUrl: str | None = None
    workingDir: str | None = None
    envVars: ExternalAgentEnvVarStatus = Field(
        default_factory=ExternalAgentEnvVarStatus
    )
