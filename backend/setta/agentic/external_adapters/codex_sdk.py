import asyncio
import json
import logging
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
    collect_stream_lines,
    iter_stream_lines,
    parse_json_line,
)
from setta.agentic.node_runtime import resolve_node_command
from setta.database.utils import create_new_id
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType
from setta.utils.timestamps import get_now_timestamp

logger = logging.getLogger(__name__)
_SIDECAR_PATH = Path(__file__).resolve().parent / "sidecars" / "codex_sdk_runner.mjs"
_MESSAGE_ITEM_TYPES = {"agent_message", "assistant_message", "message"}


class CodexSdkAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.codex
    supported_run_modes = {ExternalAgentRunMode.sdk}

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        prompt = self._build_prompt(context)
        command = self._build_command(context)
        logger.info("Starting Codex SDK run: %s", " ".join(command))
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(context.working_dir),
            env=context.env,
        )
        if process.stdin is not None:
            payload = {
                "prompt": prompt,
                "itemId": str(context.run.id),
            }
            thread_id = _extract_thread_id(context.inputs)
            if thread_id is not None:
                payload["threadId"] = thread_id
            process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
            await process.stdin.drain()
        return ExternalAgentRunHandle(run_id=context.run.id, process=process)

    async def stream_events(
        self, handle: ExternalAgentRunHandle, _context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        process = handle.process
        if process is None or process.stdout is None:
            return
        stderr_task: asyncio.Task[list[str]] | None = None
        if process.stderr is not None:
            stderr_task = asyncio.create_task(collect_stream_lines(process.stderr))
        parser = _CodexSdkEventParser()
        async for line in iter_stream_lines(process.stdout):
            if not line:
                continue
            raw = parse_json_line(line)
            if raw is None:
                yield ExternalAgentStreamEvent(raw={"type": "stdout", "text": line})
                continue
            _maybe_set_thread_id(handle, raw)
            for event in parser.handle(raw):
                yield event
        if stderr_task is not None:
            for line in await stderr_task:
                if line:
                    yield ExternalAgentStreamEvent(raw={"type": "stderr", "text": line})
        handle.return_code = await process.wait()

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

        events: list[ExternalAgentStreamEvent] = []
        if event_type in {"item.started", "item.start"}:
            events.extend(self._handle_item_start(payload))
        elif event_type in {"item.delta", "item.update"}:
            events.extend(self._handle_item_delta(payload))
        elif event_type in {"item.completed", "item.complete"}:
            events.extend(self._handle_item_complete(payload))

        tool_events = self._handle_tool_events(payload)
        if tool_events:
            events.extend(tool_events)

        if events:
            return events
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_tool_events(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_id = _extract_message_id(payload) or self._last_message_id
        if not message_id:
            return []
        events: list[ExternalAgentStreamEvent] = []
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


def _extract_message_id(payload: dict[str, Any]) -> str | None:
    item = payload.get("item")
    if isinstance(item, dict):
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
    item = payload.get("item")
    if isinstance(item, dict):
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


def _is_message_item(payload: dict[str, Any]) -> bool:
    item = payload.get("item")
    if isinstance(item, dict):
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
