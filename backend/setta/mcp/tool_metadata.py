from collections.abc import Callable
from enum import Enum
from typing import Any, Literal

from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field


class SettaToolType(str, Enum):
    init = "init"
    discoverable = "discoverable"


FollowIdType = Literal["section", "codeObj"]
ToolArgumentPreviewIdType = Literal["section", "codeObj"]
ToolAccessType = Literal["read", "write", "structural"]


class ToolArgumentPreviewKind(str, Enum):
    code = "code"
    paramValue = "paramValue"
    callableName = "callableName"


class AIFollowToolResultMetadata(BaseModel):
    pathsByIdType: dict[FollowIdType, list[str]]


AI_FOLLOW_TOOL_RESULT_ATTR = "_setta_ai_follow_tool_result"
AI_FOLLOW_TOOL_ARGUMENTS_ATTR = "_setta_ai_follow_tool_arguments"
TOOL_ARGUMENT_PREVIEW_ATTR = "_setta_tool_argument_preview"
TOOL_SEARCH_TAGS_ATTR = "_setta_tool_search_tags"
TOOL_SEARCH_CATEGORY_ATTR = "_setta_tool_search_category"
TOOL_ACCESS_ATTR = "_setta_tool_access"


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


def attach_tool_search_tags(
    fn: Callable[..., Any],
    tags: list[str] | None,
) -> None:
    if tags is None:
        return
    setattr(fn, TOOL_SEARCH_TAGS_ATTR, tags)


def get_tool_search_tags(fn: Callable[..., Any]) -> list[str] | None:
    return getattr(fn, TOOL_SEARCH_TAGS_ATTR, None)


def attach_tool_search_category(
    fn: Callable[..., Any],
    category: str | None,
) -> None:
    if category is None:
        return
    setattr(fn, TOOL_SEARCH_CATEGORY_ATTR, category)


def get_tool_search_category(fn: Callable[..., Any]) -> str | None:
    return getattr(fn, TOOL_SEARCH_CATEGORY_ATTR, None)


class SettaToolAnnotations(ToolAnnotations):
    settaToolType: SettaToolType
    accessType: ToolAccessType = "structural"
    idPathsByType: dict[FollowIdType, list[str]] = Field(default_factory=dict)
    aiFollowToolResult: AIFollowToolResultMetadata | None = None
    aiFollowToolArguments: AIFollowToolArgumentsMetadata | None = None
    toolArgumentPreview: ToolArgumentPreviewMetadata | None = None
    searchTags: list[str] = Field(default_factory=list)
    searchCategory: str | None = None


class ToolAccessMetadata(BaseModel):
    accessType: ToolAccessType
    idPathsByType: dict[FollowIdType, list[str]] = Field(default_factory=dict)


def attach_tool_access(
    fn: Callable[..., Any],
    metadata: ToolAccessMetadata | None,
) -> None:
    if metadata is None:
        return
    setattr(fn, TOOL_ACCESS_ATTR, metadata)


def get_tool_access(fn: Callable[..., Any]) -> ToolAccessMetadata | None:
    return getattr(fn, TOOL_ACCESS_ATTR, None)
