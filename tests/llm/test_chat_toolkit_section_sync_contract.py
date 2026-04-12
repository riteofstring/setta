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


def _build_chunk(raw_chunk: dict[str, object]) -> LLMStreamingResponseChunk:
    chunk_type = raw_chunk["type"]
    if chunk_type == "message_start":
        return MessageStartEvent.model_validate(raw_chunk)
    if chunk_type == "message_finalized":
        return MessageFinalizedEvent.model_validate(raw_chunk)
    if chunk_type == "message_stop":
        return MessageStopEvent.model_validate(raw_chunk)
    if chunk_type == "tool_call_delta":
        return ToolCallDeltaEvent.model_validate(raw_chunk)
    if chunk_type == "tool_argument_preview_delta":
        return ToolArgumentPreviewDeltaEvent.model_validate(raw_chunk)
    if chunk_type == "tool_result":
        return ToolResultEvent.model_validate(raw_chunk)
    if chunk_type == "delta":
        content = []
        for delta in raw_chunk["content"]:
            if delta["type"] == "text_delta":
                content.append(MessageTextDelta.model_validate(delta))
                continue
            if delta["type"] == "thinking_delta":
                content.append(MessageThinkingDelta.model_validate(delta))
                continue
            raise AssertionError(f"Unsupported contract delta type: {delta['type']}")
        return MessageDeltaEvent(
            type=raw_chunk["type"],
            message_id=raw_chunk["message_id"],
            content=content,
        )
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
