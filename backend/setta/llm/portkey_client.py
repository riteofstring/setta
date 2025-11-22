"""Lightweight Portkey client typing helpers."""

from typing import Any, Literal, TypedDict


class ToolFunctionDefinition(TypedDict):
    """OpenAI-style function payload used by Portkey tool definitions."""

    name: str
    description: str
    parameters: dict[str, Any]


class ToolDefinition(TypedDict):
    """Top-level Portkey tool definition."""

    type: Literal["function"]
    function: ToolFunctionDefinition


__all__ = ["ToolDefinition", "ToolFunctionDefinition"]
