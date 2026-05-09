import json
from pathlib import Path

from pydantic import TypeAdapter
from setta.llm.chat_toolkit.section_sync import apply_stream_delta, build_chat_section_state
from setta.types.generated.go_shared_types import (
    BaseChatMessageUnion,
    LLMStreamingResponseChunk,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    MessageThinkingDelta,
    ToolArgumentPreviewDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)

_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "llm"
    / "managed_chat_stream_contract_cases.json"
)
_MESSAGE_ADAPTER = TypeAdapter(BaseChatMessageUnion)


def _load_contract_cases() -> list[dict[str, object]]:
    payload = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    return payload["cases"]


def _contract_state_view(state: object) -> dict[str, object]:
    payload = state.model_dump(mode="json", exclude_none=False)
    return {
        "messages": _strip_message_created_at(payload["messages"]),
        "waitingForResponse": payload["waitingForResponse"],
        "toolCallArguments": payload["toolCallArguments"],
    }


def _strip_message_created_at(messages: list[dict[str, object]]) -> list[dict[str, object]]:
    stripped_messages = []
    for message in messages:
        next_message = dict(message)
        next_message.pop("createdAt", None)
        stripped_messages.append(next_message)
    return stripped_messages


def _build_message_delta(raw_chunk: dict[str, object]) -> MessageDeltaEvent:
    content = []
    delta_builders = {
        "text_delta": MessageTextDelta,
        "thinking_delta": MessageThinkingDelta,
    }
    for delta in raw_chunk["content"]:
        delta_type = delta["type"]
        builder = delta_builders.get(delta_type)
        if builder is None:
            raise AssertionError(f"Unsupported contract delta type: {delta_type}")
        content.append(builder.model_validate(delta))
    return MessageDeltaEvent(
        type=raw_chunk["type"],
        message_id=raw_chunk["message_id"],
        content=content,
    )


def _build_chunk(raw_chunk: dict[str, object]) -> LLMStreamingResponseChunk:
    chunk_type = raw_chunk["type"]
    if chunk_type == "delta":
        return _build_message_delta(raw_chunk)
    builders = {
        "message_start": MessageStartEvent,
        "message_finalized": MessageFinalizedEvent,
        "message_stop": MessageStopEvent,
        "tool_call_delta": ToolCallDeltaEvent,
        "tool_argument_preview_delta": ToolArgumentPreviewDeltaEvent,
        "tool_result": ToolResultEvent,
    }
    builder = builders.get(chunk_type)
    if builder is not None:
        return builder.model_validate(raw_chunk)
    raise AssertionError(f"Unsupported contract chunk type: {chunk_type}")


class TestChatSectionSyncContract:
    def test_contract_cases(self) -> None:
        for case in _load_contract_cases():
            initial_state = case["initialState"]
            state = build_chat_section_state(
                messages=[
                    _MESSAGE_ADAPTER.validate_python(message)
                    for message in initial_state["messages"]
                ],
                waiting_for_response=bool(initial_state["waitingForResponse"]),
                tool_call_arguments=dict(initial_state["toolCallArguments"]),
            )

            next_state = state
            for raw_chunk in case["chunks"]:
                next_state = apply_stream_delta(
                    state=next_state,
                    chunk=_build_chunk(raw_chunk),
                )

            assert _contract_state_view(next_state) == case["expectedState"], case[
                "name"
            ]
