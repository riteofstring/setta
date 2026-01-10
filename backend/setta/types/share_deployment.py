from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field, field_serializer, field_validator

from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.settings_state import RunSnapshotMode
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ShareDeploymentListenerConfig(BaseModel, extra="forbid"):
    entrypoint: str
    enabled: bool = True


class ShareDeploymentManifest(BaseModel, extra="forbid"):
    version: int
    deploymentName: str
    defaultProjectConfigId: ID
    deploymentVersion: str
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
    runSnapshotMode: RunSnapshotMode = RunSnapshotMode.ephemeral


class ShareDeploymentMetadata(BaseModel, extra="forbid"):
    deploymentName: str
    deploymentVersion: str
    defaultProjectConfigId: ID
    defaultProjectConfigName: str
    createdAt: datetime
    deploymentRoot: Path
    sharePolicyPath: Path


class ShareDeploymentSessionResponse(BaseModel, extra="forbid"):
    deploymentName: str
    deploymentVersion: str
    shareSessionId: str
    defaultProjectConfigId: ID
    projectMetadata: list[ProjectConfig]
    sharePolicy: SharePolicy
    manifest: ShareDeploymentManifest | None = None
