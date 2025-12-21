from collections.abc import Callable
from enum import Enum
from typing import Any, Literal

from mcp.types import ToolAnnotations
from pydantic import BaseModel


class SettaToolType(str, Enum):
    init = "init"
    discoverable = "discoverable"


FollowIdType = Literal["section", "codeObj"]
ToolArgumentPreviewIdType = Literal["section", "codeObj"]


class ToolArgumentPreviewKind(str, Enum):
    code = "code"
    paramValue = "paramValue"
    callableName = "callableName"


class AIFollowToolResultMetadata(BaseModel):
    pathsByIdType: dict[FollowIdType, list[str]]


AI_FOLLOW_TOOL_RESULT_ATTR = "_setta_ai_follow_tool_result"
AI_FOLLOW_TOOL_ARGUMENTS_ATTR = "_setta_ai_follow_tool_arguments"
TOOL_ARGUMENT_PREVIEW_ATTR = "_setta_tool_argument_preview"


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


class AIFollowToolArgumentsMetadata(BaseModel):
    pathsByIdType: dict[FollowIdType, list[str]]


def attach_ai_follow_tool_arguments(
    fn: Callable[..., Any],
    metadata: AIFollowToolArgumentsMetadata | None,
) -> None:
    if metadata is None:
        return
    setattr(fn, AI_FOLLOW_TOOL_ARGUMENTS_ATTR, metadata)


def get_ai_follow_tool_arguments(
    fn: Callable[..., Any],
) -> AIFollowToolArgumentsMetadata | None:
    return getattr(fn, AI_FOLLOW_TOOL_ARGUMENTS_ATTR, None)


class ToolArgumentPreviewMetadata(BaseModel):
    targetIdPathsByType: dict[ToolArgumentPreviewIdType, list[str]]
    previewValuePath: str
    previewKind: ToolArgumentPreviewKind


def attach_tool_argument_preview(
    fn: Callable[..., Any],
    metadata: ToolArgumentPreviewMetadata | None,
) -> None:
    if metadata is None:
        return
    setattr(fn, TOOL_ARGUMENT_PREVIEW_ATTR, metadata)


def get_tool_argument_preview(
    fn: Callable[..., Any],
) -> ToolArgumentPreviewMetadata | None:
    return getattr(fn, TOOL_ARGUMENT_PREVIEW_ATTR, None)


class SettaToolAnnotations(ToolAnnotations):
    settaToolType: SettaToolType
    aiFollowToolResult: AIFollowToolResultMetadata | None = None
    aiFollowToolArguments: AIFollowToolArgumentsMetadata | None = None
    toolArgumentPreview: ToolArgumentPreviewMetadata | None = None
