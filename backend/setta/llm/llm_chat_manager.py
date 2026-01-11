import asyncio
import copy
import json
import logging
import string
import time
from collections.abc import Mapping
from dataclasses import asdict, dataclass, field, is_dataclass
from enum import Enum
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Any,
    AsyncIterator,
    Iterator,
    Literal,
    TypeVar,
    cast,
)

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.llms.openai import ChatCompletionToolParam
from litellm.types.utils import ChatCompletionDeltaToolCall, Delta, ModelResponseStream
from litellm.utils import supports_prompt_caching
from mcp.types import CallToolResult, TextContent
from pydantic import BaseModel

from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
from setta.llm.chat_store import ChatStore, DBEChatStore
from setta.llm.config import AllLLMConfigs, merge_chat_llm_configs
from setta.logging.tasks import spawn_background_task
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import (
    SETTA_MCP_SERVER_ID,
    build_namespaced_tool_name,
    split_namespaced_tool_name,
)
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    AIFollowToolResultMetadata,
    FollowIdType,
    ToolArgumentPreviewIdType,
    ToolArgumentPreviewMetadata,
)
from setta.mcp.tool_search_index import (
    ToolSearchIndex,
    build_tool_search_entries_from_llm_definitions,
)
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_existing_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.project_state.project_manager_types import (
    GetLatestProjectStateSummaryRequest,
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
    ToolReferenceContent,
)
from setta.types.chat_stream_events import (
    MessageContentDelta,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    MessageThinkingDelta,
    ToolArgumentPreviewDeltaEvent,
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

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.types.llm_config import LLMConfig
logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"


@dataclass
class ToolCallStreamState:
    argument_buffers: dict[int, str] = field(default_factory=dict)
    preview_values_by_index: dict[int, str] = field(default_factory=dict)
    preview_target_ids_by_index: dict[
        int, dict[ToolArgumentPreviewIdType, list[ID]]
    ] = field(default_factory=dict)


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


_ToolIdType = TypeVar("_ToolIdType", bound=str)


@dataclass
class _JsonContainerState:
    kind: Literal["object", "array"]
    value_owner_key: str | None
    object_key_owner: str | None = None
    expecting_key: bool = False
    expecting_value: bool = False
    pending_key: str | None = None


@dataclass
class _PartialJsonStringToken:
    value: str
    kind: Literal["key", "value"]
    owner_key: str | None
    is_complete: bool


@dataclass
class LLMChatManager:
    """Coordinates chat persistence, streaming responses, and tool execution."""

    def __init__(
        self,
        dbe: DBE,
        mcp_client: MultiMCPClient,
        websocket_msg_handler: WMHFrontendSender,
        project_manager_switcher: "ProjectManagerSwitcher | None" = None,
        chat_store: ChatStore | None = None,
        *,
        share_session_id: str | None = None,
    ) -> None:
        self.dbe = dbe
        self.chat_store = chat_store or DBEChatStore(dbe)
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.project_manager_switcher = project_manager_switcher
        self.share_session_id = share_session_id
        self.config: AllLLMConfigs = self._hydrate_config(AllLLMConfigs())
        self.api_keys: APIKeys = {}
        self._raw_env_vars: APIKeys = {}
        self._sessions: dict[str, StreamingSession] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._ai_follow_state: dict[ID, AIFollowState] = {}
        self._chat_prompt_cache: dict[ID, str] = {}
        self._search_tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID, C.SEARCH_AND_UNLOCK_MCP_TOOLS_NAME
        )
        self.system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()

    def get_chat(self, chat_id: ID) -> Chat | None:
        return self.chat_store.get_chat(chat_id)

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
            chat = self.chat_store.get_chat(chat_id)
            if chat:
                updated = self.chat_store.save_messages(chat.id, [message])
                return updated or chat
        llm_config = self.config.resolve_config(llm_config_id)
        return self.chat_store.create_new_chat(
            message,
            llm_config,
            project_config_id=project_config_id,
        )

    def get_all_chat_metadata(self):
        return self.chat_store.get_all_chat_metadata()

    def delete_chat(self, chat_id: ID) -> None:
        self.chat_store.delete_chat(chat_id)
        self._ai_follow_state.pop(chat_id, None)
        self._chat_prompt_cache.pop(chat_id, None)

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
            payload = await self._build_llm_request_payload(chat, deepThink)

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
                saved_chat = self.chat_store.save_messages(chat.id, new_messages)

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
                    self.chat_store.save_messages(chat.id, [assistant_message])
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

    async def shutdown(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()
        self._sessions.clear()
        self._ai_follow_state.clear()
        self._chat_prompt_cache.clear()

    def is_waiting_for_response(self, chat_id: ID) -> bool:
        return chat_id in self._sessions

    def get_current_stream(self, chat_id: ID) -> list[BaseChatMessageUnion]:
        session = self._sessions.get(chat_id)
        if not session:
            return []
        return [session.assistant_message.model_copy(deep=True)]

    async def _build_llm_request_payload(
        self,
        chat: Chat,
        deep_think: bool,
    ) -> dict[str, Any]:
        """
        Normalize a persisted chat into the kwargs expected by the LLM client.

        The payload mirrors the OpenAI chat/completions schema so the streaming
        layer can pass it directly to the configured completion client.
        """
        system_prompt = await self._build_system_prompt(chat)
        system_message = SystemChatMessage(
            content=[MessageTextContent(text=system_prompt)],
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

        server_ids = self._resolve_mcp_server_ids(chat.llmConfig)
        use_tool_search = self._should_use_anthropic_tool_search(chat.llmConfig)
        allow_tool_reference = bool(server_ids) and use_tool_search
        self._strip_tool_reference_content(
            messages,
            allow_tool_reference=allow_tool_reference,
        )
        request["messages"] = messages
        self._maybe_apply_cache_prompting(request, messages)
        tools = self._build_tool_definitions(
            server_ids,
            use_tool_search=use_tool_search,
        )
        if tools:
            request["tools"] = tools

        self._apply_request_overrides(request, deep_think)

        if not request["model"]:
            raise ValueError("LLM config must specify a model via config or override")

        return request

    async def _build_system_prompt(self, chat: Chat) -> str:
        cached = self._chat_prompt_cache.get(chat.id)
        if cached:
            return cached
        prompt = self.system_prompt
        project_config_id = chat.projectConfigId
        if project_config_id is not None:
            if self.project_manager_switcher is None:
                prompt = (
                    f"{prompt}\n\n## Active project config\n- id: {project_config_id}\n"
                )
            else:
                (
                    temporary_project_config_id,
                    summary_block,
                ) = await self._build_project_summary(project_config_id)
                prompt = (
                    f"{prompt}\n\n"
                    "## Active project config\n"
                    f"- id: {temporary_project_config_id}\n\n"
                    "## Project summary\n"
                    "(Injected at request start; call get_latest_project_state_summary only to"
                    " refresh after edits.)\n"
                    f"{summary_block}"
                )
        self._chat_prompt_cache[chat.id] = prompt
        return prompt

    async def _build_project_summary(self, project_config_id: ID) -> tuple[ID, str]:
        project_manager = self.project_manager_switcher.get(
            project_config_id,
            share_session_id=self.share_session_id,
        )
        summary = await project_manager.get_latest_project_state_summary(
            GetLatestProjectStateSummaryRequest(projectConfigId=project_config_id)
        )
        temporary_to_canonical, canonical_to_temporary = (
            self.dbe.read_temporary_id_map()
        )
        map_size_before = len(canonical_to_temporary)
        converted_summary = convert_canonical_ids_to_temporary(
            summary,
            canonical_to_temporary,
            temporary_to_canonical,
        )
        if len(canonical_to_temporary) != map_size_before:
            self.dbe.write_temporary_id_map(canonical_to_temporary)

        temporary_project_config_id = converted_summary.projectConfig.id
        summary_text = self._serialize_prompt_payload(converted_summary)
        summary_block = f"```json\n{summary_text}\n```"
        return temporary_project_config_id, summary_block

    @staticmethod
    def _serialize_prompt_payload(payload: Any) -> str:
        def default(obj: Any):
            if is_dataclass(obj):
                return asdict(obj)
            if isinstance(obj, BaseModel):
                return obj.model_dump(mode="json")
            if isinstance(obj, Enum):
                return obj.value
            if isinstance(obj, Path):
                return str(obj)
            return str(obj)

        return json.dumps(payload, indent=2, default=default)

    def _resolve_mcp_server_ids(self, llm_config) -> list[str]:
        return self.config.resolve_mcp_server_ids(llm_config)

    def _should_use_anthropic_tool_search(self, llm_config: "LLMConfig") -> bool:
        provider = (llm_config.provider or "").strip().lower()
        if provider:
            return "anthropic" in provider
        return self._is_claude_like_model(llm_config.model)

    def _build_tool_definitions(
        self,
        server_ids: list[str],
        *,
        use_tool_search: bool,
    ) -> list[ChatCompletionToolParam]:
        if not server_ids:
            return []
        return self._build_full_tool_definitions(
            server_ids,
            defer_loading=use_tool_search,
            include_search_tool=use_tool_search,
        )

    def _build_full_tool_definitions(
        self,
        server_ids: list[str],
        *,
        defer_loading: bool,
        include_search_tool: bool,
    ) -> list[ChatCompletionToolParam]:
        server_id_set = set(server_ids)
        init_tools = self.mcp_client.init_tool_definitions_for_servers(server_id_set)
        discoverable_tools = self.mcp_client.discoverable_tool_definitions_for_servers(
            server_id_set
        )
        discoverable_tool_names = set(discoverable_tools.keys())
        combined: dict[str, ChatCompletionToolParam] = {}
        combined.update(init_tools)
        combined.update(discoverable_tools)
        if not combined:
            return []
        tool_names = sorted(combined.keys())
        if not include_search_tool:
            tool_names = [name for name in tool_names if name != self._search_tool_name]
        if not tool_names:
            return []
        payload: list[ChatCompletionToolParam] = []
        has_non_deferred = False
        for name in tool_names:
            tool_payload = dict(combined[name])
            if defer_loading and name in discoverable_tool_names:
                tool_payload["defer_loading"] = True
            else:
                has_non_deferred = True
            payload.append(tool_payload)
        if defer_loading and not has_non_deferred and payload:
            payload[0].pop("defer_loading", None)
        return payload

    def _strip_tool_reference_content(
        self,
        messages: list[dict[str, Any]],
        *,
        allow_tool_reference: bool,
    ) -> None:
        if allow_tool_reference:
            return
        for message in messages:
            if message.get("role") != "tool":
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            filtered: list[Any] = []
            tool_names: list[str] = []
            for entry in content:
                if isinstance(entry, dict) and entry.get("type") == "tool_reference":
                    tool_name = entry.get("tool_name")
                    if isinstance(tool_name, str) and tool_name:
                        tool_names.append(tool_name)
                    continue
                filtered.append(entry)
            if not tool_names:
                continue
            if not filtered:
                filtered = [
                    {
                        "type": "text",
                        "text": self._format_tool_reference_summary(tool_names),
                    }
                ]
            message["content"] = filtered

    @staticmethod
    def _format_tool_reference_summary(tool_names: list[str]) -> str:
        if not tool_names:
            return "Search did not return any MCP tools."
        if len(tool_names) == 1:
            return f"Search returned MCP tool: {tool_names[0]}"
        return f"Search returned MCP tools: {', '.join(tool_names)}"

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
            tool_call_event = self._apply_tool_call_delta(
                assistant_message,
                entry,
                tool_call_state,
            )
            if not tool_call_event:
                continue
            tokens: list[_PartialJsonStringToken] | None = None
            buffer = tool_call_state.argument_buffers.get(entry.index, "")
            tool_name = tool_call_event.tool_name or ""
            if buffer and tool_name and self._is_setta_tool_name(tool_name):
                annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
                if annotations and (
                    annotations.toolArgumentPreview or annotations.aiFollowToolArguments
                ):
                    tokens = self._scan_partial_json_strings(buffer)
            preview_event = self._build_streaming_preview_event(
                assistant_message,
                tool_call_state,
                entry.index,
                entry.function.arguments,
                tokens,
            )
            await self.websocket_msg_handler.send_streaming_response(
                chat_id,
                preview_event or tool_call_event,
            )
            await self._maybe_broadcast_streaming_follow_update(
                project_config_id,
                chat_id,
                assistant_message,
                tool_call_state,
                {entry.index: tokens} if tokens is not None else None,
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
        tokens_by_index: dict[int, list[_PartialJsonStringToken]] | None,
    ) -> None:
        ids_by_type = self._extract_stream_ids_by_type_from_buffers(
            assistant_message,
            tool_call_state,
            tokens_by_index,
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

    def _build_streaming_preview_event(
        self,
        assistant_message: AssistantChatMessage,
        tool_call_state: ToolCallStreamState,
        tool_call_index: int,
        arguments_delta: str,
        tokens: list[_PartialJsonStringToken] | None,
    ) -> ToolArgumentPreviewDeltaEvent | None:
        buffer = tool_call_state.argument_buffers.get(tool_call_index)
        if not buffer:
            return None
        tool_calls = assistant_message.tool_calls or []
        if tool_call_index >= len(tool_calls):
            return None
        tool_call = tool_calls[tool_call_index]
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            return None
        if not self._is_setta_tool_name(tool_name):
            return None
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.toolArgumentPreview:
            return None
        metadata = annotations.toolArgumentPreview
        if tokens is None:
            tokens = self._scan_partial_json_strings(buffer)
        preview_value = self._extract_preview_value_from_tokens(
            tokens,
            metadata.previewValuePath,
        )
        if preview_value is None:
            return None
        target_ids_by_type = self._extract_preview_target_ids_from_tokens(
            tokens,
            metadata,
        )
        canonical_target_ids_by_type = self._canonicalize_preview_ids_by_type(
            target_ids_by_type,
            metadata.targetIdPathsByType,
        )
        if canonical_target_ids_by_type is None:
            return None
        last_value = tool_call_state.preview_values_by_index.get(tool_call_index, "")
        preview_value = self._coalesce_preview_value(last_value, preview_value)
        if last_value and not preview_value.startswith(last_value):
            return None
        preview_delta = preview_value[len(last_value) :]
        last_ids = tool_call_state.preview_target_ids_by_index.get(tool_call_index)
        ids_match = last_ids is not None and self._preview_ids_by_type_to_sets(
            last_ids
        ) == self._preview_ids_by_type_to_sets(canonical_target_ids_by_type)
        if not preview_delta and ids_match:
            return None
        tool_call_state.preview_values_by_index[tool_call_index] = preview_value
        tool_call_state.preview_target_ids_by_index[tool_call_index] = (
            canonical_target_ids_by_type
        )
        return ToolArgumentPreviewDeltaEvent(
            message_id=assistant_message.id,
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments_delta=arguments_delta,
            preview_kind=metadata.previewKind,
            target_ids_by_type=canonical_target_ids_by_type,
            preview_value_delta=preview_delta,
        )

    def _extract_stream_ids_by_type_from_buffers(
        self,
        assistant_message: AssistantChatMessage,
        tool_call_state: ToolCallStreamState,
        tokens_by_index: dict[int, list[_PartialJsonStringToken]] | None,
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
            tokens = tokens_by_index.get(index) if tokens_by_index else None
            buffer_ids_by_type = self._extract_stream_ids_by_type_from_buffer(
                buffer,
                tool_name,
                tokens,
            )
            for id_type, ids in buffer_ids_by_type.items():
                combined.setdefault(id_type, set()).update(ids)
        return {id_type: list(ids) for id_type, ids in combined.items() if ids}

    def _extract_stream_ids_by_type_from_paths(
        self,
        buffer: str,
        paths_by_id_type: dict[_ToolIdType, list[str]],
    ) -> dict[_ToolIdType, set[ID]]:
        tokens = self._scan_partial_json_strings(buffer)
        return self._extract_stream_ids_by_type_from_tokens(tokens, paths_by_id_type)

    def _extract_stream_ids_by_type_from_tokens(
        self,
        tokens: list[_PartialJsonStringToken],
        paths_by_id_type: dict[_ToolIdType, list[str]],
    ) -> dict[_ToolIdType, set[ID]]:
        keys_by_type: dict[_ToolIdType, set[str]] = {}
        for id_type, paths in paths_by_id_type.items():
            for path in paths:
                if path == "$":
                    continue
                segments = [segment for segment in path.split(".") if segment]
                if not segments:
                    continue
                keys_by_type.setdefault(id_type, set()).add(segments[-1])
        if not keys_by_type:
            return {}
        key_to_types: dict[str, set[_ToolIdType]] = {}
        for id_type, keys in keys_by_type.items():
            for key in keys:
                key_to_types.setdefault(key, set()).add(id_type)
        combined: dict[_ToolIdType, set[ID]] = {}
        for token in tokens:
            if not token.is_complete:
                continue
            if not token.value:
                continue
            owner_key = token.owner_key
            if not owner_key:
                continue
            types_for_key = key_to_types.get(owner_key)
            if not types_for_key:
                continue
            for id_type in types_for_key:
                combined.setdefault(id_type, set()).add(ID(token.value))
        return combined

    def _extract_stream_ids_by_type_from_buffer(
        self,
        buffer: str,
        tool_name: str,
        tokens: list[_PartialJsonStringToken] | None = None,
    ) -> dict[FollowIdType, set[ID]]:
        if not self._is_setta_tool_name(tool_name):
            return {}
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolArguments:
            return {}
        metadata = annotations.aiFollowToolArguments
        if tokens is None:
            combined = self._extract_stream_ids_by_type_from_paths(
                buffer,
                metadata.pathsByIdType,
            )
        else:
            combined = self._extract_stream_ids_by_type_from_tokens(
                tokens,
                metadata.pathsByIdType,
            )
        return {id_type: ids for id_type, ids in combined.items() if ids}

    def _extract_preview_target_ids_from_tokens(
        self,
        tokens: list[_PartialJsonStringToken],
        metadata: ToolArgumentPreviewMetadata,
    ) -> dict[ToolArgumentPreviewIdType, list[ID]]:
        combined = self._extract_stream_ids_by_type_from_tokens(
            tokens,
            metadata.targetIdPathsByType,
        )
        return {id_type: list(ids) for id_type, ids in combined.items() if ids}

    def _extract_preview_value_from_tokens(
        self,
        tokens: list[_PartialJsonStringToken],
        preview_value_path: str,
    ) -> str | None:
        key = self._preview_value_key(preview_value_path)
        if not key:
            return None
        last_value: str | None = None
        for token in tokens:
            if token.kind != "value":
                continue
            if token.owner_key != key:
                continue
            last_value = token.value
        return last_value

    @staticmethod
    def _preview_value_key(preview_value_path: str) -> str | None:
        if preview_value_path == "$":
            return None
        segments = [segment for segment in preview_value_path.split(".") if segment]
        if not segments:
            return None
        return segments[-1]

    def _scan_partial_json_strings(
        self,
        buffer: str,
    ) -> list[_PartialJsonStringToken]:
        tokens: list[_PartialJsonStringToken] = []
        containers: list[_JsonContainerState] = []
        # Stateful scan to capture string tokens from partial JSON buffers.
        i = 0
        while i < len(buffer):
            char = buffer[i]
            if char == '"':
                value, next_index, is_complete = (
                    self._parse_partial_json_string_with_end(buffer, i + 1)
                )
                container = containers[-1] if containers else None
                if container and container.kind == "object":
                    if container.expecting_key:
                        tokens.append(
                            _PartialJsonStringToken(
                                value=value,
                                kind="key",
                                owner_key=container.object_key_owner,
                                is_complete=is_complete,
                            )
                        )
                        if is_complete:
                            container.pending_key = value
                            container.expecting_key = False
                    elif container.expecting_value:
                        tokens.append(
                            _PartialJsonStringToken(
                                value=value,
                                kind="value",
                                owner_key=container.pending_key,
                                is_complete=is_complete,
                            )
                        )
                        if is_complete:
                            container.pending_key = None
                            container.expecting_value = False
                    else:
                        tokens.append(
                            _PartialJsonStringToken(
                                value=value,
                                kind="value",
                                owner_key=None,
                                is_complete=is_complete,
                            )
                        )
                elif container and container.kind == "array":
                    tokens.append(
                        _PartialJsonStringToken(
                            value=value,
                            kind="value",
                            owner_key=container.value_owner_key,
                            is_complete=is_complete,
                        )
                    )
                else:
                    tokens.append(
                        _PartialJsonStringToken(
                            value=value,
                            kind="value",
                            owner_key=None,
                            is_complete=is_complete,
                        )
                    )
                i = next_index
                if not is_complete:
                    break
                continue
            if char == "{":
                value_owner_key = None
                object_key_owner = None
                if containers:
                    parent = containers[-1]
                    if (
                        parent.kind == "object"
                        and parent.expecting_value
                        and parent.pending_key is not None
                    ):
                        value_owner_key = parent.pending_key
                        object_key_owner = parent.pending_key
                        parent.expecting_value = False
                        parent.pending_key = None
                    elif parent.kind == "array":
                        value_owner_key = parent.value_owner_key
                containers.append(
                    _JsonContainerState(
                        kind="object",
                        value_owner_key=value_owner_key,
                        object_key_owner=object_key_owner,
                        expecting_key=True,
                    )
                )
                i += 1
                continue
            if char == "[":
                value_owner_key = None
                if containers:
                    parent = containers[-1]
                    if (
                        parent.kind == "object"
                        and parent.expecting_value
                        and parent.pending_key is not None
                    ):
                        value_owner_key = parent.pending_key
                        parent.expecting_value = False
                        parent.pending_key = None
                    elif parent.kind == "array":
                        value_owner_key = parent.value_owner_key
                containers.append(
                    _JsonContainerState(
                        kind="array",
                        value_owner_key=value_owner_key,
                    )
                )
                i += 1
                continue
            if char == ":":
                if containers and containers[-1].kind == "object":
                    container = containers[-1]
                    if (
                        container.pending_key is not None
                        and not container.expecting_value
                    ):
                        container.expecting_value = True
                i += 1
                continue
            if char == ",":
                if containers and containers[-1].kind == "object":
                    container = containers[-1]
                    container.expecting_key = True
                    container.expecting_value = False
                    container.pending_key = None
                i += 1
                continue
            if char == "}":
                if containers and containers[-1].kind == "object":
                    containers.pop()
                i += 1
                continue
            if char == "]":
                if containers and containers[-1].kind == "array":
                    containers.pop()
                i += 1
                continue
            if containers and containers[-1].kind == "object":
                container = containers[-1]
                if container.expecting_value and not char.isspace():
                    i = self._consume_non_string_value(buffer, i, container)
                    continue
            i += 1
        return tokens

    @staticmethod
    def _consume_non_string_value(
        buffer: str,
        start_index: int,
        container: _JsonContainerState,
    ) -> int:
        container.expecting_value = False
        container.pending_key = None
        i = start_index
        while i < len(buffer) and buffer[i] not in ",]}":
            i += 1
        return i

    @staticmethod
    def _parse_partial_json_string_with_end(
        buffer: str,
        start_index: int,
    ) -> tuple[str, int, bool]:
        parsed: list[str] = []
        i = start_index
        while i < len(buffer):
            char = buffer[i]
            if char == '"':
                return "".join(parsed), i + 1, True
            if char != "\\":
                parsed.append(char)
                i += 1
                continue
            i += 1
            if i >= len(buffer):
                return "".join(parsed), len(buffer), False
            escape = buffer[i]
            if escape == '"':
                parsed.append('"')
            elif escape == "\\":
                parsed.append("\\")
            elif escape == "/":
                parsed.append("/")
            elif escape == "b":
                parsed.append("\b")
            elif escape == "f":
                parsed.append("\f")
            elif escape == "n":
                parsed.append("\n")
            elif escape == "r":
                parsed.append("\r")
            elif escape == "t":
                parsed.append("\t")
            elif escape == "u":
                if i + 4 >= len(buffer):
                    return "".join(parsed), len(buffer), False
                code = buffer[i + 1 : i + 5]
                if not LLMChatManager._is_hex_digits(code):
                    return "".join(parsed), len(buffer), False
                parsed.append(chr(int(code, 16)))
                i += 5
                continue
            else:
                parsed.append(escape)
            i += 1
        return "".join(parsed), len(buffer), False

    @staticmethod
    def _is_hex_digits(value: str) -> bool:
        return all(char in string.hexdigits for char in value)

    @staticmethod
    def _coalesce_preview_value(
        last_value: str | None,
        next_value: str,
    ) -> str:
        if last_value is None:
            return next_value
        if len(next_value) < len(last_value) and last_value.startswith(next_value):
            return last_value
        return next_value

    def _preview_ids_by_type_to_sets(
        self,
        ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]],
    ) -> dict[ToolArgumentPreviewIdType, set[ID]]:
        return {id_type: set(ids) for id_type, ids in ids_by_type.items() if ids}

    def _canonicalize_preview_ids_by_type(
        self,
        ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]],
        required_paths_by_type: dict[ToolArgumentPreviewIdType, list[str]],
    ) -> dict[ToolArgumentPreviewIdType, list[ID]] | None:
        if not ids_by_type:
            return None
        temporary_to_canonical, _ = self.dbe.read_temporary_id_map()
        filtered: dict[ToolArgumentPreviewIdType, list[ID]] = {}
        for id_type, ids in ids_by_type.items():
            if not ids:
                continue
            resolved = [entry for entry in ids if entry in temporary_to_canonical]
            if resolved:
                filtered[id_type] = resolved
        if not filtered:
            return None
        for id_type in required_paths_by_type.keys():
            if id_type not in filtered or not filtered[id_type]:
                return None
        return convert_temporary_ids_to_canonical(
            filtered,
            temporary_to_canonical,
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
        available_tools: dict[str, ChatCompletionToolParam] = {}
        if tool_name == self._search_tool_name:
            server_ids = self._resolve_mcp_server_ids(chat.llmConfig)
            if not server_ids:
                raise ValueError("Search tool requires configured MCP server IDs.")
            server_id_set = set(server_ids)
            available_tools = self.mcp_client.discoverable_tool_definitions_for_servers(
                server_id_set
            )
            annotations_by_name = self.mcp_client.tool_annotations_for_servers(
                server_id_set
            )
            provided_server_ids = arguments.get("serverIds")
            if provided_server_ids is not None:
                if not isinstance(provided_server_ids, list):
                    raise ValueError("serverIds must be a list of strings.")
                normalized_server_ids: list[str] = []
                for entry in provided_server_ids:
                    if not isinstance(entry, str):
                        raise ValueError("serverIds must be a list of strings.")
                    normalized = entry.strip()
                    if not normalized:
                        raise ValueError("serverIds must be non-empty strings.")
                    normalized_server_ids.append(normalized)
                unknown = [
                    entry for entry in normalized_server_ids if entry not in server_ids
                ]
                if unknown:
                    raise ValueError(
                        f"serverIds contain unknown MCP servers: {unknown}"
                    )
                arguments["serverIds"] = normalized_server_ids
            else:
                arguments["serverIds"] = list(server_ids)
        started_at = get_now_timestamp()
        if tool_name == self._search_tool_name:
            call_result = self._run_local_search_tool(
                arguments=arguments,
                available_tools=available_tools,
                annotations_by_name=annotations_by_name,
            )
        else:
            try:
                meta = None
                if self.share_session_id and self._is_setta_tool_name(tool_name):
                    meta = {"shareSessionId": self.share_session_id}
                call_result = await self.mcp_client.call_tool(
                    tool_name, arguments, meta=meta
                )
            except Exception:
                logger.exception(
                    "MCP tool invocation failed for chat %s (tool=%s)",
                    chat_id,
                    tool_name,
                )
                raise
        completed_at = get_now_timestamp()

        sanitized_arguments = self._sanitize_tool_arguments(arguments)
        if tool_name == self._search_tool_name and not call_result.isError:
            tool_chat_message = self._build_search_tool_chat_message(
                chat_id,
                tool_name,
                tool_call,
                call_result,
                sanitized_arguments,
                started_at,
                completed_at,
                available_tools,
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
        available_tools: dict[str, ChatCompletionToolParam],
    ) -> ToolChatMessage:
        search_results = self._parse_search_tool_results(call_result)
        definitions = self._build_tool_definitions_from_search_results(
            search_results,
            available_tools,
        )
        referenced_tool_names = list(definitions.keys())
        result_payload = call_result.model_dump()
        result_payload["searchResults"] = search_results

        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[chat %s] search tool returned %s tools: %s",
                chat_id,
                len(referenced_tool_names),
                referenced_tool_names,
            )

        if referenced_tool_names:
            content_blocks = [
                ToolReferenceContent(tool_name=name) for name in referenced_tool_names
            ]
        else:
            content_blocks = [
                TextContent(
                    type="text",
                    text=self._format_tool_reference_summary([]),
                )
            ]

        return ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=arguments,
            content=content_blocks,
            is_error=call_result.isError,
            result=result_payload,
            started_at=started_at,
            completed_at=completed_at,
        )

    def _run_local_search_tool(
        self,
        *,
        arguments: dict[str, Any],
        available_tools: dict[str, ChatCompletionToolParam],
        annotations_by_name: dict[str, Any],
    ) -> CallToolResult:
        query = arguments.get("query", "")
        if not isinstance(query, str):
            raise ValueError("query must be a string")
        normalized_query = query.strip()
        if normalized_query == "":
            raise ValueError("query must not be empty")
        limit = arguments.get("limit")
        if limit is None:
            limit = 2

        entries = build_tool_search_entries_from_llm_definitions(
            available_tools,
            annotations_by_name,
        )
        index = ToolSearchIndex.build(entries)
        results_payload: list[dict[str, str | None]] = []
        if index is not None:
            for result in index.search(normalized_query, limit):
                results_payload.append(
                    {
                        "name": result.name,
                        "description": result.description,
                        "category": result.category,
                    }
                )
        structured = {"results": results_payload}
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(structured))],
            structuredContent=structured,
            isError=False,
        )

    def _parse_search_tool_results(
        self, call_result: CallToolResult
    ) -> list[dict[str, str | None]]:
        payload = call_result.structuredContent
        if not isinstance(payload, dict):
            raise ValueError("Search tool must return structured content.")

        results_payload = payload.get("results")
        if not isinstance(results_payload, list):
            raise ValueError("Search tool structured content must include results.")

        results: list[dict[str, str | None]] = []
        for item in results_payload:
            if not isinstance(item, dict):
                raise ValueError("Search tool results must be objects.")
            name = item.get("name")
            if not isinstance(name, str) or not name.strip():
                raise ValueError("Search tool result name must be a non-empty string.")
            description = item.get("description")
            if not isinstance(description, str):
                raise ValueError("Search tool result description must be a string.")
            category = item.get("category")
            if category is not None and not isinstance(category, str):
                raise ValueError("Search tool result category must be a string.")
            results.append(
                {
                    "name": name,
                    "description": description,
                    "category": category,
                }
            )
        return results

    def _build_tool_definitions_from_search_results(
        self,
        search_results: list[dict[str, str | None]],
        available: dict[str, ChatCompletionToolParam],
    ) -> dict[str, ChatCompletionToolParam]:
        definitions: dict[str, ChatCompletionToolParam] = {}
        for result in search_results:
            name = result.get("name")
            if not name:
                continue
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
        if not self._is_setta_tool_name(tool_name):
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
        if not self._is_setta_tool_name(tool_name):
            return None
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolArguments:
            return None
        return self._extract_ai_follow_tool_argument_ids(
            arguments,
            annotations.aiFollowToolArguments,
        )

    @staticmethod
    def _is_setta_tool_name(tool_name: str) -> bool:
        server_id, _ = split_namespaced_tool_name(tool_name)
        return server_id == SETTA_MCP_SERVER_ID

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
