from enum import Enum
from typing import Literal

from pydantic import BaseModel


FollowIdType = Literal["section", "codeObj"]
ToolArgumentPreviewIdType = Literal["section", "codeObj"]


class ToolArgumentPreviewKind(str, Enum):
    code = "code"
    paramValue = "paramValue"
    callableName = "callableName"
    appSpecPatch = "appSpecPatch"


class ToolArgumentPreviewMetadata(BaseModel):
    targetIdPathsByType: dict[ToolArgumentPreviewIdType, list[str]]
    previewValuePath: str
    previewKind: ToolArgumentPreviewKind
