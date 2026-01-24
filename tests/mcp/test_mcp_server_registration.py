import json
import unittest
import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.types import CallToolResult, TextContent
from setta.llm.chat_toolkit.managed.tool_runner import build_execute_tool_calls_action
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.mcp.tools.tool_search import search_mcp_tools
from setta.types.chat_messages import (
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    ToolReferenceContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.utils.constants import C
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


class _StubFrontendSender:
    def __init__(self):
        self.sent_events: list[tuple[str, object]] = []

    async def send_streaming_response(self, chat_id, chunk):
        self.sent_events.append((chat_id, chunk))


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
        self.init_tool_definitions: dict[str, dict] = {}
        self.discoverable_tool_definitions: dict[str, dict] = {}
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
            tool_type = annotations.settaToolType
            namespaced_name = build_namespaced_tool_name(self._server_id, tool.name)
            definition = {
                "type": "function",
                "function": {
                    "name": namespaced_name,
                    "description": tool.description or "",
                    "parameters": tool.parameters or {},
                },
            }
            if tool_type == SettaToolType.init:
                self.init_tool_definitions[namespaced_name] = definition
            elif tool_type == SettaToolType.discoverable:
                self.discoverable_tool_definitions[namespaced_name] = definition
            self.tool_annotations_by_name[namespaced_name] = annotations
            self._routing[namespaced_name] = tool.name

    def init_tool_definitions_for_servers(self, server_ids: set[str]) -> dict[str, dict]:
        if self._server_id in server_ids:
            return self.init_tool_definitions
        return {}

    def discoverable_tool_definitions_for_servers(
        self, server_ids: set[str]
    ) -> dict[str, dict]:
        if self._server_id in server_ids:
            return self.discoverable_tool_definitions
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
            ctx = Context(fastmcp=mcp_server)

            registered_tool_names = sorted(
                tool.name for tool in mcp_server.list_registered_tools()
            )

            self.assertGreater(len(registered_tool_names), 0)
            self.assertIn("read_file_range", registered_tool_names)

            search_results = search_mcp_tools(
                query="section size settings",
                limit=2,
                ctx=ctx,
            )
            search_result_names = [result.name for result in search_results.results]
            self.assertIn(
                "set_section_sizes",
                search_result_names,
            )
            self.assertNotIn(
                C.SEARCH_MCP_TOOLS_NAME,
                search_result_names,
            )

            search_tool = next(
                tool
                for tool in mcp_server.list_registered_tools()
                if tool.name == C.SEARCH_MCP_TOOLS_NAME
            )
            results_via_tool_run = await search_tool.run(
                {
                    "query": "section size settings",
                    "limit": 2,
                },
                context=ctx,
            )
            parsed_results = results_via_tool_run.results
            parsed_result_names = [result.name for result in parsed_results]
            self.assertIn(
                "set_section_sizes",
                parsed_result_names,
            )
            self.assertNotIn(
                C.SEARCH_MCP_TOOLS_NAME,
                parsed_result_names,
            )

    async def test_search_finds_create_top_level_section(self) -> None:
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
            ctx = Context(fastmcp=mcp_server)

            search_scenarios = (
                ("create section", 2),
                ("create sections", 3),
            )
            for query, limit in search_scenarios:
                results = search_mcp_tools(
                    query=query,
                    limit=limit,
                    ctx=ctx,
                )
                result_names = [result.name for result in results.results]
                self.assertIn(
                    "create_top_level_section",
                    result_names,
                    msg=(
                        f"search results for '{query}' did not include "
                        "create_top_level_section"
                    ),
                )

    async def test_chat_manager_returns_tool_references_from_search(self) -> None:
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

            mcp_client = _StubMCPClient(mcp_server)
            setta_state.mcp_client = mcp_client
            websocket_sender = _StubFrontendSender()
            chat_manager = LLMChatManager(
                fixture.dbe,
                mcp_client,
                websocket_sender,
            )

            chat_manager.update_config(
                AllLLMConfigs(
                    configs={
                        "default": LLMConfig(
                            id="default",
                            model="fake-model",
                        )
                    },
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="stdio",
                            command="noop",
                        )
                    },
                    defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
                    default_config_id="default",
                )
            )

            project_config_id = (
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            self.assertIsNotNone(project_config_id)
            user_message = UserChatMessage(
                content=[MessageTextContent(text="help me size sections")]
            )
            chat = chat_manager.get_or_create_chat(
                None,
                user_message,
                "default",
            )

            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=build_namespaced_tool_name(
                        SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
                    ),
                    arguments={"query": "section size settings", "limit": 2},
                )
            )

            execute_action = build_execute_tool_calls_action(
                project_config_id=ID(project_config_id),
                chat_id=chat.id,
                tool_calls=[tool_call],
                allowed_server_ids=set(
                    chat_manager._resolve_mcp_server_ids(chat.llmConfig)
                ),
                share_session_id=chat_manager.share_session_id,
            )
            if execute_action is None:
                raise AssertionError("Expected tool execution action")
            tool_results = await chat_manager._apply_actions([execute_action])
            self.assertEqual(len(tool_results), 1)
            tool_message = tool_results[0]

            search_result_names = [
                entry.get("name")
                for entry in tool_message.result.get("searchResults", [])
                if isinstance(entry, dict)
            ]
            self.assertIn(
                build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "set_section_sizes"),
                search_result_names,
            )
            referenced_names = [
                entry.tool_name
                for entry in tool_message.content
                if isinstance(entry, ToolReferenceContent)
            ]
            self.assertIn(
                build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "set_section_sizes"),
                referenced_names,
            )

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
