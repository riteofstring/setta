import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Iterator

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.utils import ChatCompletionDeltaToolCall, Delta, ModelResponseStream

from setta.database.db_objs import DBE
from setta.llm.config import LiteLLMConfig, load_litellm_config
from setta.mcp.client import MCPClient
from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    create_new_chat,
    save_messages,
)
from setta.project_state.chats.save import (
    delete_chat as delete_chat_record,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatRole,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    ToolResult,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    ToolCallDeltaEvent,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


@dataclass
class ToolCallStreamState:
    argument_buffers: dict[int, str] = field(default_factory=dict)


@dataclass
class StreamingSession:
    assistant_message: ChatMessage
    stream: CustomStreamWrapper | None = None
    cancel_requested: bool = False
    started_at: float = field(default_factory=time.time)


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
        self._sessions: dict[str, StreamingSession] = {}

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

        assistant_message = ChatMessage(
            role=ChatRole.assistant,
            content=[],
        )
        tool_call_state = ToolCallStreamState()
        session = StreamingSession(assistant_message=assistant_message)
        self._sessions[chat.id] = session

        try:
            await self.websocket_msg_handler.send_streaming_response(
                chat.id,
                MessageStartEvent(message=assistant_message),
            )

            try:
                stream_result = await litellm.acompletion(**payload, stream=True)
            except Exception:
                logger.exception(
                    "litellm failed to start streaming for chat %s", chat.id
                )
                raise

            if not isinstance(stream_result, CustomStreamWrapper):
                raise TypeError(
                    "litellm.acompletion(stream=True) must return CustomStreamWrapper"
                )
            session.stream = stream_result

            async for chunk in self._iterate_stream(stream_result):
                try:
                    await self._handle_stream_chunk(
                        chat.id,
                        assistant_message,
                        chunk,
                        tool_call_state,
                    )
                except Exception:
                    logger.exception(
                        "litellm streaming chunk handling failed for chat %s", chat.id
                    )

            await self.websocket_msg_handler.send_streaming_response(
                chat.id,
                MessageStopEvent(message_id=assistant_message.id),
            )
            self._finalize_tool_calls(assistant_message, tool_call_state)
            tool_results = await self._run_tool_calls(chat.id, assistant_message)
            if tool_results:
                logger.debug(
                    "Executed %s MCP tool calls for chat %s",
                    len(tool_results),
                    chat.id,
                )
            save_messages(self.dbe, chat.id, [assistant_message])
            await self.websocket_msg_handler.send_streaming_response(
                chat.id,
                MessageFinalizedEvent(message=assistant_message),
            )
        finally:
            self._sessions.pop(chat.id, None)

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

    async def _iterate_stream(
        self, stream_result: CustomStreamWrapper
    ) -> AsyncIterator[ModelResponseStream]:
        if hasattr(stream_result, "__aiter__"):
            async for chunk in stream_result:
                if isinstance(chunk, ModelResponseStream):
                    yield chunk
                else:
                    logger.debug(
                        "Skipping non-ModelResponseStream chunk from litellm stream: %s",
                        type(chunk),
                    )
            return
        for chunk in stream_result:
            if isinstance(chunk, ModelResponseStream):
                yield chunk
            else:
                logger.debug(
                    "Skipping non-ModelResponseStream chunk from litellm stream: %s",
                    type(chunk),
                )

    async def _handle_stream_chunk(
        self,
        chat_id: str,
        assistant_message: ChatMessage,
        chunk: ModelResponseStream,
        tool_call_state: ToolCallStreamState,
    ) -> None:
        choices = chunk.choices
        if not choices:
            return

        choice = choices[0]
        delta = choice.delta
        if not delta:
            return

        await self._handle_text_deltas(chat_id, assistant_message, delta)

        await self._handle_tool_call_deltas(
            chat_id,
            assistant_message,
            delta,
            tool_call_state,
        )

    async def _handle_text_deltas(
        self,
        chat_id: str,
        assistant_message: ChatMessage,
        delta: Delta,
    ) -> None:
        text_deltas = self._build_text_deltas(delta, assistant_message)
        if not text_deltas:
            return
            await self.websocket_msg_handler.send_streaming_response(
                chat_id,
                MessageDeltaEvent(
                    message_id=assistant_message.id,
                    content=text_deltas,
                ),
            )

    def _build_text_deltas(
        self, delta: Delta, assistant_message: ChatMessage
    ) -> list[MessageTextDelta]:
        content_entries = list(self._iter_content_entries(delta))
        if not content_entries:
            return []

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
        return deltas

    def _iter_content_entries(
        self, delta: Delta
    ) -> Iterator[tuple[str | None, str | None, int | None]]:
        if delta.content is None:
            return
        entries = delta.content if isinstance(delta.content, list) else [delta.content]
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

    async def _handle_tool_call_deltas(
        self,
        chat_id: str,
        assistant_message: ChatMessage,
        delta: Delta,
        tool_call_state: ToolCallStreamState,
    ) -> None:
        entries = delta.tool_calls
        if not entries:
            return

        for entry in entries:
            event = self._apply_tool_call_delta(
                assistant_message,
                entry,
                tool_call_state,
            )
            if not event:
                continue
            await self.websocket_msg_handler.send_streaming_response(
                chat_id,
                event,
            )

    def _apply_tool_call_delta(
        self,
        assistant_message: ChatMessage,
        entry: ChatCompletionDeltaToolCall,
        tool_call_state: ToolCallStreamState,
    ) -> ToolCallDeltaEvent | None:
        index = entry.index
        if index < 0:
            raise IndexError

        tool_call = self._ensure_tool_call_entry(assistant_message, index)

        if entry.id:
            tool_call.id = entry.id

        if entry.function.name:
            tool_call.function.name = entry.function.name

        buffer = tool_call_state.argument_buffers.get(index, "")
        buffer += entry.function.arguments
        tool_call_state.argument_buffers[index] = buffer

        return ToolCallDeltaEvent(
            message_id=assistant_message.id,
            tool_call_id=tool_call.id,
            arguments_delta=entry.function.arguments,
        )

    def _ensure_tool_call_entry(
        self, assistant_message: ChatMessage, index: int
    ) -> ToolCall:
        if assistant_message.tool_calls is None:
            assistant_message.tool_calls = []
        while len(assistant_message.tool_calls) <= index:
            assistant_message.tool_calls.append(
                ToolCall(
                    function=ToolCallFunction(
                        name="",
                        arguments={},
                    )
                )
            )
        return assistant_message.tool_calls[index]

    def _finalize_tool_calls(
        self,
        assistant_message: ChatMessage,
        tool_call_state: ToolCallStreamState,
    ) -> None:
        if not assistant_message.tool_calls:
            return
        for index, tool_call in enumerate(assistant_message.tool_calls):
            raw_arguments = tool_call_state.argument_buffers.get(index)
            if not raw_arguments:
                continue
            tool_call.function.arguments = self._parse_tool_call_arguments(
                raw_arguments, tool_call.id
            )

    async def _run_tool_calls(
        self,
        chat_id: str,
        assistant_message: ChatMessage,
    ) -> list[ToolResult]:
        if not assistant_message.tool_calls:
            return []

        results: list[ToolResult] = []
        for tool_call in assistant_message.tool_calls:
            result = await self._dispatch_tool_call(chat_id, tool_call)
            results.append(result)
        return results

    async def _dispatch_tool_call(
        self,
        chat_id: str,
        tool_call: ToolCall,
    ) -> ToolResult:
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            raise ValueError(
                f"Tool call {tool_call.id} in chat {chat_id} is missing a function name"
            )
        arguments = tool_call.function.arguments or {}
        try:
            call_result = await self.mcp_client.call_tool(tool_name, arguments)
        except Exception:
            logger.exception(
                "MCP tool invocation failed for chat %s (tool=%s)",
                chat_id,
                tool_name,
            )
            raise

        return ToolResult(
            tool_call_id=tool_call.id,
            content=call_result.content,
            is_error=call_result.isError,
        )

    def _parse_tool_call_arguments(
        self, arguments: str, tool_call_id: str
    ) -> dict[str, Any]:
        try:
            data = arguments.strip()
            if not data:
                return {}
            return json.loads(data)
        except json.JSONDecodeError:
            logger.warning(
                "Failed to parse tool call arguments for tool_call_id=%s",
                tool_call_id,
                exc_info=True,
            )
            return {}

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
