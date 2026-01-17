import asyncio
import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, AsyncIterator, Iterator, Literal

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.llms.openai import ChatCompletionToolParam
from litellm.types.utils import Delta, ModelResponseStream
from litellm.utils import supports_prompt_caching

from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
from setta.llm.chat_store import ChatStore, DBEChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.managed.action_executor import ManagedActionExecutor
from setta.llm.chat_toolkit.managed.actions import (
    AppendMessagesAction,
    EmitChunkAction,
    ManagedAction,
    SetSystemPromptAction,
    UpdateAIFollowAction,
)
from setta.llm.chat_toolkit.managed.ai_follow import (
    build_streaming_follow_ids,
    build_tool_call_follow_ids,
    ids_by_type_to_sets,
    normalize_ids_by_type,
)
from setta.llm.chat_toolkit.managed.stream_assembler import (
    ManagedStreamAssembler,
    StreamContentEntry,
)
from setta.llm.chat_toolkit.managed.tool_argument_preview import (
    ManagedToolArgumentPreviewState,
    PartialJsonStringToken,
    build_preview_event,
    scan_partial_json_strings,
)
from setta.llm.chat_toolkit.managed.tool_calls import (
    ManagedToolCallAccumulator,
    ManagedToolCallState,
)
from setta.llm.chat_toolkit.managed.tool_runner import build_execute_tool_calls_action
from setta.llm.chat_toolkit.managed.utils import is_setta_tool_name
from setta.llm.config import AllLLMConfigs, merge_chat_llm_configs
from setta.logging.tasks import spawn_background_task
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import (
    SETTA_MCP_SERVER_ID,
    build_namespaced_tool_name,
)
from setta.mcp.tool_metadata import FollowIdType
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.chat import APIKeys, Chat
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    SystemChatMessage,
    ToolCall,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageContentDelta,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    ToolResultEvent,
)
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.websocket import AIFollowToolArgumentsUpdateContent
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.types.llm_config import LLMConfig
logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"
ANTHROPIC_TOOL_SEARCH_BETA_HEADER = "advanced-tool-use-2025-11-20"


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
class LLMChatManager:
    """Coordinates chat persistence, streaming responses, and tool execution."""

    def __init__(
        self,
        dbe: DBE,
        mcp_client: MultiMCPClient,
        websocket_msg_handler: WMHFrontendSender,
        chat_store: ChatStore | None = None,
        *,
        share_session_id: str | None = None,
    ) -> None:
        self.dbe = dbe
        self.chat_store = chat_store or DBEChatStore(dbe)
        self.history = ChatHistory(self.chat_store)
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.share_session_id = share_session_id
        self.config: AllLLMConfigs = self._hydrate_config(AllLLMConfigs())
        self.api_keys: APIKeys = {}
        self._raw_env_vars: APIKeys = {}
        self._sessions: dict[str, StreamingSession] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._ai_follow_state: dict[ID, AIFollowState] = {}
        self._chat_prompt_cache: dict[ID, str] = {}
        self._search_tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
        )
        self._action_executor = ManagedActionExecutor(
            chat_history=self.history,
            websocket_msg_handler=self.websocket_msg_handler,
            mcp_client=self.mcp_client,
            dbe=self.dbe,
            search_tool_name=self._search_tool_name,
            logger=logger,
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
            ids_by_type = normalize_ids_by_type(state.ids_by_type)
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
            tool_call_state = ManagedToolCallState()
            tool_call_accumulator = ManagedToolCallAccumulator(
                assistant_message,
                tool_call_state,
            )
            preview_state = ManagedToolArgumentPreviewState()
            stream_assembler = ManagedStreamAssembler(assistant_message)
            session = StreamingSession(assistant_message=assistant_message)
            self._sessions[chat.id] = session

            stop_event_sent = False
            tool_results: list[ToolChatMessage] = []
            saved_chat: Chat | None = None
            try:
                await self._apply_actions(
                    [
                        EmitChunkAction(
                            chat.id,
                            MessageStartEvent(message=assistant_message),
                        )
                    ]
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
                        stream_assembler,
                        tool_call_accumulator,
                        preview_state,
                        chunk,
                        chat.projectConfigId,
                    )

                await self._apply_actions(
                    [
                        EmitChunkAction(
                            chat.id,
                            MessageStopEvent(message_id=assistant_message.id),
                        )
                    ]
                )
                stop_event_sent = True
                parsed_tool_calls, failures = tool_call_accumulator.finalize()
                for tool_call_id, error in failures.items():
                    logger.warning(
                        "Failed to parse tool call arguments for tool_call_id=%s",
                        tool_call_id,
                        exc_info=error,
                    )
                await self._maybe_emit_tool_call_follow_update(
                    chat.projectConfigId,
                    chat.id,
                    parsed_tool_calls,
                )
                execute_action = build_execute_tool_calls_action(
                    project_config_id=chat.projectConfigId,
                    chat_id=chat.id,
                    tool_calls=assistant_message.tool_calls or [],
                    allowed_server_ids=set(
                        self._resolve_mcp_server_ids(chat.llmConfig)
                    ),
                    share_session_id=self.share_session_id,
                )
                if execute_action is not None:
                    tool_results = await self._apply_actions([execute_action])
                if assistant_message.tool_calls:
                    await self._apply_actions(
                        [
                            UpdateAIFollowAction(
                                project_config_id=chat.projectConfigId,
                                chat_id=chat.id,
                                ids_by_type={},
                            )
                        ]
                    )
                new_messages: list[BaseChatMessageUnion] = [assistant_message]
                if tool_results:
                    new_messages.extend(tool_results)
                    logger.debug(
                        "Executed %s MCP tool calls for chat %s",
                        len(tool_results),
                        chat.id,
                    )
                await self._apply_actions(
                    [
                        AppendMessagesAction(
                            chat_id=chat.id,
                            messages=new_messages,
                        )
                    ]
                )
                saved_chat = self.chat_store.get_chat(chat.id)

                await self._apply_actions(
                    [
                        EmitChunkAction(
                            chat.id,
                            MessageFinalizedEvent(message=assistant_message),
                        )
                    ]
                )
            except asyncio.CancelledError:
                if not stop_event_sent:
                    await self._apply_actions(
                        [
                            EmitChunkAction(
                                chat.id,
                                MessageStopEvent(message_id=assistant_message.id),
                            )
                        ]
                    )
                    stop_event_sent = True
                if self._should_persist_partial_message(assistant_message):
                    parsed_tool_calls, failures = tool_call_accumulator.finalize()
                    for tool_call_id, error in failures.items():
                        logger.warning(
                            "Failed to parse tool call arguments for tool_call_id=%s",
                            tool_call_id,
                            exc_info=error,
                        )
                    await self._maybe_emit_tool_call_follow_update(
                        chat.projectConfigId,
                        chat.id,
                        parsed_tool_calls,
                    )
                    await self._apply_actions(
                        [
                            AppendMessagesAction(
                                chat_id=chat.id,
                                messages=[assistant_message],
                            )
                        ]
                    )
                    await self._apply_actions(
                        [
                            EmitChunkAction(
                                chat.id,
                                MessageFinalizedEvent(message=assistant_message),
                            )
                        ]
                    )
                await self._apply_actions(
                    [
                        UpdateAIFollowAction(
                            project_config_id=chat.projectConfigId,
                            chat_id=chat.id,
                            ids_by_type={},
                        )
                    ]
                )
                raise
            except Exception as exc:
                if not stop_event_sent:
                    await self._apply_actions(
                        [
                            EmitChunkAction(
                                chat.id,
                                MessageStopEvent(message_id=assistant_message.id),
                            )
                        ]
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
                await self._apply_actions(
                    [
                        UpdateAIFollowAction(
                            project_config_id=chat.projectConfigId,
                            chat_id=chat.id,
                            ids_by_type={},
                        )
                    ]
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
        if chat.systemPrompt != system_prompt:
            chat.systemPrompt = system_prompt
            if self.chat_store.get_chat(chat.id) is not None:
                await self._apply_actions(
                    [
                        SetSystemPromptAction(
                            chat_id=chat.id,
                            system_prompt=system_prompt,
                        )
                    ]
                )
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
        self._apply_anthropic_tool_search_headers(
            request,
            use_tool_search=use_tool_search,
            has_mcp_tools=bool(server_ids),
        )
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

    def _apply_anthropic_tool_search_headers(
        self,
        request: dict[str, Any],
        *,
        use_tool_search: bool,
        has_mcp_tools: bool,
    ) -> None:
        if not use_tool_search or not has_mcp_tools:
            return
        extra_headers = request.get("extra_headers")
        if extra_headers is None:
            extra_headers = {}
        if not isinstance(extra_headers, dict):
            extra_headers = {}
        else:
            extra_headers = dict(extra_headers)
        existing_beta = extra_headers.get("anthropic-beta")
        merged_beta = self._merge_anthropic_beta_header(existing_beta)
        extra_headers["anthropic-beta"] = merged_beta
        request["extra_headers"] = extra_headers

    @staticmethod
    def _merge_anthropic_beta_header(existing: Any) -> str:
        values: list[str] = []
        if isinstance(existing, str):
            values = [value.strip() for value in existing.split(",") if value.strip()]
        elif isinstance(existing, list):
            values = [str(value).strip() for value in existing if str(value).strip()]
        if ANTHROPIC_TOOL_SEARCH_BETA_HEADER not in values:
            values.append(ANTHROPIC_TOOL_SEARCH_BETA_HEADER)
        return ", ".join(values)

    async def _build_system_prompt(self, chat: Chat) -> str:
        cached = self._chat_prompt_cache.get(chat.id)
        if cached:
            return cached
        prompt = self.system_prompt
        project_config_id = chat.projectConfigId
        if project_config_id is not None:
            temporary_project_config_id = self._ensure_temporary_project_id(
                project_config_id
            )
            prompt = f"{prompt}\n\n## Active project config\n- id: {temporary_project_config_id}\n"
        self._chat_prompt_cache[chat.id] = prompt
        return prompt

    def _ensure_temporary_project_id(self, project_config_id: ID) -> ID:
        temporary_to_canonical, canonical_to_temporary = (
            self.dbe.read_temporary_id_map()
        )
        map_size_before = len(canonical_to_temporary)
        temporary_project_config_id = convert_canonical_ids_to_temporary(
            project_config_id,
            canonical_to_temporary,
            temporary_to_canonical,
        )
        if len(canonical_to_temporary) != map_size_before:
            self.dbe.write_temporary_id_map(canonical_to_temporary)
        return temporary_project_config_id

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

    async def _apply_actions(
        self,
        actions: list[ManagedAction],
    ) -> list[ToolChatMessage]:
        tool_results: list[ToolChatMessage] = []
        queue = list(actions)
        while queue:
            action = queue.pop(0)
            if isinstance(action, EmitChunkAction) and isinstance(
                action.chunk, ToolResultEvent
            ):
                tool_results.append(action.chunk.result)
            next_actions = await self._apply_action(action)
            if next_actions:
                queue = next_actions + queue
        return tool_results

    async def _apply_action(self, action: ManagedAction) -> list[ManagedAction]:
        if isinstance(action, UpdateAIFollowAction):
            await self._update_and_broadcast_ai_follow_update(
                action.project_config_id,
                action.chat_id,
                action.ids_by_type,
            )
            return []
        return await self._action_executor.apply(action)

    async def _handle_stream_chunk(
        self,
        chat_id: ID,
        assistant_message: AssistantChatMessage,
        stream_assembler: ManagedStreamAssembler,
        tool_call_accumulator: ManagedToolCallAccumulator,
        preview_state: ManagedToolArgumentPreviewState,
        chunk: ModelResponseStream,
        project_config_id: ID,
    ) -> None:
        choices = chunk.choices
        if not choices:
            return

        choice = choices[0]
        delta = choice.delta
        if not delta:
            return

        await self._handle_text_deltas(
            chat_id,
            assistant_message,
            stream_assembler,
            delta,
        )

        await self._handle_tool_call_deltas(
            chat_id,
            assistant_message,
            delta,
            tool_call_accumulator,
            preview_state,
            project_config_id,
        )

    async def _handle_text_deltas(
        self,
        chat_id: ID,
        assistant_message: AssistantChatMessage,
        stream_assembler: ManagedStreamAssembler,
        delta: Delta,
    ) -> None:
        text_deltas = self._build_text_deltas(delta, stream_assembler)
        if not text_deltas:
            return
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[chat %s] streaming delta reasoning=%r thinking_blocks=%r",
                chat_id,
                getattr(delta, "reasoning_content", None),
                getattr(delta, "thinking_blocks", None),
            )
        await self._apply_actions(
            [
                EmitChunkAction(
                    chat_id,
                    MessageDeltaEvent(
                        message_id=assistant_message.id,
                        content=text_deltas,
                    ),
                )
            ]
        )

    def _build_text_deltas(
        self,
        delta: Delta,
        stream_assembler: ManagedStreamAssembler,
    ) -> list[MessageContentDelta]:
        entries = self._collect_stream_entries(delta)
        if not entries:
            return []
        return stream_assembler.apply_entries(entries)

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
        tool_call_accumulator: ManagedToolCallAccumulator,
        preview_state: ManagedToolArgumentPreviewState,
        project_config_id: ID,
    ) -> None:
        entries = delta.tool_calls
        if not entries:
            return

        for entry in entries:
            tool_call_event = tool_call_accumulator.apply_delta(entry)
            if not tool_call_event:
                continue
            tokens: list[PartialJsonStringToken] | None = None
            buffer = tool_call_accumulator.state.argument_buffers.get(entry.index, "")
            tool_name = tool_call_event.tool_name or ""
            annotations = None
            if buffer and tool_name and is_setta_tool_name(tool_name):
                annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
                if annotations and (
                    annotations.toolArgumentPreview or annotations.aiFollowToolArguments
                ):
                    tokens = scan_partial_json_strings(buffer)
            preview_event = build_preview_event(
                assistant_message=assistant_message,
                tool_call_state=tool_call_accumulator.state,
                preview_state=preview_state,
                tool_call_index=entry.index,
                arguments_delta=entry.function.arguments,
                tokens=tokens,
                dbe=self.dbe,
                tool_argument_metadata_by_name=(
                    {tool_name: annotations.toolArgumentPreview}
                    if annotations and annotations.toolArgumentPreview
                    else {}
                ),
            )
            await self._apply_actions(
                [EmitChunkAction(chat_id, preview_event or tool_call_event)]
            )
            await self._maybe_emit_streaming_follow_update(
                project_config_id,
                chat_id,
                assistant_message,
                tool_call_accumulator.state,
                {entry.index: tokens} if tokens is not None else None,
            )

    async def _maybe_emit_streaming_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        assistant_message: AssistantChatMessage,
        tool_call_state: ManagedToolCallState,
        tokens_by_index: dict[int, list[PartialJsonStringToken]] | None,
    ) -> None:
        ids_by_type = build_streaming_follow_ids(
            assistant_message=assistant_message,
            tool_call_state=tool_call_state,
            tokens_by_index=tokens_by_index,
            dbe=self.dbe,
            annotations_by_name=self.mcp_client.tool_annotations_by_name,
        )
        if ids_by_type is None:
            return
        await self._apply_actions(
            [
                UpdateAIFollowAction(
                    project_config_id=project_config_id,
                    chat_id=chat_id,
                    ids_by_type=ids_by_type,
                )
            ]
        )

    async def _maybe_emit_tool_call_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        tool_calls: list[ToolCall],
    ) -> None:
        ids_by_type = build_tool_call_follow_ids(
            tool_calls=tool_calls,
            dbe=self.dbe,
            annotations_by_name=self.mcp_client.tool_annotations_by_name,
        )
        if ids_by_type is None:
            return
        await self._apply_actions(
            [
                UpdateAIFollowAction(
                    project_config_id=project_config_id,
                    chat_id=chat_id,
                    ids_by_type=ids_by_type,
                )
            ]
        )

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
        return ids_by_type_to_sets(state.ids_by_type) == ids_by_type_to_sets(
            ids_by_type
        )

    async def _update_and_broadcast_ai_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> None:
        normalized_ids_by_type = normalize_ids_by_type(ids_by_type)
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
        await self._action_executor.apply(
            UpdateAIFollowAction(
                project_config_id=project_config_id,
                chat_id=chat_id,
                ids_by_type=payload_ids_by_type,
            )
        )

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
