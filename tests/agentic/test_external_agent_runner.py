import asyncio
import json
import os
import sys
import tomllib
from contextlib import ExitStack, contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import pytest
from claude_agent_sdk import SystemMessage
from claude_agent_sdk.types import StreamEvent

from setta.agentic.external_adapters.base import (
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.completion_guard import MISSING_REPORT_MESSAGE
from setta.auth.cookies import auth_cookie_name
from setta.agentic.external_adapters.claude_sdk import (
    ClaudeSdkAdapter,
    _QUEUE_KIND_DONE,
    _QUEUE_KIND_MESSAGE,
    _ClaudeSdkEventParser,
    _PendingApproval,
)
from setta.agentic.external_adapters.opencode_sdk import _OpenCodeSdkEventParser
from setta.agentic.external_agent_defaults import (
    DEFAULT_CLAUDE_ALLOW_RULES,
    build_default_claude_settings_block,
)
from setta.agentic.external_agent_runner import (
    ExternalAgentApprovalState,
    ExternalAgentRunState,
    ExternalAgentRunner,
    _extract_status_payloads,
    _extract_usage_payloads,
    _normalize_external_usage_payload,
    _resolve_mcp_runtime_state,
)
from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE
from setta.agentic.store import create_agent_run, load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.types.agentic import AgentProfile, AgentRunStatus
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    UserChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageTextDelta,
    ToolCallDeltaEvent,
)
from setta.types.external_agents import (
    ClaudeSettingsManaged,
    ClaudeSettingsPermissions,
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentSettingsManagedBlock,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.mcp_runtime_status import (
    MCPServerRuntimeState,
    MCPServerRuntimeStatus,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.project_config import ProjectConfig
from setta.types.project_config import Position
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_FRONTEND_AFFINITY_TOKEN_HEADER,
    AGENTIC_CONTEXT_LINKED_CHAT_CHAIN_HEADER,
    AGENTIC_CONTEXT_LINKED_CHAT_DEPTH_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SECTION_ID_HEADER,
)
from setta.plugins.models import PluginRegisteredExternalAgentAdapter
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def _write_project_state(dbe: DBE) -> ProjectConfig:
    project_config = ProjectConfig()
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={project_config.id: {}},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    return project_config


def _write_project_state_with_agentic_context(
    dbe: DBE,
) -> tuple[ProjectConfig, ID, ID]:
    settings = SettingsState()
    single = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="agentic"))
    chat_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        single,
        SectionType.TextBlock,
        Position(),
    )
    create_agentic_edge(
        single,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=context_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.inline_text,
        ),
    )
    backend = ProjectStateBackend(
        sections=single.sections,
        sectionImpls=single.sectionImpls,
        sectionVariants=single.sectionVariants,
        codeObjs=single.codeObjs,
        codeObjImpls=single.codeObjImpls,
        codeObjVariants=single.codeObjVariants,
        projectConfigs={single.projectConfig.id: single.projectConfig},
        projectChatWindowingByProjectConfigId={single.projectConfig.id: {}},
        defaultProjectConfigId=single.projectConfig.id,
    )
    dbe.write_project(backend)
    return single.projectConfig, chat_section_id, context_section_id


def _build_runner(dbe: DBE) -> ExternalAgentRunner:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    return ExternalAgentRunner(dbe, frontend_sender)


def _build_context_for_test(
    runner: ExternalAgentRunner,
    config: ExternalAgentConfig,
    *,
    engine_config_id: ID | None = None,
    profile: AgentProfile | None = None,
    inputs: dict[str, Any] | None = None,
):
    resolved_engine_id = engine_config_id or ID("engine-1")
    resolved_inputs = dict(inputs or {})
    # External runs require either a chat section id (scoped run) or an explicit
    # allowUnscoped flag (project-level run). Most unit tests don't care about
    # section scoping, so default to allowUnscoped=true when omitted.
    if "sectionId" not in resolved_inputs and "allowUnscoped" not in resolved_inputs:
        resolved_inputs["allowUnscoped"] = True
    context, _ = runner._build_context(
        resolved_engine_id,
        config,
        profile,
        resolved_inputs,
    )
    return context


