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

from setta.agentic.external_adapters.base import (
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.auth.cookies import auth_cookie_name
from setta.agentic.external_adapters.claude_sdk import (
    ClaudeSdkAdapter,
    _ClaudeSdkEventParser,
    _PendingApproval,
)
from setta.agentic.external_agent_defaults import (
    DEFAULT_CLAUDE_ALLOW_RULES,
    build_default_claude_settings_block,
)
from setta.agentic.external_agent_runner import (
    ExternalAgentApprovalState,
    ExternalAgentRunState,
    ExternalAgentRunner,
)
from setta.agentic.completion_guard import MISSING_CHECKS_MESSAGE
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
from setta.types.mcp_runtime_status import MCPServerRuntimeState
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.project_config import ProjectConfig
from setta.types.project_config import Position
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
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
            sourceSectionId=context_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
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
                inputs={"sectionId": str(chat_section_id)},
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
            assert headers.get(AGENTIC_CONTEXT_SECTION_ID_HEADER) == str(chat_section_id)

    def test_context_injects_agentic_headers_for_codex(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config, chat_section_id, _ = _write_project_state_with_agentic_context(
                dbe
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
            payload = tomllib.loads((codex_home / "config.toml").read_text(encoding="utf-8"))
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
            assert headers.get(AGENTIC_CONTEXT_SECTION_ID_HEADER) == str(chat_section_id)


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
                MessageStartEvent(
                    message=AssistantChatMessage(id="m1", content=[])
                ),
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
                MessageStartEvent(
                    message=AssistantChatMessage(id="m7", content=[])
                ),
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

    def test_env_whitelist_reads_dotenv(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.dot_env = Path(tmpdir) / ".env"
            dbe.write_dot_env({"OPENAI_API_KEY": "secret"})
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                envVarWhitelist=["OPENAI_API_KEY"],
            )

            env = runner._build_env(config)

            assert env.get("OPENAI_API_KEY") == "secret"

    def test_plugin_adapter_env_whitelist_is_applied_in_runtime_env(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.dot_env = Path(tmpdir) / ".env"
            dbe.write_dot_env({"FIXTURE_EXTERNAL_AGENT_TOKEN": "secret"})
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

    def test_non_plugin_tool_ignores_plugin_adapter_env_whitelist(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.dot_env = Path(tmpdir) / ".env"
            dbe.write_dot_env(
                {
                    "OPENAI_API_KEY": "openai-secret",
                    "FIXTURE_EXTERNAL_AGENT_TOKEN": "plugin-secret",
                }
            )
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

    def test_claude_mcp_config_is_written(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
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
            assert "mcp__setta__runTool" in allowed_tools
            assert "mcp__setta__set_agentic_context" in allowed_tools

            runner._cleanup_context(context)
            assert not path.exists()

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

    def test_codex_home_config_is_written(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
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
            assert f"url = \"{C.BACKEND}/mcp/streamable/\"" in content
            expected_dir = dbe.path / "external_agent_settings" / "codex" / "codex-config"
            expected_runtime_dir = expected_dir / "sessions" / str(context.chat_id)
            # With agentic headers/session-scoped home we skip writing the base config.
            assert not (expected_dir / "config.toml").exists()
            assert Path(str(codex_home)) == expected_runtime_dir

            runner._cleanup_context(context)
            assert config_path.exists()

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

            runner._cleanup_context(context)
            assert config_path.exists()

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

            runner._cleanup_context(context)

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
                tool_calls[0]["function"]["arguments"].get("approvalId")
                == "approval-1"
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

    async def test_message_finalized_applies_completion_guard(self) -> None:
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
                    "messages": [
                        UserChatMessage(
                            id="user-1",
                            content=[
                                MessageTextContent(
                                    text=(
                                        "Create a new project and scaffold "
                                        "everything."
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
                        content=[
                            MessageTextContent(text="Done. Everything is ready.")
                        ],
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
            assert last_text_block.get("text") == MISSING_CHECKS_MESSAGE

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
                                "partial_json": "{\"command\": \"ls\"}",
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
            assert statuses[0].endpoint == "npx @modelcontextprotocol/server-filesystem ."

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
