import asyncio
import os
import shutil
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.claude_sdk import ClaudeSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.database.db_objs import DBE
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class ClaudeSdkAdapterIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _require_claude_sdk(self) -> str:
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
            sidecar_root
            / "node_modules"
            / "@anthropic-ai"
            / "claude-agent-sdk"
            / "package.json"
        )
        if not package_json.exists():
            self.skipTest("@anthropic-ai/claude-agent-sdk is not installed for sidecars")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            self.skipTest("ANTHROPIC_API_KEY not set")
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
        if "status" not in stored:
            raise KeyError("Agent run missing status")
        status = stored["status"]
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
                "Claude SDK run failed; "
                f"status={status}, error={error}, events={events}, outputs={outputs}"
            )
        return stored

    @staticmethod
    def _extract_tool_text(message: dict) -> str:
        result = message.get("result")
        if isinstance(result, str) and result:
            return result
        content = message.get("content")
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text")
                    if isinstance(text, str) and text:
                        parts.append(text)
            if parts:
                return "".join(parts)
        return ""

    @staticmethod
    def _collect_message_texts(messages: list[dict]) -> str:
        parts: list[str] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text")
                        if isinstance(text, str) and text:
                            parts.append(text)
        return "\n".join(parts)

    @staticmethod
    def _collect_thinking_blocks(messages: list[dict]) -> list[dict]:
        blocks: list[dict] = []
        for message in messages:
            if not isinstance(message, dict) or message.get("role") != "assistant":
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if isinstance(block, dict) and block.get("type") == "thinking":
                    blocks.append(block)
        return blocks

    async def test_claude_sdk_streams_message(self) -> None:
        node_path = self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir) / "setta_files")
            project_config = ProjectConfig()
            dbe.write_project(
                ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            registry = ExternalAgentAdapterRegistry(adapters=[ClaudeSdkAdapter()])
            runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                adapter_registry=registry,
            )

            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=node_path,
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello."},
            )

            await self._await_completed_run(dbe, run.id)

    async def test_claude_sdk_reads_file_with_tool(self) -> None:
        node_path = self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir) / "workspace"
            work_dir.mkdir(parents=True, exist_ok=True)
            token = "setta-tool-read-token"
            (work_dir / "token.txt").write_text(token, encoding="utf-8")

            dbe = DBE(Path(tmpdir) / "setta_files")
            project_config = ProjectConfig()
            dbe.write_project(
                ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            registry = ExternalAgentAdapterRegistry(adapters=[ClaudeSdkAdapter()])
            runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                adapter_registry=registry,
            )

            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=node_path,
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
                workingDirStrategy=ExternalAgentWorkingDirStrategy.custom,
                workingDir=str(work_dir),
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "You must call the Read tool with path \"token.txt\" in the "
                        "current directory. Do not answer until after you receive "
                        "the tool result. Then reply with only the exact file "
                        "contents and nothing else."
                    ),
                    "allowedTools": ["Read"],
                    "maxTurns": 1,
                },
            )

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            all_text = self._collect_message_texts(messages)
            self.assertIn(token, all_text)
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            self.assertTrue(assistant_messages)
            tool_calls: list[dict] = []
            for message in assistant_messages:
                calls = message.get("tool_calls") if isinstance(message, dict) else None
                if isinstance(calls, list):
                    tool_calls.extend(
                        call for call in calls if isinstance(call, dict)
                    )
            self.assertTrue(tool_calls)
            tool_names = {
                call.get("function", {}).get("name")
                for call in tool_calls
                if isinstance(call, dict)
            }
            self.assertIn("Read", tool_names)

    async def test_claude_sdk_runs_bash_tool(self) -> None:
        node_path = self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir) / "workspace"
            work_dir.mkdir(parents=True, exist_ok=True)
            (work_dir / "alpha.txt").write_text("alpha", encoding="utf-8")

            dbe = DBE(Path(tmpdir) / "setta_files")
            project_config = ProjectConfig()
            dbe.write_project(
                ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            registry = ExternalAgentAdapterRegistry(adapters=[ClaudeSdkAdapter()])
            runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                adapter_registry=registry,
            )

            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=node_path,
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
                workingDirStrategy=ExternalAgentWorkingDirStrategy.custom,
                workingDir=str(work_dir),
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "You must call the Bash tool to run `ls` in the current "
                        "directory. Do not answer until after the tool result. "
                        "Then reply with only the exact command output."
                    ),
                    "allowedTools": ["Bash"],
                    "maxTurns": 1,
                },
            )

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            all_text = self._collect_message_texts(messages)
            self.assertIn("alpha.txt", all_text)
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            self.assertTrue(assistant_messages)
            tool_calls: list[dict] = []
            for message in assistant_messages:
                calls = message.get("tool_calls") if isinstance(message, dict) else None
                if isinstance(calls, list):
                    tool_calls.extend(call for call in calls if isinstance(call, dict))
            self.assertTrue(tool_calls)
            tool_names = {
                call.get("function", {}).get("name")
                for call in tool_calls
                if isinstance(call, dict)
            }
            self.assertIn("Bash", tool_names)

    async def test_claude_sdk_emits_thinking_blocks(self) -> None:
        node_path = self._require_claude_sdk()
        model_override = os.environ.get("SETTA_CLAUDE_THINKING_MODEL")
        thinking_model = model_override or "claude-opus-4-5"

        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir) / "setta_files")
            project_config = ProjectConfig()
            dbe.write_project(
                ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            registry = ExternalAgentAdapterRegistry(adapters=[ClaudeSdkAdapter()])
            runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                adapter_registry=registry,
            )

            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=node_path,
                defaultModel=thinking_model,
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "Solve this without tools: find the smallest positive "
                        "integer N such that N ≡ 3 (mod 4), N ≡ 4 (mod 5), "
                        "N ≡ 6 (mod 7), and N ≡ 8 (mod 9). "
                        "Respond with only the number."
                    ),
                    "thinking": {"type": "enabled", "budget_tokens": 1024},
                    "maxTurns": 1,
                },
            )

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            thinking_blocks = self._collect_thinking_blocks(messages)
            if not thinking_blocks:
                self.fail(f"Expected thinking blocks; outputs={outputs}")
            thinking_text = "".join(
                block.get("thinking", "")
                for block in thinking_blocks
                if isinstance(block.get("thinking"), str)
            )
            summary_text = "".join(
                block.get("summary", "")
                for block in thinking_blocks
                if isinstance(block.get("summary"), str)
            )
            self.assertTrue((thinking_text + summary_text).strip())
