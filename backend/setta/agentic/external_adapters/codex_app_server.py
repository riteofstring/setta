import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator

from mcp.types import TextContent

from setta import __version__
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
from setta.database.utils import create_new_id
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
    ToolCall,
    ToolCallFunction,
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
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType
from setta.utils.timestamps import get_now_timestamp

logger = logging.getLogger(__name__)
_MESSAGE_ITEM_TYPES = {
    "agentMessage",
    "assistantMessage",
    "message",
    "assistant_message",
    "agent_message",
}
_REASONING_ITEM_TYPES = {"reasoning"}
_COMMAND_EXECUTION_ITEM_TYPE = "commandExecution"
_FILE_CHANGE_ITEM_TYPE = "fileChange"
_MCP_TOOL_CALL_ITEM_TYPE = "mcpToolCall"
_GENERIC_TOOL_ITEM_TYPES = {
    "collabToolCall",
    "webSearch",
    "imageView",
    "enteredReviewMode",
    "exitedReviewMode",
    "compacted",
}
_COMMAND_EXECUTION_TOOL_NAME = "command_execution"
_FILE_CHANGE_TOOL_NAME = "file_change"
_MAX_CLI_STDERR_LINES = 200
_REQUEST_TIMEOUT_SECONDS = 15.0


@dataclass
class _CodexAppServerState:
    process: asyncio.subprocess.Process
    queue: asyncio.Queue[dict[str, Any] | None]
    stderr_lines: list[str]
    reader_task: asyncio.Task[None]
    stderr_task: asyncio.Task[None] | None
    lock: asyncio.Lock
    config_id: str
    working_dir: Path
    env_signature: tuple[tuple[str, str], ...]
    system_prompt: str | None
    initialized: bool = False
    next_request_id: int = 1
    pending_requests: dict[int, asyncio.Future[dict[str, Any]]] = field(
        default_factory=dict
    )
    thread_id: str | None = None
    approval_id_map: dict[str, int | str] = field(default_factory=dict)
    buffered_notifications: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class _PendingToolCall:
    tool_call_id: str
    tool_name: str | None
    arguments_delta: str
    raw_payload: dict[str, Any]


@dataclass
class _MessageToolCallState:
    tool_calls: dict[str, ToolCall] = field(default_factory=dict)
    argument_buffers: dict[str, str] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)


class CodexAppServerAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.codex
    supported_run_modes = {ExternalAgentRunMode.app_server}
    _process_states: dict[str, _CodexAppServerState] = {}
    _process_state_by_process: dict[int, _CodexAppServerState] = {}
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
        try:
            await self._initialize(state)
            desired_thread_id = _extract_thread_id(context.inputs) or state.thread_id
            if desired_thread_id:
                resume_result = await self._send_request(
                    state,
                    "thread/resume",
                    {"threadId": desired_thread_id},
                )
                thread_id = _extract_thread_id_from_result(resume_result)
            else:
                start_result = await self._send_request(state, "thread/start", {})
                thread_id = _extract_thread_id_from_result(start_result)
            if not thread_id:
                thread_id = await self._await_thread_id(state, handle)
            if thread_id:
                state.thread_id = thread_id
                handle.thread_id = thread_id
            else:
                raise RuntimeError("Codex app-server did not return a threadId")

            turn_params = _build_turn_params(context, prompt, thread_id)
            await self._send_request(state, "turn/start", turn_params)
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
            or not isinstance(state, _CodexAppServerState)
            or not isinstance(run_id, str)
        ):
            return
        parser = _CodexAppServerEventParser()
        try:
            while True:
                if state.buffered_notifications:
                    payload = state.buffered_notifications.pop(0)
                else:
                    payload = await state.queue.get()
                if payload is None:
                    handle.return_code = await process.wait()
                    break
                if not payload:
                    continue
                if payload.get("type") == "stdout":
                    yield ExternalAgentStreamEvent(raw=payload)
                    continue
                if _is_response(payload):
                    yield ExternalAgentStreamEvent(raw=payload)
                    continue
                if _is_approval_request(payload):
                    approval_payload = _build_approval_payload(state, payload)
                    yield ExternalAgentStreamEvent(raw=approval_payload)
                    continue
                if _maybe_set_thread_id(handle, state, payload):
                    continue
                method = payload.get("method")
                if method == "error":
                    params = payload.get("params")
                    if isinstance(params, dict):
                        error_info = params.get("error")
                        if error_info is not None:
                            handle.metadata.setdefault("app_server_errors", []).append(
                                error_info
                            )
                        will_retry = params.get("willRetry")
                        if isinstance(will_retry, bool) and not will_retry:
                            handle.return_code = 1
                            break
                for event in parser.handle(payload):
                    yield event
                if method in {"turn/started", "turn/completed", "turn/failed"}:
                    params = payload.get("params")
                    if isinstance(params, dict):
                        turn = params.get("turn")
                        if isinstance(turn, dict):
                            items = turn.get("items")
                            if isinstance(items, list):
                                for item in items:
                                    if not isinstance(item, dict):
                                        continue
                                    if not parser.should_process_turn_item(item):
                                        continue
                                    synthetic = {
                                        "method": "item/completed",
                                        "params": {"item": item},
                                    }
                                    for event in parser.handle(synthetic):
                                        yield event
                if method in {"turn/completed", "turn/failed"}:
                    params = payload.get("params")
                    if method == "turn/failed":
                        handle.return_code = 1
                        break
                    if isinstance(params, dict):
                        status = params.get("status")
                        turn = params.get("turn")
                        if isinstance(turn, dict):
                            turn_status = turn.get("status")
                            if isinstance(turn_status, str):
                                status = turn_status
                            error = turn.get("error")
                            if error is not None:
                                handle.metadata.setdefault(
                                    "app_server_errors", []
                                ).append(error)
                        if isinstance(status, str) and status == "failed":
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
        state = handle.metadata.get("process_state")
        if not isinstance(state, _CodexAppServerState):
            raise RuntimeError("Codex app-server state not available")
        process = state.process
        if process.stdin is None:
            raise RuntimeError("Codex app-server stdin not available")
        raw_id = state.approval_id_map.get(approval_id, approval_id)
        decision = "accept" if approved else "decline"
        payload = {"id": raw_id, "result": {"decision": decision}}
        process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await process.stdin.drain()
        state.approval_id_map.pop(approval_id, None)

    async def send_tool_response(
        self, handle: ExternalAgentRunHandle, tool_call_id: str, payload: dict[str, Any]
    ) -> None:
        payload_keys = ", ".join(payload.keys()) if payload else "none"
        raise RuntimeError(
            "Codex app-server tool responses are not supported "
            f"(run_id={handle.run_id}, tool_call_id={tool_call_id}, payload_keys={payload_keys})"
        )

    @classmethod
    async def _ensure_process_state(
        cls, context: ExternalAgentRunContext
    ) -> _CodexAppServerState:
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
    ) -> _CodexAppServerState:
        command = cls._build_command(context)
        await cls._ensure_api_key_login(context)
        logger.info("Starting Codex app-server: %s", " ".join(command))
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(context.working_dir),
            env=context.env,
        )
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        stderr_lines: list[str] = []
        reader_task = asyncio.create_task(cls._read_stdout(process, queue))
        stderr_task = None
        if process.stderr is not None:
            stderr_task = asyncio.create_task(cls._read_stderr(process, stderr_lines))
        state = _CodexAppServerState(
            process=process,
            queue=queue,
            stderr_lines=stderr_lines,
            reader_task=reader_task,
            stderr_task=stderr_task,
            lock=asyncio.Lock(),
            config_id=str(context.config.id),
            working_dir=context.working_dir,
            env_signature=cls._env_signature(context.env),
            system_prompt=cls._resolve_developer_instructions(context),
        )
        cls._process_state_by_process[id(process)] = state
        return state

    @classmethod
    async def _ensure_api_key_login(cls, context: ExternalAgentRunContext) -> None:
        api_key = context.env.get("OPENAI_API_KEY")
        if not api_key:
            return
        codex_home = context.env.get("CODEX_HOME")
        if not codex_home:
            return
        auth_path = Path(codex_home) / "auth.json"
        if auth_path.exists():
            return
        command_path = context.config.commandPath or "codex"
        process = await asyncio.create_subprocess_exec(
            command_path,
            "login",
            "--with-api-key",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(context.working_dir),
            env=context.env,
        )
        stdout_bytes, stderr_bytes = await process.communicate(
            input=(api_key + "\n").encode("utf-8")
        )
        if process.returncode != 0:
            stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
            stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
            detail = stderr or stdout or "unknown error"
            raise RuntimeError(f"Codex login failed: {detail}")

    @classmethod
    async def _terminate_state(cls, state: _CodexAppServerState) -> None:
        process = state.process
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()

    @classmethod
    async def _cleanup_state(cls, state: _CodexAppServerState) -> None:
        state.reader_task.cancel()
        if state.stderr_task is not None:
            state.stderr_task.cancel()
        with contextlib.suppress(Exception):
            await state.reader_task
        if state.stderr_task is not None:
            with contextlib.suppress(Exception):
                await state.stderr_task
        cls._process_state_by_process.pop(id(state.process), None)

    @classmethod
    def _state_matches(
        cls, state: _CodexAppServerState, context: ExternalAgentRunContext
    ) -> bool:
        if state.config_id != str(context.config.id):
            return False
        if state.working_dir != context.working_dir:
            return False
        if state.env_signature != cls._env_signature(context.env):
            return False
        if state.system_prompt != cls._resolve_developer_instructions(context):
            return False
        return True

    @staticmethod
    def _resolve_developer_instructions(
        context: ExternalAgentRunContext,
    ) -> str | None:
        base_prompt = context.system_prompt.strip()
        extra_prompt = ""
        inputs = context.inputs or {}
        raw = inputs.get("systemPrompt")
        if isinstance(raw, str) and raw.strip():
            extra_prompt = raw.strip()
        if base_prompt and extra_prompt:
            return f"{base_prompt}\n\n{extra_prompt}"
        if base_prompt:
            return base_prompt
        if extra_prompt:
            return extra_prompt
        return None

    @staticmethod
    def _env_signature(env: dict[str, str]) -> tuple[tuple[str, str], ...]:
        return tuple(sorted(env.items()))

    @classmethod
    async def _read_stdout(
        cls,
        process: asyncio.subprocess.Process,
        queue: asyncio.Queue[dict[str, Any] | None],
    ) -> None:
        if process.stdout is None:
            await queue.put(None)
            return
        async for line in iter_stream_lines(process.stdout):
            if not line:
                continue
            payload = parse_json_line(line)
            if payload is None:
                await queue.put({"type": "stdout", "text": line})
                continue
            if _is_response(payload):
                response_id = payload.get("id")
                state = cls._find_state_for_process(process)
                if state is not None and isinstance(response_id, int):
                    future = state.pending_requests.pop(response_id, None)
                    if future is not None and not future.done():
                        future.set_result(payload)
                        continue
                await queue.put(payload)
                continue
            await queue.put(payload)
        state = cls._find_state_for_process(process)
        if state is not None and state.pending_requests:
            for future in list(state.pending_requests.values()):
                if not future.done():
                    future.set_result({"error": "Codex app-server closed"})
            state.pending_requests.clear()
        await queue.put(None)

    @classmethod
    def _find_state_for_process(
        cls, process: asyncio.subprocess.Process
    ) -> _CodexAppServerState | None:
        return cls._process_state_by_process.get(id(process))

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
        command_path = context.config.commandPath or "codex"
        return [command_path, "app-server"]

    @staticmethod
    def _build_prompt(context: ExternalAgentRunContext) -> str:
        inputs = context.inputs or {}
        raw_messages = inputs.get("messages")
        if not isinstance(raw_messages, list):
            return build_prompt_from_inputs("", inputs)
        filtered_messages: list[Any] = []
        for raw in raw_messages:
            role = raw.get("role") if isinstance(raw, dict) else None
            if isinstance(role, str) and role.lower() in {"system", "developer"}:
                continue
            filtered_messages.append(raw)
        filtered_inputs = dict(inputs)
        filtered_inputs["messages"] = filtered_messages
        return build_prompt_from_inputs("", filtered_inputs)

    async def _initialize(self, state: _CodexAppServerState) -> None:
        if state.initialized:
            return
        params = {"clientInfo": {"name": "setta", "version": __version__}}
        await self._send_request(state, "initialize", params)
        await self._send_notification(state, "initialized", None)
        await self._send_request(state, "config/mcpServer/reload", {})
        state.initialized = True

    async def _await_thread_id(
        self, state: _CodexAppServerState, handle: ExternalAgentRunHandle
    ) -> str | None:
        async def _wait_for_thread_id() -> str | None:
            while True:
                payload = await state.queue.get()
                if payload is None:
                    return None
                if _is_response(payload):
                    state.buffered_notifications.append(payload)
                    continue
                if _maybe_set_thread_id(handle, state, payload):
                    return state.thread_id
                state.buffered_notifications.append(payload)

        try:
            return await asyncio.wait_for(_wait_for_thread_id(), timeout=5)
        except asyncio.TimeoutError:
            return None

    async def _send_request(
        self, state: _CodexAppServerState, method: str, params: dict[str, Any] | None
    ) -> dict[str, Any]:
        process = state.process
        if process.stdin is None:
            raise RuntimeError("Codex app-server stdin not available")
        request_id = state.next_request_id
        state.next_request_id += 1
        future = asyncio.get_running_loop().create_future()
        state.pending_requests[request_id] = future
        payload: dict[str, Any] = {"id": request_id, "method": method}
        if params is not None:
            payload["params"] = params
        process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await process.stdin.drain()
        try:
            response = await asyncio.wait_for(future, timeout=_REQUEST_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as exc:
            state.pending_requests.pop(request_id, None)
            if not future.done():
                future.cancel()
            raise RuntimeError(
                "Codex app-server request timed out "
                f"(method={method}, timeout={_REQUEST_TIMEOUT_SECONDS}s)"
            ) from exc
        if "error" in response:
            raise RuntimeError(
                f"Codex app-server request failed ({method}): {response.get('error')}"
            )
        result = response.get("result")
        if isinstance(result, dict):
            return result
        return response

    async def _send_notification(
        self,
        state: _CodexAppServerState,
        method: str,
        params: dict[str, Any] | None,
    ) -> None:
        process = state.process
        if process.stdin is None:
            raise RuntimeError("Codex app-server stdin not available")
        payload: dict[str, Any] = {"method": method}
        if params is not None:
            payload["params"] = params
        process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await process.stdin.drain()


class _CodexAppServerEventParser:
    def __init__(self) -> None:
        self._messages: dict[str, AssistantChatMessage] = {}
        self._last_message_id: str | None = None
        self._last_assistant_message_id: str | None = None
        self._assistant_message_open = False
        self._emitted_tool_calls: set[str] = set()
        self._command_output: dict[str, list[str]] = {}
        self._file_change_output: dict[str, list[str]] = {}
        self._function_call_args: dict[str, Any] = {}
        self._function_call_names: dict[str, str] = {}
        self._completed_items: set[str] = set()
        self._message_with_deltas: set[str] = set()
        self._pending_tool_calls: dict[str, _PendingToolCall] = {}
        self._pending_tool_call_order: list[str] = []
        self._message_tool_calls: dict[str, _MessageToolCallState] = {}

    def handle(self, payload: dict[str, Any]) -> list[ExternalAgentStreamEvent]:
        response_item_type = payload.get("type")
        if response_item_type == "response_item":
            events = self._handle_response_item(payload)
            if events:
                return events
        method = payload.get("method")
        if not isinstance(method, str):
            return [ExternalAgentStreamEvent(raw=payload)]
        if method == "turn/started":
            self._reset_turn_state()
        normalized_type = _normalize_event_type(method)
        events: list[ExternalAgentStreamEvent] = []

        if _is_message_delta_method(method):
            events.extend(self._handle_message_delta(payload))
        elif _is_item_lifecycle_method(method):
            item = _extract_item_payload(payload)
            if item is None:
                return [ExternalAgentStreamEvent(raw=payload)]
            item_type = _extract_item_type(item)
            if _is_reasoning_item_type(item_type):
                if method.endswith("/started"):
                    events.extend(self._handle_reasoning_item_start(payload, item))
                else:
                    events.extend(self._handle_reasoning_item_update(payload, item))
            elif _is_message_item_type(item_type, item):
                if method.endswith("/started"):
                    events.extend(self._handle_message_start(payload, item))
                else:
                    events.extend(self._handle_message_complete(payload, item))
            else:
                events.extend(self._handle_tool_item(payload, item, method=method))
        elif normalized_type.startswith("item.reasoning."):
            events.extend(
                self._handle_reasoning_delta(payload, normalized_type=normalized_type)
            )
        elif normalized_type == "item.commandExecution.outputDelta":
            events.extend(self._handle_command_output_delta(payload))
        elif normalized_type == "item.fileChange.outputDelta":
            events.extend(self._handle_file_change_output_delta(payload))
        elif normalized_type == "rawResponseItem.completed":
            events.extend(self._handle_raw_response_item(payload))

        if events:
            return events
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_response_item(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        item = payload.get("payload")
        if not isinstance(item, dict):
            return []
        item_type = _extract_item_type(item)
        if item_type == "function_call":
            return self._handle_function_call_item(payload, item)
        if item_type == "function_call_output":
            return self._handle_function_call_output_item(payload, item)
        if _is_message_item_type(item_type, item):
            return self._handle_raw_response_item({"item": item})
        return []

    def _handle_function_call_item(
        self,
        payload: dict[str, Any],
        item: dict[str, Any],
    ) -> list[ExternalAgentStreamEvent]:
        call_id = _extract_function_call_id(item)
        if not call_id:
            return []
        tool_name = _extract_function_call_name(item)
        arguments = _extract_function_call_arguments(item)
        if tool_name:
            self._function_call_names[call_id] = tool_name
        if arguments is not None:
            self._function_call_args[call_id] = arguments
        arguments_delta = _stringify_function_call_arguments(arguments)
        message_id = self._resolve_tool_message_id()
        if call_id in self._emitted_tool_calls and not arguments_delta:
            return []
        if call_id not in self._emitted_tool_calls:
            self._emitted_tool_calls.add(call_id)
        events: list[ExternalAgentStreamEvent] = []
        if not message_id:
            message_id, message_events = self._ensure_assistant_message_for_tool(
                payload
            )
            events.extend(message_events)
        self._store_message_tool_call(
            message_id,
            call_id,
            tool_name,
            arguments_delta,
        )
        tool_event = ToolCallDeltaEvent(
            message_id=message_id,
            tool_call_id=call_id,
            arguments_delta=arguments_delta,
            tool_name=tool_name,
        )
        events.append(ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event))
        return events

    def _handle_function_call_output_item(
        self,
        payload: dict[str, Any],
        item: dict[str, Any],
    ) -> list[ExternalAgentStreamEvent]:
        call_id = _extract_function_call_id(item)
        if not call_id:
            return []
        if call_id in self._completed_items:
            return []
        raw_output = _extract_function_call_output(item)
        if raw_output is None:
            return []
        tool_name = self._function_call_names.get(
            call_id
        ) or _extract_function_call_name(item)
        arguments = self._function_call_args.get(call_id)
        arguments_dict = _normalize_function_call_arguments(arguments)
        output = _maybe_parse_json(raw_output)
        content_text = _stringify_tool_result(output)
        content = [TextContent(type="text", text=content_text)] if content_text else []
        is_error = _extract_function_call_error(item)
        tool_result = ToolChatMessage(
            tool_call_id=call_id,
            tool_name=tool_name,
            arguments=arguments_dict,
            result=output,
            content=content,
            is_error=is_error,
            completed_at=get_now_timestamp(),
        )
        self._function_call_args.pop(call_id, None)
        self._function_call_names.pop(call_id, None)
        self._completed_items.add(call_id)
        return [
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=ToolResultEvent(result=tool_result),
            )
        ]

    def _handle_message_start(
        self, payload: dict[str, Any], _item: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_id = _extract_message_id(payload)
        if _is_response_message_id(message_id):
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_message(payload)
        self._assistant_message_open = True
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.extend(self._flush_pending_tool_calls(message.id))
        return events or [ExternalAgentStreamEvent(raw=payload)]

    def _handle_message_delta(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        role = _extract_message_role(payload)
        if role is not None and role.lower() not in {"assistant", "agent"}:
            return [ExternalAgentStreamEvent(raw=payload)]
        message_id = _extract_message_id(payload)
        if _is_response_message_id(message_id):
            return [ExternalAgentStreamEvent(raw=payload)]
        delta_text = _extract_delta_text(payload)
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_message(payload)
        self._message_with_deltas.add(message.id)
        self._assistant_message_open = True
        index = _append_message_text(message, delta_text)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.extend(self._flush_pending_tool_calls(message.id))
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageDeltaEvent(
                    message_id=message.id,
                    content=[
                        MessageTextDelta(
                            index=index if index is not None else 0,
                            text=delta_text,
                        )
                    ],
                ),
            )
        )
        return events

    def _handle_message_complete(
        self, payload: dict[str, Any], _item: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_id = _extract_message_id(payload)
        if _is_response_message_id(message_id):
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
        self._assistant_message_open = True
        events.extend(self._flush_pending_tool_calls(message.id))
        delta_text = _extract_delta_text(payload)
        resolved_delta = _resolve_completion_delta(message, delta_text, self)
        if resolved_delta:
            index = _append_message_text(message, resolved_delta)
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageDeltaEvent(
                        message_id=message.id,
                        content=[
                            MessageTextDelta(
                                index=index if index is not None else 0,
                                text=resolved_delta,
                            )
                        ],
                    ),
                )
            )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageStopEvent(message_id=message.id),
            )
        )
        self._attach_tool_calls_to_message(message)
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageFinalizedEvent(message=message),
            )
        )
        self._completed_items.add(message.id)
        self._assistant_message_open = False
        self._clear_message_tool_calls(message.id)
        return events

    def _handle_reasoning_item_start(
        self, payload: dict[str, Any], item: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
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
            index = _append_message_thinking(
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
                                index=index if index is not None else 0,
                                thinking=thinking,
                                summary=summary,
                                signature=None,
                            )
                        ],
                    ),
                )
            )
        return events or [ExternalAgentStreamEvent(raw=payload)]

    def _handle_reasoning_item_update(
        self, payload: dict[str, Any], item: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_id = _extract_item_id(payload)
        if not message_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_reasoning_message(message_id)
        summary = _extract_reasoning_summary(item)
        thinking = _extract_reasoning_content(item)
        if not summary and not thinking:
            return [ExternalAgentStreamEvent(raw=payload)]
        index = _append_message_thinking(
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
                            index=index if index is not None else 0,
                            thinking=thinking,
                            summary=summary,
                            signature=None,
                        )
                    ],
                ),
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
        index = _append_message_thinking(
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
                            index=index if index is not None else 0,
                            thinking=thinking or "",
                            summary=summary,
                            signature=None,
                        )
                    ],
                ),
            )
        )
        return events

    def _handle_tool_item(
        self,
        payload: dict[str, Any],
        item: dict[str, Any],
        *,
        method: str,
    ) -> list[ExternalAgentStreamEvent]:
        item_type = _extract_item_type(item)
        if item_type not in {
            _COMMAND_EXECUTION_ITEM_TYPE,
            _FILE_CHANGE_ITEM_TYPE,
            _MCP_TOOL_CALL_ITEM_TYPE,
            *_GENERIC_TOOL_ITEM_TYPES,
        }:
            return [ExternalAgentStreamEvent(raw=payload)]

        item_id = _extract_item_id(payload) or _extract_item_id_from_item(item)
        message_id = self._resolve_tool_message_id()
        events: list[ExternalAgentStreamEvent] = []
        if message_id is None:
            should_open_message = method.endswith("/started")
            if (
                not should_open_message
                and item_id
                and item_id not in self._emitted_tool_calls
            ):
                should_open_message = True
            if should_open_message:
                message_id, message_events = self._ensure_assistant_message_for_tool(
                    payload
                )
                events.extend(message_events)
        if item_type == _COMMAND_EXECUTION_ITEM_TYPE:
            events.extend(
                self._handle_command_execution_item(
                    payload,
                    message_id,
                    item_id,
                    item,
                    method=method,
                )
            )
        elif item_type == _FILE_CHANGE_ITEM_TYPE:
            events.extend(
                self._handle_file_change_item(
                    payload,
                    message_id,
                    item_id,
                    item,
                    method=method,
                )
            )
        elif item_type == _MCP_TOOL_CALL_ITEM_TYPE:
            events.extend(
                self._handle_mcp_tool_call_item(
                    payload,
                    message_id,
                    item_id,
                    item,
                    method=method,
                )
            )
        else:
            events.extend(
                self._handle_generic_tool_item(
                    payload,
                    message_id,
                    item_id,
                    item,
                    item_type=item_type,
                    method=method,
                )
            )
        return events or [ExternalAgentStreamEvent(raw=payload)]

    def _handle_command_execution_item(
        self,
        payload: dict[str, Any],
        message_id: str | None,
        item_id: str | None,
        item: dict[str, Any],
        *,
        method: str,
    ) -> list[ExternalAgentStreamEvent]:
        if not item_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        events: list[ExternalAgentStreamEvent] = []
        if item_id not in self._emitted_tool_calls:
            tool_event = _build_command_execution_tool_call(
                message_id or "pending",
                item_id,
                item,
            )
            if tool_event is not None:
                self._emitted_tool_calls.add(item_id)
                if message_id:
                    self._store_message_tool_call(
                        message_id,
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                    )
                    events.append(
                        ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event)
                    )
                else:
                    self._buffer_tool_call(
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                        payload,
                    )
        if method.endswith("/completed") or _command_execution_is_terminal(item):
            if (
                item.get("aggregatedOutput") is None
                and item.get("aggregated_output") is None
            ):
                buffered = self._command_output.get(item_id)
                if buffered:
                    item = dict(item)
                    item["aggregatedOutput"] = "".join(buffered)
            tool_result = _build_command_execution_result(item_id, item)
            if tool_result is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=ToolResultEvent(result=tool_result),
                    )
                )
            self._command_output.pop(item_id, None)
            self._completed_items.add(item_id)
        return events

    def _handle_file_change_item(
        self,
        payload: dict[str, Any],
        message_id: str | None,
        item_id: str | None,
        item: dict[str, Any],
        *,
        method: str,
    ) -> list[ExternalAgentStreamEvent]:
        if not item_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        events: list[ExternalAgentStreamEvent] = []
        if item_id not in self._emitted_tool_calls:
            tool_event = _build_file_change_tool_call(
                message_id or "pending",
                item_id,
                item,
            )
            if tool_event is not None:
                self._emitted_tool_calls.add(item_id)
                if message_id:
                    self._store_message_tool_call(
                        message_id,
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                    )
                    events.append(
                        ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event)
                    )
                else:
                    self._buffer_tool_call(
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                        payload,
                    )
        if method.endswith("/completed") or _file_change_is_terminal(item):
            buffered = self._file_change_output.get(item_id)
            if buffered and item.get("diff") is None:
                item = dict(item)
                item["diff"] = "".join(buffered)
            tool_result = _build_file_change_result(item_id, item)
            if tool_result is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=ToolResultEvent(result=tool_result),
                    )
                )
            self._file_change_output.pop(item_id, None)
            self._completed_items.add(item_id)
        return events

    def _handle_mcp_tool_call_item(
        self,
        payload: dict[str, Any],
        message_id: str | None,
        item_id: str | None,
        item: dict[str, Any],
        *,
        method: str,
    ) -> list[ExternalAgentStreamEvent]:
        if not item_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        events: list[ExternalAgentStreamEvent] = []
        if item_id not in self._emitted_tool_calls:
            tool_event = _build_mcp_tool_call(
                message_id or "pending",
                item_id,
                item,
            )
            if tool_event is not None:
                self._emitted_tool_calls.add(item_id)
                if message_id:
                    self._store_message_tool_call(
                        message_id,
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                    )
                    events.append(
                        ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event)
                    )
                else:
                    self._buffer_tool_call(
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                        payload,
                    )
        if method.endswith("/completed") or _mcp_tool_call_is_terminal(item):
            tool_result = _build_mcp_tool_result(item_id, item)
            if tool_result is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=ToolResultEvent(result=tool_result),
                    )
                )
                self._completed_items.add(item_id)
        return events

    def _handle_generic_tool_item(
        self,
        payload: dict[str, Any],
        message_id: str | None,
        item_id: str | None,
        item: dict[str, Any],
        *,
        item_type: str | None,
        method: str,
    ) -> list[ExternalAgentStreamEvent]:
        if not item_id or not item_type:
            return [ExternalAgentStreamEvent(raw=payload)]
        events: list[ExternalAgentStreamEvent] = []
        if item_id not in self._emitted_tool_calls:
            tool_event = _build_generic_tool_call(
                message_id or "pending",
                item_id,
                item,
                item_type,
            )
            if tool_event is not None:
                self._emitted_tool_calls.add(item_id)
                if message_id:
                    self._store_message_tool_call(
                        message_id,
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                    )
                    events.append(
                        ExternalAgentStreamEvent(raw=payload, stream_chunk=tool_event)
                    )
                else:
                    self._buffer_tool_call(
                        item_id,
                        tool_event.tool_name,
                        tool_event.arguments_delta,
                        payload,
                    )
        if method.endswith("/completed") or _generic_tool_item_is_terminal(item):
            tool_result = _build_generic_tool_result(item_id, item, item_type)
            if tool_result is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=ToolResultEvent(result=tool_result),
                    )
                )
            self._completed_items.add(item_id)
        return events

    def _handle_command_output_delta(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        item_id = _extract_item_id(payload)
        if not item_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        delta_text = _extract_output_delta_text(payload)
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        self._command_output.setdefault(item_id, []).append(delta_text)
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_file_change_output_delta(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        item_id = _extract_item_id(payload)
        if not item_id:
            return [ExternalAgentStreamEvent(raw=payload)]
        delta_text = _extract_output_delta_text(payload)
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        self._file_change_output.setdefault(item_id, []).append(delta_text)
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_raw_response_item(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        item = _extract_item_payload(payload)
        if item is None:
            return [ExternalAgentStreamEvent(raw=payload)]
        item_type = _extract_item_type(item)
        role = item.get("role") if isinstance(item, dict) else None
        if item_type != "message":
            return [ExternalAgentStreamEvent(raw=payload)]
        if isinstance(role, str) and role.lower() not in {"assistant", "agent"}:
            return [ExternalAgentStreamEvent(raw=payload)]
        payload_message_id = _extract_item_id(payload)
        message_id = payload_message_id
        if self._assistant_message_open and self._last_assistant_message_id:
            message_id = self._last_assistant_message_id
        if not message_id:
            message_id = create_new_id()
        if _is_response_message_id(message_id):
            return [ExternalAgentStreamEvent(raw=payload)]
        content = item.get("content")
        text_parts: list[str] = []
        if isinstance(content, list):
            for entry in content:
                if isinstance(entry, dict):
                    text = entry.get("text")
                    if isinstance(text, str) and text:
                        text_parts.append(text)
        if not text_parts:
            return [ExternalAgentStreamEvent(raw=payload)]
        message, is_new = self._get_or_create_message(
            {"id": message_id, "params": {"itemId": message_id}}
        )
        delta_text = "".join(text_parts)
        index = _append_message_text(message, delta_text)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            self._assistant_message_open = True
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        events.extend(self._flush_pending_tool_calls(message.id))
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageDeltaEvent(
                    message_id=message.id,
                    content=[
                        MessageTextDelta(
                            index=index if index is not None else 0,
                            text=delta_text,
                        )
                    ],
                ),
            )
        )
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageStopEvent(message_id=message.id),
            )
        )
        self._attach_tool_calls_to_message(message)
        events.append(
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageFinalizedEvent(message=message),
            )
        )
        self._completed_items.add(message_id)
        if payload_message_id and payload_message_id != message_id:
            self._completed_items.add(payload_message_id)
        self._assistant_message_open = False
        self._clear_message_tool_calls(message.id)
        return events

    def should_process_turn_item(self, item: dict[str, Any]) -> bool:
        item_id = _extract_item_id_from_item(item)
        if not item_id:
            return False
        if item_id in self._completed_items:
            return False
        item_type = _extract_item_type(item)
        if (
            _is_message_item_type(item_type, item)
            and item_id in self._message_with_deltas
        ):
            return False
        return True

    def _resolve_tool_message_id(self) -> str | None:
        if not self._assistant_message_open:
            return None
        return self._last_assistant_message_id

    def _ensure_assistant_message_for_tool(
        self, payload: dict[str, Any]
    ) -> tuple[str, list[ExternalAgentStreamEvent]]:
        message_id = self._resolve_tool_message_id()
        if message_id:
            return message_id, []
        message = AssistantChatMessage(id=create_new_id(), content=[])
        self._messages[message.id] = message
        self._last_message_id = message.id
        self._last_assistant_message_id = message.id
        self._assistant_message_open = True
        return message.id, [
            ExternalAgentStreamEvent(
                raw=payload,
                stream_chunk=MessageStartEvent(message=message),
            )
        ]

    def _reset_turn_state(self) -> None:
        self._last_message_id = None
        self._last_assistant_message_id = None
        self._assistant_message_open = False
        self._pending_tool_calls.clear()
        self._pending_tool_call_order.clear()
        self._message_tool_calls.clear()

    def _buffer_tool_call(
        self,
        tool_call_id: str,
        tool_name: str | None,
        arguments_delta: str,
        payload: dict[str, Any],
    ) -> None:
        existing = self._pending_tool_calls.get(tool_call_id)
        if existing is None:
            self._pending_tool_calls[tool_call_id] = _PendingToolCall(
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                arguments_delta=arguments_delta,
                raw_payload=payload,
            )
            self._pending_tool_call_order.append(tool_call_id)
            return
        if tool_name:
            existing.tool_name = tool_name
        if arguments_delta:
            existing.arguments_delta = arguments_delta
        existing.raw_payload = payload

    def _flush_pending_tool_calls(
        self, message_id: str
    ) -> list[ExternalAgentStreamEvent]:
        if not self._pending_tool_calls:
            return []
        events: list[ExternalAgentStreamEvent] = []
        for tool_call_id in self._pending_tool_call_order:
            pending = self._pending_tool_calls.get(tool_call_id)
            if pending is None:
                continue
            self._store_message_tool_call(
                message_id,
                pending.tool_call_id,
                pending.tool_name,
                pending.arguments_delta,
            )
            tool_event = ToolCallDeltaEvent(
                message_id=message_id,
                tool_call_id=pending.tool_call_id,
                arguments_delta=pending.arguments_delta,
                tool_name=pending.tool_name,
            )
            events.append(
                ExternalAgentStreamEvent(
                    raw=pending.raw_payload, stream_chunk=tool_event
                )
            )
        self._pending_tool_calls.clear()
        self._pending_tool_call_order.clear()
        return events

    def _store_message_tool_call(
        self,
        message_id: str,
        tool_call_id: str,
        tool_name: str | None,
        arguments_delta: str,
    ) -> None:
        if not message_id:
            return
        state = self._message_tool_calls.get(message_id)
        if state is None:
            state = _MessageToolCallState()
            self._message_tool_calls[message_id] = state
        if tool_call_id not in state.tool_calls:
            state.order.append(tool_call_id)
            state.tool_calls[tool_call_id] = ToolCall(
                id=tool_call_id,
                function=ToolCallFunction(name=tool_name or "", arguments={}),
            )
        elif tool_name:
            state.tool_calls[tool_call_id].function.name = tool_name
        if arguments_delta:
            buffer = state.argument_buffers.get(tool_call_id, "")
            state.argument_buffers[tool_call_id] = buffer + arguments_delta

    def _attach_tool_calls_to_message(self, message: AssistantChatMessage) -> None:
        state = self._message_tool_calls.get(message.id)
        if state is None or not state.order:
            return
        tool_calls: list[ToolCall] = []
        for tool_call_id in state.order:
            call = state.tool_calls.get(tool_call_id)
            if call is None:
                continue
            buffer = state.argument_buffers.get(tool_call_id, "")
            if buffer:
                parsed = _maybe_parse_json(buffer)
                if isinstance(parsed, dict):
                    call.function.arguments = parsed
            tool_calls.append(call)
        if tool_calls:
            message.tool_calls = tool_calls

    def _clear_message_tool_calls(self, message_id: str) -> None:
        self._message_tool_calls.pop(message_id, None)

    def _get_or_create_message(
        self, payload: dict[str, Any]
    ) -> tuple[AssistantChatMessage, bool]:
        message_id = _extract_message_id(payload)
        if message_id and message_id in self._messages:
            self._last_message_id = message_id
            self._last_assistant_message_id = message_id
            return self._messages[message_id], False

        if not message_id and self._last_message_id:
            return self._messages[self._last_message_id], False

        message = AssistantChatMessage(
            id=message_id or create_new_id(),
            content=[],
        )
        self._messages[message.id] = message
        self._last_message_id = message.id
        self._last_assistant_message_id = message.id
        return message, True

    def _get_or_create_reasoning_message(
        self, message_id: str
    ) -> tuple[AssistantChatMessage, bool]:
        if message_id in self._messages:
            self._last_message_id = message_id
            return self._messages[message_id], False
        message = AssistantChatMessage(id=message_id, content=[])
        self._messages[message.id] = message
        self._last_message_id = message_id
        return message, True


