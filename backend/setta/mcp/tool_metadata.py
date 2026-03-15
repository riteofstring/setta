from enum import Enum
from typing import Literal

FollowIdType = Literal["section", "codeObj"]
ToolArgumentPreviewIdType = Literal["section", "codeObj"]


class ToolArgumentPreviewKind(str, Enum):
    code = "code"
    paramValue = "paramValue"
    callableName = "callableName"
    appSpecPatch = "appSpecPatch"
