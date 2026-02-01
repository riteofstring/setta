import asyncio
import importlib.metadata
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.agentic.external_adapters.base import ExternalAgentRunHandle
from setta.agentic.external_agent_defaults import build_default_claude_settings_block
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
from setta.types.websocket import WebsocketConnectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.mcp_test_server import run_test_mcp_server


pytestmark = pytest.mark.asyncio


_SUB_AGENT_TOOL_NAMES = {"task", "run_agent_profile", "subagent", "sub_agent"}


def _normalize_tool_name(tool_name: str | None) -> str | None:
    if not tool_name:
        return None
    trimmed = tool_name.strip()
    if not trimmed:
        return None
    tail = trimmed.split("__")[-1] if "__" in trimmed else trimmed
    tail = tail.split(".")[-1] if "." in tail else tail
    lowered = tail.strip().lower()
    return lowered if lowered else None


async def _build_websocket(messages: list[Message]) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "scheme": "ws",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 0),
        "server": ("testserver", 80),
        "subprotocols": [],
    }
    return WebSocket(scope=scope, receive=receive, send=send)


def _iter_streaming_payloads(messages: list[Message]) -> list[dict]:
    payloads: list[dict] = []
    for message in messages:
        if message.get("type") != "websocket.send":
            continue
        text = message.get("text")
        if not isinstance(text, str):
            continue
        payload = json.loads(text)
        if payload.get("messageType") == "LLMStreamingResponse":
            payloads.append(payload)
    return payloads


async def _await_subagent_stream(
    messages: list[Message],
    *,
    main_chat_id: str,
    timeout_s: float = 120.0,
) -> tuple[set[str], set[str], set[str]]:
    start = time.monotonic()
    main_tool_call_ids: set[str] = set()
    subagent_tool_call_ids: set[str] = set()
    subagent_chat_ids: set[str] = set()
    last_idx = 0
    while time.monotonic() - start < timeout_s:
        new_messages = messages[last_idx:]
        last_idx = len(messages)
        payloads = _iter_streaming_payloads(new_messages)
        for payload in payloads:
            content = payload.get("content")
            if not isinstance(content, dict):
                continue
            chat_id = content.get("chatId")
            chunk = content.get("chunk")
            if not isinstance(chunk, dict):
                continue
            chunk_type = chunk.get("type")
            if chunk_type == "tool_call_delta":
                tool_call_id = chunk.get("tool_call_id")
                if not isinstance(tool_call_id, str) or not tool_call_id:
                    continue
                if chat_id == main_chat_id:
                    main_tool_call_ids.add(tool_call_id)
                    normalized = _normalize_tool_name(chunk.get("tool_name"))
                    if normalized in _SUB_AGENT_TOOL_NAMES:
                        subagent_tool_call_ids.add(tool_call_id)
                        print(
                            "[subagent-test] detected sub-agent tool call",
                            {"toolCallId": tool_call_id, "toolName": chunk.get("tool_name")},
                        )
            if chunk_type in {"message_start", "message_finalized"}:
                message = chunk.get("message")
                if isinstance(message, dict):
                    tool_calls = message.get("tool_calls")
                    if isinstance(tool_calls, list) and chat_id == main_chat_id:
                        for call in tool_calls:
                            if not isinstance(call, dict):
                                continue
                            tool_call_id = call.get("id")
                            if isinstance(tool_call_id, str) and tool_call_id:
                                main_tool_call_ids.add(tool_call_id)
                            function = call.get("function")
                            name = function.get("name") if isinstance(function, dict) else None
                            normalized = _normalize_tool_name(name)
                            if (
                                isinstance(tool_call_id, str)
                                and tool_call_id
                                and normalized in _SUB_AGENT_TOOL_NAMES
                            ):
                                subagent_tool_call_ids.add(tool_call_id)
                                print(
                                    "[subagent-test] detected sub-agent tool call",
                                    {"toolCallId": tool_call_id, "toolName": name},
                                )
            message_id = chunk.get("message_id")
            if not message_id and isinstance(chunk.get("message"), dict):
                message_id = chunk["message"].get("id")
            if isinstance(message_id, str) and message_id.startswith("subagent-result:"):
                suffix = message_id.split("subagent-result:", 1)[1]
                if isinstance(chat_id, str) and chat_id == suffix and chat_id != main_chat_id:
                    subagent_chat_ids.add(chat_id)
                    print(
                        "[subagent-test] detected sub-agent stream",
                        {"chatId": chat_id, "messageId": message_id},
                    )
        if subagent_tool_call_ids and subagent_chat_ids:
            if subagent_tool_call_ids.intersection(subagent_chat_ids):
                return main_tool_call_ids, subagent_tool_call_ids, subagent_chat_ids
        await asyncio.sleep(0.5)
    return main_tool_call_ids, subagent_tool_call_ids, subagent_chat_ids


