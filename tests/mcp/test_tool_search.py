import unittest
from dataclasses import dataclass
from typing import Any

from mcp.server.fastmcp.server import Context
from mcp.server.fastmcp.tools import Tool
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from setta.mcp.tool_search_index import _build_parameter_text
from setta.mcp.tools.tool_search import list_mcp_tools, search_and_unlock_mcp_tools


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


class StubMCPClient:
    def __init__(
        self,
        definitions: dict[str, dict[str, Any]],
        annotations_by_name: dict[str, Any],
    ):
        self.discoverable_tool_definitions = definitions
        self.tool_annotations_by_name = annotations_by_name

    def discoverable_tool_definitions_for_servers(
        self, _server_ids: set[str]
    ) -> dict[str, dict[str, Any]]:
        return self.discoverable_tool_definitions

    def tool_annotations_for_servers(
        self, _server_ids: set[str]
    ) -> dict[str, Any]:
        return self.tool_annotations_by_name


class StubSettaState:
    def __init__(self, mcp_client: StubMCPClient | None = None):
        self.mcp_client = mcp_client


class StubFastMCP:
    def __init__(self, tools: list[Tool], state: StubSettaState):
        self._tools = list(tools)
        self.state = state

    def list_registered_tools(self) -> list[Tool]:
        return list(self._tools)


def _build_tool(spec: ToolSpec) -> Tool:
    def _noop(**kwargs: Any) -> None:
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


def _build_definition(spec: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.parameters,
        },
    }


class SearchAndUnlockMCPToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.server_ids = ["setta"]
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
        definitions = {
            spec.name: _build_definition(spec) for spec in self.tool_specs
        }
        annotations = {spec.name: None for spec in self.tool_specs}
        mcp_client = StubMCPClient(definitions, annotations)
        setta_state = StubSettaState(mcp_client)
        self.ctx = Context(fastmcp=StubFastMCP([], setta_state))

    def test_returns_ranked_results_for_query(self) -> None:
        results = search_and_unlock_mcp_tools(
            query="read specific file lines",
            limit=1,
            serverIds=self.server_ids,
            ctx=self.ctx,
        )

        self.assertEqual(len(results.results), 1)
        self.assertEqual(results.results[0].name, "read_file_range")

    def test_non_positive_limit_defaults_to_cached_tool_count(self) -> None:
        results = search_and_unlock_mcp_tools(
            query="search project",
            limit=0,
            serverIds=self.server_ids,
            ctx=self.ctx,
        )

        self.assertEqual(len(results.results), len(self.tool_specs))

    def test_raises_for_blank_query(self) -> None:
        with self.assertRaises(ValueError):
            search_and_unlock_mcp_tools(
                query="   ",
                serverIds=self.server_ids,
                ctx=self.ctx,
            )

    def test_returns_empty_when_index_missing(self) -> None:
        empty_client = StubMCPClient({}, {})
        empty_state = StubSettaState(empty_client)
        empty_ctx = Context(fastmcp=StubFastMCP([], empty_state))

        results = search_and_unlock_mcp_tools(
            query="read",
            serverIds=self.server_ids,
            ctx=empty_ctx,
        )

        self.assertEqual(results.results, [])


class ListMCPToolsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tool_names = [
            "search_project_sources",
            "read_file_range",
            "list_notifications",
        ]
        specs = [
            ToolSpec(
                name=name,
                description=f"description for {name}",
                parameters={"properties": {}},
            )
            for name in self.tool_names
        ]
        tools = [_build_tool(spec) for spec in specs]
        # Intentionally reverse to confirm sorting happens inside list_mcp_tools.
        setta_state = StubSettaState()
        self.ctx = Context(fastmcp=StubFastMCP(list(reversed(tools)), setta_state))

    def test_returns_sorted_registered_tool_names(self) -> None:
        results = list_mcp_tools(ctx=self.ctx).tools

        self.assertEqual(results, sorted(self.tool_names))

    def test_returns_empty_list_when_no_tools_registered(self) -> None:
        empty_state = StubSettaState()
        empty_ctx = Context(fastmcp=StubFastMCP([], empty_state))

        self.assertEqual(list_mcp_tools(ctx=empty_ctx).tools, [])


class BuildParameterTextTest(unittest.TestCase):
    def test_includes_nested_definition_descriptions(self) -> None:
        schema = {
            "$defs": {
                "SectionSize": {
                    "type": "object",
                    "description": "Dimensions applied to a given section.",
                    "properties": {
                        "width": {
                            "description": "Horizontal dimension or auto.",
                            "anyOf": [
                                {
                                    "type": "number",
                                    "description": "Explicit pixel width.",
                                },
                                {"$ref": "#/$defs/AutoSize"},
                            ],
                        },
                        "height": {
                            "$ref": "#/$defs/DimensionValue",
                        },
                    },
                },
                "AutoSize": {
                    "type": "string",
                    "description": "Use auto layout sizing hints.",
                },
                "DimensionValue": {
                    "description": "Vertical dimension or auto.",
                    "anyOf": [
                        {
                            "type": "number",
                            "description": "Explicit pixel height.",
                        },
                        {"const": "auto", "type": "string"},
                    ],
                },
            },
            "properties": {
                "sectionSizes": {
                    "type": "object",
                    "description": "Map of section IDs to size definitions.",
                    "additionalProperties": {
                        "$ref": "#/$defs/SectionSize",
                    },
                },
            },
        }

        text = _build_parameter_text(schema)

        self.assertIn("sectionSizes", text)
        self.assertIn("Map of section IDs to size definitions.", text)
        self.assertIn("Horizontal dimension or auto.", text)
        self.assertIn("Explicit pixel width.", text)
        self.assertIn("Vertical dimension or auto.", text)
        self.assertIn("Explicit pixel height.", text)
