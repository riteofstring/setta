from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import pytest

import setta.routers.listener as listener_module
from setta.agentic.store import save_engine_configs
from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.tool_calls import ToolCallBuilder
from setta.routers.listener import (
    CreateChatRequest,
    RunMcpToolsRequest,
    route_create_chat,
    route_run_mcp_tools,
)
from setta.types.agentic import EngineConfig, EngineType
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, SCRIPTABLE_LLM_CONFIG_ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.runtime_context import runtime_context


@dataclass(slots=True)
class _RunnerStub:
    config: AllLLMConfigs
    disabled: bool = False


@dataclass(slots=True)
class _ListenerRouteState:
    dbe: DBE
    agent_runner: _RunnerStub
    wmh_frontend_sender: WMHFrontendSender
    mcp_client: object | None = None
    share_mode: bool = False
    deployment_mode: bool = False
    share_runtime_state: None = None


@pytest.mark.asyncio
async def test_create_chat_allows_scriptable_engine() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        state = _ListenerRouteState(
            dbe=dbe,
            agent_runner=_RunnerStub(config=AllLLMConfigs(configs={}, mcpServers={})),
            wmh_frontend_sender=frontend_sender,
        )
        request = CreateChatRequest(
            engineConfigId=None,
            firstMessage=UserChatMessage(
                id="msg-1",
                content=[MessageTextContent(text="Hello")],
            ),
        )
        with runtime_context(state) as ctx:
            chat = await route_create_chat(request, ctx)
        assert chat.llmConfig.id == SCRIPTABLE_LLM_CONFIG_ID


@pytest.mark.asyncio
async def test_create_chat_resolves_internal_engine() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        llm_configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(id="primary", model="gpt-test"),
            },
            mcpServers={},
        )
        engine_config = EngineConfig(
            name="Primary LLM",
            engineType=EngineType.setta_llm,
            settaLlmConfigId="primary",
        )
        save_engine_configs(dbe, [engine_config])
        state = _ListenerRouteState(
            dbe=dbe,
            agent_runner=_RunnerStub(config=llm_configs),
            wmh_frontend_sender=frontend_sender,
        )
        request = CreateChatRequest(
            engineConfigId=engine_config.id,
            firstMessage=UserChatMessage(
                id="msg-1",
                content=[MessageTextContent(text="Hello")],
            ),
        )
        with runtime_context(state) as ctx:
            chat = await route_create_chat(request, ctx)
        assert chat.llmConfig.id == "primary"


@pytest.mark.asyncio
async def test_run_mcp_tools_forwards_frontend_websocket_id_to_tool_runner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        llm_configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(id="primary", model="gpt-test"),
            },
            mcpServers={},
        )
        engine_config = EngineConfig(
            name="Primary LLM",
            engineType=EngineType.setta_llm,
            settaLlmConfigId="primary",
        )
        save_engine_configs(dbe, [engine_config])
        state = _ListenerRouteState(
            dbe=dbe,
            agent_runner=_RunnerStub(config=llm_configs),
            wmh_frontend_sender=frontend_sender,
            mcp_client=object(),
        )
        section_id = ID("section-1")
        chat_id = ID("chat-1")
        project_config_id = ID("project-1")
        captured: dict[str, object] = {}

        fake_history = SimpleNamespace(
            get=lambda candidate_chat_id: (
                SimpleNamespace(
                    projectConfigId=project_config_id,
                    llmConfig=LLMConfig(id="primary", model="gpt-test"),
                )
                if candidate_chat_id == chat_id
                else None
            )
        )
        monkeypatch.setattr(listener_module, "_chat_history", lambda _ctx: fake_history)

        class _FakeToolRunner:
            def __init__(
                self,
                _mcp_client,
                *,
                allowed_server_ids,
                share_session_id,
                project_config_id,
                chat_id,
                section_id,
                frontend_websocket_id,
            ) -> None:
                captured["allowed_server_ids"] = allowed_server_ids
                captured["share_session_id"] = share_session_id
                captured["project_config_id"] = project_config_id
                captured["chat_id"] = chat_id
                captured["section_id"] = section_id
                captured["frontend_websocket_id"] = frontend_websocket_id

            async def run(self, tool_calls):
                captured["tool_calls"] = tool_calls
                return []

        monkeypatch.setattr(listener_module, "ToolRunner", _FakeToolRunner)

        with runtime_context(state) as ctx:
            tool_call = ToolCallBuilder.from_name_and_args(
                name="setta__list_mcp_tools",
                arguments={},
                tool_call_id="tool-call-1",
            )
            response = await route_run_mcp_tools(
                RunMcpToolsRequest(
                    chatId=chat_id,
                    sectionId=section_id,
                    frontendWebsocketId="frontend-1",
                    toolCalls=[tool_call],
                ),
                ctx,
            )

        assert response == []
        assert captured["chat_id"] == chat_id
        assert captured["project_config_id"] == project_config_id
        assert captured["section_id"] == section_id
        assert captured["frontend_websocket_id"] == "frontend-1"
