import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from mcp.types import TextContent

from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
    ExternalAgentStreamEvent,
)
from setta.agentic.external_adapters.prompt_utils import build_prompt_from_inputs
from setta.agentic.external_adapters.stream_utils import (
    iter_stream_lines,
    parse_json_line,
)
from setta.agentic.node_runtime import resolve_node_command
from setta.database.utils import create_new_id
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    MessageThinkingDelta,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.utils.timestamps import get_now_timestamp

logger = logging.getLogger(__name__)
_SIDECAR_PATH = Path(__file__).resolve().parent / "sidecars" / "codex_sdk_runner.mjs"
_MESSAGE_ITEM_TYPES = {"agent_message", "assistant_message", "message"}
_REASONING_ITEM_TYPES = {"reasoning"}
_COMMAND_EXECUTION_ITEM_TYPE = "command_execution"
_COMMAND_EXECUTION_TOOL_NAME = "command_execution"
_MAX_CLI_STDERR_LINES = 200


@dataclass
class _CodexProcessState:
    process: asyncio.subprocess.Process
    queue: asyncio.Queue[str | None]
    stderr_lines: list[str]
    reader_task: asyncio.Task[None]
    stderr_task: asyncio.Task[None] | None
    lock: asyncio.Lock
    config_id: str
    working_dir: Path
    env_signature: tuple[tuple[str, str], ...]
    thread_id: str | None = None


class CodexSdkAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.codex
    supported_run_modes = {ExternalAgentRunMode.sdk}
    _process_states: dict[str, _CodexProcessState] = {}
    _process_lock = asyncio.Lock()

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        prompt = self._build_prompt(context)
        state = await self._ensure_process_state(context)
        await state.lock.acquire()
        handle = ExternalAgentRunHandle(run_id=context.run.id, process=state.process)
        handle.metadata["stderr_lines"] = state.stderr_lines
        handle.metadata["process_state"] = state
        handle.metadata["run_id"] = str(context.run.id)
        if state.thread_id:
            handle.thread_id = state.thread_id
        process = state.process
        try:
            if process.stdin is not None:
                payload = {
                    "prompt": prompt,
                    "runId": str(context.run.id),
                }
                thread_id = _extract_thread_id(context.inputs)
                if thread_id is not None:
                    payload["threadId"] = thread_id
                thread_options = _merge_thread_options(
                    _build_thread_options(context.config),
                    _extract_thread_options(context.inputs),
                )
                if thread_options is not None:
                    payload["threadOptions"] = thread_options
                output_schema = _extract_output_schema(context.inputs)
                if output_schema is not None:
                    payload["outputSchema"] = output_schema
                process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
                await process.stdin.drain()
            return handle
        except Exception:
            state.lock.release()
            raise

    async def stream_events(
        self, handle: ExternalAgentRunHandle, _context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        process = handle.process
        state = handle.metadata.get("process_state")
        run_id = handle.metadata.get("run_id")
        if (
            process is None
            or not isinstance(state, _CodexProcessState)
            or not isinstance(run_id, str)
        ):
            return
        parser = _CodexSdkEventParser()
        try:
            while True:
                line = await state.queue.get()
                if line is None:
                    handle.return_code = await process.wait()
                    break
                if not line:
                    continue
                raw = parse_json_line(line)
                if raw is None:
                    yield ExternalAgentStreamEvent(raw={"type": "stdout", "text": line})
                    continue
                raw_run_id = raw.get("settaRunId")
                if isinstance(raw_run_id, str) and raw_run_id and raw_run_id != run_id:
                    continue
                if raw.get("type") in {"thread.started", "thread.start"}:
                    thread_id = raw.get("thread_id") or raw.get("threadId")
                    if isinstance(thread_id, str) and thread_id:
                        handle.thread_id = thread_id
                        state.thread_id = thread_id
                for event in parser.handle(raw):
                    yield event
                event_type = raw.get("type")
                if event_type in {"turn.completed", "turn.complete"}:
                    break
                if event_type in {"turn.failed", "turn.error"}:
                    handle.return_code = 1
                    break
        finally:
            state.lock.release()

    async def cancel_run(self, handle: ExternalAgentRunHandle) -> None:
        process = handle.process
        if process is None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()

    async def send_approval_response(
        self, handle: ExternalAgentRunHandle, approval_id: str, approved: bool
    ) -> None:
        process = handle.process
        if process is None or process.stdin is None:
            raise RuntimeError("Codex SDK process stdin not available")
        payload = {
            "type": "approval_response",
            "approvalId": approval_id,
            "approved": approved,
        }
        process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await process.stdin.drain()

    async def send_tool_response(
        self, handle: ExternalAgentRunHandle, tool_call_id: str, payload: dict[str, Any]
    ) -> None:
        payload_keys = ", ".join(payload.keys()) if payload else "none"
        raise RuntimeError(
            "Codex SDK tool responses are not supported "
            f"(run_id={handle.run_id}, tool_call_id={tool_call_id}, payload_keys={payload_keys})"
        )

    @classmethod
    async def _ensure_process_state(
        cls, context: ExternalAgentRunContext
    ) -> _CodexProcessState:
        key = str(context.chat_id)
        async with cls._process_lock:
            state = cls._process_states.get(key)
            if state is not None and state.process.returncode is not None:
                await cls._cleanup_state(state)
                state = None
            if state is not None and not cls._state_matches(state, context):
                await cls._terminate_state(state)
                await cls._cleanup_state(state)
                state = None
            if state is None:
                state = await cls._spawn_process(context)
                cls._process_states[key] = state
            return state

    @classmethod
    async def _spawn_process(
        cls, context: ExternalAgentRunContext
    ) -> _CodexProcessState:
        command = cls._build_command(context)
        logger.info("Starting Codex SDK run: %s", " ".join(command))
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(context.working_dir),
            env=context.env,
        )
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        stderr_lines: list[str] = []
        reader_task = asyncio.create_task(cls._read_stdout(process, queue))
        stderr_task = None
        if process.stderr is not None:
            stderr_task = asyncio.create_task(cls._read_stderr(process, stderr_lines))
        return _CodexProcessState(
            process=process,
            queue=queue,
            stderr_lines=stderr_lines,
            reader_task=reader_task,
            stderr_task=stderr_task,
            lock=asyncio.Lock(),
            config_id=str(context.config.id),
            working_dir=context.working_dir,
            env_signature=cls._env_signature(context.env),
        )

    @classmethod
    async def _terminate_state(cls, state: _CodexProcessState) -> None:
        process = state.process
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()

    @classmethod
    async def _cleanup_state(cls, state: _CodexProcessState) -> None:
        state.reader_task.cancel()
        if state.stderr_task is not None:
            state.stderr_task.cancel()
        with contextlib.suppress(Exception):
            await state.reader_task
        if state.stderr_task is not None:
            with contextlib.suppress(Exception):
                await state.stderr_task

    @classmethod
    def _state_matches(
        cls, state: _CodexProcessState, context: ExternalAgentRunContext
    ) -> bool:
        if state.config_id != str(context.config.id):
            return False
        if state.working_dir != context.working_dir:
            return False
        if state.env_signature != cls._env_signature(context.env):
            return False
        return True

    @staticmethod
    def _env_signature(env: dict[str, str]) -> tuple[tuple[str, str], ...]:
        return tuple(sorted(env.items()))

    @staticmethod
    async def _read_stdout(
        process: asyncio.subprocess.Process,
        queue: asyncio.Queue[str | None],
    ) -> None:
        if process.stdout is None:
            await queue.put(None)
            return
        async for line in iter_stream_lines(process.stdout):
            await queue.put(line)
        await queue.put(None)

    @staticmethod
    async def _read_stderr(
        process: asyncio.subprocess.Process, stderr_lines: list[str]
    ) -> None:
        if process.stderr is None:
            return
        async for line in iter_stream_lines(process.stderr):
            if not line:
                continue
            stderr_lines.append(line)
            if len(stderr_lines) > _MAX_CLI_STDERR_LINES:
                del stderr_lines[: len(stderr_lines) - _MAX_CLI_STDERR_LINES]

    @staticmethod
    def _build_command(context: ExternalAgentRunContext) -> list[str]:
        node_path = resolve_node_command(context.config.commandPath)
        return [node_path, str(_SIDECAR_PATH)]

    @staticmethod
    def _build_prompt(context: ExternalAgentRunContext) -> str:
        return build_prompt_from_inputs(context.system_prompt, context.inputs)


