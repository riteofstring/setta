from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from setta.types.app_config import AppConfig
from setta.types.chat_messages import JSONValue
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy


class AppDeploymentMetadata(BaseModel, extra="forbid"):
    deploymentName: str
    deploymentVersion: str
    defaultProjectConfigId: ID
    defaultProjectConfigName: str
    createdAt: datetime
    deploymentRoot: Path
    sharePolicyPath: Path


class AppDeploymentSessionResponse(BaseModel, extra="forbid"):
    deploymentName: str
    deploymentVersion: str
    shareSessionId: str
    defaultProjectConfigId: ID
    projectMetadata: list[ProjectConfig]
    appPolicy: SharePolicy
    manifest: ShareDeploymentManifest | None = None


class AppDeploymentStateResponse(BaseModel, extra="forbid"):
    projectState: ProjectStateSingleConfig
    appConfig: AppConfig | None = None
    appSpec: JSONValue | None = None
    appPolicy: SharePolicy