class TestExternalAgentRunnerStopRun:
    pytestmark = pytest.mark.asyncio

    async def test_stop_run_does_not_override_completed(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            run = create_agent_run(
                profile_id=None, inputs={"runType": EXTERNAL_AGENT_RUN_TYPE}
            )
            now = get_now_timestamp()
            run.status = AgentRunStatus.completed
            run.finishedAt = now
            save_agent_run(dbe, run)

            stopped = await runner.stop_run(run.id)

            assert stopped.status == AgentRunStatus.completed
            loaded = load_agent_run(dbe, run.id)
            if loaded is None:
                raise AssertionError("Expected external agent run to be persisted")
            assert loaded.status == AgentRunStatus.completed
            event_types = [event.type for event in loaded.events]
            assert "run_cancelled" not in event_types


class TestExternalAgentRunnerContext:
    def test_context_caches_completion_guard_toggle_for_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(runner, config)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": True,
                    }
                },
            )

            assert context.completion_guard_enabled is False

    def test_context_omits_completion_contract_when_guard_disabled(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(runner, config)

            assert "## Completion Reporting Contract" not in context.system_prompt
            assert "report_completion_status" not in context.system_prompt

    def test_context_rejects_mismatched_engine_config_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            with pytest.raises(KeyError):
                _build_context_for_test(
                    runner,
                    config,
                    engine_config_id=ID("engine-1"),
                    inputs={"engineConfigId": "engine-2"},
                )

    def test_context_injects_agentic_context_and_headers_for_opencode(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config, chat_section_id, context_section_id = (
                _write_project_state_with_agentic_context(dbe)
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-opencode")
            config = ExternalAgentConfig(
                id="opencode-config",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                inputs={
                    "sectionId": str(chat_section_id),
                    "frontendAffinityToken": "frontend-codex",
                },
            )

            assert "## Agentic Context" in context.system_prompt
            assert context.agentic_context_section_ids == (context_section_id,)

            _, canonical_to_temporary = dbe.read_temporary_id_map()
            tmp_context_section_id = canonical_to_temporary.get(context_section_id)
            assert tmp_context_section_id is not None
            assert str(tmp_context_section_id) in context.system_prompt
            assert str(context_section_id) not in context.system_prompt

            opencode_config_path = Path(str(context.env["OPENCODE_CONFIG"]))
            payload = json.loads(opencode_config_path.read_text(encoding="utf-8"))
            mcp = payload.get("mcp")
            assert isinstance(mcp, dict)
            setta_entry = mcp.get(SETTA_MCP_SERVER_ID)
            assert isinstance(setta_entry, dict)
            headers = setta_entry.get("headers")
            assert isinstance(headers, dict)
            assert headers.get(AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER) == str(
                project_config.id
            )
            assert headers.get(AGENTIC_CONTEXT_CHAT_ID_HEADER) == str(context.chat_id)
            assert headers.get(AGENTIC_CONTEXT_SECTION_ID_HEADER) == str(
                chat_section_id
            )
            assert headers.get(AGENTIC_CONTEXT_FRONTEND_AFFINITY_TOKEN_HEADER) == (
                "frontend-codex"
            )

    def test_context_injects_linked_chat_recursion_headers_for_opencode(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config, chat_section_id, _ = (
                _write_project_state_with_agentic_context(dbe)
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-opencode-linked")
            config = ExternalAgentConfig(
                id="opencode-config-linked",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                inputs={
                    "sectionId": str(chat_section_id),
                    "linkedChatInvocationDepth": 1,
                    "linkedChatInvocationChainSectionIds": [
                        "section-root",
                        "section-mid",
                    ],
                },
            )

            opencode_config_path = Path(str(context.env["OPENCODE_CONFIG"]))
            payload = json.loads(opencode_config_path.read_text(encoding="utf-8"))
            mcp = payload.get("mcp")
            assert isinstance(mcp, dict)
            setta_entry = mcp.get(SETTA_MCP_SERVER_ID)
            assert isinstance(setta_entry, dict)
            headers = setta_entry.get("headers")
            assert isinstance(headers, dict)
            assert headers.get(AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER) == str(
                project_config.id
            )
            assert headers.get(AGENTIC_CONTEXT_CHAT_ID_HEADER) == str(context.chat_id)
            assert headers.get(AGENTIC_CONTEXT_SECTION_ID_HEADER) == str(
                chat_section_id
            )
            assert headers.get(AGENTIC_CONTEXT_LINKED_CHAT_DEPTH_HEADER) == "1"
            assert headers.get(AGENTIC_CONTEXT_LINKED_CHAT_CHAIN_HEADER) == (
                "section-root,section-mid"
            )
            assert "linkedChatInvocationDepth: 1" in context.system_prompt
            _, canonical_to_temporary = dbe.read_temporary_id_map()
            tmp_root = canonical_to_temporary.get(ID("section-root"))
            tmp_mid = canonical_to_temporary.get(ID("section-mid"))
            assert tmp_root is not None
            assert tmp_mid is not None
            assert (
                f"linkedChatInvocationChainSectionIds: {tmp_root}, {tmp_mid}"
                in context.system_prompt
            )

    def test_context_injects_agentic_headers_for_codex(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config, chat_section_id, _ = (
                _write_project_state_with_agentic_context(dbe)
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-codex")
            config = ExternalAgentConfig(
                id="codex-config",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                inputs={"sectionId": str(chat_section_id)},
            )

            codex_home = Path(str(context.env["CODEX_HOME"]))
            payload = tomllib.loads(
                (codex_home / "config.toml").read_text(encoding="utf-8")
            )
            mcp_servers = payload.get("mcp_servers")
            assert isinstance(mcp_servers, dict)
            setta_entry = mcp_servers.get(SETTA_MCP_SERVER_ID)
            assert isinstance(setta_entry, dict)
            headers = setta_entry.get("http_headers")
            assert isinstance(headers, dict)
            assert headers.get(AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER) == str(
                project_config.id
            )
            assert headers.get(AGENTIC_CONTEXT_CHAT_ID_HEADER) == str(context.chat_id)
            assert headers.get(AGENTIC_CONTEXT_SECTION_ID_HEADER) == str(
                chat_section_id
            )


async def _apply_claude_payloads(
    runner: ExternalAgentRunner,
    context: ExternalAgentRunContext,
    run,
    payloads: list[dict[str, object]],
) -> None:
    parser = _ClaudeSdkEventParser()
    for payload in payloads:
        for event in parser.handle(payload):
            if event.stream_chunk is None:
                continue
            await runner._handle_stream_chunk(context, run, event.stream_chunk)


class TestExternalAgentRunner:
    def test_context_defaults_chat_id_to_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
            )

            assert context.chat_id == context.run.id
            assert context.inputs["chatId"] == str(context.run.id)

    def test_context_sets_run_type(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
            )

            assert context.inputs.get("runType") == EXTERNAL_AGENT_RUN_TYPE

    def test_configure_external_tools_writes_claude_settings(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.managed_local,
                settingsAllowSettaEdits=True,
                settingsManagedBlock=ExternalAgentSettingsManagedBlock(
                    claude=ClaudeSettingsManaged(
                        permissions=ClaudeSettingsPermissions(ask=["Bash(rm:*)"])
                    )
                ),
            )

            payload_inputs: dict[str, Any] = {}
            env: dict[str, str] = {}
            cleanup_paths: list[Path] = []

            runner._configure_external_tools(
                config=config,
                profile=None,
                payload_inputs=payload_inputs,
                env=env,
                cleanup_paths=cleanup_paths,
                system_prompt="",
            )

            mcp_config = payload_inputs.get("mcpConfig")
            assert isinstance(mcp_config, str)
            if isinstance(mcp_config, str):
                assert Path(mcp_config).exists()

            settings_path = Path(tmpdir) / ".claude" / "settings.local.json"
            assert settings_path.exists()
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            assert isinstance(permissions, dict)
            if isinstance(permissions, dict):
                assert permissions.get("ask") == ["Bash(rm:*)"]

    def test_configure_external_tools_writes_default_claude_allowlist(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.managed_local,
                settingsAllowSettaEdits=True,
                settingsManagedBlock=build_default_claude_settings_block(),
            )

            payload_inputs: dict[str, Any] = {}
            env: dict[str, str] = {}
            cleanup_paths: list[Path] = []

            runner._configure_external_tools(
                config=config,
                profile=None,
                payload_inputs=payload_inputs,
                env=env,
                cleanup_paths=cleanup_paths,
                system_prompt="",
            )

            settings_path = Path(tmpdir) / ".claude" / "settings.local.json"
            assert settings_path.exists()
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            assert isinstance(permissions, dict)
            if isinstance(permissions, dict):
                assert permissions.get("allow") == DEFAULT_CLAUDE_ALLOW_RULES

    def test_context_inherits_thread_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            config = ExternalAgentConfig(
                id="config-1",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            previous = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-1",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-1"),
            )
            previous.outputs = {"threadId": "thread-123"}
            save_agent_run(dbe, previous)

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                inputs={"chatId": "chat-1"},
            )

            assert context.inputs.get("threadId") == "thread-123"

    def test_context_inherits_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-2")
            config = ExternalAgentConfig(
                id="config-2",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )
            previous = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-2",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-2"),
            )
            previous.outputs = {"sessionId": "session-456"}
            save_agent_run(dbe, previous)

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                inputs={"chatId": "chat-2"},
            )
            assert context.inputs.get("sessionId") == "session-456"

    def test_context_respects_explicit_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-3")
            config = ExternalAgentConfig(
                id="config-3",
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            previous = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-3",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-3"),
            )
            previous.outputs = {"sessionId": "session-old"}
            save_agent_run(dbe, previous)

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                inputs={"chatId": "chat-3", "sessionId": "session-new"},
            )

            assert context.inputs.get("sessionId") == "session-new"

    def test_context_reuses_chat_run_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-4")
            config = ExternalAgentConfig(
                id="config-4",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )
            context, is_new = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs={"chatId": "chat-4", "allowUnscoped": True},
            )
            assert is_new
            assert context.run.id == ID("chat-4")
            initial_started_at = context.run.startedAt
            context.run.status = AgentRunStatus.completed
            context.run.finishedAt = context.run.startedAt
            save_agent_run(dbe, context.run)

            followup, is_new_followup = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs={"chatId": "chat-4", "allowUnscoped": True},
            )
            assert not is_new_followup
            assert followup.run.id == context.run.id
            assert followup.run.startedAt == initial_started_at
            assert followup.run.status == AgentRunStatus.running
            assert followup.run.finishedAt is None
            assert followup.inputs.get("projectConfigId") == str(project_config.id)

    def test_context_rejects_mismatched_project_config(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config_a = ProjectConfig()
            project_config_b = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={
                    project_config_a.id: project_config_a,
                    project_config_b.id: project_config_b,
                },
                defaultProjectConfigId=project_config_a.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-5")
            config = ExternalAgentConfig(
                id="config-5",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-5",
                    "projectConfigId": str(project_config_a.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-5"),
            )
            save_agent_run(dbe, run)

            with pytest.raises(KeyError):
                runner._build_context(
                    engine_config_id,
                    config,
                    profile=None,
                    inputs={
                        "chatId": "chat-5",
                        "projectConfigId": str(project_config_b.id),
                        "allowUnscoped": True,
                    },
                )

    def test_opencode_config_read_only_skips_permission(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy="ask",
                settingsMode=ExternalAgentSettingsMode.read_only,
            )

            context = _build_context_for_test(runner, config)

            config_path = context.env.get("OPENCODE_CONFIG")
            assert isinstance(config_path, str)
            payload = json.loads(Path(str(config_path)).read_text(encoding="utf-8"))
            assert "permission" not in payload

    def test_context_applies_runtime_approval_policy_override(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy="default",
            )

            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "allowUnscoped": True,
                    "approvalPolicy": "bypassPermissions",
                },
            )

            assert context.config.approvalPolicy == "bypassPermissions"
            assert config.approvalPolicy == "default"

    def test_ai_follow_snapshot_normalizes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            project_config_id = ID("project-1")
            chat_id = ID("chat-1")

            runner._ai_follow_state[(project_config_id, chat_id)] = {
                "section": [ID("section-1"), ID("section-1"), ID("section-2")]
            }

            snapshot = runner.get_ai_follow_snapshot(project_config_id)
            assert len(snapshot) == 1
            entry = snapshot[0]
            assert entry.chatId == chat_id
            assert entry.idsByType["section"] == [ID("section-1"), ID("section-2")]

    def test_normalize_tool_calls_strips_mcp_prefix(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            tool_calls = [
                ToolCall(
                    id="call-1",
                    function=ToolCallFunction(
                        name="mcp__setta__create_section", arguments={}
                    ),
                )
            ]

            normalized = runner._normalize_tool_calls(tool_calls)

            assert normalized[0].function.name == "setta__create_section"

    def test_normalize_tool_calls_opencode_prefix(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            tool_calls = [
                ToolCall(
                    id="call-2",
                    function=ToolCallFunction(
                        name="setta_create_section", arguments={}
                    ),
                )
            ]

            normalized = runner._normalize_tool_calls(tool_calls)

            assert normalized[0].function.name == "setta__create_section"

    def test_normalize_tool_calls_opencode_question_alias(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            tool_calls = [
                ToolCall(
                    id="call-3",
                    function=ToolCallFunction(name="question", arguments={}),
                )
            ]

            normalized = runner._normalize_tool_calls(tool_calls)

            assert normalized[0].function.name == "AskUserQuestion"

    def test_persist_external_session_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            run = create_agent_run(
                profile_id=None,
                inputs={"chatId": "chat-4"},
                run_id=ID("chat-4"),
            )
            save_agent_run(dbe, run)
            handle = ExternalAgentRunHandle(
                run_id=run.id,
                session_id="session-999",
                thread_id="thread-999",
            )

            runner._persist_external_session_metadata(run, handle)

            loaded = load_agent_run(dbe, run.id)
            assert loaded is not None
            assert loaded.outputs.get("sessionId") == "session-999"
            assert loaded.outputs.get("threadId") == "thread-999"

    def test_run_outputs_built_from_stream_events(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-5",
                    "projectConfigId": "config-5",
                    "engineConfigId": "engine-5",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-5"),
            )

            message = AssistantChatMessage(
                id="m1",
                content=[MessageTextContent(text="Hello")],
            )
            stream_chunks = [
                MessageStartEvent(message=AssistantChatMessage(id="m1", content=[])),
                MessageDeltaEvent(
                    message_id="m1",
                    content=[MessageTextDelta(index=0, text="Hello")],
                ),
                MessageFinalizedEvent(message=message),
            ]
            state = None
            for chunk in stream_chunks:
                state = runner._apply_stream_chunk_to_state(run, chunk)
            runner._persist_outputs_from_state(run, config, state)

            assert run.outputs is not None
            messages = run.outputs.get("messages")
            assert isinstance(messages, list)
            assert run.outputs.get("finalText") == "Hello"

    def test_run_outputs_include_external_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-123")
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-4o-mini",
                approvalPolicy="never",
                sandboxPolicy="restricted",
            )
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-7",
                    "projectConfigId": "config-7",
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-7"),
            )
            message = AssistantChatMessage(
                id="m7",
                content=[MessageTextContent(text="Hello")],
            )
            stream_chunks = [
                MessageStartEvent(message=AssistantChatMessage(id="m7", content=[])),
                MessageDeltaEvent(
                    message_id="m7",
                    content=[MessageTextDelta(index=0, text="Hello")],
                ),
                MessageFinalizedEvent(message=message),
            ]
            state = None
            for chunk in stream_chunks:
                state = runner._apply_stream_chunk_to_state(run, chunk)
            runner._persist_outputs_from_state(run, config, state)

            assert run.outputs is not None
            metadata = run.outputs.get("metadata")
            assert isinstance(metadata, dict)
            assert metadata.get("engineConfigId") == str(engine_config_id)
            assert metadata.get("chatId") == "chat-7"
            assert metadata.get("projectConfigId") == "config-7"
            assert metadata.get("externalAgentConfigId") == str(config.id)
            assert metadata.get("toolType") == config.toolType.value
            assert metadata.get("runMode") == config.runMode.value
            assert metadata.get("model") == "gpt-4o-mini"
            assert metadata.get("approvalPolicy") == "never"
            assert metadata.get("sandboxPolicy") == "restricted"
            assert metadata.get("settingsMode") == "managed_local"
            assert metadata.get("settingsAllowSettaEdits") is True
            settings_paths = metadata.get("settingsPaths")
            assert isinstance(settings_paths, dict)
            expected_codex_path = (
                dbe.path
                / "external_agent_settings"
                / "codex"
                / str(config.id)
                / "config.toml"
            )
            assert settings_paths.get("codex") == str(expected_codex_path)

    def test_run_outputs_store_runtime_model_override_in_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-4o-mini",
            )
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-runtime-model",
                    "projectConfigId": "config-runtime-model",
                    "engineConfigId": "engine-runtime-model",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                    "model": "gpt-5-codex",
                },
                run_id=ID("chat-runtime-model"),
            )
            state = runner._apply_stream_chunk_to_state(
                run,
                MessageStartEvent(
                    message=AssistantChatMessage(
                        id="m-runtime-model",
                        content=[],
                    )
                ),
            )
            state = runner._apply_stream_chunk_to_state(
                run,
                MessageFinalizedEvent(
                    message=AssistantChatMessage(
                        id="m-runtime-model",
                        content=[MessageTextContent(text="Done")],
                    )
                ),
            )

            runner._persist_outputs_from_state(run, config, state)

            assert run.outputs is not None
            metadata = run.outputs.get("metadata")
            assert isinstance(metadata, dict)
            assert metadata.get("model") == "gpt-5-codex"

    def test_run_outputs_prefer_session_settings_paths_when_present(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-123")
            codex_chat_id = "chat-codex-7"
            opencode_chat_id = "chat-opencode-7"

            codex_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            codex_run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": codex_chat_id,
                    "projectConfigId": "config-7",
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID(codex_chat_id),
            )
            runtime_codex_path = (
                dbe.path
                / "external_agent_settings"
                / "codex"
                / str(codex_config.id)
                / "sessions"
                / codex_chat_id
                / "config.toml"
            )
            runtime_codex_path.parent.mkdir(parents=True, exist_ok=True)
            runtime_codex_path.write_text("# test\n", encoding="utf-8")
            message = AssistantChatMessage(
                id="m7",
                content=[MessageTextContent(text="Hello")],
            )
            state = runner._apply_stream_chunk_to_state(
                codex_run,
                MessageStartEvent(message=AssistantChatMessage(id="m7", content=[])),
            )
            state = runner._apply_stream_chunk_to_state(
                codex_run,
                MessageDeltaEvent(
                    message_id="m7",
                    content=[MessageTextDelta(index=0, text="Hello")],
                ),
            )
            state = runner._apply_stream_chunk_to_state(
                codex_run,
                MessageFinalizedEvent(message=message),
            )
            runner._persist_outputs_from_state(codex_run, codex_config, state)

            assert codex_run.outputs is not None
            metadata = codex_run.outputs.get("metadata")
            assert isinstance(metadata, dict)
            settings_paths = metadata.get("settingsPaths")
            assert isinstance(settings_paths, dict)
            assert settings_paths.get("codex") == str(runtime_codex_path)

            opencode_config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )
            opencode_run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": opencode_chat_id,
                    "projectConfigId": "config-7",
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID(opencode_chat_id),
            )
            runtime_opencode_path = (
                dbe.path
                / "external_agent_settings"
                / "opencode"
                / str(opencode_config.id)
                / "sessions"
                / opencode_chat_id
                / "opencode.json"
            )
            runtime_opencode_path.parent.mkdir(parents=True, exist_ok=True)
            runtime_opencode_path.write_text('{"test": true}\n', encoding="utf-8")
            state = runner._apply_stream_chunk_to_state(
                opencode_run,
                MessageStartEvent(message=AssistantChatMessage(id="m7", content=[])),
            )
            state = runner._apply_stream_chunk_to_state(
                opencode_run,
                MessageDeltaEvent(
                    message_id="m7",
                    content=[MessageTextDelta(index=0, text="Hello")],
                ),
            )
            state = runner._apply_stream_chunk_to_state(
                opencode_run,
                MessageFinalizedEvent(message=message),
            )
            runner._persist_outputs_from_state(opencode_run, opencode_config, state)

            assert opencode_run.outputs is not None
            metadata = opencode_run.outputs.get("metadata")
            assert isinstance(metadata, dict)
            settings_paths = metadata.get("settingsPaths")
            assert isinstance(settings_paths, dict)
            assert settings_paths.get("opencode") == str(runtime_opencode_path)

    def test_context_accepts_explicit_ids(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            profile = AgentProfile(name="Agent")

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                profile=profile,
                inputs={"chatId": "chat-1", "sectionId": "section-1"},
            )

            assert str(context.chat_id) == "chat-1"
            assert str(context.section_id) == "section-1"

    def test_context_validates_project_config_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-2")
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            with pytest.raises(TypeError):
                runner._build_context(
                    engine_config_id,
                    config,
                    profile=None,
                    inputs={"projectConfigId": 123},
                )

    def test_context_rejects_blank_frontend_affinity_token(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-2b")
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            with pytest.raises(
                ValueError,
                match="frontendAffinityToken must be a non-empty string when provided.",
            ):
                runner._build_context(
                    engine_config_id,
                    config,
                    profile=None,
                    inputs={
                        "frontendAffinityToken": "   ",
                        "allowUnscoped": True,
                    },
                )

    def test_working_dir_custom_is_created(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            working_dir = Path(tmpdir) / "custom-working-dir"
            config = ExternalAgentConfig(
                name="Custom",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                workingDirStrategy=ExternalAgentWorkingDirStrategy.custom,
                workingDir=str(working_dir),
            )

            resolved = runner._resolve_working_dir(config)

            assert resolved.exists()
            assert resolved == working_dir

    def test_env_whitelist_reads_process_env(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            previous_openai_key = os.environ.get("OPENAI_API_KEY")
            try:
                os.environ["OPENAI_API_KEY"] = "secret"
                runner = _build_runner(dbe)
                config = ExternalAgentConfig(
                    name="Codex app-server",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.app_server,
                    envVarWhitelist=["OPENAI_API_KEY"],
                )

                env = runner._build_env(config)

                assert env.get("OPENAI_API_KEY") == "secret"
            finally:
                if previous_openai_key is None:
                    os.environ.pop("OPENAI_API_KEY", None)
                else:
                    os.environ["OPENAI_API_KEY"] = previous_openai_key

    def test_env_whitelist_ignores_whitespace_process_values(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            previous_openai_key = os.environ.get("OPENAI_API_KEY")
            try:
                os.environ["OPENAI_API_KEY"] = "   "
                runner = _build_runner(dbe)
                config = ExternalAgentConfig(
                    name="Codex app-server",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.app_server,
                    envVarWhitelist=["OPENAI_API_KEY"],
                )

                env = runner._build_env(config)

                assert "OPENAI_API_KEY" not in env
            finally:
                if previous_openai_key is None:
                    os.environ.pop("OPENAI_API_KEY", None)
                else:
                    os.environ["OPENAI_API_KEY"] = previous_openai_key

    def test_env_whitelist_ignores_dotenv_without_managed_or_process_value(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.dot_env = Path(tmpdir) / ".env"
            dbe.write_dot_env({"OPENAI_API_KEY": "secret"})
            previous_openai_key = os.environ.pop("OPENAI_API_KEY", None)
            try:
                runner = _build_runner(dbe)
                config = ExternalAgentConfig(
                    name="Codex app-server",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.app_server,
                    envVarWhitelist=["OPENAI_API_KEY"],
                )

                env = runner._build_env(config)

                assert "OPENAI_API_KEY" not in env
            finally:
                if previous_openai_key is None:
                    os.environ.pop("OPENAI_API_KEY", None)
                else:
                    os.environ["OPENAI_API_KEY"] = previous_openai_key

    def test_plugin_adapter_env_whitelist_is_applied_in_runtime_env(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            previous_plugin_key = os.environ.get("FIXTURE_EXTERNAL_AGENT_TOKEN")
            try:
                os.environ["FIXTURE_EXTERNAL_AGENT_TOKEN"] = "secret"
                websocket_manager = WebsocketManager()
                frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
                registration = PluginRegisteredExternalAgentAdapter(
                    adapterId="setta-fixture-backend-external-agent:fixture-agent",
                    pluginId="setta-fixture-backend-external-agent",
                    name="Fixture External Agent",
                    runModes=["sdk"],
                    command=sys.executable,
                    args=["-c", "print('fixture')"],
                    envVarWhitelist=["FIXTURE_EXTERNAL_AGENT_TOKEN"],
                    defaultModel="fixture-model",
                )
                runner = ExternalAgentRunner(
                    dbe,
                    frontend_sender,
                    plugin_external_agent_adapters=[registration],
                )
                config = ExternalAgentConfig(
                    name="Fixture Plugin Adapter",
                    toolType=ExternalAgentToolType.plugin,
                    pluginAdapterId=registration.adapterId,
                    runMode=ExternalAgentRunMode.sdk,
                    envVarWhitelist=[],
                )

                env = runner._build_env(config)

                assert env.get("FIXTURE_EXTERNAL_AGENT_TOKEN") == "secret"
            finally:
                if previous_plugin_key is None:
                    os.environ.pop("FIXTURE_EXTERNAL_AGENT_TOKEN", None)
                else:
                    os.environ["FIXTURE_EXTERNAL_AGENT_TOKEN"] = previous_plugin_key

    def test_non_plugin_tool_ignores_plugin_adapter_env_whitelist(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            previous_openai_key = os.environ.get("OPENAI_API_KEY")
            previous_plugin_key = os.environ.get("FIXTURE_EXTERNAL_AGENT_TOKEN")
            try:
                os.environ["OPENAI_API_KEY"] = "openai-secret"
                os.environ["FIXTURE_EXTERNAL_AGENT_TOKEN"] = "plugin-secret"
                websocket_manager = WebsocketManager()
                frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
                registration = PluginRegisteredExternalAgentAdapter(
                    adapterId="setta-fixture-backend-external-agent:fixture-agent",
                    pluginId="setta-fixture-backend-external-agent",
                    name="Fixture External Agent",
                    runModes=["sdk"],
                    command=sys.executable,
                    args=["-c", "print('fixture')"],
                    envVarWhitelist=["FIXTURE_EXTERNAL_AGENT_TOKEN"],
                    defaultModel="fixture-model",
                )
                runner = ExternalAgentRunner(
                    dbe,
                    frontend_sender,
                    plugin_external_agent_adapters=[registration],
                )
                config = ExternalAgentConfig(
                    name="Codex app-server",
                    toolType=ExternalAgentToolType.codex,
                    pluginAdapterId=registration.adapterId,
                    runMode=ExternalAgentRunMode.app_server,
                    envVarWhitelist=["OPENAI_API_KEY"],
                )

                env = runner._build_env(config)

                assert env.get("OPENAI_API_KEY") == "openai-secret"
                assert "FIXTURE_EXTERNAL_AGENT_TOKEN" not in env
            finally:
                if previous_openai_key is None:
                    os.environ.pop("OPENAI_API_KEY", None)
                else:
                    os.environ["OPENAI_API_KEY"] = previous_openai_key
                if previous_plugin_key is None:
                    os.environ.pop("FIXTURE_EXTERNAL_AGENT_TOKEN", None)
                else:
                    os.environ["FIXTURE_EXTERNAL_AGENT_TOKEN"] = previous_plugin_key

    def test_claude_mcp_config_is_written(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": True,
                    }
                },
            )
            runner = _build_runner(dbe)
            profile = AgentProfile(
                name="Claude",
                toolAllowlist=["setta__getProjectState", "mcp__setta__runTool"],
            )
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(
                runner,
                config,
                profile=profile,
            )

            config_path = context.inputs.get("mcpConfig")
            assert isinstance(config_path, str)
            path = Path(str(config_path))
            assert path.exists()
            payload = json.loads(path.read_text(encoding="utf-8"))
            assert payload["mcpServers"]["setta"]["url"] == f"{C.BACKEND}/mcp"
            allowed_tools = context.inputs.get("allowedTools")
            assert isinstance(allowed_tools, list)
            assert "mcp__setta__getProjectState" in allowed_tools
            assert "mcp__setta__report_completion_status" in allowed_tools
            assert "mcp__setta__runTool" in allowed_tools
            assert "mcp__setta__set_agentic_context" in allowed_tools

            runner._cleanup_context(context)
            assert not path.exists()

    def test_claude_mcp_config_omits_completion_report_tool_when_guard_disabled(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
            runner = _build_runner(dbe)
            profile = AgentProfile(
                name="Claude",
                toolAllowlist=["setta__getProjectState", "mcp__setta__runTool"],
            )
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(
                runner,
                config,
                profile=profile,
            )

            allowed_tools = context.inputs.get("allowedTools")
            assert isinstance(allowed_tools, list)
            assert "mcp__setta__getProjectState" in allowed_tools
            assert "mcp__setta__runTool" in allowed_tools
            assert "mcp__setta__set_agentic_context" in allowed_tools
            assert "mcp__setta__report_completion_status" not in allowed_tools

    def test_opencode_mcp_config_is_written(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                id="opencode-config",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = _build_context_for_test(runner, config)

            config_path = context.env.get("OPENCODE_CONFIG")
            assert isinstance(config_path, str)
            path = Path(str(config_path))
            assert path.exists()
            payload = json.loads(path.read_text(encoding="utf-8"))
            assert payload["mcp"]["setta"]["url"] == f"{C.BACKEND}/mcp"
            expected_base_path = (
                dbe.path
                / "external_agent_settings"
                / "opencode"
                / "opencode-config"
                / "opencode.json"
            )
            expected_path = (
                expected_base_path.parent
                / "sessions"
                / str(context.chat_id)
                / expected_base_path.name
            )
            # With agentic headers/session-scoped config we skip the base config write.
            assert not expected_base_path.exists()
            assert path == expected_path

            runner._cleanup_context(context)
            assert path.exists()

    def test_codex_home_config_is_written(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            codex_home = Path(tmpdir) / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.figma-desktop]
command = "figma"
args = ["mcp"]
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            config = ExternalAgentConfig(
                id="codex-config",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(runner, config)

            codex_home = context.env.get("CODEX_HOME")
            assert isinstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            assert config_path.exists()
            content = config_path.read_text(encoding="utf-8")
            assert "[mcp_servers.setta]" in content
            assert f'url = "{C.BACKEND}/mcp/streamable/"' in content
            expected_dir = (
                dbe.path / "external_agent_settings" / "codex" / "codex-config"
            )
            expected_runtime_dir = expected_dir / "sessions" / str(context.chat_id)
            canonical_config_path = expected_dir / "config.toml"
            assert canonical_config_path.exists()
            canonical_payload = tomllib.loads(
                canonical_config_path.read_text(encoding="utf-8")
            )
            assert isinstance(canonical_payload.get("codexMcpImportedAt"), str)
            canonical_servers = canonical_payload.get("mcp_servers")
            assert isinstance(canonical_servers, dict)
            if not isinstance(canonical_servers, dict):
                raise AssertionError("Expected mcp_servers table")
            assert "figma-desktop" in canonical_servers
            assert Path(str(codex_home)) == expected_runtime_dir

            runner._cleanup_context(context)
            assert config_path.exists()

    def test_codex_runtime_config_persists_canonical_config_without_bootstrap_source(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            # Use an isolated HOME and no CODEX_HOME to avoid host fallback behavior.
            fallback_home = Path(tmpdir) / "fake-home"
            fallback_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.setenv("HOME", str(fallback_home))
            config = ExternalAgentConfig(
                id="codex-empty-bootstrap",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(runner, config)

            runtime_codex_home = context.env.get("CODEX_HOME")
            assert isinstance(runtime_codex_home, str)
            runtime_payload = tomllib.loads(
                (Path(str(runtime_codex_home)) / "config.toml").read_text(
                    encoding="utf-8"
                )
            )
            runtime_servers = runtime_payload.get("mcp_servers")
            assert isinstance(runtime_servers, dict)
            if not isinstance(runtime_servers, dict):
                raise AssertionError("Expected mcp_servers table")
            assert set(runtime_servers.keys()) == {SETTA_MCP_SERVER_ID}

            canonical_config_path = (
                dbe.path
                / "external_agent_settings"
                / "codex"
                / "codex-empty-bootstrap"
                / "config.toml"
            )
            assert canonical_config_path.exists()
            canonical_payload = tomllib.loads(
                canonical_config_path.read_text(encoding="utf-8")
            )
            assert canonical_payload.get("codexMcpImportedAt") is None

            runner._cleanup_context(context)

    def test_codex_runtime_config_with_empty_codex_home_env_does_not_use_home_fallback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Runtime bootstrap must ignore ~/.codex when CODEX_HOME is explicitly present.
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            fallback_home = Path(tmpdir) / "fake-home"
            (fallback_home / ".codex").mkdir(parents=True, exist_ok=True)
            (fallback_home / ".codex" / "config.toml").write_text(
                """
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("HOME", str(fallback_home))
            monkeypatch.setenv("CODEX_HOME", "")
            config = ExternalAgentConfig(
                id="codex-empty-codex-home-env",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(runner, config)

            runtime_codex_home = context.env.get("CODEX_HOME")
            assert isinstance(runtime_codex_home, str)
            runtime_payload = tomllib.loads(
                (Path(runtime_codex_home) / "config.toml").read_text(encoding="utf-8")
            )
            runtime_servers = runtime_payload.get("mcp_servers")
            assert isinstance(runtime_servers, dict)
            if not isinstance(runtime_servers, dict):
                raise AssertionError("Expected mcp_servers table")
            assert "fallback-home-server" not in runtime_servers
            assert set(runtime_servers.keys()) == {SETTA_MCP_SERVER_ID}

            runner._cleanup_context(context)

    def test_codex_runtime_config_read_only_no_edit_skips_non_writable_canonical_persistence(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Read-only/no-edit runtime setup should succeed without touching canonical config.
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                id="codex-read-only-no-edit",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                settingsMode=ExternalAgentSettingsMode.read_only,
                settingsAllowSettaEdits=False,
            )
            canonical_config_path = (
                dbe.path
                / "external_agent_settings"
                / "codex"
                / "codex-read-only-no-edit"
                / "config.toml"
            )
            canonical_config_path.parent.mkdir(parents=True, exist_ok=True)
            canonical_config_path.write_text(
                '# keep-comment\n[mcp_servers.workspace-tools]\ntransport = "streamable_http"\nurl = "http://127.0.0.1:9100/mcp"\n',
                encoding="utf-8",
            )
            canonical_before = canonical_config_path.read_text(encoding="utf-8")
            original_permissions = canonical_config_path.stat().st_mode
            context = None
            os.chmod(canonical_config_path, 0o444)
            try:
                context = _build_context_for_test(runner, config)
                runtime_codex_home = context.env.get("CODEX_HOME")
                assert isinstance(runtime_codex_home, str)
                runtime_payload = tomllib.loads(
                    (Path(runtime_codex_home) / "config.toml").read_text(
                        encoding="utf-8"
                    )
                )
                runtime_servers = runtime_payload.get("mcp_servers")
                assert isinstance(runtime_servers, dict)
                if not isinstance(runtime_servers, dict):
                    raise AssertionError("Expected mcp_servers table")
                assert runtime_servers.get("setta", {}).get("url") == (
                    f"{C.BACKEND}/mcp/streamable/"
                )
                assert "workspace-tools" in runtime_servers
                assert (
                    canonical_config_path.read_text(encoding="utf-8")
                    == canonical_before
                )
            finally:
                if canonical_config_path.exists():
                    os.chmod(canonical_config_path, original_permissions)
                if context is not None:
                    runner._cleanup_context(context)

    def test_codex_runtime_config_managed_local_no_edit_does_not_create_missing_canonical(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            isolated_home = Path(tmpdir) / "isolated-home"
            isolated_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.setenv("HOME", str(isolated_home))
            config = ExternalAgentConfig(
                id="codex-managed-local-no-edit-missing-canonical",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                settingsMode=ExternalAgentSettingsMode.managed_local,
                settingsAllowSettaEdits=False,
            )
            canonical_config_path = (
                dbe.path
                / "external_agent_settings"
                / "codex"
                / "codex-managed-local-no-edit-missing-canonical"
                / "config.toml"
            )
            assert not canonical_config_path.exists()

            context = _build_context_for_test(runner, config)
            runtime_codex_home = context.env.get("CODEX_HOME")
            assert isinstance(runtime_codex_home, str)
            runtime_payload = tomllib.loads(
                (Path(str(runtime_codex_home)) / "config.toml").read_text(
                    encoding="utf-8"
                )
            )
            runtime_servers = runtime_payload.get("mcp_servers")
            assert isinstance(runtime_servers, dict)
            if not isinstance(runtime_servers, dict):
                raise AssertionError("Expected mcp_servers table")
            assert runtime_servers.get("setta", {}).get("url") == (
                f"{C.BACKEND}/mcp/streamable/"
            )
            assert not canonical_config_path.exists()

            runner._cleanup_context(context)

    def test_codex_runtime_home_respects_canonical_bootstrap_marker(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            codex_home = Path(tmpdir) / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.figma-desktop]
command = "figma"
args = ["mcp"]
""".strip()
                + "\n",
                encoding="utf-8",
            )
            config = ExternalAgentConfig(
                id="codex-runtime-marker",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            with pytest.MonkeyPatch.context() as monkeypatch:
                monkeypatch.setenv("CODEX_HOME", str(codex_home))
                context_1 = _build_context_for_test(runner, config)
                canonical_config_path = (
                    dbe.path
                    / "external_agent_settings"
                    / "codex"
                    / "codex-runtime-marker"
                    / "config.toml"
                )
                canonical_payload = tomllib.loads(
                    canonical_config_path.read_text(encoding="utf-8")
                )
                marker = canonical_payload.get("codexMcpImportedAt")
                assert isinstance(marker, str)
                canonical_config_path.write_text(
                    f'codexMcpImportedAt = "{marker}"\n',
                    encoding="utf-8",
                )

                context_2 = _build_context_for_test(runner, config)
                runtime_payload = tomllib.loads(
                    (Path(str(context_2.env["CODEX_HOME"])) / "config.toml").read_text(
                        encoding="utf-8"
                    )
                )
                runtime_servers = runtime_payload.get("mcp_servers")
                assert isinstance(runtime_servers, dict)
                if not isinstance(runtime_servers, dict):
                    raise AssertionError("Expected mcp_servers table")
                assert "figma-desktop" not in runtime_servers
                assert runtime_servers.get("setta", {}).get("url") == (
                    f"{C.BACKEND}/mcp/streamable/"
                )

                runner._cleanup_context(context_1)
                runner._cleanup_context(context_2)

    def test_codex_config_writes_policy_fields(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
                sandboxPolicy="workspace-write",
                approvalPolicy="on-failure",
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(runner, config)

            codex_home = context.env.get("CODEX_HOME")
            assert isinstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            content = config_path.read_text(encoding="utf-8")
            assert 'model = "gpt-5-codex"' in content
            assert 'sandbox_mode = "workspace-write"' in content
            assert 'approval_policy = "on-failure"' in content

            runner._cleanup_context(context)
            assert config_path.exists()

    def test_codex_config_includes_setta_system_prompt(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                id="codex-system-prompt",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )

            context = _build_context_for_test(
                runner,
                config,
                inputs={"systemPrompt": "Extra Codex guidance"},
            )

            codex_home = context.env.get("CODEX_HOME")
            assert isinstance(codex_home, str)
            if not isinstance(codex_home, str):
                raise AssertionError("Expected CODEX_HOME to be a string")
            config_path = Path(codex_home) / "config.toml"
            payload = tomllib.loads(config_path.read_text(encoding="utf-8"))
            developer_instructions = payload.get("developer_instructions")
            assert isinstance(developer_instructions, str)
            if isinstance(developer_instructions, str):
                assert "Setta MCP System Prompt" in developer_instructions
                assert "## Active project config" in developer_instructions
                assert "Extra Codex guidance" in developer_instructions
                assert developer_instructions.find(
                    "Setta MCP System Prompt"
                ) < developer_instructions.find("Extra Codex guidance")

            runner._cleanup_context(context)
            assert config_path.exists()

    def test_codex_config_writes_tool_allowlist(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": True,
                    }
                },
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            profile = AgentProfile(
                name="Codex",
                toolAllowlist=["setta__getProjectState", "runTool"],
            )
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                profile=profile,
            )

            codex_home = context.env.get("CODEX_HOME")
            assert isinstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            payload = tomllib.loads(config_path.read_text(encoding="utf-8"))
            mcp_servers = payload.get("mcp_servers")
            assert isinstance(mcp_servers, dict)
            server_entry = (
                mcp_servers.get(SETTA_MCP_SERVER_ID)
                if isinstance(mcp_servers, dict)
                else None
            )
            assert isinstance(server_entry, dict)
            if isinstance(server_entry, dict):
                enabled_tools = server_entry.get("enabled_tools")
            else:
                enabled_tools = None
            assert enabled_tools == [
                "getProjectState",
                "report_completion_status",
                "runTool",
                "set_agentic_context",
            ]

            runner._cleanup_context(context)
            assert config_path.exists()

    def test_codex_config_omits_completion_report_tool_when_guard_disabled(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            profile = AgentProfile(
                name="Codex",
                toolAllowlist=["setta__getProjectState", "runTool"],
            )
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                profile=profile,
            )

            codex_home = context.env.get("CODEX_HOME")
            assert isinstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            payload = tomllib.loads(config_path.read_text(encoding="utf-8"))
            mcp_servers = payload.get("mcp_servers")
            assert isinstance(mcp_servers, dict)
            server_entry = (
                mcp_servers.get(SETTA_MCP_SERVER_ID)
                if isinstance(mcp_servers, dict)
                else None
            )
            assert isinstance(server_entry, dict)
            if isinstance(server_entry, dict):
                enabled_tools = server_entry.get("enabled_tools")
            else:
                enabled_tools = None
            assert enabled_tools == [
                "getProjectState",
                "runTool",
                "set_agentic_context",
            ]

    def test_opencode_config_writes_permissions(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy="ask",
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(runner, config)

            config_path = context.env.get("OPENCODE_CONFIG")
            assert isinstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            assert payload.get("permission") == "ask"

            runner._cleanup_context(context)

    def test_opencode_config_merges_tool_allowlist(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": True,
                    }
                },
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            profile = AgentProfile(
                name="OpenCode",
                toolAllowlist=["setta__getProjectState"],
            )
            config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                profile=profile,
            )

            config_path = context.env.get("OPENCODE_CONFIG")
            assert isinstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            permissions = payload.get("permission")
            assert isinstance(permissions, dict)
            assert permissions.get("setta_*") == "deny"
            assert permissions.get("setta_getProjectState") == "allow"
            assert permissions.get("setta_report_completion_status") == "allow"
            assert permissions.get("setta_set_agentic_context") == "allow"

            runner._cleanup_context(context)

    def test_opencode_config_omits_completion_report_when_guard_disabled(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            profile = AgentProfile(
                name="OpenCode",
                toolAllowlist=["setta__getProjectState"],
            )
            config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=engine_config_id,
                profile=profile,
            )

            config_path = context.env.get("OPENCODE_CONFIG")
            assert isinstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            permissions = payload.get("permission")
            assert isinstance(permissions, dict)
            assert permissions.get("setta_*") == "deny"
            assert permissions.get("setta_getProjectState") == "allow"
            assert permissions.get("setta_set_agentic_context") == "allow"
            assert permissions.get("setta_report_completion_status") != "allow"

    def test_opencode_config_accepts_json_permissions(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                approvalPolicy='{"run": "ask"}',
                settingsMode=ExternalAgentSettingsMode.managed_project,
            )

            context = _build_context_for_test(runner, config)

            config_path = context.env.get("OPENCODE_CONFIG")
            assert isinstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            permissions = payload.get("permission")
            assert isinstance(permissions, dict)
            assert permissions.get("run") == "ask"

            runner._cleanup_context(context)

    def test_temp_working_dir_is_cleaned(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="TempDir",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                workingDirStrategy=ExternalAgentWorkingDirStrategy.temp_dir,
            )

            context = _build_context_for_test(runner, config)

            assert context.working_dir.exists()
            runner._cleanup_context(context)
            assert not context.working_dir.exists()


class TestExternalAgentRunnerPluginAdapter:
    pytestmark = pytest.mark.asyncio

    async def test_plugin_process_adapter_runs_and_streams_text(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        fixture_script = (
            Path(__file__).resolve().parents[1]
            / "fixtures"
            / "plugins"
            / "backend-external-agent"
            / "backend"
            / "mini_external_agent.py"
        )
        assert fixture_script.exists()

        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            registration = PluginRegisteredExternalAgentAdapter(
                adapterId="setta-fixture-backend-external-agent:fixture-agent",
                pluginId="setta-fixture-backend-external-agent",
                name="Fixture External Agent",
                runModes=["sdk"],
                command=sys.executable,
                args=[str(fixture_script)],
                envVarWhitelist=["FIXTURE_EXTERNAL_AGENT_TOKEN"],
                defaultModel="fixture-model",
            )
            runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                plugin_external_agent_adapters=[registration],
            )
            lookup_call_count = 0
            original_lookup = runner._adapter_registry.lookup

            def _record_lookup(*args, **kwargs):
                nonlocal lookup_call_count
                lookup_call_count += 1
                return original_lookup(*args, **kwargs)

            monkeypatch.setattr(runner._adapter_registry, "lookup", _record_lookup)
            config = ExternalAgentConfig(
                name="Fixture Plugin Adapter",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=registration.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                envVarWhitelist=[],
            )

            run = runner.start_run(
                ID("engine-plugin"),
                config,
                None,
                {
                    "prompt": "hello world",
                    "allowUnscoped": True,
                },
            )
            completed = await runner.wait_for_run(run.id, timeout=10.0)

            assert completed.status == AgentRunStatus.completed
            assert completed.outputs is not None
            assert completed.outputs.get("sessionId") == "fixture-session"
            final_text = completed.outputs.get("finalText")
            assert isinstance(final_text, str)
            assert "fixture external adapter reply: hello world" in final_text
            metadata = completed.outputs.get("metadata")
            assert isinstance(metadata, dict)
            if isinstance(metadata, dict):
                assert metadata.get("toolType") == "plugin"
                assert metadata.get("runMode") == "sdk"
                assert metadata.get("externalAgentConfigId") == str(config.id)
            assert lookup_call_count == 1


class TestExternalAgentRunnerApproval:
    pytestmark = pytest.mark.asyncio

    async def test_approval_request_emits_tool_call(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(runner, config)
            run = context.run

            await runner._handle_approval_request(
                context,
                run,
                {
                    "type": "approval_request",
                    "approvalId": "approval-1",
                    "tool": {"name": "shell"},
                    "input": {"command": "ls"},
                },
            )

            assert "approval-1" in runner._pending_approvals
            event_types = [event.type for event in run.events]
            assert "approval_request" in event_types
            assert "stream_chunk" not in event_types
            assert "external_event" not in event_types
            messages = run.outputs.get("messages") if run.outputs else None
            assert isinstance(messages, list)
            assert messages
            tool_calls = messages[-1].get("tool_calls")
            assert isinstance(tool_calls, list)
            assert tool_calls[0]["function"]["name"] == "setta.approval"
            assert (
                tool_calls[0]["function"]["arguments"].get("approvalId") == "approval-1"
            )

    async def test_codex_approval_request_preserves_tool_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            context = _build_context_for_test(runner, config)
            run = context.run

            payload = {
                "type": "approval_request",
                "approvalId": "approval-codex-1",
                "toolName": "commandExecution",
                "tool": "commandExecution",
                "method": "item/commandExecution/requestApproval",
                "params": {
                    "item": {
                        "type": "commandExecution",
                        "command": "ls",
                    }
                },
                "command": "ls",
                "input": {"command": "ls"},
            }

            await runner._handle_approval_request(context, run, payload)

            messages = run.outputs.get("messages") if run.outputs else None
            assert isinstance(messages, list)
            assert messages
            tool_calls = messages[-1].get("tool_calls")
            assert isinstance(tool_calls, list)
            assert tool_calls
            arguments = tool_calls[0]["function"]["arguments"]
            assert arguments.get("approvalId") == "approval-codex-1"
            assert arguments.get("toolName") == "commandExecution"
            assert arguments.get("tool") == "commandExecution"
            assert arguments.get("input") == {"command": "ls"}

    async def test_respond_to_approval_emits_tool_result(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": "engine-1",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-1"),
            )
            save_agent_run(dbe, run)

            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                "import sys; sys.stdin.read()",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            adapter = ClaudeSdkAdapter()
            handle = ExternalAgentRunHandle(run_id=run.id, process=process)
            pending = _PendingApproval(
                future=asyncio.get_running_loop().create_future(),
                tool_name="Bash",
                tool_input={},
            )
            handle.metadata["pending_approvals"] = {"approval-1": pending}
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=adapter,
            )
            runner._pending_approvals["approval-1"] = ExternalAgentApprovalState(
                approval_id="approval-1",
                run_id=run.id,
                project_config_id=project_config.id,
                chat_id=ID("chat-1"),
                section_id=ID("section-1"),
            )

            try:
                await runner.respond_to_approval("approval-1", True)
            finally:
                process.terminate()
                await process.wait()

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            event_types = [event.type for event in updated.events]
            assert "tool_result" in event_types
            assert "approval_response" in event_types
            assert "stream_chunk" not in event_types
            assert "external_event" not in event_types
            messages = updated.outputs.get("messages") if updated.outputs else None
            assert isinstance(messages, list)
            tool_messages = [
                message for message in messages if message.get("role") == "tool"
            ]
            assert tool_messages
            last_tool = tool_messages[-1]
            assert last_tool.get("tool_name") == "setta.approval"
            assert last_tool.get("result") == {"approved": True}
            assert "approval-1" not in runner._pending_approvals


class TestExternalAgentRunnerQuestion:
    pytestmark = pytest.mark.asyncio

    async def test_question_request_queues_claude_approval(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(runner, config)
            run = context.run
            question_payload = {
                "questions": [
                    {
                        "header": "Language",
                        "question": "Choose a language",
                        "multiSelect": False,
                        "options": [{"label": "Python"}],
                    }
                ]
            }

            await runner._handle_approval_request(
                context,
                run,
                {
                    "type": "approval_request",
                    "approvalId": "question-1",
                    "tool": "AskUserQuestion",
                    "input": question_payload,
                },
            )

            assert "question-1" not in runner._pending_questions
            assert "question-1" not in runner._pending_approvals
            assert runner._pending_question_approvals.get(run.id) == ["question-1"]
            event_types = [event.type for event in run.events]
            assert "approval_request" in event_types
            assert "stream_chunk" not in event_types
            assert "external_event" not in event_types
            messages = run.outputs.get("messages") if run.outputs else None
            assert messages is None

    async def test_stream_chunk_registers_question_tool_call(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                },
            )
            run = context.run

            await runner._handle_stream_chunk(
                context,
                run,
                ToolCallDeltaEvent(
                    message_id="message-1",
                    tool_call_id="tool-1",
                    arguments_delta="{",
                    tool_name="AskUserQuestion",
                ),
            )

            assert "tool-1" in runner._pending_questions
            state = runner._pending_questions["tool-1"]
            assert state.run_id == run.id
            assert state.chat_id == ID("chat-1")
            assert state.section_id == ID("section-1")
            assert state.approval_id is None

    async def test_message_finalized_blocks_user_visible_text_without_report(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": True,
                    }
                },
            )
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "messages": [
                        UserChatMessage(
                            id="user-1",
                            content=[
                                MessageTextContent(
                                    text=(
                                        "Create a new project and scaffold everything."
                                    )
                                )
                            ],
                        ).model_dump(mode="json")
                    ],
                },
            )
            run = context.run

            await runner._handle_stream_chunk(
                context,
                run,
                MessageFinalizedEvent(
                    message=AssistantChatMessage(
                        id="assistant-1",
                        content=[MessageTextContent(text="I need one clarification.")],
                    )
                ),
            )

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            outputs = updated.outputs or {}
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            assert assistant_messages
            assistant_content = assistant_messages[-1].get("content")
            assert isinstance(assistant_content, list)
            last_text_block = assistant_content[0]
            assert isinstance(last_text_block, dict)
            assert last_text_block.get("text") == MISSING_REPORT_MESSAGE

    async def test_message_finalized_skips_completion_guard_when_disabled(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "messages": [
                        UserChatMessage(
                            id="user-1",
                            content=[MessageTextContent(text="Implement task A.")],
                        ).model_dump(mode="json")
                    ],
                },
            )
            run = context.run

            await runner._handle_stream_chunk(
                context,
                run,
                MessageFinalizedEvent(
                    message=AssistantChatMessage(
                        id="assistant-1",
                        content=[MessageTextContent(text="Task A is done.")],
                    )
                ),
            )

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            outputs = updated.outputs or {}
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            assert assistant_messages
            assistant_content = assistant_messages[-1].get("content")
            assert isinstance(assistant_content, list)
            last_text_block = assistant_content[0]
            assert isinstance(last_text_block, dict)
            assert last_text_block.get("text") == "Task A is done."

    async def test_opencode_same_payload_tool_result_prevents_false_guard_block(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "messages": [
                        UserChatMessage(
                            id="user-1",
                            content=[MessageTextContent(text="Implement task A.")],
                        ).model_dump(mode="json")
                    ],
                },
            )
            run = context.run
            parser = _OpenCodeSdkEventParser()
            payload = {
                "id": "assistant-1",
                "text": "Task A is done.",
                "tool_call_id": "tool-report",
                "tool_name": "setta_report_completion_status",
                "result": {
                    "structuredContent": {
                        "completionIntent": True,
                        "requiresVerification": True,
                        "checkResults": [
                            {
                                "checkName": "pytest",
                                "required": True,
                                "status": "passed",
                            }
                        ],
                    }
                },
            }

            for event in parser.handle(payload):
                if event.stream_chunk is None:
                    continue
                await runner._handle_stream_chunk(context, run, event.stream_chunk)

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            outputs = updated.outputs or {}
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            assistant_messages = [
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            ]
            assert assistant_messages
            assistant_content = assistant_messages[-1].get("content")
            assert isinstance(assistant_content, list)
            last_text_block = assistant_content[0]
            assert isinstance(last_text_block, dict)
            assert last_text_block.get("text") == "Task A is done."

    async def test_question_approval_attaches_after_tool_call(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                },
            )
            run = context.run

            await runner._handle_stream_chunk(
                context,
                run,
                ToolCallDeltaEvent(
                    message_id="message-1",
                    tool_call_id="tool-1",
                    arguments_delta="{",
                    tool_name="AskUserQuestion",
                ),
            )

            await runner._handle_approval_request(
                context,
                run,
                {
                    "type": "approval_request",
                    "approvalId": "approval-1",
                    "tool": "AskUserQuestion",
                    "input": {},
                },
            )

            state = runner._pending_questions["tool-1"]
            assert state.approval_id == "approval-1"
            assert runner._pending_question_approvals.get(run.id) is None

    async def test_question_approval_attaches_before_tool_call(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                },
            )
            run = context.run

            await runner._handle_approval_request(
                context,
                run,
                {
                    "type": "approval_request",
                    "approvalId": "approval-1",
                    "tool": "AskUserQuestion",
                    "input": {},
                },
            )

            await runner._handle_stream_chunk(
                context,
                run,
                ToolCallDeltaEvent(
                    message_id="message-1",
                    tool_call_id="tool-1",
                    arguments_delta="{",
                    tool_name="AskUserQuestion",
                ),
            )

            state = runner._pending_questions["tool-1"]
            assert state.approval_id == "approval-1"
            assert runner._pending_question_approvals.get(run.id) is None

    async def test_respond_to_question_emits_flat_result(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": "engine-1",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-1"),
            )
            save_agent_run(dbe, run)

            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                "import sys; sys.stdin.read()",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            adapter = ClaudeSdkAdapter()
            handle = ExternalAgentRunHandle(run_id=run.id, process=process)
            pending = _PendingApproval(
                future=asyncio.get_running_loop().create_future(),
                tool_name="AskUserQuestion",
                tool_input={},
            )
            handle.metadata["pending_approvals"] = {"question-1": pending}
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=adapter,
            )
            runner._register_question_call(
                run.id,
                project_config.id,
                ID("chat-1"),
                "question-1",
            )
            answers = {"Language": "Python"}

            try:
                await runner.respond_to_question("question-1", answers)
            finally:
                process.terminate()
                await process.wait()

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            event_types = [event.type for event in updated.events]
            assert "tool_result" in event_types
            assert "question_response" in event_types
            assert "stream_chunk" not in event_types
            assert "external_event" not in event_types
            messages = updated.outputs.get("messages") if updated.outputs else None
            assert isinstance(messages, list)
            tool_messages = [
                message for message in messages if message.get("role") == "tool"
            ]
            assert tool_messages
            last_tool = tool_messages[-1]
            assert last_tool.get("result") == {"answers": answers}
            assert "question-1" not in runner._pending_questions

    async def test_respond_to_question_formats_multiple_answers(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": "engine-1",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-1"),
            )
            save_agent_run(dbe, run)

            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                "import sys; sys.stdin.read()",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            adapter = ClaudeSdkAdapter()
            handle = ExternalAgentRunHandle(run_id=run.id, process=process)
            pending = _PendingApproval(
                future=asyncio.get_running_loop().create_future(),
                tool_name="AskUserQuestion",
                tool_input={},
            )
            handle.metadata["pending_approvals"] = {"question-1": pending}
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=adapter,
            )
            runner._register_question_call(
                run.id,
                project_config.id,
                ID("chat-1"),
                "question-1",
            )
            answers = {"Language": "Python", "Framework": "FastAPI"}

            try:
                await runner.respond_to_question("question-1", answers)
            finally:
                process.terminate()
                await process.wait()

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            messages = updated.outputs.get("messages") if updated.outputs else None
            assert isinstance(messages, list)
            tool_messages = [
                message for message in messages if message.get("role") == "tool"
            ]
            assert tool_messages
            last_tool = tool_messages[-1]
            assert last_tool.get("result") == {"answers": answers}
            content = last_tool.get("content")
            assert isinstance(content, list)
            text_blocks = [
                block.get("text")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            assert text_blocks == ["Language: Python\nFramework: FastAPI"]

    async def test_respond_to_question_uses_approval_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": "engine-1",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
                run_id=ID("chat-1"),
            )
            save_agent_run(dbe, run)

            adapter = ClaudeSdkAdapter()
            handle = ExternalAgentRunHandle(run_id=run.id)
            pending_future = asyncio.get_running_loop().create_future()
            pending = _PendingApproval(
                future=pending_future,
                tool_name="AskUserQuestion",
                tool_input={},
            )
            handle.metadata["pending_approvals"] = {"approval-1": pending}
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=adapter,
            )
            runner._pending_question_approvals[run.id] = ["approval-1"]
            runner._register_question_call(
                run.id,
                project_config.id,
                ID("chat-1"),
                "question-1",
            )
            answers = {"Language": "Python"}

            await runner.respond_to_question("question-1", answers)

            assert pending_future.done()
            decision = pending_future.result()
            assert decision.approved
            assert decision.updated_input == {"answers": answers}
            pending_map = handle.metadata.get("pending_approvals")
            if isinstance(pending_map, dict):
                assert "approval-1" not in pending_map


