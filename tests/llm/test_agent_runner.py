from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.agentic.completion_guard import (
    FAILED_CHECKS_MESSAGE,
    MISSING_CHECKS_MESSAGE,
)
from setta.agentic.store import load_agent_run, save_agent_run, save_engine_configs
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.chat_toolkit.managed.actions import EmitChunkAction
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.client import MultiMCPClient
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.agentic.agentic_scope import AgenticScope
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
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
from setta.types.chat_stream_events import MessageStartEvent
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
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


def _completion_report_tool_message(
    *,
    completion_intent: bool,
    requires_verification: bool,
    check_results: list[dict[str, object]] | None = None,
) -> ToolChatMessage:
    return ToolChatMessage(
        tool_call_id="tool-report",
        tool_name="setta__report_completion_status",
        result={
            "structuredContent": {
                "completionIntent": completion_intent,
                "requiresVerification": requires_verification,
                "checkResults": list(check_results or []),
            }
        },
    )


class _StubAgentRunner(AgentRunner):
    async def _run_agent(self, context) -> None:
        if context.emit_stream or context.emit_ai_follow:
            raise AssertionError("Expected sub-agent run to disable streaming")
        context.run.status = AgentRunStatus.completed
        context.run.finishedAt = get_now_timestamp()
        context.run.outputs = {"messages": []}
        save_agent_run(self.dbe, context.run)
        self._record_event(context.run, "run_completed", {})


