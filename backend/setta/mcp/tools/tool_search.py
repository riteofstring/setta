from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.tool_search_index import (
    ToolSearchIndex,
    build_tool_search_entries_from_llm_definitions,
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
        serverIds: MCP server IDs to scope search results.
    Returns:
        MCPToolSearchResults: Entries with the tool name, description, and category.
    """

    normalized_query = query.strip()
    if normalized_query == "":
        raise ValueError("query must not be empty")

    mcp_client = ctx.fastmcp.state.mcp_client
    if not mcp_client:
        return MCPToolSearchResults(results=[])

    filtered_server_ids = _normalize_server_ids(serverIds)
    if filtered_server_ids:
        server_id_set = set(filtered_server_ids)
        definitions = mcp_client.discoverable_tool_definitions_for_servers(
            server_id_set
        )
        annotations_by_name = mcp_client.tool_annotations_for_servers(server_id_set)
    else:
        definitions = mcp_client.discoverable_tool_definitions
        annotations_by_name = mcp_client.tool_annotations_by_name

    entries = build_tool_search_entries_from_llm_definitions(
        definitions, annotations_by_name
    )
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
    if server_ids is None:
        raise ValueError("serverIds must be provided.")
    if not server_ids:
        raise ValueError("serverIds must not be empty.")
    filtered: list[str] = []
    for server_id in server_ids:
        if not isinstance(server_id, str):
            raise ValueError("serverIds must be strings.")
        normalized = server_id.strip()
        if not normalized:
            raise ValueError("serverIds must be non-empty strings.")
        filtered.append(normalized)
    return filtered