class TestExternalAgentRunnerClaudeCapture:
    pytestmark = pytest.mark.asyncio

    async def test_streamed_text_persists_outputs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(runner, config)
            run = context.run

            await _apply_claude_payloads(
                runner,
                context,
                run,
                [
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "message_start",
                            "message": {"id": "msg-text-1", "content": []},
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {"type": "text", "text": "Hello"},
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {"type": "text_delta", "text": " world"},
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {"type": "message_stop"},
                    },
                ],
            )

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            if updated is None:
                return
            outputs = updated.outputs
            assert isinstance(outputs, dict)
            assert outputs.get("finalText") == "Hello world"
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            content = assistant.get("content")
            assert isinstance(content, list)
            text_blocks = [
                block.get("text")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            assert text_blocks == ["Hello world"]

    async def test_streamed_thinking_persists_outputs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(runner, config)
            run = context.run

            await _apply_claude_payloads(
                runner,
                context,
                run,
                [
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "message_start",
                            "message": {"id": "msg-think-1", "content": []},
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {
                                "type": "thinking",
                                "thinking": "Plan",
                                "summary": "Plan summary",
                                "signature": "sig-1",
                            },
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {
                                "type": "thinking_delta",
                                "thinking": " next",
                                "summary": "Next summary",
                            },
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {
                                "type": "signature_delta",
                                "signature": "sig-2",
                            },
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {"type": "message_stop"},
                    },
                ],
            )

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            if updated is None:
                return
            outputs = updated.outputs
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            content = assistant.get("content")
            assert isinstance(content, list)
            thinking_blocks = [
                block
                for block in content
                if isinstance(block, dict) and block.get("type") == "thinking"
            ]
            assert len(thinking_blocks) == 1
            block = thinking_blocks[0]
            assert block.get("thinking") == "Plan next"
            assert block.get("summary") == "Next summary"
            assert block.get("signature") == "sig-2"

    async def test_streamed_tool_use_and_result_persist(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(runner, config)
            run = context.run

            await _apply_claude_payloads(
                runner,
                context,
                run,
                [
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "message_start",
                            "message": {"id": "msg-tool-1", "content": []},
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {
                                "type": "tool_use",
                                "id": "toolu-1",
                                "name": "Bash",
                                "input": {"command": "ls"},
                            },
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_delta",
                            "index": 0,
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": '{"command": "ls"}',
                            },
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_stop",
                            "index": 0,
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_start",
                            "index": 1,
                            "content_block": {
                                "type": "tool_result",
                                "tool_use_id": "toolu-1",
                                "content": [{"type": "text", "text": "ok"}],
                            },
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {
                            "type": "content_block_stop",
                            "index": 1,
                        },
                    },
                    {
                        "type": "raw_message_stream_event",
                        "stream_event": {"type": "message_stop"},
                    },
                ],
            )

            updated = load_agent_run(dbe, run.id)
            assert updated is not None
            if updated is None:
                return
            outputs = updated.outputs
            assert isinstance(outputs, dict)
            messages = outputs.get("messages")
            assert isinstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            tool_calls = assistant.get("tool_calls")
            assert isinstance(tool_calls, list)
            assert len(tool_calls) == 1
            assert tool_calls[0].get("id") == "toolu-1"


