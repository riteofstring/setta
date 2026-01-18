import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.base import ExternalAgentRunHandle
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE
from setta.agentic.store import create_agent_run, load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
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
            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
            )

            context = runner._build_context(config, profile=None, inputs=None)

            self.assertEqual(context.chat_id, context.run.id)
            self.assertEqual(context.inputs["chatId"], str(context.run.id))

    def test_context_sets_run_type(self) -> None:
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

            self.assertEqual(context.inputs.get("runType"), EXTERNAL_AGENT_RUN_TYPE)

    def test_context_inherits_thread_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
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
                    "externalAgentConfigId": "config-1",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
            )
            previous.outputs = {"threadId": "thread-123"}
            save_agent_run(dbe, previous)

            context = runner._build_context(
                config,
                profile=None,
                inputs={"chatId": "chat-1"},
            )

            self.assertEqual(context.inputs.get("threadId"), "thread-123")

    def test_context_inherits_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
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
                    "externalAgentConfigId": "config-2",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
            )
            previous.outputs = {"sessionId": "session-456"}
            save_agent_run(dbe, previous)

            context = runner._build_context(
                config,
                profile=None,
                inputs={"chatId": "chat-2"},
            )

            self.assertEqual(context.inputs.get("sessionId"), "session-456")

    def test_context_respects_explicit_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe)
            runner = _build_runner(dbe)
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
                    "externalAgentConfigId": "config-3",
                    "runType": EXTERNAL_AGENT_RUN_TYPE,
                },
            )
            previous.outputs = {"sessionId": "session-old"}
            save_agent_run(dbe, previous)

            context = runner._build_context(
                config,
                profile=None,
                inputs={"chatId": "chat-3", "sessionId": "session-new"},
            )

            self.assertEqual(context.inputs.get("sessionId"), "session-new")

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
