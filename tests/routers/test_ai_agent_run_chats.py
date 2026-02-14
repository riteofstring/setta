from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
import pytest

from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE, LLM_CHAT_RUN_TYPE
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.store import (
    load_agent_run,
    save_agent_run,
    save_engine_configs,
    save_external_agent_configs,
)
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.capabilities_config import (
    set_project_chat_capability_policy,
    set_skill_sources,
)
from setta.mcp.client import MultiMCPClient
from setta.routers.ai import (
    GetExternalAgentChatRequest,
    GetLLMResponseRequest,
    GetLLMChatRequest,
    StopLLMChatRequest,
    _build_branch_messages,
    _ensure_external_chat_id_compatible,
    _get_prior_messages_for_engine,
    route_get_external_agent_chat,
    route_get_llm_chat,
    route_get_llm_response,
    route_stop_llm_chat,
)
from setta.server_state import SettaFastAPIState
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineConfig,
    EngineType,
    RunEvent,
)
from setta.types.capabilities import CapabilityMode, CapabilityPolicy, SkillSource
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, SharePolicy, DeploymentType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.runtime_context import runtime_context


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def _write_skill_doc(skill_dir: Path, *, name: str, body: str) -> None:
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(
        (
            "---\n"
            f"name: {name}\n"
            "description: Test skill\n"
            "metadata:\n"
            "  version: 1.0.0\n"
            "---\n"
            f"{body}\n"
        ),
        encoding="utf-8",
    )


def _build_runner(dbe: DBE) -> AgentRunner:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    runner = AgentRunner(dbe, MultiMCPClient({}, disabled=True), frontend_sender)
    runner.update_config(
        AllLLMConfigs(
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
    )
    return runner


def _seed_engine_config(dbe: DBE, engine_config_id: ID, llm_config_id: str) -> None:
    engine_config = EngineConfig(
        id=engine_config_id,
        name="Default Engine",
        engineType=EngineType.setta_llm,
        settaLlmConfigId=llm_config_id,
    )
    save_engine_configs(dbe, [engine_config])


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, *, allow_llm: bool) -> None:
    dbe = DBE(root)
    policy = SharePolicy(allowLLM=allow_llm)
    dbe.write_json(root / "policy.json", policy.model_dump())


def _build_run(
    *,
    chat_id: ID,
    project_config_id: ID,
    engine_config_id: ID,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
) -> AgentRun:
    inputs = {
        "runType": LLM_CHAT_RUN_TYPE,
        "chatId": str(chat_id),
        "projectConfigId": str(project_config_id),
        "engineConfigId": str(engine_config_id),
        "messages": [message.model_dump(mode="json") for message in input_messages],
    }
    outputs = None
    if output_messages is not None:
        outputs = {
            "messages": [
                message.model_dump(mode="json") for message in output_messages
            ]
        }
    return AgentRun(
        status=status,
        startedAt=started_at,
        finishedAt=started_at + timedelta(seconds=5)
        if status != AgentRunStatus.running
        else None,
        inputs=inputs,
        outputs=outputs,
        events=[
            RunEvent(
                type="run_started",
                payload={
                    "chatId": str(chat_id),
                    "projectConfigId": str(project_config_id),
                    "engineConfigId": str(engine_config_id),
                },
                timestamp=started_at,
            )
        ],
    )


def _build_external_run(
    *,
    chat_id: ID,
    project_config_id: ID,
    engine_config_id: ID | None = None,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
    stream_events: list[RunEvent] | None = None,
) -> AgentRun:
    inputs = {
        "runType": EXTERNAL_AGENT_RUN_TYPE,
        "chatId": str(chat_id),
        "projectConfigId": str(project_config_id),
        "messages": [message.model_dump(mode="json") for message in input_messages],
    }
    if engine_config_id is not None:
        inputs["engineConfigId"] = str(engine_config_id)
    outputs = None
    if output_messages is not None:
        outputs = {
            "messages": [
                message.model_dump(mode="json") for message in output_messages
            ]
        }
    return AgentRun(
        status=status,
        startedAt=started_at,
        finishedAt=started_at + timedelta(seconds=5)
        if status != AgentRunStatus.running
        else None,
        inputs=inputs,
        outputs=outputs,
        events=stream_events or [],
    )


@dataclass(slots=True)
class _TestState:
    dbe: DBE
    agent_runner: AgentRunner
    wmh_frontend_sender: WMHFrontendSender
    external_agent_runner: ExternalAgentRunner | None = None
    share_mode: bool = False
    deployment_mode: bool = False
    share_runtime_state: None = None
    chat_manager: None = None