class TestExternalAgentRunnerUsage:
    def test_normalize_external_usage_payload_maps_codex_and_context_fields(
        self,
    ) -> None:
        payload = {
            "usedTokens": "17",
            "windowTokens": 272000,
            "output_tokens": 9,
        }

        # Codex tokenUsage payloads should normalize to the shared usage shape.
        normalized = _normalize_external_usage_payload(payload)

        assert normalized == {
            "inputTokens": 17,
            "promptTokens": 17,
            "outputTokens": 9,
            "completionTokens": 9,
            "totalTokens": 26,
            "contextWindowTokens": 272000,
        }

    def test_extract_usage_payloads_reads_claude_result_message_usage(self) -> None:
        payload = {
            "type": "result_message",
            "message": {
                "usage": {
                    "input_tokens": 13,
                    "output_tokens": 4,
                }
            },
        }

        # Claude result envelopes should expose usage for runner-side capture.
        usage_payloads = _extract_usage_payloads(payload)

        assert len(usage_payloads) == 1
        assert usage_payloads[0] == {"input_tokens": 13, "output_tokens": 4}

    def test_extract_usage_payloads_reads_codex_thread_token_usage_result(self) -> None:
        payload = {
            "method": "thread/tokenUsage/read",
            "result": {
                "usedTokens": 31,
                "windowTokens": 272000,
            },
        }

        # Codex thread token-usage notifications should be discoverable.
        usage_payloads = _extract_usage_payloads(payload)

        assert usage_payloads
        assert {"usedTokens": 31, "windowTokens": 272000} in usage_payloads

    def test_extract_usage_payloads_reads_codex_nested_token_usage_payload(
        self,
    ) -> None:
        payload = {
            "method": "thread/tokenUsage/updated",
            "params": {
                "tokenUsage": {
                    "total": {
                        "inputTokens": 4834,
                        "outputTokens": 18,
                        "totalTokens": 4852,
                    },
                    "last": {
                        "inputTokens": 4834,
                        "outputTokens": 18,
                        "totalTokens": 4852,
                    },
                    "modelContextWindow": 258400,
                }
            },
        }

        # Codex nested tokenUsage envelopes should expose total/last usage rows.
        usage_payloads = _extract_usage_payloads(payload)

        assert {"inputTokens": 4834, "outputTokens": 18, "totalTokens": 4852} in (
            usage_payloads
        )
        assert any(
            isinstance(entry, dict) and entry.get("modelContextWindow") == 258400
            for entry in usage_payloads
        )

    def test_extract_usage_payloads_reads_codex_token_count_info_payload(self) -> None:
        payload = {
            "method": "codex/event/token_count",
            "params": {
                "msg": {
                    "info": {
                        "total_token_usage": {
                            "input_tokens": 2000,
                            "output_tokens": 25,
                            "total_tokens": 2025,
                        },
                        "last_token_usage": {
                            "input_tokens": 1500,
                            "output_tokens": 20,
                            "total_tokens": 1520,
                        },
                        "model_context_window": 258400,
                    }
                }
            },
        }

        # Codex token_count events should expose nested total_token_usage rows.
        usage_payloads = _extract_usage_payloads(payload)

        assert {"input_tokens": 2000, "output_tokens": 25, "total_tokens": 2025} in (
            usage_payloads
        )
        assert {"contextUsedTokens": 1500} in usage_payloads

    def test_capture_external_usage_from_codex_raw_payload_tracks_usage(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-codex"),
            )
            run = context.run

            runner._capture_external_usage_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "method": "thread/tokenUsage/read",
                    "result": {"usedTokens": 41, "windowTokens": 272000},
                },
            )

            usage = runner._usage_by_run_id.get(run.id)
            assert isinstance(usage, dict)
            assert usage.get("inputTokens") == 41
            assert usage.get("promptTokens") == 41
            assert usage.get("contextWindowTokens") == 272000

    def test_capture_external_usage_from_codex_nested_token_usage_tracks_usage(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-codex"),
            )
            run = context.run

            runner._capture_external_usage_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "method": "thread/tokenUsage/updated",
                    "params": {
                        "tokenUsage": {
                            "total": {
                                "inputTokens": 4834,
                                "outputTokens": 18,
                                "totalTokens": 4852,
                            },
                            "modelContextWindow": 258400,
                        }
                    },
                },
            )

            usage = runner._usage_by_run_id.get(run.id)
            assert isinstance(usage, dict)
            assert usage.get("inputTokens") == 4834
            assert usage.get("promptTokens") == 4834
            assert usage.get("outputTokens") == 18
            assert usage.get("completionTokens") == 18
            assert usage.get("totalTokens") == 4852
            assert usage.get("contextWindowTokens") == 258400

    def test_capture_external_usage_from_codex_token_count_tracks_usage(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-codex"),
            )
            run = context.run

            runner._capture_external_usage_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "method": "codex/event/token_count",
                    "params": {
                        "msg": {
                            "info": {
                                "total_token_usage": {
                                    "input_tokens": 2000,
                                    "output_tokens": 25,
                                    "total_tokens": 2025,
                                },
                                "model_context_window": 258400,
                            }
                        }
                    },
                },
            )

            usage = runner._usage_by_run_id.get(run.id)
            assert isinstance(usage, dict)
            assert usage.get("inputTokens") == 2000
            assert usage.get("promptTokens") == 2000
            assert usage.get("outputTokens") == 25
            assert usage.get("completionTokens") == 25
            assert usage.get("totalTokens") == 2025
            assert usage.get("contextWindowTokens") == 258400

    def test_capture_external_usage_from_codex_token_count_prefers_last_for_context(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-codex"),
            )
            run = context.run

            # token_count reports both cumulative (total) and current-turn (last)
            # usage; context occupancy should use the last prompt-token count.
            runner._capture_external_usage_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "method": "codex/event/token_count",
                    "params": {
                        "msg": {
                            "info": {
                                "total_token_usage": {
                                    "input_tokens": 69941,
                                    "output_tokens": 1455,
                                    "total_tokens": 71396,
                                },
                                "last_token_usage": {
                                    "input_tokens": 24766,
                                    "output_tokens": 430,
                                    "total_tokens": 25196,
                                },
                                "model_context_window": 258400,
                            }
                        }
                    },
                },
            )

            usage = runner._usage_by_run_id.get(run.id)
            assert isinstance(usage, dict)
            assert usage.get("inputTokens") == 69941
            assert usage.get("promptTokens") == 69941
            assert usage.get("contextWindowTokens") == 258400
            assert usage.get("contextUsedTokens") == 24766

    def test_upsert_external_usage_prefers_latest_context_used_tokens(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            run_id = ID("usage-run-context-latest")

            # Cumulative counters should remain max-based, but context occupancy is
            # point-in-time and must always reflect the latest update.
            runner._upsert_external_usage(
                run_id,
                {"promptTokens": 1000, "contextUsedTokens": 900},
            )
            runner._upsert_external_usage(
                run_id,
                {"promptTokens": 1100, "contextUsedTokens": 850},
            )

            usage = runner._usage_by_run_id.get(run_id)
            assert isinstance(usage, dict)
            assert usage.get("promptTokens") == 1100
            assert usage.get("contextUsedTokens") == 850

    def test_persist_outputs_from_state_merges_tracked_and_existing_usage(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-4o-mini",
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-codex"),
            )
            run = context.run
            run.outputs = {"usage": {"completionTokens": 3}}
            runner._usage_by_run_id[run.id] = {"promptTokens": 5}

            # Persists merged usage and fills context window metadata.
            runner._persist_outputs_from_state(run, config)

            persisted = load_agent_run(dbe, run.id)
            assert persisted is not None
            outputs = persisted.outputs
            assert isinstance(outputs, dict)
            usage = outputs.get("usage")
            assert isinstance(usage, dict)
            assert usage.get("promptTokens") == 5
            assert usage.get("completionTokens") == 3
            assert usage.get("totalTokens") == 8
            context_window_tokens = usage.get("contextWindowTokens")
            assert isinstance(context_window_tokens, int)
            assert context_window_tokens > 0


class TestExternalAgentRunnerMcpAuth:
    @contextmanager
    def _set_env(self, key: str, value: str | None) -> None:
        previous = os.environ.get(key)
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
        try:
            yield
        finally:
            if previous is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = previous

    @contextmanager
    def _set_session_env(self, session_id: str, sessions_root: Path) -> None:
        with ExitStack() as stack:
            stack.enter_context(self._set_env(SESSION_ID_ENV_VAR, session_id))
            stack.enter_context(
                self._set_env(SESSIONS_ROOT_ENV_VAR, str(sessions_root))
            )
            yield

    def _create_session(self, root: Path) -> tuple[str, Path]:
        sessions_root = root / "sessions"
        sessions_root.mkdir(parents=True, exist_ok=True)
        registry = SessionRegistry(sessions_root=sessions_root)
        session = registry.create_session(
            workspace_path=root,
            host="127.0.0.1",
            port=8000,
            pid=os.getpid(),
        )
        return session.id, sessions_root

    def test_claude_mcp_config_includes_auth_cookie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            session_id, sessions_root = self._create_session(root)
            with self._set_session_env(session_id, sessions_root):
                runner = _build_runner(_build_dbe(tmpdir))
                auth_headers = runner._build_mcp_auth_headers()
                assert auth_headers is not None
                config_path = runner._write_claude_mcp_config(
                    f"{C.BACKEND}/mcp",
                    headers=auth_headers,
                )
                payload = json.loads(config_path.read_text(encoding="utf-8"))
                server = payload.get("mcpServers", {}).get(SETTA_MCP_SERVER_ID)
                assert isinstance(server, dict)
                headers = server.get("headers") if isinstance(server, dict) else None
                assert isinstance(headers, dict)
                if isinstance(headers, dict):
                    cookie = headers.get("Cookie")
                else:
                    cookie = None
                assert isinstance(cookie, str)
                if isinstance(cookie, str):
                    assert cookie.startswith(f"{auth_cookie_name(session_id)}=")

    def test_opencode_config_includes_auth_cookie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            session_id, sessions_root = self._create_session(root)
            with self._set_session_env(session_id, sessions_root):
                dbe = _build_dbe(tmpdir)
                _write_project_state(dbe)
                runner = _build_runner(dbe)
                config = ExternalAgentConfig(
                    id="opencode-auth",
                    name="OpenCode SDK",
                    toolType=ExternalAgentToolType.opencode,
                    runMode=ExternalAgentRunMode.sdk,
                )
                context = _build_context_for_test(runner, config)
                config_path = Path(str(context.env.get("OPENCODE_CONFIG")))
                payload = json.loads(config_path.read_text(encoding="utf-8"))
                server = payload.get("mcp", {}).get(SETTA_MCP_SERVER_ID)
                assert isinstance(server, dict)
                headers = server.get("headers") if isinstance(server, dict) else None
                assert isinstance(headers, dict)
                if isinstance(headers, dict):
                    cookie = headers.get("Cookie")
                else:
                    cookie = None
                assert isinstance(cookie, str)
                if isinstance(cookie, str):
                    assert cookie.startswith(f"{auth_cookie_name(session_id)}=")

    def test_codex_config_includes_auth_cookie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            session_id, sessions_root = self._create_session(root)
            with self._set_session_env(session_id, sessions_root):
                dbe = _build_dbe(tmpdir)
                _write_project_state(dbe)
                runner = _build_runner(dbe)
                config = ExternalAgentConfig(
                    id="codex-auth",
                    name="Codex app-server",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.app_server,
                )
                context = _build_context_for_test(runner, config)
                codex_home = Path(str(context.env.get("CODEX_HOME")))
                payload = tomllib.loads(
                    (codex_home / "config.toml").read_text(encoding="utf-8")
                )
                mcp_servers = payload.get("mcp_servers")
                assert isinstance(mcp_servers, dict)
                server_entry = (
                    mcp_servers.get(SETTA_MCP_SERVER_ID)
                    if isinstance(mcp_servers, dict)
                    else None
                )
                assert isinstance(server_entry, dict)
                if isinstance(server_entry, dict):
                    headers = server_entry.get("http_headers")
                else:
                    headers = None
                assert isinstance(headers, dict)
                if isinstance(headers, dict):
                    cookie = headers.get("Cookie")
                else:
                    cookie = None
                assert isinstance(cookie, str)
                if isinstance(cookie, str):
                    assert cookie.startswith(f"{auth_cookie_name(session_id)}=")

    def test_assistant_payload_persists_tool_calls(self) -> None:
        async def _run() -> None:
            with TemporaryDirectory() as tmpdir:
                dbe = _build_dbe(tmpdir)
                _write_project_state(dbe)
                runner = _build_runner(dbe)
                config = ExternalAgentConfig(
                    name="Claude SDK",
                    toolType=ExternalAgentToolType.claude_code,
                    runMode=ExternalAgentRunMode.sdk,
                )
                context = _build_context_for_test(runner, config)
                run = context.run

                await _apply_claude_payloads(
                    runner,
                    context,
                    run,
                    [
                        {
                            "type": "assistant",
                            "message": {
                                "id": "msg-full-1",
                                "content": [
                                    {"type": "text", "text": "Hi"},
                                    {
                                        "type": "thinking",
                                        "thinking": "Plan",
                                        "summary": "Plan summary",
                                    },
                                    {
                                        "type": "tool_use",
                                        "id": "toolu-2",
                                        "name": "Read",
                                        "input": {"path": "README.md"},
                                    },
                                ],
                            },
                        }
                    ],
                )

                updated = load_agent_run(dbe, run.id)
                assert updated is not None
                if updated is None:
                    return
                outputs = updated.outputs
                assert isinstance(outputs, dict)
                assert outputs.get("finalText") == "Hi"
                messages = outputs.get("messages")
                assert isinstance(messages, list)
                assistant = next(
                    message
                    for message in messages
                    if isinstance(message, dict) and message.get("role") == "assistant"
                )
                tool_calls = assistant.get("tool_calls")
                assert isinstance(tool_calls, list)
                assert len(tool_calls) == 1
                assert tool_calls[0].get("id") == "toolu-2"
                function = tool_calls[0].get("function")
                assert isinstance(function, dict)
                assert function.get("name") == "Read"
                assert function.get("arguments") == {"path": "README.md"}

        asyncio.run(_run())


class TestExternalAgentRunnerMcpRuntimeStatus:
    def test_extract_status_payloads_ignores_non_mcp_error_event(self) -> None:
        # Non-MCP system events can include id/error fields; they should not be
        # surfaced as MCP server rows.
        rows = _extract_status_payloads(
            {
                "type": "system_message",
                "message": {
                    "id": "evt-123",
                    "error": "initialization failed",
                },
            }
        )
        assert rows == []

    def test_extract_status_payloads_keeps_id_fallback_in_mcp_container(self) -> None:
        # MCP payloads that omit serverId but include id should still normalize.
        rows = _extract_status_payloads(
            {
                "message": {
                    "mcp_servers": [
                        {
                            "id": "filesystem",
                            "status": "failed",
                            "error": "spawn failed",
                        }
                    ]
                }
            }
        )
        assert len(rows) == 1
        assert rows[0]["serverId"] == "filesystem"

    def test_extract_status_payloads_ignores_non_mcp_nested_dict_map(self) -> None:
        # Non-MCP envelopes can include nested dict maps that should not become
        # phantom MCP server rows.
        rows = _extract_status_payloads(
            {
                "type": "system_message",
                "message": {
                    "result": {
                        "auth": {
                            "error": "token missing",
                        }
                    }
                },
            }
        )
        assert rows == []

    def test_extract_status_payloads_ignores_generic_servers_container_by_default(
        self,
    ) -> None:
        # Generic "servers" containers should only be parsed for trusted
        # provider-specific status payloads.
        rows = _extract_status_payloads(
            {
                "message": {
                    "servers": [
                        {
                            "id": "api-east-1",
                            "status": "online",
                        }
                    ]
                }
            }
        )
        assert rows == []

    def test_extract_status_payloads_ignores_generic_items_container(self) -> None:
        # Generic "items" containers can include non-MCP events and should not
        # be treated as MCP status rows.
        rows = _extract_status_payloads(
            {
                "message": {
                    "items": [
                        {
                            "id": "evt-1",
                            "status": "failed",
                            "error": "tool crashed",
                        }
                    ]
                }
            }
        )
        assert rows == []

    def test_resolve_mcp_runtime_state_prefers_explicit_disabled_status(self) -> None:
        # Some providers report disabled via textual status even when connected=false.
        state = _resolve_mcp_runtime_state(
            {
                "connected": False,
                "status": "disabled",
            }
        )
        assert state == MCPServerRuntimeState.disabled

    def test_resolve_mcp_runtime_state_keeps_message_only_rows_unknown(self) -> None:
        # Informational messages should not be treated as failure signals.
        state = _resolve_mcp_runtime_state(
            {
                "connected": False,
                "message": "waiting for handshake",
            }
        )
        assert state == MCPServerRuntimeState.unknown

    def test_get_mcp_runtime_statuses_empty_without_chat_or_engine(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)

            assert (
                runner.get_mcp_server_runtime_statuses(
                    chat_id=None,
                    engine_config_id=ID("engine-1"),
                )
                == []
            )
            assert (
                runner.get_mcp_server_runtime_statuses(
                    chat_id=ID("chat-1"),
                    engine_config_id=None,
                )
                == []
            )

    def test_seeded_handle_payload_is_available_from_runtime_getter(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(
                run_id=run.id,
                metadata={
                    "mcp_server_status_payload": {
                        "servers": [
                            {
                                "id": "setta",
                                "connected": True,
                                "transport": "streamable_http",
                                "endpoint": "http://127.0.0.1:8000/mcp",
                                "toolCount": 4,
                            }
                        ]
                    }
                },
            )
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._seed_external_mcp_statuses_from_handle(
                context,
                run_id=run.id,
                handle=handle,
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert len(statuses) == 1
            assert statuses[0].serverId == "setta"
            assert statuses[0].state == MCPServerRuntimeState.connected
            assert statuses[0].toolCount == 4
            assert statuses[0].source == "external_runtime"

            assert (
                runner.get_mcp_server_runtime_statuses(
                    chat_id=run.id,
                    engine_config_id=ID("engine-2"),
                )
                == []
            )

    def test_single_object_mcp_container_with_id_fallback_is_not_dropped(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)

            statuses = runner._build_external_statuses_from_payload(
                payload={
                    "message": {
                        "mcp_servers": {
                            "id": "filesystem",
                            "status": "failed",
                            "error": "spawn failed",
                        }
                    }
                },
                provider=ExternalAgentToolType.claude_code.value,
            )

            # MCP rows that rely on "id" fallback should survive normalization.
            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.error
            assert statuses[0].lastError == "spawn failed"

    def test_opencode_empty_payload_does_not_fabricate_status_rows(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)

            # OpenCode unknown fallback rows are seeded from OPENCODE_CONFIG.
            # Empty status payload extraction must stay empty.
            statuses = runner._build_external_statuses_from_payload(
                payload={"type": "system_message", "message": {"status": "ok"}},
                provider=ExternalAgentToolType.opencode.value,
            )

            assert statuses == []

    def test_status_payload_message_only_row_stays_unknown(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)

            statuses = runner._build_external_statuses_from_payload(
                payload={
                    "message": {
                        "mcp_servers": [
                            {
                                "serverId": "filesystem",
                                "connected": False,
                                "message": "waiting for handshake",
                                "transport": "stdio",
                                "command": "npx @modelcontextprotocol/server-filesystem .",
                            }
                        ]
                    }
                },
                provider=ExternalAgentToolType.claude_code.value,
            )

            assert len(statuses) == 1
            assert statuses[0].state == MCPServerRuntimeState.unknown
            assert statuses[0].lastError is None

    def test_status_payload_nested_error_object_sets_error(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)

            statuses = runner._build_external_statuses_from_payload(
                payload={
                    "message": {
                        "mcp_servers": [
                            {
                                "serverId": "filesystem",
                                "connected": False,
                                "error": {"message": "spawn failed"},
                            }
                        ]
                    }
                },
                provider=ExternalAgentToolType.claude_code.value,
            )

            assert len(statuses) == 1
            assert statuses[0].state == MCPServerRuntimeState.error
            assert statuses[0].lastError == "spawn failed"

    def test_completed_run_reads_persisted_mcp_status_snapshot(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            runner._runs[run.id] = run
            runner._external_mcp_statuses_by_run_id[run.id] = {
                "filesystem": MCPServerRuntimeStatus(
                    serverId="filesystem",
                    source="external_runtime",
                    transport="stdio",
                    endpoint="npx @modelcontextprotocol/server-filesystem",
                    state=MCPServerRuntimeState.connected,
                    toolCount=3,
                )
            }
            runner._persist_external_mcp_status_snapshot(run.id, run=run)

            # Simulate normal task cleanup after completion.
            runner._runs.pop(run.id, None)
            runner._run_state.pop(run.id, None)
            runner._external_mcp_statuses_by_run_id.pop(run.id, None)

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )

            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.connected
            assert statuses[0].toolCount == 3

    def test_snapshot_persist_can_update_run_without_immediate_save(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            runner._runs[run.id] = run
            runner._external_mcp_statuses_by_run_id[run.id] = {
                "filesystem": MCPServerRuntimeStatus(
                    serverId="filesystem",
                    source="external_runtime",
                    transport="stdio",
                    endpoint="npx @modelcontextprotocol/server-filesystem",
                    state=MCPServerRuntimeState.connected,
                    toolCount=3,
                )
            }

            runner._persist_external_mcp_status_snapshot(run.id, run=run, save=False)

            assert run.outputs is not None
            assert "externalMcpServerRuntimeStatuses" in run.outputs
            persisted_before_save = load_agent_run(dbe, run.id)
            assert persisted_before_save is not None
            if persisted_before_save is None:
                return
            outputs_before_save = persisted_before_save.outputs or {}
            assert "externalMcpServerRuntimeStatuses" not in outputs_before_save

            save_agent_run(dbe, run)
            persisted_after_save = load_agent_run(dbe, run.id)
            assert persisted_after_save is not None
            if persisted_after_save is None:
                return
            outputs_after_save = persisted_after_save.outputs or {}
            assert "externalMcpServerRuntimeStatuses" in outputs_after_save

    def test_completed_run_ignores_invalid_persisted_mcp_status_snapshot_rows(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            runner._runs[run.id] = run
            runner._external_mcp_statuses_by_run_id[run.id] = {
                "filesystem": MCPServerRuntimeStatus(
                    serverId="filesystem",
                    source="external_runtime",
                    transport="stdio",
                    endpoint="npx @modelcontextprotocol/server-filesystem",
                    state=MCPServerRuntimeState.connected,
                    toolCount=3,
                )
            }
            runner._persist_external_mcp_status_snapshot(run.id, run=run)

            persisted_run = load_agent_run(dbe, run.id)
            assert persisted_run is not None
            if persisted_run is None:
                return
            outputs = persisted_run.outputs or {}
            snapshot = outputs.get("externalMcpServerRuntimeStatuses")
            assert isinstance(snapshot, list)
            snapshot.append({"serverId": 123})
            outputs["externalMcpServerRuntimeStatuses"] = snapshot
            persisted_run.outputs = outputs
            save_agent_run(dbe, persisted_run)

            # Simulate normal task cleanup after completion.
            runner._runs.pop(run.id, None)
            runner._run_state.pop(run.id, None)
            runner._external_mcp_statuses_by_run_id.pop(run.id, None)

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )

            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.connected
            assert statuses[0].toolCount == 3

    def test_codex_raw_response_payload_is_captured(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(run_id=run.id)
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._capture_external_mcp_statuses_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "id": 42,
                    "result": {
                        "servers": [
                            {
                                "id": "setta",
                                "connected": True,
                                "transport": "streamable_http",
                                "endpoint": "http://127.0.0.1:8000/mcp",
                                "toolCount": 8,
                            }
                        ]
                    },
                },
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert len(statuses) == 1
            assert statuses[0].serverId == "setta"
            assert statuses[0].state == MCPServerRuntimeState.connected
            assert statuses[0].toolCount == 8

    def test_claude_raw_status_payload_is_captured(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(run_id=run.id)
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._capture_external_mcp_statuses_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "type": "system_message",
                    "message": {
                        "mcp_servers": [
                            {
                                "serverId": "filesystem",
                                "status": "failed",
                                "transport": "stdio",
                                "command": "npx @modelcontextprotocol/server-filesystem .",
                                "error": "spawn failed",
                            }
                        ]
                    },
                },
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.error
            assert statuses[0].lastError == "spawn failed"
            assert (
                statuses[0].endpoint == "npx @modelcontextprotocol/server-filesystem ."
            )

    def test_claude_stream_event_then_system_message_captures_status(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()
            adapter = ClaudeSdkAdapter()
            handle = ExternalAgentRunHandle(
                run_id=run.id,
                metadata={"queue": queue},
            )
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=adapter,
            )

            async def _run_stream() -> None:
                await queue.put(
                    (
                        _QUEUE_KIND_MESSAGE,
                        StreamEvent(
                            uuid="stream-1",
                            session_id="session-1",
                            event={
                                "type": "message_start",
                                "message": {"id": "msg-1", "content": []},
                            },
                        ),
                    )
                )
                await queue.put(
                    (
                        _QUEUE_KIND_MESSAGE,
                        SystemMessage(
                            subtype="mcp_status",
                            data={
                                "mcp_servers": [
                                    {
                                        "serverId": "filesystem",
                                        "status": "failed",
                                        "transport": "stdio",
                                        "command": "npx @modelcontextprotocol/server-filesystem .",
                                        "error": "spawn failed",
                                    }
                                ]
                            },
                        ),
                    )
                )
                await queue.put((_QUEUE_KIND_DONE, None))
                async for event in adapter.stream_events(handle, context):
                    if not isinstance(event.raw, dict):
                        continue
                    runner._capture_external_mcp_statuses_from_raw(
                        context,
                        run_id=run.id,
                        raw_payload=event.raw,
                    )

            # Ensures raw MCP status from SystemMessage is still consumed even
            # after partial StreamEvent output has already started.
            asyncio.run(_run_stream())

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.error
            assert statuses[0].lastError == "spawn failed"

    def test_claude_raw_non_mcp_system_message_is_ignored(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(run_id=run.id)
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._capture_external_mcp_statuses_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "type": "system_message",
                    "message": {"type": "init", "id": "bootstrap-event"},
                },
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert statuses == []

    def test_claude_raw_non_mcp_error_message_is_ignored(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(run_id=run.id)
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._capture_external_mcp_statuses_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "type": "system_message",
                    "message": {
                        "id": "evt-123",
                        "error": "initialization failed",
                    },
                },
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert statuses == []

    def test_claude_raw_generic_servers_container_is_ignored(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(run_id=run.id)
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._capture_external_mcp_statuses_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "type": "system_message",
                    "message": {
                        "servers": [
                            {
                                "id": "api-east-1",
                                "status": "online",
                            }
                        ]
                    },
                },
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert statuses == []

    def test_claude_disabled_status_with_connected_false_is_preserved(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
            )
            run = context.run
            handle = ExternalAgentRunHandle(run_id=run.id)
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._capture_external_mcp_statuses_from_raw(
                context,
                run_id=run.id,
                raw_payload={
                    "type": "system_message",
                    "message": {
                        "mcp_servers": [
                            {
                                "serverId": "filesystem",
                                "connected": False,
                                "status": "disabled",
                                "transport": "stdio",
                                "command": "npx @modelcontextprotocol/server-filesystem .",
                            }
                        ]
                    },
                },
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.disabled

    def test_seeded_unknown_fallback_does_not_override_payload_status(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            mcp_config_path = Path(tmpdir) / "claude-mcp.json"
            mcp_config_path.write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "filesystem": {
                                "type": "stdio",
                                "command": "npx @modelcontextprotocol/server-filesystem .",
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            config = ExternalAgentConfig(
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            context = _build_context_for_test(
                runner,
                config,
                engine_config_id=ID("engine-1"),
                inputs={"mcpConfig": str(mcp_config_path)},
            )
            run = context.run
            handle = ExternalAgentRunHandle(
                run_id=run.id,
                metadata={
                    "mcp_server_status_payload": {
                        "mcp_servers": [
                            {
                                "serverId": "filesystem",
                                "connected": True,
                                "transport": "stdio",
                                "command": "npx @modelcontextprotocol/server-filesystem .",
                                "toolCount": 4,
                            }
                        ]
                    }
                },
            )
            runner._runs[run.id] = run
            runner._run_state[run.id] = ExternalAgentRunState(
                handle=handle,
                adapter=ClaudeSdkAdapter(),
            )

            runner._seed_external_mcp_statuses_from_handle(
                context,
                run_id=run.id,
                handle=handle,
            )

            statuses = runner.get_mcp_server_runtime_statuses(
                chat_id=run.id,
                engine_config_id=ID("engine-1"),
            )
            assert len(statuses) == 1
            assert statuses[0].serverId == "filesystem"
            assert statuses[0].state == MCPServerRuntimeState.connected
            assert statuses[0].toolCount == 4
