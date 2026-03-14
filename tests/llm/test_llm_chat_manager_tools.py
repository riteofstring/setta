import logging
from contextlib import asynccontextmanager
from types import SimpleNamespace

import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.types import CallToolResult, TextContent
import pytest

from setta.agentic.agentic_scope import AgenticContext, AgenticScope
from setta.llm.agent_runner import AgentRunner
from setta.llm.chat_store import AgentRunChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.managed.action_executor import ManagedActionExecutor
from setta.llm.chat_toolkit.managed.actions import EmitChunkAction
from setta.llm.chat_toolkit.managed.tool_runner import build_execute_tool_calls_action
from setta.llm.chat_toolkit.managed.tool_search import (
    build_search_tool_chat_message,
    parse_search_tool_results,
    run_local_search_tool,
)
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.server import SettaFastMCP
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.terminals.terminals import Terminals
from setta.types.agentic import AgentProfile
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
async def _build_runner_with_mcp():
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
            runner = AgentRunner(project_fixture.dbe, mcp_client, frontend_sender)
            yield runner, mcp_client, project_fixture


def _configure_runner(runner: AgentRunner, llm_config: LLMConfig) -> None:
    runner.update_config(
        AllLLMConfigs(
            configs={llm_config.id: llm_config},
            mcpServers={SETTA_MCP_SERVER_ID: _MCP_CONFIG},
            defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
        )
    )


def _build_messages() -> list[UserChatMessage]:
    return [UserChatMessage(content=[MessageTextContent(text="Hello tools")])]


def _build_messages_with_tool_reference(
    *,
    search_tool_name: str,
    referenced_tool_name: str,
) -> list[UserChatMessage | ToolChatMessage]:
    return [
        UserChatMessage(content=[MessageTextContent(text="Search for tools")]),
        ToolChatMessage(
            tool_call_id="tool-call-1",
            tool_name=search_tool_name,
            content=[ToolReferenceContent(tool_name=referenced_tool_name)],
        ),
    ]


def _build_system_prompt(runner: AgentRunner, project_config_id: ID) -> str:
    profile = AgentProfile(name="Managed chat", description="", systemPrompt="")
    return runner._build_system_prompt(profile, project_config_id)


def _build_permissive_agentic_scope() -> AgenticScope:
    # Tool payload tests aren't validating agentic scope filtering; provide a
    # permissive scope so structural/read/write tools are all available.
    allowed = ID("scope-section")
    return AgenticScope(
        read_section_ids={allowed},
        write_section_ids={allowed},
        context_section_ids=set(),
        peer_chat_section_ids=set(),
        structural_allowed=True,
    )