class TestAgentRunner:
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

            assert allowlist is not None
            assert allowlist.tool_names == {"server-a__tool.alpha"}
            assert allowlist.tool_basenames == {
                "report_completion_status",
                "tool.beta",
            }
            assert allowlist.server_ids == {"server-a", "server-b"}

    def test_scope_filter_keeps_required_completion_report_tool(self) -> None:
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
                        mcpServerIds=[SETTA_MCP_SERVER_ID],
                    )
                },
                mcpServers={
                    SETTA_MCP_SERVER_ID: MCPServerConfig(
                        transport="sse",
                        url="http://localhost:8000/mcp",
                    )
                },
            )
            runner = _build_runner(dbe, config)
            completion_tool_name = f"{SETTA_MCP_SERVER_ID}__report_completion_status"
            runner.mcp_client.tool_annotations_by_name[completion_tool_name] = (
                SettaToolAnnotations(
                    settaToolType=SettaToolType.discoverable,
                    accessType="structural",
                )
            )

            filtered = runner._filter_tool_names_by_scope(
                [completion_tool_name],
                AgenticScope(),
            )

            assert filtered == [completion_tool_name]

    def test_completion_guard_allows_missing_report_when_enabled(self) -> None:
        prior_messages = [
            UserChatMessage(content=[MessageTextContent(text="Implement task A.")])
        ]
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(text="Task A is done.")]
        )

        AgentRunner._apply_completion_guard(
            prior_messages,
            assistant_message,
            completion_guard_enabled=True,
        )

        assert assistant_message.content[0].text == "Task A is done."

    def test_completion_guard_allows_when_disabled(self) -> None:
        prior_messages = [
            UserChatMessage(content=[MessageTextContent(text="Implement task A.")])
        ]
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(text="Task A is done.")]
        )

        AgentRunner._apply_completion_guard(
            prior_messages,
            assistant_message,
            completion_guard_enabled=False,
        )

        assert assistant_message.content[0].text == "Task A is done."

    def test_completion_guard_blocks_failed_required_checks(self) -> None:
        prior_messages = [
            UserChatMessage(content=[MessageTextContent(text="Implement task A.")]),
            _completion_report_tool_message(
                completion_intent=True,
                requires_verification=True,
                check_results=[
                    {
                        "checkName": "pytest",
                        "required": True,
                        "status": "failed",
                    }
                ],
            ),
        ]
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(text="Task A is done.")]
        )

        AgentRunner._apply_completion_guard(
            prior_messages,
            assistant_message,
            completion_guard_enabled=True,
        )

        assert assistant_message.content[0].text == FAILED_CHECKS_MESSAGE

    def test_completion_guard_allows_when_required_checks_pass(self) -> None:
        prior_messages = [
            UserChatMessage(content=[MessageTextContent(text="Implement task A.")]),
            _completion_report_tool_message(
                completion_intent=True,
                requires_verification=True,
                check_results=[
                    {
                        "checkName": "pytest",
                        "required": True,
                        "status": "passed",
                    },
                    {
                        "checkName": "ruff",
                        "required": True,
                        "status": "passed",
                    },
                ],
            ),
        ]
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(text="Task A is done.")]
        )

        AgentRunner._apply_completion_guard(
            prior_messages,
            assistant_message,
            completion_guard_enabled=True,
        )

        assert assistant_message.content[0].text == "Task A is done."

    def test_completion_guard_allows_non_completion_intent_reports(self) -> None:
        prior_messages = [
            UserChatMessage(content=[MessageTextContent(text="Investigate bug B.")]),
            _completion_report_tool_message(
                completion_intent=False,
                requires_verification=False,
            ),
        ]
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(text="I need one clarification.")]
        )

        AgentRunner._apply_completion_guard(
            prior_messages,
            assistant_message,
            completion_guard_enabled=True,
        )

        assert assistant_message.content[0].text == "I need one clarification."

    def test_completion_guard_ignores_report_from_previous_task_scope(self) -> None:
        prior_messages = [
            UserChatMessage(content=[MessageTextContent(text="Implement task A.")]),
            _completion_report_tool_message(
                completion_intent=True,
                requires_verification=True,
                check_results=[
                    {
                        "checkName": "pytest",
                        "required": True,
                        "status": "passed",
                    }
                ],
            ),
            UserChatMessage(content=[MessageTextContent(text="Implement task B.")]),
        ]
        assistant_message = AssistantChatMessage(
            content=[MessageTextContent(text="Task B is done.")]
        )

        AgentRunner._apply_completion_guard(
            prior_messages,
            assistant_message,
            completion_guard_enabled=True,
        )

        assert assistant_message.content[0].text == "Task B is done."

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

            with pytest.raises(KeyError):
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

            default_context = runner._build_context(
                profile, inputs={"allowUnscoped": True}
            )
            assert default_context.project_config_id == default_id
            assert default_context.chat_id == default_context.run.id
            assert default_context.section_id is None
            assert default_context.thinking is False

            settings = SettingsState()
            project_state = ProjectStateSingleConfig(projectConfig=second_config)
            chat_section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.Chat,
                Position(),
            )
            backend_state = ProjectStateBackend(
                projectConfigs={second_config.id: project_state.projectConfig},
                defaultProjectConfigId=second_config.id,
                sections=project_state.sections,
                sectionImpls=project_state.sectionImpls,
                sectionVariants=project_state.sectionVariants,
                codeObjs=project_state.codeObjs,
                codeObjImpls=project_state.codeObjImpls,
                codeObjVariants=project_state.codeObjVariants,
            )
            dbe.write_project(backend_state)

            override_context = runner._build_context(
                profile,
                inputs={
                    "projectConfigId": str(second_config.id),
                    "chatId": "chat-1",
                    "sectionId": str(chat_section_id),
                    "thinking": True,
                },
            )
            assert override_context.project_config_id == second_config.id
            assert override_context.chat_id == ID("chat-1")
            assert override_context.section_id == chat_section_id
            assert override_context.thinking is True

    def test_context_caches_completion_guard_toggle_for_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            _write_project_state(dbe, [ProjectConfig()])
            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": False,
                    }
                },
            )
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

            context = runner._build_context(
                profile,
                inputs={"allowUnscoped": True},
            )

            dbe.write_json(
                dbe.settings,
                {
                    "backend": {
                        "completionGuardEnabled": True,
                    }
                },
            )

            assert context.completion_guard_enabled is False

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

            with pytest.raises(TypeError):
                runner._build_context(
                    profile,
                    inputs={"projectConfigId": 123, "allowUnscoped": True},
                )
            with pytest.raises(TypeError):
                runner._build_context(
                    profile,
                    inputs={"chatId": 123, "allowUnscoped": True},
                )
            with pytest.raises(TypeError):
                runner._build_context(profile, inputs={"sectionId": 123})
            with pytest.raises(TypeError):
                runner._build_context(
                    profile,
                    inputs={"thinking": "yes", "allowUnscoped": True},
                )

    def test_context_rejects_mismatched_engine_config_id(self) -> None:
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

            with pytest.raises(KeyError):
                runner._build_context(
                    profile,
                    inputs={"engineConfigId": "engine-mismatch", "allowUnscoped": True},
                )

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

            assert "## Active project config" in prompt
            assert f"- id: {temporary_id}" in prompt
            assert "## Agent profile" in prompt
            assert f"- name: {profile.name}" in prompt
            assert f"- description: {profile.description}" in prompt
            assert profile.systemPrompt in prompt

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

            assert outputs["finalText"] == "final response"
            assert len(outputs["messages"]) == len(messages)
            assert outputs["messages"][-1]["role"] == "assistant"

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

            assert outputs.get("metadata") == metadata
            assert outputs.get("usage") == usage
            assert outputs.get("cost") == 0.0123

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

            context = runner._build_context(
                profile,
                inputs={"prompt": "hello", "allowUnscoped": True},
            )
            run = context.run
            runner._record_event(
                run,
                "run_started",
                {"profileId": str(profile.id)},
            )
            runner._record_snapshot(run, context.project_config_id)

            loaded = load_agent_run(dbe, run.id)
            assert loaded is not None

            assert len(loaded.events) >= 2
            assert loaded.events[0].type == "run_started"
            assert loaded.events[1].type == "snapshot"
            snapshot_payload = loaded.events[1].payload
            assert "projectConfigId" in snapshot_payload
            assert "projectState" in snapshot_payload
            assert "temporaryIdMap" in snapshot_payload


