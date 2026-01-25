import asyncio
import json
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from setta.agentic.external_adapters.base import (
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.external_adapters.claude_sdk import (
    ClaudeSdkAdapter,
    _ClaudeSdkEventParser,
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
from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE
from setta.agentic.store import create_agent_run, load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, AgentRunStatus
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
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
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.utils.constants import C
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
    context, _ = runner._build_context(
        resolved_engine_id,
        config,
        profile,
        inputs,
    )
    return context


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


class ExternalAgentRunnerTests(unittest.TestCase):
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

            self.assertEqual(context.chat_id, context.run.id)
            self.assertEqual(context.inputs["chatId"], str(context.run.id))

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

            self.assertEqual(context.inputs.get("runType"), EXTERNAL_AGENT_RUN_TYPE)

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
            )

            mcp_config = payload_inputs.get("mcpConfig")
            self.assertIsInstance(mcp_config, str)
            if isinstance(mcp_config, str):
                self.assertTrue(Path(mcp_config).exists())

            settings_path = Path(tmpdir) / ".claude" / "settings.local.json"
            self.assertTrue(settings_path.exists())
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            self.assertIsInstance(permissions, dict)
                if isinstance(permissions, dict):
                    self.assertEqual(permissions.get("ask"), ["Bash(rm:*)"])

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
            )

            settings_path = Path(tmpdir) / ".claude" / "settings.local.json"
            self.assertTrue(settings_path.exists())
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            self.assertIsInstance(permissions, dict)
            if isinstance(permissions, dict):
                self.assertEqual(
                    permissions.get("allow"),
                    DEFAULT_CLAUDE_ALLOW_RULES,
                )

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

            self.assertEqual(context.inputs.get("threadId"), "thread-123")

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
            self.assertEqual(context.inputs.get("sessionId"), "session-456")

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

            self.assertEqual(context.inputs.get("sessionId"), "session-new")

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
                inputs={"chatId": "chat-4"},
            )
            self.assertTrue(is_new)
            self.assertEqual(context.run.id, ID("chat-4"))
            initial_started_at = context.run.startedAt
            context.run.status = AgentRunStatus.completed
            context.run.finishedAt = context.run.startedAt
            save_agent_run(dbe, context.run)

            followup, is_new_followup = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs={"chatId": "chat-4"},
            )
            self.assertFalse(is_new_followup)
            self.assertEqual(followup.run.id, context.run.id)
            self.assertEqual(followup.run.startedAt, initial_started_at)
            self.assertEqual(followup.run.status, AgentRunStatus.running)
            self.assertIsNone(followup.run.finishedAt)
            self.assertEqual(
                followup.inputs.get("projectConfigId"),
                str(project_config.id),
            )

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

            with self.assertRaises(KeyError):
                runner._build_context(
                    engine_config_id,
                    config,
                    profile=None,
                    inputs={
                        "chatId": "chat-5",
                        "projectConfigId": str(project_config_b.id),
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
            self.assertIsInstance(config_path, str)
            payload = json.loads(Path(str(config_path)).read_text(encoding="utf-8"))
            self.assertNotIn("permission", payload)

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
            self.assertEqual(len(snapshot), 1)
            entry = snapshot[0]
            self.assertEqual(entry.chatId, chat_id)
            self.assertEqual(
                entry.idsByType["section"],
                [ID("section-1"), ID("section-2")],
            )

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

            self.assertEqual(normalized[0].function.name, "setta__create_section")

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
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded.outputs.get("sessionId"), "session-999")
            self.assertEqual(loaded.outputs.get("threadId"), "thread-999")

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

            self.assertIsNotNone(run.outputs)
            messages = run.outputs.get("messages")
            self.assertIsInstance(messages, list)
            self.assertEqual(run.outputs.get("finalText"), "Hello")

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

            self.assertIsNotNone(run.outputs)
            metadata = run.outputs.get("metadata")
            self.assertIsInstance(metadata, dict)
            self.assertEqual(metadata.get("engineConfigId"), str(engine_config_id))
            self.assertEqual(metadata.get("chatId"), "chat-7")
            self.assertEqual(metadata.get("projectConfigId"), "config-7")
            self.assertEqual(metadata.get("externalAgentConfigId"), str(config.id))
            self.assertEqual(metadata.get("toolType"), config.toolType.value)
            self.assertEqual(metadata.get("runMode"), config.runMode.value)
            self.assertEqual(metadata.get("model"), "gpt-4o-mini")
            self.assertEqual(metadata.get("approvalPolicy"), "never")
            self.assertEqual(metadata.get("sandboxPolicy"), "restricted")
            self.assertEqual(metadata.get("settingsMode"), "managed_local")
            self.assertEqual(metadata.get("settingsAllowSettaEdits"), True)
            settings_paths = metadata.get("settingsPaths")
            self.assertIsInstance(settings_paths, dict)
            expected_codex_path = (
                dbe.path
                / "external_agent_settings"
                / "codex"
                / str(config.id)
                / "config.toml"
            )
            self.assertEqual(settings_paths.get("codex"), str(expected_codex_path))

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

            self.assertEqual(str(context.chat_id), "chat-1")
            self.assertEqual(str(context.section_id), "section-1")

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

            with self.assertRaises(TypeError):
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

            self.assertTrue(resolved.exists())
            self.assertEqual(resolved, working_dir)

    def test_env_whitelist_reads_dotenv(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            dbe.write_dot_env({"OPENAI_API_KEY": "secret"})
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                envVarWhitelist=["OPENAI_API_KEY"],
            )

            env = runner._build_env(config)

            self.assertEqual(env.get("OPENAI_API_KEY"), "secret")

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
            self.assertIsInstance(config_path, str)
            path = Path(str(config_path))
            self.assertTrue(path.exists())
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["mcpServers"]["setta"]["url"],
                f"{C.BACKEND}/mcp",
            )
            allowed_tools = context.inputs.get("allowedTools")
            self.assertIsInstance(allowed_tools, list)
            self.assertIn("mcp__setta__getProjectState", allowed_tools)
            self.assertIn("mcp__setta__runTool", allowed_tools)

            runner._cleanup_context(context)
            self.assertFalse(path.exists())

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
            self.assertIsInstance(config_path, str)
            path = Path(str(config_path))
            self.assertTrue(path.exists())
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["mcp"]["setta"]["url"],
                f"{C.BACKEND}/mcp",
            )
            expected_path = (
                dbe.path
                / "external_agent_settings"
                / "opencode"
                / "opencode-config"
                / "opencode.json"
            )
            self.assertEqual(path, expected_path)

            runner._cleanup_context(context)
            self.assertTrue(path.exists())

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
            self.assertIsInstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            self.assertTrue(config_path.exists())
            content = config_path.read_text(encoding="utf-8")
            self.assertIn("[mcp_servers.setta]", content)
            self.assertIn(f"url = \"{C.BACKEND}/mcp\"", content)
            expected_dir = (
                dbe.path / "external_agent_settings" / "codex" / "codex-config"
            )
            self.assertEqual(Path(str(codex_home)), expected_dir)

            runner._cleanup_context(context)
            self.assertTrue(config_path.exists())

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
            self.assertIsInstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            content = config_path.read_text(encoding="utf-8")
            self.assertIn('model = "gpt-5-codex"', content)
            self.assertIn('sandbox_mode = "workspace-write"', content)
            self.assertIn('approval_policy = "on-failure"', content)

            runner._cleanup_context(context)
            self.assertTrue(config_path.exists())

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
            self.assertIsInstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            content = config_path.read_text(encoding="utf-8")
            self.assertIn('enabled_tools = ["getProjectState", "runTool"]', content)

            runner._cleanup_context(context)
            self.assertTrue(config_path.exists())

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
            self.assertIsInstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            self.assertEqual(payload.get("permission"), "ask")

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
            self.assertIsInstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            permissions = payload.get("permission")
            self.assertIsInstance(permissions, dict)
            self.assertEqual(permissions.get("setta_*"), "deny")
            self.assertEqual(permissions.get("setta_getProjectState"), "allow")

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
            self.assertIsInstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            permissions = payload.get("permission")
            self.assertIsInstance(permissions, dict)
            self.assertEqual(permissions.get("run"), "ask")

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

            self.assertTrue(context.working_dir.exists())
            runner._cleanup_context(context)
            self.assertFalse(context.working_dir.exists())


