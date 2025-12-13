import bm25s
from pydantic import RootModel

from setta.mcp.tool_setup import setta_init_tool
from setta.server_state import SettaFastAPIState
from setta.utils.constants import C

SEARCH_AND_UNLOCK_MCP_TOOLS_NAME = C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME


class MCPToolNameList(RootModel[list[str]]):
    pass


@setta_init_tool
def list_mcp_tools(*, setta_state: SettaFastAPIState) -> MCPToolNameList:
    """Return every registered MCP tool name without schemas or descriptions."""

    tools = setta_state.mcp_server.list_registered_tools()
    names = sorted(tool.name for tool in tools)
    return MCPToolNameList(root=names)


@setta_init_tool
def search_and_unlock_mcp_tools(
    *,
    query: str,
    limit: int = 2,
    setta_state: SettaFastAPIState,
) -> MCPToolNameList:
    """Return the MCP tool names that best match a natural-language query.

    The chat manager automatically unlocks the returned tools so subsequent
    LLM requests can call them directly.

    Args:
        query: Text describing the capability you want to look up; empty input
            is rejected after trimming whitespace.
        limit: Maximum number of matching tool names to return; values <= 0
            revert to the default size.
    """

    normalized_query = query.strip()
    if normalized_query == "":
        raise ValueError("query must not be empty")

    index = setta_state.mcp_server.tool_search_index
    if index is None:
        return MCPToolNameList(root=[])

    tools = index.tools
    normalized_limit = limit if limit > 0 else 5
    retriever = index.retriever
    query_tokens = bm25s.tokenize([normalized_query], stopwords="en")
    if not query_tokens or not any(query_tokens[0]):
        raise ValueError("query must include at least one searchable token")

    max_results = min(normalized_limit, len(tools))
    doc_ids, scores = retriever.retrieve(query_tokens, k=max_results)
    ranked_results: list[str] = []
    for doc_index, _ in zip(doc_ids[0], scores[0]):
        if doc_index < 0 or doc_index >= len(tools):
            continue
        tool = tools[doc_index]
        ranked_results.append(tool.name)

    return MCPToolNameList(root=ranked_results)