def _summarize_streaming_payloads(
    payloads: list[dict],
    *,
    main_chat_id: str,
) -> dict[str, object]:
    main_tool_call_ids: set[str] = set()
    subagent_tool_call_ids: set[str] = set()
    subagent_stream_chat_ids: set[str] = set()
    subagent_message_start_chat_ids: set[str] = set()
    subagent_delta_chat_ids: set[str] = set()
    subagent_delta_counts: dict[str, int] = {}
    subagent_delta_text_lengths: dict[str, int] = {}
    main_tool_result_ids: set[str] = set()
    unknown_main_tool_results: list[dict] = []

    for payload in payloads:
        content = payload.get("content")
        if not isinstance(content, dict):
            continue
        chat_id = content.get("chatId")
        chunk = content.get("chunk")
        if not isinstance(chunk, dict):
            continue
        chunk_type = chunk.get("type")
        if chunk_type == "tool_call_delta":
            tool_call_id = chunk.get("tool_call_id")
            if isinstance(tool_call_id, str) and tool_call_id:
                if chat_id == main_chat_id:
                    main_tool_call_ids.add(tool_call_id)
                normalized = _normalize_tool_name(chunk.get("tool_name"))
                if chat_id == main_chat_id and normalized in _SUB_AGENT_TOOL_NAMES:
                    subagent_tool_call_ids.add(tool_call_id)
        if chunk_type in {"message_start", "message_finalized"}:
            message = chunk.get("message")
            if isinstance(message, dict):
                tool_calls = message.get("tool_calls")
                if isinstance(tool_calls, list):
                    for call in tool_calls:
                        if not isinstance(call, dict):
                            continue
                        tool_call_id = call.get("id")
                        if isinstance(tool_call_id, str) and tool_call_id:
                            if chat_id == main_chat_id:
                                main_tool_call_ids.add(tool_call_id)
                            function = call.get("function")
                            name = function.get("name") if isinstance(function, dict) else None
                            normalized = _normalize_tool_name(name)
                            if chat_id == main_chat_id and normalized in _SUB_AGENT_TOOL_NAMES:
                                subagent_tool_call_ids.add(tool_call_id)
        if chunk_type == "tool_result" and chat_id == main_chat_id:
            result = chunk.get("result")
            tool_call_id = None
            if isinstance(result, dict):
                tool_call_id = result.get("tool_call_id")
            if isinstance(tool_call_id, str) and tool_call_id:
                main_tool_result_ids.add(tool_call_id)
                if tool_call_id not in main_tool_call_ids:
                    unknown_main_tool_results.append(
                        {
                            "toolCallId": tool_call_id,
                            "chunk": chunk,
                        }
                    )
        message_id = chunk.get("message_id")
        if not message_id and isinstance(chunk.get("message"), dict):
            message_id = chunk["message"].get("id")
        if isinstance(message_id, str) and message_id.startswith("subagent-result:"):
            suffix = message_id.split("subagent-result:", 1)[1]
            if isinstance(chat_id, str) and chat_id == suffix and chat_id != main_chat_id:
                subagent_stream_chat_ids.add(chat_id)
                if chunk_type == "message_start":
                    subagent_message_start_chat_ids.add(chat_id)
                if chunk_type == "delta":
                    subagent_delta_chat_ids.add(chat_id)
                    subagent_delta_counts[chat_id] = (
                        subagent_delta_counts.get(chat_id, 0) + 1
                    )
                    delta_text_length = 0
                    content_entries = chunk.get("content")
                    if isinstance(content_entries, list):
                        for entry in content_entries:
                            if not isinstance(entry, dict):
                                continue
                            if entry.get("type") != "text_delta":
                                continue
                            text = entry.get("text")
                            if isinstance(text, str):
                                delta_text_length += len(text)
                    if delta_text_length:
                        subagent_delta_text_lengths[chat_id] = (
                            subagent_delta_text_lengths.get(chat_id, 0)
                            + delta_text_length
                        )

    return {
        "main_tool_call_ids": main_tool_call_ids,
        "subagent_tool_call_ids": subagent_tool_call_ids,
        "subagent_stream_chat_ids": subagent_stream_chat_ids,
        "subagent_message_start_chat_ids": subagent_message_start_chat_ids,
        "subagent_delta_chat_ids": subagent_delta_chat_ids,
        "subagent_delta_counts": subagent_delta_counts,
        "subagent_delta_text_lengths": subagent_delta_text_lengths,
        "main_tool_result_ids": main_tool_result_ids,
        "unknown_main_tool_results": unknown_main_tool_results,
    }


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
        try:
            version = importlib.metadata.version("claude-agent-sdk")
        except importlib.metadata.PackageNotFoundError:
            pytest.skip("claude-agent-sdk is not installed")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            pytest.skip("ANTHROPIC_API_KEY not set")
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
                settingsManagedBlock=build_default_claude_settings_block(),
                envVarWhitelist=["ANTHROPIC_API_KEY"],
            )

            run = runner.start_run(
                config.id,
                config,
                None,
                {"prompt": "Say hello.", "mcpConfig": mcp_config},
            )

            handle = await self._await_run_handle(runner, run.id)
            self._assert_python_sdk_handle(handle)

            await self._await_completed_run(dbe, run.id)

    async def test_claude_sdk_subagent_streams_to_subagent_chat(self) -> None:
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

            messages: list[Message] = []
            websocket = await _build_websocket(messages)
            websocket_id = await websocket_manager.on_connect(
                websocket,
                WebsocketConnectionType.FRONTEND,
                id="frontend-subagent-stream",
                broadcast_connections=False,
            )

            try:
                run = runner.start_run(
                    config.id,
                    config,
                    None,
                    {
                        "prompt": (
                            "Can you get some sub-agents to do some really simple "
                            "random tasks? I want to see how they render in this UI. "
                            "For each sub-agent, please include a short numbered list "
                            "of at least 8 items plus a brief summary paragraph."
                        ),
                        "mcpConfig": mcp_config,
                    },
                )

                handle = await self._await_run_handle(runner, run.id)
                self._assert_python_sdk_handle(handle)

                (
                    main_tool_call_ids,
                    subagent_tool_call_ids,
                    subagent_chat_ids,
                ) = await _await_subagent_stream(
                    messages,
                    main_chat_id=str(run.id),
                    timeout_s=180.0,
                )
                payloads = _iter_streaming_payloads(messages)
                summary = _summarize_streaming_payloads(
                    payloads, main_chat_id=str(run.id)
                )
                print(
                    "[subagent-test] summary",
                    {
                        "mainToolCalls": sorted(main_tool_call_ids),
                        "subagentToolCalls": sorted(subagent_tool_call_ids),
                        "subagentChatIds": sorted(subagent_chat_ids),
                        "mainToolResults": sorted(summary["main_tool_result_ids"]),
                        "unknownMainToolResults": len(
                            summary["unknown_main_tool_results"]
                        ),
                    },
                )
                if not subagent_tool_call_ids:
                    tail = payloads[-5:] if len(payloads) > 5 else payloads
                    stored = await self._await_completed_run(dbe, run.id)
                    events = stored.get("events")
                    outputs = stored.get("outputs")
                    raise AssertionError(
                        "Expected at least one sub-agent tool call delta in main chat "
                        f"recent_payloads={tail} events={events} outputs={outputs}"
                    )
                if not subagent_tool_call_ids.intersection(subagent_chat_ids):
                    tail = payloads[-5:] if len(payloads) > 5 else payloads
                    raise AssertionError(
                        "Expected sub-agent streaming routed to sub-agent chat "
                        f"subagent_tool_calls={sorted(subagent_tool_call_ids)} "
                        f"subagent_chat_ids={sorted(subagent_chat_ids)} "
                        f"recent_payloads={tail}"
                    )
                unknown_results = summary["unknown_main_tool_results"]
                if unknown_results:
                    sample = unknown_results[:5]
                    raise AssertionError(
                        "Unexpected tool_result events on main chat without matching "
                        "tool_call_delta; likely sub-agent tool results routed to "
                        f"main chat. sample={sample}"
                    )

                await self._await_completed_run(dbe, run.id)
                payloads = _iter_streaming_payloads(messages)
                final_summary = _summarize_streaming_payloads(
                    payloads, main_chat_id=str(run.id)
                )
                missing_subagent_streams = (
                    final_summary["subagent_tool_call_ids"]
                    - final_summary["subagent_stream_chat_ids"]
                )
                missing_message_starts = (
                    final_summary["subagent_tool_call_ids"]
                    - final_summary["subagent_message_start_chat_ids"]
                )
                missing_deltas = (
                    final_summary["subagent_tool_call_ids"]
                    - final_summary["subagent_delta_chat_ids"]
                )
                print(
                    "[subagent-test] missing subagent streams",
                    sorted(missing_subagent_streams),
                )
                print(
                    "[subagent-test] missing subagent message_start",
                    sorted(missing_message_starts),
                )
                print(
                    "[subagent-test] missing subagent delta",
                    sorted(missing_deltas),
                )
                if missing_subagent_streams:
                    raise AssertionError(
                        "Expected a sub-agent stream for every Task tool call; "
                        f"missing={sorted(missing_subagent_streams)}"
                    )
                if missing_message_starts:
                    raise AssertionError(
                        "Expected a sub-agent message_start for every Task tool call; "
                        f"missing={sorted(missing_message_starts)}"
                    )
                if missing_deltas:
                    raise AssertionError(
                        "Expected a sub-agent delta before completion for every Task "
                        f"tool call; missing={sorted(missing_deltas)}"
                    )
                delta_counts = final_summary["subagent_delta_counts"]
                delta_text_lengths = final_summary["subagent_delta_text_lengths"]
                insufficient_deltas = [
                    tool_call_id
                    for tool_call_id in final_summary["subagent_tool_call_ids"]
                    if delta_counts.get(tool_call_id, 0) < 2
                ]
                print(
                    "[subagent-test] delta counts",
                    {
                        "counts": {
                            tool_call_id: delta_counts.get(tool_call_id, 0)
                            for tool_call_id in final_summary["subagent_tool_call_ids"]
                        },
                        "textLengths": {
                            tool_call_id: delta_text_lengths.get(tool_call_id, 0)
                            for tool_call_id in final_summary["subagent_tool_call_ids"]
                        },
                    },
                )
                if insufficient_deltas:
                    raise AssertionError(
                        "Expected multiple sub-agent delta chunks for streaming output; "
                        f"insufficient={sorted(insufficient_deltas)} "
                        f"counts={delta_counts} text_lengths={delta_text_lengths}"
                    )
                unknown_results = final_summary["unknown_main_tool_results"]
                if unknown_results:
                    sample = unknown_results[:5]
                    raise AssertionError(
                        "Unexpected tool_result events on main chat without matching "
                        "tool_call_delta after run completion; likely sub-agent tool "
                        f"results routed to main chat. sample={sample}"
                    )
            finally:
                await websocket_manager.on_disconnect(
                    websocket_id,
                    broadcast_connections=False,
                )
                await websocket.close()

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
                {"prompt": "Say hello.", "mcpConfig": mcp_config},
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
                {"prompt": "Say hello.", "mcpConfig": mcp_config},
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
