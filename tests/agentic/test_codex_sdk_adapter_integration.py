import asyncio
import os
import shutil
import socket
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.codex_sdk import CodexSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.database.db_objs import DBE
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class CodexSdkAdapterIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _require_codex_sdk(self) -> str:
        node_path = shutil.which("node")
        if node_path is None:
            self.skipTest("node is not installed")
        sidecar_root = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
        )
        package_json = (
            sidecar_root / "node_modules" / "@openai" / "codex-sdk" / "package.json"
        )
        if not package_json.exists():
            self.skipTest("@openai/codex-sdk is not installed for sidecars")
        if not os.environ.get("CODEX_API_KEY"):
            self.skipTest("CODEX_API_KEY not set")
        try:
            socket.getaddrinfo("api.openai.com", 443)
            with socket.create_connection(("api.openai.com", 443), timeout=3):
                pass
        except OSError:
            self.skipTest("Cannot connect to api.openai.com:443")
        return node_path

    async def _await_completed_run(self, dbe: DBE, run_id: ID) -> dict:
        for _ in range(120):
            await asyncio.sleep(0.5)
            stored = dbe.read_agent_run(run_id)
            if stored and stored.get("status") in {
                "completed",
                "failed",
                "cancelled",
            }:
                break

        stored = dbe.read_agent_run(run_id)
        self.assertIsNotNone(stored)
        if stored is None:
            return {}
        status = stored.get("status")
        if status != "completed":
            events = stored.get("events")
            outputs = stored.get("outputs")
            error = None
            if isinstance(events, list):
                for event in reversed(events):
                    if not isinstance(event, dict):
                        continue
                    if event.get("type") != "run_failed":
                        continue
                    payload = event.get("payload")
                    if isinstance(payload, dict) and payload.get("error"):
                        error = payload.get("error")
                        break
            self.fail(
                "Codex SDK run failed; "
                f"status={status}, error={error}, events={events}, outputs={outputs}"
            )
        return stored

    @staticmethod
    def _build_config(node_path: str) -> ExternalAgentConfig:
        return ExternalAgentConfig(
            name="Codex SDK",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.sdk,
            commandPath=node_path,
            approvalPolicy="on-failure",
            envVarWhitelist=["CODEX_API_KEY"],
        )

    @staticmethod
    def _build_runner(root: Path) -> tuple[DBE, ExternalAgentRunner]:
        dbe = DBE(root / "setta_files")
        project_config = ProjectConfig()
        dbe.write_project(
            ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
        )
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        registry = ExternalAgentAdapterRegistry(adapters=[CodexSdkAdapter()])
        runner = ExternalAgentRunner(
            dbe,
            frontend_sender,
            adapter_registry=registry,
        )
        return dbe, runner

    @staticmethod
    def _collect_message_texts(messages: list[dict]) -> str:
        parts: list[str] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text")
                    if isinstance(text, str) and text:
                        parts.append(text)
        return "\n".join(parts)

    async def test_codex_sdk_streams_message(self) -> None:
        node_path = self._require_codex_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(node_path)

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello."},
            )
            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            final_text = outputs.get("finalText")
            self.assertIsInstance(final_text, str)
            if not isinstance(final_text, str):
                raise AssertionError("Expected finalText to be a string")
            self.assertTrue(final_text.strip())
            self.assertIn("hello", final_text.lower())
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            if isinstance(messages, list):
                all_text = self._collect_message_texts(messages)
                self.assertTrue(all_text.strip())

    async def test_codex_sdk_persists_thread_id(self) -> None:
        node_path = self._require_codex_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(node_path)

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello."},
            )

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            thread_id = outputs.get("threadId")
            self.assertIsInstance(thread_id, str)
            if not isinstance(thread_id, str) or not thread_id:
                raise AssertionError("Expected non-empty threadId in outputs")

    async def test_codex_sdk_reuses_thread_id_for_chat(self) -> None:
        node_path = self._require_codex_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(node_path)

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello."},
            )
            first_stored = await self._await_completed_run(dbe, first_run.id)
            first_outputs = first_stored.get("outputs")
            self.assertIsInstance(first_outputs, dict)
            if not isinstance(first_outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            thread_id = first_outputs.get("threadId")
            self.assertIsInstance(thread_id, str)
            if not isinstance(thread_id, str) or not thread_id:
                raise AssertionError("Expected non-empty threadId in outputs")

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello again.", "chatId": str(first_run.id)},
            )

            second_inputs = second_run.inputs or {}
            self.assertEqual(second_inputs.get("threadId"), thread_id)

            await self._await_completed_run(dbe, second_run.id)

    async def test_codex_sdk_uses_message_history(self) -> None:
        node_path = self._require_codex_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(node_path)
            code_word = "setta-codex-history-codeword"
            user_message = UserChatMessage(
                content=[
                    MessageTextContent(
                        text=f"The code word is {code_word}.",
                    )
                ],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "messages": [user_message.model_dump(mode="json")],
                    "prompt": "What is the code word? Reply with only the code word.",
                },
            )

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            final_text = outputs.get("finalText")
            self.assertIsInstance(final_text, str)
            if not isinstance(final_text, str):
                raise AssertionError("Expected finalText to be a string")
            self.assertIn(code_word, final_text.lower())

    async def test_codex_sdk_multi_turn_remembers_prompt(self) -> None:
        node_path = self._require_codex_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(node_path)
            code_word = "setta-codex-memory-codeword"

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        f"Reply with the code word '{code_word}' and nothing else."
                    ),
                },
            )
            await self._await_completed_run(dbe, first_run.id)

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "What code word did you just reply with? "
                        "Reply with only the code word."
                    ),
                    "chatId": str(first_run.id),
                },
            )
            stored = await self._await_completed_run(dbe, second_run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            final_text = outputs.get("finalText")
            self.assertIsInstance(final_text, str)
            if not isinstance(final_text, str):
                raise AssertionError("Expected finalText to be a string")
            self.assertIn(code_word, final_text.lower())

    async def test_codex_sdk_resumes_thread_id_across_chats(self) -> None:
        node_path = self._require_codex_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(node_path)
            code_word = "setta-codex-thread-codeword"

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        f"Reply with the code word '{code_word}' and nothing else."
                    ),
                },
            )
            first_stored = await self._await_completed_run(dbe, first_run.id)
            first_outputs = first_stored.get("outputs")
            self.assertIsInstance(first_outputs, dict)
            if not isinstance(first_outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            thread_id = first_outputs.get("threadId")
            self.assertIsInstance(thread_id, str)
            if not isinstance(thread_id, str) or not thread_id:
                raise AssertionError("Expected non-empty threadId in outputs")

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "What code word did you just reply with? "
                        "Reply with only the code word."
                    ),
                    "threadId": thread_id,
                },
            )
            stored = await self._await_completed_run(dbe, second_run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            final_text = outputs.get("finalText")
            self.assertIsInstance(final_text, str)
            if not isinstance(final_text, str):
                raise AssertionError("Expected finalText to be a string")
            self.assertIn(code_word, final_text.lower())
            self.assertEqual(outputs.get("threadId"), thread_id)
