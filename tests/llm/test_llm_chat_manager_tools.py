import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace

import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.types import CallToolResult, TextContent

from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.server import SettaFastMCP
from setta.project_state.project_manager_types import CreateTopLevelSectionRequest
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.terminals.terminals import Terminals
from setta.types.chat import Chat
from setta.types.chat_messages import (
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    ToolChatMessage,
    ToolReferenceContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.types.section_impls import SectionType
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.manager_fixture import real_project_manager, real_settings_manager

_MCP_CONFIG = MCPServerConfig(
    transport="sse",
    url=f"http://{C.DEFAULT_HOST}:{C.DEFAULT_PORT}/mcp",
)


@asynccontextmanager
async def _build_manager_with_mcp():
    async with real_project_manager() as project_fixture:
        async with real_settings_manager() as settings_fixture:
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            project_manager_switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            terminals = Terminals(frontend_sender, settings_fixture.settings_file)
            state = SimpleNamespace(
                dbe=project_fixture.dbe,
                project_manager_switcher=project_manager_switcher,
                terminals=terminals,
            )
            app = FastAPI()
            mcp_server = SettaFastMCP(
                app,
                state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                project_fixture.dbe,
            )
            mcp_client = MultiMCPClient({SETTA_MCP_SERVER_ID: _MCP_CONFIG})
            tools = await mcp_server.list_tools()
            mcp_client._update_tool_cache_for_server(
                SETTA_MCP_SERVER_ID,
                list(tools),
            )
            manager = LLMChatManager(
                project_fixture.dbe,
                mcp_client,
                frontend_sender,
            )
            yield manager, mcp_client


@asynccontextmanager
async def _build_manager_with_project_summary():
    async with real_project_manager() as project_fixture:
        async with real_settings_manager() as settings_fixture:
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            project_manager_switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            manager = LLMChatManager(
                project_fixture.dbe,
                MultiMCPClient({}),
                frontend_sender,
                project_manager_switcher=project_manager_switcher,
            )
            yield manager, project_fixture


def _configure_manager(manager: LLMChatManager, llm_config: LLMConfig) -> None:
    manager.config = AllLLMConfigs(
        configs={llm_config.id: llm_config},
        mcpServers={SETTA_MCP_SERVER_ID: _MCP_CONFIG},
        defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
    )


def _build_chat(llm_config: LLMConfig) -> Chat:
    return Chat(
        id=ID("chat-uuid"),
        name="Tool payload chat",
        projectConfigId=ID("project-uuid"),
        llmConfig=llm_config,
        messages=[
            UserChatMessage(content=[MessageTextContent(text="Hello tools")])
        ],
    )


def _build_chat_with_tool_reference(
    llm_config: LLMConfig,
    *,
    search_tool_name: str,
    referenced_tool_name: str,
) -> Chat:
    return Chat(
        id=ID("chat-uuid"),
        name="Tool reference chat",
        projectConfigId=ID("project-uuid"),
        llmConfig=llm_config,
        messages=[
            UserChatMessage(content=[MessageTextContent(text="Search for tools")]),
            ToolChatMessage(
                tool_call_id="tool-call-1",
                tool_name=search_tool_name,
                content=[ToolReferenceContent(tool_name=referenced_tool_name)],
            ),
        ],
    )


class ToolPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_non_anthropic_payload_includes_all_tools_without_defer_loading(
        self,
    ) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            llm_config = LLMConfig(
                id="provider-one",
                model="gpt-4o",
                provider="openai",
            )
            _configure_manager(manager, llm_config)
            chat = _build_chat(llm_config)

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )

            tools = payload["tools"]
            tool_names = sorted(
                tool["function"]["name"] for tool in tools
            )
            expected = {}
            expected.update(
                mcp_client.init_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected.update(
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected_names = sorted(
                name
                for name in expected.keys()
                if name != manager._search_tool_name
            )

            self.assertEqual(tool_names, expected_names)
            self.assertTrue(
                all("defer_loading" not in tool for tool in tools)
            )

    async def test_anthropic_payload_includes_search_tool_with_defer_loading(
        self,
    ) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_manager(manager, llm_config)
            chat = _build_chat(llm_config)

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )

            tools = payload["tools"]
            tool_names = sorted(
                tool["function"]["name"] for tool in tools
            )
            expected = {}
            init_tools = mcp_client.init_tool_definitions_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            discoverable_tools = (
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected.update(init_tools)
            expected.update(discoverable_tools)
            expected_names = sorted(expected.keys())

            self.assertEqual(tool_names, expected_names)
            self.assertIn(manager._search_tool_name, tool_names)
            self.assertTrue(init_tools)
            init_payload = [
                tool
                for tool in tools
                if tool["function"]["name"] in init_tools
            ]
            self.assertTrue(init_payload)
            self.assertTrue(
                all("defer_loading" not in tool for tool in init_payload)
            )
            for tool in tools:
                name = tool["function"]["name"]
                if name in discoverable_tools:
                    self.assertEqual(tool.get("defer_loading"), True)
                else:
                    self.assertNotIn("defer_loading", tool)

    async def test_non_anthropic_payload_strips_tool_reference_content(
        self,
    ) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            llm_config = LLMConfig(
                id="provider-openai",
                model="gpt-4o",
                provider="openai",
            )
            _configure_manager(manager, llm_config)
            discoverable_tools = (
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            self.assertTrue(discoverable_tools)
            referenced_tool = sorted(discoverable_tools.keys())[0]
            chat = _build_chat_with_tool_reference(
                llm_config,
                search_tool_name=manager._search_tool_name,
                referenced_tool_name=referenced_tool,
            )

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )

            tool_messages = [
                message
                for message in payload["messages"]
                if message.get("role") == "tool"
            ]
            self.assertEqual(len(tool_messages), 1)
            content = tool_messages[0].get("content")
            self.assertIsInstance(content, list)
            self.assertEqual(len(content), 1)
            entry = content[0]
            self.assertIsInstance(entry, dict)
            self.assertEqual(entry.get("type"), "text")
            self.assertIn(referenced_tool, entry.get("text", ""))

    async def test_anthropic_payload_preserves_tool_reference_content(
        self,
    ) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_manager(manager, llm_config)
            discoverable_tools = (
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            self.assertTrue(discoverable_tools)
            referenced_tool = sorted(discoverable_tools.keys())[0]
            chat = _build_chat_with_tool_reference(
                llm_config,
                search_tool_name=manager._search_tool_name,
                referenced_tool_name=referenced_tool,
            )

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )

            tool_messages = [
                message
                for message in payload["messages"]
                if message.get("role") == "tool"
            ]
            self.assertEqual(len(tool_messages), 1)
            content = tool_messages[0].get("content")
            self.assertIsInstance(content, list)
            self.assertEqual(len(content), 1)
            entry = content[0]
            self.assertIsInstance(entry, dict)
            self.assertEqual(entry.get("type"), "tool_reference")
            self.assertEqual(entry.get("tool_name"), referenced_tool)

    async def test_bedrock_payload_excludes_search_tool_and_defer_loading(
        self,
    ) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            llm_config = LLMConfig(
                id="bedrock-claude",
                model="claude-sonnet-4-5-20250929",
                provider="bedrock",
            )
            _configure_manager(manager, llm_config)
            chat = _build_chat(llm_config)

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )

            tools = payload["tools"]
            tool_names = sorted(
                tool["function"]["name"] for tool in tools
            )
            expected = {}
            expected.update(
                mcp_client.init_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected.update(
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected_names = sorted(
                name
                for name in expected.keys()
                if name != manager._search_tool_name
            )

            self.assertEqual(tool_names, expected_names)
            self.assertTrue(
                all("defer_loading" not in tool for tool in tools)
            )


class ToolSearchResultTests(unittest.IsolatedAsyncioTestCase):
    async def test_anthropic_search_returns_tool_reference_blocks(self) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            server_ids = [SETTA_MCP_SERVER_ID]
            available = mcp_client.discoverable_tool_definitions_for_servers(
                set(server_ids)
            )
            annotations = mcp_client.tool_annotations_for_servers(set(server_ids))
            self.assertTrue(available)

            first_tool = sorted(available.keys())[0]
            query = first_tool.split("__", 1)[-1].replace("_", " ")
            call_result = manager._run_local_search_tool(
                arguments={"query": query, "limit": 1},
                available_tools=available,
                annotations_by_name=annotations,
            )
            search_results = manager._parse_search_tool_results(call_result)
            self.assertTrue(search_results)

            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=manager._search_tool_name,
                    arguments={"query": query, "limit": 1},
                )
            )
            tool_message = manager._build_search_tool_chat_message(
                chat_id=ID("chat-uuid"),
                tool_name=manager._search_tool_name,
                tool_call=tool_call,
                call_result=call_result,
                arguments={"query": query, "limit": 1},
                started_at=get_now_timestamp(),
                completed_at=get_now_timestamp(),
                available_tools=available,
            )

            self.assertTrue(tool_message.content)
            for entry in tool_message.content:
                self.assertIsInstance(entry, ToolReferenceContent)
                self.assertIn(entry.tool_name, available)

    async def test_anthropic_search_no_results_returns_text_summary(self) -> None:
        async with _build_manager_with_mcp() as (manager, _mcp_client):
            call_result = CallToolResult(
                content=[TextContent(type="text", text='{"results": []}')],
                structuredContent={"results": []},
                isError=False,
            )
            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=manager._search_tool_name,
                    arguments={"query": "missing tool", "limit": 1},
                )
            )
            tool_message = manager._build_search_tool_chat_message(
                chat_id=ID("chat-uuid"),
                tool_name=manager._search_tool_name,
                tool_call=tool_call,
                call_result=call_result,
                arguments={"query": "missing tool", "limit": 1},
                started_at=get_now_timestamp(),
                completed_at=get_now_timestamp(),
                available_tools={},
            )

            self.assertTrue(tool_message.content)
            self.assertEqual(len(tool_message.content), 1)
            entry = tool_message.content[0]
            self.assertIsInstance(entry, TextContent)
            self.assertIn("Search did not return any MCP tools.", entry.text)

    async def test_tool_references_exist_in_payload_tools(self) -> None:
        async with _build_manager_with_mcp() as (manager, mcp_client):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_manager(manager, llm_config)
            chat = _build_chat(llm_config)

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )
            payload_tool_names = {
                tool["function"]["name"] for tool in payload["tools"]
            }

            available = mcp_client.discoverable_tool_definitions_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            annotations = mcp_client.tool_annotations_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            self.assertTrue(available)

            first_tool = sorted(available.keys())[0]
            query = first_tool.split("__", 1)[-1].replace("_", " ")
            call_result = manager._run_local_search_tool(
                arguments={"query": query, "limit": 1},
                available_tools=available,
                annotations_by_name=annotations,
            )

            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=manager._search_tool_name,
                    arguments={"query": query, "limit": 1},
                )
            )
            tool_message = manager._build_search_tool_chat_message(
                chat_id=ID("chat-uuid"),
                tool_name=manager._search_tool_name,
                tool_call=tool_call,
                call_result=call_result,
                arguments={"query": query, "limit": 1},
                started_at=get_now_timestamp(),
                completed_at=get_now_timestamp(),
                available_tools=available,
            )

            reference_names = [
                entry.tool_name
                for entry in tool_message.content
                if isinstance(entry, ToolReferenceContent)
            ]
            self.assertTrue(reference_names)
            for name in reference_names:
                self.assertIn(name, payload_tool_names)


class PromptSummaryCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_prompt_is_cached_per_chat(self) -> None:
        async with _build_manager_with_project_summary() as (manager, fixture):
            llm_config = LLMConfig(
                id="default",
                model="gpt-4o",
            )
            manager.config = AllLLMConfigs(configs={llm_config.id: llm_config})
            project_config_id = (
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            self.assertIsNotNone(project_config_id)
            chat = Chat(
                id=ID("chat-uuid"),
                name="Prompt cache chat",
                projectConfigId=ID(project_config_id),
                llmConfig=llm_config,
                messages=[
                    UserChatMessage(content=[MessageTextContent(text="Hello prompt")])
                ],
            )

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )
            first_prompt = payload["messages"][0]["content"][0]["text"]
            self.assertIn("## Project summary", first_prompt)

            await fixture.manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=ID(project_config_id),
                    implType=SectionType.Code,
                )
            )

            payload = await manager._build_llm_request_payload(
                chat,
                deep_think=False,
            )
            second_prompt = payload["messages"][0]["content"][0]["text"]
            self.assertEqual(first_prompt, second_prompt)


if __name__ == "__main__":
    unittest.main()
