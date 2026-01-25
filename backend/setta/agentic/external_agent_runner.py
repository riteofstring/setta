import asyncio
import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from mcp.types import TextContent

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    build_chat_state_from_run,
    get_run_project_config_id,
    is_external_agent_run,
)
from setta.agentic.external_adapters.base import (
    ExternalAgentAdapter,
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.external_adapters.claude_sdk import ClaudeSdkAdapter
from setta.agentic.external_adapters.codex_app_server import CodexAppServerAdapter
from setta.agentic.external_adapters.opencode_sdk import OpenCodeSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_settings import (
    build_codex_settings_file,
    build_opencode_settings_file,
    build_settings_paths,
    write_claude_settings_file,
)
from setta.agentic.external_tool_allowlist import (
    ExternalToolAllowlist,
    build_external_tool_allowlist,
)
from setta.agentic.run_outputs import build_run_outputs
from setta.agentic.store import (
    create_agent_run,
    load_agent_run,
    save_agent_run,
)
from setta.agentic.system_prompt import build_agent_system_prompt
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.managed.ai_follow import (
    build_tool_call_follow_ids,
    canonicalize_ai_follow_ids_by_type,
    extract_stream_ids_by_type_from_buffer,
    ids_by_type_to_sets,
    normalize_ids_by_type,
)
from setta.llm.chat_toolkit.managed.utils import is_setta_tool_name
from setta.llm.chat_toolkit.section_sync import apply_stream_delta
from setta.logging.tasks import spawn_background_task
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, split_namespaced_tool_name
from setta.mcp.tool_metadata import FollowIdType
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus, RunEvent
from setta.types.chat_messages import (
    AssistantChatMessage,
    ToolCall,
    ToolCallFunction,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageFinalizedEvent,
    MessageStartEvent,
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
from setta.types.section_impls import ChatSectionState
from setta.types.websocket import AIFollowToolArgumentsUpdateContent
from setta.utils.constants import CWD, C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "mcp" / "system_prompt.md"

_BASE_ENV_KEYS = ("PATH", "HOME", "USER", "SHELL", "TMPDIR", "TMP", "TEMP")
_MCP_SERVER_NAME = SETTA_MCP_SERVER_ID
_CLAUDE_MCP_CONFIG_NAME = ".mcp.json"
_APPROVAL_REQUEST_EVENT_TYPE = "approval_request"
_APPROVAL_TOOL_NAME = "setta.approval"
_ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion"
_SUMMARY_EVENT_TYPES = {
    "run_started",
    "run_completed",
    "run_failed",
    "run_cancelled",
    "approval_request",
    "approval_response",
    "question_response",
    "tool_result",
}


@dataclass(frozen=True)
class ExternalAgentRunState:
    handle: ExternalAgentRunHandle
    adapter: ExternalAgentAdapter


@dataclass(frozen=True)
class ExternalAgentApprovalState:
    approval_id: str
    run_id: ID
    project_config_id: ID
    chat_id: ID
    section_id: ID | None


@dataclass(frozen=True)
class ExternalAgentQuestionState:
    tool_call_id: str
    run_id: ID
    project_config_id: ID
    chat_id: ID
    section_id: ID | None
    approval_id: str | None = None


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
            adapters=[
                ClaudeSdkAdapter(),
                CodexAppServerAdapter(),
                OpenCodeSdkAdapter(),
            ]
        )
        self._tasks: dict[ID, asyncio.Task[Any]] = {}
        self._runs: dict[ID, AgentRun] = {}
        self._run_state: dict[ID, ExternalAgentRunState] = {}
        self._chat_states: dict[ID, ChatSectionState] = {}
        self._tool_call_buffers: dict[ID, dict[str, str]] = {}
        self._tool_call_names: dict[ID, dict[str, str]] = {}
        self._ai_follow_state: dict[tuple[ID, ID], dict[FollowIdType, list[ID]]] = {}
        self._pending_approvals: dict[str, ExternalAgentApprovalState] = {}
        self._pending_questions: dict[str, ExternalAgentQuestionState] = {}
        self._pending_question_approvals: dict[ID, list[str]] = {}
        self._system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()

    @property
    def disabled(self) -> bool:
        return False

    def get_ai_follow_snapshot(
        self, project_config_id: ID
    ) -> list[AIFollowToolArgumentsUpdateContent]:
        snapshot: list[AIFollowToolArgumentsUpdateContent] = []
        for (
            state_project_config_id,
            chat_id,
        ), ids_by_type in self._ai_follow_state.items():
            if state_project_config_id != project_config_id:
                continue
            normalized_ids_by_type = normalize_ids_by_type(ids_by_type)
            if not normalized_ids_by_type:
                continue
            snapshot.append(
                AIFollowToolArgumentsUpdateContent(
                    projectConfigId=project_config_id,
                    chatId=chat_id,
                    idsByType=normalized_ids_by_type,
                )
            )
        return snapshot

    def start_run(
        self,
        engine_config_id: ID,
        config: ExternalAgentConfig,
        profile: AgentProfile | None,
        inputs: dict[str, Any] | None,
    ) -> AgentRun:
        context, is_new = self._build_context(engine_config_id, config, profile, inputs)
        run = context.run
        self._runs[run.id] = run
        self._init_chat_state(run)
        if is_new:
            self._record_event(
                run,
                "run_started",
                {
                    "engineConfigId": str(engine_config_id),
                    "projectConfigId": str(context.project_config_id),
                    "chatId": str(context.chat_id),
                    "sectionId": str(context.section_id)
                    if context.section_id
                    else None,
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
            self._chat_states.pop(run_id, None)
            self._tool_call_buffers.pop(run_id, None)
            self._tool_call_names.pop(run_id, None)
            self._clear_pending_approvals(run_id)
            self._clear_pending_questions(run_id)

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

    async def wait_for_run(self, run_id: ID, timeout: float | None = None) -> AgentRun:
        task = self._tasks.get(run_id)
        if task is not None:
            if timeout is None:
                await task
            else:
                await asyncio.wait_for(task, timeout=timeout)
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"External agent run {run_id} not found")
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
                if self._is_approval_request(event.raw):
                    await self._handle_approval_request(context, run, event.raw)
                    continue
                if event.stream_chunk is not None:
                    await self.websocket_msg_handler.send_streaming_response(
                        context.chat_id,
                        event.stream_chunk,
                        section_id=context.section_id,
                        share_session_id=self.share_session_id,
                    )
                    await self._handle_stream_chunk(context, run, event.stream_chunk)
            self._persist_external_session_metadata(run, handle)
            return_code = handle.return_code
            if return_code not in (None, 0):
                raise RuntimeError(f"External agent exited with code {return_code}")
            self._persist_outputs_from_state(run, context.config)
            run.status = AgentRunStatus.completed
            run.finishedAt = get_now_timestamp()
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_completed", {})
        except asyncio.CancelledError:
            run.status = AgentRunStatus.cancelled
            run.finishedAt = get_now_timestamp()
            self._persist_external_session_metadata(run, handle)
            self._persist_outputs_from_state(run, context.config)
            save_agent_run(self.dbe, run)
            self._record_event(run, "run_cancelled", {})
            raise
        except Exception as exc:
            error_payload: dict[str, Any] = {"error": str(exc)}
            stderr_lines = None
            if handle is not None:
                stderr_lines = handle.metadata.get("stderr_lines")
                app_server_errors = handle.metadata.get("app_server_errors")
                if isinstance(app_server_errors, list) and app_server_errors:
                    error_payload["appServerErrors"] = app_server_errors
            if isinstance(stderr_lines, list) and stderr_lines:
                error_payload["cliStderr"] = stderr_lines[-50:]
            self._persist_external_session_metadata(run, handle)
            self._persist_outputs_from_state(run, context.config)
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
            self._record_event(run, "run_failed", error_payload)
        finally:
            self._cleanup_context(context)

    def _build_context(
        self,
        engine_config_id: ID,
        config: ExternalAgentConfig,
        profile: AgentProfile | None,
        inputs: dict[str, Any] | None,
    ) -> tuple[ExternalAgentRunContext, bool]:
        project_state = self.dbe.read_project_required()
        if project_state.defaultProjectConfigId is None:
            raise KeyError("Project state does not define a default project config")
        project_config_id = self._resolve_project_config_id(
            inputs, project_state.defaultProjectConfigId, project_state.projectConfigs
        )
        section_id = self._resolve_id_input(inputs, "sectionId")

        payload_inputs = dict(inputs or {})
        payload_inputs.setdefault("projectConfigId", str(project_config_id))
        payload_inputs.setdefault("engineConfigId", str(engine_config_id))
        if profile is not None:
            payload_inputs.setdefault("agentProfileId", str(profile.id))
        payload_inputs.setdefault("runType", EXTERNAL_AGENT_RUN_TYPE)

        chat_id = self._resolve_id_input(inputs, "chatId")
        if chat_id is not None:
            payload_inputs["chatId"] = str(chat_id)
            self._apply_session_history(
                payload_inputs, config, engine_config_id, chat_id, project_config_id
            )

        run, chat_id, is_new = self._find_or_create_chat_run(
            chat_id=chat_id,
            engine_config_id=engine_config_id,
            project_config_id=project_config_id,
            profile=profile,
            payload_inputs=payload_inputs,
        )
        system_prompt = self._build_system_prompt(profile, project_config_id)
        working_dir = self._resolve_working_dir(config)
        env = self._build_env(config)
        cleanup_paths: list[Path] = []
        self._configure_external_tools(
            config=config,
            profile=profile,
            payload_inputs=payload_inputs,
            env=env,
            cleanup_paths=cleanup_paths,
            system_prompt=system_prompt,
        )
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
            cleanup_paths=tuple(cleanup_paths),
        ), is_new

    def _find_or_create_chat_run(
        self,
        *,
        chat_id: ID | None,
        engine_config_id: ID,
        project_config_id: ID,
        profile: AgentProfile | None,
        payload_inputs: dict[str, Any],
    ) -> tuple[AgentRun, ID, bool]:
        profile_id = profile.id if profile is not None else None
        if chat_id is None:
            run = create_agent_run(profile_id=profile_id, inputs=payload_inputs)
            chat_id = run.id
            payload_inputs["chatId"] = str(chat_id)
            run.inputs = payload_inputs
            save_agent_run(self.dbe, run)
            return run, chat_id, True
        payload_inputs["chatId"] = str(chat_id)
        existing = load_agent_run(self.dbe, chat_id)
        if existing is None:
            run = create_agent_run(
                profile_id=profile_id,
                inputs=payload_inputs,
                run_id=chat_id,
            )
            save_agent_run(self.dbe, run)
            return run, chat_id, True
        if not is_external_agent_run(existing):
            raise KeyError(f"Run {chat_id} is not an external agent run")
        existing_project_config_id = get_run_project_config_id(existing)
        if existing_project_config_id != project_config_id:
            raise KeyError(
                "Chat project config does not match existing external agent run"
            )
        existing_engine_config_id = self._get_run_engine_config_id(existing)
        if existing_engine_config_id != engine_config_id:
            raise KeyError("Chat engine config does not match existing external run")
        existing.inputs = payload_inputs
        if profile_id is not None:
            existing.profileId = profile_id
        if existing.startedAt is None:
            existing.startedAt = get_now_timestamp()
        existing.status = AgentRunStatus.running
        existing.finishedAt = None
        save_agent_run(self.dbe, existing)
        return existing, chat_id, False

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
        engine_config_id: ID,
        chat_id: ID,
        project_config_id: ID,
    ) -> None:
        if "sessionId" in payload_inputs or "threadId" in payload_inputs:
            return
        previous = load_agent_run(self.dbe, chat_id)
        if previous is None or not is_external_agent_run(previous):
            return
        if get_run_project_config_id(previous) != project_config_id:
            return
        if self._get_run_engine_config_id(previous) != engine_config_id:
            return
        session_id = self._extract_output_string(previous.outputs, "sessionId")
        if session_id is None:
            run_state = self._run_state.get(previous.id)
            if run_state and run_state.handle.session_id:
                session_id = run_state.handle.session_id
        thread_id = self._extract_output_string(previous.outputs, "threadId")
        if config.toolType == ExternalAgentToolType.codex:
            if thread_id:
                payload_inputs["threadId"] = thread_id
            return
        if session_id:
            payload_inputs["sessionId"] = session_id

    @staticmethod
    def _get_run_engine_config_id(run: AgentRun) -> ID | None:
        if not run.inputs:
            return None
        raw = run.inputs.get("engineConfigId")
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

    @staticmethod
    def _extract_input_string(inputs: dict[str, Any] | None, key: str) -> str | None:
        if not inputs:
            return None
        raw = inputs.get(key)
        if isinstance(raw, str) and raw:
            return raw
        return None

    def _init_chat_state(self, run: AgentRun) -> None:
        self._chat_states[run.id] = build_chat_state_from_run(run)

    def _ensure_chat_state(self, run: AgentRun) -> ChatSectionState:
        state = self._chat_states.get(run.id)
        if state is None:
            state = build_chat_state_from_run(run)
            self._chat_states[run.id] = state
        return state

    def _apply_stream_chunk_to_state(
        self, run: AgentRun, chunk: Any
    ) -> ChatSectionState:
        state = self._ensure_chat_state(run)
        updated = apply_stream_delta(state=state, chunk=chunk)
        self._chat_states[run.id] = updated
        return updated

    def _persist_outputs_from_state(
        self,
        run: AgentRun,
        config: ExternalAgentConfig | None,
        state: ChatSectionState | None = None,
    ) -> None:
        if state is None:
            state = self._ensure_chat_state(run)
        outputs = run.outputs or {}
        outputs.update(build_run_outputs(state.messages))
        metadata: dict[str, Any] = {}
        existing_metadata = outputs.get("metadata")
        if isinstance(existing_metadata, dict):
            metadata.update(existing_metadata)
        engine_config_id = self._extract_input_string(run.inputs, "engineConfigId")
        if engine_config_id:
            metadata["engineConfigId"] = engine_config_id
        chat_id = self._extract_input_string(run.inputs, "chatId")
        if chat_id:
            metadata["chatId"] = chat_id
        project_config_id = self._extract_input_string(run.inputs, "projectConfigId")
        if project_config_id:
            metadata["projectConfigId"] = project_config_id
        if config is not None:
            metadata["externalAgentConfigId"] = str(config.id)
            metadata["toolType"] = config.toolType.value
            metadata["runMode"] = config.runMode.value
            if config.defaultModel:
                metadata["model"] = config.defaultModel
            if config.approvalPolicy:
                metadata["approvalPolicy"] = config.approvalPolicy
            if config.sandboxPolicy:
                metadata["sandboxPolicy"] = config.sandboxPolicy
            metadata["settingsMode"] = config.settingsMode.value
            if config.settingsSources:
                metadata["settingsSources"] = [
                    source.value for source in config.settingsSources
                ]
            if config.settingsFilePath:
                metadata["settingsFilePath"] = config.settingsFilePath
            metadata["settingsAllowSettaEdits"] = config.settingsAllowSettaEdits
            settings_paths = build_settings_paths(
                self.dbe, config, project_root=self.dbe.path.parent
            )
            resolved_paths: dict[str, str] = {}
            if settings_paths.claude_settings is not None:
                resolved_paths["claude"] = str(settings_paths.claude_settings)
            if settings_paths.codex_config is not None:
                resolved_paths["codex"] = str(settings_paths.codex_config)
            if settings_paths.opencode_config is not None:
                resolved_paths["opencode"] = str(settings_paths.opencode_config)
            if resolved_paths:
                metadata["settingsPaths"] = resolved_paths
        if metadata:
            outputs["metadata"] = metadata
        run.outputs = outputs
        save_agent_run(self.dbe, run)

    def _build_system_prompt(
        self, profile: AgentProfile | None, project_config_id: ID
    ) -> str:
        return build_agent_system_prompt(
            base_prompt=self._system_prompt,
            profile=profile,
            project_config_id=project_config_id,
            dbe=self.dbe,
        )

    @staticmethod
    def _resolve_external_tool_allowlist(
        profile: AgentProfile | None,
    ) -> ExternalToolAllowlist | None:
        if profile is None:
            return None
        allowlist, error = build_external_tool_allowlist(
            profile.toolAllowlist,
            server_id=_MCP_SERVER_NAME,
        )
        if error:
            raise ValueError(error)
        return allowlist

    def _configure_external_tools(
        self,
        *,
        config: ExternalAgentConfig,
        profile: AgentProfile | None,
        payload_inputs: dict[str, Any],
        env: dict[str, str],
        cleanup_paths: list[Path],
        system_prompt: str,
    ) -> None:
        allowlist = self._resolve_external_tool_allowlist(profile)
        if config.toolType == ExternalAgentToolType.claude_code:
            mcp_url = self._build_setta_mcp_url()
            auth_headers = self._build_mcp_auth_headers()
            logger.info(
                "Configuring Claude MCP url=%s allowlist=%s",
                mcp_url,
                allowlist.tool_names if allowlist is not None else None,
            )
            if "mcpConfig" not in payload_inputs:
                config_path = self._write_claude_mcp_config(mcp_url)
                payload_inputs["mcpConfig"] = str(config_path)
                cleanup_paths.append(config_path.parent)
            write_claude_settings_file(config, project_root=self.dbe.path.parent)
            allowed_tools = self._build_claude_allowed_tools(profile)
            if allowed_tools:
                payload_inputs["allowedTools"] = allowed_tools
            return
        if config.toolType == ExternalAgentToolType.opencode:
            mcp_url = self._build_setta_mcp_url()
            auth_headers = self._build_mcp_auth_headers()
            logger.info(
                "Configuring OpenCode MCP url=%s allowlist=%s",
                mcp_url,
                allowlist.tool_names if allowlist is not None else None,
            )
            config_path = build_opencode_settings_file(
                self.dbe,
                config,
                allowlist=allowlist,
                mcp_url=mcp_url,
                auth_headers=auth_headers,
            )
            env["OPENCODE_CONFIG"] = str(config_path)
            return
        if config.toolType == ExternalAgentToolType.codex:
            mcp_url = self._build_setta_mcp_streamable_url()
            auth_headers = self._build_mcp_auth_headers()
            logger.info(
                "Configuring Codex MCP url=%s allowlist=%s",
                mcp_url,
                allowlist.tool_names if allowlist is not None else None,
            )
            codex_prompt = self._resolve_codex_developer_instructions(
                system_prompt, payload_inputs
            )
            codex_home = build_codex_settings_file(
                self.dbe,
                config,
                allowlist=allowlist,
                mcp_url=mcp_url,
                auth_headers=auth_headers,
                system_prompt=codex_prompt,
            )
            env["CODEX_HOME"] = str(codex_home)

    @staticmethod
    def _resolve_codex_developer_instructions(
        system_prompt: str, payload_inputs: dict[str, Any] | None
    ) -> str | None:
        base_prompt = system_prompt.strip()
        extra_prompt = ""
        if payload_inputs is not None:
            raw = payload_inputs.get("systemPrompt")
            if isinstance(raw, str) and raw.strip():
                extra_prompt = raw.strip()
        if base_prompt and extra_prompt:
            return f"{base_prompt}\n\n{extra_prompt}"
        if base_prompt:
            return base_prompt
        if extra_prompt:
            return extra_prompt
        return None

    @staticmethod
    def _build_setta_mcp_url() -> str:
        return f"{C.BACKEND}/mcp"

    @staticmethod
    def _build_setta_mcp_streamable_url() -> str:
        return f"{C.BACKEND}/mcp/streamable/"

    def _create_temp_dir(self, prefix: str) -> Path:
        return Path(tempfile.mkdtemp(prefix=prefix))

    def _write_claude_mcp_config(self, mcp_url: str) -> Path:
        config_dir = self._create_temp_dir("setta-claude-mcp-")
        path = config_dir / _CLAUDE_MCP_CONFIG_NAME
        server_entry: dict[str, Any] = {"type": "sse", "url": mcp_url}
        auth_headers = self._build_mcp_auth_headers()
        if auth_headers:
            server_entry["headers"] = auth_headers
        payload = {"mcpServers": {_MCP_SERVER_NAME: server_entry}}
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    @staticmethod
    def _build_mcp_auth_headers() -> dict[str, str] | None:
        session_info = load_current_session_secret()
        if session_info is None:
            return None
        session_metadata, secret = session_info
        cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
        return {"Cookie": f"{C.AUTH_COOKIE_NAME}={cookie_value}"}

    @staticmethod
    def _build_claude_allowed_tools(
        profile: AgentProfile | None,
    ) -> list[str] | None:
        if profile is None or not profile.toolAllowlist:
            return None
        tools: list[str] = []
        for entry in profile.toolAllowlist:
            normalized = entry.strip()
            if not normalized:
                continue
            if normalized.startswith("mcp__"):
                tools.append(normalized)
                continue
            if "__" in normalized:
                server_id, tool_name = split_namespaced_tool_name(normalized)
                if server_id and tool_name:
                    tools.append(f"mcp__{server_id}__{tool_name}")
                    continue
            tools.append(normalized)
        return tools or None

    def _resolve_working_dir(self, config: ExternalAgentConfig) -> Path:
        strategy = config.workingDirStrategy
        if strategy == ExternalAgentWorkingDirStrategy.project_root:
            return CWD
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
        return CWD

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

    def _cleanup_context(self, context: ExternalAgentRunContext) -> None:
        if (
            context.config.workingDirStrategy
            == ExternalAgentWorkingDirStrategy.temp_dir
        ):
            self._remove_path(context.working_dir)
        for path in context.cleanup_paths:
            self._remove_path(path)

    def _remove_path(self, path: Path) -> None:
        if not path.exists():
            return
        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        except OSError as exc:
            logger.warning("Failed to cleanup path %s", path, exc_info=exc)

    def _record_event(self, run: AgentRun, event_type: str, payload: dict[str, Any]):
        if event_type not in _SUMMARY_EVENT_TYPES:
            return
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
        self, context: ExternalAgentRunContext, run: AgentRun, chunk: Any
    ) -> None:
        state = self._apply_stream_chunk_to_state(run, chunk)
        if isinstance(chunk, ToolCallDeltaEvent):
            self._store_tool_call_delta(run.id, chunk)
            self._maybe_register_question_call(
                run.id,
                context.project_config_id,
                context.chat_id,
                chunk.tool_call_id,
                chunk.tool_name,
            )
            await self._maybe_emit_streaming_follow_update(
                context.project_config_id,
                context.chat_id,
                run.id,
                chunk,
            )
            return
        if isinstance(chunk, MessageFinalizedEvent):
            tool_calls = chunk.message.tool_calls or []
            if not tool_calls:
                tool_calls = self._build_tool_calls_from_buffers(run.id)
            else:
                tool_calls = self._normalize_tool_calls(tool_calls)
            for tool_call in tool_calls:
                normalized = self._normalize_tool_name(tool_call.function.name)
                if normalized == _ASK_USER_QUESTION_TOOL_NAME:
                    self._register_question_call(
                        run.id,
                        context.project_config_id,
                        context.chat_id,
                        tool_call.id,
                    )
            await self._maybe_emit_follow_update(
                context.project_config_id,
                context.chat_id,
                tool_calls,
            )
            self._clear_tool_call_buffers(run.id)
            self._persist_outputs_from_state(run, context.config, state)
            return
        if isinstance(chunk, ToolResultEvent):
            await self._broadcast_ai_follow_update(
                context.project_config_id,
                context.chat_id,
                {},
            )
            self._record_event(
                run,
                "tool_result",
                {
                    "toolCallId": chunk.result.tool_call_id,
                    "toolName": chunk.result.tool_name,
                    "isError": chunk.result.is_error,
                },
            )
            self._persist_outputs_from_state(run, context.config, state)

    def _store_tool_call_delta(self, run_id: ID, chunk: ToolCallDeltaEvent) -> None:
        buffers = self._tool_call_buffers.setdefault(run_id, {})
        names = self._tool_call_names.setdefault(run_id, {})
        buffers[chunk.tool_call_id] = buffers.get(chunk.tool_call_id, "") + (
            chunk.arguments_delta or ""
        )
        if chunk.tool_name:
            normalized = self._normalize_tool_name(chunk.tool_name)
            if normalized:
                names[chunk.tool_call_id] = normalized

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

    def _clear_tool_call_buffers(self, run_id: ID) -> None:
        self._tool_call_buffers.pop(run_id, None)
        self._tool_call_names.pop(run_id, None)

    def _clear_pending_approvals(self, run_id: ID) -> None:
        for approval_id, state in list(self._pending_approvals.items()):
            if state.run_id == run_id:
                self._pending_approvals.pop(approval_id, None)

    def _clear_pending_questions(self, run_id: ID) -> None:
        for tool_call_id, state in list(self._pending_questions.items()):
            if state.run_id == run_id:
                self._pending_questions.pop(tool_call_id, None)
        self._pending_question_approvals.pop(run_id, None)

    def _maybe_register_question_call(
        self,
        run_id: ID,
        project_config_id: ID,
        chat_id: ID,
        tool_call_id: str,
        tool_name: str | None,
    ) -> None:
        normalized = self._normalize_tool_name(tool_name)
        if normalized != _ASK_USER_QUESTION_TOOL_NAME:
            return
        self._register_question_call(run_id, project_config_id, chat_id, tool_call_id)

    def _register_question_call(
        self,
        run_id: ID,
        project_config_id: ID,
        chat_id: ID,
        tool_call_id: str,
    ) -> None:
        if tool_call_id in self._pending_questions:
            return
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            return
        section_id = None
        section_raw = self._extract_input_string(run.inputs, "sectionId")
        if section_raw:
            section_id = ID(section_raw)
        approval_id = None
        pending_approvals = self._pending_question_approvals.get(run_id)
        if pending_approvals:
            approval_id = pending_approvals.pop(0)
            if not pending_approvals:
                self._pending_question_approvals.pop(run_id, None)
        self._pending_questions[tool_call_id] = ExternalAgentQuestionState(
            tool_call_id=tool_call_id,
            run_id=run_id,
            project_config_id=project_config_id,
            chat_id=chat_id,
            section_id=section_id,
            approval_id=approval_id,
        )

    @staticmethod
    def _is_approval_request(payload: dict[str, Any]) -> bool:
        return payload.get("type") == _APPROVAL_REQUEST_EVENT_TYPE

    async def _handle_approval_request(
        self,
        context: ExternalAgentRunContext,
        run: AgentRun,
        payload: dict[str, Any],
    ) -> None:
        approval_id = self._extract_approval_id(payload)
        if approval_id is None:
            logger.warning("Approval request missing approvalId: %s", payload)
            return
        tool_name = self._extract_tool_name(payload)
        logger.info(
            "Approval request received run_id=%s approval_id=%s tool_name=%s payload=%s",
            run.id,
            approval_id,
            tool_name,
            payload,
        )
        is_question = tool_name == _ASK_USER_QUESTION_TOOL_NAME
        if is_question:
            if context.config.toolType == ExternalAgentToolType.claude_code:
                attached = False
                for tool_call_id, state in list(self._pending_questions.items()):
                    if state.run_id != run.id:
                        continue
                    if state.approval_id is not None:
                        continue
                    self._pending_questions[tool_call_id] = ExternalAgentQuestionState(
                        tool_call_id=state.tool_call_id,
                        run_id=state.run_id,
                        project_config_id=state.project_config_id,
                        chat_id=state.chat_id,
                        section_id=state.section_id,
                        approval_id=approval_id,
                    )
                    attached = True
                    break
                if not attached:
                    approvals = self._pending_question_approvals.setdefault(run.id, [])
                    approvals.append(approval_id)
                self._record_event(
                    run,
                    "approval_request",
                    {"approvalId": approval_id, "payload": payload},
                )
                return
            self._pending_questions[approval_id] = ExternalAgentQuestionState(
                tool_call_id=approval_id,
                run_id=run.id,
                project_config_id=context.project_config_id,
                chat_id=context.chat_id,
                section_id=context.section_id,
                approval_id=approval_id,
            )
            tool_arguments = self._extract_tool_input(payload) or {}
            tool_call = ToolCall(
                id=approval_id,
                function=ToolCallFunction(
                    name=_ASK_USER_QUESTION_TOOL_NAME,
                    arguments=tool_arguments,
                ),
            )
        else:
            self._pending_approvals[approval_id] = ExternalAgentApprovalState(
                approval_id=approval_id,
                run_id=run.id,
                project_config_id=context.project_config_id,
                chat_id=context.chat_id,
                section_id=context.section_id,
            )
            tool_call = ToolCall(
                id=approval_id,
                function=ToolCallFunction(
                    name=_APPROVAL_TOOL_NAME,
                    arguments=self._build_approval_arguments(payload, approval_id),
                ),
            )
        message = AssistantChatMessage(
            id=approval_id,
            content=[],
            tool_calls=[tool_call],
        )
        chunk = MessageStartEvent(message=message)
        await self.websocket_msg_handler.send_streaming_response(
            context.chat_id,
            chunk,
            section_id=context.section_id,
            share_session_id=self.share_session_id,
        )
        state = self._apply_stream_chunk_to_state(run, chunk)
        self._persist_outputs_from_state(run, context.config, state)
        self._record_event(
            run,
            "approval_request",
            {"approvalId": approval_id, "payload": payload},
        )

    @staticmethod
    def _extract_approval_id(payload: dict[str, Any]) -> str | None:
        for key in ("approvalId", "approval_id", "id"):
            raw = payload.get(key)
            if isinstance(raw, str) and raw:
                return raw
        return None

    @staticmethod
    def _extract_tool_name(payload: dict[str, Any]) -> str | None:
        for key in ("toolName", "tool_name"):
            raw = payload.get(key)
            if isinstance(raw, str) and raw:
                return raw
        tool = payload.get("tool")
        if isinstance(tool, str) and tool:
            return tool
        if isinstance(tool, dict):
            raw = tool.get("name")
            if isinstance(raw, str) and raw:
                return raw
        return None

    @staticmethod
    def _extract_tool_input(payload: dict[str, Any]) -> dict[str, Any] | None:
        raw = payload.get("input")
        if isinstance(raw, dict):
            return raw
        return None

    @staticmethod
    def _build_approval_arguments(
        payload: dict[str, Any], approval_id: str
    ) -> dict[str, Any]:
        tool = payload.get("tool")
        input_payload = payload.get("input")
        tool_name = payload.get("toolName") or payload.get("tool_name")
        if not tool_name and isinstance(tool, str) and tool:
            tool_name = tool
        return {
            "approvalId": approval_id,
            "tool": tool,
            "input": input_payload,
            "toolName": tool_name,
            "toolType": payload.get("toolType") or payload.get("tool_type"),
        }

    async def respond_to_approval(self, approval_id: str, approved: bool) -> None:
        state = self._pending_approvals.get(approval_id)
        if state is None:
            raise KeyError(f"Approval {approval_id} not found")
        run_id = state.run_id
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"Approval run {run_id} not found")
        run_state = self._run_state.get(run_id)
        if run_state is None:
            raise KeyError(f"Run {run_id} is not active")
        await run_state.adapter.send_approval_response(
            run_state.handle, approval_id, approved
        )
        result_payload = {"approved": approved}
        content_text = "Approved" if approved else "Denied"
        tool_message = ToolChatMessage(
            tool_call_id=approval_id,
            tool_name=_APPROVAL_TOOL_NAME,
            arguments={},
            result=result_payload,
            content=[TextContent(type="text", text=content_text)],
            is_error=not approved,
            completed_at=get_now_timestamp(),
        )
        chunk = ToolResultEvent(result=tool_message)
        await self.websocket_msg_handler.send_streaming_response(
            state.chat_id,
            chunk,
            section_id=state.section_id,
            share_session_id=self.share_session_id,
        )
        await self._broadcast_ai_follow_update(
            state.project_config_id,
            state.chat_id,
            {},
        )
        state_snapshot = self._apply_stream_chunk_to_state(run, chunk)
        self._persist_outputs_from_state(run, None, state_snapshot)
        self._record_event(
            run,
            "tool_result",
            {
                "toolCallId": tool_message.tool_call_id,
                "toolName": tool_message.tool_name,
                "isError": tool_message.is_error,
            },
        )
        self._record_event(
            run,
            "approval_response",
            {"approvalId": approval_id, "approved": approved},
        )
        self._pending_approvals.pop(approval_id, None)

    async def respond_to_question(
        self, tool_call_id: str, answers: dict[str, str]
    ) -> None:
        state = self._pending_questions.get(tool_call_id)
        if state is None:
            raise KeyError(f"Question {tool_call_id} not found")
        run_id = state.run_id
        run = self._runs.get(run_id) or load_agent_run(self.dbe, run_id)
        if run is None:
            raise KeyError(f"Question run {run_id} not found")
        run_state = self._run_state.get(run_id)
        if run_state is None:
            raise KeyError(f"Run {run_id} is not active")
        response_id = state.approval_id or tool_call_id
        await run_state.adapter.send_tool_response(
            run_state.handle,
            response_id,
            {"answers": answers},
        )
        content = _format_question_answers(answers)
        tool_message = ToolChatMessage(
            tool_call_id=tool_call_id,
            tool_name=_ASK_USER_QUESTION_TOOL_NAME,
            arguments={},
            result={"answers": answers},
            content=[TextContent(type="text", text=content)] if content else [],
            completed_at=get_now_timestamp(),
        )
        chunk = ToolResultEvent(result=tool_message)
        await self.websocket_msg_handler.send_streaming_response(
            state.chat_id,
            chunk,
            section_id=state.section_id,
            share_session_id=self.share_session_id,
        )
        await self._broadcast_ai_follow_update(
            state.project_config_id,
            state.chat_id,
            {},
        )
        state_snapshot = self._apply_stream_chunk_to_state(run, chunk)
        self._persist_outputs_from_state(run, None, state_snapshot)
        self._record_event(
            run,
            "tool_result",
            {
                "toolCallId": tool_message.tool_call_id,
                "toolName": tool_message.tool_name,
                "isError": tool_message.is_error,
            },
        )
        self._record_event(
            run,
            "question_response",
            {"toolCallId": tool_call_id, "answers": answers},
        )
        self._pending_questions.pop(tool_call_id, None)

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
        tool_name = self._normalize_tool_name(chunk.tool_name)
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

    @staticmethod
    def _normalize_tool_name(tool_name: str | None) -> str | None:
        if not tool_name:
            return None
        normalized = tool_name.strip()
        if not normalized:
            return None
        has_mcp_prefix = normalized.startswith("mcp__")
        if has_mcp_prefix:
            normalized = normalized[len("mcp__") :]
        if not has_mcp_prefix and normalized.lower() == "question":
            return _ASK_USER_QUESTION_TOOL_NAME
        setta_prefix = f"{SETTA_MCP_SERVER_ID}_"
        if normalized.startswith(setta_prefix) and not normalized.startswith(
            f"{SETTA_MCP_SERVER_ID}__"
        ):
            normalized = f"{SETTA_MCP_SERVER_ID}__{normalized[len(setta_prefix):]}"
        return normalized

    def _normalize_tool_calls(self, tool_calls: list[ToolCall]) -> list[ToolCall]:
        normalized_calls: list[ToolCall] = []
        for call in tool_calls:
            normalized_name = self._normalize_tool_name(call.function.name)
            if normalized_name and normalized_name != call.function.name:
                normalized_calls.append(
                    call.model_copy(
                        update={
                            "function": call.function.model_copy(
                                update={"name": normalized_name}
                            )
                        }
                    )
                )
            else:
                normalized_calls.append(call)
        return normalized_calls


def _format_question_answers(answers: dict[str, str]) -> str:
    if not answers:
        return ""
    return "\n".join(f"{key}: {value}" for key, value in answers.items())
