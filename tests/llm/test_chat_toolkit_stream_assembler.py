from setta.llm.chat_toolkit import ChatStreamAssembler


class TestChatStreamAssembler:
    def test_text_and_tool_call_deltas(self) -> None:
        assembler = ChatStreamAssembler()
        builder = assembler.start_assistant_message(message_id="assistant-1")

        builder.append_text("Hello")
        builder.apply_tool_call_delta(
            tool_call_id="tool-1",
            arguments_delta='{"query":',
            tool_name="setta__search",
        )
        builder.apply_tool_call_delta(
            tool_call_id="tool-1",
            arguments_delta='"test"}',
        )

        message = builder.finalize()

        assert message.id == "assistant-1"
        assert message.content[0].text == "Hello"
        assert message.tool_calls is not None
        tool_call = message.tool_calls[0]
        assert tool_call.id == "tool-1"
        assert tool_call.function.name == "setta__search"
        assert tool_call.function.arguments == {"query": "test"}
