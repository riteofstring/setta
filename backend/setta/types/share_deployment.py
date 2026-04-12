from datetime import datetime
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field, field_serializer, field_validator

from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.settings_state import RunSnapshotMode
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class DeploymentListenerConfig(BaseModel, extra="forbid"):
    entrypoint: str
    enabled: bool = True


class DeploymentType(str, Enum):
    share = "share"
    app = "app"


class DeploymentManifest(BaseModel, extra="forbid"):
    version: int
    deploymentName: str
    deploymentType: DeploymentType
    defaultProjectConfigId: ID
    deploymentVersion: str
    createdAt: datetime = Field(default_factory=get_now_timestamp)
    listener: DeploymentListenerConfig | None = None

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
    allowExternalLinks: bool = False
    allowFileDownloads: bool = False
    allowMultipleRuns: bool = True
    runSnapshotMode: RunSnapshotMode = RunSnapshotMode.ephemeral


class ShareDeploymentMetadata(BaseModel, extra="forbid"):
    deploymentName: str
    deploymentVersion: str
    defaultProjectConfigId: ID
    defaultProjectConfigName: str
    createdAt: datetime
    deploymentRoot: Path
    policyPath: Path


class ShareDeploymentSessionResponse(BaseModel, extra="forbid"):
    deploymentName: str
    deploymentVersion: str
    shareSessionId: str
    sessionRunCount: int
    defaultProjectConfigId: ID
    projectMetadata: list[ProjectConfig]
    sharePolicy: SharePolicy
    manifest: DeploymentManifest | None = None
