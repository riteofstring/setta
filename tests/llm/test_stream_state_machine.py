import asyncio
import tempfile
import unittest
from pathlib import Path
from typing import Callable, Iterable

from setta.database.db_objs import DBE
from setta.llm.config_store import (
    LLMConfig,
    LLMModelConfig,
    LLMProjectConfig,
    LLMProviderConfig,
)
from setta.llm.models import (
    LLMRole,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    MessageStartedEvent,
    ResponseCompletedEvent,
    ResponseFinishStatus,
    TextDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.mcp.chat_manager import ChatManager
from setta.types.chat_messages import (
    ChatMessage,
    ChatStreamStatus,
    LLMModelSelection,
)


class RecordingFrontendSender:
    def __init__(self) -> None:
        self.stream_chunks: list[tuple[str, str | None, object]] = []
        self.notifications: list[object] = []

    async def send_streaming_response(
        self, chatId: str, assistant_message_id: str | None, chunk
    ):
        self.stream_chunks.append((chatId, assistant_message_id, chunk))

    async def broadcast_notification(self, notification) -> None:
        self.notifications.append(notification)


class ScriptedChatManager(ChatManager):
    def __init__(
        self,
        dbe: DBE,
        *,
        llm_config: LLMConfig,
        frontend: RecordingFrontendSender,
        script_builder: Callable[[str], Iterable[object]],
        tool_result: Callable[[object], ToolResultEvent] | None = None,
    ) -> None:
        super().__init__(
            dbe,
            mcp_client=None,
            wmh_frontend_sender=frontend,
            llm_config=llm_config,
        )
        self._script_builder = script_builder
        self._tool_result = tool_result

    def _acquire_portkey_client(self, provider, *, project_config_id):
        return object()

    async def _astream_portkey_response(
        self,
        *,
        client,
        response_message_id: str,
        history,
        model: str,
        tools,
        request_params,
        extra_headers,
        provider_id: str,
    ):
        for event in self._script_builder(response_message_id):
            yield event

    async def _call_tool(self, tool_call):
        if self._tool_result is not None:
            return self._tool_result(tool_call)
        return await super()._call_tool(tool_call)


PROJECT_CONFIG_ID = "proj-1"


def _build_llm_config() -> LLMConfig:
    provider = LLMProviderConfig(
        provider_id="openai",
        display_name="OpenAI",
        api_key="sk-test",
        models=[
            LLMModelConfig(
                model_id="gpt-4o",
                display_name="GPT-4o",
                supports_reasoning=True,
            )
        ],
    )
    return LLMConfig(
        default_project_config_id=PROJECT_CONFIG_ID,
        project_configs={
            PROJECT_CONFIG_ID: LLMProjectConfig(
                project_config_id=PROJECT_CONFIG_ID,
                providers=[provider],
            )
        },
    )


class StreamStateTransitionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.dbe = DBE(Path(self._tmpdir.name))
        self.frontend = RecordingFrontendSender()
        self.llm_config = _build_llm_config()

    async def test_successful_stream_sets_completed_status(self) -> None:
        def script(message_id: str) -> Iterable[object]:
            return [
                MessageStartedEvent(message_id=message_id, role=LLMRole.ASSISTANT),
                TextDeltaEvent(message_id=message_id, delta="hello", stream_target=None),
                ResponseCompletedEvent(
                    message_id=message_id,
                    status=ResponseFinishStatus.COMPLETED,
                    finish_reason="stop",
                ),
            ]

        manager = ScriptedChatManager(
            self.dbe,
            llm_config=self.llm_config,
            frontend=self.frontend,
            script_builder=script,
        )
        chat = self._start_chat(manager)

        await manager.process_query(None, chat, deep_think=False)

        self.assertEqual(chat.streamStatus, ChatStreamStatus.COMPLETED)
        persisted = manager.get_chat(chat.id)
        assert persisted is not None
        self.assertEqual(persisted.streamStatus, ChatStreamStatus.COMPLETED)
        assistant = persisted.messages[-1]
        self.assertEqual(assistant.role, LLMRole.ASSISTANT)
        self.assertEqual(assistant.content[0].text, "hello")
        completion = self.frontend.stream_chunks[-1][2]
        self.assertIsInstance(completion, ResponseCompletedEvent)
        self.assertEqual(completion.status, ResponseFinishStatus.COMPLETED)
        self.assertFalse(manager.is_waiting_for_response(chat.id))

    async def test_stream_error_sets_error_status_and_notifies(self) -> None:
        def script(message_id: str) -> Iterable[object]:
            yield MessageStartedEvent(message_id=message_id, role=LLMRole.ASSISTANT)
            yield TextDeltaEvent(message_id=message_id, delta="partial", stream_target=None)
            raise RuntimeError("stream failed")

        manager = ScriptedChatManager(
            self.dbe,
            llm_config=self.llm_config,
            frontend=self.frontend,
            script_builder=script,
        )
        chat = self._start_chat(manager)

        with self.assertRaisesRegex(RuntimeError, "stream failed"):
            await manager.process_query(None, chat, deep_think=False)

        self.assertEqual(chat.streamStatus, ChatStreamStatus.ERROR)
        persisted = manager.get_chat(chat.id)
        assert persisted is not None
        self.assertEqual(persisted.streamStatus, ChatStreamStatus.ERROR)
        error_chunk = self.frontend.stream_chunks[-1][2]
        self.assertIsInstance(error_chunk, ResponseCompletedEvent)
        self.assertEqual(error_chunk.status, ResponseFinishStatus.ERROR)
        self.assertEqual(error_chunk.error_reason, "stream failed")
        self.assertGreaterEqual(len(self.frontend.notifications), 1)
        self.assertFalse(manager.is_waiting_for_response(chat.id))

    async def test_tool_results_persist_in_assistant_message(self) -> None:
        def script(message_id: str) -> Iterable[object]:
            yield MessageStartedEvent(message_id=message_id, role=LLMRole.ASSISTANT)
            yield ToolCallDeltaEvent(
                tool_call_id="call-1",
                arguments_delta='{"foo": 1}',
                name="ping_tool",
            )
            yield ResponseCompletedEvent(
                message_id=message_id,
                status=ResponseFinishStatus.COMPLETED,
                finish_reason="tool_calls",
            )

        def tool_result(tool_call) -> ToolResultEvent:
            return ToolResultEvent(
                tool_call_id=tool_call.tool_call_id,
                output={"ok": True},
                output_text="pong",
                is_error=False,
            )

        manager = ScriptedChatManager(
            self.dbe,
            llm_config=self.llm_config,
            frontend=self.frontend,
            script_builder=script,
            tool_result=tool_result,
        )
        chat = self._start_chat(manager)

        await manager.process_query(None, chat, deep_think=False)

        persisted = manager.get_chat(chat.id)
        assert persisted is not None
        assistant = persisted.messages[-1]
        self.assertEqual(assistant.role, LLMRole.ASSISTANT)
        self.assertIsInstance(assistant.content[0], LLMToolCallBlock)
        self.assertIsInstance(assistant.content[1], LLMToolResultBlock)
        result_block = assistant.content[1]
        self.assertEqual(result_block.tool_call_id, "call-1")
        self.assertEqual(result_block.output_json, {"ok": True})
        self.assertEqual(result_block.output_text, "pong")
        stream_events = [chunk for _, _, chunk in self.frontend.stream_chunks]
        self.assertTrue(
            any(isinstance(chunk, ToolResultEvent) for chunk in stream_events),
            "Expected tool result to be streamed to the frontend",
        )
        self.assertEqual(chat.streamStatus, ChatStreamStatus.COMPLETED)
        self.assertFalse(manager.is_waiting_for_response(chat.id))

    def _start_chat(self, manager: ChatManager):
        message = ChatMessage(
            role=LLMRole.USER,
            content=[LLMTextBlock(text="hi")],
        )
        selection = LLMModelSelection(providerId="openai", modelId="gpt-4o")
        return manager.get_or_create_chat(
            None,
            message,
            selection,
            project_config_id=PROJECT_CONFIG_ID,
        )


if __name__ == "__main__":
    unittest.main()
