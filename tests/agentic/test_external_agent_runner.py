import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.base import ExternalAgentRunHandle
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE
from setta.agentic.store import create_agent_run, load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, RunEvent
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
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
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


class ExternalAgentRunnerTests(unittest.TestCase):
    def test_context_defaults_chat_id_to_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs=None,
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
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs=None,
            )

            self.assertEqual(context.inputs.get("runType"), EXTERNAL_AGENT_RUN_TYPE)

    def test_context_inherits_thread_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = _write_project_state(dbe)
            runner = _build_runner(dbe)
            engine_config_id = ID("engine-1")
            config = ExternalAgentConfig(
                id="config-1",
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )
            previous = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-1",
                    "projectConfigId": str(project_config.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
            )
            previous.outputs = {"threadId": "thread-123"}
            save_agent_run(dbe, previous)

            context = runner._build_context(
                engine_config_id,
                config,
                profile=None,
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
            )
            previous.outputs = {"sessionId": "session-456"}
            save_agent_run(dbe, previous)

            context = runner._build_context(
                engine_config_id,
                config,
                profile=None,
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
            )
            previous.outputs = {"sessionId": "session-old"}
            save_agent_run(dbe, previous)

            context = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs={"chatId": "chat-3", "sessionId": "session-new"},
            )

            self.assertEqual(context.inputs.get("sessionId"), "session-new")

    def test_context_inherits_session_id_per_project_config(self) -> None:
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
            engine_config_id = ID("engine-4")
            config = ExternalAgentConfig(
                id="config-4",
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )
            run_a = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-4",
                    "projectConfigId": str(project_config_a.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
            )
            run_a.outputs = {"sessionId": "session-old"}
            save_agent_run(dbe, run_a)
            run_b = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-4",
                    "projectConfigId": str(project_config_b.id),
                    "engineConfigId": str(engine_config_id),
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
            )
            run_b.outputs = {"sessionId": "session-new"}
            save_agent_run(dbe, run_b)

            context = runner._build_context(
                engine_config_id,
                config,
                profile=None,
                inputs={
                    "chatId": "chat-4",
                    "projectConfigId": str(project_config_b.id),
                },
            )

            self.assertEqual(context.inputs.get("sessionId"), "session-new")

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
            run = create_agent_run(profile_id=None, inputs={"chatId": "chat-4"})
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
            run = create_agent_run(
                profile_id=None,
                inputs={
                    "chatId": "chat-5",
                    "projectConfigId": "config-5",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
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
            for chunk in stream_chunks:
                run.events.append(
                    RunEvent(
                        type="stream_chunk",
                        payload={"chunk": chunk.model_dump(mode="json")},
                    )
                )

            runner._set_run_outputs_from_events(run)

            self.assertIsNotNone(run.outputs)
            messages = run.outputs.get("messages")
            self.assertIsInstance(messages, list)
            self.assertEqual(run.outputs.get("finalText"), "Hello")

    def test_context_accepts_explicit_ids(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )
            profile = AgentProfile(name="Agent")

            context = runner._build_context(
                config,
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
            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )

            with self.assertRaises(TypeError):
                runner._build_context(
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
                runMode=ExternalAgentRunMode.sdk,
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
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
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

            context = runner._build_context(config, profile=profile, inputs=None)

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
                name="OpenCode SDK",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = runner._build_context(config, profile=None, inputs=None)

            config_path = context.env.get("OPENCODE_CONFIG")
            self.assertIsInstance(config_path, str)
            path = Path(str(config_path))
            self.assertTrue(path.exists())
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["mcp"]["setta"]["url"],
                f"{C.BACKEND}/mcp",
            )

            runner._cleanup_context(context)
            self.assertFalse(path.exists())

    def test_codex_home_config_is_written(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = runner._build_context(config, profile=None, inputs=None)

            codex_home = context.env.get("CODEX_HOME")
            self.assertIsInstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            self.assertTrue(config_path.exists())
            content = config_path.read_text(encoding="utf-8")
            self.assertIn("[mcp_servers.setta]", content)
            self.assertIn(f"url = \"{C.BACKEND}/mcp\"", content)

            runner._cleanup_context(context)
            self.assertFalse(config_path.exists())

    def test_codex_config_writes_policy_fields(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
                defaultModel="gpt-5-codex",
                sandboxPolicy="workspace-write",
                approvalPolicy="on-failure",
            )

            context = runner._build_context(config, profile=None, inputs=None)

            codex_home = context.env.get("CODEX_HOME")
            self.assertIsInstance(codex_home, str)
            config_path = Path(str(codex_home)) / "config.toml"
            content = config_path.read_text(encoding="utf-8")
            self.assertIn('model = "gpt-5-codex"', content)
            self.assertIn('sandbox_mode = "workspace-write"', content)
            self.assertIn('approval_policy = "on-failure"', content)

            runner._cleanup_context(context)
            self.assertFalse(config_path.exists())

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
            )

            context = runner._build_context(config, profile=None, inputs=None)

            config_path = context.env.get("OPENCODE_CONFIG")
            self.assertIsInstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            self.assertEqual(payload.get("permissions"), "ask")

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
            )

            context = runner._build_context(config, profile=None, inputs=None)

            config_path = context.env.get("OPENCODE_CONFIG")
            self.assertIsInstance(config_path, str)
            config_text = Path(str(config_path)).read_text(encoding="utf-8")
            payload = json.loads(config_text)
            permissions = payload.get("permissions")
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
                runMode=ExternalAgentRunMode.sdk,
                workingDirStrategy=ExternalAgentWorkingDirStrategy.temp_dir,
            )

            context = runner._build_context(config, profile=None, inputs=None)

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
            context = runner._build_context(config, profile=None, inputs=None)
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
            stream_events = [
                event for event in run.events if event.type == "stream_chunk"
            ]
            self.assertTrue(stream_events)
            chunk = stream_events[-1].payload.get("chunk")
            self.assertIsInstance(chunk, dict)
            self.assertEqual(chunk.get("type"), "message_start")
            message = chunk.get("message")
            self.assertIsInstance(message, dict)
            tool_calls = message.get("tool_calls")
            self.assertIsInstance(tool_calls, list)
            self.assertEqual(tool_calls[0]["function"]["name"], "setta.approval")
            self.assertEqual(
                tool_calls[0]["function"]["arguments"].get("approvalId"),
                "approval-1",
            )
