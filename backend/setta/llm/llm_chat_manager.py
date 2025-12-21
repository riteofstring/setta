import asyncio
import copy
import json
import logging
import re
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Iterator, Literal, cast

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.llms.openai import ChatCompletionToolParam
from litellm.types.utils import ChatCompletionDeltaToolCall, Delta, ModelResponseStream
from litellm.utils import supports_prompt_caching
from mcp.types import CallToolResult, TextContent

from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
from setta.llm.config import AllLLMConfigs, merge_chat_llm_configs
from setta.logging.tasks import spawn_background_task
from setta.mcp.client import MCPClient
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    AIFollowToolResultMetadata,
    FollowIdType,
)
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_existing_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    create_new_chat,
    save_messages,
)
from setta.project_state.chats.save import (
    delete_chat as delete_chat_record,
)
from setta.types.chat import APIKeys, Chat
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
    SystemChatMessage,
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
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.websocket import AIFollowToolArgumentsUpdateContent
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"
STREAM_STRING_VALUE_RE = re.compile(r'"([^"]+)"')
STREAM_OBJECT_KEY_RE = re.compile(r'"([^"]+)"\s*:')


@dataclass
class ToolCallStreamState:
    argument_buffers: dict[int, str] = field(default_factory=dict)


@dataclass
class AIFollowState:
    project_config_id: ID
    ids_by_type: dict[FollowIdType, list[ID]]


@dataclass
class StreamingSession:
    assistant_message: AssistantChatMessage
    stream: CustomStreamWrapper | None = None
    started_at: float = field(default_factory=time.time)


@dataclass
class StreamContentEntry:
    kind: Literal["text", "thinking"]
    text: str
    index: int | None
    signature: str | None = None

    @property
    def has_payload(self) -> bool:
        if self.kind == "text":
            return bool(self.text)
        return bool(self.text) or self.signature is not None


