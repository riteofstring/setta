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
    iter_stream_lines,
    parse_json_line,
)
from setta.agentic.node_runtime import resolve_node_command
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
_SIDECAR_PATH = Path(__file__).resolve().parent / "sidecars" / "opencode_sdk_runner.mjs"


class OpenCodeSdkAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.opencode
    supported_run_modes = {ExternalAgentRunMode.sdk, ExternalAgentRunMode.server}

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        prompt = self._build_prompt(context)
        command = self._build_command(context)
        logger.info("Starting OpenCode SDK run: %s", " ".join(command))
        logger.info(
            "OpenCode SDK payload run_id=%s base_url=%s model=%s prompt_length=%s system_length=%s working_dir=%s",
            context.run.id,
            context.config.baseUrl,
            context.config.defaultModel,
            len(prompt),
            len(context.system_prompt or ""),
            context.working_dir,
        )
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(context.working_dir),
            env=self._build_env(context.env),
        )
        stderr_lines: list[str] = []
        handle = ExternalAgentRunHandle(
            run_id=context.run.id,
            process=process,
            metadata={"stderr_lines": stderr_lines},
        )
        if process.stdin is not None:
            payload = {
                "prompt": prompt,
                "runId": str(context.run.id),
                "baseUrl": context.config.baseUrl,
                "model": context.config.defaultModel,
                "workingDir": str(context.working_dir),
            }
            opencode_port = _extract_opencode_port(context.inputs)
            if opencode_port is not None:
                payload["port"] = opencode_port
            opencode_host = _extract_opencode_hostname(context.inputs)
            if opencode_host:
                payload["hostname"] = opencode_host
            system_prompt = _normalize_opencode_system_prompt(context.system_prompt)
            if system_prompt:
                payload["systemPrompt"] = system_prompt
            session_id = _extract_session_id(context.inputs)
            if session_id is not None:
                payload["sessionId"] = session_id
            process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
            await process.stdin.drain()
        return handle

    async def stream_events(
        self, handle: ExternalAgentRunHandle, _context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        process = handle.process
        if process is None or process.stdout is None:
            return
        stderr_task: asyncio.Task[None] | None = None
        stderr_lines = handle.metadata.get("stderr_lines")
        if not isinstance(stderr_lines, list):
            stderr_lines = []
            handle.metadata["stderr_lines"] = stderr_lines
        stderr_queue: asyncio.Queue[str] = asyncio.Queue()
        if process.stderr is not None:
            stderr_task = asyncio.create_task(
                self._stream_stderr(process.stderr, stderr_queue, stderr_lines)
            )
        parser = _OpenCodeSdkEventParser()
        async for line in iter_stream_lines(process.stdout):
            if not line:
                continue
            raw = parse_json_line(line)
            if raw is None:
                logger.info("OpenCode SDK raw stdout: %s", line)
                yield ExternalAgentStreamEvent(raw={"type": "stdout", "text": line})
                await self._flush_stderr_queue(stderr_queue)
                continue
            logger.info("OpenCode SDK event type=%s", raw.get("type"))
            _maybe_set_session_id(handle, raw)
            for event in parser.handle(raw):
                yield event
            await self._flush_stderr_queue(stderr_queue)
        if stderr_task is not None:
            await stderr_task
            await self._flush_stderr_queue(stderr_queue)
        handle.return_code = await process.wait()

    @staticmethod
    def _build_env(base_env: dict[str, str]) -> dict[str, str]:
        env = dict(base_env)
        env["SETTA_OPENCODE_DEBUG"] = "1"
        env["SETTA_OPENCODE_DEBUG_RAW"] = "1"
        return env

    @staticmethod
    async def _stream_stderr(
        stream: asyncio.StreamReader,
        queue: asyncio.Queue[str],
        stderr_lines: list[str],
    ) -> None:
        async for line in iter_stream_lines(stream):
            if not line:
                continue
            stderr_lines.append(line)
            await queue.put(line)

    @staticmethod
    async def _flush_stderr_queue(queue: asyncio.Queue[str]) -> None:
        while not queue.empty():
            try:
                line = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            logger.info("OpenCode SDK stderr: %s", line)

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
            raise RuntimeError("OpenCode SDK process stdin not available")
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
        process = handle.process
        if process is None or process.stdin is None:
            raise RuntimeError("OpenCode SDK process stdin not available")
        message: dict[str, Any] = {
            "type": "question_response",
            "toolCallId": tool_call_id,
        }
        if payload:
            message.update(payload)
        process.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
        await process.stdin.drain()

    @staticmethod
    def _build_command(context: ExternalAgentRunContext) -> list[str]:
        node_path = resolve_node_command(context.config.commandPath)
        return [node_path, str(_SIDECAR_PATH)]

    @staticmethod
    def _build_prompt(context: ExternalAgentRunContext) -> str:
        return build_prompt_from_inputs("", context.inputs)


def _normalize_opencode_system_prompt(system_prompt: str) -> str:
    normalized = system_prompt.strip()
    if not normalized:
        return ""
    needle = "MCP tool names are always namespaced as `<serverId>__<toolName>`."
    replacement = "MCP tool names in OpenCode are `<serverId>_<toolName>`."
    if needle in normalized:
        return normalized.replace(needle, replacement)
    return f"{normalized}\n\n{replacement}"


class _OpenCodeSdkEventParser:
    def __init__(self) -> None:
        self._messages: dict[str, AssistantChatMessage] = {}
        self._last_message_id: str | None = None
        self._emitted_tool_calls: set[str] = set()
        self._tool_argument_cache: dict[str, str] = {}
        self._finalized_messages: set[str] = set()
        self._message_roles: dict[str, str] = {}
        self._pending_parts: dict[str, list[dict[str, Any]]] = {}
        self._part_text_by_id: dict[str, str] = {}

    def handle(self, payload: dict[str, Any]) -> list[ExternalAgentStreamEvent]:
        event_type = payload.get("type")
        if isinstance(event_type, str):
            normalized = event_type.strip().lower()
            if normalized == "message.part.updated":
                return self._handle_part_updated(payload)
            if normalized == "message.updated":
                return self._handle_message_updated(payload)
            if normalized == "assistant_message":
                return self._handle_assistant_message(payload)

        events: list[ExternalAgentStreamEvent] = []
        text = _extract_text(payload)
        if text:
            message, is_new = self._get_or_create_message(payload)
            start_message = message.model_copy(deep=True) if is_new else None
            _append_message_text(message, text)
            if start_message is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=MessageStartEvent(message=start_message),
                    )
                )
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageDeltaEvent(
                        message_id=message.id,
                        content=[MessageTextDelta(index=0, text=text)],
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

        tool_events = self._handle_tool_events(payload)
        if tool_events:
            events.extend(tool_events)

        if events:
            return events
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_part_updated(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        properties = payload.get("properties")
        if not isinstance(properties, dict):
            return [ExternalAgentStreamEvent(raw=payload)]
        part = properties.get("part")
        if not isinstance(part, dict):
            return [ExternalAgentStreamEvent(raw=payload)]
        message_id = _extract_message_id_from_part(part)
        if message_id:
            role = self._message_roles.get(message_id)
            if role is None:
                pending = self._pending_parts.setdefault(message_id, [])
                pending.append(payload)
                return [ExternalAgentStreamEvent(raw=payload)]
            if role != "assistant":
                return [ExternalAgentStreamEvent(raw=payload)]
        part_type = part.get("type")
        if part_type == "text":
            part_id = part.get("id")
            if not isinstance(part_id, str) or not part_id:
                part_id = None
            prev_text = self._part_text_by_id.get(part_id, "") if part_id else ""
            raw_delta = properties.get("delta")
            delta_text = raw_delta if isinstance(raw_delta, str) and raw_delta else None
            if delta_text is None:
                full_text = part.get("text")
                if not isinstance(full_text, str) or not full_text:
                    return [ExternalAgentStreamEvent(raw=payload)]
                if prev_text and full_text.startswith(prev_text):
                    text = full_text[len(prev_text) :]
                elif prev_text and prev_text.startswith(full_text):
                    text = ""
                elif not prev_text:
                    text = full_text
                else:
                    text = full_text
                if part_id:
                    self._part_text_by_id[part_id] = full_text
            else:
                text = delta_text
                if part_id:
                    self._part_text_by_id[part_id] = prev_text + delta_text
            if not text:
                return [ExternalAgentStreamEvent(raw=payload)]
            message, is_new = self._get_or_create_message(
                payload, message_id=message_id
            )
            start_message = message.model_copy(deep=True) if is_new else None
            _append_message_text(message, text)
            events: list[ExternalAgentStreamEvent] = []
            if start_message is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=MessageStartEvent(message=start_message),
                    )
                )
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageDeltaEvent(
                        message_id=message.id,
                        content=[MessageTextDelta(index=0, text=text)],
                    ),
                )
            )
            return events
        if part_type == "reasoning":
            part_id = part.get("id")
            if not isinstance(part_id, str) or not part_id:
                part_id = None
            prev_text = self._part_text_by_id.get(part_id, "") if part_id else ""
            raw_delta = properties.get("delta")
            delta_text = raw_delta if isinstance(raw_delta, str) and raw_delta else None
            if delta_text is None:
                full_text = part.get("text")
                if not isinstance(full_text, str) or not full_text:
                    return [ExternalAgentStreamEvent(raw=payload)]
                if prev_text and full_text.startswith(prev_text):
                    thinking = full_text[len(prev_text) :]
                elif prev_text and prev_text.startswith(full_text):
                    thinking = ""
                elif not prev_text:
                    thinking = full_text
                else:
                    thinking = full_text
                if part_id:
                    self._part_text_by_id[part_id] = full_text
            else:
                thinking = delta_text
                if part_id:
                    self._part_text_by_id[part_id] = prev_text + delta_text
            if not thinking:
                return [ExternalAgentStreamEvent(raw=payload)]
            message, is_new = self._get_or_create_message(
                payload, message_id=message_id
            )
            start_message = message.model_copy(deep=True) if is_new else None
            _append_message_thinking(message, thinking)
            events: list[ExternalAgentStreamEvent] = []
            if start_message is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=MessageStartEvent(message=start_message),
                    )
                )
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageDeltaEvent(
                        message_id=message.id,
                        content=[MessageThinkingDelta(index=0, thinking=thinking)],
                    ),
                )
            )
            return events
        if part_type == "tool":
            return self._handle_tool_part(payload, part)
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_message_updated(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        properties = payload.get("properties")
        if not isinstance(properties, dict):
            return [ExternalAgentStreamEvent(raw=payload)]
        info = properties.get("info")
        if not isinstance(info, dict):
            return [ExternalAgentStreamEvent(raw=payload)]
        if info.get("role") != "assistant":
            message_id = _extract_message_id_from_info(info)
            if message_id:
                self._message_roles[message_id] = str(info.get("role"))
                self._pending_parts.pop(message_id, None)
            return [ExternalAgentStreamEvent(raw=payload)]
        message_id = _extract_message_id_from_info(info)
        if message_id:
            self._message_roles[message_id] = "assistant"
        pending_parts = []
        if message_id:
            pending_parts = self._pending_parts.pop(message_id, [])
        events: list[ExternalAgentStreamEvent] = []
        for pending in pending_parts:
            events.extend(self._handle_part_updated(pending))
        time_info = info.get("time")
        completed = None
        if isinstance(time_info, dict):
            completed = time_info.get("completed")
        if completed:
            message, is_new = self._get_or_create_message(
                payload, message_id=message_id
            )
            if is_new:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=MessageStartEvent(message=message),
                    )
                )
            if message.id not in self._finalized_messages:
                self._finalized_messages.add(message.id)
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
        if events:
            return events
        return [ExternalAgentStreamEvent(raw=payload)]

    def _handle_assistant_message(
        self, payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        response = payload.get("message")
        if not isinstance(response, dict):
            return [ExternalAgentStreamEvent(raw=payload)]
        info = response.get("info")
        if not isinstance(info, dict):
            return [ExternalAgentStreamEvent(raw=payload)]
        synthetic_updated = {
            "type": "message.updated",
            "properties": {"info": info},
        }
        events = self._handle_message_updated(synthetic_updated)
        parts = response.get("parts")
        if isinstance(parts, list):
            for part in parts:
                if not isinstance(part, dict):
                    continue
                synthetic_part = {
                    "type": "message.part.updated",
                    "properties": {"part": part, "delta": part.get("text")},
                }
                events.extend(self._handle_part_updated(synthetic_part))
        return events

    def _handle_tool_part(
        self, payload: dict[str, Any], part: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_id = _extract_message_id_from_part(part)
        message, is_new = self._get_or_create_message(payload, message_id=message_id)
        events: list[ExternalAgentStreamEvent] = []
        if is_new:
            events.append(
                ExternalAgentStreamEvent(
                    raw=payload,
                    stream_chunk=MessageStartEvent(message=message),
                )
            )
        tool_call_id = part.get("callID")
        tool_name = part.get("tool")
        if isinstance(tool_call_id, str) and tool_call_id:
            state = part.get("state")
            if not isinstance(state, dict):
                state = {}
            arguments_delta = _extract_tool_arguments_from_state(state)
            if arguments_delta is not None:
                cached = self._tool_argument_cache.get(tool_call_id)
                if cached != arguments_delta:
                    self._tool_argument_cache[tool_call_id] = arguments_delta
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=payload,
                            stream_chunk=ToolCallDeltaEvent(
                                message_id=message.id,
                                tool_call_id=tool_call_id,
                                arguments_delta=arguments_delta,
                                tool_name=tool_name
                                if isinstance(tool_name, str)
                                else None,
                            ),
                        )
                    )
            self._register_tool_call(message, tool_call_id, tool_name, state)
            tool_result = _build_tool_result_from_state(tool_call_id, tool_name, state)
            if tool_result is not None:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=payload,
                        stream_chunk=ToolResultEvent(result=tool_result),
                    )
                )
        return events

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

    def _get_or_create_message(
        self, payload: dict[str, Any], *, message_id: str | None = None
    ) -> tuple[AssistantChatMessage, bool]:
        message_id = message_id or _extract_message_id(payload)
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

    def _register_tool_call(
        self,
        message: AssistantChatMessage,
        tool_call_id: str,
        tool_name: str | None,
        state: dict[str, Any],
    ) -> None:
        arguments = _extract_tool_arguments_dict_from_state(state)
        if message.tool_calls is None:
            message.tool_calls = []
        for call in message.tool_calls:
            if call.id == tool_call_id:
                if tool_name:
                    call.function.name = tool_name
                if arguments:
                    call.function.arguments = arguments
                return
        message.tool_calls.append(
            ToolCall(
                id=tool_call_id,
                function=ToolCallFunction(
                    name=tool_name or "",
                    arguments=arguments,
                ),
            )
        )


