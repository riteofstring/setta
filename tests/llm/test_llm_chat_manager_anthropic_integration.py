import os
import warnings
import socket
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.store import save_engine_configs
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.agentic import AgentProfile, AgentRunStatus, EngineConfig, EngineType
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class LLMChatManagerAnthropicIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _require_anthropic_key(self) -> str:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            self.skipTest("ANTHROPIC_API_KEY not set")
        try:
            socket.getaddrinfo("api.anthropic.com", 443)
            with socket.create_connection(
                ("api.anthropic.com", 443),
                timeout=3,
            ):
                pass
        except OSError:
            self.skipTest("Cannot connect to api.anthropic.com:443")
        return api_key

    async def test_claude_sonnet_45_chat_completion(self) -> None:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r"^Pydantic serializer warnings:",
                category=UserWarning,
                module=r"pydantic.*",
            )
            api_key = self._require_anthropic_key()

            with TemporaryDirectory() as tmpdir:
                dbe = DBE(Path(tmpdir) / "setta_files")
                project_config = ProjectConfig()
                project_state = ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
                dbe.write_project(project_state)

                websocket_manager = WebsocketManager()
                frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
                runner = AgentRunner(
                    dbe,
                    MultiMCPClient({}, disabled=True),
                    frontend_sender,
                )

                llm_config = LLMConfig(
                    id="claude-sonnet",
                    model="claude-sonnet-4-5-20250929",
                    provider="anthropic",
                    api_key_env="ANTHROPIC_API_KEY",
                    mcpServerIds=[],
                )
                runner.update_config(AllLLMConfigs(configs={llm_config.id: llm_config}))
                runner.update_api_keys({"ANTHROPIC_API_KEY": api_key})

                engine_config = EngineConfig(
                    id="engine-claude-sonnet",
                    name="Claude Sonnet 4.5",
                    engineType=EngineType.setta_llm,
                    settaLlmConfigId=llm_config.id,
                )
                save_engine_configs(dbe, [engine_config])

                profile = AgentProfile(
                    name="Claude Sonnet 4.5",
                    engineConfigId=engine_config.id,
                )

                first_messages = [
                    UserChatMessage(
                        content=[
                            MessageTextContent(
                                text="Reply with exactly: HELLO",
                            )
                        ]
                    )
                ]

                first_run = runner.start_run(
                    profile,
                    {
                        "messages": [
                            message.model_dump(mode="json") for message in first_messages
                        ],
                        "thinking": True,
                    },
                    emit_stream=False,
                    emit_ai_follow=False,
                )

                completed_first = await runner.wait_for_run(first_run.id, timeout=120)
                if completed_first.status != AgentRunStatus.completed:
                    error = None
                    for event in reversed(completed_first.events):
                        if event.type != "run_failed":
                            continue
                        payload = event.payload
                        if isinstance(payload, dict):
                            error = payload.get("error")
                        break
                    self.fail(f"Claude Sonnet 4.5 initial run failed: {error}")
                outputs = completed_first.outputs
                self.assertIsInstance(outputs, dict)
                messages_out = (
                    outputs.get("messages") if isinstance(outputs, dict) else None
                )
                self.assertIsInstance(messages_out, list)
                if not isinstance(messages_out, list):
                    raise AssertionError("Expected message history from initial run")

                thinking_blocks: list[dict] = []
                for message in messages_out:
                    if (
                        not isinstance(message, dict)
                        or message.get("role") != "assistant"
                    ):
                        continue
                    content = message.get("content")
                    if not isinstance(content, list):
                        continue
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "thinking":
                            thinking_blocks.append(block)
                self.assertTrue(thinking_blocks)
                self.assertTrue(
                    all(
                        isinstance(block.get("signature"), str) and block["signature"]
                        for block in thinking_blocks
                    )
                )

                followup_message = UserChatMessage(
                    content=[MessageTextContent(text="Reply with exactly: OK")]
                ).model_dump(mode="json")
                history = list(messages_out) + [followup_message]

                second_run = runner.start_run(
                    profile,
                    {"messages": history, "thinking": True},
                    emit_stream=False,
                    emit_ai_follow=False,
                )

                completed_second = await runner.wait_for_run(second_run.id, timeout=120)
                if completed_second.status != AgentRunStatus.completed:
                    error = None
                    for event in reversed(completed_second.events):
                        if event.type != "run_failed":
                            continue
                        payload = event.payload
                        if isinstance(payload, dict):
                            error = payload.get("error")
                        break
                    self.fail(f"Claude Sonnet 4.5 follow-up run failed: {error}")