class TestAgentRunChatRoutes:
    pytestmark = pytest.mark.asyncio

    async def test_share_mode_blocks_llm_when_disabled(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-llm-config-guard"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, allow_llm=True)
            state = SettaFastAPIState(
                FastAPI(),
                share_mode=True,
                share_deployment_root=root,
            )
            await state.wait_until_ready()
            session = state.share_session_store.create_session()

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Hello")],
                            ),
                            engineConfigId=ID("engine-1"),
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                        ),
                        runtime_ctx,
                    )

            assert ctx.value.status_code == 403
            assert ctx.value.detail == "Deployment LLM support is not enabled."

    async def test_get_llm_chat_from_agent_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-1")
            project_config_id = ID("project-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            assistant_message = AssistantChatMessage(
                content=[MessageTextContent(text="Done")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                response = await route_get_llm_chat(
                    GetLLMChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            assert len(response.messages) == 2
            assert not response.waitingForResponse
            assert response.llmConfig.id == "primary"

    async def test_get_llm_chat_uses_latest_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-2")
            project_config_id = ID("project-2")
            first_message = UserChatMessage(
                content=[MessageTextContent(text="First chat")],
            )
            second_message = UserChatMessage(
                content=[MessageTextContent(text="Second chat message")],
            )
            first_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[first_message],
                output_messages=[first_message],
            )
            second_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[second_message],
                output_messages=[second_message],
            )
            save_agent_run(dbe, first_run)
            save_agent_run(dbe, second_run)

            with runtime_context(state) as ctx:
                response = await route_get_llm_chat(
                    GetLLMChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            assert len(response.messages) == 1
            message = response.messages[0]
            assert message.content[0].text == "Second chat message"
            assert not response.waitingForResponse
            assert response.llmConfig.id == "primary"

    async def test_external_engine_rejects_llm_chat_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            internal_engine_config_id = ID("engine-primary")
            external_engine_config_id = ID("engine-external")
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            internal_engine_config = EngineConfig(
                id=internal_engine_config_id,
                name="Default Engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
            external_engine_config = EngineConfig(
                id=external_engine_config_id,
                name="External Engine",
                engineType=EngineType.external_agent,
                externalAgentConfigId=external_config.id,
            )
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe, [internal_engine_config, external_engine_config]
            )
            chat_id = ID("chat-external-mismatch")
            project_config_id = ID("project-llm-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=internal_engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=chat_id,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Next")],
                            ),
                            engineConfigId=external_engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_branch_edit_missing_message_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-branch-1")
            parent_chat_id = ID("chat-parent")
            user_message = UserChatMessage(
                id="msg-1",
                content=[MessageTextContent(text="Original")],
            )
            run = _build_run(
                chat_id=parent_chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 4, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                id="edited",
                                content=[MessageTextContent(text="Edited")],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            branchParentChatId=parent_chat_id,
                            branchFromMessageId=ID("missing"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            assert (
                exc.value.detail
                == "Message missing not found in chat history"
            )

    async def test_get_llm_response_requires_section_or_allow_unscoped(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Hello")],
                            ),
                            engineConfigId=ID("engine-1"),
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=ID("project-1"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            assert (
                exc.value.detail
                == "sectionId is required unless allowUnscoped is true."
            )

    async def test_get_llm_response_implicit_inherit_omits_empty_mcp_override(
        self,
    ) -> None:
        # Default project chat policy is inherit with no explicit MCP server ids.
        # In this case, route_get_llm_response should omit the override input so
        # AgentRunner can use engine/default MCP resolution.
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-inherit-mcp")

            captured_inputs: dict[str, object] = {}

            def capture_start_run(_: AgentProfile, inputs: dict[str, object]) -> None:
                captured_inputs["inputs"] = inputs

            state.agent_runner.start_run = capture_start_run  # type: ignore[method-assign]

            with runtime_context(state) as ctx:
                response_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Generate app spec")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                    ),
                    ctx,
                )

            assert response_chat_id is not None
            inputs = captured_inputs.get("inputs")
            assert isinstance(inputs, dict)
            assert "enabledMcpServerIds" not in inputs

    async def test_get_llm_response_explicit_inherit_keeps_empty_mcp_override(
        self,
    ) -> None:
        # Explicitly saved inherit mode must preserve empty MCP selection as an
        # override so runs execute without MCP tools.
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-explicit-inherit-mcp")
            set_project_chat_capability_policy(
                dbe,
                project_config_id=project_config_id,
                chat_id=None,
                policy=CapabilityPolicy(
                    mode=CapabilityMode.inherit,
                    enabledMcpServerIds=[],
                ),
            )

            captured_inputs: dict[str, object] = {}

            def capture_start_run(_: AgentProfile, inputs: dict[str, object]) -> None:
                captured_inputs["inputs"] = inputs

            state.agent_runner.start_run = capture_start_run  # type: ignore[method-assign]

            with runtime_context(state) as ctx:
                response_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Generate app spec")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                    ),
                    ctx,
                )

            assert response_chat_id is not None
            inputs = captured_inputs.get("inputs")
            assert isinstance(inputs, dict)
            assert inputs["enabledMcpServerIds"] == []

    async def test_get_llm_response_explicit_custom_keeps_empty_mcp_override(
        self,
    ) -> None:
        # Explicit custom mode with empty MCP selection should also disable MCP.
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-explicit-custom-mcp")
            set_project_chat_capability_policy(
                dbe,
                project_config_id=project_config_id,
                chat_id=None,
                policy=CapabilityPolicy(
                    mode=CapabilityMode.custom,
                    enabledMcpServerIds=[],
                ),
            )

            captured_inputs: dict[str, object] = {}

            def capture_start_run(_: AgentProfile, inputs: dict[str, object]) -> None:
                captured_inputs["inputs"] = inputs

            state.agent_runner.start_run = capture_start_run  # type: ignore[method-assign]

            with runtime_context(state) as ctx:
                response_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Generate app spec")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                    ),
                    ctx,
                )

            assert response_chat_id is not None
            inputs = captured_inputs.get("inputs")
            assert isinstance(inputs, dict)
            assert inputs["enabledMcpServerIds"] == []

    async def test_get_llm_response_disabled_policy_keeps_empty_mcp_override(
        self,
    ) -> None:
        # Disabled mode should preserve an explicit empty MCP override so the
        # runner disables tools for this chat.
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-disabled-mcp")
            set_project_chat_capability_policy(
                dbe,
                project_config_id=project_config_id,
                chat_id=None,
                policy=CapabilityPolicy(mode=CapabilityMode.disabled),
            )

            captured_inputs: dict[str, object] = {}

            def capture_start_run(_: AgentProfile, inputs: dict[str, object]) -> None:
                captured_inputs["inputs"] = inputs

            state.agent_runner.start_run = capture_start_run  # type: ignore[method-assign]

            with runtime_context(state) as ctx:
                response_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Generate app spec")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                    ),
                    ctx,
                )

            assert response_chat_id is not None
            inputs = captured_inputs.get("inputs")
            assert isinstance(inputs, dict)
            assert inputs["enabledMcpServerIds"] == []

    async def test_get_llm_response_override_skill_ids_replaces_policy_skills(
        self,
    ) -> None:
        # Request-level overrideSkillIds must replace persisted policy skills for
        # this run without mutating stored policy state.
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-override-skills")

            skills_root = Path(tmpdir) / "skills"
            _write_skill_doc(
                skills_root / "base-skill",
                name="Base Skill",
                body="Base skill from policy.",
            )
            _write_skill_doc(
                skills_root / "appgen-skill",
                name="AppGen Skill",
                body="App-generated override skill.",
            )
            set_skill_sources(
                dbe,
                [
                    SkillSource(
                        id="test_source",
                        path=str(skills_root),
                        label="Test Source",
                        builtin=False,
                    )
                ],
            )
            set_project_chat_capability_policy(
                dbe,
                project_config_id=project_config_id,
                chat_id=None,
                policy=CapabilityPolicy(
                    mode=CapabilityMode.custom,
                    enabledSkillIds=["test_source::base-skill"],
                ),
            )

            captured_inputs: dict[str, object] = {}

            def capture_start_run(profile: AgentProfile, inputs: dict[str, object]) -> None:
                captured_inputs["profileSystemPrompt"] = profile.systemPrompt or ""
                captured_inputs["inputs"] = inputs

            state.agent_runner.start_run = capture_start_run  # type: ignore[method-assign]

            with runtime_context(state) as ctx:
                response_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Generate app spec")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                        overrideSkillIds=[
                            ID("test_source::appgen-skill"),
                            ID("test_source::appgen-skill"),
                        ],
                    ),
                    ctx,
                )

            assert response_chat_id is not None
            inputs = captured_inputs.get("inputs")
            assert isinstance(inputs, dict)
            assert inputs["enabledSkillIds"] == ["test_source::appgen-skill"]
            # Custom policy persists explicit MCP selection independently from
            # request-level skill overrides.
            assert inputs["enabledMcpServerIds"] == []
            prompt = captured_inputs.get("profileSystemPrompt")
            assert isinstance(prompt, str)
            assert "test_source::appgen-skill" in prompt
            assert "test_source::base-skill" not in prompt

    async def test_get_llm_response_override_skill_ids_rejects_unknown_skill(
        self,
    ) -> None:
        # Unknown override ids should fail loudly so App Gen cannot silently send
        # with stale or invalid skill references.
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-override-skills-error")

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Generate app spec")],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            overrideSkillIds=[ID("missing::skill")],
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            assert "Skill 'missing::skill' not found" in exc.value.detail

    async def test_external_chat_id_rejects_missing_engine_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("chat-external-legacy")
            project_config_id = ID("project-external-legacy")
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=None,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[],
                output_messages=[],
            )
            save_agent_run(dbe, run)

            with pytest.raises(HTTPException) as exc:
                _ensure_external_chat_id_compatible(
                    dbe=dbe,
                    chat_id=chat_id,
                    engine_config_id=ID("engine-external"),
                    project_config_id=project_config_id,
                )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_external_chat_id_allows_matching_engine_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("chat-external-metadata-ok")
            project_config_id = ID("project-external-metadata-ok")
            engine_config_id = ID("engine-external")
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[],
                output_messages=[],
            )
            save_agent_run(dbe, run)

            _ensure_external_chat_id_compatible(
                dbe=dbe,
                chat_id=chat_id,
                engine_config_id=engine_config_id,
                project_config_id=project_config_id,
            )

    async def test_get_external_agent_chat_from_outputs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            chat_id = ID("external-chat-1")
            project_config_id = ID("project-ext-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-1",
                content=[MessageTextContent(text="Hi")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                started_at=datetime(2024, 1, 5, tzinfo=timezone.utc),
                status=AgentRunStatus.running,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                response = await route_get_external_agent_chat(
                    GetExternalAgentChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            assert len(response.messages) == 2
            assert response.waitingForResponse
            assert response.toolCallArguments == {}

    async def test_get_external_agent_chat_missing_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_external_agent_chat(
                        GetExternalAgentChatRequest(
                            chatId=ID("missing-external"),
                            projectConfigId=ID("project-ext-missing"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            assert exc.value.detail == "Chat not found"

    async def test_external_agent_prior_messages_use_external_runs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("external-chat-2")
            project_config_id = ID("project-ext-2")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            external_reply = AssistantChatMessage(
                id="assistant-external",
                content=[MessageTextContent(text="External reply")],
            )
            llm_reply = AssistantChatMessage(
                id="assistant-llm",
                content=[MessageTextContent(text="LLM reply")],
            )
            external_run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                started_at=datetime(2024, 1, 6, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, external_reply],
            )
            llm_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=ID("engine-primary"),
                started_at=datetime(2024, 1, 7, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, llm_reply],
            )
            save_agent_run(dbe, external_run)
            save_agent_run(dbe, llm_run)

            prior_messages = _get_prior_messages_for_engine(
                dbe=dbe,
                engine_type=EngineType.external_agent,
                chat_id=chat_id,
                project_config_id=project_config_id,
            )

            assert len(prior_messages) == 2
            assert prior_messages[1].content[0].text == "External reply"

    async def test_stop_llm_chat(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-3")
            running_chat_id = ID("chat-3")
            running_run = _build_run(
                chat_id=running_chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 3, tzinfo=timezone.utc),
                status=AgentRunStatus.running,
                input_messages=[],
                output_messages=None,
            )
            save_agent_run(dbe, running_run)

            with runtime_context(state) as ctx:
                await route_stop_llm_chat(
                    StopLLMChatRequest(chatId=running_chat_id),
                    ctx,
                )

            stopped = load_agent_run(dbe, running_run.id)
            assert stopped is not None
            if stopped is None:
                return
            assert stopped.status == AgentRunStatus.cancelled
            assert stopped.finishedAt is not None

    def test_branch_messages_replace_and_truncate(self) -> None:
        first = UserChatMessage(
            id="msg-1",
            content=[MessageTextContent(text="Original")],
        )
        second = AssistantChatMessage(
            id="msg-2",
            content=[MessageTextContent(text="Reply")],
        )
        third = UserChatMessage(
            id="msg-3",
            content=[MessageTextContent(text="Later")],
        )
        edited = UserChatMessage(
            id="edited",
            content=[MessageTextContent(text="Edited")],
        )

        result = _build_branch_messages(
            prior_messages=[first, second, third],
            edited_message=edited,
            branch_from_message_id=ID("msg-1"),
        )

        assert [message.id for message in result] == ["msg-1"]
        assert result[0].content[0].text == "Edited"

    def test_branch_messages_missing_target_raises(self) -> None:
        first = UserChatMessage(
            id="msg-1",
            content=[MessageTextContent(text="Original")],
        )
        edited = UserChatMessage(
            id="edited",
            content=[MessageTextContent(text="Edited")],
        )

        with pytest.raises(KeyError):
            _build_branch_messages(
                prior_messages=[first],
                edited_message=edited,
                branch_from_message_id=ID("missing"),
            )
