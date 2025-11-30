import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Iterator, Literal

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.llms.openai import (
    ChatCompletionToolParam,
    ChatCompletionToolParamFunctionChunk,
)
from litellm.types.utils import ChatCompletionDeltaToolCall, Delta, ModelResponseStream

from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
from setta.llm.config import AllLLMConfigs, merge_chat_llm_configs
from setta.mcp.client import MCPClient
from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    create_new_chat,
    save_messages,
)
from setta.project_state.chats.save import (
    delete_chat as delete_chat_record,
)
from setta.types.ai import APIKeys
from setta.types.chat import Chat
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
    ToolCall,
    ToolCallFunction,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageContentDelta,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    MessageThinkingDelta,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


@dataclass
class ToolCallStreamState:
    argument_buffers: dict[int, str] = field(default_factory=dict)


@dataclass
class StreamingSession:
    assistant_message: AssistantChatMessage
    stream: CustomStreamWrapper | None = None
    started_at: float = field(default_factory=time.time)



class LLMChatManager:
    """Coordinates chat persistence, streaming responses, and tool execution."""

    def __init__(
        self,
        dbe: DBE,
        mcp_client: MCPClient,
        websocket_msg_handler: WMHFrontendSender,
    ) -> None:
        self.dbe = dbe
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.config: AllLLMConfigs = self._hydrate_config(AllLLMConfigs())
        self.api_keys: APIKeys = {}
        self._raw_env_vars: APIKeys = {}
        self._sessions: dict[str, StreamingSession] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}

    def get_chat(self, chat_id: str) -> Chat | None:
        return load_chat(self.dbe, chat_id)

    def update_config(self, config: AllLLMConfigs) -> None:
        self.config = self._hydrate_config(config)
        self._sync_api_keys()

    def update_api_keys(self, payload: APIKeys) -> None:
        self._raw_env_vars = dict(payload)
        self._sync_api_keys()

    def get_or_create_chat(
        self,
        chat_id: str | None,
        message: BaseChatMessageUnion,
        llm_config_id: str,
    ) -> Chat:
        if chat_id:
            chat = load_chat(self.dbe, chat_id)
            if chat:
                updated = save_messages(self.dbe, chat.id, [message])
                return updated or chat
        llm_config = self.config.resolve_config(llm_config_id)
        return create_new_chat(self.dbe, message, llm_config)

    def get_all_chat_metadata(self):
        return load_all_chat_metadata(self.dbe)

    def delete_chat(self, chat_id: str) -> None:
        delete_chat_record(self.dbe, chat_id)

    def _hydrate_config(self, config: AllLLMConfigs) -> AllLLMConfigs:
        metadata = self.get_all_chat_metadata()
        return merge_chat_llm_configs(config, metadata)

    def _sync_api_keys(self) -> None:
        if not self._raw_env_vars:
            self.api_keys = {}
            return
        self.api_keys = filter_env_vars_for_config(self._raw_env_vars, self.config)

    def start_processing_query(
        self,
        chat: Chat,
        deepThink: bool,
    ) -> None:
        existing = self._tasks.get(chat.id)
        if existing and not existing.done():
            logger.info(
                "Chat %s already has an active streaming task; cancelling it", chat.id
            )
            existing.cancel()
        task = asyncio.create_task(
            self.process_query(chat, deepThink),
            name=f"llm-chat-{chat.id}",
        )

        def _cleanup(task: asyncio.Task[Any], chat_id: str) -> None:
            self._tasks.pop(chat_id, None)
            if task.cancelled():
                return
            exc = task.exception()
            if exc:
                logger.exception(
                    "Streaming task for chat %s failed", chat_id, exc_info=exc
                )

        task.add_done_callback(lambda t, chat_id=chat.id: _cleanup(t, chat_id))
        self._tasks[chat.id] = task

    async def process_query(self, chat: Chat, deepThink: bool):
        payload = self._build_llm_request_payload(chat, deepThink)

        assistant_message = AssistantChatMessage(
            content=[],
        )
        tool_call_state = ToolCallStreamState()
        session = StreamingSession(assistant_message=assistant_message)
        self._sessions[chat.id] = session

        stop_event_sent = False
        try:
            await self.websocket_msg_handler.send_streaming_response(
                chat.id,
                MessageStartEvent(message=assistant_message),
            )

            try:
                stream_result = await litellm.acompletion(**payload, stream=True)
            except Exception:
                logger.exception(
                    "LLM client failed to start streaming for chat %s", chat.id
                )
                raise

            if not isinstance(stream_result, CustomStreamWrapper):
                raise TypeError("LLM streaming must return a CustomStreamWrapper")
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
                        "LLM streaming chunk handling failed for chat %s", chat.id
                    )

            await self.websocket_msg_handler.send_streaming_response(
                chat.id,
                MessageStopEvent(message_id=assistant_message.id),
            )
            stop_event_sent = True
            self._finalize_tool_calls(assistant_message, tool_call_state)
            tool_results = await self._run_tool_calls(chat.id, assistant_message)
            new_messages: list[BaseChatMessageUnion] = [assistant_message]
            if tool_results:
                new_messages.extend(tool_results)
                logger.debug(
                    "Executed %s MCP tool calls for chat %s",
                    len(tool_results),
                    chat.id,
                )
            save_messages(self.dbe, chat.id, new_messages)

            await self.websocket_msg_handler.send_streaming_response(
                chat.id,
                MessageFinalizedEvent(message=assistant_message),
            )
        except asyncio.CancelledError:
            if not stop_event_sent:
                await self.websocket_msg_handler.send_streaming_response(
                    chat.id,
                    MessageStopEvent(message_id=assistant_message.id),
                )
                stop_event_sent = True
            if self._should_persist_partial_message(assistant_message):
                self._finalize_tool_calls(assistant_message, tool_call_state)
                save_messages(self.dbe, chat.id, [assistant_message])
                await self.websocket_msg_handler.send_streaming_response(
                    chat.id,
                    MessageFinalizedEvent(message=assistant_message),
                )
            raise
        finally:
            self._sessions.pop(chat.id, None)

    async def request_stop_streaming(self, chat_id: str) -> None:
        task = self._tasks.get(chat_id)
        if not task:
            logger.info("Stop requested for chat %s but no active task exists", chat_id)
            return
        task.cancel()
        self._tasks.pop(chat_id, None)

    def is_waiting_for_response(self, chat_id: str) -> bool:
        return chat_id in self._sessions

    def get_current_stream(self, chat_id: str) -> list[BaseChatMessageUnion]:
        session = self._sessions.get(chat_id)
        if not session:
            return []
        return [session.assistant_message.model_copy(deep=True)]

    def _build_llm_request_payload(
        self,
        chat: Chat,
        deep_think: bool,
    ) -> dict[str, Any]:
        """
        Normalize a persisted chat into the kwargs expected by the LLM client.

        The payload mirrors the OpenAI chat/completions schema so the streaming
        layer can pass it directly to the configured completion client.
        """
        messages: list[dict[str, Any]] = []
        for message in chat.messages:
            payload = message.to_openai_format()
            messages.append(payload)
        request, api_key_env = self.config.build_llm_params(chat.llmConfig)
        if api_key_env:
            api_key = self.api_keys.get(api_key_env)
            if api_key:
                request["api_key"] = api_key

        request["messages"] = messages
        tools = self._build_tool_definitions()
        if tools:
            request["tools"] = tools

        self._apply_request_overrides(request, deep_think)

        if not request["model"]:
            raise ValueError("LLM config must specify a model via config or override")

        return request

    def _build_tool_definitions(self) -> list[ChatCompletionToolParam]:
        tools: list[ChatCompletionToolParam] = []
        for tool in self.mcp_client.available_tools:
            function_payload: ChatCompletionToolParamFunctionChunk = {
                "name": tool.name,
                "description": tool.description or "",
                "parameters": tool.inputSchema,
            }
            tools.append({"type": "function", "function": function_payload})
        return tools

    def _apply_request_overrides(
        self,
        request: dict[str, Any],
        deep_think: bool,
    ) -> None:
        if not deep_think:
            return
        if "reasoning_effort" in request:
            return

        model_name = request.get("model")
        provider = request.get("custom_llm_provider")
        if not model_name:
            raise ValueError("Deep think requires a configured model")
        if not self._should_enable_reasoning_override(model_name, provider):
            provider_display = provider or "default"
            raise ValueError(
                f"Deep think is not supported for model '{model_name}' via provider '{provider_display}'"
            )

        request["reasoning_effort"] = "high"
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[deep-think] enabling reasoning_effort=high for model=%s provider=%s",
                model_name,
                provider,
            )

    @staticmethod
    def _should_enable_reasoning_override(
        model_name: str,
        provider: str | None,
    ) -> bool:
        normalized_model = model_name.lower()
        normalized_provider = (provider or "").lower()

        if LLMChatManager._is_openai_reasoning_model(normalized_model):
            if (
                LLMChatManager._is_openai_provider(normalized_provider)
                or not normalized_provider
            ):
                return True

        if LLMChatManager._is_claude_like_model(normalized_model):
            if (
                LLMChatManager._is_anthropic_provider(normalized_provider)
                or not normalized_provider
            ):
                return True

        if LLMChatManager._is_gemini_like_model(normalized_model):
            if (
                LLMChatManager._is_google_provider(normalized_provider)
                or not normalized_provider
            ):
                return True

        return False

    @staticmethod
    def _is_openai_reasoning_model(model_name: str) -> bool:
        lowered = model_name.lower()
        # LiteLLM adapters commonly prefix provider names (e.g., "openai/gpt-5.1")
        alias = lowered.split("/")[-1]
        return alias.startswith(("o1", "o3", "o4", "gpt-5"))

    @staticmethod
    def _is_openai_provider(provider: str) -> bool:
        return any(
            hint in provider
            for hint in (
                "openai",
                "azure",
            )
        )

    @staticmethod
    def _is_claude_like_model(model_name: str) -> bool:
        lowered = model_name.lower()
        return "claude" in lowered or any(
            lowered.startswith(prefix) for prefix in ("sonnet", "haiku", "opus")
        )

    @staticmethod
    def _is_gemini_like_model(model_name: str) -> bool:
        return "gemini" in model_name.lower()

    @staticmethod
    def _is_anthropic_provider(provider: str) -> bool:
        return any(
            hint in provider
            for hint in (
                "anthropic",
                "bedrock",
                "bedrock-converse",
                "aws_bedrock",
            )
        )

    @staticmethod
    def _is_google_provider(provider: str) -> bool:
        return any(
            hint in provider
            for hint in (
                "google",
                "vertex",
                "gemini",
            )
        )

    async def _iterate_stream(
        self, stream_result: CustomStreamWrapper
    ) -> AsyncIterator[ModelResponseStream]:
        async def _yield_raw_chunks() -> AsyncIterator[Any]:
            if hasattr(stream_result, "__aiter__"):
                async for chunk in stream_result:
                    yield chunk
            else:
                for chunk in stream_result:
                    yield chunk

        async for chunk in _yield_raw_chunks():
            if isinstance(chunk, ModelResponseStream):
                yield chunk
                continue
            logger.debug(
                "Skipping non-ModelResponseStream chunk from LLM stream: %s",
                type(chunk),
            )

    async def _handle_stream_chunk(
        self,
        chat_id: str,
        assistant_message: AssistantChatMessage,
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
        assistant_message: AssistantChatMessage,
        delta: Delta,
    ) -> None:
        text_deltas = self._build_text_deltas(delta, assistant_message)
        if not text_deltas:
            return
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[chat %s] streaming delta reasoning=%r thinking_blocks=%r",
                chat_id,
                getattr(delta, "reasoning_content", None),
                getattr(delta, "thinking_blocks", None),
            )
        await self.websocket_msg_handler.send_streaming_response(
            chat_id,
            MessageDeltaEvent(
                message_id=assistant_message.id,
                content=text_deltas,
            ),
        )

    def _build_text_deltas(
        self, delta: Delta, assistant_message: AssistantChatMessage
    ) -> list[MessageContentDelta]:
        deltas: list[MessageContentDelta] = []
        saw_thinking_entry = False
        for entry in self._iter_content_entries(delta):
            delta_event, is_thinking_entry = self._apply_content_entry(
                entry,
                assistant_message,
                default_kind="text",
            )
            if is_thinking_entry:
                saw_thinking_entry = True
            if delta_event:
                deltas.append(delta_event)

        if saw_thinking_entry:
            return deltas

        for entry in self._iter_reasoning_fallback_entries(delta):
            delta_event, _ = self._apply_content_entry(
                entry,
                assistant_message,
                default_kind="thinking",
            )
            if delta_event:
                deltas.append(delta_event)
        return deltas

    def _iter_content_entries(self, delta: Delta) -> Iterator[Any]:
        content = delta.content
        if content is None:
            return
        if isinstance(content, list):
            yield from content
            return
        yield content

    def _iter_reasoning_fallback_entries(self, delta: Delta) -> Iterator[Any]:
        yield from self._extract_thinking_blocks(delta)
        reasoning_content = getattr(delta, "reasoning_content", None)
        if isinstance(reasoning_content, str) and reasoning_content:
            yield reasoning_content

    def _apply_content_entry(
        self,
        entry: Any,
        assistant_message: AssistantChatMessage,
        *,
        default_kind: Literal["text", "thinking"],
    ) -> tuple[MessageContentDelta | None, bool]:
        normalized = self._normalize_content_payload(entry, default_kind=default_kind)
        if not normalized:
            return None, False

        kind, chunk, provided_index, signature = normalized
        index = self._resolve_content_index(
            provided_index,
            assistant_message,
            kind,
        )

        if kind == "thinking":
            if not chunk and signature is None:
                return None, True
            block = self._ensure_thinking_content_block(assistant_message, index)
            if chunk:
                block.thinking += chunk
            if signature is not None:
                block.signature = signature
            return (
                MessageThinkingDelta(
                    index=index,
                    thinking=chunk,
                    signature=signature,
                ),
                True,
            )

        block = self._ensure_text_content_block(assistant_message, index)
        block.text += chunk
        return MessageTextDelta(index=index, text=chunk), False

    def _normalize_content_payload(
        self,
        entry: Any,
        *,
        default_kind: Literal["text", "thinking"] = "text",
    ) -> tuple[Literal["text", "thinking"], str, Any, str | None] | None:
        if isinstance(entry, str):
            text_value = entry
            if not text_value:
                return None
            return default_kind, text_value, None, None

        payload = self._entry_to_mapping(entry)
        if payload is None:
            return None

        entry_type = payload.get("type") or default_kind
        index = payload.get("index")
        if entry_type == "thinking":
            thinking_value = payload.get("thinking")
            signature = payload.get("signature")
            return (
                "thinking",
                thinking_value if isinstance(thinking_value, str) else "",
                index,
                signature if isinstance(signature, str) else None,
            )
        if entry_type != "text":
            return None
        text_value = payload.get("text")
        if not isinstance(text_value, str) or not text_value:
            return None
        return "text", text_value, index, None

    def _entry_to_mapping(self, entry: Any) -> dict[str, Any] | None:
        if isinstance(entry, dict):
            return entry

        model_dump = getattr(entry, "model_dump", None)
        if callable(model_dump):
            try:
                data = model_dump()
            except Exception:
                logger.debug("Failed to model_dump streaming entry", exc_info=True)
            else:
                if isinstance(data, dict):
                    return data

        dict_method = getattr(entry, "dict", None)
        if callable(dict_method):
            data = dict_method()
            if isinstance(data, dict):
                return data

        payload = getattr(entry, "__dict__", None)
        if isinstance(payload, dict):
            return payload
        return None

    def _extract_thinking_blocks(self, delta: Delta) -> list[Any]:
        thinking_blocks: Any = getattr(delta, "thinking_blocks", None)
        if thinking_blocks is None:
            provider_specific_fields = getattr(delta, "provider_specific_fields", None)
            if isinstance(provider_specific_fields, dict):
                thinking_blocks = provider_specific_fields.get("thinking_blocks")
            elif provider_specific_fields is not None:
                thinking_blocks = getattr(
                    provider_specific_fields, "thinking_blocks", None
                )

        if not thinking_blocks:
            return []
        if isinstance(thinking_blocks, list):
            return list(thinking_blocks)
        return [thinking_blocks]

    async def _handle_tool_call_deltas(
        self,
        chat_id: str,
        assistant_message: AssistantChatMessage,
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
        assistant_message: AssistantChatMessage,
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
        self, assistant_message: AssistantChatMessage, index: int
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
        assistant_message: AssistantChatMessage,
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
        assistant_message: AssistantChatMessage,
    ) -> list[ToolChatMessage]:
        if not assistant_message.tool_calls:
            return []

        results: list[ToolChatMessage] = []
        for tool_call in assistant_message.tool_calls:
            result = await self._dispatch_tool_call(chat_id, tool_call)
            results.append(result)
        return results

    def _should_persist_partial_message(
        self,
        assistant_message: AssistantChatMessage,
    ) -> bool:
        for block in assistant_message.content:
            if isinstance(block, MessageTextContent):
                if block.text.strip():
                    return True
                continue
            return True
        if assistant_message.tool_calls:
            return True
        return False

    async def _dispatch_tool_call(
        self,
        chat_id: str,
        tool_call: ToolCall,
    ) -> ToolChatMessage:
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            raise ValueError(
                f"Tool call {tool_call.id} in chat {chat_id} is missing a function name"
            )
        arguments = tool_call.function.arguments or {}
        started_at = get_now_timestamp()
        try:
            call_result = await self.mcp_client.call_tool(tool_name, arguments)
        except Exception:
            logger.exception(
                "MCP tool invocation failed for chat %s (tool=%s)",
                chat_id,
                tool_name,
            )
            raise
        completed_at = get_now_timestamp()

        tool_chat_message = ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=json.loads(json.dumps(arguments)),
            content=call_result.content,
            is_error=call_result.isError,
            result=call_result.model_dump(),
            started_at=started_at,
            completed_at=completed_at,
        )
        await self.websocket_msg_handler.send_streaming_response(
            chat_id,
            ToolResultEvent(
                result=tool_chat_message,
            ),
        )
        return tool_chat_message

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
        self,
        provided_index: Any,
        assistant_message: AssistantChatMessage,
        kind: Literal["text", "thinking"],
    ) -> int:
        if isinstance(provided_index, int) and provided_index >= 0:
            return provided_index

        content = assistant_message.content
        if not content:
            return 0

        last_index = len(content) - 1
        last_block = content[last_index]

        # Keep extending the current block when the provider keeps streaming the
        # same content type; otherwise append and hand back a fresh slot.
        if kind == "thinking" and isinstance(last_block, MessageThinkingContent):
            return last_index
        if kind == "text" and isinstance(last_block, MessageTextContent):
            return last_index

        return len(content)

    def _ensure_text_content_block(
        self,
        assistant_message: AssistantChatMessage,
        index: int,
    ) -> MessageTextContent:
        while len(assistant_message.content) <= index:
            assistant_message.content.append(MessageTextContent(type="text", text=""))
        block = assistant_message.content[index]
        if not isinstance(block, MessageTextContent):
            block = MessageTextContent(type="text", text="")
            assistant_message.content[index] = block
        return block

    def _ensure_thinking_content_block(
        self,
        assistant_message: AssistantChatMessage,
        index: int,
    ) -> MessageThinkingContent:
        while len(assistant_message.content) <= index:
            assistant_message.content.append(MessageThinkingContent())
        block = assistant_message.content[index]
        if not isinstance(block, MessageThinkingContent):
            block = MessageThinkingContent()
            assistant_message.content[index] = block
        return block
