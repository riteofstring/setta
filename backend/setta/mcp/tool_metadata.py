from enum import Enum
from typing import Literal

from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field


class SettaToolType(str, Enum):
    init = "init"
    discoverable = "discoverable"


FollowIdType = Literal["section", "codeObj"]
ToolArgumentPreviewIdType = Literal["section", "codeObj"]
ToolAccessType = Literal["read", "write", "structural", "peer_chat"]
ToolResultFilterType = Literal["project_state_summary", "lsp_diagnostics"]


class ToolArgumentPreviewKind(str, Enum):
    code = "code"
    paramValue = "paramValue"
    callableName = "callableName"
    appSpecPatch = "appSpecPatch"


class AIFollowToolResultMetadata(BaseModel):
    pathsByIdType: dict[FollowIdType, list[str]]


class AIFollowToolArgumentsMetadata(BaseModel):
    pathsByIdType: dict[FollowIdType, list[str]]


class ToolArgumentPreviewMetadata(BaseModel):
    targetIdPathsByType: dict[ToolArgumentPreviewIdType, list[str]]
    previewValuePath: str
    previewKind: ToolArgumentPreviewKind


class SettaToolAnnotations(ToolAnnotations):
    settaToolType: SettaToolType
    accessType: ToolAccessType = "structural"
    requiresLLM: bool = False
    startsRun: bool = False
    retryOnDisconnect: bool = True
    idPathsByType: dict[FollowIdType, list[str]] = Field(default_factory=dict)
    defaultTargetSingletonSection: str | None = None
    resultFilter: ToolResultFilterType | None = None
    aiFollowToolResult: AIFollowToolResultMetadata | None = None
    aiFollowToolArguments: AIFollowToolArgumentsMetadata | None = None
    toolArgumentPreview: ToolArgumentPreviewMetadata | None = None
    searchTags: list[str] = Field(default_factory=list)
    searchCategory: str | None = None
