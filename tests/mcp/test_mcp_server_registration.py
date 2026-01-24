import logging
import unittest
from types import SimpleNamespace
import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from setta.llm.chat_toolkit.managed.tool_runner import build_execute_tool_calls_action
from setta.llm.chat_store import AgentRunChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.managed.action_executor import ManagedActionExecutor
from setta.llm.chat_toolkit.managed.actions import EmitChunkAction
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.mcp.tools.tool_search import search_mcp_tools
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.terminals.terminals import Terminals
from setta.types.chat_messages import ToolCall, ToolCallFunction, ToolReferenceContent
from setta.types.id import ID
from setta.types.llm_config import MCPServerConfig
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from watchdog.observers.polling import PollingObserver

from tests.utils.manager_fixture import real_project_manager, real_settings_manager

specific_file_watcher.Observer = PollingObserver
lsp_file_watcher.Observer = PollingObserver


def _build_state(project_fixture, settings_fixture, frontend_sender):
    project_manager_switcher = ProjectManagerSwitcher(
        main_manager=project_fixture.manager,
        settings_manager=settings_fixture.manager,
    )
    terminals = Terminals(frontend_sender, settings_fixture.settings_file)
    return SimpleNamespace(
        dbe=project_fixture.dbe,
        project_manager_switcher=project_manager_switcher,
        terminals=terminals,
    )


class MCPServerToolRegistrationTest(unittest.IsolatedAsyncioTestCase):
    async def test_initializes_server_and_lists_tools(self) -> None:
        async with real_project_manager() as fixture, real_settings_manager() as settings_fixture:
            app = FastAPI()
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)
            setta_state = _build_state(fixture, settings_fixture, frontend_sender)

            mcp_server = SettaFastMCP(
                app,
                setta_state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                fixture.dbe,
            )
            setta_state.mcp_server = mcp_server
            mcp_client = MultiMCPClient(
                {SETTA_MCP_SERVER_ID: MCPServerConfig(transport="stdio", command="noop")}
            )
            tools = await mcp_server.list_tools()
            mcp_client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, list(tools))
            setta_state.mcp_client = mcp_client
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
        async with real_project_manager() as fixture, real_settings_manager() as settings_fixture:
            app = FastAPI()
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)
            setta_state = _build_state(fixture, settings_fixture, frontend_sender)

            mcp_server = SettaFastMCP(
                app,
                setta_state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                fixture.dbe,
            )
            setta_state.mcp_server = mcp_server
            mcp_client = MultiMCPClient(
                {SETTA_MCP_SERVER_ID: MCPServerConfig(transport="stdio", command="noop")}
            )
            tools = await mcp_server.list_tools()
            mcp_client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, list(tools))
            setta_state.mcp_client = mcp_client
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
        async with real_project_manager() as fixture, real_settings_manager() as settings_fixture:
            app = FastAPI()
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)
            setta_state = _build_state(fixture, settings_fixture, frontend_sender)

            mcp_server = SettaFastMCP(
                app,
                setta_state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                fixture.dbe,
            )
            setta_state.mcp_server = mcp_server

            mcp_client = MultiMCPClient(
                {SETTA_MCP_SERVER_ID: MCPServerConfig(transport="stdio", command="noop")}
            )
            tools = await mcp_server.list_tools()
            mcp_client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, list(tools))
            setta_state.mcp_client = mcp_client

            history = ChatHistory(AgentRunChatStore(fixture.dbe))
            executor = ManagedActionExecutor(
                chat_history=history,
                websocket_msg_handler=frontend_sender,
                mcp_client=mcp_client,
                dbe=fixture.dbe,
                search_tool_name=build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
                ),
                logger=logging.getLogger(__name__),
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
                project_config_id=ID(
                    fixture.manager.project_state_backend.defaultProjectConfigId
                ),
                chat_id=ID("chat-uuid"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
            )
            if execute_action is None:
                raise AssertionError("Expected tool execution action")
            actions = await executor.apply(execute_action)
            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
            self.assertEqual(len(emit_actions), 1)
            tool_message = emit_actions[0].chunk.result

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
        async with real_project_manager() as fixture, real_settings_manager() as settings_fixture:
            app = FastAPI()
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)
            setta_state = _build_state(fixture, settings_fixture, frontend_sender)

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
        async with real_project_manager() as fixture, real_settings_manager() as settings_fixture:
            app = FastAPI()
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)
            setta_state = _build_state(fixture, settings_fixture, frontend_sender)

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
