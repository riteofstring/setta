import logging
import os
from typing import Any, Iterator

import litellm
from litellm.types.utils import ModelResponseStream

from setta.database.db_objs import DBE
from setta.llm.config import LiteLLMConfig, load_litellm_config
from setta.mcp.client import MCPClient
from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    create_new_chat,
    delete_chat as delete_chat_record,
    save_messages,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatRole,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextContent,
    MessageTextDelta,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


logger = logging.getLogger(__name__)


class LitellmChatManager:
    """
    Placeholder implementation that replaces the Anthropic-specific ChatManager.

    The next steps in the refactor will flesh out this class to drive litellm
    streaming, tool calls, and persistence. For now we keep the interface the
    routers expect while intentionally failing fast when invoked.
    """

    def __init__(
        self,
        dbe: DBE,
        mcp_client: MCPClient,
        websocket_msg_handler: WMHFrontendSender,
    ) -> None:
        self.dbe = dbe
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.config: LiteLLMConfig = load_litellm_config()

    def get_chat(self, chat_id: str) -> Chat | None:
        return load_chat(self.dbe, chat_id)

    def get_or_create_chat(
        self,
        chat_id: str | None,
        message: ChatMessage,
    ) -> Chat:
        if chat_id:
            chat = load_chat(self.dbe, chat_id)
            if chat:
                updated = save_messages(self.dbe, chat.id, [message])
                return updated or chat
        return create_new_chat(self.dbe, message)

    def get_all_chat_metadata(self):
        return load_all_chat_metadata(self.dbe)

    def delete_chat(self, chat_id: str) -> None:
        delete_chat_record(self.dbe, chat_id)

    async def process_query(
        self,
        projectConfigId: str,  # noqa: N803 (preserve existing API for now)
        chat: Chat,
        model: str,
        deepThink: bool,  # noqa: N803 (preserve existing API for now)
    ):
        payload = self._build_litellm_request_payload(
            chat,
            model_override=model or None,
        )
        payload["stream"] = True

        assistant_message = ChatMessage(
            role=ChatRole.assistant,
            content=[],
        )

        await self.websocket_msg_handler.send_streaming_response(
            chat.id,
            assistant_message.id,
            MessageStartEvent(message=assistant_message),
        )

        try:
            stream = await litellm.acompletion(**payload)
        except Exception:
            logger.exception("litellm failed to start streaming for chat %s", chat.id)
            raise

        async for chunk in self._iterate_stream(stream):
            try:
                await self._handle_stream_chunk(chat.id, assistant_message, chunk)
            except Exception:
                logger.exception(
                    "litellm streaming chunk handling failed for chat %s", chat.id
                )

        await self.websocket_msg_handler.send_streaming_response(
            chat.id,
            assistant_message.id,
            MessageStopEvent(message_id=assistant_message.id),
        )
        save_messages(self.dbe, chat.id, [assistant_message])
        await self.websocket_msg_handler.send_streaming_response(
            chat.id,
            assistant_message.id,
            MessageFinalizedEvent(message=assistant_message),
        )

    async def request_stop_streaming(self, chat_id: str) -> None:
        raise NotImplementedError(
            "LitellmChatManager.request_stop_streaming is not implemented yet."
        )

    def is_waiting_for_response(self, chat_id: str) -> bool:
        raise NotImplementedError(
            "LitellmChatManager.is_waiting_for_response is not implemented yet."
        )

    def get_current_stream(self, chat_id: str):
        raise NotImplementedError(
            "LitellmChatManager.get_current_stream is not implemented yet."
        )

    def separate_tool_results(self, messages: list[ChatMessage]):
        raise NotImplementedError(
            "LitellmChatManager.separate_tool_results is not implemented yet."
        )

    def _build_litellm_request_payload(
        self,
        chat: Chat,
        model_override: str | None = None,
    ) -> dict[str, Any]:
        """
        Normalize a persisted chat into the kwargs expected by `litellm`.

        The payload mirrors the OpenAI chat/completions schema so the streaming
        layer can pass it directly to `litellm.acompletion`.
        """
        messages: list[dict[str, Any]] = []
        for message in chat.messages:
            payload = message.to_openai_format()
            messages.append(payload)
        request = {}
        config = self.config.copy()
        if "api_key_env" in config:
            api_key = os.getenv(config["api_key_env"])
            if api_key:
                request["api_key"] = api_key
            config.pop("api_key_env")

        if "other_params" in config:
            request.update(config["other_params"])
            config.pop("other_params")

        request.update(config)

        if model_override:
            request["model"] = model_override
        request["messages"] = messages

        if not request["model"]:
            raise ValueError(
                "liteLLM config must specify a model via config or override"
            )

        return request

    async def _iterate_stream(self, stream_result):
        if hasattr(stream_result, "__aiter__"):
            async for chunk in stream_result:
                yield chunk
            return
        for chunk in stream_result:
            yield chunk

    async def _handle_stream_chunk(
        self,
        chat_id: str,
        assistant_message: ChatMessage,
        chunk: ModelResponseStream,
    ) -> None:
        choices = chunk.choices
        if not choices:
            return

        choice = choices[0]
        delta = choice.delta
        if not delta:
            return

        delta_content = delta.content
        content_entries = list(self._iter_content_entries(delta_content))
        if not content_entries:
            return

        deltas: list[MessageTextDelta] = []
        for entry_type, text_value, provided_index in content_entries:
            if (entry_type or "text") != "text":
                continue
            if not isinstance(text_value, str) or not text_value:
                continue
            index = self._resolve_content_index(provided_index, assistant_message)
            block = self._ensure_text_content_block(assistant_message, index)
            block.text += text_value
            deltas.append(MessageTextDelta(index=index, text=text_value))

        if not deltas:
            return

        await self.websocket_msg_handler.send_streaming_response(
            chat_id,
            assistant_message.id,
            MessageDeltaEvent(
                message_id=assistant_message.id,
                content=deltas,
            ),
        )

    def _iter_content_entries(
        self, content: Any
    ) -> Iterator[tuple[str | None, str | None, int | None]]:
        if content is None:
            return
        entries = content if isinstance(content, list) else [content]
        for entry in entries:
            if isinstance(entry, str):
                yield None, entry, None
                continue
            if isinstance(entry, dict):
                yield entry.get("type"), entry.get("text"), entry.get("index")
                continue
            entry_type = getattr(entry, "type", None)
            text_value = getattr(entry, "text", None)
            index = getattr(entry, "index", None)
            yield entry_type, text_value, index

    def _resolve_content_index(
        self, provided_index: Any, assistant_message: ChatMessage
    ) -> int:
        if isinstance(provided_index, int) and provided_index >= 0:
            return provided_index
        if assistant_message.content:
            return len(assistant_message.content) - 1
        return 0

    def _ensure_text_content_block(
        self,
        assistant_message: ChatMessage,
        index: int,
    ) -> MessageTextContent:
        while len(assistant_message.content) <= index:
            assistant_message.content.append(MessageTextContent(type="text", text=""))
        block = assistant_message.content[index]
        if not isinstance(block, MessageTextContent):
            block = MessageTextContent(type="text", text="")
            assistant_message.content[index] = block
        return block
