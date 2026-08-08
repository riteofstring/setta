import asyncio
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

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
from tests.utils.integration_env import seed_env_from_repo_dot_env
from tests.utils.integration_flags import (
    EXTERNAL_AGENT_INTEGRATION_SKIP_REASON,
    external_agent_integration_tests_enabled,
)


_DEFAULT_OPENCODE_TEST_MODEL = "anthropic/claude-sonnet-4-5-20250929"
_DEFAULT_MODEL_PREFERENCE = {
    "anthropic": [
        "claude-sonnet-4-5",
    ],
}

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        not external_agent_integration_tests_enabled(),
        reason=EXTERNAL_AGENT_INTEGRATION_SKIP_REASON,
    ),
]


class TestOpenCodeSdkAdapterIntegration:
    def _require_opencode_sdk(self) -> str:
        seed_env_from_repo_dot_env(("ANTHROPIC_API_KEY",))
        if not os.environ.get("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")
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
            pytest.fail("@opencode-ai/sdk is not installed in sidecars")
        opencode_path = shutil.which("opencode")
        if opencode_path is None:
            pytest.fail("opencode CLI not installed")
        try:
            subprocess.run(
                [opencode_path, "--version"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            pytest.fail("opencode CLI not available")
        node_command = resolve_node_command(None)
        node_path = shutil.which(node_command) or (
            node_command if Path(node_command).exists() else None
        )
        if node_path is None:
            pytest.fail(
                "node executable not found; ensure it is installed and on PATH."
            )
        model = self._resolve_test_model(opencode_path)
        provider = model.split("/", 1)[0].strip().lower()
        if provider == "anthropic":
            self._require_network("api.anthropic.com", 443)
        else:
            pytest.fail(
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
                pytest.fail(
                    "OPENCODE_TEST_MODEL must be Claude Sonnet 4.5 "
                    "(anthropic/claude-sonnet-4-5-20250929)."
                )
            return env_model
        if _DEFAULT_OPENCODE_TEST_MODEL:
            if "claude-sonnet-4-5" not in _DEFAULT_OPENCODE_TEST_MODEL:
                pytest.fail("Default OpenCode test model must be Claude Sonnet 4.5.")
            return _DEFAULT_OPENCODE_TEST_MODEL
        models = self._list_models(opencode_path, "anthropic")
        selected = self._pick_model(models, "anthropic")
        if selected:
            return selected
        pytest.fail(
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
        except OSError as exc:
            pytest.skip(f"Cannot connect to {host}:{port} ({exc})")

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
                pytest.fail(
                    self._debug_dump(
                        stored.get("outputs") if isinstance(stored, dict) else None,
                        stderr_lines,
                        "OpenCode SDK run timed out",
                    )
                )
        stored = dbe.read_agent_run(run_id)
        assert stored is not None
        status = stored.get("status")
        if status != "completed":
            events = stored.get("events")
            outputs = stored.get("outputs")
            cli_stderr = None
            error = None
            if isinstance(events, list):
                for event in reversed(events):
                    if not isinstance(event, dict):
                        continue
                    if event.get("type") != "run_failed":
                        continue
                    payload = event.get("payload")
                    if isinstance(payload, dict):
                        if payload.get("error"):
                            error = payload.get("error")
                        cli_stderr = payload.get("cliStderr")
                        break
            if self._should_skip_for_server_failure(cli_stderr):
                pytest.fail(
                    "OpenCode server failed to start; "
                    f"stderr={cli_stderr!r}"
                )
            pytest.fail(
                "OpenCode SDK run failed; "
                f"status={status}, error={error}, events={events}, outputs={outputs}"
            )
        return stored

    @staticmethod
    def _should_skip_for_server_failure(cli_stderr: object) -> bool:
        if not isinstance(cli_stderr, list):
            return False
        text = "\n".join([entry for entry in cli_stderr if isinstance(entry, str)])
        if not text:
            return False
        patterns = [
            "Failed to start server on port",
            "Server exited with code",
            "Unexpected error, check log file",
        ]
        return any(pattern in text for pattern in patterns)

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
                pytest.fail(
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
        pytest.fail(
            self._debug_dump(
                None,
                stderr_lines,
                "OpenCode SDK run did not request a tool approval in time.",
            )
        )
        return ""

    async def _await_pending_question(
        self, runner: ExternalAgentRunner, dbe: DBE, run_id: ID
    ) -> tuple[str, list[dict]]:
        start = time.monotonic()
        last_tool_call_id = None
        for _ in range(200):
            await asyncio.sleep(0.5)
            for tool_call_id, state in runner._pending_questions.items():
                if state.run_id != run_id:
                    continue
                last_tool_call_id = tool_call_id
                questions = self._extract_questions_from_tool_call(
                    runner, run_id, tool_call_id
                )
                if questions is None:
                    stored = dbe.read_agent_run(run_id)
                    questions = self._extract_questions_from_outputs(
                        stored, tool_call_id
                    )
                if questions is not None:
                    return tool_call_id, questions
            stored = dbe.read_agent_run(run_id)
            status = stored.get("status") if isinstance(stored, dict) else None
            if status in {"completed", "failed", "cancelled"}:
                outputs = stored.get("outputs") if isinstance(stored, dict) else None
                stderr_lines = None
                if run_id in runner._run_state:
                    stderr_lines = runner._run_state[run_id].handle.metadata.get(
                        "stderr_lines"
                    )
                pytest.fail(
                    self._debug_dump(
                        outputs,
                        stderr_lines,
                        "OpenCode SDK run completed before question",
                    )
                )
            if time.monotonic() - start >= 90:
                break
        stderr_lines = None
        if run_id in runner._run_state:
            stderr_lines = runner._run_state[run_id].handle.metadata.get(
                "stderr_lines"
            )
            await runner.stop_run(run_id)
        pytest.fail(
            self._debug_dump(
                {"toolCallId": last_tool_call_id},
                stderr_lines,
                "OpenCode SDK run did not provide question arguments in time.",
            )
        )
        return "", []

    @staticmethod
    def _extract_questions_from_tool_call(
        runner: ExternalAgentRunner, run_id: ID, tool_call_id: str
    ) -> list[dict] | None:
        buffers = runner._tool_call_buffers.get(run_id)
        if not isinstance(buffers, dict):
            return None
        raw = buffers.get(tool_call_id)
        if not isinstance(raw, str) or not raw.strip():
            return None
        return TestOpenCodeSdkAdapterIntegration._extract_questions_from_raw(raw)

    @staticmethod
    def _extract_questions_from_outputs(
        stored: dict | None, tool_call_id: str
    ) -> list[dict] | None:
        if not isinstance(stored, dict):
            return None
        outputs = stored.get("outputs")
        if not isinstance(outputs, dict):
            return None
        messages = outputs.get("messages")
        if not isinstance(messages, list):
            return None
        for message in messages:
            if not isinstance(message, dict):
                continue
            if message.get("role") != "assistant":
                continue
            tool_calls = message.get("tool_calls") or message.get("toolCalls")
            if not isinstance(tool_calls, list):
                continue
            for call in tool_calls:
                if not isinstance(call, dict):
                    continue
                if call.get("id") != tool_call_id:
                    continue
                function = call.get("function")
                if not isinstance(function, dict):
                    continue
                args = function.get("arguments")
                if isinstance(args, dict):
                    questions = args.get("questions")
                    if isinstance(questions, list):
                        return [entry for entry in questions if isinstance(entry, dict)]
                if isinstance(args, str):
                    questions = TestOpenCodeSdkAdapterIntegration._extract_questions_from_raw(
                        args
                    )
                    if questions is not None:
                        return questions
        return None

    @staticmethod
    def _build_answers_from_questions(questions: list[dict]) -> dict[str, str]:
        answers: dict[str, str] = {}
        for entry in questions:
            question_text = entry.get("question")
            if not isinstance(question_text, str) or not question_text.strip():
                continue
            answer = None
            options = entry.get("options")
            if isinstance(options, list) and options:
                preferred = None
                for option in options:
                    label = None
                    if isinstance(option, str):
                        label = option
                    elif isinstance(option, dict):
                        label = option.get("label") or option.get("value")
                    if isinstance(label, str) and label.strip().lower() == "no":
                        preferred = label.strip()
                        break
                if preferred:
                    answer = preferred
                else:
                    option = options[0]
                    if isinstance(option, str) and option.strip():
                        answer = option.strip()
                    elif isinstance(option, dict):
                        label = option.get("label") or option.get("value")
                        if isinstance(label, str) and label.strip():
                            answer = label.strip()
            if not answer:
                answer = "No"
            answers[question_text] = answer
        return answers

    @staticmethod
    def _extract_questions_from_raw(raw: str) -> list[dict] | None:
        if not raw.strip():
            return None
        if "questions" not in raw:
            return None
        decoder = json.JSONDecoder()
        idx = 0
        last_questions = None
        length = len(raw)
        while idx < length:
            while idx < length and raw[idx].isspace():
                idx += 1
            if idx >= length:
                break
            try:
                parsed, end = decoder.raw_decode(raw, idx)
            except json.JSONDecodeError:
                next_start = raw.find("{", idx + 1)
                if next_start == -1:
                    break
                idx = next_start
                continue
            idx = end
            if not isinstance(parsed, dict):
                continue
            questions = parsed.get("questions")
            if isinstance(questions, list):
                last_questions = [
                    entry for entry in questions if isinstance(entry, dict)
                ]
        return last_questions

    @staticmethod
    def _debug_dump(outputs: object, stderr_lines: object, message: str) -> str:
        return f"{message}. outputs={outputs!r} stderr={stderr_lines!r}"

    @staticmethod
    def _build_runner(root: Path) -> tuple[DBE, ExternalAgentRunner]:
        dbe = DBE(root / "setta_files")
        project_config = ProjectConfig()
        dbe.write_project(
            ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
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

    @staticmethod
    def _reserve_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    async def test_opencode_sdk_streams_message(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            port = self._reserve_port()
            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "opencodePort": port, "allowUnscoped": True},
            )
            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            final_text = outputs.get("finalText")
            assert isinstance(final_text, str)
            assert final_text.strip()
            assert "hello" in final_text.lower()

    async def test_opencode_sdk_persists_session_id(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            port = self._reserve_port()
            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "opencodePort": port, "allowUnscoped": True},
            )
            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            session_id = outputs.get("sessionId")
            assert isinstance(session_id, str)
            assert session_id

    async def test_opencode_sdk_reuses_session_id_for_chat(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            code_word = f"setta-opencode-{secrets.token_hex(6)}"
            port = self._reserve_port()
            first_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": f"Remember this codeword: {code_word}. Reply with OK.",
                    "opencodePort": port,
                    "allowUnscoped": True,
                },
            )
            first_stored = await self._await_completed_run(
                dbe, first_run.id, runner=runner
            )
            outputs = first_stored.get("outputs")
            assert isinstance(outputs, dict)
            session_id = outputs.get("sessionId")
            assert isinstance(session_id, str)
            assert session_id

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": "What codeword did I ask you to remember?",
                    "sessionId": session_id,
                    "opencodePort": port,
                    "allowUnscoped": True,
                },
            )
            second_stored = await self._await_completed_run(
                dbe, second_run.id, runner=runner
            )
            second_outputs = second_stored.get("outputs")
            assert isinstance(second_outputs, dict)
            final_text = second_outputs.get("finalText")
            assert isinstance(final_text, str)
            assert code_word in final_text

    async def test_opencode_sdk_mcp_tool_call_with_approval(self) -> None:
        model = self._require_opencode_sdk()
        async with run_test_mcp_server() as mcp_server:
            with TemporaryDirectory() as tmpdir:
                dbe, runner = self._build_runner(Path(tmpdir))
                config = self._build_config(model)
                port = self._reserve_port()
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
                    {"prompt": prompt, "opencodePort": port, "allowUnscoped": True},
                )
                approval_id = await self._await_pending_approval(runner, dbe, run.id)
                await runner.respond_to_approval(approval_id, True)
                stored = await self._await_completed_run(dbe, run.id, runner=runner)
                outputs = stored.get("outputs")
                assert isinstance(outputs, dict)
                final_text = outputs.get("finalText")
                assert isinstance(final_text, str)
                assert tool_token in final_text
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                if isinstance(messages, list):
                    tool_messages = [
                        message
                        for message in messages
                        if isinstance(message, dict) and message.get("role") == "tool"
                    ]
                    assert tool_messages

    async def test_opencode_sdk_question_response(self) -> None:
        model = self._require_opencode_sdk()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(model)
            config.settingsManagedBlock = ExternalAgentSettingsManagedBlock(
                opencode=OpenCodeSettingsManaged(
                    permission={
                        "*": "deny",
                        "question": "allow",
                        "AskUserQuestion": "allow",
                    }
                )
            )
            port = self._reserve_port()
            prompt = (
                "Use the question tool to ask exactly three questions. "
                "Each question must include options Yes and No. "
                "Do not answer yet; wait for my responses. "
                "After I respond, reply with only OK. "
                "Do not call any other tools or run any commands."
            )
            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": prompt, "opencodePort": port, "allowUnscoped": True},
            )
            tool_call_id, questions = await self._await_pending_question(
                runner, dbe, run.id
            )
            answers = self._build_answers_from_questions(questions)
            if not answers:
                answers = {"Response": "Yes"}
            await runner.respond_to_question(tool_call_id, answers)
            await self._await_completed_run(dbe, run.id, runner=runner)
