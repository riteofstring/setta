import asyncio
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    get_run_chat_id,
    get_run_sort_key,
    is_external_agent_run,
)
from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.external_adapters.claude_sdk import ClaudeSdkAdapter
from setta.agentic.external_adapters.codex_sdk import CodexSdkAdapter
from setta.agentic.external_adapters.opencode_sdk import OpenCodeSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.store import (
    create_agent_run,
    list_agent_runs,
    load_agent_run,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.managed.ai_follow import (
    build_tool_call_follow_ids,
    canonicalize_ai_follow_ids_by_type,
    extract_stream_ids_by_type_from_buffer,
    ids_by_type_to_sets,
    normalize_ids_by_type,
)
from setta.llm.chat_toolkit.managed.utils import is_setta_tool_name
from setta.logging.tasks import spawn_background_task
from setta.mcp.client import MultiMCPClient
from setta.mcp.tool_metadata import FollowIdType
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus, RunEvent
from setta.types.chat_messages import ToolCall, ToolCallFunction
from setta.types.chat_stream_events import (
    MessageFinalizedEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"

_BASE_ENV_KEYS = ("PATH", "HOME", "USER", "SHELL", "TMPDIR", "TMP", "TEMP")


@dataclass(frozen=True)
class ExternalAgentRunState:
    handle: ExternalAgentRunHandle
    adapter: ExternalAgentAdapter


class ExternalAgentRunner:
    def __init__(
        self,
        dbe: DBE,
        websocket_msg_handler: WMHFrontendSender,
        *,
        share_session_id: str | None = None,
        adapter_registry: ExternalAgentAdapterRegistry | None = None,
        mcp_client: MultiMCPClient | None = None,
    ) -> None:
        self.dbe = dbe
        self.websocket_msg_handler = websocket_msg_handler
        self.share_session_id = share_session_id
        self.mcp_client = mcp_client
        self._adapter_registry = adapter_registry or ExternalAgentAdapterRegistry(
            adapters=[ClaudeSdkAdapter(), CodexSdkAdapter(), OpenCodeSdkAdapter()]
        )
        self._tasks: dict[ID, asyncio.Task[Any]] = {}
        self._runs: dict[ID, AgentRun] = {}
        self._run_state: dict[ID, ExternalAgentRunState] = {}
        self._tool_call_buffers: dict[ID, dict[str, str]] = {}
        self._tool_call_names: dict[ID, dict[str, str]] = {}
        self._ai_follow_state: dict[tuple[ID, ID], dict[FollowIdType, list[ID]]] = {}
        self._system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()

    @property
    def disabled(self) -> bool:
        return False

    def start_run(
        self,
        config: ExternalAgentConfig,
        profile: AgentProfile | None,
        inputs: dict[str, Any] | None,
    ) -> AgentRun:
        context = self._build_context(config, profile, inputs)
        run = context.run
        self._runs[run.id] = run
        save_agent_run(self.dbe, run)
        self._record_event(
            run,
            "run_started",
            {
                "externalAgentConfigId": str(config.id),
                "projectConfigId": str(context.project_config_id),
                "chatId": str(context.chat_id),
                "sectionId": str(context.section_id) if context.section_id else None,
            },
        )
        task = spawn_background_task(
            lambda: self._run_external_agent(context),
            label="external-agent-run",
            project_config_id=str(context.project_config_id),
            extra_values={"run_id": str(run.id)},
        )

        def _cleanup(_task: asyncio.Task[Any], run_id: ID) -> None:
            self._tasks.pop(run_id, None)
            self._runs.pop(run_id, None)
            self._run_state.pop(run_id, None)
            self._tool_call_buffers.pop(run_id, None)
            self._tool_call_names.pop(run_id, None)

        task.add_done_callback(lambda t, run_id=run.id: _cleanup(t, run_id))
        self._tasks[run.id] = task
        return run

    async def stop_run(self, run_id: ID) -> AgentRun:
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
        state = self._run_state.get(run_id)
        if state is not None:
            await state.adapter.cancel_run(state.handle)
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"External agent run {run_id} not found")
        run.status = AgentRunStatus.cancelled
        run.finishedAt = get_now_timestamp()
        save_agent_run(self.dbe, run)
        self._record_event(run, "run_cancelled", {})
        return run

    async def _run_external_agent(self, context: ExternalAgentRunContext) -> None:
        run = context.run
        handle: ExternalAgentRunHandle | None = None
        try:
            adapter = self._adapter_registry.lookup(
                context.config.toolType,
                context.config.runMode,
            ).adapter
            handle = await adapter.start_run(context)
            self._run_state[run.id] = ExternalAgentRunState(
                handle=handle, adapter=adapter
            )
            async for event in adapter.stream_events(handle, context):
                self._record_event(run, "external_event", event.raw)
                if event.stream_chunk is not None:
                    await self.websocket_msg_handler.send_streaming_response(
                        context.chat_id,
                        event.stream_chunk,
                        section_id=context.section_id,
                        share_session_id=self.share_session_id,
                    )
                    self._record_event(
                        run,
                        "stream_chunk",
                        {
                            "chatId": str(context.chat_id),
                            "sectionId": str(context.section_id)
                            if context.section_id
                            else None,
                            "chunk": event.stream_chunk.model_dump(mode="json"),
                        },
                    )
                    await self._handle_stream_chunk(
                        context.project_config_id,
                        context.chat_id,
                        run.id,
                        event.stream_chunk,
                    )
            self._persist_external_session_metadata(run, handle)
            return_code = handle.return_code
            if return_code not in (None, 0):
                raise RuntimeError(f"External agent exited with code {return_code}")
            run.status = AgentRunStatus.completed
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_completed", {})
        except asyncio.CancelledError:
            run.status = AgentRunStatus.cancelled
            run.finishedAt = get_now_timestamp()
            self._persist_external_session_metadata(run, handle)
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_cancelled", {})
            raise
        except Exception as exc:
            self._persist_external_session_metadata(run, handle)
            await (
                self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                    exc,
                    label="external-agent-run",
                    message="External agent run failed",
                    severity=SettaBackendLogEventSeverity.error,
                    project_config_id=context.project_config_id,
                    logger=logger,
                    context={"run_id": str(run.id)},
                )
            )
            run.status = AgentRunStatus.failed
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_failed", {"error": str(exc)})

    def _build_context(
        self,
        config: ExternalAgentConfig,
        profile: AgentProfile | None,
        inputs: dict[str, Any] | None,
    ) -> ExternalAgentRunContext:
        project_state = self.dbe.read_project_required()
        if project_state.defaultProjectConfigId is None:
            raise KeyError("Project state does not define a default project config")
        project_config_id = self._resolve_project_config_id(
            inputs, project_state.defaultProjectConfigId, project_state.projectConfigs
        )
        section_id = self._resolve_id_input(inputs, "sectionId")

        payload_inputs = dict(inputs or {})
        payload_inputs.setdefault("externalAgentConfigId", str(config.id))
        if profile is not None:
            payload_inputs.setdefault("agentProfileId", str(profile.id))
        payload_inputs.setdefault("runType", EXTERNAL_AGENT_RUN_TYPE)

        chat_id = self._resolve_id_input(inputs, "chatId")
        if chat_id is not None:
            self._apply_session_history(payload_inputs, config, chat_id)

        run = create_agent_run(
            profile_id=profile.id if profile is not None else None,
            inputs=payload_inputs,
        )
        if chat_id is None:
            chat_id = run.id
            payload_inputs["chatId"] = str(run.id)
        system_prompt = self._build_system_prompt(profile, project_config_id)
        working_dir = self._resolve_working_dir(config)
        env = self._build_env(config)
        return ExternalAgentRunContext(
            run=run,
            config=config,
            profile=profile,
            project_config_id=project_config_id,
            chat_id=chat_id,
            section_id=section_id,
            inputs=payload_inputs,
            system_prompt=system_prompt,
            working_dir=working_dir,
            env=env,
        )

    def _resolve_project_config_id(
        self,
        inputs: dict[str, Any] | None,
        default_id: ID,
        config_map: dict[ID, Any],
    ) -> ID:
        raw = None
        if inputs is not None:
            raw = inputs.get("projectConfigId")
        if raw is None:
            return default_id
        if not isinstance(raw, str):
            raise TypeError("projectConfigId must be a string")
        project_config_id = ID(raw)
        if project_config_id not in config_map:
            raise KeyError(f"Unknown project config: {project_config_id}")
        return project_config_id

    def _resolve_id_input(self, inputs: dict[str, Any] | None, key: str) -> ID | None:
        if inputs is None:
            return None
        raw = inputs.get(key)
        if raw is None:
            return None
        if not isinstance(raw, str):
            raise TypeError(f"{key} must be a string")
        return ID(raw)

    def _apply_session_history(
        self,
        payload_inputs: dict[str, Any],
        config: ExternalAgentConfig,
        chat_id: ID,
    ) -> None:
        if "sessionId" in payload_inputs or "threadId" in payload_inputs:
            return
        previous = self._find_latest_external_run(chat_id, config.id)
        if previous is None:
            return
        session_id = self._extract_output_string(previous.outputs, "sessionId")
        thread_id = self._extract_output_string(previous.outputs, "threadId")
        if config.toolType == ExternalAgentToolType.codex:
            if thread_id:
                payload_inputs["threadId"] = thread_id
            return
        if session_id:
            payload_inputs["sessionId"] = session_id

    def _find_latest_external_run(self, chat_id: ID, config_id: ID) -> AgentRun | None:
        runs = [
            run
            for run in list_agent_runs(self.dbe)
            if is_external_agent_run(run)
            and get_run_chat_id(run) == chat_id
            and self._get_run_external_config_id(run) == config_id
        ]
        if not runs:
            return None
        return max(runs, key=get_run_sort_key)

    @staticmethod
    def _get_run_external_config_id(run: AgentRun) -> ID | None:
        if not run.inputs:
            return None
        raw = run.inputs.get("externalAgentConfigId")
        if isinstance(raw, str) and raw:
            return ID(raw)
        return None

    @staticmethod
    def _extract_output_string(outputs: dict[str, Any] | None, key: str) -> str | None:
        if not outputs:
            return None
        raw = outputs.get(key)
        if isinstance(raw, str) and raw:
            return raw
        return None

    def _build_system_prompt(
        self, profile: AgentProfile | None, project_config_id: ID
    ) -> str:
        prompt = self._system_prompt
        temporary_project_config_id = self._ensure_temporary_project_id(
            project_config_id
        )
        prompt = f"{prompt}\n\n## Active project config\n- id: {temporary_project_config_id}\n"
        if profile is None:
            return prompt
        profile_lines: list[str] = []
        if profile.name:
            profile_lines.append(f"- name: {profile.name}")
        if profile.description:
            profile_lines.append(f"- description: {profile.description}")
        if profile_lines or profile.systemPrompt:
            prompt = f"{prompt}\n## Agent profile"
            if profile_lines:
                prompt = f"{prompt}\n" + "\n".join(profile_lines)
            if profile.systemPrompt.strip():
                prompt = f"{prompt}\n\n{profile.systemPrompt.strip()}"
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

    def _resolve_working_dir(self, config: ExternalAgentConfig) -> Path:
        strategy = config.workingDirStrategy
        if strategy == ExternalAgentWorkingDirStrategy.project_root:
            return C.CWD
        if strategy == ExternalAgentWorkingDirStrategy.temp_dir:
            return Path(tempfile.mkdtemp(prefix="setta-external-agent-"))
        if strategy == ExternalAgentWorkingDirStrategy.custom:
            if not config.workingDir:
                raise ValueError(
                    "External agent workingDir is required for custom mode"
                )
            path = Path(config.workingDir)
            path.mkdir(parents=True, exist_ok=True)
            return path
        return C.CWD

    def _build_env(self, config: ExternalAgentConfig) -> dict[str, str]:
        env: dict[str, str] = {}
        for key in _BASE_ENV_KEYS:
            value = os.environ.get(key)
            if value:
                env[key] = value
        allowed = set(config.envVarWhitelist)
        if not allowed:
            return env
        dot_env = self.dbe.read_dot_env()
        for key in allowed:
            if key in os.environ:
                env[key] = os.environ[key]
            if key in dot_env:
                env[key] = dot_env[key]
        return env

    def _record_event(self, run: AgentRun, event_type: str, payload: dict[str, Any]):
        run.events.append(RunEvent(type=event_type, payload=payload))
        save_agent_run(self.dbe, run)

    def _persist_external_session_metadata(
        self, run: AgentRun, handle: ExternalAgentRunHandle | None
    ) -> None:
        if handle is None:
            return
        outputs = run.outputs or {}
        updated = False
        if handle.session_id and outputs.get("sessionId") != handle.session_id:
            outputs["sessionId"] = handle.session_id
            updated = True
        if handle.thread_id and outputs.get("threadId") != handle.thread_id:
            outputs["threadId"] = handle.thread_id
            updated = True
        if not updated:
            return
        run.outputs = outputs
        save_agent_run(self.dbe, run)

    async def _handle_stream_chunk(
        self,
        project_config_id: ID,
        chat_id: ID,
        run_id: ID,
        chunk: Any,
    ) -> None:
        if isinstance(chunk, ToolCallDeltaEvent):
            self._store_tool_call_delta(run_id, chunk)
            await self._maybe_emit_streaming_follow_update(
                project_config_id,
                chat_id,
                run_id,
                chunk,
            )
            return
        if isinstance(chunk, MessageFinalizedEvent):
            tool_calls = chunk.message.tool_calls or []
            if not tool_calls:
                tool_calls = self._build_tool_calls_from_buffers(run_id)
            await self._maybe_emit_follow_update(
                project_config_id,
                chat_id,
                tool_calls,
            )
            return
        if isinstance(chunk, ToolResultEvent):
            await self._broadcast_ai_follow_update(project_config_id, chat_id, {})

    def _store_tool_call_delta(self, run_id: ID, chunk: ToolCallDeltaEvent) -> None:
        buffers = self._tool_call_buffers.setdefault(run_id, {})
        names = self._tool_call_names.setdefault(run_id, {})
        buffers[chunk.tool_call_id] = buffers.get(chunk.tool_call_id, "") + (
            chunk.arguments_delta or ""
        )
        if chunk.tool_name:
            names[chunk.tool_call_id] = chunk.tool_name

    def _build_tool_calls_from_buffers(self, run_id: ID) -> list[ToolCall]:
        buffers = self._tool_call_buffers.get(run_id)
        if not buffers:
            return []
        names = self._tool_call_names.get(run_id, {})
        tool_calls: list[ToolCall] = []
        for tool_call_id, args in buffers.items():
            name = names.get(tool_call_id, "")
            tool_calls.append(
                ToolCall(
                    id=tool_call_id,
                    function=ToolCallFunction(name=name, arguments=args),
                )
            )
        return tool_calls

    async def _maybe_emit_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        tool_calls: list[ToolCall],
    ) -> None:
        if not tool_calls or not self.mcp_client:
            return
        ids_by_type = build_tool_call_follow_ids(
            tool_calls=tool_calls,
            dbe=self.dbe,
            annotations_by_name=self.mcp_client.tool_annotations_by_name,
        )
        if not ids_by_type:
            return
        await self._broadcast_ai_follow_update(project_config_id, chat_id, ids_by_type)

    async def _maybe_emit_streaming_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        run_id: ID,
        chunk: ToolCallDeltaEvent,
    ) -> None:
        if not self.mcp_client:
            return
        tool_name = chunk.tool_name
        if not tool_name or not is_setta_tool_name(tool_name):
            return
        annotations = self.mcp_client.tool_annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolArguments:
            return
        buffers = self._tool_call_buffers.get(run_id)
        if not buffers:
            return
        buffer = buffers.get(chunk.tool_call_id, "")
        if not buffer:
            return
        ids_by_type = extract_stream_ids_by_type_from_buffer(
            buffer,
            annotations.aiFollowToolArguments.pathsByIdType,
        )
        normalized_ids = {id_type: list(ids) for id_type, ids in ids_by_type.items()}
        canonical = canonicalize_ai_follow_ids_by_type(
            self.dbe,
            normalized_ids,
            filter_to_known=True,
        )
        if not canonical:
            return
        await self._broadcast_ai_follow_update(project_config_id, chat_id, canonical)

    async def _broadcast_ai_follow_update(
        self,
        project_config_id: ID,
        chat_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> None:
        normalized = normalize_ids_by_type(ids_by_type)
        if self._ai_follow_state_matches(project_config_id, chat_id, normalized):
            return
        if normalized:
            self._ai_follow_state[(project_config_id, chat_id)] = dict(normalized)
        else:
            self._ai_follow_state.pop((project_config_id, chat_id), None)
        await self.websocket_msg_handler.broadcast_ai_follow_tool_arguments_update(
            projectConfigId=project_config_id,
            chatId=chat_id,
            idsByType=normalized,
            share_session_id=self.share_session_id,
        )

    def _ai_follow_state_matches(
        self,
        project_config_id: ID,
        chat_id: ID,
        ids_by_type: dict[FollowIdType, list[ID]],
    ) -> bool:
        state = self._ai_follow_state.get((project_config_id, chat_id))
        if state is None:
            return False
        return ids_by_type_to_sets(state) == ids_by_type_to_sets(ids_by_type)
