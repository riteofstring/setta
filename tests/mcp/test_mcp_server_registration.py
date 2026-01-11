import json
import unittest
import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.types import CallToolResult, TextContent
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_metadata import SettaToolAnnotations
from setta.types.id import ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from watchdog.observers.polling import PollingObserver

from tests.utils.manager_fixture import real_project_manager

specific_file_watcher.Observer = PollingObserver
lsp_file_watcher.Observer = PollingObserver


class _StubProjectManagerSwitcher:
    """Minimal switcher that always routes requests to the primary manager."""

    def __init__(self, manager):
        self._manager = manager

    def get(self, _project_identifier):
        return self._manager


class _StubSettaState:
    """Subset of SettaFastAPIState required for registering MCP tools."""

    def __init__(self, dbe, manager, mcp_client=None):
        self.dbe = dbe
        self.project_manager_switcher = _StubProjectManagerSwitcher(manager)
        self.mcp_client = mcp_client


class _StubMCPClient:
    def __init__(
        self,
        mcp_server: SettaFastMCP,
        server_id: str = SETTA_MCP_SERVER_ID,
    ):
        self._server_id = server_id
        self._tools = {tool.name: tool for tool in mcp_server.list_registered_tools()}
        self._context = Context(fastmcp=mcp_server)
        self._routing: dict[str, str] = {}
        self.tool_definitions: dict[str, dict] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        self._populate_tool_definitions()

    def _populate_tool_definitions(self):
        for tool in self._tools.values():
            tool_annotations = getattr(tool, "annotations", None)
            if tool_annotations is None:
                raise ValueError(f"MCP tool {tool.name} is missing annotations")
            annotations = SettaToolAnnotations.model_validate(
                tool_annotations.model_dump()
            )
            namespaced_name = build_namespaced_tool_name(self._server_id, tool.name)
            definition = {
                "type": "function",
                "function": {
                    "name": namespaced_name,
                    "description": tool.description or "",
                    "parameters": tool.parameters or {},
                },
            }
            self.tool_definitions[namespaced_name] = definition
            self.tool_annotations_by_name[namespaced_name] = annotations
            self._routing[namespaced_name] = tool.name

    def tool_definitions_for_servers(self, server_ids: set[str]) -> dict[str, dict]:
        if self._server_id in server_ids:
            return self.tool_definitions
        return {}

    def tool_annotations_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, SettaToolAnnotations]:
        if self._server_id in server_ids:
            return self.tool_annotations_by_name
        return {}

    async def call_tool(self, tool_name: str, arguments: dict):
        resolved_name = self._routing.get(tool_name, tool_name)
        tool = self._tools.get(resolved_name)
        if tool is None:
            raise KeyError(f"MCP tool '{tool_name}' is not registered")
        result = await tool.run(arguments, context=self._context)
        structured_content = None
        if isinstance(result, str):
            text_result = result
        elif hasattr(result, "model_dump"):
            structured_content = result.model_dump()
            text_result = json.dumps(structured_content)
        elif hasattr(result, "model_dump_json"):
            text_result = result.model_dump_json()
            structured_content = json.loads(text_result)
        elif isinstance(result, dict):
            structured_content = result
            text_result = json.dumps(result)
        else:
            text_result = json.dumps(result)
        return CallToolResult(
            content=[TextContent(type="text", text=text_result)],
            structuredContent=structured_content,
            isError=False,
        )


class MCPServerToolRegistrationTest(unittest.IsolatedAsyncioTestCase):
    async def test_initializes_server_and_lists_tools(self) -> None:
        async with real_project_manager() as fixture:
            app = FastAPI()
            setta_state = _StubSettaState(fixture.dbe, fixture.manager)
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)

            mcp_server = SettaFastMCP(
                app,
                setta_state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                fixture.dbe,
            )
            setta_state.mcp_server = mcp_server
            setta_state.mcp_client = _StubMCPClient(mcp_server)

            registered_tool_names = sorted(
                tool.name for tool in mcp_server.list_registered_tools()
            )

            self.assertGreater(len(registered_tool_names), 0)
            self.assertIn("read_file_range", registered_tool_names)

    async def test_does_not_register_project_config_id_in_temp_map(self) -> None:
        async with real_project_manager() as fixture:
            app = FastAPI()
            setta_state = _StubSettaState(fixture.dbe, fixture.manager)
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)

            mcp_server = SettaFastMCP(
                app,
                setta_state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                fixture.dbe,
            )
            setta_state.mcp_server = mcp_server

            async def _dummy_tool(projectConfigId: ID):
                return {"projectConfigId": projectConfigId}

            wrapped_tool = mcp_server.setta_id_transformer(_dummy_tool)

            project_config_id = ID("test-project-uuid")
            self.assertNotIn(project_config_id, mcp_server.canonical_to_temporary)

            await wrapped_tool(projectConfigId=str(project_config_id))

            self.assertNotIn(project_config_id, mcp_server.canonical_to_temporary)
            temporary_to_canonical, canonical_to_temporary = (
                fixture.dbe.read_temporary_id_map()
            )
            self.assertNotIn(project_config_id, canonical_to_temporary)
            self.assertNotIn(project_config_id, temporary_to_canonical.values())

    async def test_tool_param_descriptions_from_docstrings(self) -> None:
        async with real_project_manager() as fixture:
            app = FastAPI()
            setta_state = _StubSettaState(fixture.dbe, fixture.manager)
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)

            mcp_server = SettaFastMCP(
                app,
                setta_state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                fixture.dbe,
            )

            tool = next(
                tool
                for tool in mcp_server.list_registered_tools()
                if tool.name == "getTerminalOutput"
            )
            properties = tool.parameters.get("properties", {})
            section_schema = properties.get("sectionId")
            self.assertIsInstance(section_schema, dict)
            self.assertEqual(
                section_schema.get("description"),
                "The id of the terminal.",
            )
