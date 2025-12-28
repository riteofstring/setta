from datetime import datetime
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field, field_serializer, field_validator

from setta.types.id import ID
from setta.types.settings_state import RunSnapshotMode
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ListenerIsolationMode(str, Enum):
    per_viewer = "per_viewer"
    shared = "shared"


class ShareDeploymentListenerConfig(BaseModel, extra="forbid"):
    entrypoint: str
    enabled: bool = True
    isolation: ListenerIsolationMode = ListenerIsolationMode.per_viewer


class ShareDeploymentManifest(BaseModel, extra="forbid"):
    version: int
    projectConfigId: ID
    createdAt: datetime = Field(default_factory=get_now_timestamp)
    listener: ShareDeploymentListenerConfig | None = None

    @field_validator("createdAt", mode="before")
    @classmethod
    def parse_created_at(cls, value):
        if isinstance(value, str):
            return parse_timestamp_str(value)
        return value

    @field_serializer("createdAt")
    def serialize_created_at(self, timestamp: datetime):
        return timestamp.isoformat()


class SharePolicy(BaseModel, extra="forbid"):
    allowParamChanges: bool = True
    allowVariantChanges: bool = True
    allowLayoutChanges: bool = True
    allowRun: bool = False
    allowLLM: bool = False
    allowMCP: bool = False
    runSnapshotMode: RunSnapshotMode = RunSnapshotMode.ephemeral
    listenerIsolation: ListenerIsolationMode = ListenerIsolationMode.per_viewer
    allowedSections: list[ID] | None = None


class ShareDeploymentMetadata(BaseModel, extra="forbid"):
    deploymentId: str
    deploymentRoot: Path
    sharePolicyPath: Path


class ShareDeploymentSessionResponse(BaseModel, extra="forbid"):
    deploymentId: str
    shareSessionId: str
    projectConfigId: ID
    sharePolicy: SharePolicy
    manifest: ShareDeploymentManifest | None = None
