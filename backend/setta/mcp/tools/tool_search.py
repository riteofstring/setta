import bm25s
from pydantic import BaseModel

from mcp.server.fastmcp.server import Context
from setta.mcp.tool_setup import setta_init_tool
from setta.utils.constants import C

SEARCH_AND_UNLOCK_MCP_TOOLS_NAME = C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME


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
    Returns:
        MCPToolSearchResults: Entries with the tool name, description, and category.
    """

    normalized_query = query.strip()
    if normalized_query == "":
        raise ValueError("query must not be empty")

    index = ctx.fastmcp.tool_search_index
    if index is None:
        return MCPToolSearchResults(results=[])

    tools = index.tools
    normalized_limit = limit if limit > 0 else 5
    retriever = index.retriever
    query_tokens = bm25s.tokenize([normalized_query], stopwords="en")
    if not query_tokens or not any(query_tokens[0]):
        raise ValueError("query must include at least one searchable token")

    max_results = min(normalized_limit, len(tools))
    doc_ids, scores = retriever.retrieve(query_tokens, k=max_results)
    ranked_results: list[MCPToolSearchResult] = []
    for doc_index, _ in zip(doc_ids[0], scores[0]):
        if doc_index < 0 or doc_index >= len(tools):
            continue
        tool = tools[doc_index]
        ranked_results.append(
            MCPToolSearchResult(
                name=tool.name,
                description=tool.description or "",
                category=_get_tool_search_category(tool),
            )
        )

    return MCPToolSearchResults(results=ranked_results)


def _get_tool_search_category(tool) -> str | None:
    annotations = tool.annotations
    if annotations is None:
        return None
    payload = annotations.model_dump()
    category = payload.get("searchCategory")
    if isinstance(category, str) and category.strip():
        return category
    return None
