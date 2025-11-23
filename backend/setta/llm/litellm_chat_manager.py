import json
import os
from typing import Any

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
    MessageContent,
    MessageImageUrlContent,
    MessageTextContent,
    ToolCall,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


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
        raise NotImplementedError(
            "LitellmChatManager.process_query is not implemented yet."
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
        messages = [self._serialize_chat_message(message) for message in chat.messages]
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
            raise ValueError("liteLLM config must specify a model via config or override")

        return request

    def _serialize_chat_message(self, message: ChatMessage) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "role": message.role.value,
            "content": [
                self._serialize_content_block(block) for block in message.content
            ],
        }

        if message.tool_calls:
            payload["tool_calls"] = [
                self._serialize_tool_call(call) for call in message.tool_calls
            ]

        if message.tool_call_id:
            payload["tool_call_id"] = message.tool_call_id

        return payload

    def _serialize_tool_call(self, call: ToolCall) -> dict[str, Any]:
        arguments = call.function.arguments or {}
        serialized_arguments = json.dumps(arguments)
        return {
            "id": call.id,
            "type": call.type,
            "function": {
                "name": call.function.name,
                "arguments": serialized_arguments,
            },
        }

    def _serialize_content_block(self, block: MessageContent) -> dict[str, Any]:
        if isinstance(block, MessageTextContent):
            return {
                "type": "text",
                "text": block.text,
            }

        if isinstance(block, MessageImageUrlContent):
            image_url: dict[str, Any] = {"url": block.url}
            if block.detail:
                image_url["detail"] = block.detail
            return {
                "type": "image_url",
                "image_url": image_url,
            }

        raise TypeError(f"Unsupported message content block: {type(block)}")