class ExternalAgentRunnerApprovalTests(unittest.IsolatedAsyncioTestCase):
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

            self.assertIn("approval-1", runner._pending_approvals)
            event_types = [event.type for event in run.events]
            self.assertIn("approval_request", event_types)
            self.assertNotIn("stream_chunk", event_types)
            self.assertNotIn("external_event", event_types)
            messages = run.outputs.get("messages") if run.outputs else None
            self.assertIsInstance(messages, list)
            self.assertTrue(messages)
            tool_calls = messages[-1].get("tool_calls")
            self.assertIsInstance(tool_calls, list)
            self.assertEqual(tool_calls[0]["function"]["name"], "setta.approval")
            self.assertEqual(
                tool_calls[0]["function"]["arguments"].get("approvalId"),
                "approval-1",
            )

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
            self.assertIsNotNone(updated)
            event_types = [event.type for event in updated.events]
            self.assertIn("tool_result", event_types)
            self.assertIn("approval_response", event_types)
            self.assertNotIn("stream_chunk", event_types)
            self.assertNotIn("external_event", event_types)
            messages = updated.outputs.get("messages") if updated.outputs else None
            self.assertIsInstance(messages, list)
            tool_messages = [
                message for message in messages if message.get("role") == "tool"
            ]
            self.assertTrue(tool_messages)
            last_tool = tool_messages[-1]
            self.assertEqual(last_tool.get("tool_name"), "setta.approval")
            self.assertEqual(last_tool.get("result"), {"approved": True})
            self.assertNotIn("approval-1", runner._pending_approvals)


