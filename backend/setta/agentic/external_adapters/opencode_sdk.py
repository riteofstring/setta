import asyncio
import json
import logging
from pathlib import Path
from typing import Any, AsyncIterator

from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
    ExternalAgentStreamEvent,
)
from setta.database.utils import create_new_id
from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
)
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType
from setta.types.generated.chat_messages import BaseChatMessageTypeAdapter

logger = logging.getLogger(__name__)
_SIDECAR_PATH = Path(__file__).resolve().parent / "sidecars" / "opencode_sdk_runner.mjs"


class OpenCodeSdkAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.opencode
    supported_run_modes = {ExternalAgentRunMode.sdk}

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        prompt = self._build_prompt(context)
        command = self._build_command(context)
        logger.info("Starting OpenCode SDK run: %s", " ".join(command))
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
                "runId": str(context.run.id),
                "baseUrl": context.config.baseUrl,
                "model": context.config.defaultModel,
                "workingDir": str(context.working_dir),
            }
            session_id = _extract_session_id(context.inputs)
            if session_id is not None:
                payload["sessionId"] = session_id
            process.stdin.write(json.dumps(payload).encode("utf-8"))
            await process.stdin.drain()
            process.stdin.close()
        return ExternalAgentRunHandle(run_id=context.run.id, process=process)

    async def stream_events(
        self, handle: ExternalAgentRunHandle, _context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        process = handle.process
        if process is None or process.stdout is None:
            return
        stderr_task: asyncio.Task[list[str]] | None = None
        if process.stderr is not None:
            stderr_task = asyncio.create_task(_collect_stream_lines(process.stderr))
        parser = _OpenCodeSdkEventParser()
        async for line in _iter_stream_lines(process.stdout):
            if not line:
                continue
            raw = _parse_json_line(line)
            if raw is None:
                yield ExternalAgentStreamEvent(raw={"type": "stdout", "text": line})
                continue
            _maybe_set_session_id(handle, raw)
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

    @staticmethod
    def _build_command(context: ExternalAgentRunContext) -> list[str]:
        node_path = context.config.commandPath or "node"
        return [node_path, str(_SIDECAR_PATH)]

    @staticmethod
    def _build_prompt(context: ExternalAgentRunContext) -> str:
        parts: list[str] = []
        system_prompt = context.system_prompt.strip()
        if system_prompt:
            parts.append(f"System:\n{system_prompt}")
        inputs = context.inputs or {}
        raw_messages = inputs.get("messages")
        if isinstance(raw_messages, list):
            for raw in raw_messages:
                try:
                    message = BaseChatMessageTypeAdapter.validate_python(raw)
                except Exception:
                    continue
                role = getattr(message, "role", "user")
                role_label = role.value if hasattr(role, "value") else str(role)
                text = _extract_message_text(message)
                if text:
                    parts.append(f"{role_label.capitalize()}:\n{text}")
        prompt = inputs.get("prompt")
        if isinstance(prompt, str) and prompt.strip():
            parts.append(prompt.strip())
        return "\n\n".join(parts).strip() + "\n"


class _OpenCodeSdkEventParser:
    def __init__(self) -> None:
        self._messages: dict[str, AssistantChatMessage] = {}
        self._last_message_id: str | None = None

    def handle(self, payload: dict[str, Any]) -> list[ExternalAgentStreamEvent]:
        text = _extract_text(payload)
        if not text:
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
        _append_message_text(message, text)
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


async def _iter_stream_lines(reader: asyncio.StreamReader) -> AsyncIterator[str]:
    while True:
        line = await reader.readline()
        if not line:
            break
        yield line.decode("utf-8", errors="ignore").strip()


async def _collect_stream_lines(reader: asyncio.StreamReader) -> list[str]:
    output: list[str] = []
    async for line in _iter_stream_lines(reader):
        output.append(line)
    return output


def _parse_json_line(line: str) -> dict[str, Any] | None:
    if not line:
        return None
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def _extract_message_text(message: Any) -> str:
    content = getattr(message, "content", None)
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for entry in content:
        if isinstance(entry, MessageTextContent):
            if entry.text:
                parts.append(entry.text)
    return "\n".join(parts).strip()


def _extract_message_id(payload: dict[str, Any]) -> str | None:
    raw = payload.get("messageId")
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


def _extract_session_id(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("sessionId")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _maybe_set_session_id(
    handle: ExternalAgentRunHandle,
    payload: dict[str, Any],
) -> None:
    if handle.session_id:
        return
    candidates = [
        payload.get("sessionId"),
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