@dataclass
class ChatToolState:
    init_tools: dict[str, ChatCompletionToolParam] = field(default_factory=dict)
    unlocked_tools: dict[str, ChatCompletionToolParam] = field(default_factory=dict)

    def unlock_tools(
        self,
        definitions: Mapping[str, ChatCompletionToolParam],
    ) -> list[str]:
        """Merge newly discovered tools into the chat-local registry."""

        added: list[str] = []
        for name, payload in definitions.items():
            if name not in self.unlocked_tools:
                added.append(name)
            self.unlocked_tools[name] = payload
        return added

    def build_payload(self) -> list[ChatCompletionToolParam]:
        combined: dict[str, ChatCompletionToolParam] = {}
        combined.update(self.init_tools)
        combined.update(self.unlocked_tools)
        return list(combined.values())


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
        self._chat_tool_states: dict[str, ChatToolState] = {}
        self._ai_follow_state: dict[ID, AIFollowState] = {}
        self.system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()

    def get_chat(self, chat_id: ID) -> Chat | None:
        return load_chat(self.dbe, chat_id)

    def update_config(self, config: AllLLMConfigs) -> None:
        self.config = self._hydrate_config(config)
        self._sync_api_keys()

    def update_api_keys(self, payload: APIKeys) -> None:
        self._raw_env_vars = dict(payload)
        self._sync_api_keys()

    def get_or_create_chat(
        self,
        chat_id: ID | None,
        message: BaseChatMessageUnion,
        llm_config_id: str,
        project_config_id: ID,
    ) -> Chat:
        if chat_id:
            chat = load_chat(self.dbe, chat_id)
            if chat:
                updated = save_messages(self.dbe, chat.id, [message])
                return updated or chat
        llm_config = self.config.resolve_config(llm_config_id)
        return create_new_chat(
            self.dbe,
            message,
            llm_config,
            project_config_id=project_config_id,
        )

    def get_all_chat_metadata(self):
        return load_all_chat_metadata(self.dbe)

    def delete_chat(self, chat_id: ID) -> None:
        delete_chat_record(self.dbe, chat_id)
        self._chat_tool_states.pop(chat_id, None)
        self._ai_follow_state.pop(chat_id, None)

    def get_ai_follow_snapshot(
        self, project_config_id: ID
    ) -> list[AIFollowToolArgumentsUpdateContent]:
        snapshot: list[AIFollowToolArgumentsUpdateContent] = []
        for chat_id, state in self._ai_follow_state.items():
            if state.project_config_id != project_config_id:
                continue
            ids_by_type = self._normalize_ai_follow_ids_by_type(state.ids_by_type)
            if not ids_by_type:
                continue
            snapshot.append(
                AIFollowToolArgumentsUpdateContent(
                    projectConfigId=project_config_id,
                    chatId=chat_id,
                    idsByType=ids_by_type,
                )
            )
        return snapshot

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
        project_config_id = (
            str(chat.projectConfigId) if chat.projectConfigId is not None else None
        )
        task = spawn_background_task(
            self.process_query(chat, deepThink),
            label="llm-chat-stream",
            project_config_id=project_config_id,
            extra_values={"chat_id": str(chat.id)},
            name=f"llm-chat-{chat.id}",
        )

        def _cleanup(_task: asyncio.Task[Any], chat_id: ID) -> None:
            self._tasks.pop(chat_id, None)

        task.add_done_callback(lambda t, chat_id=chat.id: _cleanup(t, chat_id))
        self._tasks[chat.id] = task

    async def process_query(self, chat: Chat, deepThink: bool):
        while True:
            payload = self._build_llm_request_payload(chat, deepThink)

            assistant_message = AssistantChatMessage(
                content=[],
            )
            tool_call_state = ToolCallStreamState()
            session = StreamingSession(assistant_message=assistant_message)
            self._sessions[chat.id] = session

            stop_event_sent = False
            tool_results: list[ToolChatMessage] = []
            saved_chat: Chat | None = None
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
                    await self._handle_stream_chunk(
                        chat.id,
                        assistant_message,
                        chunk,
                        tool_call_state,
                        chat.projectConfigId,
                    )

                await self.websocket_msg_handler.send_streaming_response(
                    chat.id,
                    MessageStopEvent(message_id=assistant_message.id),
                )
                stop_event_sent = True
                await self._finalize_tool_calls(
                    assistant_message,
                    tool_call_state,
                    chat.id,
                    chat.projectConfigId,
                )
                tool_results = await self._run_tool_calls(chat, assistant_message)
                if assistant_message.tool_calls:
                    await self._update_and_broadcast_ai_follow_update(
                        chat.projectConfigId,
                        chat.id,
                        {},
                    )
                new_messages: list[BaseChatMessageUnion] = [assistant_message]
                if tool_results:
                    new_messages.extend(tool_results)
                    logger.debug(
                        "Executed %s MCP tool calls for chat %s",
                        len(tool_results),
                        chat.id,
                    )
                saved_chat = save_messages(self.dbe, chat.id, new_messages)

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
                    await self._finalize_tool_calls(
                        assistant_message,
                        tool_call_state,
                        chat.id,
                        chat.projectConfigId,
                    )
                    save_messages(self.dbe, chat.id, [assistant_message])
                    await self.websocket_msg_handler.send_streaming_response(
                        chat.id,
                        MessageFinalizedEvent(message=assistant_message),
                    )
                await self._update_and_broadcast_ai_follow_update(
                    chat.projectConfigId,
                    chat.id,
                    {},
                )
                raise
            except Exception as exc:
                if not stop_event_sent:
                    await self.websocket_msg_handler.send_streaming_response(
                        chat.id,
                        MessageStopEvent(message_id=assistant_message.id),
                    )
                    stop_event_sent = True
                await self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                    exc,
                    label="llm-chat-stream",
                    message="LLM streaming failed; aborting response",
                    severity=SettaBackendLogEventSeverity.error,
                    project_config_id=chat.projectConfigId,
                    logger=logger,
                    context={"chat_id": str(chat.id)},
                )
                await self._update_and_broadcast_ai_follow_update(
                    chat.projectConfigId,
                    chat.id,
                    {},
                )
                return
            finally:
                self._sessions.pop(chat.id, None)

            if saved_chat:
                chat = saved_chat

            should_continue = bool(assistant_message.tool_calls) and bool(tool_results)
            if not should_continue:
                if (
                    assistant_message.tool_calls
                    and not tool_results
                    and logger.isEnabledFor(logging.WARNING)
                ):
                    logger.warning(
                        "Assistant requested tools but none executed for chat %s",
                        chat.id,
                    )
                break

    async def request_stop_streaming(self, chat_id: ID) -> None:
        task = self._tasks.get(chat_id)
        if not task:
            logger.info("Stop requested for chat %s but no active task exists", chat_id)
            return
        task.cancel()
        self._tasks.pop(chat_id, None)

    def is_waiting_for_response(self, chat_id: ID) -> bool:
        return chat_id in self._sessions

    def get_current_stream(self, chat_id: ID) -> list[BaseChatMessageUnion]:
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
        system_message = SystemChatMessage(
            content=[MessageTextContent(text=self._build_system_prompt(chat))],
        ).to_openai_format()
        messages: list[dict[str, Any]] = [system_message]
        for message in chat.messages:
            payload = message.to_openai_format()
            messages.append(payload)
        request, api_key_env = self.config.build_llm_params(chat.llmConfig)
        if api_key_env:
            api_key = self.api_keys.get(api_key_env)
            if api_key:
                request["api_key"] = api_key

        request["messages"] = messages
        self._maybe_apply_cache_prompting(request, messages)
        tools = self._build_tool_definitions(chat)
        if tools:
            request["tools"] = tools

        self._apply_request_overrides(request, deep_think)

        if not request["model"]:
            raise ValueError("LLM config must specify a model via config or override")

        return request

    def _build_system_prompt(self, chat: Chat) -> str:
        project_config_id = chat.projectConfigId
        temporary_project_config_id = self._get_temporary_project_config_id(
            project_config_id
        )
        return (
            f"{self.system_prompt}\n\n"
            "## Active project config\n"
            f"- id: {temporary_project_config_id}"
        )

    def _get_temporary_project_config_id(self, project_config_id: ID) -> ID:
        temporary_to_canonical, canonical_to_temporary = (
            self.dbe.read_temporary_id_map()
        )
        should_write = project_config_id not in canonical_to_temporary
        temporary_project_config_id = convert_canonical_ids_to_temporary(
            project_config_id,
            canonical_to_temporary,
            temporary_to_canonical,
        )
        if should_write:
            self.dbe.write_temporary_id_map(canonical_to_temporary)
        return temporary_project_config_id

    def _build_tool_definitions(self, chat: Chat) -> list[ChatCompletionToolParam]:
        state = self._get_or_create_chat_tool_state(chat.id)
        if not state.init_tools and self.mcp_client.init_tool_definitions:
            state.init_tools = dict(self.mcp_client.init_tool_definitions)
        return state.build_payload()

    def _maybe_apply_cache_prompting(
        self,
        request: dict[str, Any],
        messages: list[dict[str, Any]],
    ) -> None:
        if request.get("cache_control_injection_points"):
            return
        if not messages:
            return

        model = request.get("model")
        if not model:
            return
        provider = request.get("custom_llm_provider")

        try:
            supports_cache = supports_prompt_caching(
                model=model,
                custom_llm_provider=provider,
            )
        except Exception:
            logger.debug(
                "[cache-prompting] failed to resolve support for model=%s provider=%s",
                model,
                provider,
                exc_info=True,
            )
            return

        if not supports_cache:
            return

        request["cache_control_injection_points"] = [
            {"location": "message", "role": "system"},
            {
                "location": "message",
                "index": -1,
            },
        ]

        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[cache-prompting] enabling cache injection for model=%s provider=%s points=%s",
                model,
                provider,
                request["cache_control_injection_points"],
            )

    def _get_or_create_chat_tool_state(
        self,
        chat_id: ID,
    ) -> ChatToolState:
        state = self._chat_tool_states.get(chat_id)
        if state is None:
            state = ChatToolState(
                init_tools=dict(self.mcp_client.init_tool_definitions)
            )
            self._chat_tool_states[chat_id] = state
        return state

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
        chat_id: ID,
        assistant_message: AssistantChatMessage,
        chunk: ModelResponseStream,
        tool_call_state: ToolCallStreamState,
        project_config_id: ID,
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
            project_config_id,
        )

    async def _handle_text_deltas(
        self,
        chat_id: ID,
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
        entries = self._collect_stream_entries(delta)
        if not entries:
            return []

        deltas: list[MessageContentDelta] = []
        for entry in entries:
            index = self._resolve_content_index(
                entry.index,
                assistant_message,
                entry.kind,
            )

            if entry.kind == "thinking":
                block = self._ensure_thinking_content_block(assistant_message, index)
                if entry.text:
                    block.thinking += entry.text
                if entry.signature is not None:
                    block.signature = entry.signature
                if entry.has_payload:
                    deltas.append(
                        MessageThinkingDelta(
                            index=index,
                            thinking=entry.text,
                            signature=entry.signature,
                        )
                    )
                continue

            block = self._ensure_text_content_block(assistant_message, index)
            block.text += entry.text
            deltas.append(MessageTextDelta(index=index, text=entry.text))
        return deltas

    def _collect_stream_entries(self, delta: Delta) -> list[StreamContentEntry]:
        primary_entries, has_thinking_payload = self._normalize_primary_entries(delta)
        if has_thinking_payload:
            return primary_entries

        fallback_entries = self._collect_fallback_entries(delta)
        if not fallback_entries:
            return primary_entries
        fallback_entries.extend(primary_entries)
        return fallback_entries

    def _normalize_primary_entries(
        self, delta: Delta
    ) -> tuple[list[StreamContentEntry], bool]:
        entries: list[StreamContentEntry] = []
        has_thinking_payload = False
        for entry in self._iter_normalized_entries(delta.content, default_kind="text"):
            entries.append(entry)
            if entry.kind == "thinking" and entry.has_payload:
                has_thinking_payload = True
        return entries, has_thinking_payload

    def _collect_fallback_entries(self, delta: Delta) -> list[StreamContentEntry]:
        entries: list[StreamContentEntry] = []
        has_thinking_entries = False
        for block in self._iter_thinking_payloads(delta):
            normalized = self._normalize_entry(block, default_kind="thinking")
            if normalized and normalized.has_payload:
                entries.append(normalized)
                has_thinking_entries = True

        if has_thinking_entries:
            return entries

        reasoning_content = getattr(delta, "reasoning_content", None)
        if isinstance(reasoning_content, str) and reasoning_content:
            entries.append(
                StreamContentEntry(
                    kind="thinking",
                    text=reasoning_content,
                    index=None,
                    signature=None,
                )
            )
        return entries

    def _iter_normalized_entries(
        self,
        payload: Any,
        *,
        default_kind: Literal["text", "thinking"],
    ) -> Iterator[StreamContentEntry]:
        if payload is None:
            return

        raw_entries = payload if isinstance(payload, list) else [payload]
        for raw_entry in raw_entries:
            normalized = self._normalize_entry(raw_entry, default_kind=default_kind)
            if normalized:
                yield normalized

    def _normalize_entry(
        self,
        raw_entry: Any,
        *,
        default_kind: Literal["text", "thinking"],
    ) -> StreamContentEntry | None:
        if isinstance(raw_entry, str):
            if not raw_entry:
                return None
            return StreamContentEntry(kind=default_kind, text=raw_entry, index=None)

        payload = self._coerce_stream_payload(raw_entry)
        if payload is None:
            return None

        entry_type = payload.get("type") or default_kind
        index = payload.get("index")
        if entry_type == "thinking":
            thinking_value = payload.get("thinking")
            signature = payload.get("signature")
            return StreamContentEntry(
                kind="thinking",
                text=thinking_value if isinstance(thinking_value, str) else "",
                index=index,
                signature=signature if isinstance(signature, str) else None,
            )
        if entry_type != "text":
            return None

        text_value = payload.get("text")
        if not isinstance(text_value, str) or not text_value:
            return None
        return StreamContentEntry(kind="text", text=text_value, index=index)

    def _coerce_stream_payload(self, entry: Any) -> Mapping[str, Any] | None:
        if isinstance(entry, Mapping):
            return entry

        model_dump = getattr(entry, "model_dump", None)
        if callable(model_dump):
            try:
                data = model_dump()
            except Exception:
                logger.debug("Failed to model_dump streaming entry", exc_info=True)
            else:
                if isinstance(data, Mapping):
                    return data

        dict_method = getattr(entry, "dict", None)
        if callable(dict_method):
            data = dict_method()
            if isinstance(data, Mapping):
                return data

        payload = getattr(entry, "__dict__", None)
        if isinstance(payload, Mapping):
            return payload
        return None

    def _iter_thinking_payloads(self, delta: Delta) -> Iterator[Any]:
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
            return
        if isinstance(thinking_blocks, list):
            for block in thinking_blocks:
                yield block
            return
        yield thinking_blocks

    async def _handle_tool_call_deltas(
        self,
        chat_id: ID,
        assistant_message: AssistantChatMessage,
        delta: Delta,
        tool_call_state: ToolCallStreamState,
        project_config_id: ID,
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
            await self._maybe_broadcast_streaming_follow_update(
                project_config_id,
                chat_id,
                assistant_message,
                tool_call_state,
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

        tool_name = tool_call.function.name.strip() or None

        return ToolCallDeltaEvent(
            message_id=assistant_message.id,
            tool_call_id=tool_call.id,
            arguments_delta=entry.function.arguments,
            tool_name=tool_name,
        )

    async def _maybe_broadcast_streaming_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        assistant_message: AssistantChatMessage,
        tool_call_state: ToolCallStreamState,
    ) -> None:
        ids_by_type = self._extract_stream_ids_by_type_from_buffers(
            assistant_message,
            tool_call_state,
        )
        canonical_ids_by_type = self._canonicalize_ai_follow_ids_by_type(
            ids_by_type,
            filter_to_known=True,
        )
        if canonical_ids_by_type is None:
            return
        await self._update_and_broadcast_ai_follow_update(
            project_config_id,
            chat_id,
            canonical_ids_by_type,
        )

    def _extract_stream_ids_by_type_from_buffers(
        self,
        assistant_message: AssistantChatMessage,
        tool_call_state: ToolCallStreamState,
    ) -> dict[FollowIdType, list[ID]]:
        combined: dict[FollowIdType, set[ID]] = {}
        tool_calls = assistant_message.tool_calls or []
        for index, buffer in tool_call_state.argument_buffers.items():
            if not buffer:
                continue
            tool_name = (
                tool_calls[index].function.name.strip()
                if index < len(tool_calls)
                else ""
            )
            if not tool_name:
                continue
            buffer_ids_by_type = self._extract_stream_ids_by_type_from_buffer(
                buffer,
                tool_name,
            )
            for id_type, ids in buffer_ids_by_type.items():
                combined.setdefault(id_type, set()).update(ids)
        return {id_type: list(ids) for id_type, ids in combined.items() if ids}

    def _extract_stream_ids_by_type_from_buffer(
        self,
        buffer: str,
        tool_name: str,
    ) -> dict[FollowIdType, set[ID]]:
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolArguments:
            return {}
        metadata = annotations.aiFollowToolArguments
        keys_by_type: dict[FollowIdType, set[str]] = {}
        for id_type, paths in metadata.pathsByIdType.items():
            for path in paths:
                if path == "$":
                    continue
                segments = [segment for segment in path.split(".") if segment]
                if not segments:
                    continue
                keys_by_type.setdefault(id_type, set()).add(segments[-1])
        if not keys_by_type:
            return {}
        combined: dict[FollowIdType, set[ID]] = {}
        for id_type, keys in keys_by_type.items():
            for key in keys:
                single_re, list_re, object_re = self._build_stream_id_regexes(key)
                for match in single_re.finditer(buffer):
                    value = match.group(1)
                    if value:
                        combined.setdefault(id_type, set()).add(ID(value))
                for match in list_re.finditer(buffer):
                    values = match.group(1)
                    for value in STREAM_STRING_VALUE_RE.findall(values):
                        if value:
                            combined.setdefault(id_type, set()).add(ID(value))
                for match in object_re.finditer(buffer):
                    values = match.group(1)
                    for value in STREAM_OBJECT_KEY_RE.findall(values):
                        if value:
                            combined.setdefault(id_type, set()).add(ID(value))
        return combined

    @staticmethod
    def _build_stream_id_regexes(
        key: str,
    ) -> tuple[re.Pattern[str], re.Pattern[str], re.Pattern[str]]:
        escaped = re.escape(key)
        single_re = re.compile(r'"%s"\s*:\s*"([^"]+)"' % escaped)
        list_re = re.compile(r'"%s"\s*:\s*\[([^\]]*)' % escaped)
        object_re = re.compile(r'"%s"\s*:\s*\{([^}]*)' % escaped)
        return single_re, list_re, object_re

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

    async def _finalize_tool_calls(
        self,
        assistant_message: AssistantChatMessage,
        tool_call_state: ToolCallStreamState,
        chat_id: ID,
        project_config_id: ID,
    ) -> None:
        if not assistant_message.tool_calls:
            return
        parsed_tool_calls: list[ToolCall] = []
        for index, tool_call in enumerate(assistant_message.tool_calls):
            raw_arguments = tool_call_state.argument_buffers.get(index)
            if not raw_arguments:
                continue
            tool_call.function.arguments = self._parse_tool_call_arguments(
                raw_arguments, tool_call.id
            )
            parsed_tool_calls.append(tool_call)
        await self._broadcast_ai_follow_update(
            project_config_id,
            chat_id,
            parsed_tool_calls,
        )

    async def _run_tool_calls(
        self,
        chat: Chat,
        assistant_message: AssistantChatMessage,
    ) -> list[ToolChatMessage]:
        if not assistant_message.tool_calls:
            return []

        results: list[ToolChatMessage] = []
        for tool_call in assistant_message.tool_calls:
            result = await self._dispatch_tool_call(chat, tool_call)
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
        chat: Chat,
        tool_call: ToolCall,
    ) -> ToolChatMessage:
        chat_id = chat.id
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            raise ValueError(
                f"Tool call {tool_call.id} in chat {chat_id} is missing a function name"
            )
        arguments = dict(tool_call.function.arguments or {})
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

        sanitized_arguments = self._sanitize_tool_arguments(arguments)
        if tool_name == C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME and not call_result.isError:
            tool_chat_message = self._build_search_tool_chat_message(
                chat_id,
                tool_name,
                tool_call,
                call_result,
                sanitized_arguments,
                started_at,
                completed_at,
            )
        else:
            tool_chat_message = ToolChatMessage(
                tool_call_id=tool_call.id,
                tool_name=tool_name,
                arguments=sanitized_arguments,
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
        await self._maybe_broadcast_ai_follow_tool_result_update(
            tool_name,
            call_result,
            chat.projectConfigId,
            chat_id,
        )
        return tool_chat_message

    def _sanitize_tool_arguments(self, arguments: dict[str, Any]) -> dict[str, Any]:
        _, canonical_to_temporary = self.dbe.read_temporary_id_map()
        cloned = copy.deepcopy(arguments)
        converted = convert_existing_canonical_ids_to_temporary(
            cloned,
            canonical_to_temporary,
        )
        return json.loads(json.dumps(converted))

    def _build_search_tool_chat_message(
        self,
        chat_id: ID,
        tool_name: str,
        tool_call: ToolCall,
        call_result: CallToolResult,
        arguments: dict[str, Any],
        started_at,
        completed_at,
    ) -> ToolChatMessage:
        search_results = self._parse_search_tool_results(call_result)
        definitions = self._build_tool_definitions_from_search_results(search_results)
        added_tool_names: list[str] = []
        if definitions:
            state = self._get_or_create_chat_tool_state(chat_id)
            added_tool_names = state.unlock_tools(definitions)
        added_count = len(added_tool_names)

        summary_text = (
            "Search did not return any MCP tools."
            if not search_results
            else self._format_search_tool_summary(added_tool_names)
        )
        result_payload = call_result.model_dump()
        result_payload["searchResults"] = search_results
        result_payload["addedToolCount"] = added_count
        result_payload["addedToolNames"] = added_tool_names

        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[chat %s] search tool added %s new tools: %s",
                chat_id,
                added_count,
                added_tool_names,
            )

        return ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=arguments,
            content=[TextContent(type="text", text=summary_text)],
            is_error=call_result.isError,
            result=result_payload,
            started_at=started_at,
            completed_at=completed_at,
        )

    def _parse_search_tool_results(self, call_result: CallToolResult) -> list[str]:
        entry = call_result.content[0] if call_result.content else None
        if not isinstance(entry, TextContent):
            return []

        text = (entry.text or "").strip()
        if not text:
            return []

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            logger.debug("Failed to parse search tool payload", exc_info=True)
            return []

        return payload if isinstance(payload, list) else []

    def _build_tool_definitions_from_search_results(
        self,
        tool_names: list[str],
    ) -> dict[str, ChatCompletionToolParam]:
        definitions: dict[str, ChatCompletionToolParam] = {}
        available = self.mcp_client.discoverable_tool_definitions
        for name in tool_names:
            definition = available.get(name)
            if not definition:
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(
                        "Search tool returned unknown definition '%s'",
                        name,
                    )
                continue
            definitions[name] = definition
        return definitions

    @staticmethod
    def _format_search_tool_summary(
        added_tool_names: list[str],
    ) -> str:
        if not added_tool_names:
            return "All matching MCP tools were already available."
        if len(added_tool_names) == 1:
            return f"Added MCP tool: {added_tool_names[0]}"
        tool_list = ", ".join(added_tool_names)
        return f"Added MCP tools: {tool_list}"

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

    def _select_values_by_path(self, payload: Any, path: str) -> list[Any]:
        if path == "$":
            return [payload]
        segments = [segment for segment in path.split(".") if segment]
        current: list[Any] = [payload]
        for segment in segments:
            key = segment
            next_values: list[Any] = []
            for item in current:
                if not isinstance(item, dict):
                    continue
                if key not in item:
                    continue
                value = item[key]
                next_values.append(value)
            current = next_values
            if not current:
                break
        return current

    def _collect_ai_follow_ids_from_paths(
        self,
        payload: Any,
        paths_by_id_type: dict[FollowIdType, list[str]],
        *,
        allow_dict_keys: bool,
    ) -> tuple[dict[FollowIdType, set[ID]], set[FollowIdType]]:
        ids_by_type: dict[FollowIdType, set[ID]] = {}
        found_types: set[FollowIdType] = set()
        for id_type, paths in paths_by_id_type.items():
            for path in paths:
                values = self._select_values_by_path(payload, path)
                for value in values:
                    ids = self._coerce_id_list(value)
                    if ids is None and allow_dict_keys and isinstance(value, dict):
                        dict_keys = [
                            key for key in value.keys() if isinstance(key, str)
                        ]
                        ids = self._coerce_id_list(dict_keys)
                    if ids is None:
                        continue
                    found_types.add(id_type)
                    if ids:
                        ids_by_type.setdefault(id_type, set()).update(ids)
        return ids_by_type, found_types

    def _extract_ai_follow_tool_result_ids(
        self,
        payload: Any,
        metadata: AIFollowToolResultMetadata,
    ) -> dict[FollowIdType, list[ID]]:
        ids_by_type, _ = self._collect_ai_follow_ids_from_paths(
            payload,
            metadata.pathsByIdType,
            allow_dict_keys=False,
        )
        return {id_type: list(ids) for id_type, ids in ids_by_type.items()}

    def _extract_ai_follow_tool_argument_ids(
        self,
        arguments: dict[str, Any],
        metadata: AIFollowToolArgumentsMetadata,
    ) -> dict[FollowIdType, list[ID]] | None:
        ids_by_type, found_types = self._collect_ai_follow_ids_from_paths(
            arguments,
            metadata.pathsByIdType,
            allow_dict_keys=True,
        )
        if not found_types:
            return None
        return {
            id_type: list(ids_by_type.get(id_type, set())) for id_type in found_types
        }

    def _canonicalize_ai_follow_ids_by_type(
        self,
        ids_by_type: dict[FollowIdType, list[ID]],
        *,
        filter_to_known: bool,
    ) -> dict[FollowIdType, list[ID]] | None:
        if not ids_by_type:
            return None
        temporary_to_canonical, _ = self.dbe.read_temporary_id_map()
        if not filter_to_known:
            return convert_temporary_ids_to_canonical(
                ids_by_type,
                temporary_to_canonical,
            )
        filtered: dict[FollowIdType, list[ID]] = {}
        for id_type, ids in ids_by_type.items():
            resolved = [entry for entry in ids if entry in temporary_to_canonical]
            if resolved:
                filtered[id_type] = resolved
        if not filtered:
            return None
        return convert_temporary_ids_to_canonical(
            filtered,
            temporary_to_canonical,
        )

    def _build_ai_follow_tool_result_update(
        self,
        tool_name: str,
        call_result: CallToolResult,
    ) -> dict[FollowIdType, list[ID]] | None:
        if call_result.isError:
            return None
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolResult:
            return None
        metadata = annotations.aiFollowToolResult
        text_entry = cast("TextContent", call_result.content[0])
        text = (text_entry.text or "").strip()
        payload: Any
        if all(
            path == "$" for paths in metadata.pathsByIdType.values() for path in paths
        ):
            payload = text
        else:
            payload = json.loads(text)
        ids_by_type = self._extract_ai_follow_tool_result_ids(payload, metadata)
        if not ids_by_type:
            return None
        return self._canonicalize_ai_follow_ids_by_type(
            ids_by_type,
            filter_to_known=False,
        )

    async def _maybe_broadcast_ai_follow_tool_result_update(
        self,
        tool_name: str,
        call_result: CallToolResult,
        project_config_id: ID,
        chat_id: ID,
    ) -> None:
        canonical_ids_by_type = self._build_ai_follow_tool_result_update(
            tool_name,
            call_result,
        )
        if canonical_ids_by_type is None:
            return
        await self.websocket_msg_handler.broadcast_ai_follow_tool_result_update(
            project_config_id,
            chat_id,
            canonical_ids_by_type,
        )

    async def _broadcast_ai_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        tool_calls: list[ToolCall],
    ) -> None:
        ids_by_type = self._collect_ai_follow_ids_by_type_from_tool_calls(tool_calls)
        if ids_by_type is None:
            return
        canonical_ids_by_type = self._canonicalize_ai_follow_ids_by_type(
            ids_by_type,
            filter_to_known=False,
        )
        if canonical_ids_by_type is None:
            return
        await self._update_and_broadcast_ai_follow_update(
            project_config_id,
            chat_id,
            canonical_ids_by_type,
        )

    def _normalize_ai_follow_ids_by_type(
        self, ids_by_type: dict[FollowIdType, list[ID]]
    ) -> dict[FollowIdType, list[ID]]:
        normalized: dict[FollowIdType, list[ID]] = {}
        for id_type, ids in ids_by_type.items():
            if not ids:
                continue
            normalized[id_type] = list(dict.fromkeys(ids))
        return normalized

    def _ids_by_type_to_sets(
        self, ids_by_type: dict[FollowIdType, list[ID]]
    ) -> dict[FollowIdType, set[ID]]:
        return {id_type: set(ids) for id_type, ids in ids_by_type.items() if ids}

    def _ai_follow_state_matches(
        self,
        chat_id: ID,
        project_config_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> bool:
        if chat_id not in self._ai_follow_state:
            return False
        state = self._ai_follow_state[chat_id]
        if state.project_config_id != project_config_id:
            return False
        return self._ids_by_type_to_sets(
            state.ids_by_type
        ) == self._ids_by_type_to_sets(ids_by_type)

    async def _update_and_broadcast_ai_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> None:
        normalized_ids_by_type = self._normalize_ai_follow_ids_by_type(ids_by_type)
        if self._ai_follow_state_matches(
            chat_id,
            project_config_id,
            normalized_ids_by_type,
        ):
            logger.debug("Skipping AI follow update for chat %s; no changes", chat_id)
            return
        payload_ids_by_type = dict(normalized_ids_by_type)
        self._ai_follow_state[chat_id] = AIFollowState(
            project_config_id=project_config_id,
            ids_by_type=payload_ids_by_type,
        )
        logger.debug(
            "Broadcasting AI follow update for chat %s (ids_by_type=%s)",
            chat_id,
            payload_ids_by_type,
        )
        await self.websocket_msg_handler.broadcast_ai_follow_tool_arguments_update(
            project_config_id,
            chat_id,
            payload_ids_by_type,
        )

    def _collect_ai_follow_ids_by_type_from_tool_calls(
        self,
        tool_calls: list[ToolCall],
    ) -> dict[FollowIdType, list[ID]] | None:
        if not tool_calls:
            return None
        combined: dict[FollowIdType, set[ID]] = {}
        found_any = False
        for tool_call in tool_calls:
            tool_name = tool_call.function.name.strip()
            if not tool_name:
                continue
            arguments = tool_call.function.arguments or {}
            ids_by_type = self._extract_ai_follow_ids_by_type_for_tool(
                tool_name,
                arguments,
            )
            if ids_by_type is None:
                continue
            found_any = True
            for id_type, ids in ids_by_type.items():
                combined.setdefault(id_type, set()).update(ids)
        if not found_any:
            return None
        return {id_type: list(ids) for id_type, ids in combined.items()}

    def _extract_ai_follow_ids_by_type_for_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[FollowIdType, list[ID]] | None:
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolArguments:
            return None
        return self._extract_ai_follow_tool_argument_ids(
            arguments,
            annotations.aiFollowToolArguments,
        )

    def _coerce_id_list(self, raw_value: Any) -> list[ID] | None:
        if isinstance(raw_value, list):
            return [
                ID(value) for value in raw_value if isinstance(value, str) and value
            ]
        if isinstance(raw_value, str):
            return [ID(raw_value)] if raw_value else []
        return None

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
