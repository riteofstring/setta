import unittest

from mcp.types import Tool, ToolAnnotations

from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.tool_metadata import SettaToolAnnotations


def _build_tool(
    *,
    name: str,
    description: str = "",
    annotations: ToolAnnotations | None = None,
) -> Tool:
    return Tool(
        name=name,
        description=description,
        inputSchema={},
        annotations=annotations,
    )


class MultiMCPClientToolCacheTests(unittest.TestCase):
    def test_namespaces_tools_and_routes(self) -> None:
        client = MultiMCPClient({})
        init_annotations = ToolAnnotations.model_validate(
            SettaToolAnnotations().model_dump()
        )
        init_tool = _build_tool(
            name="read_file_range",
            description="Read file contents",
            annotations=init_annotations,
        )
        no_annotation_tool = _build_tool(
            name="list_projects",
            description="List projects",
        )

        client._update_tool_cache_for_server(
            SETTA_MCP_SERVER_ID, [init_tool, no_annotation_tool]
        )

        self.assertIn(
            f"{SETTA_MCP_SERVER_ID}__read_file_range", client.tool_definitions
        )
        self.assertIn(
            f"{SETTA_MCP_SERVER_ID}__list_projects",
            client.tool_definitions,
        )
        self.assertEqual(
            client.routing[f"{SETTA_MCP_SERVER_ID}__read_file_range"],
            (SETTA_MCP_SERVER_ID, "read_file_range"),
        )
        self.assertIsNone(
            client.tool_annotations_by_name[f"{SETTA_MCP_SERVER_ID}__list_projects"]
        )

    def test_filters_tools_by_server(self) -> None:
        client = MultiMCPClient({})
        setta_tool = _build_tool(name="read_file_range")
        github_tool = _build_tool(name="search_repo")

        client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, [setta_tool])
        client._update_tool_cache_for_server("github", [github_tool])

        filtered = client.tool_definitions_for_servers({"github"})

        self.assertIn("github__search_repo", filtered)
        self.assertNotIn(f"{SETTA_MCP_SERVER_ID}__read_file_range", filtered)
