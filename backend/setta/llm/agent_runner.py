import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.utils import Delta, ModelResponseStream
from litellm.utils import supports_prompt_caching

from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
from setta.llm.chat_store import MemoryChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.managed.action_executor import ManagedActionExecutor
from setta.llm.chat_toolkit.managed.actions import (
    EmitChunkAction,
    ExecuteToolCallsAction,
    ManagedAction,
    UpdateAIFollowAction,
    UpdateAIFollowResultAction,
)
from setta.llm.chat_toolkit.managed.ai_follow import (
    build_streaming_follow_ids,
    build_tool_call_follow_ids,
    ids_by_type_to_sets,
    normalize_ids_by_type,
)
from setta.llm.chat_toolkit.managed.sanitization import sanitize_tool_arguments
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
from setta.llm.chat_toolkit.managed.tool_runner import (
    build_disallowed_tool_result,
    build_execute_tool_calls_action,
)
from setta.llm.chat_toolkit.managed.utils import is_setta_tool_name
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import (
    SETTA_MCP_SERVER_ID,
    build_namespaced_tool_name,
    split_namespaced_tool_name,
)
from setta.mcp.tool_metadata import FollowIdType
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    RunEvent,
    RunEventType,
)
from setta.types.chat import APIKeys
from setta.types.chat_messages import (
    AssistantChatMessage,
    JSONValue,
    MessageTextContent,
    SystemChatMessage,
    ToolCall,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.chat_stream_events import (
    LLMStreamingResponseChunk,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    ToolResultEvent,
)
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"
ANTHROPIC_TOOL_SEARCH_BETA_HEADER = "advanced-tool-use-2025-11-20"


@dataclass
class _RunState:
    assistant_message: AssistantChatMessage
    stream: CustomStreamWrapper | None = None
    section_id: ID | None = None
    share_session_id: str | None = None
    project_config_id: ID | None = None


class AgentRunner:
    def __init__(
        self,
        dbe: DBE,
        mcp_client: MultiMCPClient,
        websocket_msg_handler: WMHFrontendSender,
    ) -> None:
        self.dbe = dbe
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.config: AllLLMConfigs = AllLLMConfigs()
        self.api_keys: APIKeys = {}
        self._raw_env_vars: APIKeys = {}
        self._tasks: dict[ID, asyncio.Task[Any]] = {}
        self._sessions: dict[ID, _RunState] = {}
        self._ai_follow_state: dict[ID, dict[FollowIdType, list[ID]]] = {}
        self._search_tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
        )
        self._action_executor = ManagedActionExecutor(
            chat_history=ChatHistory(MemoryChatStore()),
            websocket_msg_handler=self.websocket_msg_handler,
            mcp_client=self.mcp_client,
            dbe=self.dbe,
            search_tool_name=self._search_tool_name,
            logger=logger,
        )
        self._base_system_prompt = SYSTEM_PROMPT_PATH.read_text(
            encoding="utf-8"
        ).strip()

    def update_config(self, config: AllLLMConfigs) -> None:
        self.config = config
        self._sync_api_keys()

    def update_api_keys(self, payload: APIKeys) -> None:
        self._raw_env_vars = dict(payload)
        self._sync_api_keys()

    def _sync_api_keys(self) -> None:
        if not self._raw_env_vars:
            self.api_keys = {}
            return
        self.api_keys = filter_env_vars_for_config(self._raw_env_vars, self.config)

    def start_run(
        self,
        *,
        run: AgentRun,
        profile: AgentProfile,
        inputs: JSONValue,
        llm_config_id: str,
        section_id: ID | None,
        share_session_id: str | None,
    ) -> None:
        if section_id is not None:
            run.sectionId = section_id
        existing = self._tasks.get(run.id)
        if existing and not existing.done():
            logger.info("Agent run %s already active; cancelling", run.id)
            existing.cancel()
        task = asyncio.create_task(
            self._run_agent(
                run=run,
                profile=profile,
                inputs=inputs,
                llm_config_id=llm_config_id,
                section_id=section_id,
                share_session_id=share_session_id,
            ),
            name=f"agent-run-{run.id}",
        )

        def _cleanup(_task: asyncio.Task[Any], run_id: ID) -> None:
            self._tasks.pop(run_id, None)
            self._sessions.pop(run_id, None)

        task.add_done_callback(lambda t, run_id=run.id: _cleanup(t, run_id))
        self._tasks[run.id] = task

    async def stop_run(self, run_id: ID) -> AgentRun:
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        run = self.dbe.read_agent_run(run_id)
        if run is None:
            raise KeyError(f"Agent run not found: {run_id}")
        if run.status == AgentRunStatus.cancelled:
            return run
        run.status = AgentRunStatus.cancelled
        run.completedAt = get_now_timestamp()
        run.events.append(
            RunEvent(
                type=RunEventType.status,
                status=run.status,
            )
        )
        self.dbe.write_agent_run(run)
        return run

    async def shutdown(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()
        self._sessions.clear()
        self._ai_follow_state.clear()

    async def _run_agent(
        self,
        *,
        run: AgentRun,
        profile: AgentProfile,
        inputs: JSONValue,
        llm_config_id: str,
        section_id: ID | None,
        share_session_id: str | None,
    ) -> None:
        try:
            active_project_config_id = self._resolve_project_config_id()
            self._set_run_status(run, AgentRunStatus.running)
            messages = self._build_initial_messages(
                profile=profile,
                inputs=inputs,
                active_project_config_id=active_project_config_id,
            )
            llm_config = self.config.resolve_config(llm_config_id)
            allowed_tool_names, allowed_server_ids = self._resolve_tool_allowlist(
                profile.toolAllowlist
            )
            while True:
                payload = self._build_llm_request_payload(
                    messages=messages,
                    llm_config=llm_config,
                    allowed_tool_names=allowed_tool_names,
                )
                assistant_message = AssistantChatMessage(content=[])
                tool_call_state = ManagedToolCallState()
                tool_call_accumulator = ManagedToolCallAccumulator(
                    assistant_message,
                    tool_call_state,
                )
                preview_state = ManagedToolArgumentPreviewState()
                stream_assembler = ManagedStreamAssembler(assistant_message)
                self._sessions[run.id] = _RunState(
                    assistant_message=assistant_message,
                    section_id=section_id or run.sectionId,
                    share_session_id=share_session_id,
                    project_config_id=active_project_config_id,
                )
                await self._append_stream_event(
                    run,
                    MessageStartEvent(message=assistant_message),
                )

                stream_result = await litellm.acompletion(**payload, stream=True)
                if not isinstance(stream_result, CustomStreamWrapper):
                    raise TypeError("LLM streaming must return a CustomStreamWrapper")
                self._sessions[run.id].stream = stream_result

                async for chunk in self._iterate_stream(stream_result):
                    await self._handle_stream_chunk(
                        run=run,
                        assistant_message=assistant_message,
                        stream_assembler=stream_assembler,
                        tool_call_accumulator=tool_call_accumulator,
                        preview_state=preview_state,
                        chunk=chunk,
                    )

                await self._append_stream_event(
                    run,
                    MessageStopEvent(message_id=assistant_message.id),
                )

                parsed_tool_calls, failures = tool_call_accumulator.finalize()
                for tool_call_id, error in failures.items():
                    run.events.append(
                        RunEvent(
                            type=RunEventType.error,
                            outputs={
                                "toolCallId": tool_call_id,
                                "error": str(error),
                            },
                        )
                    )
                tool_calls = assistant_message.tool_calls or []
                if tool_calls:
                    run.toolCalls.extend(tool_calls)
                    self._append_tool_call_events(run, tool_calls)
                    self._append_tool_call_follow_update(
                        run,
                        parsed_tool_calls or tool_calls,
                    )
                tool_results = await self._execute_tool_calls(
                    run=run,
                    tool_calls=tool_calls,
                    allowed_tool_names=allowed_tool_names,
                    allowed_server_ids=allowed_server_ids,
                    share_session_id=share_session_id,
                    active_project_config_id=active_project_config_id,
                )

                messages.append(assistant_message)
                if tool_results:
                    messages.extend(tool_results)

                await self._append_stream_event(
                    run,
                    MessageFinalizedEvent(message=assistant_message),
                )

                should_continue = bool(tool_calls) and bool(tool_results)
                if not should_continue:
                    run.outputs = assistant_message.model_dump(mode="json")
                    break

            self._set_run_status(run, AgentRunStatus.completed)
        except asyncio.CancelledError:
            if run.status != AgentRunStatus.cancelled:
                self._set_run_status(run, AgentRunStatus.cancelled)
            raise
        except Exception as exc:
            run.events.append(
                RunEvent(
                    type=RunEventType.error,
                    outputs={"error": str(exc)},
                )
            )
            self._set_run_status(run, AgentRunStatus.failed)
        finally:
            self._sessions.pop(run.id, None)
            self._ai_follow_state.pop(run.id, None)

    def _set_run_status(self, run: AgentRun, status: AgentRunStatus) -> None:
        run.status = status
        if status in {
            AgentRunStatus.completed,
            AgentRunStatus.failed,
            AgentRunStatus.cancelled,
        }:
            run.completedAt = get_now_timestamp()
        run.events.append(
            RunEvent(
                type=RunEventType.status,
                status=status,
            )
        )
        self.dbe.write_agent_run(run)

    def _resolve_project_config_id(self) -> ID:
        project = self.dbe.read_project_required()
        if project.defaultProjectConfigId is None:
            raise ValueError("Project config is required for agent runs")
        return project.defaultProjectConfigId

    def _build_initial_messages(
        self,
        *,
        profile: AgentProfile,
        inputs: JSONValue,
        active_project_config_id: ID,
    ) -> list[BaseChatMessageUnion]:
        system_prompt = self._build_system_prompt(
            profile=profile,
            active_project_config_id=active_project_config_id,
        )
        system_message = SystemChatMessage(
            content=[MessageTextContent(text=system_prompt)],
        )
        inputs_text = self._format_inputs(inputs)
        messages: list[BaseChatMessageUnion] = [system_message]
        if inputs_text:
            messages.append(
                UserChatMessage(
                    content=[MessageTextContent(text=inputs_text)],
                )
            )
        return messages

    def _build_system_prompt(
        self,
        *,
        profile: AgentProfile,
        active_project_config_id: ID,
    ) -> str:
        prompt = self._base_system_prompt
        temporary_project_config_id = self._ensure_temporary_project_id(
            active_project_config_id
        )
        prompt = f"{prompt}\n\n## Active project config\n- id: {temporary_project_config_id}\n"
        profile_lines = [f"- name: {profile.name}"]
        if profile.description:
            profile_lines.append(f"- description: {profile.description}")
        profile_block = "\n".join(profile_lines)
        prompt = f"{prompt}\n## Agent profile\n{profile_block}\n"
        if profile.systemPrompt:
            prompt = f"{prompt}\n## Agent system prompt\n{profile.systemPrompt}\n"
        return prompt

    def _format_inputs(self, inputs: JSONValue) -> str:
        if inputs is None:
            return ""
        if isinstance(inputs, str):
            return inputs
        return json.dumps(inputs, indent=2, sort_keys=True)

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

    def _resolve_tool_allowlist(
        self,
        tool_allowlist: list[str] | None,
    ) -> tuple[set[str] | None, set[str] | None]:
        if tool_allowlist is None:
            return None, None
        normalized = [
            entry.strip()
            for entry in tool_allowlist
            if isinstance(entry, str) and entry.strip()
        ]
        if not normalized:
            return set(), set()
        allowed_tool_names = set(normalized)
        allowed_server_ids: set[str] = set()
        for name in allowed_tool_names:
            server_id, _tool_basename = split_namespaced_tool_name(name)
            if server_id is None:
                raise ValueError(
                    f"Tool allowlist entry must be namespaced with a server id: {name}"
                )
            allowed_server_ids.add(server_id)
        return allowed_tool_names, allowed_server_ids

    def _build_llm_request_payload(
        self,
        *,
        messages: list[BaseChatMessageUnion],
        llm_config: LLMConfig,
        allowed_tool_names: set[str] | None,
    ) -> dict[str, Any]:
        request, api_key_env = self.config.build_llm_params(llm_config)
        if api_key_env:
            api_key = self.api_keys.get(api_key_env)
            if api_key:
                request["api_key"] = api_key

        server_ids = self._resolve_mcp_server_ids(llm_config)
        if allowed_tool_names is not None and not allowed_tool_names:
            server_ids = []
        use_tool_search = self._should_use_anthropic_tool_search(llm_config)
        allow_tool_reference = bool(server_ids) and use_tool_search
        message_payload = [message.to_openai_format() for message in messages]
        self._strip_tool_reference_content(
            message_payload,
            allow_tool_reference=allow_tool_reference,
        )
        request["messages"] = message_payload
        self._maybe_apply_cache_prompting(request, message_payload)
        self._apply_anthropic_tool_search_headers(
            request,
            use_tool_search=use_tool_search,
            has_mcp_tools=bool(server_ids),
        )
        tools = self._build_tool_definitions(
            server_ids,
            use_tool_search=use_tool_search,
            allowed_tool_names=allowed_tool_names,
        )
        if tools:
            request["tools"] = tools
        if not request.get("model"):
            raise ValueError("LLM config must specify a model via config or override")
        return request

    def _resolve_mcp_server_ids(self, llm_config: LLMConfig) -> list[str]:
        if self.mcp_client.disabled:
            return []
        return self.config.resolve_mcp_server_ids(llm_config)

    def _should_use_anthropic_tool_search(self, llm_config: LLMConfig) -> bool:
        provider = (llm_config.provider or "").strip().lower()
        if provider:
            return "anthropic" in provider
        return self._is_claude_like_model(llm_config.model)

    def _build_tool_definitions(
        self,
        server_ids: list[str],
        *,
        use_tool_search: bool,
        allowed_tool_names: set[str] | None,
    ) -> list[dict[str, Any]]:
        if not server_ids:
            return []
        definitions = self._build_full_tool_definitions(
            server_ids,
            defer_loading=use_tool_search,
            include_search_tool=use_tool_search,
        )
        if allowed_tool_names is None:
            return list(definitions.values())
        if not allowed_tool_names:
            return []
        filtered = {
            name: payload
            for name, payload in definitions.items()
            if name in allowed_tool_names
        }
        missing = allowed_tool_names.difference(definitions.keys())
        if missing:
            raise KeyError(
                f"Allowed tools not found in MCP definitions: {sorted(missing)}"
            )
        return list(filtered.values())

    def _build_full_tool_definitions(
        self,
        server_ids: list[str],
        *,
        defer_loading: bool,
        include_search_tool: bool,
    ) -> dict[str, dict[str, Any]]:
        server_id_set = set(server_ids)
        init_tools = self.mcp_client.init_tool_definitions_for_servers(server_id_set)
        discoverable_tools = self.mcp_client.discoverable_tool_definitions_for_servers(
            server_id_set
        )
        discoverable_tool_names = set(discoverable_tools.keys())
        combined: dict[str, dict[str, Any]] = {}
        combined.update(init_tools)
        combined.update(discoverable_tools)
        if not combined:
            return {}
        tool_names = sorted(combined.keys())
        if not include_search_tool:
            tool_names = [name for name in tool_names if name != self._search_tool_name]
        if not tool_names:
            return {}
        payload: dict[str, dict[str, Any]] = {}
        has_non_deferred = False
        for name in tool_names:
            tool_payload = dict(combined[name])
            if defer_loading and name in discoverable_tool_names:
                tool_payload["defer_loading"] = True
            else:
                has_non_deferred = True
            payload[name] = tool_payload
        if defer_loading and not has_non_deferred and payload:
            first_name = next(iter(payload))
            payload[first_name].pop("defer_loading", None)
        return payload

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
        if extra_headers is None or not isinstance(extra_headers, dict):
            extra_headers = {}
        else:
            extra_headers = dict(extra_headers)
        existing_beta = extra_headers.get("anthropic-beta")
        extra_headers["anthropic-beta"] = self._merge_anthropic_beta_header(
            existing_beta
        )
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
        supports_cache = supports_prompt_caching(
            model=model,
            custom_llm_provider=provider,
        )
        if not supports_cache:
            return
        request["cache_control_injection_points"] = [
            {"location": "message", "role": "system"},
            {"location": "message", "index": -1},
        ]

    @staticmethod
    def _is_claude_like_model(model_name: str) -> bool:
        lowered = model_name.lower()
        return "claude" in lowered or any(
            lowered.startswith(prefix) for prefix in ("sonnet", "haiku", "opus")
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
        *,
        run: AgentRun,
        assistant_message: AssistantChatMessage,
        stream_assembler: ManagedStreamAssembler,
        tool_call_accumulator: ManagedToolCallAccumulator,
        preview_state: ManagedToolArgumentPreviewState,
        chunk: ModelResponseStream,
    ) -> None:
        choices = chunk.choices
        if not choices:
            return
        choice = choices[0]
        delta = choice.delta
        if not delta:
            return
        await self._handle_text_deltas(
            run=run,
            assistant_message=assistant_message,
            stream_assembler=stream_assembler,
            delta=delta,
        )
        await self._handle_tool_call_deltas(
            run=run,
            assistant_message=assistant_message,
            delta=delta,
            tool_call_accumulator=tool_call_accumulator,
            preview_state=preview_state,
        )

    async def _handle_text_deltas(
        self,
        *,
        run: AgentRun,
        assistant_message: AssistantChatMessage,
        stream_assembler: ManagedStreamAssembler,
        delta: Delta,
    ) -> None:
        text_deltas = self._build_text_deltas(delta, stream_assembler)
        if not text_deltas:
            return
        await self._append_stream_event(
            run,
            MessageDeltaEvent(
                message_id=assistant_message.id,
                content=text_deltas,
            ),
        )

    def _build_text_deltas(
        self,
        delta: Delta,
        stream_assembler: ManagedStreamAssembler,
    ) -> list[Any]:
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
        default_kind: str,
    ) -> list[StreamContentEntry]:
        if payload is None:
            return []
        raw_entries = payload if isinstance(payload, list) else [payload]
        normalized: list[StreamContentEntry] = []
        for raw_entry in raw_entries:
            entry = self._normalize_entry(raw_entry, default_kind=default_kind)
            if entry:
                normalized.append(entry)
        return normalized

    def _normalize_entry(
        self,
        raw_entry: Any,
        *,
        default_kind: str,
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

    def _coerce_stream_payload(self, entry: Any) -> dict[str, Any] | None:
        if isinstance(entry, dict):
            return entry
        model_dump = getattr(entry, "model_dump", None)
        if callable(model_dump):
            data = model_dump()
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

    def _iter_thinking_payloads(self, delta: Delta) -> list[Any]:
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
            return thinking_blocks
        return [thinking_blocks]

    async def _handle_tool_call_deltas(
        self,
        *,
        run: AgentRun,
        assistant_message: AssistantChatMessage,
        delta: Delta,
        tool_call_accumulator: ManagedToolCallAccumulator,
        preview_state: ManagedToolArgumentPreviewState,
    ) -> None:
        entries = delta.tool_calls
        if not entries:
            return
        for entry in entries:
            tool_call_event = tool_call_accumulator.apply_delta(entry)
            if not tool_call_event:
                continue
            arguments_delta = tool_call_event.arguments_delta
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
                arguments_delta=arguments_delta,
                tokens=tokens,
                dbe=self.dbe,
                tool_argument_metadata_by_name=(
                    {tool_name: annotations.toolArgumentPreview}
                    if annotations and annotations.toolArgumentPreview
                    else {}
                ),
            )
            event = preview_event or tool_call_event
            metadata = self._build_streaming_follow_metadata(
                assistant_message=assistant_message,
                tool_call_state=tool_call_accumulator.state,
                tokens_by_index={entry.index: tokens} if tokens is not None else None,
                run_id=run.id,
            )
            await self._append_stream_event(run, event, metadata=metadata)

    def _build_streaming_follow_metadata(
        self,
        *,
        assistant_message: AssistantChatMessage,
        tool_call_state: ManagedToolCallState,
        tokens_by_index: dict[int, list[PartialJsonStringToken]] | None,
        run_id: ID,
    ) -> dict[str, Any] | None:
        ids_by_type = build_streaming_follow_ids(
            assistant_message=assistant_message,
            tool_call_state=tool_call_state,
            tokens_by_index=tokens_by_index,
            dbe=self.dbe,
            annotations_by_name=self.mcp_client.tool_annotations_by_name,
        )
        if ids_by_type is None:
            return None
        normalized = normalize_ids_by_type(ids_by_type)
        if self._ai_follow_state_matches(run_id, normalized):
            return None
        self._ai_follow_state[run_id] = dict(normalized)
        return {"aiFollowIdsByType": normalized}

    def _ai_follow_state_matches(
        self,
        run_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> bool:
        state = self._ai_follow_state.get(run_id)
        if state is None:
            return False
        return ids_by_type_to_sets(state) == ids_by_type_to_sets(ids_by_type)

    def _append_tool_call_follow_update(
        self,
        run: AgentRun,
        tool_calls: list[ToolCall],
    ) -> None:
        ids_by_type = build_tool_call_follow_ids(
            tool_calls=tool_calls,
            dbe=self.dbe,
            annotations_by_name=self.mcp_client.tool_annotations_by_name,
        )
        if ids_by_type is None:
            return
        run.events.append(
            RunEvent(
                type=RunEventType.message,
                metadata={"aiFollowIdsByType": normalize_ids_by_type(ids_by_type)},
            )
        )
        self.dbe.write_agent_run(run)

    async def _execute_tool_calls(
        self,
        *,
        run: AgentRun,
        tool_calls: list[ToolCall],
        allowed_tool_names: set[str] | None,
        allowed_server_ids: set[str] | None,
        share_session_id: str | None,
        active_project_config_id: ID,
    ) -> list[ToolChatMessage]:
        if not tool_calls:
            return []
        executed_calls: list[ToolCall] = []
        tool_results: list[ToolChatMessage] = []
        for tool_call in tool_calls:
            tool_name = tool_call.function.name.strip()
            if allowed_tool_names is not None and tool_name not in allowed_tool_names:
                tool_results.append(self._build_disallowed_tool_message(tool_call))
                continue
            executed_calls.append(tool_call)
        execute_action = build_execute_tool_calls_action(
            project_config_id=active_project_config_id,
            chat_id=run.id,
            tool_calls=executed_calls,
            allowed_server_ids=allowed_server_ids,
            share_session_id=share_session_id,
        )
        if execute_action is None:
            return tool_results
        action_results = await self._apply_actions(run, [execute_action])
        tool_results.extend(action_results)
        return tool_results

    async def _apply_actions(
        self,
        run: AgentRun,
        actions: list[ManagedAction],
    ) -> list[ToolChatMessage]:
        tool_results: list[ToolChatMessage] = []
        queue = list(actions)
        while queue:
            action = queue.pop(0)
            if isinstance(action, EmitChunkAction):
                if isinstance(action.chunk, ToolResultEvent):
                    tool_results.append(action.chunk.result)
                    self._append_tool_result_event(run, action.chunk.result)
                await self._append_stream_event(run, action.chunk)
                continue
            if isinstance(action, UpdateAIFollowAction):
                run.events.append(
                    RunEvent(
                        type=RunEventType.message,
                        metadata={
                            "aiFollowIdsByType": normalize_ids_by_type(
                                action.ids_by_type
                            )
                        },
                    )
                )
                run_state = self._sessions.get(run.id)
                if run_state and run_state.project_config_id:
                    await self.websocket_msg_handler.broadcast_ai_follow_tool_arguments_update(
                        run_state.project_config_id,
                        run.id,
                        action.ids_by_type,
                        share_session_id=run_state.share_session_id,
                    )
                continue
            if isinstance(action, UpdateAIFollowResultAction):
                run.events.append(
                    RunEvent(
                        type=RunEventType.message,
                        metadata={
                            "aiFollowResultIdsByType": normalize_ids_by_type(
                                action.ids_by_type
                            )
                        },
                    )
                )
                run_state = self._sessions.get(run.id)
                if run_state and run_state.project_config_id:
                    await self.websocket_msg_handler.broadcast_ai_follow_tool_result_update(
                        run_state.project_config_id,
                        run.id,
                        action.ids_by_type,
                        share_session_id=run_state.share_session_id,
                    )
                continue
            if isinstance(action, ExecuteToolCallsAction):
                next_actions = await self._action_executor.apply(action)
                if next_actions:
                    queue = next_actions + queue
        self.dbe.write_agent_run(run)
        return tool_results

    async def _append_stream_event(
        self,
        run: AgentRun,
        chunk: LLMStreamingResponseChunk,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        run.events.append(
            RunEvent(
                type=RunEventType.stream,
                streamChunk=chunk,
                metadata=metadata or {},
            )
        )
        self.dbe.write_agent_run(run)
        run_state = self._sessions.get(run.id)
        if run_state:
            await self.websocket_msg_handler.send_streaming_response(
                run.id,
                chunk,
                section_id=run_state.section_id,
                share_session_id=run_state.share_session_id,
            )
            if metadata:
                ids_by_type = metadata.get("aiFollowIdsByType")
                if ids_by_type and run_state.project_config_id:
                    await self.websocket_msg_handler.broadcast_ai_follow_tool_arguments_update(
                        run_state.project_config_id,
                        run.id,
                        ids_by_type,
                        share_session_id=run_state.share_session_id,
                    )

    def _append_tool_call_events(
        self, run: AgentRun, tool_calls: list[ToolCall]
    ) -> None:
        for tool_call in tool_calls:
            run.events.append(
                RunEvent(
                    type=RunEventType.tool_call,
                    toolCall=tool_call,
                )
            )
        self.dbe.write_agent_run(run)

    def _append_tool_result_event(
        self, run: AgentRun, tool_result: ToolChatMessage
    ) -> None:
        run.events.append(
            RunEvent(
                type=RunEventType.tool_result,
                toolResult=tool_result,
            )
        )
        self.dbe.write_agent_run(run)

    def _build_disallowed_tool_message(self, tool_call: ToolCall) -> ToolChatMessage:
        tool_name = tool_call.function.name.strip()
        call_result = build_disallowed_tool_result(tool_name)
        sanitized_arguments = sanitize_tool_arguments(
            self.dbe,
            dict(tool_call.function.arguments or {}),
        )
        return ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=sanitized_arguments,
            content=call_result.content,
            is_error=call_result.isError,
            result=call_result.model_dump(),
            started_at=get_now_timestamp(),
            completed_at=get_now_timestamp(),
        )
