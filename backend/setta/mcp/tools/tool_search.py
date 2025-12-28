from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.tool_metadata import SettaToolType
from setta.mcp.tool_search_index import (
    ToolSearchIndex,
    build_tool_search_entries_from_mcp_tools,
)
from setta.mcp.tool_setup import setta_init_tool


class MCPToolNameList(BaseModel):
    tools: list[str]


class MCPToolSearchResult(BaseModel):
    name: str
    description: str
    category: str | None = None


class MCPToolSearchResults(BaseModel):
    results: list[MCPToolSearchResult]


@setta_init_tool
def list_mcp_tools(*, ctx: Context) -> MCPToolNameList:
    """Return every registered MCP tool name without schemas or descriptions."""

    tools = ctx.fastmcp.list_registered_tools()
    names = sorted(tool.name for tool in tools)
    return MCPToolNameList(tools=names)


@setta_init_tool
def search_and_unlock_mcp_tools(
    *,
    query: str,
    limit: int = 2,
    serverIds: list[str] | None = None,
    ctx: Context,
) -> MCPToolSearchResults:
    """Return the MCP tools that best match a natural-language query.

    The chat manager automatically unlocks the returned tools so subsequent
    LLM requests can call them directly.

    Args:
        query: Text describing the capability you want to look up; empty input
            is rejected after trimming whitespace.
        limit: Maximum number of matching tools to return; values <= 0
            revert to the default size.
        serverIds: Optional MCP server IDs to scope search results.
    Returns:
        MCPToolSearchResults: Entries with the tool name, description, and category.
    """

    normalized_query = query.strip()
    if normalized_query == "":
        raise ValueError("query must not be empty")

    filtered_server_ids = _normalize_server_ids(serverIds)
    if filtered_server_ids and SETTA_MCP_SERVER_ID not in filtered_server_ids:
        return MCPToolSearchResults(results=[])

    tools = [
        tool
        for tool in ctx.fastmcp.list_registered_tools()
        if _is_discoverable_tool(tool)
    ]
    entries = build_tool_search_entries_from_mcp_tools(tools)
    index = ToolSearchIndex.build(entries)
    if index is None:
        return MCPToolSearchResults(results=[])

    ranked_results: list[MCPToolSearchResult] = []
    for result in index.search(normalized_query, limit):
        ranked_results.append(
            MCPToolSearchResult(
                name=result.name,
                description=result.description,
                category=result.category,
            )
        )

    return MCPToolSearchResults(results=ranked_results)


def _normalize_server_ids(server_ids: list[str] | None) -> list[str]:
    if server_ids is None or not server_ids:
        return []
    filtered: list[str] = []
    for server_id in server_ids:
        if not isinstance(server_id, str):
            raise ValueError("serverIds must be strings.")
        normalized = server_id.strip()
        if not normalized:
            raise ValueError("serverIds must be non-empty strings.")
        filtered.append(normalized)
    return filtered


def _is_discoverable_tool(tool) -> bool:
    annotations = tool.annotations
    if annotations is None:
        return False
    tool_type = getattr(annotations, "settaToolType", None)
    return tool_type in (SettaToolType.discoverable, SettaToolType.discoverable.value)
