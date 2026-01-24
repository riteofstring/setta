import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.store import load_agent_run, save_agent_run, save_engine_configs
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.agentic import (
    AgentProfile,
    AgentRunStatus,
    EngineConfig,
    EngineType,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def _build_runner(dbe: DBE, config: AllLLMConfigs) -> AgentRunner:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    mcp_client = MultiMCPClient(config.mcpServers, disabled=True)
    runner = AgentRunner(dbe, mcp_client, frontend_sender)
    runner.update_config(config)
    runner.update_api_keys(dbe.read_dot_env())
    return runner


def _write_project_state(dbe: DBE, project_configs: list[ProjectConfig]) -> ID:
    if not project_configs:
        raise ValueError("project_configs must include at least one entry")
    default_id = project_configs[0].id
    project_state = ProjectStateBackend(
        projectConfigs={config.id: config for config in project_configs},
        defaultProjectConfigId=default_id,
    )
    dbe.write_project(project_state)
    return default_id


def _seed_engine_config(dbe: DBE, engine_config_id: ID, llm_config_id: str) -> None:
    engine_config = EngineConfig(
        id=engine_config_id,
        name="Default Engine",
        engineType=EngineType.setta_llm,
        settaLlmConfigId=llm_config_id,
    )
    save_engine_configs(dbe, [engine_config])


class _StubAgentRunner(AgentRunner):
    async def _run_agent(self, context) -> None:
        if context.emit_stream or context.emit_ai_follow:
            raise AssertionError("Expected sub-agent run to disable streaming")
        context.run.status = AgentRunStatus.completed
        context.run.finishedAt = get_now_timestamp()
        context.run.outputs = {"messages": []}
        save_agent_run(self.dbe, context.run)
        self._record_event(context.run, "run_completed", {})


class AgentRunnerTests(unittest.TestCase):
    def test_allowlist_parses_names_and_servers(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=["server-a", "server-b"],
                    )
                },
                mcpServers={
                    "server-a": MCPServerConfig(
                        transport="sse",
                        url="http://localhost:8000/mcp",
                    ),
                    "server-b": MCPServerConfig(
                        transport="sse",
                        url="http://localhost:8001/mcp",
                    ),
                },
            )
            runner = _build_runner(dbe, config)
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(
                name="Alpha",
                engineConfigId=engine_config_id,
                toolAllowlist=["server-a__tool.alpha", "server-b", "tool.beta"],
            )

            allowlist = runner._normalize_tool_allowlist(profile)

            self.assertIsNotNone(allowlist)
            if allowlist is None:
                raise AssertionError("Expected allowlist to be returned")
            self.assertEqual(allowlist.tool_names, {"server-a__tool.alpha"})
            self.assertEqual(allowlist.tool_basenames, {"tool.beta"})
            self.assertEqual(allowlist.server_ids, {"server-a", "server-b"})

    def test_allowlist_rejects_unknown_server(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=["server-a"],
                    )
                },
                mcpServers={
                    "server-a": MCPServerConfig(
                        transport="sse",
                        url="http://localhost:8000/mcp",
                    )
                },
            )
            runner = _build_runner(dbe, config)
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(
                name="Alpha",
                engineConfigId=engine_config_id,
                toolAllowlist=["unknown__tool.alpha"],
            )

            with self.assertRaises(KeyError):
                runner._normalize_tool_allowlist(profile)

    def test_context_selects_default_and_overrides(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            first_config = ProjectConfig()
            second_config = ProjectConfig()
            default_id = _write_project_state(dbe, [first_config, second_config])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            runner = _build_runner(dbe, config)
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(name="Alpha", engineConfigId=engine_config_id)

            default_context = runner._build_context(profile, inputs=None)
            self.assertEqual(default_context.project_config_id, default_id)
            self.assertEqual(default_context.chat_id, default_context.run.id)
            self.assertIsNone(default_context.section_id)
            self.assertFalse(default_context.deep_think)

            override_context = runner._build_context(
                profile,
                inputs={
                    "projectConfigId": str(second_config.id),
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "deepThink": True,
                },
            )
            self.assertEqual(override_context.project_config_id, second_config.id)
            self.assertEqual(override_context.chat_id, ID("chat-1"))
            self.assertEqual(override_context.section_id, ID("section-1"))
            self.assertTrue(override_context.deep_think)

    def test_context_validates_input_types(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            runner = _build_runner(dbe, config)
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(name="Alpha", engineConfigId=engine_config_id)

            with self.assertRaises(TypeError):
                runner._build_context(profile, inputs={"projectConfigId": 123})
            with self.assertRaises(TypeError):
                runner._build_context(profile, inputs={"chatId": 123})
            with self.assertRaises(TypeError):
                runner._build_context(profile, inputs={"sectionId": 123})
            with self.assertRaises(TypeError):
                runner._build_context(profile, inputs={"deepThink": "yes"})

    def test_system_prompt_includes_profile_and_project(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            _write_project_state(dbe, [project_config])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            runner = _build_runner(dbe, config)
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(
                name="Alpha",
                description="Primary profile",
                systemPrompt="You are alpha.",
                engineConfigId=engine_config_id,
            )

            prompt = runner._build_system_prompt(profile, project_config.id)
            _, canonical_to_temporary = dbe.read_temporary_id_map()
            temporary_id = canonical_to_temporary[project_config.id]

            self.assertIn("## Active project config", prompt)
            self.assertIn(f"- id: {temporary_id}", prompt)
            self.assertIn("## Agent profile", prompt)
            self.assertIn(f"- name: {profile.name}", prompt)
            self.assertIn(f"- description: {profile.description}", prompt)
            self.assertIn(profile.systemPrompt, prompt)

    def test_build_outputs_returns_final_text(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            runner = _build_runner(dbe, config)
            messages = [
                UserChatMessage(
                    content=[MessageTextContent(text="hello")],
                ),
                AssistantChatMessage(
                    content=[MessageTextContent(text="first response")],
                ),
                ToolChatMessage(
                    tool_call_id="tool-1",
                    tool_name="tool.alpha",
                ),
                AssistantChatMessage(
                    content=[MessageTextContent(text="final response")],
                ),
            ]

            outputs = runner._build_outputs(messages)

            self.assertEqual(outputs["finalText"], "final response")
            self.assertEqual(len(outputs["messages"]), len(messages))
            self.assertEqual(outputs["messages"][-1]["role"], "assistant")

    def test_build_outputs_includes_metadata_usage_and_cost(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            runner = _build_runner(dbe, config)
            messages = [
                UserChatMessage(
                    content=[MessageTextContent(text="hello")],
                )
            ]
            metadata = {"model": "gpt-4o-mini", "engineConfigId": "engine-123"}
            usage = {"promptTokens": 2, "completionTokens": 3, "totalTokens": 5}

            outputs = runner._build_outputs(
                messages,
                metadata=metadata,
                usage=usage,
                cost=0.0123,
            )

            self.assertEqual(outputs.get("metadata"), metadata)
            self.assertEqual(outputs.get("usage"), usage)
            self.assertEqual(outputs.get("cost"), 0.0123)

    def test_run_event_persistence_records_start_and_snapshot(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            _write_project_state(dbe, [project_config])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            runner = _build_runner(dbe, config)
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(name="Alpha", engineConfigId=engine_config_id)

            context = runner._build_context(profile, inputs={"prompt": "hello"})
            run = context.run
            runner._record_event(
                run,
                "run_started",
                {"profileId": str(profile.id)},
            )
            runner._record_snapshot(run, context.project_config_id)

            loaded = load_agent_run(dbe, run.id)
            if loaded is None:
                raise AssertionError("Expected agent run to be persisted")

            self.assertGreaterEqual(len(loaded.events), 2)
            self.assertEqual(loaded.events[0].type, "run_started")
            self.assertEqual(loaded.events[1].type, "snapshot")
            snapshot_payload = loaded.events[1].payload
            self.assertIn("projectConfigId", snapshot_payload)
            self.assertIn("projectState", snapshot_payload)
            self.assertIn("temporaryIdMap", snapshot_payload)


class AgentRunnerSubAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_sub_agent_records_events_and_completes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            mcp_client = MultiMCPClient(config.mcpServers, disabled=True)
            runner = _StubAgentRunner(dbe, mcp_client, frontend_sender)
            runner.update_config(config)
            runner.update_api_keys(dbe.read_dot_env())
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            profile = AgentProfile(name="Alpha", engineConfigId=engine_config_id)

            run = await runner.run_sub_agent(profile, inputs={"prompt": "hello"})

            self.assertEqual(run.status, AgentRunStatus.completed)
            loaded = load_agent_run(dbe, run.id)
            if loaded is None:
                raise AssertionError("Expected agent run to be persisted")
            event_types = [event.type for event in loaded.events]
            self.assertIn("run_started", event_types)
            self.assertIn("snapshot", event_types)
            self.assertIn("run_completed", event_types)


if __name__ == "__main__":
    unittest.main()
