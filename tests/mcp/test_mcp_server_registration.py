import json
import unittest

import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.types import CallToolResult, TextContent
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
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
    def __init__(self, mcp_server: SettaFastMCP, server_id: str = "setta"):
        self._server_id = server_id
        self._tools = {tool.name: tool for tool in mcp_server.list_registered_tools()}
        self.init_tool_definitions: dict[str, dict] = {}
        self.discoverable_tool_definitions: dict[str, dict] = {}
        self.tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
        self._tool_cache_version = 0
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
            definition = {
                "type": "function",
                "function": {
                    "name": f"{self._server_id}.{tool.name}",
                    "description": tool.description or "",
                    "parameters": tool.parameters or {},
                },
            }
            namespaced_name = definition["function"]["name"]
            if tool_type == SettaToolType.init:
                self.init_tool_definitions[namespaced_name] = definition
            elif tool_type == SettaToolType.discoverable:
                self.discoverable_tool_definitions[namespaced_name] = definition
            self.tool_annotations_by_name[namespaced_name] = annotations
        self._tool_cache_version += 1

    @property
    def tool_cache_version(self) -> int:
        return self._tool_cache_version

    def _split_namespaced_tool_name(self, tool_name: str) -> str:
        if "." not in tool_name:
            raise ValueError("Tool name must be namespaced")
        server_id, base_name = tool_name.split(".", 1)
        if server_id != self._server_id:
            raise KeyError(f"MCP server '{server_id}' is not registered")
        if not base_name:
            raise ValueError("Tool name is missing tool name")
        return base_name

    async def call_tool(self, tool_name: str, arguments: dict):
        base_name = self._split_namespaced_tool_name(tool_name)
        tool = self._tools[base_name]
        result = await tool.run(arguments, context=None)
        if isinstance(result, str):
            text_result = result
        elif hasattr(result, "model_dump_json"):
            text_result = result.model_dump_json()
        elif hasattr(result, "model_dump"):
            text_result = json.dumps(result.model_dump())
        else:
            text_result = json.dumps(result)
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

            search_results = search_and_unlock_mcp_tools(
                query="section size settings",
                limit=2,
                setta_state=setta_state,
            )
            search_result_names = [result.name for result in search_results.root]
            print("Search results:", search_result_names)
            self.assertIn("set_section_sizes", search_result_names)
            self.assertNotIn(
                "search_and_unlock_mcp_tools",
                search_result_names,
            )

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
            parsed_results = results_via_tool_run.root
            parsed_result_names = [result.name for result in parsed_results]
            print("Search results via tool run:", parsed_result_names)
            self.assertIn("set_section_sizes", parsed_result_names)
            self.assertNotIn(
                "search_and_unlock_mcp_tools",
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

            search_scenarios = (
                ("create section", 2),
                ("create sections", 3),
            )
            for query, limit in search_scenarios:
                results = search_and_unlock_mcp_tools(
                    query=query,
                    limit=limit,
                    setta_state=setta_state,
                )
                result_names = [result.name for result in results.root]
                self.assertIn(
                    "create_top_level_section",
                    result_names,
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
                setta_state.project_manager_switcher,
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
                    name=f"setta.{C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME}",
                    arguments={"query": "section size settings", "limit": 2},
                )
            )

            tool_message = await chat_manager._dispatch_tool_call(chat, tool_call)

            search_result_names = [
                entry.get("name")
                for entry in tool_message.result.get("searchResults", [])
                if isinstance(entry, dict)
            ]
            self.assertIn("setta.set_section_sizes", search_result_names)
            chat_state = chat_manager._get_or_create_chat_tool_state(chat.id)
            self.assertIn("setta.set_section_sizes", chat_state.unlocked_tools)

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