class _CodexSdkEventParser:
    def __init__(self) -> None:
        self._messages: dict[str, AssistantChatMessage] = {}
        self._last_message_id: str | None = None
        self._emitted_tool_calls: set[str] = set()

    def handle(self, payload: dict[str, Any]) -> list[ExternalAgentStreamEvent]:
        event_type = payload.get("type")
        if not isinstance(event_type, str):
            return [ExternalAgentStreamEvent(raw=payload)]
        normalized_type = _normalize_event_type(event_type)

        events: list[ExternalAgentStreamEvent] = []
        if normalized_type in {"item.started", "item.start"}:
            if _is_reasoning_item(payload):
                events.extend(self._handle_reasoning_item_start(payload))
            else:
                events.extend(self._handle_item_start(payload))
        elif normalized_type in {"item.delta", "item.update"}:
            if _is_reasoning_item(payload):
                events.extend(self._handle_reasoning_item_update(payload))
            else:
                events.extend(self._handle_item_delta(payload))
        elif normalized_type in {"item.completed", "item.complete"}:
            if _is_reasoning_item(payload):
                events.extend(self._handle_reasoning_item_update(payload))
            else:
                events.extend(self._handle_item_complete(payload))
        elif normalized_type.startswith("item.reasoning."):
            events.extend(
                self._handle_reasoning_delta(payload, normalized_type=normalized_type)
            )

        tool_events = self._handle_tool_events(payload)
        if tool_events:
            events.extend(tool_events)

        if events:
            return events
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_tool_events(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        events: list[ExternalAgentStreamEvent] = []
        message_id = _extract_message_id(payload) or self._last_message_id
        command_item = _extract_command_execution_item(payload)
        if message_id is None and command_item is not None:
            message_id = _extract_command_execution_id(command_item)
        if not message_id:
            return []
        for tool_payload in _extract_tool_call_payloads(payload):
            tool_event = _build_tool_call_delta(message_id, tool_payload)
            if tool_event is None:
                continue
            if (
                tool_event.tool_call_id in self._emitted_tool_calls
                and not tool_event.arguments_delta
            ):
                continue
            if tool_event.tool_call_id not in self._emitted_tool_calls:
                self._emitted_tool_calls.add(tool_event.tool_call_id)
            events.append(
                ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event)
            )

        tool_result = _build_tool_result(payload)
        if tool_result is not None:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=ToolResultEvent(result=tool_result),
                )
            )
        if command_item is not None:
            command_events = self._handle_command_execution_item(
                payload, message_id, command_item
            )
            if command_events:
                events.extend(command_events)
        return events

    def _handle_command_execution_item(
        self,
        payload: dict[str, Any],
        message_id: str,
        command_item: dict[str, Any],
    ) -> list[ExternalAgentStreamEvent]:
        command_id = _extract_command_execution_id(command_item)
        if not command_id:
            return []
        events: list[ExternalAgentStreamEvent] = []
        if command_id not in self._emitted_tool_calls:
            tool_event = _build_command_execution_tool_call(
                message_id, command_id, command_item
            )
            if tool_event is not None:
                self._emitted_tool_calls.add(command_id)
                events.append(
                    ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event)
                )
        if _command_execution_is_terminal(command_item):
            tool_result = _build_command_execution_result(command_id, command_item)
            if tool_result is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=ToolResultEvent(result=tool_result),
                    )
                )
        return events

    def _handle_item_start(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        if not _is_message_item(payload):
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_message(payload)
        if not is_new:
            return [ExternalAgentStreamEvent(raw=payload)]
        return [
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageStartEvent(message=message),
            )
        ]

    def _handle_reasoning_item_start(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        item = _extract_item_payload(payload)
        if item is None:
            return [ExternalAgentStreamEvent(raw=payload)]
        message_id = _extract_item_id(payload)
        if not message_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_reasoning_message(message_id)
        summary = _extract_reasoning_summary(item)
        thinking = _extract_reasoning_content(item)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        if summary or thinking:
            _append_message_thinking(
                message,
                thinking,
                summary,
                append_summary=False,
            )
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageDeltaEvent(
                        message_id=message.id,
                        content=[
                            MessageThinkingDelta(
                                index=0,
                                thinking=thinking,
                                summary=summary,
                                signature=None,
                            )
                        ],
                    ),
                )
            )
        return events or [ExternalAgentStreamEvent(raw=payload)]

    def _handle_item_delta(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        if not _is_message_item(payload):
            return [ExternalAgentStreamEvent(raw=payload)]
        delta_text = _extract_delta_text(payload)
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_message(payload)
        _append_message_text(message, delta_text)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageDeltaEvent(
                    message_id=message.id,
                    content=[MessageTextDelta(index=0, text=delta_text)],
                ),
            )
        )
        return events

    def _handle_reasoning_item_update(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        item = _extract_item_payload(payload)
        if item is None:
            return [ExternalAgentStreamEvent(raw=payload)]
        message_id = _extract_item_id(payload)
        if not message_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_reasoning_message(message_id)
        summary = _extract_reasoning_summary(item)
        thinking = _extract_reasoning_content(item)
        if not summary and not thinking:
            return [ExternalAgentStreamEvent(raw=payload)]
        _append_message_thinking(
            message,
            thinking,
            summary,
            append_summary=False,
        )
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageDeltaEvent(
                    message_id=message.id,
                    content=[
                        MessageThinkingDelta(
                            index=0,
                            thinking=thinking,
                            summary=summary,
                            signature=None,
                        )
                    ],
                ),
            )
        )
        return events

    def _handle_item_complete(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        if not _is_message_item(payload):
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_message(payload)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        delta_text = _extract_delta_text(payload)
        if delta_text:
            _append_message_text(message, delta_text)
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageDeltaEvent(
                        message_id=message.id,
                        content=[MessageTextDelta(index=0, text=delta_text)],
                    ),
                )
            )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageStopEvent(message_id=message.id),
            )
        )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageFinalizedEvent(message=message),
            )
        )
        return events

    def _handle_reasoning_delta(
        self,
        payload: dict[str, Any],
        *,
        normalized_type: str,
    ) -> list[ExternalAgentStreamEvent]:
        message_id = _extract_item_id(payload)
        if not message_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        summary = None
        thinking = None
        if normalized_type.endswith("summaryTextDelta"):
            summary = _extract_reasoning_delta_text(payload)
        elif normalized_type.endswith("textDelta"):
            thinking = _extract_reasoning_delta_text(payload)
        elif normalized_type.endswith("summaryPartAdded"):
            summary = "\n"
        if not summary and not thinking:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_reasoning_message(message_id)
        _append_message_thinking(
            message,
            thinking or "",
            summary,
            append_summary=True,
        )
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageDeltaEvent(
                    message_id=message.id,
                    content=[
                        MessageThinkingDelta(
                            index=0,
                            thinking=thinking or "",
                            summary=summary,
                            signature=None,
                        )
                    ],
                ),
            )
        )
        return events

    def _get_or_create_message(
        self, payload: dict[str, Any]
    ) -> tuple[AssistantChatMessage, bool]:
        message_id = _extract_message_id(payload)
        if message_id and message_id in self._messages:
            self._last_message_id = message_id
            return self._messages[message_id], False

        if not message_id and self._last_message_id:
            return self._messages[self._last_message_id], False

        message = AssistantChatMessage(
            id=message_id or create_new_id(),
            content=[],
        )
        self._messages[message.id] = message
        self._last_message_id = message.id
        return message, True

    def _get_or_create_reasoning_message(
        self, message_id: str
    ) -> tuple[AssistantChatMessage, bool]:
        if message_id in self._messages:
            self._last_message_id = message_id
            return self._messages[message_id], False
        message = AssistantChatMessage(id=message_id, content=[])
        self._messages[message.id] = message
        self._last_message_id = message.id
        return message, True


