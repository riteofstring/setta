"""Streaming state machine for accumulating assistant responses."""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Callable

from setta.llm.models import (
    LLMMessage,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    LLMStreamEvent,
    ResponseCompletedEvent,
    ResponseFinishStatus,
    TextDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.chat_messages import Chat, ChatMessage, ChatStreamStatus


@dataclass
class StreamStep:
    pending_tool_calls: list["PendingToolCall"]
    completion: ResponseCompletedEvent | None


@dataclass
class StreamStateMachine:
    chat: Chat
    assistant_message: LLMMessage
    recorder: "StreamingTranscriptRecorder"
    status: ChatStreamStatus = field(default=ChatStreamStatus.STREAMING, init=False)
    _accumulator: "AssistantMessageAccumulator" = field(init=False)
    _tool_calls: "ToolCallAccumulator" = field(
        default_factory=lambda: ToolCallAccumulator(), init=False
    )

    def __post_init__(self) -> None:
        self._accumulator = AssistantMessageAccumulator(self.assistant_message)
        self._tool_calls = ToolCallAccumulator()

    def apply_event(self, event: LLMStreamEvent) -> StreamStep:
        self._accumulator.apply_event(event)
        self._tool_calls.observe_event(event)
        self.recorder.maybe_persist_snapshot(self.assistant_message)

        completion = event if isinstance(event, ResponseCompletedEvent) else None
        pending_tool_calls: list[PendingToolCall] = []
        if completion:
            self.status = _status_from_completion(completion)
            if completion.finish_reason == "tool_calls":
                pending_tool_calls = self._tool_calls.consume_ready_calls()
        return StreamStep(
            pending_tool_calls=pending_tool_calls,
            completion=completion,
        )

    def persist_final_chat(self, persist_chat: Callable[[Chat], None]) -> None:
        chat_snapshot = self.chat
        chat_snapshot.streamStatus = self.status
        chat_snapshot.add_message(self.assistant_message)
        persist_chat(chat_snapshot)

    def mark_canceled(self) -> None:
        self.status = ChatStreamStatus.CANCELED

    def mark_error(self) -> None:
        self.status = ChatStreamStatus.ERROR

    def finalize_status(self) -> None:
        if self.status == ChatStreamStatus.STREAMING:
            self.status = ChatStreamStatus.COMPLETED


@dataclass
class ActiveStream:
    task: "asyncio.Task[object]"
    stream_state: StreamStateMachine

    def snapshot_messages(self) -> list[ChatMessage]:
        return [ChatMessage.from_llm_message(self.stream_state.assistant_message)]


@dataclass
class AssistantMessageAccumulator:
    """Incrementally builds the assistant message from incoming stream events."""

    message: LLMMessage
    _text_blocks: dict[str | None, LLMTextBlock] = field(default_factory=dict)
    _tool_call_blocks: dict[str, LLMToolCallBlock] = field(default_factory=dict)

    def apply_event(self, event: LLMStreamEvent) -> None:
        if isinstance(event, TextDeltaEvent):
            self._apply_text_delta(event)
            return
        if isinstance(event, ToolCallDeltaEvent):
            self._apply_tool_call_delta(event)
            return
        if isinstance(event, ToolResultEvent):
            self._apply_tool_result(event)

    def _apply_text_delta(self, event: TextDeltaEvent) -> None:
        block = self._text_blocks.get(event.stream_target)
        if block is None:
            block = LLMTextBlock(stream_target=event.stream_target)
            self._text_blocks[event.stream_target] = block
            self.message.add_block(block)
        block.text += event.delta

    def _apply_tool_call_delta(self, event: ToolCallDeltaEvent) -> None:
        block = self._tool_call_blocks.get(event.tool_call_id)
        if block is None:
            block = LLMToolCallBlock(tool_call_id=event.tool_call_id)
            self._tool_call_blocks[event.tool_call_id] = block
            self.message.add_block(block)
        if event.name and not block.name:
            block.name = event.name
        existing_arguments = block.arguments_text or ""
        block.arguments_text = f"{existing_arguments}{event.arguments_delta}"

    def _apply_tool_result(self, event: ToolResultEvent) -> None:
        tool_call = self._tool_call_blocks.get(event.tool_call_id)
        block = LLMToolResultBlock(
            tool_call_id=event.tool_call_id,
            name=tool_call.name if tool_call else None,
            output_json=event.output,
            output_text=event.output_text,
            is_error=event.is_error,
        )
        self.message.add_block(block)


@dataclass
class PendingToolCall:
    tool_call_id: str
    name: str | None = None
    _argument_chunks: list[str] = field(default_factory=list)

    def add_delta(self, event: ToolCallDeltaEvent) -> None:
        if event.name and not self.name:
            self.name = event.name
        if event.arguments_delta:
            self._argument_chunks.append(event.arguments_delta)

    def to_arguments_dict(self) -> dict[str, object]:
        payload = "".join(self._argument_chunks).strip()
        if not payload:
            return {}
        import json

        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Tool call {self.tool_call_id} provided invalid JSON arguments"
            ) from exc
        if not isinstance(data, dict):
            raise TypeError("Tool arguments must serialize to an object")
        return data


@dataclass
class ToolCallAccumulator:
    _calls: dict[str, PendingToolCall] = field(default_factory=dict)

    def observe_event(self, event: LLMStreamEvent) -> None:
        if isinstance(event, ToolCallDeltaEvent):
            self._record_delta(event)

    def _record_delta(self, event: ToolCallDeltaEvent) -> None:
        call = self._calls.get(event.tool_call_id)
        if call is None:
            call = PendingToolCall(tool_call_id=event.tool_call_id)
            self._calls[event.tool_call_id] = call
        call.add_delta(event)

    def consume_ready_calls(self) -> list[PendingToolCall]:
        if not self._calls:
            return []
        calls = list(self._calls.values())
        self._calls.clear()
        return calls


@dataclass
class StreamingTranscriptRecorder:
    """Persists incremental assistant/tool-call deltas while streaming."""

    chat: Chat
    persist_chat: Callable[[Chat], None]
    persist_interval_seconds: float = 0.5
    _last_persist_monotonic: float | None = field(default=None, init=False)

    def persist_snapshot(self, assistant_message: LLMMessage) -> None:
        """Persist immediately, bypassing the interval gate (for crash recovery)."""

        now = time.monotonic()
        self._persist_snapshot(assistant_message, now)

    def maybe_persist_snapshot(self, assistant_message: LLMMessage) -> None:
        now = time.monotonic()
        if (
            self._last_persist_monotonic is not None
            and (now - self._last_persist_monotonic) < self.persist_interval_seconds
        ):
            return

        self._persist_snapshot(assistant_message, now)

    def _persist_snapshot(self, assistant_message: LLMMessage, now: float) -> None:
        snapshot = self.chat.model_copy(deep=True)
        snapshot.streamStatus = ChatStreamStatus.STREAMING
        snapshot.add_message(assistant_message)
        self.persist_chat(snapshot)
        self._last_persist_monotonic = now


def _status_from_completion(event: ResponseCompletedEvent) -> ChatStreamStatus:
    if event.status == ResponseFinishStatus.CANCELED or event.finish_reason == "canceled":
        return ChatStreamStatus.CANCELED
    if event.status == ResponseFinishStatus.ERROR:
        return ChatStreamStatus.ERROR
    return ChatStreamStatus.COMPLETED
