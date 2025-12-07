import json

import bm25s

from setta.mcp.tool_setup import setta_init_tool
from setta.server_state import SettaFastAPIState
from setta.utils.constants import C

SEARCH_MCP_TOOLS_NAME = C.SEARCH_MCP_TOOLS_NAME


@setta_init_tool
def search_mcp_tools(
    *,
    query: str,
    limit: int = 2,
    setta_state: SettaFastAPIState,
) -> str:
    """Return the MCP tool names that best match a natural-language query.

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
        return []

    tools = index.tools
    normalized_limit = limit if limit > 0 else 5
    retriever = index.retriever
    query_tokens = bm25s.tokenize([normalized_query], stopwords="en")
    if not query_tokens or not any(query_tokens[0]):
        raise ValueError("query must include at least one searchable token")

    max_results = min(normalized_limit, len(tools))
    doc_ids, scores = retriever.retrieve(query_tokens, k=max_results)
    ranked_results: list[str] = []
    for doc_index, score in zip(doc_ids[0], scores[0]):
        if doc_index < 0 or doc_index >= len(tools):
            continue
        tool = tools[doc_index]
        ranked_results.append(tool.name)

    return json.dumps(ranked_results)
