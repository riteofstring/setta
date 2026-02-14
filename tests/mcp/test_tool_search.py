from dataclasses import dataclass
from typing import Any

import pytest
from mcp.server.fastmcp.server import Context
from mcp.server.fastmcp.tools import Tool
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.mcp.tool_search_index import _build_parameter_text
from setta.mcp.tools.tool_search import list_mcp_tools, search_mcp_tools

@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


class StubSettaState:
    def __init__(self):
        pass


class StubFastMCP:
    def __init__(self, tools: list[Tool], state: StubSettaState):
        self._tools = list(tools)
        self.state = state

    def list_registered_tools(self) -> list[Tool]:
        return list(self._tools)


def _build_tool(
    spec: ToolSpec,
    *,
    tool_type: SettaToolType = SettaToolType.discoverable,
) -> Tool:
    def _noop(**kwargs: Any) -> None:
        if kwargs:
            return None
        return None

    metadata = func_metadata(_noop)
    annotations = SettaToolAnnotations(settaToolType=tool_type)
    return Tool(
        fn=_noop,
        name=spec.name,
        description=spec.description,
        parameters=spec.parameters,
        fn_metadata=metadata,
        is_async=False,
        context_kwarg=None,
        annotations=annotations,
    )


class TestSearchMCPTools:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
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
        tools = [_build_tool(spec) for spec in self.tool_specs]
        setta_state = StubSettaState()
        self.ctx = Context(fastmcp=StubFastMCP(tools, setta_state))

    def test_returns_ranked_results_for_query(self) -> None:
        results = search_mcp_tools(
            query="read specific file lines",
            limit=1,
            ctx=self.ctx,
        )

        assert len(results.results) == 1
        assert results.results[0].name == "read_file_range"

    def test_non_positive_limit_defaults_to_cached_tool_count(self) -> None:
        results = search_mcp_tools(
            query="search project",
            limit=0,
            ctx=self.ctx,
        )

        assert len(results.results) == len(self.tool_specs)

    def test_raises_for_blank_query(self) -> None:
        with pytest.raises(ValueError):
            search_mcp_tools(
                query="   ",
                ctx=self.ctx,
            )

    def test_returns_empty_when_index_missing(self) -> None:
        empty_state = StubSettaState()
        empty_ctx = Context(fastmcp=StubFastMCP([], empty_state))

        results = search_mcp_tools(
            query="read",
            ctx=empty_ctx,
        )

        assert results.results == []


class TestListMCPTools:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
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

        expected_namespaced = sorted(
            build_namespaced_tool_name(SETTA_MCP_SERVER_ID, name)
            for name in self.tool_names
        )
        assert results == expected_namespaced

    def test_preserves_existing_namespaced_tool_names(self) -> None:
        names = ["setta__already_namespaced", "read_file_range"]
        specs = [
            ToolSpec(
                name=name,
                description=f"description for {name}",
                parameters={"properties": {}},
            )
            for name in names
        ]
        tools = [_build_tool(spec) for spec in specs]
        setta_state = StubSettaState()
        ctx = Context(fastmcp=StubFastMCP(tools, setta_state))

        results = list_mcp_tools(ctx=ctx).tools

        assert "setta__already_namespaced" in results
        assert build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "read_file_range") in results

    def test_returns_empty_list_when_no_tools_registered(self) -> None:
        empty_state = StubSettaState()
        empty_ctx = Context(fastmcp=StubFastMCP([], empty_state))

        assert list_mcp_tools(ctx=empty_ctx).tools == []


class TestBuildParameterText:
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

        assert "sectionSizes" in text
        assert "Map of section IDs to size definitions." in text
        assert "Horizontal dimension or auto." in text
        assert "Explicit pixel width." in text
        assert "Vertical dimension or auto." in text
        assert "Explicit pixel height." in text
