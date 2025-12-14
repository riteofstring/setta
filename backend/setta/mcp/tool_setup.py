from typing import Callable

SETTA_MCP_TOOLS: list[Callable] = []


def setta_tool(fn: Callable):
    SETTA_MCP_TOOLS.append(fn)
    return fn
