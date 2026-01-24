import asyncio
import json
import logging
import sys
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
    collect_stream_lines,
    iter_stream_lines,
    parse_json_line,
)
from setta.agentic.node_runtime import resolve_node_command
from setta.database.utils import create_new_id
from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatRole,
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
from setta.types.generated.chat_messages import BaseChatMessageTypeAdapter

logger = logging.getLogger(__name__)
_SIDECAR_PATH = Path(__file__).resolve().parent / "sidecars" / "claude_sdk_runner.mjs"
_FINAL_EVENT_TYPES = {"result", "final", "message_stop", "complete", "done"}


class ClaudeSdkAdapter(ExternalAgentAdapter):
    tool_type = ExternalAgentToolType.claude_code
    supported_run_modes = {ExternalAgentRunMode.sdk}

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        prompt = self._build_prompt(context)
        command = self._build_command(context)
        logger.info("Starting Claude SDK run: %s", " ".join(command))
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
                "systemPrompt": _build_system_prompt_payload(context.system_prompt),
            }
            thinking_payload, thinking_budget = _extract_thinking_payload(
                context.inputs
            )
            if thinking_payload is not None:
                payload["thinking"] = thinking_payload
            if thinking_budget is not None:
                payload["thinkingBudgetTokens"] = thinking_budget
            allowed_tools = _extract_allowed_tools(context)
            if allowed_tools:
                payload["allowedTools"] = allowed_tools
            mcp_config = _extract_mcp_config(context.inputs)
            if mcp_config is not None:
                payload["mcpConfig"] = mcp_config
            if context.config.defaultModel:
                payload["defaultModel"] = context.config.defaultModel
            if context.config.approvalPolicy:
                payload["approvalPolicy"] = context.config.approvalPolicy
            if context.config.sandboxPolicy:
                payload["sandboxPolicy"] = context.config.sandboxPolicy
            close_after_response = _extract_close_after_response(context.inputs)
            if close_after_response is None:
                payload["closeAfterResponse"] = True
            else:
                payload["closeAfterResponse"] = close_after_response
            session_id = _extract_session_id(context.inputs)
            if session_id is not None:
                payload["sessionId"] = session_id
            process.stdin.write(
                (json.dumps({"type": "start", **payload}) + "\n").encode("utf-8")
            )
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
        parser = _ClaudeSdkEventParser()
        async for line in iter_stream_lines(process.stdout):
            if not line:
                continue
            raw = parse_json_line(line)
            if raw is None:
                yield ExternalAgentStreamEvent(raw={"type": "stdout", "text": line})
                continue
            summary = _summarize_sdk_event(raw)
            print(
                f"[claude-sdk] event {summary}",
                file=sys.stderr,
                flush=True,
            )
            logger.warning("Claude SDK event: %s", summary)
            session_id = _extract_session_id_from_event(raw)
            if session_id:
                handle.session_id = session_id
            for event in parser.handle(raw):
                yield event
        if stderr_task is not None:
            for line in await stderr_task:
                if line:
                    print(
                        f"[claude-sdk] stderr {line}",
                        file=sys.stderr,
                        flush=True,
                    )
                    logger.warning("Claude SDK stderr: %s", line)
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
            raise RuntimeError("Claude SDK process stdin not available")
        payload = {
            "type": "approval_response",
            "approvalId": approval_id,
            "decision": "allow" if approved else "deny",
        }
        process.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await process.stdin.drain()

    async def send_tool_response(
        self, handle: ExternalAgentRunHandle, tool_call_id: str, payload: dict[str, Any]
    ) -> None:
        process = handle.process
        if process is None or process.stdin is None:
            raise RuntimeError("Claude SDK process stdin not available")
        message = {
            "type": "tool_response",
            "toolCallId": tool_call_id,
            "payload": payload,
        }
        process.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
        await process.stdin.drain()

    @staticmethod
    def _build_command(context: ExternalAgentRunContext) -> list[str]:
        node_path = resolve_node_command(context.config.commandPath)
        return [node_path, str(_SIDECAR_PATH)]

    @staticmethod
    def _build_prompt(context: ExternalAgentRunContext) -> str:
        prompt = _extract_latest_user_prompt(context.inputs)
        if prompt:
            return f"{prompt}\n"
        return build_prompt_from_inputs("", context.inputs)


