from typing import Callable

SETTA_MCP_TOOLS: list[Callable] = []
SETTA_INIT_MCP_TOOLS: list[Callable] = []


def setta_tool(fn: Callable):
    """Register a callable as an MCP tool."""

    SETTA_MCP_TOOLS.append(fn)
    return fn


def setta_init_tool(fn: Callable):
    """Register a callable as an always-available MCP tool."""

    SETTA_INIT_MCP_TOOLS.append(fn)
    return fn
