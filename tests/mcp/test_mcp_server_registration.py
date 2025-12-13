import json
import unittest

import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.types import CallToolResult, TextContent
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_metadata import SettaToolType
from setta.mcp.tools.tool_search import search_and_unlock_mcp_tools
from setta.types.chat_messages import (
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
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

    def __init__(self, dbe, manager):
        self.dbe = dbe
        self.project_manager_switcher = _StubProjectManagerSwitcher(manager)


class _StubFrontendSender:
    def __init__(self):
        self.sent_events: list[tuple[str, object]] = []

    async def send_streaming_response(self, chat_id, chunk):
        self.sent_events.append((chat_id, chunk))


class _StubMCPClient:
    def __init__(self, mcp_server: SettaFastMCP):
        self._tools = {tool.name: tool for tool in mcp_server.list_registered_tools()}
        self.init_tool_definitions: dict[str, dict] = {}
        self.discoverable_tool_definitions: dict[str, dict] = {}
        self._populate_tool_definitions()

    def _populate_tool_definitions(self):
        for tool in self._tools.values():
            tool_annotations = getattr(tool, "annotations", None)
            tool_type = getattr(tool_annotations, "settaToolType", None)
            definition = {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description or "",
                    "parameters": tool.parameters or {},
                },
            }
            if tool_type == SettaToolType.init:
                self.init_tool_definitions[tool.name] = definition
            elif tool_type == SettaToolType.discoverable:
                self.discoverable_tool_definitions[tool.name] = definition

    async def call_tool(self, tool_name: str, arguments: dict):
        tool = self._tools[tool_name]
        result = await tool.run(arguments, context=None)
        text_result = result if isinstance(result, str) else json.dumps(result)
        return CallToolResult(
            content=[TextContent(type="text", text=text_result)],
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

            registered_tool_names = sorted(
                tool.name for tool in mcp_server.list_registered_tools()
            )
            print("Registered MCP tools:", registered_tool_names)

            self.assertGreater(len(registered_tool_names), 0)
            self.assertIn("read_file_range", registered_tool_names)

            search_results = json.loads(
                search_and_unlock_mcp_tools(
                    query="section size settings",
                    limit=2,
                    setta_state=setta_state,
                )
            )
            print("Search results:", search_results)
            self.assertIn("set_section_sizes", search_results)
            self.assertNotIn("search_and_unlock_mcp_tools", search_results)

            search_tool = next(
                tool
                for tool in mcp_server.list_registered_tools()
                if tool.name == C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME
            )
            results_via_tool_run = await search_tool.run(
                {
                    "query": "section size settings",
                    "limit": 2,
                },
                context=None,
            )
            parsed_results = json.loads(results_via_tool_run)
            print("Search results via tool run:", parsed_results)
            self.assertIn("set_section_sizes", parsed_results)
            self.assertNotIn("search_and_unlock_mcp_tools", parsed_results)

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

            for query in ("create section", "create sections"):
                results = json.loads(
                    search_and_unlock_mcp_tools(
                        query=query,
                        limit=2,
                        setta_state=setta_state,
                    )
                )
                self.assertIn(
                    "create_top_level_section",
                    results,
                    msg=(
                        f"search results for '{query}' did not include "
                        "create_top_level_section"
                    ),
                )

    async def test_chat_manager_unlocks_tools_from_search(self) -> None:
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
                ID(project_config_id),
            )

            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME,
                    arguments={"query": "section size settings", "limit": 2},
                )
            )

            tool_message = await chat_manager._dispatch_tool_call(chat, tool_call)

            self.assertIn("set_section_sizes", tool_message.result["searchResults"])
            chat_state = chat_manager._get_or_create_chat_tool_state(chat.id)
            self.assertIn("set_section_sizes", chat_state.unlocked_tools)

    async def test_registers_project_config_id_in_temp_map(self) -> None:
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

            project_id = ID("test-project-uuid")
            self.assertNotIn(project_id, mcp_server.canonical_to_temporary)

            await wrapped_tool(projectConfigId=str(project_id))

            temp_id = mcp_server.canonical_to_temporary.get(project_id)
            self.assertIsNotNone(temp_id)
            self.assertEqual(
                mcp_server.temporary_to_canonical.get(temp_id),
                project_id,
            )

            temporary_to_canonical, canonical_to_temporary = (
                fixture.dbe.read_temporary_id_map()
            )
            self.assertEqual(canonical_to_temporary.get(project_id), temp_id)
            self.assertEqual(temporary_to_canonical.get(temp_id), project_id)
