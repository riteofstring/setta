import asyncio
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.opencode_sdk import OpenCodeSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.node_runtime import resolve_node_command
from setta.database.db_objs import DBE
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.agentic import AgentProfile
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentSettingsManagedBlock,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
    OpenCodeSettingsManaged,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.mcp_test_server import run_test_mcp_server


_DEFAULT_OPENCODE_TEST_MODEL = "anthropic/claude-sonnet-4-5-20250929"
_DEFAULT_MODEL_PREFERENCE = {
    "anthropic": [
        "claude-sonnet-4-5",
    ],
}


class OpenCodeSdkAdapterIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _require_opencode_sdk(self) -> str:
        sdk_package = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "node_modules"
            / "@opencode-ai"
            / "sdk"
            / "package.json"
        )
        if not sdk_package.exists():
            self.skipTest("@opencode-ai/sdk is not installed in sidecars")
        opencode_path = shutil.which("opencode")
        if opencode_path is None:
            self.skipTest("opencode CLI not installed")
        try:
            subprocess.run(
                [opencode_path, "--version"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            self.skipTest("opencode CLI not available")
        node_command = resolve_node_command(None)
        node_path = shutil.which(node_command) or (
            node_command if Path(node_command).exists() else None
        )
        if node_path is None:
            self.skipTest("node executable not found")
        model = self._resolve_test_model(opencode_path)
        provider = model.split("/", 1)[0].strip().lower()
        if provider == "anthropic":
            if not os.environ.get("ANTHROPIC_API_KEY"):
                self.skipTest("ANTHROPIC_API_KEY not set")
            self._require_network("api.anthropic.com", 443)
        else:
            self.skipTest(
                "OpenCode tests require Anthropic Claude Sonnet 4.5; "
                "set OPENCODE_TEST_MODEL to anthropic/claude-sonnet-4-5-20250929 "
                "or anthropic/claude-sonnet-4-5."
            )
        print(
            f"[opencode test] using model {model}",
            file=sys.stderr,
        )
        return model

    def _resolve_test_model(self, opencode_path: str) -> str:
        env_model = os.environ.get("OPENCODE_TEST_MODEL")
        if env_model:
            if "claude-sonnet-4-5" not in env_model:
                self.skipTest(
                    "OPENCODE_TEST_MODEL must be Claude Sonnet 4.5 "
                    "(anthropic/claude-sonnet-4-5-20250929)."
                )
            return env_model
        if _DEFAULT_OPENCODE_TEST_MODEL:
            if "claude-sonnet-4-5" not in _DEFAULT_OPENCODE_TEST_MODEL:
                self.skipTest(
                    "Default OpenCode test model must be Claude Sonnet 4.5."
                )
            return _DEFAULT_OPENCODE_TEST_MODEL
        if not os.environ.get("ANTHROPIC_API_KEY"):
            self.skipTest("ANTHROPIC_API_KEY not set for OpenCode Claude Sonnet 4.5")
        models = self._list_models(opencode_path, "anthropic")
        selected = self._pick_model(models, "anthropic")
        if selected:
            return selected
        self.skipTest(
            "Claude Sonnet 4.5 not available via `opencode models`. "
            "Set OPENCODE_TEST_MODEL to anthropic/claude-sonnet-4-5-20250929."
        )
        raise AssertionError("Unreachable")

    @staticmethod
    def _list_models(opencode_path: str, provider: str | None) -> list[str]:
        args = [opencode_path, "models"]
        if provider:
            args.append(provider)
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return []
        text = "\n".join(
            [
                result.stdout or "",
                result.stderr or "",
            ]
        )
        matches = re.findall(r"[a-z0-9_-]+/[A-Za-z0-9._:-]+", text)
        seen: set[str] = set()
        models: list[str] = []
        for match in matches:
            if match in seen:
                continue
            seen.add(match)
            models.append(match)
        return models

    @staticmethod
    def _pick_model(
        models: list[str],
        provider: str | None,
    ) -> str | None:
        filtered = models
        if provider:
            prefix = f"{provider}/"
            filtered = [model for model in models if model.startswith(prefix)]
        filtered = [
            model for model in filtered if "claude-sonnet-4-5" in model
        ]
        if provider and provider in _DEFAULT_MODEL_PREFERENCE:
            for hint in _DEFAULT_MODEL_PREFERENCE[provider]:
                for model in filtered:
                    if hint in model:
                        return model
        return filtered[0] if filtered else None

    @staticmethod
    def _require_network(host: str, port: int) -> None:
        try:
            socket.getaddrinfo(host, port)
            with socket.create_connection((host, port), timeout=3):
                pass
        except OSError:
            raise unittest.SkipTest(f"Cannot connect to {host}:{port}")

    async def _await_completed_run(
        self,
        dbe: DBE,
        run_id: ID,
        *,
        runner: ExternalAgentRunner | None = None,
        timeout_seconds: float = 90.0,
    ) -> dict:
        start = time.monotonic()
        stored: dict | None = None
        while True:
            await asyncio.sleep(0.5)
            stored = dbe.read_agent_run(run_id)
            status = stored.get("status") if isinstance(stored, dict) else None
            if status in {"completed", "failed", "cancelled"}:
                break
            if time.monotonic() - start >= timeout_seconds:
                stderr_lines = None
                if runner is not None and run_id in runner._run_state:
                    stderr_lines = runner._run_state[run_id].handle.metadata.get(
                        "stderr_lines"
                    )
                    await runner.stop_run(run_id)
                self.fail(
                    self._debug_dump(
                        stored.get("outputs") if isinstance(stored, dict) else None,
                        stderr_lines,
                        "OpenCode SDK run timed out",
                    )
                )
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
                "OpenCode SDK run failed; "
                f"status={status}, error={error}, events={events}, outputs={outputs}"
            )
        return stored

    async def _await_pending_approval(
        self, runner: ExternalAgentRunner, dbe: DBE, run_id: ID
    ) -> str:
        start = time.monotonic()
        for _ in range(200):
            for approval_id, state in runner._pending_approvals.items():
                if state.run_id == run_id:
                    return approval_id
            stored = dbe.read_agent_run(run_id)
            status = stored.get("status") if isinstance(stored, dict) else None
            if status in {"completed", "failed", "cancelled"}:
                stderr_lines = None
                if run_id in runner._run_state:
                    stderr_lines = runner._run_state[run_id].handle.metadata.get(
                        "stderr_lines"
                    )
                self.fail(
                    self._debug_dump(
                        stored.get("outputs") if isinstance(stored, dict) else None,
                        stderr_lines,
                        "OpenCode SDK run completed before approval",
                    )
                )
            if time.monotonic() - start > 30:
                break
            await asyncio.sleep(0.1)
        stderr_lines = None
        if run_id in runner._run_state:
            stderr_lines = runner._run_state[run_id].handle.metadata.get(
                "stderr_lines"
            )
        self.fail(
            self._debug_dump(
                None,
                stderr_lines,
                "OpenCode SDK run did not request a tool approval in time.",
            )
        )
        raise AssertionError("Unreachable")

    @staticmethod
    def _debug_dump(outputs: object, stderr_lines: object, message: str) -> str:
        return (
            f"{message}. outputs={outputs!r} stderr={stderr_lines!r}"
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
        registry = ExternalAgentAdapterRegistry(adapters=[OpenCodeSdkAdapter()])
        runner = ExternalAgentRunner(
            dbe,
            frontend_sender,
            adapter_registry=registry,
        )
        return dbe, runner

    @staticmethod
    def _build_config(model: str) -> ExternalAgentConfig:
        return ExternalAgentConfig(
            name="OpenCode SDK",
            toolType=ExternalAgentToolType.opencode,
            runMode=ExternalAgentRunMode.sdk,
            commandPath=None,
            baseUrl=None,
            defaultModel=model,
            sandboxPolicy=None,
            approvalPolicy=None,
            settingsManagedBlock=None,
            envVarWhitelist=["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
            workingDirStrategy=ExternalAgentWorkingDirStrategy.project_root,
        )

    async def test_opencode_sdk_streams_message(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello."},
            )
            stored = await self._await_completed_run(dbe, run.id, runner=runner)
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

    async def test_opencode_sdk_persists_session_id(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello."},
            )
            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            session_id = outputs.get("sessionId")
            self.assertIsInstance(session_id, str)
            if not isinstance(session_id, str) or not session_id:
                raise AssertionError("Expected non-empty sessionId in outputs")

    async def test_opencode_sdk_reuses_session_id_for_chat(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            code_word = f"setta-opencode-{secrets.token_hex(6)}"
            first_run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": f"Remember this codeword: {code_word}. Reply with OK."},
            )
            first_stored = await self._await_completed_run(
                dbe, first_run.id, runner=runner
            )
            outputs = first_stored.get("outputs")
            self.assertIsInstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            session_id = outputs.get("sessionId")
            self.assertIsInstance(session_id, str)
            if not isinstance(session_id, str) or not session_id:
                raise AssertionError("Expected sessionId in outputs")

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": "What codeword did I ask you to remember?",
                    "sessionId": session_id,
                },
            )
            second_stored = await self._await_completed_run(
                dbe, second_run.id, runner=runner
            )
            second_outputs = second_stored.get("outputs")
            self.assertIsInstance(second_outputs, dict)
            if not isinstance(second_outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            final_text = second_outputs.get("finalText")
            self.assertIsInstance(final_text, str)
            if not isinstance(final_text, str):
                raise AssertionError("Expected finalText to be a string")
            self.assertIn(code_word, final_text)

    async def test_opencode_sdk_mcp_tool_call_with_approval(self) -> None:
        model = self._require_opencode_sdk()
        async with run_test_mcp_server() as mcp_server:
            with TemporaryDirectory() as tmpdir:
                dbe, runner = self._build_runner(Path(tmpdir))
                config = self._build_config(model)
                tool_name = mcp_server.test_tool_name or "list_mcp_tools"
                tool_token = mcp_server.test_tool_token or "OK"
                permission_key = f"{SETTA_MCP_SERVER_ID}_{tool_name}"
                config.settingsManagedBlock = ExternalAgentSettingsManagedBlock(
                    opencode=OpenCodeSettingsManaged(
                        permission={"*": "ask", "bash": "deny", permission_key: "ask"}
                    )
                )
                profile = AgentProfile(
                    name="OpenCode MCP",
                    toolAllowlist=[tool_name],
                )
                prompt = (
                    f"Call the MCP tool `setta_{tool_name}` exactly once. "
                    "Do not answer until after the tool result. "
                    f"Then reply with only {tool_token}."
                )
                run = runner.start_run(
                    config.id,
                    config,
                    profile,
                    {"prompt": prompt},
                )
                approval_id = await self._await_pending_approval(runner, dbe, run.id)
                await runner.respond_to_approval(approval_id, True)
                stored = await self._await_completed_run(dbe, run.id, runner=runner)
                outputs = stored.get("outputs")
                self.assertIsInstance(outputs, dict)
                if not isinstance(outputs, dict):
                    raise AssertionError("Expected outputs to be a dict")
                final_text = outputs.get("finalText")
                self.assertIsInstance(final_text, str)
                if not isinstance(final_text, str):
                    raise AssertionError("Expected finalText to be a string")
                self.assertIn(tool_token, final_text)
                messages = outputs.get("messages")
                self.assertIsInstance(messages, list)
                if isinstance(messages, list):
                    tool_messages = [
                        message
                        for message in messages
                        if isinstance(message, dict) and message.get("role") == "tool"
                    ]
                    self.assertTrue(tool_messages)