class TestToolPayload:
    pytestmark = pytest.mark.asyncio
    async def test_non_anthropic_payload_includes_all_tools_without_defer_loading(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, fixture):
            llm_config = LLMConfig(
                id="provider-one",
                model="gpt-4o",
                provider="openai",
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=_build_messages(),
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            tools = payload["tools"]
            tool_names = sorted(tool["function"]["name"] for tool in tools)
            expected = {}
            expected.update(
                mcp_client.init_tool_definitions_for_servers({SETTA_MCP_SERVER_ID})
            )
            expected.update(
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected_names = sorted(
                name for name in expected.keys() if name != runner._search_tool_name
            )

            assert tool_names == expected_names
            assert all("defer_loading" not in tool for tool in tools)

    async def test_anthropic_payload_includes_search_tool_with_defer_loading(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, fixture):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=_build_messages(),
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            tools = payload["tools"]
            tool_names = sorted(tool["function"]["name"] for tool in tools)
            expected = {}
            init_tools = mcp_client.init_tool_definitions_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            discoverable_tools = mcp_client.discoverable_tool_definitions_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            expected.update(init_tools)
            expected.update(discoverable_tools)
            expected_names = sorted(expected.keys())

            assert tool_names == expected_names
            assert runner._search_tool_name in tool_names
            assert init_tools
            init_payload = [
                tool for tool in tools if tool["function"]["name"] in init_tools
            ]
            assert init_payload
            assert (
                all("defer_loading" not in tool for tool in init_payload)
            )
            for tool in tools:
                name = tool["function"]["name"]
                if name in discoverable_tools:
                    assert tool.get("defer_loading") is True
                else:
                    assert "defer_loading" not in tool

    async def test_anthropic_payload_adds_tool_search_beta_header(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, _mcp_client, fixture):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=_build_messages(),
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            extra_headers = payload.get("extra_headers")
            assert isinstance(extra_headers, dict)
            beta_header = extra_headers.get("anthropic-beta")
            assert isinstance(beta_header, str)
            assert "advanced-tool-use-2025-11-20" in beta_header

    async def test_anthropic_payload_merges_existing_beta_header(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, _mcp_client, fixture):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
                other_params={
                    "extra_headers": {
                        "anthropic-beta": ["prompt-caching-2024-07-31"],
                    }
                },
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=_build_messages(),
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            extra_headers = payload.get("extra_headers")
            assert isinstance(extra_headers, dict)
            beta_header = extra_headers.get("anthropic-beta")
            assert isinstance(beta_header, str)
            assert "prompt-caching-2024-07-31" in beta_header
            assert "advanced-tool-use-2025-11-20" in beta_header

    async def test_non_anthropic_payload_strips_tool_reference_content(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, fixture):
            llm_config = LLMConfig(
                id="provider-openai",
                model="gpt-4o",
                provider="openai",
            )
            _configure_runner(runner, llm_config)
            discoverable_tools = mcp_client.discoverable_tool_definitions_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            assert discoverable_tools
            referenced_tool = sorted(discoverable_tools.keys())[0]
            messages = _build_messages_with_tool_reference(
                search_tool_name=runner._search_tool_name,
                referenced_tool_name=referenced_tool,
            )
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=messages,
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            tool_messages = [
                message
                for message in payload["messages"]
                if message.get("role") == "tool"
            ]
            assert len(tool_messages) == 1
            content = tool_messages[0].get("content")
            assert isinstance(content, list)
            assert len(content) == 1
            entry = content[0]
            assert isinstance(entry, dict)
            assert entry.get("type") == "text"
            assert referenced_tool in entry.get("text", "")

    async def test_anthropic_payload_preserves_tool_reference_content(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, fixture):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_runner(runner, llm_config)
            discoverable_tools = mcp_client.discoverable_tool_definitions_for_servers(
                {SETTA_MCP_SERVER_ID}
            )
            assert discoverable_tools
            referenced_tool = sorted(discoverable_tools.keys())[0]
            messages = _build_messages_with_tool_reference(
                search_tool_name=runner._search_tool_name,
                referenced_tool_name=referenced_tool,
            )
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=messages,
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            tool_messages = [
                message
                for message in payload["messages"]
                if message.get("role") == "tool"
            ]
            assert len(tool_messages) == 1
            content = tool_messages[0].get("content")
            assert isinstance(content, list)
            assert len(content) == 1
            entry = content[0]
            assert isinstance(entry, dict)
            assert entry.get("type") == "tool_reference"
            assert entry.get("tool_name") == referenced_tool

    async def test_bedrock_payload_excludes_search_tool_and_defer_loading(
        self,
    ) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, fixture):
            llm_config = LLMConfig(
                id="bedrock-claude",
                model="claude-sonnet-4-5-20250929",
                provider="bedrock",
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=_build_messages(),
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
            )

            tools = payload["tools"]
            tool_names = sorted(tool["function"]["name"] for tool in tools)
            expected = {}
            expected.update(
                mcp_client.init_tool_definitions_for_servers({SETTA_MCP_SERVER_ID})
            )
            expected.update(
                mcp_client.discoverable_tool_definitions_for_servers(
                    {SETTA_MCP_SERVER_ID}
                )
            )
            expected_names = sorted(
                name for name in expected.keys() if name != runner._search_tool_name
            )

            assert tool_names == expected_names
            assert all("defer_loading" not in tool for tool in tools)


class TestToolSearchResult:
    pytestmark = pytest.mark.asyncio
    async def test_anthropic_search_returns_tool_reference_blocks(self) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, _fixture):
            server_ids = [SETTA_MCP_SERVER_ID]
            available = mcp_client.discoverable_tool_definitions_for_servers(
                set(server_ids)
            )
            annotations = mcp_client.tool_annotations_for_servers(set(server_ids))
            assert available

            first_tool = sorted(available.keys())[0]
            query = first_tool.split("__", 1)[-1].replace("_", " ")
            call_result = run_local_search_tool(
                arguments={"query": query, "limit": 1},
                available_tools=available,
                annotations_by_name=annotations,
            )
            search_results = parse_search_tool_results(call_result)
            assert search_results

            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=runner._search_tool_name,
                    arguments={"query": query, "limit": 1},
                )
            )
            tool_message, _ = build_search_tool_chat_message(
                tool_name=runner._search_tool_name,
                tool_call=tool_call,
                call_result=call_result,
                arguments={"query": query, "limit": 1},
                started_at=get_now_timestamp(),
                completed_at=get_now_timestamp(),
                available_tools=available,
            )

            assert tool_message.content
            for entry in tool_message.content:
                assert isinstance(entry, ToolReferenceContent)
                assert entry.tool_name in available

    async def test_anthropic_search_no_results_returns_text_summary(self) -> None:
        async with _build_runner_with_mcp() as (runner, _mcp_client, _fixture):
            call_result = CallToolResult(
                content=[TextContent(type="text", text='{"results": []}')],
                structuredContent={"results": []},
                isError=False,
            )
            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=runner._search_tool_name,
                    arguments={"query": "missing tool", "limit": 1},
                )
            )
            tool_message, _ = build_search_tool_chat_message(
                tool_name=runner._search_tool_name,
                tool_call=tool_call,
                call_result=call_result,
                arguments={"query": "missing tool", "limit": 1},
                started_at=get_now_timestamp(),
                completed_at=get_now_timestamp(),
                available_tools={},
            )

            assert tool_message.content
            assert len(tool_message.content) == 1
            entry = tool_message.content[0]
            assert isinstance(entry, TextContent)
            assert "Search did not return any MCP tools." in entry.text

    async def test_tool_references_exist_in_payload_tools(self) -> None:
        async with _build_runner_with_mcp() as (runner, mcp_client, fixture):
            llm_config = LLMConfig(
                id="claude-sonnet",
                model="claude-sonnet-4-5-20250929",
                provider="anthropic",
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            system_prompt = _build_system_prompt(runner, project_config_id)
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=_build_messages(),
                thinking=False,
                system_prompt=system_prompt,
                allowlist=None,
                agentic_scope=_build_permissive_agentic_scope(),
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
            assert available

            first_tool = sorted(available.keys())[0]
            query = first_tool.split("__", 1)[-1].replace("_", " ")
            call_result = run_local_search_tool(
                arguments={"query": query, "limit": 1},
                available_tools=available,
                annotations_by_name=annotations,
            )

            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=runner._search_tool_name,
                    arguments={"query": query, "limit": 1},
                )
            )
            tool_message, _ = build_search_tool_chat_message(
                tool_name=runner._search_tool_name,
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
            assert reference_names
            for name in reference_names:
                assert name in payload_tool_names


class TestToolDispatch:
    pytestmark = pytest.mark.asyncio
    async def test_missing_tool_returns_error_result(self) -> None:
        async with _build_runner_with_mcp() as (runner, _mcp_client, fixture):
            llm_config = LLMConfig(
                id="provider-openai",
                model="gpt-4o",
                provider="openai",
            )
            _configure_runner(runner, llm_config)
            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            tool_name = "setta__change_section_impl"
            tool_call = ToolCall(
                function=ToolCallFunction(
                    name=tool_name,
                    arguments={},
                )
            )
            chat_id = ID("chat-uuid")
            execute_action = build_execute_tool_calls_action(
                project_config_id=project_config_id,
                chat_id=chat_id,
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=chat_id,
                    section_id=None,
                ),
            )
            if execute_action is None:
                raise AssertionError("Expected tool execution action")

            history = ChatHistory(AgentRunChatStore(fixture.dbe))
            executor = ManagedActionExecutor(
                chat_history=history,
                websocket_msg_handler=runner.websocket_msg_handler,
                mcp_client=runner.mcp_client,
                dbe=fixture.dbe,
                search_tool_name=runner._search_tool_name,
                logger=logging.getLogger(__name__),
            )

            actions = await executor.apply(execute_action)
            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            assert len(emit_actions) == 1
            tool_message = emit_actions[0].chunk.result

            assert tool_message.is_error
            assert tool_message.tool_name == tool_name
            assert tool_message.content
            entry = tool_message.content[0]
            assert isinstance(entry, TextContent)
            assert "not registered" in entry.text
            assert runner._search_tool_name in entry.text
