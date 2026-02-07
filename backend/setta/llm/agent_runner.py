import asyncio
import logging
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, AsyncIterator, Iterator, Literal

import litellm
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.llms.openai import ChatCompletionToolParam
from litellm.types.utils import Delta, ModelResponseStream
from litellm.utils import supports_prompt_caching
from pydantic import BaseModel

from setta.agentic.agentic_context import (
    AgenticContextPayload,
    build_agentic_context_payload,
    build_agentic_section_summary_source,
)
from setta.agentic.agentic_scope import (
    AgenticContext,
    AgenticScope,
    resolve_agentic_scope,
    resolve_context_edges,
)
from setta.agentic.agentic_summary_cache import (
    build_agentic_summary_cache_key,
    load_cached_agentic_summary_texts_for_chat_section,
    write_cached_agentic_summaries,
)
from setta.agentic.agentic_summary_limits import MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN
from setta.agentic.chat_titles import (
    build_chat_title_input,
    build_deterministic_chat_title,
    sanitize_llm_title,
)
from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    get_run_last_updated,
)
from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.run_outputs import build_run_outputs
from setta.agentic.store import (
    create_agent_run,
    list_agent_runs_by_metadata,
    load_agent_run,
    save_agent_run,
)
from setta.agentic.system_prompt import build_agent_system_prompt
from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
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
from setta.llm.chat_toolkit.section_sync import apply_stream_delta
from setta.llm.config import AllLLMConfigs
from setta.logging.tasks import spawn_background_task
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
    EngineType,
    RunEvent,
)
from setta.types.agentic_edges import AgenticEdgeContextMode
from setta.types.chat_messages import (
    AssistantChatMessage,
    ContentChatMessage,
    MessageTextContent,
    SystemChatMessage,
    ToolCall,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.chat_stream_events import (
    LLMStreamingResponseChunk,
    MessageContentDelta,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    ToolResultEvent,
)
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
)
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    convert_backend_to_single_config,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionState
from setta.types.websocket import AIFollowToolArgumentsUpdateContent
from setta.utils.chat_attachments import build_attachment_content_blocks
from setta.utils.constants import CWD, C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"
ANTHROPIC_TOOL_SEARCH_BETA_HEADER = "advanced-tool-use-2025-11-20"
DEFAULT_ANTHROPIC_THINKING_BUDGET = 1024
MAX_AGENTIC_SECTION_SUMMARY_OUTPUT_CHARS = 1200
MAX_CHAT_TITLE_INPUT_CHARS = 2000


@dataclass(frozen=True)
class ToolAllowlist:
    tool_names: set[str]
    tool_basenames: set[str]
    server_ids: set[str]


@dataclass(frozen=True)
class AgentRunContext:
    run: AgentRun
    profile: AgentProfile
    llm_config: LLMConfig
    engine_config_id: ID
    project_config_id: ID
    project_state: ProjectStateSingleConfig
    chat_id: ID
    section_id: ID | None
    thinking: bool
    system_prompt: str
    allowlist: ToolAllowlist | None
    agentic_scope: AgenticScope
    agentic_context: AgenticContext
    context_payload: AgenticContextPayload | None
    emit_stream: bool
    emit_ai_follow: bool


@dataclass
class AIFollowState:
    ids_by_type: dict[FollowIdType, list[ID]]


class _NoopChatHistory:
    def append(self, _chat_id: ID, _messages: list[BaseChatMessageUnion]) -> None:
        return None

    def set_system_prompt(self, _chat_id: ID, _system_prompt: str) -> None:
        return None


