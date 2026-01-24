import os
import socket
import unittest
import warnings
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


class LLMChatManagerOpenAIIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _require_openai_key(self) -> str:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            self.skipTest("OPENAI_API_KEY not set")
        try:
            socket.getaddrinfo("api.openai.com", 443)
            with socket.create_connection(
                ("api.openai.com", 443),
                timeout=3,
            ):
                pass
        except OSError:
            self.skipTest("Cannot connect to api.openai.com:443")
        return api_key

    async def test_gpt_4o_mini_chat_completion(self) -> None:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r"^Pydantic serializer warnings:",
                category=UserWarning,
                module=r"pydantic.*",
            )
            warnings.filterwarnings(
                "ignore",
                message=r"^Accessing the 'model_(computed_fields|fields)' attribute on the instance is deprecated\.",
                category=DeprecationWarning,
            )
            api_key = self._require_openai_key()

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
                    id="openai-gpt-4o-mini",
                    model="gpt-4o-mini",
                    provider="openai",
                    api_key_env="OPENAI_API_KEY",
                    other_params={"temperature": 0},
                    mcpServerIds=[],
                )
                runner.update_config(AllLLMConfigs(configs={llm_config.id: llm_config}))
                runner.update_api_keys({"OPENAI_API_KEY": api_key})

                engine_config = EngineConfig(
                    id="engine-gpt-4o-mini",
                    name="OpenAI GPT-4o mini",
                    engineType=EngineType.setta_llm,
                    settaLlmConfigId=llm_config.id,
                )
                save_engine_configs(dbe, [engine_config])

                profile = AgentProfile(
                    name="OpenAI GPT-4o mini",
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
                            message.model_dump(mode="json")
                            for message in first_messages
                        ]
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
                    self.fail(f"GPT-4o mini initial run failed: {error}")

                outputs = completed_first.outputs
                self.assertIsInstance(outputs, dict)
                if not isinstance(outputs, dict):
                    raise AssertionError("Expected outputs to be a dict")
                final_text = outputs.get("finalText")
                self.assertIsInstance(final_text, str)
                if not isinstance(final_text, str):
                    raise AssertionError("Expected finalText to be a string")
                self.assertEqual(final_text.strip(), "HELLO")
                metadata = outputs.get("metadata")
                self.assertIsInstance(metadata, dict)
                if not isinstance(metadata, dict):
                    raise AssertionError("Expected metadata to be a dict")
                self.assertEqual(metadata.get("engineConfigId"), str(engine_config.id))
                self.assertEqual(metadata.get("llmConfigId"), llm_config.id)
                self.assertEqual(metadata.get("model"), llm_config.model)
                self.assertEqual(metadata.get("provider"), llm_config.provider)
                self.assertEqual(metadata.get("thinking"), False)
                self.assertEqual(
                    metadata.get("projectConfigId"), str(project_config.id)
                )
                self.assertEqual(metadata.get("chatId"), str(first_run.id))

                messages_out = outputs.get("messages")
                self.assertIsInstance(messages_out, list)
                if not isinstance(messages_out, list):
                    raise AssertionError("Expected message history from initial run")
                assistant_texts = []
                for message in messages_out:
                    if not isinstance(message, dict):
                        continue
                    if message.get("role") != "assistant":
                        continue
                    content = message.get("content")
                    if not isinstance(content, list):
                        continue
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text = block.get("text")
                            if isinstance(text, str) and text.strip():
                                assistant_texts.append(text)
                self.assertTrue(assistant_texts)

                followup_message = UserChatMessage(
                    content=[MessageTextContent(text="Reply with exactly: OK")]
                ).model_dump(mode="json")
                history = list(messages_out) + [followup_message]

                second_run = runner.start_run(
                    profile,
                    {"messages": history},
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
                    self.fail(f"GPT-4o mini follow-up run failed: {error}")

                second_outputs = completed_second.outputs
                self.assertIsInstance(second_outputs, dict)
                if not isinstance(second_outputs, dict):
                    raise AssertionError("Expected outputs to be a dict")
                second_final_text = second_outputs.get("finalText")
                self.assertIsInstance(second_final_text, str)
                if not isinstance(second_final_text, str):
                    raise AssertionError("Expected finalText to be a string")
                self.assertEqual(second_final_text.strip(), "OK")