def _normalize_event_type(value: str) -> str:
    return value.replace("/", ".")


def _extract_message_id(payload: dict[str, Any]) -> str | None:
    item = _extract_item_payload(payload)
    if item is not None:
        raw = item.get("id")
        if isinstance(raw, str) and raw:
            return raw
    raw = payload.get("id")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_delta_text(payload: dict[str, Any]) -> str:
    for key in ("delta", "text"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    item = _extract_item_payload(payload)
    if item is not None:
        for key in ("delta", "text"):
            raw = item.get(key)
            if isinstance(raw, str) and raw:
                return raw
        content = item.get("content")
        if isinstance(content, list):
            for entry in content:
                if isinstance(entry, dict):
                    text = entry.get("text") or entry.get("delta")
                    if isinstance(text, str) and text:
                        return text
        elif isinstance(content, str) and content:
            return content
    return ""


def _append_message_text(message: AssistantChatMessage, delta: str) -> None:
    if not delta:
        return
    if message.content and isinstance(message.content[0], MessageTextContent):
        message.content[0].text += delta
        return
    message.content.insert(0, MessageTextContent(text=delta))


def _extract_thread_id(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("threadId")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_output_schema(inputs: dict[str, Any] | None) -> dict[str, Any] | None:
    if not inputs:
        return None
    raw = inputs.get("outputSchema")
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("Codex outputSchema must be a JSON object")
    return raw


def _build_thread_options(config: ExternalAgentConfig) -> dict[str, Any] | None:
    options: dict[str, Any] = {}
    if config.codexSkipGitRepoCheck is not None:
        options["skipGitRepoCheck"] = config.codexSkipGitRepoCheck
    if config.defaultModel:
        options["model"] = config.defaultModel
    if config.sandboxPolicy:
        options["sandboxMode"] = config.sandboxPolicy
    if not options:
        return None
    return options


def _extract_thread_options(inputs: dict[str, Any] | None) -> dict[str, Any] | None:
    if not inputs:
        return None
    raw = inputs.get("threadOptions")
    if not isinstance(raw, dict):
        return None
    allowed_keys = {
        "model",
        "sandboxMode",
        "workingDirectory",
        "skipGitRepoCheck",
        "modelReasoningEffort",
        "networkAccessEnabled",
        "webSearchMode",
        "webSearchEnabled",
        "approvalPolicy",
        "additionalDirectories",
    }
    filtered = {key: value for key, value in raw.items() if key in allowed_keys}
    if not filtered:
        return None
    return filtered


def _merge_thread_options(
    base: dict[str, Any] | None, overrides: dict[str, Any] | None
) -> dict[str, Any] | None:
    if base is None:
        return overrides
    if overrides is None:
        return base
    merged = dict(base)
    merged.update(overrides)
    return merged


def _is_message_item(payload: dict[str, Any]) -> bool:
    item = _extract_item_payload(payload)
    if item is not None:
        raw_type = item.get("type")
        if isinstance(raw_type, str) and raw_type:
            return raw_type in _MESSAGE_ITEM_TYPES
    return True


def _maybe_set_thread_id(
    handle: ExternalAgentRunHandle,
    payload: dict[str, Any],
) -> None:
    if handle.thread_id:
        return
    raw_type = payload.get("type")
    if raw_type not in {"thread.started", "thread.start"}:
        return
    thread_id = payload.get("thread_id") or payload.get("threadId")
    if isinstance(thread_id, str) and thread_id:
        handle.thread_id = thread_id


def _extract_tool_call_payloads(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    _extend_payload_entries(candidates, payload, ("tool_calls", "toolCalls"))
    _extend_payload_entries(candidates, payload, ("tool_call", "toolCall"))
    _extend_nested_payload_entries(
        candidates,
        payload,
        ("message", "item", "data", "response"),
        ("tool_calls", "toolCalls", "tool_call", "toolCall"),
    )
    return candidates


def _extend_payload_entries(
    output: list[dict[str, Any]],
    payload: dict[str, Any],
    keys: tuple[str, ...],
) -> None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            output.append(value)
        elif isinstance(value, list):
            output.extend([entry for entry in value if isinstance(entry, dict)])


def _extend_nested_payload_entries(
    output: list[dict[str, Any]],
    payload: dict[str, Any],
    nested_keys: tuple[str, ...],
    keys: tuple[str, ...],
) -> None:
    for nested_key in nested_keys:
        nested = payload.get(nested_key)
        if isinstance(nested, dict):
            _extend_payload_entries(output, nested, keys)


def _build_tool_call_delta(
    message_id: str, payload: dict[str, Any]
) -> ToolCallDeltaEvent | None:
    tool_call_id = _extract_tool_call_id(payload)
    if not tool_call_id:
        return None
    tool_name = _extract_tool_name(payload)
    arguments = _extract_tool_arguments(payload)
    if arguments is None:
        return None
    return ToolCallDeltaEvent(
        message_id=message_id,
        tool_call_id=tool_call_id,
        arguments_delta=arguments,
        tool_name=tool_name,
    )


def _build_tool_result(payload: dict[str, Any]) -> ToolChatMessage | None:
    tool_call_id = _extract_tool_call_id(payload, allow_plain_id=False)
    if not tool_call_id:
        return None
    raw_result = _extract_tool_result(payload)
    if raw_result is None:
        return None
    tool_name = _extract_tool_name(payload)
    arguments = _extract_tool_arguments_dict(payload)
    content_text = _stringify_tool_result(raw_result)
    content = [TextContent(type="text", text=content_text)] if content_text else []
    return ToolChatMessage(
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        arguments=arguments,
        result=raw_result,
        content=content,
        is_error=_extract_tool_error(payload),
        completed_at=get_now_timestamp(),
    )


def _extract_tool_call_id(
    payload: dict[str, Any], *, allow_plain_id: bool = True
) -> str | None:
    for key in (
        "tool_call_id",
        "toolCallId",
        "call_id",
        "tool_use_id",
        "toolUseId",
    ):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    if allow_plain_id:
        raw = payload.get("id")
        if isinstance(raw, str) and raw:
            return raw
    function = payload.get("function")
    if isinstance(function, dict):
        raw = function.get("call_id") or function.get("id")
        if isinstance(raw, str) and raw:
            return raw
    return None


def _extract_tool_name(payload: dict[str, Any]) -> str | None:
    for key in ("tool_name", "toolName", "name"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    function = payload.get("function")
    if isinstance(function, dict):
        raw = function.get("name")
        if isinstance(raw, str) and raw:
            return raw
    return None


def _extract_tool_arguments(payload: dict[str, Any]) -> str | None:
    args = _extract_tool_arguments_value(payload)
    if args is None:
        return None
    if isinstance(args, str):
        return args
    try:
        return json.dumps(args)
    except TypeError:
        return None


def _extract_tool_arguments_value(payload: dict[str, Any]) -> Any | None:
    for key in (
        "arguments",
        "args",
        "input",
        "arguments_delta",
        "partial_json",
        "delta",
    ):
        raw = payload.get(key)
        if raw is not None:
            return raw
    function = payload.get("function")
    if isinstance(function, dict):
        raw = function.get("arguments")
        if raw is not None:
            return raw
    return None


def _extract_item_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    item = payload.get("item")
    if isinstance(item, dict):
        return item
    params = payload.get("params")
    if isinstance(params, dict):
        nested = params.get("item")
        if isinstance(nested, dict):
            return nested
    return None


def _extract_item_id(payload: dict[str, Any]) -> str | None:
    for key in ("itemId", "item_id", "id"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    item = _extract_item_payload(payload)
    if item is not None:
        raw = item.get("id")
        if isinstance(raw, str) and raw:
            return raw
    return None


def _is_reasoning_item(payload: dict[str, Any]) -> bool:
    item = _extract_item_payload(payload)
    if item is None:
        return False
    item_type = item.get("type")
    return isinstance(item_type, str) and item_type in _REASONING_ITEM_TYPES


def _extract_command_execution_item(
    payload: dict[str, Any]
) -> dict[str, Any] | None:
    item = _extract_item_payload(payload)
    if item is None:
        return None
    item_type = item.get("type")
    if isinstance(item_type, str) and item_type == _COMMAND_EXECUTION_ITEM_TYPE:
        return item
    return None


def _extract_command_execution_id(item: dict[str, Any]) -> str | None:
    raw = item.get("id")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _command_execution_is_terminal(item: dict[str, Any]) -> bool:
    status = item.get("status")
    if isinstance(status, str) and status in {"completed", "failed"}:
        return True
    return item.get("exit_code") is not None


def _build_command_execution_tool_call(
    message_id: str,
    command_id: str,
    item: dict[str, Any],
) -> ToolCallDeltaEvent | None:
    command = item.get("command")
    if not isinstance(command, str) or not command:
        return None
    arguments = {"command": command}
    return ToolCallDeltaEvent(
        message_id=message_id,
        tool_call_id=command_id,
        arguments_delta=json.dumps(arguments),
        tool_name=_COMMAND_EXECUTION_TOOL_NAME,
    )


def _build_command_execution_result(
    command_id: str,
    item: dict[str, Any],
) -> ToolChatMessage | None:
    command = item.get("command")
    aggregated_output = item.get("aggregated_output")
    exit_code = item.get("exit_code")
    status = item.get("status")
    result: dict[str, Any] = {
        "command": command,
        "aggregated_output": aggregated_output,
        "exit_code": exit_code,
        "status": status,
    }
    content_text = _stringify_tool_result(aggregated_output)
    content = [TextContent(type="text", text=content_text)] if content_text else []
    is_error = False
    if isinstance(status, str) and status == "failed":
        is_error = True
    if isinstance(exit_code, int) and exit_code != 0:
        is_error = True
    return ToolChatMessage(
        tool_call_id=command_id,
        tool_name=_COMMAND_EXECUTION_TOOL_NAME,
        arguments={"command": command} if isinstance(command, str) else {},
        result=result,
        content=content,
        is_error=is_error,
        completed_at=get_now_timestamp(),
    )


def _stringify_reasoning_parts(parts: Any) -> str:
    if isinstance(parts, str):
        return parts
    if isinstance(parts, dict):
        for key in ("text", "delta", "summaryText", "summary_text"):
            value = parts.get(key)
            if isinstance(value, str) and value:
                return value
        return ""
    if isinstance(parts, list):
        chunks: list[str] = []
        for entry in parts:
            text = _stringify_reasoning_parts(entry)
            if text:
                chunks.append(text)
        return "".join(chunks)
    return ""


def _extract_reasoning_summary(item: dict[str, Any]) -> str:
    summary = item.get("summary")
    if summary is None:
        summary = item.get("text")
    return _stringify_reasoning_parts(summary)


def _extract_reasoning_content(item: dict[str, Any]) -> str:
    content = item.get("content")
    return _stringify_reasoning_parts(content)


def _extract_reasoning_delta_text(payload: dict[str, Any]) -> str:
    for key in ("delta", "text", "summaryText", "summary_text"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    params = payload.get("params")
    if isinstance(params, dict):
        return _stringify_reasoning_parts(params.get("delta") or params.get("text"))
    item = _extract_item_payload(payload)
    if item is not None:
        return _stringify_reasoning_parts(item.get("delta") or item.get("text"))
    return ""


def _ensure_thinking_block(message: AssistantChatMessage) -> MessageThinkingContent:
    if message.content and isinstance(message.content[0], MessageThinkingContent):
        return message.content[0]
    block = MessageThinkingContent()
    message.content.insert(0, block)
    return block


def _append_message_thinking(
    message: AssistantChatMessage,
    thinking: str,
    summary: str | None,
    *,
    append_summary: bool = True,
) -> None:
    block = _ensure_thinking_block(message)
    if thinking:
        block.thinking += thinking
    if summary is not None:
        if append_summary and block.summary:
            block.summary += summary
        else:
            block.summary = summary


def _extract_tool_arguments_dict(payload: dict[str, Any]) -> dict[str, Any]:
    raw = _extract_tool_arguments_value(payload)
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _extract_tool_result(payload: dict[str, Any]) -> Any | None:
    for key in ("result", "output", "tool_result", "toolResult", "content"):
        raw = payload.get(key)
        if raw is not None:
            return raw
    return None


def _extract_tool_error(payload: dict[str, Any]) -> bool:
    for key in ("is_error", "isError", "error"):
        raw = payload.get(key)
        if isinstance(raw, bool):
            return raw
    return False


def _stringify_tool_result(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value)
    except TypeError:
        return str(value)