@dataclass
class _ToolCallBuffer:
    name: str | None = None
    arguments: str = ""
    saw_delta: bool = False
    seeded_from_input: bool = False


@dataclass
class _ToolResultBuffer:
    tool_use_id: str
    text: str = ""
    is_error: bool = False


class _ClaudeSdkEventParser:
    def __init__(self) -> None:
        self._messages: dict[str, AssistantChatMessage] = {}
        self._last_message_id: str | None = None
        self._current_message_id: str | None = None
        self._block_types_by_index: dict[int, str] = {}
        self._tool_use_ids_by_index: dict[int, str] = {}
        self._tool_result_ids_by_index: dict[int, str] = {}
        self._tool_call_buffers: dict[str, _ToolCallBuffer] = {}
        self._tool_result_buffers: dict[str, _ToolResultBuffer] = {}
        self._finalized_message_ids: set[str] = set()
        self._saw_partial_assistant = False

    def handle(self, payload: dict[str, Any]) -> list[ExternalAgentStreamEvent]:
        event_type = payload.get("type")
        if event_type == "stream_event":
            self._saw_partial_assistant = True
            stream_event = payload.get("event") or payload.get("stream_event")
            return self._handle_stream_event(stream_event, payload)
        if event_type == "partial_assistant":
            self._saw_partial_assistant = True
            stream_event = payload.get("stream_event") or payload.get("event")
            return self._handle_stream_event(stream_event, payload)
        if event_type == "raw_message_stream_event":
            if self._saw_partial_assistant:
                return [ExternalAgentStreamEvent(raw=payload)]
            stream_event = payload.get("stream_event") or payload.get("event")
            return self._handle_stream_event(stream_event, payload)
        if event_type == "assistant":
            if self._saw_partial_assistant:
                return [ExternalAgentStreamEvent(raw=payload)]
            message_payload = payload.get("message")
            if isinstance(message_payload, dict):
                return self._emit_full_message(message_payload, payload)
        if event_type == "result" and self._saw_partial_assistant:
            return [ExternalAgentStreamEvent(raw=payload)]
        delta_text = _extract_delta_text(payload)
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
        return self._emit_text_delta(payload, delta_text, event_type)

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

    def _handle_stream_event(
        self, stream_event: Any, raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        if not isinstance(stream_event, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        event_type = stream_event.get("type")
        if event_type == "message_start":
            return self._handle_message_start(stream_event, raw_payload)
        if event_type == "content_block_start":
            return self._handle_content_block_start(stream_event, raw_payload)
        if event_type == "content_block_delta":
            return self._handle_content_block_delta(stream_event, raw_payload)
        if event_type == "content_block_stop":
            return self._handle_content_block_stop(stream_event, raw_payload)
        if event_type == "message_delta":
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        if event_type == "message_stop":
            return self._handle_message_stop(stream_event, raw_payload)
        return [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_message_start(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message_payload = stream_event.get("message")
        if not isinstance(message_payload, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        message = _build_assistant_message(message_payload)
        self._messages[message.id] = message
        self._current_message_id = message.id
        self._last_message_id = message.id
        self._block_types_by_index.clear()
        self._tool_use_ids_by_index.clear()
        self._tool_result_ids_by_index.clear()
        return [
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageStartEvent(message=message),
            )
        ]

    def _handle_content_block_start(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        index = stream_event.get("index")
        content_block = stream_event.get("content_block")
        if not isinstance(index, int) or not isinstance(content_block, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        block_type = content_block.get("type")
        if not isinstance(block_type, str):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        self._block_types_by_index[index] = block_type
        events: list[ExternalAgentStreamEvent] = []
        if block_type == "text":
            text = content_block.get("text")
            if isinstance(text, str) and text:
                self._append_text(message, index, text)
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[MessageTextDelta(index=index, text=text)],
                        ),
                    )
                )
        elif block_type == "thinking":
            thinking = content_block.get("thinking")
            signature = content_block.get("signature")
            summary = _extract_thinking_summary(content_block)
            has_payload = False
            if isinstance(thinking, str) and thinking:
                has_payload = True
            if summary is not None:
                has_payload = True
            if isinstance(signature, str):
                has_payload = True
            if has_payload:
                self._append_thinking(
                    message,
                    index,
                    thinking if isinstance(thinking, str) else "",
                    summary,
                    signature if isinstance(signature, str) else None,
                )
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[
                                MessageThinkingDelta(
                                    index=index,
                                    thinking=thinking
                                    if isinstance(thinking, str)
                                    else "",
                                    summary=summary,
                                    signature=signature
                                    if isinstance(signature, str)
                                    else None,
                                )
                            ],
                        ),
                    )
                )
        elif block_type == "tool_use":
            tool_use_id = content_block.get("id")
            tool_name = content_block.get("name")
            if isinstance(tool_use_id, str) and tool_use_id:
                self._tool_use_ids_by_index[index] = tool_use_id
                buffer = self._tool_call_buffers.setdefault(
                    tool_use_id, _ToolCallBuffer()
                )
                if isinstance(tool_name, str) and tool_name:
                    buffer.name = tool_name
                input_payload = content_block.get("input")
                if input_payload is not None:
                    serialized = _safe_json_dump(input_payload)
                    if serialized and serialized != "{}":
                        buffer.arguments = serialized
                        buffer.seeded_from_input = True
                        events.append(
                            ExternalAgentStreamEvent(
                                raw=raw_payload,
                                stream_chunk=ToolCallDeltaEvent(
                                    message_id=message.id,
                                    tool_call_id=tool_use_id,
                                    arguments_delta=serialized,
                                    tool_name=buffer.name,
                                ),
                            )
                        )
        elif block_type == "tool_result":
            tool_use_id = content_block.get("tool_use_id")
            if isinstance(tool_use_id, str) and tool_use_id:
                self._tool_result_ids_by_index[index] = tool_use_id
                buffer = self._tool_result_buffers.setdefault(
                    tool_use_id, _ToolResultBuffer(tool_use_id=tool_use_id)
                )
                buffer.is_error = bool(content_block.get("is_error", False))
                text = _extract_tool_result_text(content_block.get("content"))
                if text:
                    buffer.text += text
        return events or [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_content_block_delta(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        index = stream_event.get("index")
        delta = stream_event.get("delta")
        if not isinstance(index, int) or not isinstance(delta, dict):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        block_type = self._block_types_by_index.get(index)
        delta_type = delta.get("type")
        events: list[ExternalAgentStreamEvent] = []
        if block_type == "text" and delta_type == "text_delta":
            text = delta.get("text")
            if isinstance(text, str) and text:
                self._append_text(message, index, text)
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[MessageTextDelta(index=index, text=text)],
                        ),
                    )
                )
        elif block_type == "thinking":
            if delta_type == "thinking_delta":
                thinking = delta.get("thinking")
                summary = _extract_thinking_summary(delta)
                if (isinstance(thinking, str) and thinking) or summary is not None:
                    self._append_thinking(
                        message,
                        index,
                        thinking if isinstance(thinking, str) else "",
                        summary,
                        None,
                    )
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=MessageDeltaEvent(
                                message_id=message.id,
                                content=[
                                    MessageThinkingDelta(
                                        index=index,
                                        thinking=thinking
                                        if isinstance(thinking, str)
                                        else "",
                                        summary=summary,
                                        signature=None,
                                    )
                                ],
                            ),
                        )
                    )
            elif delta_type == "signature_delta":
                signature = delta.get("signature")
                if isinstance(signature, str):
                    self._append_thinking(message, index, "", None, signature)
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=MessageDeltaEvent(
                                message_id=message.id,
                                content=[
                                    MessageThinkingDelta(
                                        index=index,
                                        thinking="",
                                        summary=None,
                                        signature=signature,
                                    )
                                ],
                            ),
                        )
                    )
            elif delta_type in ("summary_delta", "thinking_summary_delta"):
                summary = _extract_thinking_summary(delta)
                if summary is not None:
                    self._append_thinking(message, index, "", summary, None)
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=MessageDeltaEvent(
                                message_id=message.id,
                                content=[
                                    MessageThinkingDelta(
                                        index=index,
                                        thinking="",
                                        summary=summary,
                                        signature=None,
                                    )
                                ],
                            ),
                        )
                    )
        elif block_type == "tool_use" and delta_type == "input_json_delta":
            tool_use_id = self._tool_use_ids_by_index.get(index)
            partial_json = delta.get("partial_json")
            if tool_use_id and isinstance(partial_json, str) and partial_json != "":
                buffer = self._tool_call_buffers.setdefault(
                    tool_use_id, _ToolCallBuffer()
                )
                if not buffer.saw_delta:
                    buffer.saw_delta = True
                    if buffer.seeded_from_input:
                        buffer.arguments = ""
                        buffer.seeded_from_input = False
                buffer.arguments += partial_json
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=ToolCallDeltaEvent(
                            message_id=message.id,
                            tool_call_id=tool_use_id,
                            arguments_delta=partial_json,
                            tool_name=buffer.name,
                        ),
                    )
                )
        elif block_type == "tool_result" and delta_type == "text_delta":
            tool_use_id = self._tool_result_ids_by_index.get(index)
            text = delta.get("text")
            if tool_use_id and isinstance(text, str) and text:
                buffer = self._tool_result_buffers.setdefault(
                    tool_use_id, _ToolResultBuffer(tool_use_id=tool_use_id)
                )
                buffer.text += text
        return events or [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_content_block_stop(
        self, stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        index = stream_event.get("index")
        if not isinstance(index, int):
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        block_type = self._block_types_by_index.get(index)
        events: list[ExternalAgentStreamEvent] = []
        if block_type == "tool_use":
            tool_use_id = self._tool_use_ids_by_index.get(index)
            if tool_use_id:
                tool_call = self._finalize_tool_call(tool_use_id)
                if tool_call is not None:
                    self._upsert_tool_call(message, tool_call)
        elif block_type == "tool_result":
            tool_use_id = self._tool_result_ids_by_index.get(index)
            if tool_use_id:
                tool_result = self._finalize_tool_result(tool_use_id)
                if tool_result is not None:
                    events.append(
                        ExternalAgentStreamEvent(
                            raw=raw_payload,
                            stream_chunk=ToolResultEvent(result=tool_result),
                        )
                    )
        return events or [ExternalAgentStreamEvent(raw=raw_payload)]

    def _handle_message_stop(
        self, _stream_event: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = self._require_current_message(raw_payload)
        if message is None:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        if message.id in self._finalized_message_ids:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        self._finalized_message_ids.add(message.id)
        self._current_message_id = None
        self._block_types_by_index.clear()
        self._tool_use_ids_by_index.clear()
        self._tool_result_ids_by_index.clear()
        return [
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageStopEvent(message_id=message.id),
            ),
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageFinalizedEvent(message=message),
            ),
        ]

    def _emit_full_message(
        self, message_payload: dict[str, Any], raw_payload: dict[str, Any]
    ) -> list[ExternalAgentStreamEvent]:
        message = _build_assistant_message(message_payload)
        if message.id in self._finalized_message_ids:
            return [ExternalAgentStreamEvent(raw=raw_payload)]
        self._messages[message.id] = message
        self._finalized_message_ids.add(message.id)
        events: list[ExternalAgentStreamEvent] = [
            ExternalAgentStreamEvent(
                raw=raw_payload,
                stream_chunk=MessageStartEvent(
                    message=AssistantChatMessage(id=message.id, content=[])
                ),
            )
        ]
        for index, content in enumerate(message.content):
            if isinstance(content, MessageTextContent) and content.text:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[MessageTextDelta(index=index, text=content.text)],
                        ),
                    )
                )
            elif isinstance(content, MessageThinkingContent):
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=MessageDeltaEvent(
                            message_id=message.id,
                            content=[
                                MessageThinkingDelta(
                                    index=index,
                                    thinking=content.thinking,
                                    summary=content.summary,
                                    signature=content.signature,
                                )
                            ],
                        ),
                    )
                )
        for tool_call in message.tool_calls or []:
            serialized = _safe_json_dump(tool_call.function.arguments)
            if serialized:
                events.append(
                    ExternalAgentStreamEvent(
                        raw=raw_payload,
                        stream_chunk=ToolCallDeltaEvent(
                            message_id=message.id,
                            tool_call_id=tool_call.id,
                            arguments_delta=serialized,
                            tool_name=tool_call.function.name,
                        ),
                    )
                )
        events.append(
            ExternalAgentStreamEvent(
                raw=raw_payload, stream_chunk=MessageStopEvent(message_id=message.id)
            )
        )
        events.append(
            ExternalAgentStreamEvent(
                raw=raw_payload, stream_chunk=MessageFinalizedEvent(message=message)
            )
        )
        return events

    def _emit_text_delta(
        self, payload: dict[str, Any], delta_text: str, event_type: Any
    ) -> list[ExternalAgentStreamEvent]:
        message, is_new = self._get_or_create_message(payload)
        current_text = _get_message_text(message)
        if delta_text.startswith(current_text):
            delta_text = delta_text[len(current_text) :]
        if not delta_text:
            return [ExternalAgentStreamEvent(raw=payload)]
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
        if _is_final_event(event_type, payload):
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

    def _require_current_message(
        self, raw_payload: dict[str, Any]
    ) -> AssistantChatMessage | None:
        message_id = self._current_message_id or self._last_message_id
        if not message_id:
            return None
        return self._messages.get(message_id)

    def _append_text(
        self, message: AssistantChatMessage, index: int, text: str
    ) -> None:
        block = _ensure_text_block(message.content, index)
        block.text += text

    def _append_thinking(
        self,
        message: AssistantChatMessage,
        index: int,
        thinking: str,
        summary: str | None = None,
        signature: str | None = None,
    ) -> None:
        block = _ensure_thinking_block(message.content, index)
        if thinking:
            block.thinking += thinking
        if summary is not None:
            block.summary = summary
        if signature is not None:
            block.signature = signature

    def _finalize_tool_call(self, tool_use_id: str) -> ToolCall | None:
        buffer = self._tool_call_buffers.get(tool_use_id)
        if buffer is None:
            return None
        name = buffer.name or ""
        return ToolCall(
            id=tool_use_id,
            function=ToolCallFunction(name=name, arguments=buffer.arguments),
        )

    @staticmethod
    def _upsert_tool_call(message: AssistantChatMessage, tool_call: ToolCall) -> None:
        tool_calls = list(message.tool_calls or [])
        for idx, existing in enumerate(tool_calls):
            if existing.id == tool_call.id:
                tool_calls[idx] = tool_call
                message.tool_calls = tool_calls
                return
        tool_calls.append(tool_call)
        message.tool_calls = tool_calls

    def _finalize_tool_result(self, tool_use_id: str) -> ToolChatMessage | None:
        buffer = self._tool_result_buffers.get(tool_use_id)
        if buffer is None:
            return None
        tool_name = None
        tool_buffer = self._tool_call_buffers.get(tool_use_id)
        if tool_buffer and tool_buffer.name:
            tool_name = tool_buffer.name
        return ToolChatMessage(
            tool_call_id=tool_use_id,
            tool_name=tool_name,
            content=[TextContent(type="text", text=buffer.text)] if buffer.text else [],
            result=buffer.text if buffer.text else None,
            is_error=buffer.is_error,
        )


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