def _extract_message_id(payload: dict[str, Any]) -> str | None:
    raw = payload.get("messageId") or payload.get("messageID")
    if isinstance(raw, str) and raw:
        return raw
    message = payload.get("message")
    if isinstance(message, dict):
        raw = message.get("id")
        if isinstance(raw, str) and raw:
            return raw
    raw = payload.get("id")
    if isinstance(raw, str) and raw:
        return raw
    properties = payload.get("properties")
    if isinstance(properties, dict):
        info = properties.get("info")
        if isinstance(info, dict):
            raw = info.get("id")
            if isinstance(raw, str) and raw:
                return raw
        part = properties.get("part")
        if isinstance(part, dict):
            raw = part.get("messageID")
            if isinstance(raw, str) and raw:
                return raw
    return None


def _extract_message_id_from_part(part: dict[str, Any]) -> str | None:
    raw = part.get("messageID")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_message_id_from_info(info: dict[str, Any]) -> str | None:
    raw = info.get("id")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_text(payload: dict[str, Any]) -> str:
    for key in ("text", "message", "result", "output", "delta"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    message = payload.get("message")
    if isinstance(message, dict):
        for key in ("text", "message", "result", "output", "delta"):
            raw = message.get(key)
            if isinstance(raw, str) and raw:
                return raw
        content = message.get("content")
        if isinstance(content, list):
            return _extract_text_from_parts(content)
    content = payload.get("content")
    if isinstance(content, list):
        return _extract_text_from_parts(content)
    properties = payload.get("properties")
    if isinstance(properties, dict):
        part = properties.get("part")
        if isinstance(part, dict) and part.get("type") == "text":
            raw = properties.get("delta")
            if isinstance(raw, str) and raw:
                return raw
            raw = part.get("text")
            if isinstance(raw, str) and raw:
                return raw
    return ""


def _extract_text_from_parts(parts: list[Any]) -> str:
    output: list[str] = []
    for entry in parts:
        if isinstance(entry, dict):
            text = entry.get("text") or entry.get("delta")
            if isinstance(text, str) and text:
                output.append(text)
        elif isinstance(entry, str) and entry:
            output.append(entry)
    return "".join(output)


def _append_message_text(message: AssistantChatMessage, delta: str) -> None:
    if not delta:
        return
    if message.content and isinstance(message.content[0], MessageTextContent):
        message.content[0].text += delta
        return
    message.content.insert(0, MessageTextContent(text=delta))


def _append_message_thinking(message: AssistantChatMessage, delta: str) -> None:
    if not delta:
        return
    if message.content and isinstance(message.content[0], MessageThinkingContent):
        message.content[0].thinking += delta
        return
    message.content.insert(0, MessageThinkingContent(thinking=delta))


def _extract_session_id(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("sessionId")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_opencode_port(inputs: dict[str, Any] | None) -> int | None:
    if not inputs:
        return None
    raw = inputs.get("opencodePort")
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw.strip())
    return None


def _extract_opencode_hostname(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("opencodeHostname")
    if isinstance(raw, str):
        normalized = raw.strip()
        if normalized:
            return normalized
    return None


def _maybe_set_session_id(
    handle: ExternalAgentRunHandle,
    payload: dict[str, Any],
) -> None:
    if handle.session_id:
        return
    candidates = [
        payload.get("sessionId"),
        payload.get("sessionID"),
        payload.get("session_id"),
        payload.get("session"),
    ]
    for candidate in candidates:
        if isinstance(candidate, dict):
            nested = candidate.get("id") if isinstance(candidate, dict) else None
            if isinstance(nested, str) and nested:
                handle.session_id = nested
                return
        if isinstance(candidate, str) and candidate:
            handle.session_id = candidate
            return
    properties = payload.get("properties")
    if isinstance(properties, dict):
        for entry in (properties, properties.get("info"), properties.get("part")):
            if not isinstance(entry, dict):
                continue
            nested = entry.get("sessionID") or entry.get("sessionId")
            if isinstance(nested, str) and nested:
                handle.session_id = nested
                return


def _extract_tool_call_payloads(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    _extend_payload_entries(candidates, payload, ("tool_calls", "toolCalls"))
    _extend_payload_entries(candidates, payload, ("tool_call", "toolCall"))
    _extend_nested_payload_entries(
        candidates,
        payload,
        ("message", "item", "data", "response", "properties"),
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


def _extract_tool_arguments_from_state(state: dict[str, Any]) -> str | None:
    input_value = state.get("input")
    if input_value is None:
        raw = state.get("raw")
        if isinstance(raw, str) and raw:
            return raw
        return None
    if isinstance(input_value, str):
        return input_value
    try:
        return json.dumps(input_value)
    except TypeError:
        return None


def _extract_tool_arguments_dict_from_state(state: dict[str, Any]) -> dict[str, Any]:
    input_value = state.get("input")
    if isinstance(input_value, dict):
        return input_value
    if isinstance(input_value, str):
        try:
            parsed = json.loads(input_value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _build_tool_result_from_state(
    tool_call_id: str,
    tool_name: str | None,
    state: dict[str, Any],
) -> ToolChatMessage | None:
    status = state.get("status")
    if status not in {"completed", "error"}:
        return None
    raw_result = None
    is_error = False
    if status == "error":
        raw_result = state.get("error")
        is_error = True
    else:
        raw_result = state.get("output")
    if raw_result is None:
        return None
    arguments = _extract_tool_arguments_dict_from_state(state)
    content_text = _stringify_tool_result(raw_result)
    content = [TextContent(type="text", text=content_text)] if content_text else []
    return ToolChatMessage(
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        arguments=arguments,
        result=raw_result,
        content=content,
        is_error=is_error,
        completed_at=get_now_timestamp(),
    )


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
