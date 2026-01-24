import json
from typing import Any

from litellm.types.llms.openai import ChatCompletionToolParam
from mcp.types import CallToolResult, TextContent

from setta.mcp.tool_search_index import (
    ToolSearchIndex,
    build_tool_search_entries_from_llm_definitions,
)
from setta.types.chat_messages import ToolCall, ToolChatMessage, ToolReferenceContent
from setta.types.id import ID


def run_local_search_tool(
    *,
    arguments: dict[str, Any],
    available_tools: dict[str, ChatCompletionToolParam],
    annotations_by_name: dict[str, Any],
) -> CallToolResult:
    query = arguments.get("query", "")
    if not isinstance(query, str):
        raise ValueError("query must be a string")
    normalized_query = query.strip()
    if normalized_query == "":
        raise ValueError("query must not be empty")
    limit = arguments.get("limit")
    if limit is None:
        limit = 2
    elif isinstance(limit, bool) or not isinstance(limit, int):
        raise ValueError("limit must be an integer")

    entries = build_tool_search_entries_from_llm_definitions(
        available_tools,
        annotations_by_name,
    )
    index = ToolSearchIndex.build(entries)
    results_payload: list[dict[str, str | None]] = []
    if index is not None:
        for result in index.search(normalized_query, limit):
            results_payload.append(
                {
                    "name": result.name,
                    "description": result.description,
                    "category": result.category,
                }
            )
    structured = {"results": results_payload}
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(structured))],
        structuredContent=structured,
        isError=False,
    )


def parse_search_tool_results(
    call_result: CallToolResult,
) -> list[dict[str, str | None]]:
    payload = call_result.structuredContent
    if not isinstance(payload, dict):
        raise ValueError("Search tool must return structured content.")

    results_payload = payload.get("results")
    if not isinstance(results_payload, list):
        raise ValueError("Search tool structured content must include results.")

    results: list[dict[str, str | None]] = []
    for item in results_payload:
        if not isinstance(item, dict):
            raise ValueError("Search tool results must be objects.")
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Search tool result name must be a non-empty string.")
        description = item.get("description")
        if not isinstance(description, str):
            raise ValueError("Search tool result description must be a string.")
        category = item.get("category")
        if category is not None and not isinstance(category, str):
            raise ValueError("Search tool result category must be a string.")
        results.append(
            {
                "name": name,
                "description": description,
                "category": category,
            }
        )
    return results


def build_tool_definitions_from_search_results(
    search_results: list[dict[str, str | None]],
    available: dict[str, ChatCompletionToolParam],
) -> dict[str, ChatCompletionToolParam]:
    definitions: dict[str, ChatCompletionToolParam] = {}
    for result in search_results:
        name = result.get("name")
        if not name:
            continue
        definition = available.get(name)
        if not definition:
            continue
        definitions[name] = definition
    return definitions


def format_tool_reference_summary(tool_names: list[str]) -> str:
    if not tool_names:
        return "Search did not return any MCP tools."
    if len(tool_names) == 1:
        return f"Search returned MCP tool: {tool_names[0]}"
    return f"Search returned MCP tools: {', '.join(tool_names)}"


def build_search_tool_chat_message(
    *,
    chat_id: ID,
    tool_name: str,
    tool_call: ToolCall,
    call_result: CallToolResult,
    arguments: dict[str, Any],
    started_at,
    completed_at,
    available_tools: dict[str, ChatCompletionToolParam],
) -> tuple[ToolChatMessage, list[str]]:
    search_results = parse_search_tool_results(call_result)
    definitions = build_tool_definitions_from_search_results(
        search_results,
        available_tools,
    )
    referenced_tool_names = list(definitions.keys())
    result_payload = call_result.model_dump()
    result_payload["searchResults"] = search_results

    if referenced_tool_names:
        content_blocks = [
            ToolReferenceContent(tool_name=name) for name in referenced_tool_names
        ]
    else:
        content_blocks = [
            TextContent(
                type="text",
                text=format_tool_reference_summary([]),
            )
        ]

    return (
        ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=arguments,
            content=content_blocks,
            is_error=call_result.isError,
            result=result_payload,
            started_at=started_at,
            completed_at=completed_at,
        ),
        referenced_tool_names,
    )
