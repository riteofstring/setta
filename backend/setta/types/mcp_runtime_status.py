from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from setta.types.id import ID


class MCPServerRuntimeState(str, Enum):
    connected = "connected"
    connecting = "connecting"
    retrying = "retrying"
    error = "error"
    disabled = "disabled"
    unknown = "unknown"


class MCPServerRuntimeStatus(BaseModel):
    serverId: str
    source: str = "setta_mcp"
    transport: str
    endpoint: str
    state: MCPServerRuntimeState = MCPServerRuntimeState.unknown
    lastAttemptAt: datetime | None = None
    lastConnectedAt: datetime | None = None
    lastFailureAt: datetime | None = None
    consecutiveFailures: int = 0
    lastError: str | None = None
    missingEnvVar: str | None = None
    toolCount: int = 0

    model_config = ConfigDict(extra="forbid")


class GetMCPServerRuntimeStatusRequest(BaseModel):
    chatId: ID | None = None
    engineConfigId: ID | None = None

    model_config = ConfigDict(extra="forbid")


class MCPServerRuntimeStatusResponse(BaseModel):
    llmConfigPath: str
    activeSettaFilesLocation: str | None
    servers: list[MCPServerRuntimeStatus] = Field(default_factory=list)
    externalServers: list[MCPServerRuntimeStatus] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
