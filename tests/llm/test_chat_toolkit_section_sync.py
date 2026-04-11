from setta.llm.chat_toolkit.section_sync import (
    apply_stream_delta,
    build_chat_section_state,
)
from setta.mcp.tool_metadata import ToolArgumentPreviewKind
from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageTextContent,
    MessageTextDelta,
    MessageThinkingContent,
    MessageThinkingDelta,
    StreamingEventType,
    ToolChatMessage,
    ToolArgumentPreviewDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)


class TestChatSectionSync:
    def test_message_start_and_text_delta(self) -> None:
        state = build_chat_section_state(messages=[], input_text="draft")
        assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(type="text", text="")],
        )

        started = apply_stream_delta(
            state=state,
            chunk=MessageStartEvent(
                type=StreamingEventType.message_start,
                message=assistant.model_dump(mode="python"),
            ),
        )

        assert started.waitingForResponse
        assert started.inputText == "draft"
        assert started.messages[0].id == "assistant-1"

        delta = MessageDeltaEvent(
            type=StreamingEventType.delta,
            message_id="assistant-1",
            content=[MessageTextDelta(type="text_delta", index=0, text="Hello")],
        )
        updated = apply_stream_delta(state=started, chunk=delta)

        assistant_message = updated.messages[0]
        assert isinstance(assistant_message, AssistantChatMessage)
        assert assistant_message.content[0].text == "Hello"

    def test_message_start_clones_assistant_message(self) -> None:
        state = build_chat_section_state(messages=[])
        assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(type="text", text="")],
        )

        started = apply_stream_delta(
            state=state,
            chunk=MessageStartEvent(
                type=StreamingEventType.message_start,
                message=assistant.model_dump(mode="python"),
            ),
        )

        assistant.content[0].text += "Hi"
        delta = MessageDeltaEvent(
            type=StreamingEventType.delta,
            message_id="assistant-1",
            content=[MessageTextDelta(type="text_delta", index=0, text="Hi")],
        )
        updated = apply_stream_delta(state=started, chunk=delta)

        assistant_message = updated.messages[0]
        assert isinstance(assistant_message, AssistantChatMessage)
        assert assistant_message is not assistant
        assert assistant_message.content[0].text == "Hi"

    def test_tool_call_and_preview_deltas_update_arguments(self) -> None:
        state = build_chat_section_state(messages=[])
        tool_delta = ToolCallDeltaEvent(
            type="tool_call_delta",
            message_id="assistant-1",
            tool_call_id="tool-1",
            arguments_delta='{"value":',
            tool_name="setta__tool",
        )
        updated = apply_stream_delta(state=state, chunk=tool_delta)

        assert "tool-1" in updated.toolCallArguments
        assert updated.toolCallArguments["tool-1"] == '{"value":'

        preview_delta = ToolArgumentPreviewDeltaEvent(
            type=StreamingEventType.tool_argument_preview_delta,
            message_id="assistant-1",
            tool_call_id="tool-1",
            tool_name="setta__tool",
            arguments_delta='"ok"}',
            preview_kind=ToolArgumentPreviewKind.code,
            target_ids_by_type={"section": []},
            preview_value_delta="ok",
        )
        updated = apply_stream_delta(state=updated, chunk=preview_delta)

        assert updated.toolCallArguments["tool-1"] == '{"value":"ok"}'

    def test_thinking_deltas_append_text_and_preserve_existing_metadata(self) -> None:
        state = build_chat_section_state(messages=[])

        updated = apply_stream_delta(
            state=state,
            chunk=MessageDeltaEvent(
                type=StreamingEventType.delta,
                message_id="assistant-1",
                content=[
                    MessageThinkingDelta(
                        type="thinking_delta",
                        index=0,
                        thinking="Plan",
                        summary="summary",
                        signature="sig",
                    )
                ],
            ),
        )
        updated = apply_stream_delta(
            state=updated,
            chunk=MessageDeltaEvent(
                type=StreamingEventType.delta,
                message_id="assistant-1",
                content=[
                    MessageThinkingDelta(
                        type="thinking_delta",
                        index=0,
                        thinking=" more",
                    )
                ],
            ),
        )

        assistant_message = updated.messages[0]
        assert isinstance(assistant_message, AssistantChatMessage)
        assert isinstance(assistant_message.content[0], MessageThinkingContent)
        assert assistant_message.content[0].thinking == "Plan more"
        assert assistant_message.content[0].summary == "summary"
        assert assistant_message.content[0].signature == "sig"

    def test_message_delta_noops_without_message_id_or_content(self) -> None:
        assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(type="text", text="Hello")],
        )
        state = build_chat_section_state(messages=[assistant], waiting_for_response=True)

        missing_message_id = apply_stream_delta(
            state=state,
            chunk=MessageDeltaEvent(
                type=StreamingEventType.delta,
                message_id="",
                content=[MessageTextDelta(type="text_delta", index=0, text="ignored")],
            ),
        )
        empty_content = apply_stream_delta(
            state=state,
            chunk=MessageDeltaEvent(
                type=StreamingEventType.delta,
                message_id="assistant-1",
                content=[],
            ),
        )

        for updated in (missing_message_id, empty_content):
            assistant_message = updated.messages[0]
            assert isinstance(assistant_message, AssistantChatMessage)
            assert assistant_message.content[0].text == "Hello"
            assert updated.waitingForResponse

    def test_tool_result_and_finalized_clear_waiting_state(self) -> None:
        assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(type="text", text="Hello")],
        )
        state = build_chat_section_state(
            messages=[assistant],
            waiting_for_response=True,
            tool_call_arguments={"tool-1": "{}"},
        )
        tool_message = ToolChatMessage(
            id="tool-message-1",
            tool_call_id="tool-1",
            tool_name="setta__tool",
            arguments={},
            content=[],
            is_error=False,
            result={},
        )
        updated = apply_stream_delta(
            state=state,
            chunk=ToolResultEvent(
                type=StreamingEventType.tool_result,
                result=tool_message.model_dump(mode="python"),
            ),
        )

        assert len(updated.messages) == 2
        assert updated.waitingForResponse

        finalized = apply_stream_delta(
            state=updated,
            chunk=MessageFinalizedEvent(
                type=StreamingEventType.message_finalized,
                message=assistant.model_dump(mode="python"),
            ),
        )

        assert not finalized.waitingForResponse
        assert finalized.toolCallArguments == {}

    def test_message_finalized_prefers_exact_assistant_id_over_placeholder(
        self,
    ) -> None:
        exact_assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(type="text", text="stale exact")],
        )
        placeholder_assistant = AssistantChatMessage(
            id="resp_placeholder_1",
            content=[MessageTextContent(type="text", text="placeholder text")],
        )
        state = build_chat_section_state(
            messages=[exact_assistant, placeholder_assistant],
            waiting_for_response=True,
        )
        finalized_message = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(type="text", text="final text")],
        )

        finalized = apply_stream_delta(
            state=state,
            chunk=MessageFinalizedEvent(
                type=StreamingEventType.message_finalized,
                message=finalized_message.model_dump(mode="python"),
            ),
        )

        exact_message = finalized.messages[0]
        assert isinstance(exact_message, AssistantChatMessage)
        assert exact_message.id == "assistant-1"
        assert exact_message.content[0].text == "final text"

        placeholder_message = finalized.messages[1]
        assert isinstance(placeholder_message, AssistantChatMessage)
        assert placeholder_message.id == "resp_placeholder_1"
        assert placeholder_message.content[0].text == "placeholder text"
        assert not finalized.waitingForResponse