def _normalize_event_type(value: str) -> str:
    return value.replace("/", ".")


def _is_item_lifecycle_method(method: str) -> bool:
    if not method.startswith("item/"):
        return False
    return method.endswith("/started") or method.endswith("/completed")


def _is_message_delta_method(method: str) -> bool:
    if not method.startswith("item/") or not method.endswith("/delta"):
        return False
    middle = method[len("item/") : -len("/delta")]
    return middle in {
        "agentMessage",
        "assistantMessage",
        "message",
        "agent_message",
        "assistant_message",
    }


def _extract_message_id(payload: dict[str, Any]) -> str | None:
    item = _extract_item_payload(payload)
    if item is not None:
        raw = item.get("id")
        if isinstance(raw, str) and raw:
            return raw
    params = payload.get("params")
    if isinstance(params, dict):
        raw = params.get("itemId")
        if isinstance(raw, str) and raw:
            return raw
    raw = payload.get("id")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _is_response_message_id(message_id: str | None) -> bool:
    if not message_id:
        return False
    return message_id.startswith("rs_") or message_id.startswith("resp_")


def _extract_message_role(payload: dict[str, Any]) -> str | None:
    item = _extract_item_payload(payload)
    if isinstance(item, dict):
        role = item.get("role")
        if isinstance(role, str) and role:
            return role
    params = payload.get("params")
    if isinstance(params, dict):
        role = params.get("role")
        if isinstance(role, str) and role:
            return role
        nested_item = params.get("item")
        if isinstance(nested_item, dict):
            role = nested_item.get("role")
            if isinstance(role, str) and role:
                return role
    role = payload.get("role")
    if isinstance(role, str) and role:
        return role
    return None


