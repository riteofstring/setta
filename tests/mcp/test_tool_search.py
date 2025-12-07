import unittest
from dataclasses import dataclass
from typing import Any

import bm25s
from mcp.server.fastmcp.tools import Tool
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from setta.mcp.server import ToolSearchIndex, _build_tool_document_text
from setta.mcp.tools.tool_search import search_mcp_tools


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


class StubMCPServer:
    def __init__(self, index: ToolSearchIndex | None):
        self.tool_search_index = index


class StubSettaState:
    def __init__(self, index: ToolSearchIndex | None):
        self.mcp_server = StubMCPServer(index)


def _build_tool(spec: ToolSpec) -> Tool:
    def _noop(**_: Any) -> None:
        return None

    metadata = func_metadata(_noop)
    return Tool(
        fn=_noop,
        name=spec.name,
        description=spec.description,
        parameters=spec.parameters,
        fn_metadata=metadata,
        is_async=False,
        context_kwarg=None,
        annotations=None,
    )


def build_search_index(tool_specs: list[ToolSpec]) -> ToolSearchIndex:
    tools = [_build_tool(spec) for spec in tool_specs]
    retriever = bm25s.BM25()
    documents = [_build_tool_document_text(tool) for tool in tools]
    corpus_tokens = bm25s.tokenize(documents, stopwords="en")
    retriever.index(corpus_tokens)
    return ToolSearchIndex(retriever=retriever, tools=tools)


class SearchMCPToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tool_specs = [
            ToolSpec(
                name="read_file_range",
                description="Read part of a workspace file between start and end lines.",
                parameters={
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Workspace relative file path to read.",
                        },
                        "start_line": {
                            "type": "integer",
                            "description": "First line number to include.",
                        },
                        "end_line": {
                            "type": "integer",
                            "description": "Last line number to include.",
                        },
                    }
                },
            ),
            ToolSpec(
                name="list_notifications",
                description="Return unread build notifications and execution warnings.",
                parameters={
                    "properties": {
                        "include_read": {
                            "type": "boolean",
                            "description": "Include notifications that were already read.",
                        }
                    }
                },
            ),
            ToolSpec(
                name="search_project_sources",
                description="Search project files for terms before editing them.",
                parameters={
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search expression used for the project files.",
                        }
                    }
                },
            ),
        ]
        index = build_search_index(self.tool_specs)
        self.setta_state = StubSettaState(index)

    def test_returns_ranked_results_for_query(self) -> None:
        results = search_mcp_tools(
            query="read specific file lines", limit=1, setta_state=self.setta_state
        )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0], "read_file_range")

    def test_non_positive_limit_defaults_to_cached_tool_count(self) -> None:
        results = search_mcp_tools(
            query="search project", limit=0, setta_state=self.setta_state
        )

        self.assertEqual(len(results), len(self.tool_specs))

    def test_raises_for_blank_query(self) -> None:
        with self.assertRaises(ValueError):
            search_mcp_tools(query="   ", setta_state=self.setta_state)

    def test_returns_empty_when_index_missing(self) -> None:
        empty_state = StubSettaState(index=None)

        results = search_mcp_tools(query="read", setta_state=empty_state)

        self.assertEqual(results, [])