def _extract_delta_text(payload: dict[str, Any]) -> str:
    return _extract_text_from_obj(payload)


def _extract_text_from_obj(obj: Any) -> str:
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        for key in ("delta", "text", "result", "message", "output"):
            raw = obj.get(key)
            if isinstance(raw, str) and raw:
                return raw
            if isinstance(raw, dict) or isinstance(raw, list):
                nested = _extract_text_from_obj(raw)
                if nested:
                    return nested
        content = obj.get("content")
        if isinstance(content, list):
            parts: list[str] = []
            for entry in content:
                text = _extract_text_from_obj(entry)
                if text:
                    parts.append(text)
            return "".join(parts)
    if isinstance(obj, list):
        parts: list[str] = []
        for entry in obj:
            text = _extract_text_from_obj(entry)
            if text:
                parts.append(text)
        return "".join(parts)
    return ""


def _append_message_text(message: AssistantChatMessage, delta: str) -> None:
    if not delta:
        return
    if message.content and isinstance(message.content[0], MessageTextContent):
        message.content[0].text += delta
        return
    message.content.insert(0, MessageTextContent(text=delta))


def _get_message_text(message: AssistantChatMessage) -> str:
    if message.content and isinstance(message.content[0], MessageTextContent):
        return message.content[0].text
    return ""