class ExternalAgentRunnerQuestionTests(unittest.IsolatedAsyncioTestCase):
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

            self.assertNotIn("question-1", runner._pending_questions)
            self.assertNotIn("question-1", runner._pending_approvals)
            self.assertEqual(
                runner._pending_question_approvals.get(run.id),
                ["question-1"],
            )
            event_types = [event.type for event in run.events]
            self.assertIn("approval_request", event_types)
            self.assertNotIn("stream_chunk", event_types)
            self.assertNotIn("external_event", event_types)
            messages = run.outputs.get("messages") if run.outputs else None
            self.assertIsNone(messages)

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

            self.assertIn("tool-1", runner._pending_questions)
            state = runner._pending_questions["tool-1"]
            self.assertEqual(state.run_id, run.id)
            self.assertEqual(state.chat_id, ID("chat-1"))
            self.assertEqual(state.section_id, ID("section-1"))
            self.assertIsNone(state.approval_id)

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
            self.assertEqual(state.approval_id, "approval-1")
            self.assertIsNone(runner._pending_question_approvals.get(run.id))


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
            self.assertEqual(state.approval_id, "approval-1")
            self.assertIsNone(runner._pending_question_approvals.get(run.id))

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
            self.assertIsNotNone(updated)
            event_types = [event.type for event in updated.events]
            self.assertIn("tool_result", event_types)
            self.assertIn("question_response", event_types)
            self.assertNotIn("stream_chunk", event_types)
            self.assertNotIn("external_event", event_types)
            messages = updated.outputs.get("messages") if updated.outputs else None
            self.assertIsInstance(messages, list)
            tool_messages = [
                message for message in messages if message.get("role") == "tool"
            ]
            self.assertTrue(tool_messages)
            last_tool = tool_messages[-1]
            self.assertEqual(last_tool.get("result"), {"answers": answers})
            self.assertNotIn("question-1", runner._pending_questions)

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
            self.assertIsNotNone(updated)
            messages = updated.outputs.get("messages") if updated.outputs else None
            self.assertIsInstance(messages, list)
            tool_messages = [
                message for message in messages if message.get("role") == "tool"
            ]
            self.assertTrue(tool_messages)
            last_tool = tool_messages[-1]
            self.assertEqual(last_tool.get("result"), {"answers": answers})
            content = last_tool.get("content")
            self.assertIsInstance(content, list)
            text_blocks = [
                block.get("text")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            self.assertEqual(
                text_blocks,
                ["Language: Python\nFramework: FastAPI"],
            )

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

            output_path = Path(tmpdir) / "tool_response.jsonl"
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                "import sys; from pathlib import Path; Path(sys.argv[1]).write_text(sys.stdin.read())",
                str(output_path),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            adapter = ClaudeSdkAdapter()
            handle = ExternalAgentRunHandle(run_id=run.id, process=process)
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

            try:
                await runner.respond_to_question("question-1", answers)
            finally:
                process.terminate()
                await process.wait()

            payload_lines = output_path.read_text().strip().splitlines()
            self.assertTrue(payload_lines)
            payload = json.loads(payload_lines[-1])
            self.assertEqual(payload.get("type"), "tool_response")
            self.assertEqual(payload.get("toolCallId"), "approval-1")


class ExternalAgentRunnerClaudeCaptureTests(unittest.IsolatedAsyncioTestCase):
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
            self.assertIsNotNone(updated)
            if updated is None:
                return
            outputs = updated.outputs
            self.assertIsInstance(outputs, dict)
            self.assertEqual(outputs.get("finalText"), "Hello world")
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            content = assistant.get("content")
            self.assertIsInstance(content, list)
            text_blocks = [
                block.get("text")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            self.assertEqual(text_blocks, ["Hello world"])

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
            self.assertIsNotNone(updated)
            if updated is None:
                return
            outputs = updated.outputs
            self.assertIsInstance(outputs, dict)
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            content = assistant.get("content")
            self.assertIsInstance(content, list)
            thinking_blocks = [
                block
                for block in content
                if isinstance(block, dict) and block.get("type") == "thinking"
            ]
            self.assertEqual(len(thinking_blocks), 1)
            block = thinking_blocks[0]
            self.assertEqual(block.get("thinking"), "Plan next")
            self.assertEqual(block.get("summary"), "Next summary")
            self.assertEqual(block.get("signature"), "sig-2")

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
            self.assertIsNotNone(updated)
            if updated is None:
                return
            outputs = updated.outputs
            self.assertIsInstance(outputs, dict)
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            tool_calls = assistant.get("tool_calls")
            self.assertIsInstance(tool_calls, list)
            self.assertEqual(len(tool_calls), 1)
            self.assertEqual(tool_calls[0].get("id"), "toolu-1")


class ExternalAgentRunnerMcpAuthTests(unittest.TestCase):
    def _set_env(self, key: str, value: str | None) -> None:
        previous = os.environ.get(key)

        def _restore() -> None:
            if previous is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = previous

        self.addCleanup(_restore)
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

    def _set_session_env(self, session_id: str, sessions_root: Path) -> None:
        self._set_env(SESSION_ID_ENV_VAR, session_id)
        self._set_env(SESSIONS_ROOT_ENV_VAR, str(sessions_root))

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
            self._set_session_env(session_id, sessions_root)
            runner = _build_runner(_build_dbe(tmpdir))
            config_path = runner._write_claude_mcp_config(f"{C.BACKEND}/mcp")
            payload = json.loads(config_path.read_text(encoding="utf-8"))
            server = payload.get("mcpServers", {}).get(SETTA_MCP_SERVER_ID)
            self.assertIsInstance(server, dict)
            headers = server.get("headers") if isinstance(server, dict) else None
            self.assertIsInstance(headers, dict)
            if isinstance(headers, dict):
                cookie = headers.get("Cookie")
            else:
                cookie = None
            self.assertIsInstance(cookie, str)
            if isinstance(cookie, str):
                self.assertIn(f"{C.AUTH_COOKIE_NAME}=", cookie)

    def test_opencode_config_includes_auth_cookie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            session_id, sessions_root = self._create_session(root)
            self._set_session_env(session_id, sessions_root)
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
            self.assertIsInstance(server, dict)
            headers = server.get("headers") if isinstance(server, dict) else None
            self.assertIsInstance(headers, dict)
            if isinstance(headers, dict):
                cookie = headers.get("Cookie")
            else:
                cookie = None
            self.assertIsInstance(cookie, str)
            if isinstance(cookie, str):
                self.assertIn(f"{C.AUTH_COOKIE_NAME}=", cookie)

    def test_codex_config_includes_auth_cookie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            session_id, sessions_root = self._create_session(root)
            self._set_session_env(session_id, sessions_root)
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
            content = (codex_home / "config.toml").read_text(encoding="utf-8")
            self.assertIn(C.AUTH_COOKIE_NAME, content)
            function = tool_calls[0].get("function")
            self.assertIsInstance(function, dict)
            self.assertEqual(function.get("name"), "Bash")
            self.assertEqual(function.get("arguments"), {"command": "ls"})
            tool_message = next(
                message
                for message in messages
                if isinstance(message, dict)
                and message.get("role") == "tool"
                and message.get("tool_call_id") == "toolu-1"
            )
            self.assertEqual(tool_message.get("tool_name"), "Bash")
            self.assertEqual(tool_message.get("result"), "ok")

    async def test_assistant_payload_persists_tool_calls(self) -> None:
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
            self.assertIsNotNone(updated)
            if updated is None:
                return
            outputs = updated.outputs
            self.assertIsInstance(outputs, dict)
            self.assertEqual(outputs.get("finalText"), "Hi")
            messages = outputs.get("messages")
            self.assertIsInstance(messages, list)
            assistant = next(
                message
                for message in messages
                if isinstance(message, dict) and message.get("role") == "assistant"
            )
            tool_calls = assistant.get("tool_calls")
            self.assertIsInstance(tool_calls, list)
            self.assertEqual(len(tool_calls), 1)
            self.assertEqual(tool_calls[0].get("id"), "toolu-2")
            function = tool_calls[0].get("function")
            self.assertIsInstance(function, dict)
            self.assertEqual(function.get("name"), "Read")
            self.assertEqual(function.get("arguments"), {"path": "README.md"})
