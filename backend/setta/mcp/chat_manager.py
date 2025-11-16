"""Chat persistence manager built on the neutral LLM models."""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm import (
    LLMMessage,
    LLMOrchestrator,
    LLMRole,
    LLMStreamEvent,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    PortkeyClient,
    TextDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatMetadata,
    ToolResult,
)

if TYPE_CHECKING:
    from setta.mcp.client import MCPClient
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ChatManager:
    """Handles chat persistence and metadata enumeration."""

    def __init__(
        self,
        dbe: DBE,
        mcp_client: MCPClient,
        wmh_frontend_sender: WMHFrontendSender,
        orchestrator: LLMOrchestrator | None = None,
    ) -> None:
        self._dbe = dbe
        self._mcp_client = mcp_client
        self._wmh_frontend_sender = wmh_frontend_sender
        self._orchestrator = orchestrator or self._build_orchestrator()

    # ---------------------------------------------------------------------
    # Persistence helpers

    def get_or_create_chat(
        self,
        chat_id: str | None,
        message: ChatMessage,
    ) -> Chat:
        """Load an existing chat (if any), append the message, and persist."""

        if chat_id:
            chat = self.get_chat(chat_id)
            if chat is None:
                chat = self._create_chat(message)
            else:
                chat.add_message(message)
        else:
            chat = self._create_chat(message)

        self._persist_chat(chat)
        return chat

    def get_chat(self, chat_id: str) -> Chat | None:
        payload = self._dbe.read_chat(chat_id)
        if payload is None:
            return None
        return Chat.model_validate(payload)

    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        """Return metadata for all chats stored on disk."""

        metadata: list[ChatMetadata] = []
        for path in self._dbe.list_chat_paths():
            payload = self._dbe.read_json(path)
            if not payload:
                continue
            try:
                chat = Chat.model_validate(payload)
            except Exception:
                # Old / invalid chats can be skipped—we do not need backwards compat.
                continue
            metadata.append(ChatMetadata.from_chat(chat))

        metadata.sort(key=lambda item: item.lastUpdated, reverse=True)
        return metadata

    def delete_chat(self, chat_id: str) -> None:
        self._dbe.delete_chat_file(chat_id)

    # ---------------------------------------------------------------------
    # Tool result utilities

    def separate_tool_results(
        self,
        messages: list[ChatMessage],
    ) -> tuple[list[ChatMessage], dict[str, ToolResult]]:
        """Split tool-result blocks out of messages for easier frontend rendering."""

        cleaned_messages: list[ChatMessage] = []
        tool_results: dict[str, ToolResult] = {}

        for message in messages:
            retained_blocks = []
            for block in message.content:
                if isinstance(block, LLMToolResultBlock):
                    tool_results[block.tool_call_id] = ToolResult.from_block(block)
                    continue
                retained_blocks.append(block)

            if not retained_blocks:
                continue

            cleaned_messages.append(
                message.model_copy(update={"content": retained_blocks})
            )

        return cleaned_messages, tool_results

    # ---------------------------------------------------------------------
    # Placeholders for the upcoming orchestrator integration

    async def process_query(
        self,
        project_config_id: str | None,
        chat: Chat,
        model: str,
        deep_think: bool,
    ) -> None:
        """Stream a response from the Portkey-backed orchestrator."""

        del project_config_id  # TODO: scope orchestration by config when available
        response_message_id = create_new_id()
        assistant_message = LLMMessage(
            message_id=response_message_id,
            role=LLMRole.ASSISTANT,
            content=[],
        )
        accumulator = _AssistantMessageAccumulator(assistant_message)

        history = chat.to_history()
        tools = self._mcp_client.available_tools or None
        request_params = self._build_request_params(deep_think=deep_think)

        async for event in self._orchestrator.astream_response(
            response_message_id=response_message_id,
            history=history,
            model=model,
            tools=tools,
            request_params=request_params,
        ):
            accumulator.apply_event(event)
            await self._wmh_frontend_sender.send_streaming_response(
                chatId=chat.id,
                assistant_message_id=response_message_id,
                chunk=event,
            )

        chat.add_message(assistant_message)
        self._persist_chat(chat)

    async def request_stop_streaming(self, chat_id: str) -> None:
        raise NotImplementedError("Stopping in-flight LLM streams is not implemented.")

    def is_waiting_for_response(self, chat_id: str) -> bool:
        raise NotImplementedError("LLM orchestration state tracking is not implemented.")

    def get_current_stream(self, chat_id: str) -> list[ChatMessage]:
        raise NotImplementedError("LLM stream buffering is not implemented.")

    # ---------------------------------------------------------------------

    def _create_chat(self, initial_message: ChatMessage) -> Chat:
        chat = Chat(name=self._derive_chat_name(initial_message))
        chat.add_message(initial_message)
        return chat

    def _derive_chat_name(self, message: ChatMessage) -> str:
        """Use the first text block as the chat title, otherwise fallback."""

        for block in message.content:
            if isinstance(block, LLMTextBlock):
                snippet = block.text.strip()
                if snippet:
                    return snippet[:80]
        return "Untitled Chat"

    def _persist_chat(self, chat: Chat) -> None:
        self._dbe.write_chat(chat.id, chat.model_dump(mode="json"))

    def _build_orchestrator(self) -> LLMOrchestrator:
        """Initialize the Portkey-backed orchestrator from environment config."""

        gateway = PortkeyClient()
        return LLMOrchestrator(gateway)

    def _build_request_params(self, *, deep_think: bool) -> dict[str, object] | None:
        # Deep thinking parameters will be wired up once we map our toggle to Portkey.
        if not deep_think:
            return None
        return None


@dataclass
class _AssistantMessageAccumulator:
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