def _extract_delta_text(payload: dict[str, Any]) -> str:
    for key in ("delta", "text"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    params = payload.get("params")
    if isinstance(params, dict):
        raw = params.get("delta") or params.get("text")
        if isinstance(raw, str) and raw:
            return raw
        if isinstance(raw, dict):
            text = raw.get("text") or raw.get("delta")
            if isinstance(text, str) and text:
                return text
            content = raw.get("content")
            if isinstance(content, list):
                return _stringify_reasoning_parts(content)
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


def _extract_output_delta_text(payload: dict[str, Any]) -> str:
    params = payload.get("params")
    if isinstance(params, dict):
        raw = params.get("delta") or params.get("text")
        if isinstance(raw, str) and raw:
            return raw
        if isinstance(raw, dict):
            pieces: list[str] = []
            for key in ("stdout", "stderr", "text", "delta"):
                value = raw.get(key)
                if isinstance(value, str) and value:
                    pieces.append(value)
            if pieces:
                return "".join(pieces)
    for key in ("delta", "text"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    return ""


def _append_message_text(message: AssistantChatMessage, delta: str) -> int | None:
    if not delta:
        return None
    if message.content:
        last_index = len(message.content) - 1
        last_block = message.content[last_index]
        if isinstance(last_block, MessageTextContent):
            last_block.text += delta
            return last_index
    message.content.append(MessageTextContent(text=delta))
    return len(message.content) - 1


def _get_message_text(message: AssistantChatMessage) -> str:
    for entry in reversed(message.content):
        if isinstance(entry, MessageTextContent):
            return entry.text
    return ""


def _resolve_completion_delta(
    message: AssistantChatMessage,
    delta_text: str,
    parser: _CodexAppServerEventParser,
) -> str | None:
    if not delta_text:
        return None
    if message.id not in parser._message_with_deltas:
        return delta_text
    existing_text = _get_message_text(message)
    if not existing_text:
        return delta_text
    if delta_text in existing_text:
        return None
    if delta_text.startswith(existing_text):
        suffix = delta_text[len(existing_text) :]
        return suffix or None
    if existing_text.startswith(delta_text):
        return None
    return delta_text


def _extract_thread_id(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("threadId")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_thread_id_from_result(result: dict[str, Any] | None) -> str | None:
    if result is None:
        return None
    raw = result.get("threadId") or result.get("thread_id")
    if isinstance(raw, str) and raw:
        return raw
    raw = result.get("id")
    if isinstance(raw, str) and raw:
        return raw
    nested = result.get("thread")
    if isinstance(nested, dict):
        raw = nested.get("id") or nested.get("threadId")
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


def _build_turn_params(
    context: ExternalAgentRunContext, prompt: str, thread_id: str | None
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if thread_id:
        params["threadId"] = thread_id
    params["input"] = _build_input(prompt)
    model = _extract_model(context)
    if model is not None:
        params["model"] = model
    effort = _extract_effort(context.inputs)
    if effort is not None:
        params["effort"] = effort
    summary = _extract_summary(context.inputs)
    if summary is not None:
        params["summary"] = summary
    approval_policy = _map_approval_policy(_extract_approval_policy(context))
    if approval_policy is not None:
        params["approvalPolicy"] = approval_policy
    sandbox_policy = _build_sandbox_policy(context)
    if sandbox_policy is not None:
        params["sandboxPolicy"] = sandbox_policy
    params["cwd"] = str(context.working_dir)
    output_schema = _extract_output_schema(context.inputs)
    if output_schema is not None:
        params["outputSchema"] = output_schema
    return params


def _build_input(prompt: str) -> list[dict[str, Any]]:
    normalized = prompt.strip()
    if not normalized:
        return []
    return [{"type": "text", "text": normalized}]


def _extract_model(context: ExternalAgentRunContext) -> str | None:
    if context.inputs:
        raw = context.inputs.get("model")
        if isinstance(raw, str) and raw:
            return raw
    if context.config.defaultModel:
        return context.config.defaultModel
    return None


def _extract_effort(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("effort")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_summary(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("summary")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_approval_policy(context: ExternalAgentRunContext) -> str | None:
    if context.inputs:
        raw = context.inputs.get("approvalPolicy")
        if isinstance(raw, str) and raw:
            return raw
    return context.config.approvalPolicy


def _map_approval_policy(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized_key = normalized.lower().replace("_", "-")
    mapping = {
        "unlesstrusted": "untrusted",
        "unless-trusted": "untrusted",
        "untrusted": "untrusted",
        "on-request": "on-request",
        "onrequested": "on-request",
        "on-requested": "on-request",
        "onrequest": "on-request",
        "on-failure": "on-failure",
        "onfailure": "on-failure",
        "never": "never",
    }
    mapped = mapping.get(normalized_key, normalized)
    return mapped


def _build_sandbox_policy(context: ExternalAgentRunContext) -> dict[str, Any] | None:
    raw = None
    if context.inputs:
        raw = context.inputs.get("sandboxPolicy")
    if raw is None:
        raw = context.config.sandboxPolicy
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw:
        return None
    normalized = raw.strip()
    mapping = {
        "workspace-write": "workspaceWrite",
        "workspace_write": "workspaceWrite",
        "read-only": "readOnly",
        "read_only": "readOnly",
        "danger-full-access": "dangerFullAccess",
        "danger_full_access": "dangerFullAccess",
        "external": "externalSandbox",
    }
    return {"type": mapping.get(normalized, normalized)}


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
    params = payload.get("params")
    if isinstance(params, dict):
        raw = params.get("itemId") or params.get("item_id")
        if isinstance(raw, str) and raw:
            return raw
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


def _extract_item_id_from_item(item: dict[str, Any]) -> str | None:
    raw = item.get("id")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_item_type(item: dict[str, Any]) -> str | None:
    raw = item.get("type")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _is_message_item_type(item_type: str | None, item: dict[str, Any] | None) -> bool:
    if item_type is None:
        return False
    if item_type in _MESSAGE_ITEM_TYPES:
        if isinstance(item, dict) and item.get("role") is not None:
            role = item.get("role")
            if isinstance(role, str) and role.lower() not in {"assistant", "agent"}:
                return False
        return True
    if item_type == "message":
        role = item.get("role") if isinstance(item, dict) else None
        return isinstance(role, str) and role == "assistant"
    return False


def _is_reasoning_item_type(item_type: str | None) -> bool:
    if item_type is None:
        return False
    return item_type in _REASONING_ITEM_TYPES


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


def _append_message_thinking(
    message: AssistantChatMessage,
    thinking: str,
    summary: str | None,
    *,
    append_summary: bool = True,
) -> int | None:
    if not thinking and summary is None:
        return None
    block = None
    index = None
    if message.content:
        last_index = len(message.content) - 1
        last_block = message.content[last_index]
        if isinstance(last_block, MessageThinkingContent):
            block = last_block
            index = last_index
    if block is None:
        block = MessageThinkingContent()
        message.content.append(block)
        index = len(message.content) - 1
    if thinking:
        block.thinking += thinking
    if summary is not None:
        if append_summary and block.summary:
            block.summary += summary
        else:
            block.summary = summary
    return index


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


def _command_execution_is_terminal(item: dict[str, Any]) -> bool:
    status = item.get("status")
    if isinstance(status, str) and status in {"completed", "failed"}:
        return True
    if item.get("exitCode") is not None or item.get("exit_code") is not None:
        return True
    return False


def _build_command_execution_result(
    command_id: str,
    item: dict[str, Any],
) -> ToolChatMessage | None:
    command = item.get("command")
    aggregated_output = item.get("aggregatedOutput") or item.get("aggregated_output")
    if aggregated_output is None:
        stdout = item.get("stdout") or item.get("output")
        stderr = item.get("stderr")
        if isinstance(stdout, str) or isinstance(stderr, str):
            parts = []
            if isinstance(stdout, str) and stdout:
                parts.append(stdout)
            if isinstance(stderr, str) and stderr:
                parts.append(stderr)
            aggregated_output = "".join(parts) if parts else None
    exit_code = item.get("exitCode") or item.get("exit_code")
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


def _build_file_change_tool_call(
    message_id: str,
    item_id: str,
    item: dict[str, Any],
) -> ToolCallDeltaEvent | None:
    diff = item.get("diff")
    path = item.get("path") or item.get("filePath")
    arguments: dict[str, Any] = {}
    if isinstance(path, str) and path:
        arguments["path"] = path
    if isinstance(diff, str) and diff:
        arguments["diff"] = diff
    if not arguments:
        return None
    return ToolCallDeltaEvent(
        message_id=message_id,
        tool_call_id=item_id,
        arguments_delta=json.dumps(arguments),
        tool_name=_FILE_CHANGE_TOOL_NAME,
    )


def _file_change_is_terminal(item: dict[str, Any]) -> bool:
    status = item.get("status")
    if isinstance(status, str) and status in {"completed", "failed"}:
        return True
    return False


def _build_file_change_result(
    item_id: str,
    item: dict[str, Any],
) -> ToolChatMessage | None:
    path = item.get("path") or item.get("filePath")
    diff = item.get("diff")
    status = item.get("status")
    result: dict[str, Any] = {
        "path": path,
        "diff": diff,
        "status": status,
    }
    content_text = _stringify_tool_result(diff)
    content = [TextContent(type="text", text=content_text)] if content_text else []
    is_error = isinstance(status, str) and status == "failed"
    return ToolChatMessage(
        tool_call_id=item_id,
        tool_name=_FILE_CHANGE_TOOL_NAME,
        arguments={"path": path} if isinstance(path, str) else {},
        result=result,
        content=content,
        is_error=is_error,
        completed_at=get_now_timestamp(),
    )


def _build_mcp_tool_call(
    message_id: str,
    item_id: str,
    item: dict[str, Any],
) -> ToolCallDeltaEvent | None:
    tool_name = (
        item.get("toolName")
        or item.get("tool_name")
        or item.get("name")
        or item.get("tool")
    )
    server_name = item.get("server")
    if isinstance(server_name, str) and server_name and isinstance(tool_name, str):
        if not tool_name.startswith("mcp__"):
            tool_name = f"mcp__{server_name}__{tool_name}"
    if not isinstance(tool_name, str) or not tool_name:
        return None
    arguments = item.get("input") or item.get("arguments")
    if arguments is None:
        return None
    try:
        arguments_delta = (
            arguments if isinstance(arguments, str) else json.dumps(arguments)
        )
    except TypeError:
        return None
    return ToolCallDeltaEvent(
        message_id=message_id,
        tool_call_id=item_id,
        arguments_delta=arguments_delta,
        tool_name=tool_name,
    )


def _mcp_tool_call_is_terminal(item: dict[str, Any]) -> bool:
    status = item.get("status")
    if isinstance(status, str) and status in {"completed", "failed"}:
        return True
    if item.get("output") is not None or item.get("result") is not None:
        return True
    return False


def _build_mcp_tool_result(
    item_id: str,
    item: dict[str, Any],
) -> ToolChatMessage | None:
    tool_name = (
        item.get("toolName")
        or item.get("tool_name")
        or item.get("name")
        or item.get("tool")
    )
    server_name = item.get("server")
    if isinstance(server_name, str) and server_name and isinstance(tool_name, str):
        if not tool_name.startswith("mcp__"):
            tool_name = f"mcp__{server_name}__{tool_name}"
    if not isinstance(tool_name, str) or not tool_name:
        return None
    output = item.get("output")
    if output is None:
        output = item.get("result")
    arguments = item.get("input") or item.get("arguments")
    arguments_dict = {}
    if isinstance(arguments, dict):
        arguments_dict = arguments
    elif isinstance(arguments, str):
        try:
            parsed = json.loads(arguments)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            arguments_dict = parsed
    content_text = _stringify_tool_result(output)
    content = [TextContent(type="text", text=content_text)] if content_text else []
    status = item.get("status")
    is_error = isinstance(status, str) and status == "failed"
    return ToolChatMessage(
        tool_call_id=item_id,
        tool_name=tool_name,
        arguments=arguments_dict,
        result=output,
        content=content,
        is_error=is_error,
        completed_at=get_now_timestamp(),
    )


def _build_generic_tool_call(
    message_id: str,
    item_id: str,
    item: dict[str, Any],
    item_type: str,
) -> ToolCallDeltaEvent | None:
    arguments = _extract_generic_tool_arguments(item)
    arguments_delta = _stringify_tool_result(arguments)
    return ToolCallDeltaEvent(
        message_id=message_id,
        tool_call_id=item_id,
        arguments_delta=arguments_delta,
        tool_name=item_type,
    )


def _generic_tool_item_is_terminal(item: dict[str, Any]) -> bool:
    status = item.get("status")
    if isinstance(status, str) and status in {"completed", "failed"}:
        return True
    if item.get("output") is not None or item.get("result") is not None:
        return True
    if item.get("results") is not None:
        return True
    return False


def _build_generic_tool_result(
    item_id: str,
    item: dict[str, Any],
    item_type: str,
) -> ToolChatMessage | None:
    arguments = _extract_generic_tool_arguments(item)
    output = _extract_generic_tool_output(item)
    content_text = _stringify_tool_result(output)
    content = [TextContent(type="text", text=content_text)] if content_text else []
    status = item.get("status")
    is_error = isinstance(status, str) and status == "failed"
    return ToolChatMessage(
        tool_call_id=item_id,
        tool_name=item_type,
        arguments=arguments,
        result=output,
        content=content,
        is_error=is_error,
        completed_at=get_now_timestamp(),
    )


def _extract_generic_tool_arguments(item: dict[str, Any]) -> Any:
    arguments = item.get("input") or item.get("arguments")
    if arguments is not None:
        return arguments
    filtered = {
        key: value
        for key, value in item.items()
        if key not in {"type", "id", "status", "output", "result", "results"}
    }
    return filtered


def _extract_generic_tool_output(item: dict[str, Any]) -> Any:
    if item.get("output") is not None:
        return item.get("output")
    if item.get("result") is not None:
        return item.get("result")
    if item.get("results") is not None:
        return item.get("results")
    if item.get("text") is not None:
        return item.get("text")
    return item


def _extract_function_call_id(item: dict[str, Any]) -> str | None:
    for key in ("call_id", "callId", "id"):
        raw = item.get(key)
        if isinstance(raw, str) and raw:
            return raw
    return None


def _extract_function_call_name(item: dict[str, Any]) -> str | None:
    for key in ("name", "tool_name", "toolName"):
        raw = item.get(key)
        if isinstance(raw, str) and raw:
            return raw
    return None


def _extract_function_call_arguments(item: dict[str, Any]) -> Any | None:
    for key in ("arguments", "args", "input"):
        if key in item:
            return item.get(key)
    return None


def _extract_function_call_output(item: dict[str, Any]) -> Any | None:
    if "output" in item:
        return item.get("output")
    if "result" in item:
        return item.get("result")
    return None


def _extract_function_call_error(item: dict[str, Any]) -> bool:
    raw = item.get("error")
    if isinstance(raw, bool):
        return raw
    return False


def _stringify_function_call_arguments(arguments: Any) -> str:
    if arguments is None:
        return ""
    if isinstance(arguments, str):
        return arguments
    try:
        return json.dumps(arguments)
    except TypeError:
        return ""


def _normalize_function_call_arguments(arguments: Any) -> dict[str, Any]:
    parsed = _maybe_parse_json(arguments)
    if isinstance(parsed, dict):
        return parsed
    return {}


def _maybe_parse_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _stringify_tool_result(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value)
    except TypeError:
        return str(value)


def _summarize_payload(payload: Any) -> Any:
    if payload is None:
        return None
    if isinstance(payload, str):
        if len(payload) > 200:
            return f"{payload[:200]}..."
        return payload
    if isinstance(payload, list):
        summarized: list[Any] = []
        for item in payload:
            summarized.append(_summarize_payload(item))
        return summarized
    if isinstance(payload, dict):
        summarized_dict: dict[str, Any] = {}
        for key, value in payload.items():
            lower_key = key.lower()
            if lower_key in {"text", "prompt", "developer_instructions"}:
                if isinstance(value, str):
                    summarized_dict[key] = f"<text len={len(value)}>"
                    continue
            if lower_key in {"input", "params", "arguments"} and isinstance(
                value, list
            ):
                summarized_dict[key] = [_summarize_payload(entry) for entry in value]
                continue
            summarized_dict[key] = _summarize_payload(value)
        return summarized_dict
    return payload


def _is_response(payload: dict[str, Any]) -> bool:
    return "id" in payload and "method" not in payload


def _is_approval_request(payload: dict[str, Any]) -> bool:
    method = payload.get("method")
    if not isinstance(method, str):
        return False
    if method.startswith("item/") and method.endswith("/requestApproval"):
        return "id" in payload
    return False


def _build_approval_payload(
    state: _CodexAppServerState, payload: dict[str, Any]
) -> dict[str, Any]:
    request_id = payload.get("id")
    approval_id = str(request_id)
    if isinstance(request_id, (int, str)):
        state.approval_id_map[approval_id] = request_id
    method = payload.get("method")
    params = payload.get("params")
    item = None
    if isinstance(params, dict):
        item = params.get("item")
    item_type = None
    if isinstance(item, dict):
        item_type = item.get("type")
    tool_name = item_type or "approval"
    approval_payload: dict[str, Any] = {
        "type": "approval_request",
        "approvalId": approval_id,
        "toolName": tool_name,
        "tool": tool_name,
        "method": method,
        "params": params,
    }
    if isinstance(item, dict):
        command = item.get("command")
        parsed_cmd = item.get("parsedCmd") or item.get("parsed_cmd")
        diff = item.get("diff")
        if isinstance(command, str) and command:
            approval_payload["command"] = command
        if parsed_cmd is not None:
            approval_payload["parsedCmd"] = parsed_cmd
        if isinstance(diff, str) and diff:
            approval_payload["diff"] = diff
        input_payload: dict[str, Any] = {}
        if isinstance(command, str) and command:
            input_payload["command"] = command
        if parsed_cmd is not None:
            input_payload["parsedCmd"] = parsed_cmd
        if isinstance(diff, str) and diff:
            input_payload["diff"] = diff
        if input_payload:
            approval_payload["input"] = input_payload
    return approval_payload


def _maybe_set_thread_id(
    handle: ExternalAgentRunHandle,
    state: _CodexAppServerState,
    payload: dict[str, Any],
) -> bool:
    method = payload.get("method")
    if not isinstance(method, str):
        return False
    if method not in {"thread/started", "thread/resumed"}:
        return False
    params = payload.get("params")
    if not isinstance(params, dict):
        return False
    thread_id = params.get("threadId") or params.get("thread_id")
    if not thread_id and isinstance(params.get("thread"), dict):
        thread_id = params["thread"].get("id")
    if isinstance(thread_id, str) and thread_id:
        handle.thread_id = thread_id
        state.thread_id = thread_id
        return True
    return False
