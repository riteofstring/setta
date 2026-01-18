from enum import Enum

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
