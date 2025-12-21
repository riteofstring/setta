from collections.abc import Callable
from enum import Enum
from typing import Any, Literal

from mcp.types import ToolAnnotations
from pydantic import BaseModel


class SettaToolType(str, Enum):
    init = "init"
    discoverable = "discoverable"


FollowIdType = Literal["section", "codeObj"]


class AIFollowToolResultMetadata(BaseModel):
    pathsByIdType: dict[FollowIdType, list[str]]


AI_FOLLOW_TOOL_RESULT_ATTR = "_setta_ai_follow_tool_result"


def attach_ai_follow_tool_result(
    fn: Callable[..., Any],
    metadata: AIFollowToolResultMetadata | None,
) -> None:
    if metadata is None:
        return
    setattr(fn, AI_FOLLOW_TOOL_RESULT_ATTR, metadata)


def get_ai_follow_tool_result(
    fn: Callable[..., Any],
) -> AIFollowToolResultMetadata | None:
    return getattr(fn, AI_FOLLOW_TOOL_RESULT_ATTR, None)


class SettaToolAnnotations(ToolAnnotations):
    settaToolType: SettaToolType
    aiFollowToolResult: AIFollowToolResultMetadata | None = None