def _is_final_event(event_type: Any, payload: dict[str, Any]) -> bool:
    if isinstance(event_type, str) and event_type in _FINAL_EVENT_TYPES:
        return True
    if payload.get("final") is True:
        return True
    return False


def _extract_session_id(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("sessionId")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _build_system_prompt_payload(system_prompt: str) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": "preset", "preset": "claude_code"}
    normalized = system_prompt.strip()
    if normalized:
        payload["append"] = normalized
    return payload


def _extract_session_id_from_event(payload: dict[str, Any]) -> str | None:
    for key in ("session_id", "sessionId"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw:
            return raw
    return None


def _summarize_content_types(content: Any) -> list[str] | None:
    if not isinstance(content, list):
        return None
    types: list[str] = []
    for entry in content:
        if isinstance(entry, dict):
            entry_type = entry.get("type")
            if isinstance(entry_type, str):
                types.append(entry_type)
    if types:
        return types
    return None


def _summarize_sdk_event(payload: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {"type": payload.get("type")}
    stream_event = payload.get("event") or payload.get("stream_event")
    if isinstance(stream_event, dict):
        summary["eventType"] = stream_event.get("type")
        block = stream_event.get("content_block")
        if isinstance(block, dict):
            summary["contentBlockType"] = block.get("type")
        delta = stream_event.get("delta")
        if isinstance(delta, dict):
            summary["deltaType"] = delta.get("type")
    message = payload.get("message")
    content_types = None
    if isinstance(message, dict):
        content_types = _summarize_content_types(message.get("content"))
    if content_types is None:
        content_types = _summarize_content_types(payload.get("content"))
    if content_types:
        summary["messageContentTypes"] = content_types
    return summary


def _extract_allowed_tools(context: ExternalAgentRunContext) -> list[str] | None:
    inputs = context.inputs or {}
    raw = inputs.get("allowedTools")
    if isinstance(raw, list):
        tools = [entry for entry in raw if isinstance(entry, str) and entry.strip()]
        if tools:
            return tools
    if context.profile and context.profile.toolAllowlist:
        return list(context.profile.toolAllowlist)
    return None


def _extract_close_after_response(inputs: dict[str, Any] | None) -> bool | None:
    if not inputs:
        return None
    raw = inputs.get("closeAfterResponse")
    if isinstance(raw, bool):
        return raw
    raw = inputs.get("close_after_response")
    if isinstance(raw, bool):
        return raw
    raw = inputs.get("singleTurn")
    if isinstance(raw, bool):
        return raw
    return None


def _extract_mcp_config(inputs: dict[str, Any] | None) -> str | None:
    if not inputs:
        return None
    raw = inputs.get("mcpConfig")
    if isinstance(raw, str) and raw:
        return raw
    return None


def _extract_latest_user_prompt(inputs: dict[str, Any] | None) -> str:
    if not inputs:
        return ""
    raw_messages = inputs.get("messages")
    latest = ""
    if isinstance(raw_messages, list):
        for raw in reversed(raw_messages):
            try:
                message = BaseChatMessageTypeAdapter.validate_python(raw)
            except Exception:
                continue
            role = getattr(message, "role", None)
            role_value = role.value if hasattr(role, "value") else role
            if role_value != ChatRole.user.value:
                continue
            text = _extract_message_text(message)
            if text:
                latest = text
                break
    if latest:
        return latest
    raw_prompt = inputs.get("prompt")
    if isinstance(raw_prompt, str) and raw_prompt.strip():
        return raw_prompt.strip()
    return ""


def _extract_thinking_payload(
    inputs: dict[str, Any] | None,
) -> tuple[Any | None, int | None]:
    if not inputs:
        return None, None
    thinking_payload = inputs.get("thinking")
    if thinking_payload is not None and not isinstance(thinking_payload, (bool, dict)):
        thinking_payload = None
    budget = inputs.get("thinkingBudgetTokens")
    if budget is None:
        budget = inputs.get("thinking_budget_tokens")
    if isinstance(budget, bool):
        budget = None
    if isinstance(budget, str):
        try:
            parsed = int(budget)
        except ValueError:
            budget = None
        else:
            budget = parsed
    if isinstance(budget, int):
        if budget < 0:
            budget = None
    else:
        budget = None
    return thinking_payload, budget


def _extract_message_text(message: Any) -> str:
    content = getattr(message, "content", None)
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for entry in content:
        if isinstance(entry, MessageTextContent) and entry.text:
            parts.append(entry.text)
    return "\n".join(parts).strip()


def _build_assistant_message(payload: dict[str, Any]) -> AssistantChatMessage:
    message_id = payload.get("id")
    if not isinstance(message_id, str) or not message_id:
        message_id = create_new_id()
    content_entries: list[Any] = []
    tool_calls: list[ToolCall] = []
    content = payload.get("content")
    if isinstance(content, list):
        for entry in content:
            if not isinstance(entry, dict):
                continue
            entry_type = entry.get("type")
            if entry_type == "text":
                text = entry.get("text")
                if isinstance(text, str):
                    content_entries.append(MessageTextContent(text=text))
            elif entry_type == "thinking":
                thinking = entry.get("thinking")
                signature = entry.get("signature")
                summary = _extract_thinking_summary(entry)
                if isinstance(thinking, str):
                    content_entries.append(
                        MessageThinkingContent(
                            thinking=thinking,
                            summary=summary,
                            signature=signature if isinstance(signature, str) else None,
                        )
                    )
            elif entry_type == "tool_use":
                tool_id = entry.get("id")
                tool_name = entry.get("name")
                if isinstance(tool_id, str) and tool_id:
                    tool_calls.append(
                        ToolCall(
                            id=tool_id,
                            function=ToolCallFunction(
                                name=tool_name if isinstance(tool_name, str) else "",
                                arguments=entry.get("input") or {},
                            ),
                        )
                    )
    message = AssistantChatMessage(id=message_id, content=content_entries)
    if tool_calls:
        message.tool_calls = tool_calls
    return message


def _ensure_text_block(content: list[Any], index: int) -> MessageTextContent:
    while len(content) <= index:
        content.append(MessageTextContent(text=""))
    entry = content[index]
    if isinstance(entry, MessageTextContent):
        return entry
    replacement = MessageTextContent(text="")
    content[index] = replacement
    return replacement


def _ensure_thinking_block(content: list[Any], index: int) -> MessageThinkingContent:
    while len(content) <= index:
        content.append(MessageThinkingContent(thinking="", signature=None))
    entry = content[index]
    if isinstance(entry, MessageThinkingContent):
        return entry
    replacement = MessageThinkingContent(thinking="", signature=None)
    content[index] = replacement
    return replacement


def _safe_json_dump(payload: Any) -> str:
    try:
        return json.dumps(payload)
    except (TypeError, ValueError):
        return ""


def _extract_tool_result_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        text = payload.get("text")
        if isinstance(text, str):
            return text
        if "content" in payload:
            return _extract_tool_result_text(payload.get("content"))
    if isinstance(payload, list):
        parts: list[str] = []
        for entry in payload:
            part = _extract_tool_result_text(entry)
            if part:
                parts.append(part)
        return "".join(parts)
    return ""


def _extract_thinking_summary(payload: dict[str, Any]) -> str | None:
    for key in ("summary", "thinking_summary", "summary_text", "reasoning_summary"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None
