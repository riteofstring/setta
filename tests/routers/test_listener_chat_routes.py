import unittest
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.store import save_engine_configs
from setta.database.db_objs import DBE
from setta.routers.listener import CreateChatRequest, route_create_chat
from setta.types.agentic import EngineConfig, EngineType, SettaLlmEngineConfig
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
    share_mode: bool = False
    share_runtime_state: None = None


class ListenerChatRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_chat_allows_scriptable_engine(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _ListenerRouteState(
                dbe=dbe,
                agent_runner=_RunnerStub(
                    config=AllLLMConfigs(configs={}, mcpServers={})
                ),
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
            self.assertEqual(chat.llmConfig.id, SCRIPTABLE_LLM_CONFIG_ID)

    async def test_create_chat_resolves_internal_engine(self) -> None:
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
                settaLlmConfig=SettaLlmEngineConfig(llmConfigId="primary"),
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
            self.assertEqual(chat.llmConfig.id, "primary")


if __name__ == "__main__":
    unittest.main()
