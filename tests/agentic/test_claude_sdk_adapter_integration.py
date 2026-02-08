import asyncio
import importlib.metadata
import json
import os
import socket
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.agentic.external_adapters.base import ExternalAgentRunHandle
from setta.agentic.external_adapters.claude_sdk import ClaudeSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.database.db_objs import DBE
from setta.types.external_agents import (
    ClaudeSettingsManaged,
    ClaudeSettingsPermissions,
    ClaudeSettingsSource,
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentSettingsManagedBlock,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.mcp_test_server import run_test_mcp_server


pytestmark = pytest.mark.asyncio


class TestClaudeSdkAdapterIntegration:
    @staticmethod
    @contextmanager
    def _temp_home(base_dir: Path):
        home_dir = base_dir / "claude_home"
        config_dir = home_dir / ".config"
        state_dir = home_dir / ".local" / "state"
        cache_dir = home_dir / ".cache"
        home_dir.mkdir(parents=True, exist_ok=True)
        config_dir.mkdir(parents=True, exist_ok=True)
        state_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)
        keys = ("HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME")
        original = {key: os.environ.get(key) for key in keys}
        os.environ["HOME"] = str(home_dir)
        os.environ["XDG_CONFIG_HOME"] = str(config_dir)
        os.environ["XDG_STATE_HOME"] = str(state_dir)
        os.environ["XDG_CACHE_HOME"] = str(cache_dir)
        try:
            yield
        finally:
            for key, value in original.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    @staticmethod
    def _write_empty_mcp_config(base_dir: Path) -> str:
        path = base_dir / "empty_mcp.json"
        path.write_text(json.dumps({"mcpServers": {}}, indent=2), encoding="utf-8")
        return str(path)

    def _require_claude_sdk(self) -> str:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")
        try:
            socket.getaddrinfo("api.anthropic.com", 443)
            with socket.create_connection(
                ("api.anthropic.com", 443),
                timeout=3,
            ):
                pass
        except OSError:
            pytest.skip("Cannot connect to api.anthropic.com:443")
        try:
            version = importlib.metadata.version("claude-agent-sdk")
        except importlib.metadata.PackageNotFoundError:
            pytest.fail("claude-agent-sdk is not installed")
        return version

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
        assert stored is not None
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
            pytest.fail(
                "Claude SDK run failed; "
                f"status={status}, error={error}, events={events}, outputs={outputs}"
            )
        return stored

    async def _await_run_handle(
        self, runner: ExternalAgentRunner, run_id: ID
    ) -> ExternalAgentRunHandle:
        for _ in range(50):
            state = runner._run_state.get(run_id)
            if state is not None:
                return state.handle
            task = runner._tasks.get(run_id)
            if task is not None and task.done():
                break
            await asyncio.sleep(0.1)
        pytest.fail(
            "Claude SDK run did not register a Python SDK handle before completion."
        )
        raise AssertionError("Unreachable")

    async def _await_pending_question(
        self, runner: ExternalAgentRunner, run_id: ID
    ) -> str:
        for _ in range(200):
            for tool_call_id, state in runner._pending_questions.items():
                if state.run_id == run_id and state.approval_id:
                    return tool_call_id
            await asyncio.sleep(0.1)
        pytest.fail("Claude SDK run did not request a user question in time.")
        raise AssertionError("Unreachable")

    async def _await_pending_approval(
        self, runner: ExternalAgentRunner, run_id: ID
    ) -> str:
        for _ in range(200):
            for approval_id, state in runner._pending_approvals.items():
                if state.run_id == run_id:
                    return approval_id
            await asyncio.sleep(0.1)
        pytest.fail("Claude SDK run did not request a tool approval in time.")
        raise AssertionError("Unreachable")

    def _assert_python_sdk_handle(self, handle: ExternalAgentRunHandle) -> None:
        assert handle.process is None
        queue = handle.metadata.get("queue")
        assert isinstance(queue, asyncio.Queue)
        task = handle.metadata.get("task")
        assert isinstance(task, asyncio.Task)
        if isinstance(task, asyncio.Task):
            coro = task.get_coro()
            code = getattr(coro, "cr_code", None)
            filename = getattr(code, "co_filename", "")
            assert filename.endswith("claude_sdk.py")

    @staticmethod
    def _debug_dump(
        handle: ExternalAgentRunHandle, outputs: dict | None, label: str
    ) -> str:
        stderr_lines = handle.metadata.get("stderr_lines")
        stderr_tail = []
        if isinstance(stderr_lines, list):
            stderr_tail = [str(line) for line in stderr_lines[-50:]]
        return (
            f"{label} outputs={outputs} "
            f"cliStderrTail={stderr_tail if stderr_tail else '[]'}"
        )

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
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "mcpConfig": mcp_config, "allowUnscoped": True},
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            await self._await_completed_run(dbe, run.id)

    async def test_claude_sdk_persists_session_id(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "mcpConfig": mcp_config, "allowUnscoped": True},
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            if not isinstance(outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            session_id = outputs.get("sessionId")
            assert isinstance(session_id, str)
            if not isinstance(session_id, str) or not session_id:
                raise AssertionError("Expected non-empty sessionId in outputs")

    async def test_claude_sdk_reuses_session_id_for_chat(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            first_run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "mcpConfig": mcp_config, "allowUnscoped": True},
            )

            await self._await_run_handle(runner, first_run.id)
            first_stored = await self._await_completed_run(dbe, first_run.id)
            first_outputs = first_stored.get("outputs")
            assert isinstance(first_outputs, dict)
            if not isinstance(first_outputs, dict):
                raise AssertionError("Expected outputs to be a dict")
            session_id = first_outputs.get("sessionId")
            assert isinstance(session_id, str)
            if not isinstance(session_id, str) or not session_id:
                raise AssertionError("Expected non-empty sessionId in outputs")

            second_run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": "Say hello again.",
                    "chatId": str(first_run.id),
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                },
            )

            second_inputs = second_run.inputs or {}
            assert second_inputs.get("sessionId") == session_id

            await self._await_completed_run(dbe, second_run.id)

    async def test_claude_sdk_reads_file_with_tool(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 1,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            all_text = self._collect_message_texts(messages)
            if token not in all_text:
                pytest.fail(
                    self._debug_dump(handle, outputs, "Read tool token not found.")
                )
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            assert assistant_messages
            tool_calls: list[dict] = []
            for message in assistant_messages:
                calls = message.get("tool_calls") if isinstance(message, dict) else None
                if isinstance(calls, list):
                    tool_calls.extend(
                        call for call in calls if isinstance(call, dict)
                    )
            assert tool_calls
            tool_names = {
                call.get("function", {}).get("name")
                for call in tool_calls
                if isinstance(call, dict)
            }
            assert "Read" in tool_names

    async def test_claude_sdk_runs_bash_tool(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 1,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            all_text = self._collect_message_texts(messages)
            if "alpha.txt" not in all_text:
                pytest.fail(
                    self._debug_dump(
                        handle, outputs, "Bash tool output missing alpha.txt."
                    )
                )
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
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
            assert "Bash" in tool_names

    async def test_claude_sdk_todo_write_tool(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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

            token = "setta-todo-token"
            todo_payload = {
                "todos": [
                    {"content": f"{token}-one", "status": "pending"},
                    {"content": f"{token}-two", "status": "in_progress"},
                ]
            }
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy="allow",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "Before answering, call the TodoWrite tool with this JSON "
                        "payload exactly:\n"
                        f"{json.dumps(todo_payload)}\n"
                        "After the tool call, reply with only OK."
                    ),
                    "allowedTools": ["TodoWrite"],
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 2,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)

            tool_errors = []
            for message in messages:
                if (
                    isinstance(message, dict)
                    and message.get("role") == "tool"
                    and message.get("is_error")
                ):
                    tool_errors.append(self._extract_tool_text(message))
            if tool_errors:
                pytest.fail(
                    self._debug_dump(
                        handle,
                        outputs,
                        f"Tool errors encountered: {tool_errors}",
                    )
                )

            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            tool_calls: list[dict] = []
            for message in assistant_messages:
                calls = message.get("tool_calls") if isinstance(message, dict) else None
                if isinstance(calls, list):
                    tool_calls.extend(call for call in calls if isinstance(call, dict))
            assert tool_calls
            todo_calls = [
                call
                for call in tool_calls
                if call.get("function", {}).get("name") == "TodoWrite"
            ]
            assert todo_calls
            for call in todo_calls:
                arguments = call.get("function", {}).get("arguments")
                assert isinstance(arguments, dict)
                if isinstance(arguments, dict):
                    todos = arguments.get("todos")
                    assert isinstance(todos, list)
                    if isinstance(todos, list):
                        todo_text = " ".join(
                            str(entry.get("content"))
                            for entry in todos
                            if isinstance(entry, dict)
                        )
                        assert token in todo_text

    async def test_claude_sdk_mcp_tool_call(self) -> None:
        self._require_claude_sdk()

        async with run_test_mcp_server():
            with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
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
                    approvalPolicy="allow",
                    envVarWhitelist=["ANTHROPIC_API_KEY"],
                )

                run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {
                        "prompt": (
                            "Call the list_mcp_tools tool. Do not answer until "
                            "after the tool result. Then reply with only OK."
                        ),
                        "allowedTools": ["list_mcp_tools"],
                        "maxTurns": 1,
                    },
                )

                handle = await self._await_run_handle(runner, run.id)
                self._assert_python_sdk_handle(handle)

                stored = await self._await_completed_run(dbe, run.id)
                outputs = stored.get("outputs")
                assert isinstance(outputs, dict)
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                if not isinstance(messages, list):
                    raise AssertionError("Expected messages to be a list")

                tool_errors = []
                for message in messages:
                    if (
                        isinstance(message, dict)
                        and message.get("role") == "tool"
                        and message.get("is_error")
                    ):
                        tool_errors.append(self._extract_tool_text(message))
                if tool_errors:
                    pytest.fail(
                        self._debug_dump(
                            handle,
                            outputs,
                            f"Tool errors encountered: {tool_errors}",
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
                mcp_calls = [
                    call
                    for call in tool_calls
                    if "list_mcp_tools"
                    in (call.get("function", {}).get("name") or "")
                ]
                assert mcp_calls

    async def test_claude_sdk_local_settings_prompt_for_echo(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
            work_dir = Path(tmpdir) / "workspace"
            work_dir.mkdir(parents=True, exist_ok=True)
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
                approvalPolicy="ask",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
                workingDirStrategy=ExternalAgentWorkingDirStrategy.custom,
                workingDir=str(work_dir),
                settingsMode=ExternalAgentSettingsMode.managed_local,
                settingsSources=[ClaudeSettingsSource.local],
                settingsAllowSettaEdits=True,
                settingsManagedBlock=ExternalAgentSettingsManagedBlock(
                    claude=ClaudeSettingsManaged(
                        permissions=ClaudeSettingsPermissions(
                            ask=["Bash(echo:*)"]
                        )
                    )
                ),
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "You must call the Bash tool to run "
                        "`echo setta-claude-settings` in the current directory. "
                        "Do not answer until after the tool result. "
                        "Then reply with only the exact command output."
                    ),
                    "allowedTools": ["Bash"],
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 1,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            approval_id = None
            for _ in range(200):
                for pending_id, state in runner._pending_approvals.items():
                    if state.run_id == run.id:
                        approval_id = pending_id
                        break
                if approval_id:
                    break
                await asyncio.sleep(0.1)
            if approval_id:
                await runner.respond_to_approval(approval_id, True)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            all_text = self._collect_message_texts(messages)
            if "setta-claude-settings" not in all_text:
                pytest.fail(
                    self._debug_dump(
                        handle,
                        outputs,
                        "Echo command output missing expected token.",
                    )
                )

            settings_path = Path(tmpdir) / ".claude" / "settings.local.json"
            assert settings_path.exists()
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            assert isinstance(permissions, dict)
            if isinstance(permissions, dict):
                assert permissions.get("ask") == ["Bash(echo:*)"]

    async def test_claude_sdk_emits_thinking_blocks(self) -> None:
        self._require_claude_sdk()
        model_override = os.environ.get("SETTA_CLAUDE_THINKING_MODEL")
        thinking_model = model_override or "claude-opus-4-5"

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 1,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            thinking_blocks = self._collect_thinking_blocks(messages)
            if not thinking_blocks:
                pytest.fail(f"Expected thinking blocks; outputs={outputs}")
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
            assert (thinking_text + summary_text).strip()

    async def test_claude_sdk_ask_user_question_tool(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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

            question_payload = {
                "questions": [
                    {
                        "header": "Language",
                        "question": "Pick a language",
                        "multiSelect": False,
                        "options": [{"label": "Python"}, {"label": "TypeScript"}],
                    }
                ]
            }
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy="ask",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "Before answering, call the AskUserQuestion tool with this "
                        "JSON payload exactly:\n"
                        f"{json.dumps(question_payload)}\n"
                        "After I answer, reply with only OK."
                    ),
                    "allowedTools": ["AskUserQuestion"],
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 2,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            tool_call_id = await self._await_pending_question(runner, run.id)
            answers = {"Pick a language": "Python"}
            await runner.respond_to_question(tool_call_id, answers)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            tool_errors = []
            for message in messages:
                if (
                    isinstance(message, dict)
                    and message.get("role") == "tool"
                    and message.get("is_error")
                ):
                    tool_errors.append(self._extract_tool_text(message))
            if tool_errors:
                pytest.fail(
                    self._debug_dump(
                        handle,
                        outputs,
                        f"Tool errors encountered: {tool_errors}",
                    )
                )
            all_text = self._collect_message_texts(messages)
            if "Stream closed" in all_text:
                pytest.fail(
                    self._debug_dump(
                        handle,
                        outputs,
                        "Stream closed error leaked into messages.",
                    )
                )

            tool_call = None
            for message in messages:
                if not isinstance(message, dict) or message.get("role") != "assistant":
                    continue
                calls = message.get("tool_calls")
                if not isinstance(calls, list):
                    continue
                for call in calls:
                    if not isinstance(call, dict):
                        continue
                    function = call.get("function")
                    if (
                        isinstance(function, dict)
                        and function.get("name") == "AskUserQuestion"
                    ):
                        tool_call = call
                        break
                if tool_call:
                    break
            assert tool_call is not None
            if tool_call is None:
                return
            arguments = tool_call.get("function", {}).get("arguments")
            assert isinstance(arguments, dict)
            questions = None
            if isinstance(arguments, dict):
                questions = arguments.get("questions")
            assert isinstance(questions, list)
            if isinstance(questions, list):
                assert len(questions) == 1

    async def test_claude_sdk_ask_user_question_multiple_prompts(self) -> None:
        self._require_claude_sdk()

        with TemporaryDirectory() as tmpdir, self._temp_home(Path(tmpdir)):
            mcp_config = self._write_empty_mcp_config(Path(tmpdir))
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

            question_payload = {
                "questions": [
                    {
                        "header": "Language",
                        "question": "Choose a language",
                        "multiSelect": False,
                        "options": [{"label": "Python"}, {"label": "TypeScript"}],
                    },
                    {
                        "header": "Target",
                        "question": "Choose a target",
                        "multiSelect": False,
                        "options": [{"label": "CLI"}, {"label": "Web"}],
                    },
                ]
            }
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy="ask",
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {
                    "prompt": (
                        "Before answering, call the AskUserQuestion tool with this "
                        "JSON payload exactly:\n"
                        f"{json.dumps(question_payload)}\n"
                        "After I answer, reply with only OK."
                    ),
                    "allowedTools": ["AskUserQuestion"],
                    "mcpConfig": mcp_config,
                    "allowUnscoped": True,
                    "maxTurns": 2,
                },
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            tool_call_id = await self._await_pending_question(runner, run.id)
            answers = {
                "Choose a language": "Python",
                "Choose a target": "CLI",
            }
            await runner.respond_to_question(tool_call_id, answers)

            stored = await self._await_completed_run(dbe, run.id)
            outputs = stored.get("outputs")
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            tool_errors = []
            for message in messages:
                if (
                    isinstance(message, dict)
                    and message.get("role") == "tool"
                    and message.get("is_error")
                ):
                    tool_errors.append(self._extract_tool_text(message))
            if tool_errors:
                pytest.fail(
                    self._debug_dump(
                        handle,
                        outputs,
                        f"Tool errors encountered: {tool_errors}",
                    )
                )
            all_text = self._collect_message_texts(messages)
            if "Stream closed" in all_text:
                pytest.fail(
                    self._debug_dump(
                        handle,
                        outputs,
                        "Stream closed error leaked into messages.",
                    )
                )

            tool_call = None
            for message in messages:
                if not isinstance(message, dict) or message.get("role") != "assistant":
                    continue
                calls = message.get("tool_calls")
                if not isinstance(calls, list):
                    continue
                for call in calls:
                    if not isinstance(call, dict):
                        continue
                    function = call.get("function")
                    if (
                        isinstance(function, dict)
                        and function.get("name") == "AskUserQuestion"
                    ):
                        tool_call = call
                        break
                if tool_call:
                    break
            assert tool_call is not None
            if tool_call is None:
                return
            arguments = tool_call.get("function", {}).get("arguments")
            assert isinstance(arguments, dict)
            questions = None
            if isinstance(arguments, dict):
                questions = arguments.get("questions")
            assert isinstance(questions, list)
            if isinstance(questions, list):
                assert len(questions) == 2

            tool_messages = [
                message
                for message in messages
                if isinstance(message, dict)
                and message.get("role") == "tool"
                and message.get("tool_name") == "AskUserQuestion"
            ]
            assert tool_messages
            last_tool = tool_messages[-1]
            assert last_tool.get("result") == {"answers": answers}
            assert "OK" in all_text