class TestAgentRunnerSubAgent:
    @pytest.mark.asyncio
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

            run = await runner.run_sub_agent(
                profile,
                inputs={"prompt": "hello", "allowUnscoped": True},
            )

            assert run.status == AgentRunStatus.completed
            loaded = load_agent_run(dbe, run.id)
            assert loaded is not None
            event_types = [event.type for event in loaded.events]
            assert "run_started" in event_types
            assert "snapshot" in event_types
            assert "run_completed" in event_types


class TestAgentRunnerStopRun:
    @pytest.mark.asyncio
    async def test_stop_run_does_not_override_completed(self) -> None:
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
            now = get_now_timestamp()
            run = AgentRun(
                status=AgentRunStatus.completed,
                startedAt=now,
                finishedAt=now,
                inputs={"runType": "llm_chat"},
            )
            save_agent_run(dbe, run)

            stopped = await runner.stop_run(run.id)

            assert stopped.status == AgentRunStatus.completed
            loaded = load_agent_run(dbe, run.id)
            assert loaded is not None
            assert loaded.status == AgentRunStatus.completed
            event_types = [event.type for event in loaded.events]
            assert "run_cancelled" not in event_types


class TestAgentRunnerStreamEvent:
    @pytest.mark.asyncio
    async def test_stream_chunks_are_not_persisted(self) -> None:
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
            context = runner._build_context(
                profile,
                inputs={"allowUnscoped": True},
                emit_stream=False,
            )
            assistant_message = AssistantChatMessage(content=[])

            await runner._apply_actions(
                [
                    EmitChunkAction(
                        context.chat_id,
                        MessageStartEvent(message=assistant_message),
                    )
                ],
                context,
            )

            assert context.run.events == []
