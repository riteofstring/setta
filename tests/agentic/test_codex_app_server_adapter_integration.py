import asyncio
import hashlib
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.agentic.external_adapters.codex_app_server import CodexAppServerAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.database.db_objs import DBE
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.external_agents import (
    CodexSettingsManaged,
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentSettingsManagedBlock,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.mcp_test_server import run_test_mcp_server
from tests.utils.integration_flags import (
    EXTERNAL_AGENT_INTEGRATION_SKIP_REASON,
    external_agent_integration_tests_enabled,
)


pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        not external_agent_integration_tests_enabled(),
        reason=EXTERNAL_AGENT_INTEGRATION_SKIP_REASON,
    ),
]


class TestCodexAppServerAdapterIntegration:
    def _require_codex_cli(self) -> str:
        if not os.environ.get("OPENAI_API_KEY"):
            pytest.skip("OPENAI_API_KEY not set")
        codex_path = shutil.which("codex")
        if codex_path is None:
            pytest.fail("codex CLI not installed")
        result = subprocess.run(
            [codex_path, "app-server", "--help"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            pytest.fail("codex app-server subcommand not available")
        try:
            socket.getaddrinfo("api.openai.com", 443)
            with socket.create_connection(("api.openai.com", 443), timeout=3):
                pass
        except OSError as exc:
            pytest.skip(f"Cannot connect to api.openai.com:443 ({exc})")
        return codex_path

    async def _await_completed_run(
        self,
        dbe: DBE,
        run_id: ID,
        *,
        runner: ExternalAgentRunner | None = None,
        timeout_seconds: float = 60.0,
        log_interval_seconds: float = 10.0,
    ) -> dict:
        start = time.monotonic()
        next_log = start + log_interval_seconds
        stored: dict | None = None
        while True:
            await asyncio.sleep(0.5)
            stored = dbe.read_agent_run(run_id)
            status = stored.get("status") if isinstance(stored, dict) else None
            if status in {"completed", "failed", "cancelled"}:
                break
            now = time.monotonic()
            if now - start >= timeout_seconds:
                stderr_lines = None
                outputs = stored.get("outputs") if isinstance(stored, dict) else None
                if runner is not None and run_id in runner._run_state:
                    stderr_lines = runner._run_state[run_id].handle.metadata.get(
                        "stderr_lines"
                    )
                    await runner.stop_run(run_id)
                pytest.fail(
                    self._debug_dump(
                        outputs,
                        stderr_lines,
                        "Codex app-server run timed out "
                        f"after {timeout_seconds}s; status={status}",
                    )
                )
            if now >= next_log:
                next_log = now + log_interval_seconds

        stored = dbe.read_agent_run(run_id)
        assert stored is not None
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
            pytest.fail(
                "Codex app-server run failed; "
                f"status={status}, error={error}, events={events}, outputs={outputs}"
            )
        return stored

    async def _await_pending_approval(
        self, runner: ExternalAgentRunner, dbe: DBE, run_id: ID
    ) -> str:
        start = time.monotonic()
        next_log = start + 2.0
        for _ in range(200):
            for approval_id, state in runner._pending_approvals.items():
                if state.run_id == run_id:
                    return approval_id
            stored = dbe.read_agent_run(run_id)
            status = stored.get("status") if isinstance(stored, dict) else None
            if status in {"completed", "failed", "cancelled"}:
                stderr_lines = None
                outputs = stored.get("outputs") if isinstance(stored, dict) else None
                if run_id in runner._run_state:
                    stderr_lines = runner._run_state[run_id].handle.metadata.get(
                        "stderr_lines"
                    )
                pytest.fail(
                    self._debug_dump(
                        outputs,
                        stderr_lines,
                        "Codex app-server run completed before approval "
                        f"(status={status})",
                    )
                )
            now = time.monotonic()
            if now >= next_log:
                next_log = now + 2.0
            await asyncio.sleep(0.1)
        stderr_lines = None
        outputs = stored.get("outputs") if isinstance(stored, dict) else None
        if run_id in runner._run_state:
            stderr_lines = runner._run_state[run_id].handle.metadata.get("stderr_lines")
        pytest.fail(
            self._debug_dump(
                outputs,
                stderr_lines,
                "Codex app-server run did not request a tool approval in time.",
            )
        )
        return ""

    @staticmethod
    def _matches_repeated_token(text: str, token: str) -> bool:
        stripped = text.strip()
        if stripped == token:
            return True
        if not stripped or not token:
            return False
        if len(stripped) % len(token) != 0:
            return False
        repeat_count = len(stripped) // len(token)
        return stripped == token * repeat_count

    @staticmethod
    def _build_config(codex_path: str) -> ExternalAgentConfig:
        return ExternalAgentConfig(
            name="Codex app-server",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
            commandPath=codex_path,
            approvalPolicy="never",
            defaultModel=None,
            envVarWhitelist=["OPENAI_API_KEY"],
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
        registry = ExternalAgentAdapterRegistry(adapters=[CodexAppServerAdapter()])
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

    @staticmethod
    def _debug_dump(outputs: dict | None, stderr_lines: list[str] | None, label: str) -> str:
        stderr_tail: list[str] = []
        if isinstance(stderr_lines, list):
            stderr_tail = [str(line) for line in stderr_lines[-50:]]
        settings_dump = ""
        if isinstance(outputs, dict):
            metadata = outputs.get("metadata")
            if isinstance(metadata, dict):
                settings_paths = metadata.get("settingsPaths")
                if isinstance(settings_paths, dict):
                    codex_path = settings_paths.get("codex")
                    if isinstance(codex_path, str):
                        try:
                            path = Path(codex_path)
                            if path.exists():
                                contents = path.read_text(encoding="utf-8")
                                redacted = (
                                    TestCodexAppServerAdapterIntegration
                                    ._redact_settings_text(contents)
                                )
                                settings_dump = (
                                    f" codexConfigPath={codex_path} "
                                    f"codexConfig={redacted!r}"
                                )
                            else:
                                settings_dump = (
                                    f" codexConfigPath={codex_path} "
                                    "codexConfig=<missing>"
                                )
                        except Exception as exc:
                            settings_dump = (
                                f" codexConfigPath={codex_path} "
                                f"codexConfigError={exc!r}"
                            )
        return (
            f"{label} outputs={outputs} "
            f"cliStderrTail={stderr_tail if stderr_tail else '[]'}{settings_dump}"
        )

    @staticmethod
    def _find_mcp_server_entry(payload: object, server_id: str) -> dict | None:
        if isinstance(payload, dict):
            for key in ("mcp_servers", "mcpServers"):
                servers = payload.get(key)
                if isinstance(servers, dict):
                    entry = servers.get(server_id)
                    if isinstance(entry, dict):
                        return entry
            for value in payload.values():
                entry = TestCodexAppServerAdapterIntegration._find_mcp_server_entry(
                    value, server_id
                )
                if entry is not None:
                    return entry
        if isinstance(payload, list):
            for value in payload:
                entry = TestCodexAppServerAdapterIntegration._find_mcp_server_entry(
                    value, server_id
                )
                if entry is not None:
                    return entry
        return None

    @staticmethod
    def _redact_settings_text(text: str) -> str:
        redacted_lines: list[str] = []
        for line in text.splitlines():
            lowered = line.lower()
            if any(
                token in lowered
                for token in (
                    "api_key",
                    "apikey",
                    "authorization",
                    "auth_token",
                    "bearer",
                    "secret",
                    "password",
                    "cookie",
                )
            ):
                if "=" in line:
                    prefix = line.split("=", 1)[0].rstrip()
                    redacted_lines.append(f"{prefix} = \"[redacted]\"")
                elif ":" in line:
                    prefix = line.split(":", 1)[0].rstrip()
                    redacted_lines.append(f"{prefix}: [redacted]")
                else:
                    redacted_lines.append("[redacted]")
                continue
            redacted_lines.append(line)
        return "\n".join(redacted_lines)

    @staticmethod
    def _extract_json_object(text: str) -> dict:
        normalized = text.strip()
        try:
            payload = json.loads(normalized)
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass
        start = normalized.find("{")
        if start == -1:
            raise ValueError("No JSON object found in response")
        depth = 0
        in_string = False
        escape = False
        for idx in range(start, len(normalized)):
            char = normalized[idx]
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    candidate = normalized[start : idx + 1]
                    payload = json.loads(candidate)
                    if isinstance(payload, dict):
                        return payload
                    raise ValueError("JSON payload was not an object")
        raise ValueError("No complete JSON object found in response")

    async def test_codex_app_server_streams_message(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "allowUnscoped": True},
            )
            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            final_text = outputs.get("finalText")
            assert isinstance(final_text, str)
            assert final_text.strip()
            assert "hello" in final_text.lower()
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            all_text = self._collect_message_texts(messages)
            assert all_text.strip()

    async def test_codex_app_server_persists_thread_id(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "allowUnscoped": True},
            )

            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            thread_id = outputs.get("threadId")
            assert isinstance(thread_id, str)
            assert thread_id

    async def test_codex_app_server_reuses_thread_id_for_chat(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "allowUnscoped": True},
            )
            first_stored = await self._await_completed_run(
                dbe, first_run.id, runner=runner
            )
            first_outputs = first_stored.get("outputs")
            assert isinstance(first_outputs, dict)
            thread_id = first_outputs.get("threadId")
            assert isinstance(thread_id, str)
            assert thread_id

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": "Say hello again.",
                    "chatId": str(first_run.id),
                    "allowUnscoped": True,
                },
            )

            second_inputs = second_run.inputs or {}
            assert second_inputs.get("threadId") == thread_id

            await self._await_completed_run(dbe, second_run.id, runner=runner)

    async def test_codex_app_server_uses_message_history(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)
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
                    "allowUnscoped": True,
                },
            )

            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            final_text = outputs.get("finalText")
            assert isinstance(final_text, str)
            assert code_word in final_text.lower()

    async def test_codex_app_server_multi_turn_remembers_prompt(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)
            code_word = "setta-codex-memory-codeword"

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        f"Reply with the code word '{code_word}' and nothing else."
                    ),
                    "allowUnscoped": True,
                },
            )
            await self._await_completed_run(dbe, first_run.id, runner=runner)

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
                    "allowUnscoped": True,
                },
            )
            stored = await self._await_completed_run(dbe, second_run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            final_text = outputs.get("finalText")
            assert isinstance(final_text, str)
            assert code_word in final_text.lower()

    async def test_codex_app_server_structured_output_schema(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)
            token = f"setta-codex-schema-{secrets.token_hex(6)}"
            schema = {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["ok"]},
                    "codeWord": {"type": "string", "enum": [token]},
                },
                "required": ["status", "codeWord"],
                "additionalProperties": False,
            }

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "Return JSON that matches the provided schema exactly. "
                        "Return only the JSON object."
                    ),
                    "outputSchema": schema,
                    "allowUnscoped": True,
                },
            )

            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            final_text = outputs.get("finalText")
            assert isinstance(final_text, str)
            payload = self._extract_json_object(final_text)
            assert payload.get("status") == "ok"
            assert payload.get("codeWord") == token

    async def test_codex_app_server_reads_config(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)
            config.approvalPolicy = "on-request"
            config.sandboxPolicy = "workspace-write"

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "allowUnscoped": True},
            )
            debug_adapter = None
            debug_state = None
            for _ in range(200):
                run_state = runner._run_state.get(run.id)
                if run_state is not None:
                    debug_adapter = run_state.adapter
                    debug_state = run_state.handle.metadata.get("process_state")
                    break
                await asyncio.sleep(0.1)

            stored = await self._await_completed_run(dbe, run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            metadata = outputs.get("metadata")
            assert isinstance(metadata, dict)
            settings_paths = metadata.get("settingsPaths")
            assert isinstance(settings_paths, dict)
            codex_settings_path = settings_paths.get("codex")
            assert isinstance(codex_settings_path, str)
            assert Path(codex_settings_path).exists()

            assert debug_adapter is not None and debug_state is not None

            async with debug_state.lock:
                config_payload = await debug_adapter._send_request(
                    debug_state,
                    "config/read",
                    {},
                )
            entry = self._find_mcp_server_entry(
                config_payload, SETTA_MCP_SERVER_ID
            )
            assert isinstance(entry, dict)
            url = entry.get("url")
            assert isinstance(url, str)
            assert "/mcp/streamable" in url

    async def test_codex_app_server_mcp_tool_call(self) -> None:
        codex_path = self._require_codex_cli()
        async with run_test_mcp_server() as mcp_server:
            with TemporaryDirectory() as tmpdir:
                dbe, runner = self._build_runner(Path(tmpdir))
                config = self._build_config(codex_path)
                enabled_tools = []
                if mcp_server.test_tool_name:
                    enabled_tools.append(mcp_server.test_tool_name)
                else:
                    enabled_tools.append("list_mcp_tools")
                config.settingsManagedBlock = ExternalAgentSettingsManagedBlock(
                    codex=CodexSettingsManaged(
                        enabledTools=enabled_tools,
                    )
                )
                debug_tool_inventory: str | None = None

                debug_run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {
                        "prompt": (
                            "What tools do you have access to? Reply with only the "
                            "tool names."
                        ),
                        "allowUnscoped": True,
                    },
                )
                debug_stored = await self._await_completed_run(
                    dbe, debug_run.id, runner=runner
                )
                debug_outputs = debug_stored.get("outputs")
                if isinstance(debug_outputs, dict):
                    debug_text = debug_outputs.get("finalText")
                    if isinstance(debug_text, str) and debug_text:
                        debug_tool_inventory = debug_text
                    elif isinstance(debug_outputs.get("messages"), list):
                        debug_tool_inventory = self._collect_message_texts(
                            debug_outputs["messages"]
                        )

                test_tool_name = mcp_server.test_tool_name
                test_tool_token = mcp_server.test_tool_token
                if test_tool_name and test_tool_token:
                    tool_prompt = (
                        f"Call the MCP tool `mcp__setta__{test_tool_name}` "
                        "exactly once. It returns JSON with a `token` field. "
                        "Do not answer until after the tool result. Then reply "
                        "with only the token."
                    )
                else:
                    tool_prompt = (
                        "Call the MCP tool `mcp__setta__list_mcp_tools`. "
                        "Do not answer until after the tool result. "
                        "Then reply with only OK."
                    )

                run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {"prompt": tool_prompt, "allowUnscoped": True},
                )
                debug_adapter = None
                debug_state = None
                for _ in range(200):
                    run_state = runner._run_state.get(run.id)
                    if run_state is not None:
                        debug_adapter = run_state.adapter
                        debug_state = run_state.handle.metadata.get("process_state")
                        break
                    await asyncio.sleep(0.1)

                stored = await self._await_completed_run(dbe, run.id, runner=runner)
                debug_mcp_status: str | None = None
                debug_config_read: str | None = None
                debug_requirements_read: str | None = None
                if (
                    debug_adapter is not None
                    and debug_state is not None
                    and hasattr(debug_state, "lock")
                ):
                    async with debug_state.lock:
                        if hasattr(debug_adapter, "_send_request"):
                            try:
                                status_payload = await debug_adapter._send_request(
                                    debug_state,
                                    "mcpServerStatus/list",
                                    {},
                                )
                            except Exception as exc:  # pragma: no cover - debug only
                                debug_mcp_status = f"error: {exc!r}"
                            else:
                                debug_mcp_status = json.dumps(
                                    status_payload,
                                    sort_keys=True,
                                    default=str,
                                )
                                if len(debug_mcp_status) > 2000:
                                    debug_mcp_status = f"{debug_mcp_status[:2000]}..."
                            try:
                                config_payload = await debug_adapter._send_request(
                                    debug_state,
                                    "config/read",
                                    {},
                                )
                            except Exception as exc:  # pragma: no cover - debug only
                                debug_config_read = f"error: {exc!r}"
                            else:
                                debug_config_read = json.dumps(
                                    config_payload,
                                    sort_keys=True,
                                    default=str,
                                )
                                if len(debug_config_read) > 2000:
                                    debug_config_read = f"{debug_config_read[:2000]}..."
                            try:
                                requirements_payload = await debug_adapter._send_request(
                                    debug_state,
                                    "configRequirements/read",
                                    {},
                                )
                            except Exception as exc:  # pragma: no cover - debug only
                                debug_requirements_read = f"error: {exc!r}"
                            else:
                                debug_requirements_read = json.dumps(
                                    requirements_payload,
                                    sort_keys=True,
                                    default=str,
                                )
                                if len(debug_requirements_read) > 2000:
                                    debug_requirements_read = (
                                        f"{debug_requirements_read[:2000]}..."
                                    )
                outputs = stored.get("outputs")
                assert isinstance(outputs, dict)
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                if (
                    mcp_server.test_tool_state is not None
                    and mcp_server.test_tool_state.get("count", 0) < 1
                    and test_tool_name
                ):
                    stderr_lines = None
                    if run.id in runner._run_state:
                        stderr_lines = runner._run_state[run.id].handle.metadata.get(
                            "stderr_lines"
                        )
                    pytest.fail(
                        self._debug_dump(
                            outputs,
                            stderr_lines,
                            "MCP test tool was not called.",
                        )
                    )
                if test_tool_name and test_tool_token:
                    final_text = outputs.get("finalText")
                    assert isinstance(final_text, str)
                    if not self._matches_repeated_token(
                        final_text, test_tool_token
                    ):
                        stderr_lines = None
                        if run.id in runner._run_state:
                            stderr_lines = runner._run_state[
                                run.id
                            ].handle.metadata.get("stderr_lines")
                        pytest.fail(
                            self._debug_dump(
                                outputs,
                                stderr_lines,
                                "Unexpected MCP tool response text.",
                            )
                        )

                assistant_messages = [
                    message
                    for message in messages
                    if isinstance(message, dict)
                    and message.get("role") == "assistant"
                ]
                tool_calls: list[dict] = []
                for message in assistant_messages:
                    calls = (
                        message.get("tool_calls") if isinstance(message, dict) else None
                    )
                    if isinstance(calls, list):
                        tool_calls.extend(
                            call for call in calls if isinstance(call, dict)
                        )
                # Codex app-server currently does not emit mcpToolCall items for MCP
                # tools, so we treat successful execution of the test tool as the
                # signal that the tool call worked.
                expected_tool_name = test_tool_name or "list_mcp_tools"
                mcp_calls = [
                    call
                    for call in tool_calls
                    if expected_tool_name
                    in (call.get("function", {}).get("name") or "")
                ]
                tool_call_count = 0
                if (
                    mcp_server.test_tool_state is not None
                    and "count" in mcp_server.test_tool_state
                ):
                    tool_call_count = mcp_server.test_tool_state["count"]
                if not mcp_calls:
                    if tool_call_count > 0:
                        return
                    label = "MCP tool call missing."
                    if tool_call_count:
                        label = f"{label} toolCallCount={tool_call_count}"
                    if debug_tool_inventory is not None:
                        truncated = debug_tool_inventory.strip()
                        if len(truncated) > 500:
                            truncated = f"{truncated[:500]}..."
                        label = f"{label} toolInventory={truncated!r}"
                    if debug_mcp_status is not None:
                        label = f"{label} mcpServerStatus={debug_mcp_status!r}"
                    if debug_config_read is not None:
                        label = f"{label} configRead={debug_config_read!r}"
                    if debug_requirements_read is not None:
                        label = (
                            f"{label} configRequirements={debug_requirements_read!r}"
                        )
                    stderr_lines = None
                    if run.id in runner._run_state:
                        stderr_lines = runner._run_state[run.id].handle.metadata.get(
                            "stderr_lines"
                        )
                    pytest.fail(
                        self._debug_dump(outputs, stderr_lines, label)
                    )

    async def test_codex_app_server_resumes_thread_id_across_chats(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            config = self._build_config(codex_path)
            code_word = "setta-codex-thread-codeword"

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        f"Reply with the code word '{code_word}' and nothing else."
                    ),
                    "allowUnscoped": True,
                },
            )
            first_stored = await self._await_completed_run(
                dbe, first_run.id, runner=runner
            )
            first_outputs = first_stored.get("outputs")
            assert isinstance(first_outputs, dict)
            thread_id = first_outputs.get("threadId")
            assert isinstance(thread_id, str)
            assert thread_id

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
                    "allowUnscoped": True,
                },
            )
            stored = await self._await_completed_run(dbe, second_run.id, runner=runner)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            final_text = outputs.get("finalText")
            assert isinstance(final_text, str)
            assert code_word in final_text.lower()
            assert outputs.get("threadId") == thread_id

    async def test_codex_app_server_runs_command_execution_item(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            token = f"setta-codex-command-{secrets.token_hex(8)}"
            with TemporaryDirectory() as workspace_dir:
                work_dir = Path(workspace_dir)
                token_path = work_dir / "token.txt"
                token_path.write_text(token, encoding="utf-8")
                command = (
                    'python -c "from pathlib import Path; '
                    "print(Path('token.txt').read_text())\""
                )

                config = self._build_config(codex_path)
                config.sandboxPolicy = "workspace-write"
                config.workingDirStrategy = ExternalAgentWorkingDirStrategy.custom
                config.workingDir = str(work_dir)

                run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {
                        "prompt": (
                            f"Run the shell command `{command}` in the current "
                            "directory. Do not answer until after it completes. "
                            "Then reply with only the exact command output."
                        ),
                        "allowUnscoped": True,
                    },
                )

                stored = await self._await_completed_run(dbe, run.id, runner=runner)
                outputs = stored.get("outputs")
                events = stored.get("events")
                stderr_lines = None
                if run.id in runner._run_state:
                    stderr_lines = runner._run_state[run.id].handle.metadata.get(
                        "stderr_lines"
                    )
                assert isinstance(outputs, dict)
                final_text = outputs.get("finalText")
                assert isinstance(final_text, str)
                if token not in final_text:
                    pytest.fail(
                        self._debug_dump(outputs, stderr_lines, "Command output missing.")
                    )
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                tool_messages = []
                if isinstance(messages, list):
                    tool_messages = [
                        message
                        for message in messages
                        if isinstance(message, dict)
                        and message.get("role") == "tool"
                    ]
                assert tool_messages
                command_tools = [
                    message
                    for message in tool_messages
                    if message.get("tool_name") == "command_execution"
                ]
                assert command_tools
                assistant_messages = [
                    message
                    for message in messages
                    if isinstance(message, dict)
                    and message.get("role") == "assistant"
                ]
                assert assistant_messages
                tool_calls: list[dict] = []
                for message in assistant_messages:
                    calls = message.get("tool_calls") if isinstance(message, dict) else None
                    if isinstance(calls, list):
                        tool_calls.extend(call for call in calls if isinstance(call, dict))
                assert tool_calls
                tool_names = {
                    call.get("function", {}).get("name")
                    for call in tool_calls
                    if isinstance(call, dict)
                }
                assert "command_execution" in tool_names
                tool_text = self._collect_message_texts(command_tools)
                if token not in tool_text:
                    pytest.fail(
                        self._debug_dump(outputs, stderr_lines, "Command tool output missing.")
                    )
                if isinstance(events, list):
                    event_types = [
                        event.get("type")
                        for event in events
                        if isinstance(event, dict) and event.get("type")
                    ]
                    assert "run_completed" in event_types

    async def test_codex_app_server_runs_file_change_item(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            token = f"setta-codex-file-{secrets.token_hex(8)}"
            with TemporaryDirectory() as workspace_dir:
                work_dir = Path(workspace_dir)
                target_path = work_dir / "target.txt"
                target_path.write_text("placeholder", encoding="utf-8")

                config = self._build_config(codex_path)
                config.sandboxPolicy = "workspace-write"
                config.workingDirStrategy = ExternalAgentWorkingDirStrategy.custom
                config.workingDir = str(work_dir)

                run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {
                        "prompt": (
                            "Update the file `target.txt` in the current directory "
                            f"so that its contents are exactly `{token}`. "
                            "Do not answer until after the file is updated. "
                            "Then reply with only OK."
                        ),
                        "allowUnscoped": True,
                    },
                )

                stored = await self._await_completed_run(dbe, run.id, runner=runner)
                outputs = stored.get("outputs")
                stderr_lines = None
                if run.id in runner._run_state:
                    stderr_lines = runner._run_state[run.id].handle.metadata.get(
                        "stderr_lines"
                    )
                assert isinstance(outputs, dict)
                final_text = outputs.get("finalText")
                assert isinstance(final_text, str)
                file_text = target_path.read_text(encoding="utf-8")
                if token not in file_text:
                    pytest.fail(
                        self._debug_dump(
                            outputs,
                            stderr_lines,
                            "File change did not write expected token.",
                        )
                    )
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                assistant_messages = [
                    message
                    for message in messages
                    if isinstance(message, dict)
                    and message.get("role") == "assistant"
                ]
                assert assistant_messages
                tool_calls: list[dict] = []
                for message in assistant_messages:
                    calls = message.get("tool_calls") if isinstance(message, dict) else None
                    if isinstance(calls, list):
                        tool_calls.extend(call for call in calls if isinstance(call, dict))
                assert tool_calls
                tool_names = {
                    call.get("function", {}).get("name")
                    for call in tool_calls
                    if isinstance(call, dict)
                }
                tool_call_references_target = False
                for call in tool_calls:
                    if not isinstance(call, dict):
                        continue
                    function_payload = call.get("function")
                    if not isinstance(function_payload, dict):
                        continue
                    tool_name = function_payload.get("name")
                    arguments = function_payload.get("arguments")
                    if not isinstance(arguments, dict):
                        continue
                    if tool_name == "file_change":
                        path_arg = arguments.get("path")
                        if isinstance(path_arg, str) and (
                            path_arg == str(target_path) or "target.txt" in path_arg
                        ):
                            tool_call_references_target = True
                            break
                    if tool_name == "command_execution":
                        command_arg = arguments.get("command")
                        if isinstance(command_arg, str) and (
                            str(target_path) in command_arg or "target.txt" in command_arg
                        ):
                            tool_call_references_target = True
                            break
                tool_messages = []
                if isinstance(messages, list):
                    tool_messages = [
                        message
                        for message in messages
                        if isinstance(message, dict)
                        and message.get("role") == "tool"
                    ]
                file_tools = [
                    message
                    for message in tool_messages
                    if message.get("tool_name") == "file_change"
                ]
                command_tools = [
                    message
                    for message in tool_messages
                    if message.get("tool_name") == "command_execution"
                ]
                tool_result_references_target = False
                for message in file_tools:
                    if not isinstance(message, dict):
                        continue
                    arguments = message.get("arguments")
                    if isinstance(arguments, dict):
                        path_arg = arguments.get("path")
                        if isinstance(path_arg, str) and (
                            path_arg == str(target_path) or "target.txt" in path_arg
                        ):
                            tool_result_references_target = True
                            break
                    result = message.get("result")
                    if isinstance(result, dict):
                        path_result = result.get("path")
                        if isinstance(path_result, str) and (
                            path_result == str(target_path) or "target.txt" in path_result
                        ):
                            tool_result_references_target = True
                            break
                        diff_result = result.get("diff")
                        if isinstance(diff_result, str) and (
                            str(target_path) in diff_result or "target.txt" in diff_result
                        ):
                            tool_result_references_target = True
                            break
                if not tool_result_references_target:
                    for message in command_tools:
                        if not isinstance(message, dict):
                            continue
                        arguments = message.get("arguments")
                        if isinstance(arguments, dict):
                            command_arg = arguments.get("command")
                            if isinstance(command_arg, str) and (
                                str(target_path) in command_arg
                                or "target.txt" in command_arg
                            ):
                                tool_result_references_target = True
                                break
                if file_tools:
                    # Codex can emit a file-change result while the paired assistant
                    # tool call is surfaced as command_execution.
                    assert "file_change" in tool_names or "command_execution" in tool_names
                    if not tool_call_references_target and not tool_result_references_target:
                        pytest.fail(
                            self._debug_dump(
                                outputs,
                                stderr_lines,
                                "Neither tool call metadata nor tool results referenced target.txt.",
                            )
                        )
                else:
                    assert "command_execution" in tool_names
                    assert command_tools
                    command_text = " ".join(
                        str(message.get("arguments", {}).get("command", ""))
                        for message in command_tools
                        if isinstance(message, dict)
                    )
                    if str(target_path) not in command_text and "target.txt" not in command_text:
                        pytest.fail(
                            self._debug_dump(
                                outputs,
                                stderr_lines,
                                "Command tool did not reference target.txt.",
                            )
                        )

    async def test_codex_app_server_approves_command_execution(self) -> None:
        codex_path = self._require_codex_cli()
        with TemporaryDirectory() as tmpdir:
            dbe, runner = self._build_runner(Path(tmpdir))
            with TemporaryDirectory() as workspace_dir:
                work_dir = Path(workspace_dir)
                token_bytes = secrets.token_bytes(512)
                token_path = work_dir / "token.bin"
                token_path.write_bytes(token_bytes)
                hash_path = work_dir / "hash.py"
                hash_path.write_text(
                    (
                        "import hashlib\n"
                        "from pathlib import Path\n"
                        "data = Path('token.bin').read_bytes()\n"
                        "print(hashlib.sha256(data).hexdigest())\n"
                    ),
                    encoding="utf-8",
                )
                expected_hash = hashlib.sha256(token_bytes).hexdigest()
                command = "python hash.py"

                config = self._build_config(codex_path)
                config.approvalPolicy = "untrusted"
                config.sandboxPolicy = "workspace-write"
                config.workingDirStrategy = ExternalAgentWorkingDirStrategy.custom
                config.workingDir = str(work_dir)

                run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {
                        "prompt": (
                            "Run the shell command exactly as written (do not "
                            "substitute or simplify): "
                            f"`{command}` in the current directory. Do not answer "
                            "until after it completes. Then reply with only the "
                            "exact command output."
                        ),
                        "allowUnscoped": True,
                    },
                )

                approval_id = await self._await_pending_approval(runner, dbe, run.id)
                await runner.respond_to_approval(approval_id, True)

                stored = await self._await_completed_run(dbe, run.id, runner=runner)
                outputs = stored.get("outputs")
                assert isinstance(outputs, dict)
                final_text = outputs.get("finalText")
                assert isinstance(final_text, str)
                if not self._matches_repeated_token(final_text, expected_hash):
                    stderr_lines = None
                    if run.id in runner._run_state:
                        stderr_lines = runner._run_state[run.id].handle.metadata.get(
                            "stderr_lines"
                        )
                    pytest.fail(
                        self._debug_dump(
                            outputs,
                            stderr_lines,
                            "Unexpected command output text.",
                        )
                    )
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                approvals = [
                    message
                    for message in messages
                    if isinstance(message, dict)
                    and message.get("role") == "tool"
                    and message.get("tool_name") == "setta.approval"
                ]
                assert approvals
                if approvals:
                    result = approvals[-1].get("result")
                    if isinstance(result, dict):
                        assert result.get("approved")
