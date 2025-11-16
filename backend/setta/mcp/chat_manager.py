"""Chat persistence manager built on the neutral LLM models."""

from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.llm.models import LLMTextBlock, LLMToolResultBlock
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
    ) -> None:
        self._dbe = dbe
        self._mcp_client = mcp_client
        self._wmh_frontend_sender = wmh_frontend_sender

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

    def process_query(
        self,
        project_config_id: str | None,
        chat: Chat,
        model: str,
        deep_think: bool,
    ) -> None:
        raise NotImplementedError(
            "Portkey orchestration is not wired into ChatManager yet."
        )

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
