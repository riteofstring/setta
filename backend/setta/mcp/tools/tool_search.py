from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from setta.mcp.tool_setup import setta_tool

if TYPE_CHECKING:
    from setta.mcp.server import SettaTool
    from setta.server_state import SettaFastAPIState


@dataclass
class ToolMetadata:
    name: str
    description: str
    parameters: dict[str, Any]


@setta_tool
def search_mcp_tools(
    *,
    query: str,
    limit: int = 5,
    include_parameters: bool = False,
    setta_state: "SettaFastAPIState",
) -> dict[str, Any]:
    """Search registered MCP tools and return the best matches."""

    normalized_query = query.strip().lower()
    if normalized_query == "":
        raise ValueError("query must not be empty")

    normalized_limit = limit if limit > 0 else 5
    tools = setta_state.mcp_server.list_registered_tools()
    scored: list[tuple[float, ToolMetadata]] = []
    for tool in tools:
        metadata = _extract_metadata(tool)
        score = _score_tool(normalized_query, metadata)
        if score <= 0:
            continue
        scored.append((score, metadata))

    scored.sort(key=lambda entry: entry[0], reverse=True)
    selected = scored[:normalized_limit]
    results = [
        _serialize_result(metadata, score, include_parameters)
        for score, metadata in selected
    ]
    summary = \
        f"Selected {len(results)} tool{'s' if len(results) != 1 else ''} for query '{query}'."
    return {
        "query": query,
        "results": results,
        "results_found": len(results),
        "summary": summary,
    }


def _extract_metadata(tool: "SettaTool") -> ToolMetadata:
    raw_parameters = getattr(tool, "parameters", {})
    parameters = raw_parameters if isinstance(raw_parameters, dict) else {}
    return ToolMetadata(
        name=getattr(tool, "name", ""),
        description=getattr(tool, "description", ""),
        parameters=parameters,
    )


def _score_tool(query: str, metadata: ToolMetadata) -> float:
    tokens = _tokenize(query)
    if not tokens:
        return 0.0

    name = metadata.name.lower()
    description = metadata.description.lower()
    parameter_blob = " ".join(metadata.parameters.get("properties", {}).keys()).lower()

    score = 0.0
    for token in tokens:
        if token in name:
            score += 5.0
        if token in description:
            score += 3.0
        if token in parameter_blob:
            score += 1.0
    return score


def _tokenize(value: str) -> list[str]:
    return [part for part in value.split() if part]


def _serialize_result(
    metadata: ToolMetadata,
    score: float,
    include_parameters: bool,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": metadata.name,
        "description": metadata.description,
        "score": score,
    }
    if include_parameters:
        result["parameters"] = metadata.parameters
    return result