class AgentRunner:
    def __init__(
        self,
        dbe: DBE,
        mcp_client: MultiMCPClient,
        websocket_msg_handler: WMHFrontendSender,
        *,
        share_session_id: str | None = None,
        share_mode: bool = False,
    ) -> None:
        self.dbe = dbe
        self.mcp_client = mcp_client
        self.websocket_msg_handler = websocket_msg_handler
        self.share_session_id = share_session_id
        self.share_mode = share_mode
        self.config: AllLLMConfigs = AllLLMConfigs()
        self.api_keys: dict[str, str] = {}
        self._raw_env_vars: dict[str, str] = {}
        self._tasks: dict[ID, asyncio.Task[Any]] = {}
        self._runs: dict[ID, AgentRun] = {}
        self._chat_states: dict[ID, ChatSectionState] = {}
        self._ai_follow_state: dict[tuple[ID, ID], AIFollowState] = {}
        self._search_tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
        )
        self._tool_executor = ManagedActionExecutor(
            chat_history=_NoopChatHistory(),
            websocket_msg_handler=self.websocket_msg_handler,
            mcp_client=self.mcp_client,
            dbe=self.dbe,
            search_tool_name=self._search_tool_name,
            logger=logger,
        )
        self.system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()

    @property
    def disabled(self) -> bool:
        return False

    def update_config(self, config: AllLLMConfigs) -> None:
        self.config = config
        self._sync_api_keys()

    def update_api_keys(self, payload: dict[str, str]) -> None:
        self._raw_env_vars = dict(payload)
        self._sync_api_keys()

    def get_ai_follow_snapshot(
        self, project_config_id: ID
    ) -> list[AIFollowToolArgumentsUpdateContent]:
        snapshot: list[AIFollowToolArgumentsUpdateContent] = []
        for (state_project_config_id, chat_id), state in self._ai_follow_state.items():
            if state_project_config_id != project_config_id:
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

    def get_live_chat_state(self, run_id: ID) -> ChatSectionState | None:
        state = self._chat_states.get(run_id)
        if state is None:
            return None
        return state.model_copy(deep=True)

    def _sync_api_keys(self) -> None:
        if not self._raw_env_vars:
            self.api_keys = {}
            return
        self.api_keys = filter_env_vars_for_config(self._raw_env_vars, self.config)

    def start_run(
        self,
        profile: AgentProfile,
        inputs: dict[str, Any] | None,
        *,
        emit_stream: bool = True,
        emit_ai_follow: bool = True,
    ) -> AgentRun:
        context = self._build_context(
            profile,
            inputs,
            emit_stream=emit_stream,
            emit_ai_follow=emit_ai_follow,
        )
        run = context.run
        self._runs[run.id] = run
        save_agent_run(self.dbe, run)
        self._init_chat_state(run)
        self._record_event(
            run,
            "run_started",
            {
                "profileId": str(profile.id),
                "engineConfigId": str(context.engine_config_id),
                "projectConfigId": str(context.project_config_id),
                "chatId": str(context.chat_id),
                "sectionId": str(context.section_id) if context.section_id else None,
            },
        )
        self._record_snapshot(run, context.project_config_id)
        task = spawn_background_task(
            lambda: self._run_agent(context),
            label="agent-run",
            project_config_id=str(context.project_config_id),
            extra_values={"run_id": str(run.id)},
        )

        def _cleanup(_task: asyncio.Task[Any], run_id: ID) -> None:
            self._tasks.pop(run_id, None)
            self._runs.pop(run_id, None)
            self._chat_states.pop(run_id, None)

        task.add_done_callback(lambda t, run_id=run.id: _cleanup(t, run_id))
        self._tasks[run.id] = task
        return run

    async def wait_for_run(self, run_id: ID, timeout: float | None = None) -> AgentRun:
        task = self._tasks.get(run_id)
        if task is not None:
            if timeout is None:
                await task
            else:
                await asyncio.wait_for(task, timeout=timeout)
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"Agent run {run_id} not found")
        return run

    async def run_sub_agent(
        self,
        profile: AgentProfile,
        inputs: dict[str, Any] | None,
    ) -> AgentRun:
        context = self._build_context(
            profile,
            inputs,
            emit_stream=False,
            emit_ai_follow=False,
        )
        run = context.run
        save_agent_run(self.dbe, run)
        self._record_event(
            run,
            "run_started",
            {
                "profileId": str(profile.id),
                "engineConfigId": str(context.engine_config_id),
                "projectConfigId": str(context.project_config_id),
                "chatId": str(context.chat_id),
                "sectionId": str(context.section_id) if context.section_id else None,
            },
        )
        self._record_snapshot(run, context.project_config_id)
        await self._run_agent(context)
        loaded = load_agent_run(self.dbe, run.id)
        return loaded if loaded is not None else run

    async def stop_run(self, run_id: ID) -> AgentRun:
        task = self._tasks.get(run_id)
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"Agent run {run_id} not found")
        if task is not None and task.done():
            return run
        if run.status in (
            AgentRunStatus.completed,
            AgentRunStatus.failed,
            AgentRunStatus.cancelled,
        ):
            return run
        if task and not task.done():
            run.status = AgentRunStatus.cancelled
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_cancelled", {})
            task.cancel()
            return run
        run.status = AgentRunStatus.cancelled
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        self._record_event(run, "run_cancelled", {})
        return run

    async def _run_agent(self, context: AgentRunContext) -> None:
        run = context.run
        context = await self._with_agentic_context_payload(context)
        messages = self._build_initial_messages(context.run.inputs)
        payload = context.context_payload
        if context.emit_ai_follow and payload is not None and payload.section_ids:
            await self._apply_actions(
                [
                    UpdateAIFollowAction(
                        project_config_id=context.project_config_id,
                        chat_id=context.chat_id,
                        ids_by_type={"section": payload.section_ids},
                    )
                ],
                context,
            )
        usage_summary: dict[str, int] | None = None
        cost_value: float | None = None
        try:
            while True:
                payload = self._build_llm_request_payload(
                    llm_config=context.llm_config,
                    messages=messages,
                    thinking=context.thinking,
                    system_prompt=context.system_prompt,
                    allowlist=context.allowlist,
                    agentic_scope=context.agentic_scope,
                )
                assistant_message = AssistantChatMessage(content=[])
                tool_call_state = ManagedToolCallState()
                tool_call_accumulator = ManagedToolCallAccumulator(
                    assistant_message,
                    tool_call_state,
                )
                preview_state = ManagedToolArgumentPreviewState()
                stream_assembler = ManagedStreamAssembler(assistant_message)

                stop_event_sent = False
                tool_results: list[ToolChatMessage] = []
                try:
                    await self._apply_actions(
                        [
                            EmitChunkAction(
                                context.chat_id,
                                MessageStartEvent(message=assistant_message),
                            )
                        ],
                        context,
                    )
                    stream_result = await litellm.acompletion(**payload, stream=True)
                    if not isinstance(stream_result, CustomStreamWrapper):
                        raise TypeError(
                            "LLM streaming must return a CustomStreamWrapper"
                        )

                    async for chunk in self._iterate_stream(stream_result):
                        usage_summary = self._merge_usage_summary(
                            usage_summary, self._extract_usage_from_chunk(chunk)
                        )
                        cost_value = self._coalesce_cost(
                            cost_value, self._extract_cost_from_chunk(chunk)
                        )
                        await self._handle_stream_chunk(
                            context,
                            assistant_message,
                            stream_assembler,
                            tool_call_accumulator,
                            preview_state,
                            chunk,
                        )

                    await self._apply_actions(
                        [
                            EmitChunkAction(
                                context.chat_id,
                                MessageStopEvent(message_id=assistant_message.id),
                            )
                        ],
                        context,
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
                        context,
                        parsed_tool_calls,
                    )
                    run.toolCalls.extend(
                        [call.model_dump(mode="json") for call in parsed_tool_calls]
                    )
                    save_agent_run(self.dbe, run)

                    tool_results = await self._execute_tool_calls(
                        context,
                        parsed_tool_calls,
                    )
                    if assistant_message.tool_calls:
                        await self._apply_actions(
                            [
                                UpdateAIFollowAction(
                                    project_config_id=context.project_config_id,
                                    chat_id=context.chat_id,
                                    ids_by_type={},
                                )
                            ],
                            context,
                        )
                    messages.append(assistant_message)
                    if tool_results:
                        messages.extend(tool_results)
                    await self._apply_actions(
                        [
                            EmitChunkAction(
                                context.chat_id,
                                MessageFinalizedEvent(message=assistant_message),
                            )
                        ],
                        context,
                    )
                except asyncio.CancelledError:
                    if not stop_event_sent:
                        await self._apply_actions(
                            [
                                EmitChunkAction(
                                    context.chat_id,
                                    MessageStopEvent(message_id=assistant_message.id),
                                )
                            ],
                            context,
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
                            context,
                            parsed_tool_calls,
                        )
                        messages.append(assistant_message)
                        await self._apply_actions(
                            [
                                EmitChunkAction(
                                    context.chat_id,
                                    MessageFinalizedEvent(message=assistant_message),
                                )
                            ],
                            context,
                        )
                    await self._apply_actions(
                        [
                            UpdateAIFollowAction(
                                project_config_id=context.project_config_id,
                                chat_id=context.chat_id,
                                ids_by_type={},
                            )
                        ],
                        context,
                    )
                    metadata = self._build_run_metadata(context)
                    run.outputs = self._build_outputs(
                        messages,
                        metadata=metadata,
                        usage=usage_summary,
                        cost=cost_value,
                    )
                    if run.outputs is not None:
                        await self._apply_chat_title_to_outputs(
                            context,
                            messages=messages,
                            outputs=run.outputs,
                            allow_llm=False,
                        )
                    if cost_value is not None:
                        run.cost = cost_value
                    was_cancelled = run.status == AgentRunStatus.cancelled
                    if not was_cancelled:
                        run.status = AgentRunStatus.cancelled
                        run.finishedAt = get_now_timestamp()
                    save_agent_run(self.dbe, run)
                    if not was_cancelled:
                        self._record_event(run, "run_cancelled", {})
                    raise
                except Exception as exc:
                    if not stop_event_sent:
                        await self._apply_actions(
                            [
                                EmitChunkAction(
                                    context.chat_id,
                                    MessageStopEvent(message_id=assistant_message.id),
                                )
                            ],
                            context,
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
                            context,
                            parsed_tool_calls,
                        )
                        messages.append(assistant_message)
                        await self._apply_actions(
                            [
                                EmitChunkAction(
                                    context.chat_id,
                                    MessageFinalizedEvent(message=assistant_message),
                                )
                            ],
                            context,
                        )
                    await self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                        exc,
                        label="agent-run",
                        message="Agent run failed; aborting response",
                        severity=SettaBackendLogEventSeverity.error,
                        project_config_id=context.project_config_id,
                        logger=logger,
                        context={"run_id": str(run.id)},
                    )
                    await self._apply_actions(
                        [
                            UpdateAIFollowAction(
                                project_config_id=context.project_config_id,
                                chat_id=context.chat_id,
                                ids_by_type={},
                            )
                        ],
                        context,
                    )
                    metadata = self._build_run_metadata(context)
                    run.outputs = self._build_outputs(
                        messages,
                        metadata=metadata,
                        usage=usage_summary,
                        cost=cost_value,
                    )
                    if run.outputs is not None:
                        await self._apply_chat_title_to_outputs(
                            context,
                            messages=messages,
                            outputs=run.outputs,
                            allow_llm=False,
                        )
                    if cost_value is not None:
                        run.cost = cost_value
                    run.status = AgentRunStatus.failed
                    run.finishedAt = get_now_timestamp()
                    save_agent_run(self.dbe, run)
                    self._record_event(
                        run,
                        "run_failed",
                        {"error": str(exc)},
                    )
                    return

                should_continue = bool(assistant_message.tool_calls) and bool(
                    tool_results
                )
                if not should_continue:
                    break

            run.status = AgentRunStatus.completed
            run.finishedAt = get_now_timestamp()
            metadata = self._build_run_metadata(context)
            run.outputs = self._build_outputs(
                messages,
                metadata=metadata,
                usage=usage_summary,
                cost=cost_value,
            )
            if run.outputs is not None:
                await self._apply_chat_title_to_outputs(
                    context,
                    messages=messages,
                    outputs=run.outputs,
                    allow_llm=True,
                )
            if cost_value is not None:
                run.cost = cost_value
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_completed", {})
        finally:
            self._tasks.pop(run.id, None)
            self._runs.pop(run.id, None)

    async def _execute_tool_calls(
        self,
        context: AgentRunContext,
        parsed_tool_calls: list[ToolCall],
    ) -> list[ToolChatMessage]:
        if not parsed_tool_calls:
            return []
        allowed_calls: list[ToolCall] = []
        disallowed_calls: list[ToolCall] = []
        for call in parsed_tool_calls:
            if self._is_tool_allowed(call.function.name, context.allowlist):
                allowed_calls.append(call)
            else:
                disallowed_calls.append(call)

        tool_results: list[ToolChatMessage] = []
        execute_action = build_execute_tool_calls_action(
            project_config_id=context.project_config_id,
            chat_id=context.chat_id,
            tool_calls=allowed_calls,
            allowed_server_ids=self._resolve_allowed_server_ids(
                context.allowlist,
                set(self._resolve_mcp_server_ids(context.llm_config)),
            ),
            share_session_id=self.share_session_id,
            agentic_scope=context.agentic_scope,
            agentic_context=context.agentic_context,
        )
        if execute_action is not None:
            tool_results = await self._apply_actions([execute_action], context)
        if disallowed_calls:
            disallowed_results = await self._emit_disallowed_tool_results(
                context,
                disallowed_calls,
            )
            tool_results.extend(disallowed_results)
        return tool_results

    async def _emit_disallowed_tool_results(
        self,
        context: AgentRunContext,
        tool_calls: list[ToolCall],
    ) -> list[ToolChatMessage]:
        results: list[ToolChatMessage] = []
        for tool_call in tool_calls:
            tool_name = tool_call.function.name.strip()
            started_at = get_now_timestamp()
            call_result = build_disallowed_tool_result(tool_name)
            completed_at = get_now_timestamp()
            sanitized_arguments = sanitize_tool_arguments(
                self.dbe, dict(tool_call.function.arguments or {})
            )
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
            results.append(tool_chat_message)
            await self._apply_actions(
                [
                    EmitChunkAction(
                        context.chat_id,
                        ToolResultEvent(result=tool_chat_message),
                    )
                ],
                context,
            )
        return results

    def _build_context(
        self,
        profile: AgentProfile,
        inputs: dict[str, Any] | None,
        *,
        emit_stream: bool = True,
        emit_ai_follow: bool = True,
    ) -> AgentRunContext:
        project_state_backend = self.dbe.read_project_required()
        if project_state_backend.defaultProjectConfigId is None:
            raise KeyError("Project state does not define a default project config")
        if inputs and "projectConfigId" in inputs:
            raw_project_id = inputs["projectConfigId"]
            if not isinstance(raw_project_id, str):
                raise TypeError("projectConfigId must be a string")
            project_config_id = ID(raw_project_id)
        else:
            project_config_id = project_state_backend.defaultProjectConfigId
        if project_config_id not in project_state_backend.projectConfigs:
            raise KeyError(f"Unknown project config: {project_config_id}")
        if inputs and "chatId" in inputs:
            raw_chat_id = inputs["chatId"]
            if not isinstance(raw_chat_id, str):
                raise TypeError("chatId must be a string")
            chat_id = ID(raw_chat_id)
        else:
            chat_id = None
        if inputs and "sectionId" in inputs:
            raw_section_id = inputs["sectionId"]
            if not isinstance(raw_section_id, str):
                raise TypeError("sectionId must be a string")
            section_id = ID(raw_section_id)
        else:
            section_id = None
        thinking = False
        if inputs and "thinking" in inputs:
            raw_thinking = inputs["thinking"]
            if not isinstance(raw_thinking, bool):
                raise TypeError("thinking must be a boolean")
            thinking = raw_thinking
        payload_inputs = dict(inputs or {})
        engine_config_id, llm_config = self._resolve_engine_llm_config(profile)
        if "engineConfigId" in payload_inputs:
            raw_engine_config_id = payload_inputs["engineConfigId"]
            if not isinstance(raw_engine_config_id, str):
                raise TypeError("engineConfigId must be a string")
            if raw_engine_config_id != str(engine_config_id):
                raise KeyError("engineConfigId does not match resolved engine config")
        payload_inputs["engineConfigId"] = str(engine_config_id)
        run = create_agent_run(profile_id=profile.id, inputs=payload_inputs)
        system_prompt = self._build_system_prompt(profile, project_config_id)
        allowlist = self._normalize_tool_allowlist(profile)
        project_state = convert_backend_to_single_config(
            project_state_backend, project_config_id
        )
        agentic_scope = resolve_agentic_scope(project_state, section_id)
        resolved_chat_id = chat_id or run.id
        logger.debug(
            "Resolved agentic scope for managed run (project=%s, chat=%s, section=%s, read=%s write=%s context=%s peer=%s structural=%s).",
            project_config_id,
            resolved_chat_id,
            section_id,
            len(agentic_scope.read_section_ids),
            len(agentic_scope.write_section_ids),
            len(agentic_scope.context_section_ids),
            len(agentic_scope.peer_chat_section_ids),
            agentic_scope.structural_allowed,
        )
        agentic_context = AgenticContext(
            project_config_id=project_config_id,
            chat_id=resolved_chat_id,
            section_id=section_id,
        )
        return AgentRunContext(
            run=run,
            profile=profile,
            llm_config=llm_config,
            engine_config_id=engine_config_id,
            project_config_id=project_config_id,
            project_state=project_state,
            chat_id=resolved_chat_id,
            section_id=section_id,
            thinking=thinking,
            system_prompt=system_prompt,
            allowlist=allowlist,
            agentic_scope=agentic_scope,
            agentic_context=agentic_context,
            context_payload=None,
            emit_stream=emit_stream,
            emit_ai_follow=emit_ai_follow,
        )

    def _normalize_tool_allowlist(self, profile: AgentProfile) -> ToolAllowlist | None:
        if not profile.toolAllowlist:
            return None
        tool_names: set[str] = set()
        tool_basenames: set[str] = set()
        server_ids: set[str] = set()
        for entry in profile.toolAllowlist:
            normalized = entry.strip()
            if not normalized:
                raise ValueError("toolAllowlist entries must be non-empty strings")
            if "__" in normalized:
                server_id, tool_name = split_namespaced_tool_name(normalized)
                if server_id is None or not tool_name:
                    raise ValueError(f"Invalid tool allowlist entry: {entry}")
                if server_id not in self.config.mcpServers:
                    raise KeyError(f"Unknown MCP server '{server_id}' in allowlist")
                tool_names.add(normalized)
                server_ids.add(server_id)
            elif normalized in self.config.mcpServers:
                server_ids.add(normalized)
            else:
                tool_basenames.add(normalized)
        return ToolAllowlist(
            tool_names=tool_names,
            tool_basenames=tool_basenames,
            server_ids=server_ids,
        )

    def _resolve_engine_llm_config(self, profile: AgentProfile) -> tuple[ID, LLMConfig]:
        engine_config_id = profile.engineConfigId
        if engine_config_id is None:
            raise KeyError("Agent profile missing engine config id")
        resolved = resolve_engine_config(self.dbe, self.config, engine_config_id)
        if resolved.engine_config.engineType != EngineType.setta_llm:
            raise ValueError("Agent runner requires a Setta LLM engine config")
        if resolved.llm_config is None:
            raise ValueError("Engine config did not resolve an LLM config")
        return engine_config_id, resolved.llm_config

    def _build_system_prompt(
        self,
        profile: AgentProfile,
        project_config_id: ID,
    ) -> str:
        return build_agent_system_prompt(
            base_prompt=self.system_prompt,
            profile=profile,
            project_config_id=project_config_id,
            dbe=self.dbe,
        )

    def _record_snapshot(self, run: AgentRun, project_config_id: ID) -> None:
        project_state = self.dbe.read_project_required()
        _, canonical_to_temporary = self.dbe.read_temporary_id_map()
        self._record_event(
            run,
            "snapshot",
            {
                "projectConfigId": str(project_config_id),
                "projectState": project_state.model_dump(mode="json"),
                "temporaryIdMap": {
                    str(k): str(v) for k, v in canonical_to_temporary.items()
                },
            },
        )

    def _build_initial_messages(
        self, inputs: dict[str, Any] | None
    ) -> list[BaseChatMessageUnion]:
        messages: list[BaseChatMessageUnion] = []
        if inputs and "messages" in inputs:
            raw_messages = inputs["messages"]
            if not isinstance(raw_messages, list):
                raise TypeError("messages must be a list")
            for raw in raw_messages:
                messages.append(BaseChatMessageTypeAdapter.validate_python(raw))
        if inputs and "prompt" in inputs:
            prompt = inputs["prompt"]
            if not isinstance(prompt, str):
                raise TypeError("prompt must be a string")
            if prompt.strip():
                messages.append(
                    UserChatMessage(
                        content=[MessageTextContent(text=prompt)],
                    )
                )
        return messages

    async def _with_agentic_context_payload(
        self,
        context: AgentRunContext,
    ) -> AgentRunContext:
        if context.section_id is None:
            return context
        payload = await self._build_agentic_context_payload(context)
        if payload is None or not payload.text.strip():
            return context
        base_prompt = context.system_prompt.strip()
        payload_text = payload.text.strip()
        combined = (
            f"{base_prompt}\n\n{payload_text}".strip() if base_prompt else payload_text
        )
        return replace(
            context,
            context_payload=payload,
            system_prompt=combined,
        )

    async def _build_agentic_context_payload(
        self,
        context: AgentRunContext,
    ) -> AgenticContextPayload | None:
        section_id = context.section_id
        if section_id is None:
            return None

        project_state = context.project_state
        (
            summary_text_by_section_id,
            summary_by_section,
        ) = await self._resolve_agentic_summary_text_by_section_id(
            project_state,
            chat_section_id=section_id,
            project_config_id=context.project_config_id,
            llm_config=context.llm_config,
        )
        temporary_to_canonical, canonical_to_temporary = (
            self.dbe.read_temporary_id_map()
        )
        map_size_before = len(canonical_to_temporary)

        def _format_section_id(entry: ID) -> str:
            return str(
                convert_canonical_ids_to_temporary(
                    entry,
                    canonical_to_temporary,
                    temporary_to_canonical,
                )
            )

        payload = build_agentic_context_payload(
            project_state,
            section_id,
            format_section_id=_format_section_id,
            summary_text_by_section_id=summary_text_by_section_id,
            summary_by_section=summary_by_section,
        )
        if len(canonical_to_temporary) != map_size_before:
            self.dbe.write_temporary_id_map(canonical_to_temporary)
        if not payload.text.strip():
            return None
        return payload

    async def _resolve_agentic_summary_text_by_section_id(
        self,
        project_state: ProjectStateSingleConfig,
        *,
        chat_section_id: ID,
        project_config_id: ID,
        llm_config: LLMConfig,
    ) -> tuple[dict[ID, str], dict[ID, object] | None]:
        context_edges = resolve_context_edges(project_state, chat_section_id)
        summary_section_ids = [
            section_id
            for section_id, context_mode in context_edges
            if context_mode == AgenticEdgeContextMode.summary
            and section_id in project_state.sections
        ]
        if not summary_section_ids:
            return {}, None

        project_summary = build_project_state_summary(project_state)
        summary_by_section = {
            entry.sectionId: entry for entry in project_summary.sections
        }
        cached = load_cached_agentic_summary_texts_for_chat_section(
            self.dbe,
            project_state=project_state,
            project_config_id=project_config_id,
            chat_section_id=chat_section_id,
            summary_by_section=summary_by_section,
        )
        missing_section_ids: list[ID] = []
        for section_id in summary_section_ids:
            if section_id not in cached:
                missing_section_ids.append(section_id)
        summary_edge_count = len(summary_section_ids)

        if summary_edge_count and not missing_section_ids:
            logger.debug(
                "Agentic summary cache hit (project=%s, chatSection=%s, edges=%s).",
                project_config_id,
                chat_section_id,
                summary_edge_count,
            )
        if not missing_section_ids:
            return cached, summary_by_section
        cache_updates: dict[str, dict[str, Any]] = {}

        deferred_due_to_cap = max(
            len(missing_section_ids) - MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN, 0
        )
        logger.info(
            "Agentic summary cache miss (project=%s, chatSection=%s, edges=%s cached=%s missing=%s deferred=%s, llm=%s).",
            project_config_id,
            chat_section_id,
            summary_edge_count,
            len(cached),
            len(missing_section_ids),
            deferred_due_to_cap,
            llm_config.id,
        )

        generated_count = 0
        skipped_empty_count = 0
        attempted_count = 0
        for section_id in missing_section_ids[:MAX_AGENTIC_SECTION_SUMMARIES_PER_RUN]:
            if section_id not in project_state.projectConfig.sectionVariantMap:
                raise KeyError(f"Section {section_id} missing variant mapping.")
            variant_id = project_state.projectConfig.sectionVariantMap[section_id]
            source = build_agentic_section_summary_source(
                project_state,
                section_id,
                summary_by_section=summary_by_section,
            )
            if not source.raw_text.strip():
                skipped_empty_count += 1
                continue
            attempted_count += 1
            cache_key = build_agentic_summary_cache_key(
                project_config_id=project_config_id,
                section_id=section_id,
                variant_id=variant_id,
                content_hash=source.content_hash,
            )
            generated_summary = await self._generate_agentic_section_summary(
                llm_config,
                source=source,
            )
            if not generated_summary:
                continue
            normalized = generated_summary.strip()
            if not normalized:
                continue
            cache_updates[cache_key] = {
                "summary": normalized,
                "createdAtMs": int(get_now_timestamp().timestamp() * 1000),
                "metadata": {
                    "llmConfigId": llm_config.id,
                    "model": llm_config.model,
                },
            }
            cached[section_id] = normalized
            generated_count += 1
        if cache_updates:
            write_cached_agentic_summaries(self.dbe, updates=cache_updates)
        logger.info(
            "Agentic summary generation complete (project=%s, chatSection=%s, attempted=%s generated=%s skippedEmpty=%s).",
            project_config_id,
            chat_section_id,
            attempted_count,
            generated_count,
            skipped_empty_count,
        )
        return cached, summary_by_section

    async def _generate_agentic_section_summary(
        self,
        llm_config: LLMConfig,
        *,
        source,
    ) -> str | None:
        system = (
            "You summarize content for an engineering agent.\n"
            "Return 5-12 concise markdown bullets.\n"
            "Do not invent facts. Do not include IDs. Do not add prose outside bullets."
        )
        user = (
            "Summarize the following section content for use as automatic prompt context.\n\n"
            f"{source.prompt_text}".strip()
        )
        try:
            raw = await self._run_utility_completion(
                llm_config,
                system_prompt=system,
                user_prompt=user,
                max_tokens=256,
                temperature=0,
            )
        except Exception:
            logger.info(
                "Agentic summary generation failed; falling back to deterministic context (section=%s, llm=%s).",
                source.section_id,
                llm_config.id,
                exc_info=True,
            )
            return None
        if raw is None:
            return None
        normalized = self._normalize_bullets(raw)
        if len(normalized) > MAX_AGENTIC_SECTION_SUMMARY_OUTPUT_CHARS:
            normalized = normalized[:MAX_AGENTIC_SECTION_SUMMARY_OUTPUT_CHARS].rstrip()
        return normalized or None

    def _find_existing_chat_title(
        self,
        *,
        chat_id: ID,
        project_config_id: ID,
        title_input_hash: str,
        exclude_run_id: ID,
    ) -> str | None:
        candidates = list_agent_runs_by_metadata(
            self.dbe,
            run_type=LLM_CHAT_RUN_TYPE,
            chat_id=chat_id,
            project_config_id=project_config_id,
        )
        best_title: str | None = None
        best_updated = None
        for run in candidates:
            if run.id == exclude_run_id:
                continue
            if run.status != AgentRunStatus.completed:
                continue
            outputs = run.outputs
            if not isinstance(outputs, dict):
                continue
            raw_title = outputs.get("name")
            if not isinstance(raw_title, str) or not raw_title.strip():
                continue
            raw_hash = outputs.get("nameInputHash")
            if not isinstance(raw_hash, str) or raw_hash != title_input_hash:
                continue
            updated_at = get_run_last_updated(run)
            if best_updated is None or updated_at > best_updated:
                best_updated = updated_at
                best_title = raw_title.strip()
        return best_title

    async def _apply_chat_title_to_outputs(
        self,
        context: AgentRunContext,
        *,
        messages: list[BaseChatMessageUnion],
        outputs: dict[str, Any],
        allow_llm: bool,
    ) -> None:
        inputs = context.run.inputs
        if not isinstance(inputs, dict):
            return
        raw_run_type = inputs.get("runType")
        if not isinstance(raw_run_type, str) or raw_run_type != LLM_CHAT_RUN_TYPE:
            return

        title_result = build_deterministic_chat_title(messages)
        title_input_hash = title_result.input_hash

        existing = self._find_existing_chat_title(
            chat_id=context.chat_id,
            project_config_id=context.project_config_id,
            title_input_hash=title_input_hash,
            exclude_run_id=context.run.id,
        )
        if existing:
            outputs["name"] = existing
            outputs["nameInputHash"] = title_input_hash
            outputs["nameSource"] = "reused"
            logger.info(
                "Reused chat title (project=%s, chat=%s, section=%s).",
                context.project_config_id,
                context.chat_id,
                context.section_id,
            )
            return

        outputs["name"] = title_result.title
        outputs["nameInputHash"] = title_input_hash
        outputs["nameSource"] = "deterministic"
        if not allow_llm:
            return

        raw_title_input = build_chat_title_input(messages)
        title_input = raw_title_input.strip()
        if not title_input:
            return
        if len(title_input) > MAX_CHAT_TITLE_INPUT_CHARS:
            title_input = title_input[:MAX_CHAT_TITLE_INPUT_CHARS].rstrip() + "..."

        generated = await self._generate_llm_chat_title(
            context.llm_config,
            title_input=title_input,
        )
        if generated:
            outputs["name"] = generated
            outputs["nameInputHash"] = title_input_hash
            outputs["nameSource"] = "llm"
            logger.info(
                "Generated chat title (project=%s, chat=%s, section=%s, llm=%s).",
                context.project_config_id,
                context.chat_id,
                context.section_id,
                context.llm_config.id,
            )

    async def _generate_llm_chat_title(
        self,
        llm_config: LLMConfig,
        *,
        title_input: str,
    ) -> str | None:
        system = (
            "You generate short chat titles.\n"
            "Return a single short phrase (4-10 words).\n"
            "No quotes. No trailing punctuation. No newline.\n"
            "Do not invent details not present in the text."
        )
        user = f"First user message:\n{title_input}\n\nTitle:"
        try:
            raw = await self._run_utility_completion(
                llm_config,
                system_prompt=system,
                user_prompt=user,
                max_tokens=32,
                temperature=0,
            )
        except Exception:
            logger.info(
                "Chat title generation failed; using deterministic title (llm=%s).",
                llm_config.id,
                exc_info=True,
            )
            return None
        if raw is None:
            return None
        sanitized = sanitize_llm_title(raw)
        return sanitized or None

    async def _run_utility_completion(
        self,
        llm_config: LLMConfig,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str | None:
        request, api_key_env = self.config.build_llm_params(llm_config)
        if api_key_env:
            api_key = self.api_keys.get(api_key_env)
            if api_key:
                request["api_key"] = api_key
        request["messages"] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        request["temperature"] = temperature
        request["max_tokens"] = max_tokens
        response = await litellm.acompletion(**request)
        return self._extract_completion_text(response)

    @staticmethod
    def _extract_completion_text(response: Any) -> str | None:
        choices = getattr(response, "choices", None)
        if choices is None and isinstance(response, dict):
            choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        first = choices[0]
        message = getattr(first, "message", None)
        if message is None and isinstance(first, dict):
            message = first.get("message")
        if message is None:
            return None
        content = getattr(message, "content", None)
        if content is None and isinstance(message, dict):
            content = message.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
            combined = "\n".join(parts).strip()
            return combined or None
        return None

    @staticmethod
    def _normalize_bullets(text: str) -> str:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return ""
        bullets: list[str] = []
        for line in lines:
            normalized = line
            if normalized.startswith(("* ", "+ ")):
                normalized = "- " + normalized[2:].lstrip()
            elif normalized.startswith("- "):
                normalized = "- " + normalized[2:].lstrip()
            else:
                normalized = "- " + normalized.lstrip("-").lstrip()
            bullets.append(normalized)
        # Deduplicate while preserving order.
        seen: set[str] = set()
        unique: list[str] = []
        for bullet in bullets:
            if bullet in seen:
                continue
            seen.add(bullet)
            unique.append(bullet)
        return "\n".join(unique).strip()

    def _build_llm_request_payload(
        self,
        llm_config: LLMConfig,
        messages: list[BaseChatMessageUnion],
        *,
        thinking: bool,
        system_prompt: str,
        allowlist: ToolAllowlist | None,
        agentic_scope: AgenticScope,
    ) -> dict[str, Any]:
        system_message = SystemChatMessage(
            content=[MessageTextContent(text=system_prompt)],
        ).to_openai_format()
        message_payloads: list[dict[str, Any]] = [system_message]
        resolved_messages = [
            self._resolve_message_attachments(message) for message in messages
        ]
        for message in resolved_messages:
            message_payloads.append(message.to_openai_format())
        request, api_key_env = self.config.build_llm_params(llm_config)
        if api_key_env:
            api_key = self.api_keys.get(api_key_env)
            if api_key:
                request["api_key"] = api_key

        server_ids = self._resolve_mcp_server_ids(llm_config)
        use_tool_search = self._should_use_anthropic_tool_search(llm_config)
        allow_tool_reference = bool(server_ids) and use_tool_search
        self._strip_tool_reference_content(
            message_payloads,
            allow_tool_reference=allow_tool_reference,
        )
        self._strip_thinking_summaries(message_payloads, llm_config)
        request["messages"] = message_payloads
        self._maybe_apply_cache_prompting(request, message_payloads)
        self._apply_anthropic_tool_search_headers(
            request,
            use_tool_search=use_tool_search,
            has_mcp_tools=bool(server_ids),
        )
        tools = self._build_tool_definitions(
            server_ids,
            allowlist=allowlist,
            use_tool_search=use_tool_search,
            agentic_scope=agentic_scope,
        )
        if tools:
            request["tools"] = tools

        self._apply_request_overrides(request, thinking)
        if not request.get("model"):
            raise ValueError("LLM config must specify a model via config or override")
        return request

    def _resolve_message_attachments(
        self, message: BaseChatMessageUnion
    ) -> BaseChatMessageUnion:
        if not isinstance(message, ContentChatMessage):
            return message
        if not message.attachments:
            return message
        if self.share_mode:
            base_root = self.dbe.path
            artifacts_root = self.dbe.path / "artifacts"
        else:
            base_root = CWD
            artifacts_root = CWD / C.ARTIFACTS_FOLDER
        extra_blocks = build_attachment_content_blocks(
            dbe=self.dbe,
            attachments=message.attachments,
            base_root=base_root,
            artifacts_root=artifacts_root,
            allow_external=False,
        )
        if not extra_blocks:
            return message.model_copy(update={"attachments": []})
        updated_content = list(message.content) + list(extra_blocks)
        return message.model_copy(
            update={"content": updated_content, "attachments": []}
        )

    def _resolve_mcp_server_ids(self, llm_config: LLMConfig) -> list[str]:
        return self.config.resolve_mcp_server_ids(llm_config)

    def _build_tool_definitions(
        self,
        server_ids: list[str],
        *,
        allowlist: ToolAllowlist | None,
        use_tool_search: bool,
        agentic_scope: AgenticScope,
    ) -> list[ChatCompletionToolParam]:
        if not server_ids:
            return []
        effective_server_ids = set(server_ids)
        allowed_server_ids = self._resolve_allowed_server_ids(
            allowlist, effective_server_ids
        )
        if allowed_server_ids is not None:
            effective_server_ids = allowed_server_ids
        if not effective_server_ids:
            return []
        tools = self._build_full_tool_definitions(
            effective_server_ids,
            defer_loading=use_tool_search,
            include_search_tool=use_tool_search,
            allowlist=allowlist,
            agentic_scope=agentic_scope,
        )
        return tools

    def _build_full_tool_definitions(
        self,
        server_ids: set[str],
        *,
        defer_loading: bool,
        include_search_tool: bool,
        allowlist: ToolAllowlist | None,
        agentic_scope: AgenticScope,
    ) -> list[ChatCompletionToolParam]:
        init_tools = self.mcp_client.init_tool_definitions_for_servers(server_ids)
        discoverable_tools = self.mcp_client.discoverable_tool_definitions_for_servers(
            server_ids
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
        if allowlist is not None:
            tool_names = [
                name for name in tool_names if self._is_tool_allowed(name, allowlist)
            ]
        tool_names = self._filter_tool_names_by_scope(tool_names, agentic_scope)
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

    def _filter_tool_names_by_scope(
        self,
        tool_names: list[str],
        agentic_scope: AgenticScope,
    ) -> list[str]:
        if not tool_names:
            return tool_names
        filtered: list[str] = []
        for name in tool_names:
            if not is_setta_tool_name(name):
                filtered.append(name)
                continue
            annotations = self.mcp_client.tool_annotations_by_name.get(name)
            access_type = (
                "structural" if annotations is None else annotations.accessType
            )
            if access_type == "structural" and not agentic_scope.structural_allowed:
                continue
            if access_type == "read" and not agentic_scope.effective_read_section_ids():
                continue
            if access_type == "write" and not agentic_scope.write_section_ids:
                continue
            filtered.append(name)
        return filtered

    def _resolve_allowed_server_ids(
        self, allowlist: ToolAllowlist | None, server_ids: set[str]
    ) -> set[str] | None:
        if allowlist is None or not allowlist.server_ids:
            return None
        return set(allowlist.server_ids) & server_ids

    def _is_tool_allowed(self, tool_name: str, allowlist: ToolAllowlist | None) -> bool:
        if allowlist is None:
            return True
        if tool_name in allowlist.tool_names:
            return True
        server_id, base_name = split_namespaced_tool_name(tool_name)
        if base_name in allowlist.tool_basenames:
            return True
        if server_id and server_id in allowlist.server_ids:
            return True
        return False

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

    def _strip_thinking_summaries(
        self,
        messages: list[dict[str, Any]],
        llm_config: LLMConfig,
    ) -> None:
        if not self._should_strip_thinking_summary(llm_config):
            return
        for message in messages:
            content = message.get("content")
            if not isinstance(content, list):
                continue
            filtered: list[Any] = []
            changed = False
            for entry in content:
                if not isinstance(entry, dict) or entry.get("type") != "thinking":
                    filtered.append(entry)
                    continue
                normalized = dict(entry)
                normalized.pop("summary", None)
                signature = normalized.get("signature")
                if not isinstance(signature, str) or not signature.strip():
                    signature_delta = normalized.get("signature_delta")
                    if isinstance(signature_delta, str) and signature_delta.strip():
                        normalized["signature"] = signature_delta
                        signature = signature_delta
                        normalized.pop("signature_delta", None)
                if not isinstance(signature, str) or not signature.strip():
                    changed = True
                    continue
                filtered.append(normalized)
                if normalized is not entry:
                    changed = True
            if changed:
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
        thinking: bool,
    ) -> None:
        if not thinking:
            return

        model_name = request.get("model")
        provider = request.get("custom_llm_provider")
        if not model_name:
            raise ValueError("Thinking requires a configured model")
        if self._should_enable_anthropic_thinking(model_name, provider):
            if "thinking" not in request:
                request["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": DEFAULT_ANTHROPIC_THINKING_BUDGET,
                }
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(
                        "[thinking] enabling anthropic thinking for model=%s provider=%s budget_tokens=%s",
                        model_name,
                        provider,
                        DEFAULT_ANTHROPIC_THINKING_BUDGET,
                    )
            return

        if "reasoning_effort" in request:
            return
        if not self._should_enable_reasoning_override(model_name, provider):
            provider_display = provider or "default"
            raise ValueError(
                f"Thinking is not supported for model '{model_name}' via provider '{provider_display}'"
            )

        request["reasoning_effort"] = "high"
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "[thinking] enabling reasoning_effort=high for model=%s provider=%s",
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

        if AgentRunner._is_openai_reasoning_model(normalized_model):
            if (
                AgentRunner._is_openai_provider(normalized_provider)
                or not normalized_provider
            ):
                return True

        if AgentRunner._is_claude_like_model(normalized_model):
            if (
                AgentRunner._is_anthropic_provider(normalized_provider)
                or not normalized_provider
            ):
                return True

        if AgentRunner._is_gemini_like_model(normalized_model):
            if (
                AgentRunner._is_google_provider(normalized_provider)
                or not normalized_provider
            ):
                return True

        return False

    @staticmethod
    def _is_openai_reasoning_model(model_name: str) -> bool:
        lowered = model_name.lower()
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

    def _should_use_anthropic_tool_search(self, llm_config: LLMConfig) -> bool:
        provider = (llm_config.provider or "").strip().lower()
        if provider:
            return "anthropic" in provider
        return self._is_claude_like_model(llm_config.model)

    def _should_enable_anthropic_thinking(
        self, model_name: str, provider: str | None
    ) -> bool:
        normalized_provider = (provider or "").strip().lower()
        if normalized_provider:
            return self._is_anthropic_provider(normalized_provider)
        return self._is_claude_like_model(model_name)

    def _should_strip_thinking_summary(self, llm_config: LLMConfig) -> bool:
        provider = (llm_config.provider or "").strip().lower()
        if provider:
            return self._is_anthropic_provider(provider)
        return self._is_claude_like_model(llm_config.model)

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
        context: AgentRunContext,
    ) -> list[ToolChatMessage]:
        tool_results: list[ToolChatMessage] = []
        queue = list(actions)
        while queue:
            action = queue.pop(0)
            if isinstance(action, EmitChunkAction):
                self._apply_stream_chunk_to_state(context.run, action.chunk)
                if isinstance(action.chunk, ToolResultEvent):
                    tool_results.append(action.chunk.result)
                if context.emit_stream:
                    await self.websocket_msg_handler.send_streaming_response(
                        action.chat_id,
                        action.chunk,
                        section_id=context.section_id,
                    )
                continue
            if isinstance(action, UpdateAIFollowAction):
                if context.emit_ai_follow:
                    await self._update_and_broadcast_ai_follow_update(
                        action.project_config_id,
                        action.chat_id,
                        action.ids_by_type,
                    )
                continue
            if isinstance(action, UpdateAIFollowResultAction):
                if context.emit_ai_follow:
                    await self.websocket_msg_handler.broadcast_ai_follow_tool_result_update(
                        action.project_config_id,
                        action.chat_id,
                        action.ids_by_type,
                    )
                continue
            if isinstance(action, ExecuteToolCallsAction):
                next_actions = await self._tool_executor.apply(action)
                if next_actions:
                    queue = next_actions + queue
        return tool_results

    async def _handle_stream_chunk(
        self,
        context: AgentRunContext,
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
            context,
            assistant_message,
            stream_assembler,
            delta,
        )

        await self._handle_tool_call_deltas(
            context,
            assistant_message,
            delta,
            tool_call_accumulator,
            preview_state,
        )

    def _init_chat_state(self, run: AgentRun) -> None:
        self._chat_states[run.id] = build_chat_state_from_run(run)

    def _ensure_chat_state(self, run: AgentRun) -> ChatSectionState:
        state = self._chat_states.get(run.id)
        if state is None:
            state = build_chat_state_from_run(run)
            self._chat_states[run.id] = state
        return state

    def _apply_stream_chunk_to_state(
        self, run: AgentRun, chunk: LLMStreamingResponseChunk
    ) -> ChatSectionState:
        state = self._ensure_chat_state(run)
        updated = apply_stream_delta(state=state, chunk=chunk)
        self._chat_states[run.id] = updated
        return updated

    async def _handle_text_deltas(
        self,
        context: AgentRunContext,
        assistant_message: AssistantChatMessage,
        stream_assembler: ManagedStreamAssembler,
        delta: Delta,
    ) -> None:
        text_deltas = self._build_text_deltas(delta, stream_assembler)
        if not text_deltas:
            return
        await self._apply_actions(
            [
                EmitChunkAction(
                    context.chat_id,
                    MessageDeltaEvent(
                        message_id=assistant_message.id,
                        content=text_deltas,
                    ),
                )
            ],
            context,
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
            reasoning_summary = self._extract_reasoning_summary(delta)
            entries.append(
                StreamContentEntry(
                    kind="thinking",
                    text=reasoning_content,
                    index=None,
                    signature=None,
                    summary=reasoning_summary,
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
            summary = self._extract_thinking_summary(payload)
            return StreamContentEntry(
                kind="thinking",
                text=thinking_value if isinstance(thinking_value, str) else "",
                index=index,
                signature=signature if isinstance(signature, str) else None,
                summary=summary,
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
        if isinstance(entry, BaseModel):
            payload: dict[str, Any] = {}
            raw_fields = getattr(entry, "__dict__", None)
            if isinstance(raw_fields, dict):
                payload.update(raw_fields)
            extra = getattr(entry, "model_extra", None)
            if isinstance(extra, dict):
                payload.update(extra)
            return payload or None

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

    def _extract_thinking_summary(self, payload: dict[str, Any]) -> str | None:
        for key in ("summary", "thinking_summary", "summary_text", "reasoning_summary"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    def _extract_reasoning_summary(self, delta: Delta) -> str | None:
        direct_summary = getattr(delta, "reasoning_summary", None)
        if isinstance(direct_summary, str) and direct_summary:
            return direct_summary
        summary = getattr(delta, "summary", None)
        if isinstance(summary, str) and summary:
            return summary
        provider_specific_fields = getattr(delta, "provider_specific_fields", None)
        if isinstance(provider_specific_fields, dict):
            for key in (
                "reasoning_summary",
                "summary",
                "thinking_summary",
                "summary_text",
            ):
                value = provider_specific_fields.get(key)
                if isinstance(value, str) and value:
                    return value
        elif provider_specific_fields is not None:
            for key in (
                "reasoning_summary",
                "summary",
                "thinking_summary",
                "summary_text",
            ):
                value = getattr(provider_specific_fields, key, None)
                if isinstance(value, str) and value:
                    return value
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
        context: AgentRunContext,
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
            await self._apply_actions(
                [EmitChunkAction(context.chat_id, preview_event or tool_call_event)],
                context,
            )
            await self._maybe_emit_streaming_follow_update(
                context,
                assistant_message,
                tool_call_accumulator.state,
                {entry.index: tokens} if tokens is not None else None,
            )

    async def _maybe_emit_streaming_follow_update(
        self,
        context: AgentRunContext,
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
                    project_config_id=context.project_config_id,
                    chat_id=context.chat_id,
                    ids_by_type=ids_by_type,
                )
            ],
            context,
        )

    async def _maybe_emit_tool_call_follow_update(
        self,
        context: AgentRunContext,
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
                    project_config_id=context.project_config_id,
                    chat_id=context.chat_id,
                    ids_by_type=ids_by_type,
                )
            ],
            context,
        )

    def _ai_follow_state_matches(
        self,
        chat_id: ID,
        project_config_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> bool:
        state = self._ai_follow_state.get((project_config_id, chat_id))
        if state is None:
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
        if normalized_ids_by_type:
            self._ai_follow_state[(project_config_id, chat_id)] = AIFollowState(
                ids_by_type=dict(normalized_ids_by_type)
            )
        else:
            self._ai_follow_state.pop((project_config_id, chat_id), None)
        logger.debug(
            "Broadcasting AI follow update for chat %s (ids_by_type=%s)",
            chat_id,
            normalized_ids_by_type,
        )
        await self.websocket_msg_handler.broadcast_ai_follow_tool_arguments_update(
            project_config_id,
            chat_id,
            normalized_ids_by_type,
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

    def _record_event(
        self, run: AgentRun, event_type: str, payload: dict[str, Any]
    ) -> None:
        run.events.append(RunEvent(type=event_type, payload=payload))
        save_agent_run(self.dbe, run)

    def _build_outputs(
        self,
        messages: list[BaseChatMessageUnion],
        *,
        metadata: dict[str, Any] | None = None,
        usage: dict[str, int] | None = None,
        cost: float | None = None,
    ) -> dict[str, Any]:
        outputs = build_run_outputs(messages)
        if metadata:
            outputs["metadata"] = metadata
        if usage:
            outputs["usage"] = usage
        if cost is not None:
            outputs["cost"] = cost
        return outputs

    @staticmethod
    def _build_run_metadata(context: AgentRunContext) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "engineConfigId": str(context.engine_config_id),
            "llmConfigId": str(context.llm_config.id),
            "model": context.llm_config.model,
            "thinking": context.thinking,
            "chatId": str(context.chat_id),
            "projectConfigId": str(context.project_config_id),
        }
        if context.llm_config.provider:
            metadata["provider"] = context.llm_config.provider
        if context.profile.id:
            metadata["profileId"] = str(context.profile.id)
        if context.section_id:
            metadata["sectionId"] = str(context.section_id)
        return metadata

    @staticmethod
    def _normalize_usage_payload(payload: Any) -> dict[str, int] | None:
        if payload is None:
            return None
        data: dict[str, int] = {}
        if isinstance(payload, dict):
            raw_map = payload
        else:
            raw_map = {
                key: getattr(payload, key, None)
                for key in (
                    "prompt_tokens",
                    "completion_tokens",
                    "total_tokens",
                    "input_tokens",
                    "output_tokens",
                )
            }

        def _extract_int(value: Any) -> int | None:
            if isinstance(value, bool):
                return None
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                return int(value)
            if isinstance(value, str):
                try:
                    return int(value)
                except ValueError:
                    return None
            return None

        mapping = {
            "prompt_tokens": "promptTokens",
            "completion_tokens": "completionTokens",
            "total_tokens": "totalTokens",
            "input_tokens": "inputTokens",
            "output_tokens": "outputTokens",
        }
        for key, output_key in mapping.items():
            if key not in raw_map:
                continue
            value = _extract_int(raw_map.get(key))
            if value is not None:
                data[output_key] = value

        if "promptTokens" not in data and "inputTokens" in data:
            data["promptTokens"] = data["inputTokens"]
        if "completionTokens" not in data and "outputTokens" in data:
            data["completionTokens"] = data["outputTokens"]
        if "totalTokens" not in data:
            prompt = data.get("promptTokens")
            completion = data.get("completionTokens")
            if prompt is not None and completion is not None:
                data["totalTokens"] = prompt + completion

        return data or None

    def _extract_usage_from_chunk(
        self, chunk: ModelResponseStream
    ) -> dict[str, int] | None:
        usage = getattr(chunk, "usage", None)
        return self._normalize_usage_payload(usage)

    @staticmethod
    def _merge_usage_summary(
        current: dict[str, int] | None,
        incoming: dict[str, int] | None,
    ) -> dict[str, int] | None:
        if incoming is None:
            return current
        if current is None:
            return dict(incoming)
        merged = dict(current)
        for key, value in incoming.items():
            if key not in merged or value >= merged[key]:
                merged[key] = value
        if "totalTokens" not in merged:
            prompt = merged.get("promptTokens")
            completion = merged.get("completionTokens")
            if prompt is not None and completion is not None:
                merged["totalTokens"] = prompt + completion
        return merged

    @staticmethod
    def _extract_cost_from_chunk(chunk: ModelResponseStream) -> float | None:
        for attr in ("response_cost", "cost", "total_cost", "totalCost"):
            raw = getattr(chunk, attr, None)
            if raw is None:
                continue
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
        usage = getattr(chunk, "usage", None)
        if isinstance(usage, dict):
            for key in ("cost", "total_cost", "totalCost"):
                raw = usage.get(key)
                if raw is None:
                    continue
                try:
                    return float(raw)
                except (TypeError, ValueError):
                    continue
        return None

    @staticmethod
    def _coalesce_cost(existing: float | None, incoming: float | None) -> float | None:
        if incoming is None:
            return existing
        if existing is None:
            return incoming
        if incoming == existing:
            return existing
        return max(existing, incoming)
