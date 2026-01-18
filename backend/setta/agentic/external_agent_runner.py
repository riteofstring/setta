import asyncio
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE
from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.external_adapters.codex_sdk import CodexSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.store import create_agent_run, load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.logging.tasks import spawn_background_task
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus, RunEvent
from setta.types.external_agents import (
    ExternalAgentConfig,
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
    ) -> None:
        self.dbe = dbe
        self.websocket_msg_handler = websocket_msg_handler
        self.share_session_id = share_session_id
        self._adapter_registry = adapter_registry or ExternalAgentAdapterRegistry(
            adapters=[CodexSdkAdapter()]
        )
        self._tasks: dict[ID, asyncio.Task[Any]] = {}
        self._runs: dict[ID, AgentRun] = {}
        self._run_state: dict[ID, ExternalAgentRunState] = {}
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
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_cancelled", {})
            raise
        except Exception as exc:
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

        run = create_agent_run(
            profile_id=profile.id if profile is not None else None,
            inputs=payload_inputs,
        )
        chat_id = self._resolve_id_input(inputs, "chatId")
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
