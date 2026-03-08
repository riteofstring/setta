import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    LLM_CHAT_RUN_TYPE,
    SCRIPTABLE_CHAT_RUN_TYPE,
)
from setta.agentic.store import (
    save_agent_run,
    save_engine_configs,
    save_external_agent_configs,
)
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.types.agentic import AgentRun, AgentRunStatus, EngineConfig, EngineType
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    set_chat_section_chat_id,
    set_chat_section_settings,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    ChatSectionImpl,
    ChatDictationMode,
    ChatPermissionMode,
    SectionType,
    TextBlockSectionImpl,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

ensure_setta_mcp_tools_loaded()


class _DummyLinkedChatProjectManager:
    def __init__(self, project_state_single: ProjectStateSingleConfig) -> None:
        self._backend = merge_single_config_into_backend(
            ProjectStateBackend(
                defaultProjectConfigId=project_state_single.projectConfig.id
            ),
            project_state_single,
        )
        self.history = SimpleNamespace(revision=0)
        self.set_chat_section_chat_id_calls: list[tuple[ID, ID, ID | None]] = []
        self._linked_chat_section_reservations: dict[
            tuple[ID, ID], dict[str, object]
        ] = {}

    @property
    def project_state_backend(self) -> ProjectStateBackend:
        return self._backend

    async def set_chat_section_chat_id(self, payload) -> None:
        self.set_chat_section_chat_id_calls.append(
            (payload.projectConfigId, payload.sectionId, payload.chatId)
        )
        project_state = convert_backend_to_single_config(
            self._backend,
            payload.projectConfigId,
        )
        set_chat_section_chat_id(
            project_state,
            payload.sectionId,
            payload.chatId,
        )
        self._backend = merge_single_config_into_backend(self._backend, project_state)
        self.history.revision += 1

    async def reserve_linked_chat_section_chat_id(
        self,
        project_config_id: ID,
        section_id: ID,
    ) -> ID:
        project_state = convert_backend_to_single_config(self._backend, project_config_id)
        current_chat_id = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            ChatSectionImpl,
        ).chatId
        reservation_key = (project_config_id, section_id)
        reservation = self._linked_chat_section_reservations.get(reservation_key)
        if (
            reservation is not None
            and current_chat_id is not None
            and reservation["chat_id"] == current_chat_id
        ):
            reservation["pending_claims"] = int(reservation["pending_claims"]) + 1
            self.set_chat_section_chat_id_calls.append(
                (project_config_id, section_id, current_chat_id)
            )
            return current_chat_id
        if current_chat_id is not None:
            self.set_chat_section_chat_id_calls.append(
                (project_config_id, section_id, current_chat_id)
            )
            return current_chat_id

        next_chat_id = create_new_id()
        set_chat_section_chat_id(project_state, section_id, next_chat_id)
        self._backend = merge_single_config_into_backend(self._backend, project_state)
        self._linked_chat_section_reservations[reservation_key] = {
            "chat_id": next_chat_id,
            "pending_claims": 1,
            "has_started_run": False,
        }
        self.set_chat_section_chat_id_calls.append(
            (project_config_id, section_id, next_chat_id)
        )
        self.history.revision += 1
        return next_chat_id

    async def mark_linked_chat_section_chat_start_succeeded(
        self,
        project_config_id: ID,
        section_id: ID,
        chat_id: ID,
    ) -> None:
        reservation = self._linked_chat_section_reservations.get(
            (project_config_id, section_id)
        )
        if reservation is None or reservation["chat_id"] != chat_id:
            return
        reservation["pending_claims"] = int(reservation["pending_claims"]) - 1
        reservation["has_started_run"] = True
        if int(reservation["pending_claims"]) == 0:
            del self._linked_chat_section_reservations[(project_config_id, section_id)]

    async def release_linked_chat_section_chat_start_failure(
        self,
        project_config_id: ID,
        section_id: ID,
        chat_id: ID,
    ) -> None:
        reservation_key = (project_config_id, section_id)
        reservation = self._linked_chat_section_reservations.get(reservation_key)
        if reservation is None or reservation["chat_id"] != chat_id:
            return
        reservation["pending_claims"] = int(reservation["pending_claims"]) - 1
        if int(reservation["pending_claims"]) > 0:
            return

        del self._linked_chat_section_reservations[reservation_key]
        if bool(reservation["has_started_run"]):
            return

        project_state = convert_backend_to_single_config(self._backend, project_config_id)
        set_chat_section_chat_id(project_state, section_id, None)
        self._backend = merge_single_config_into_backend(self._backend, project_state)
        self.history.revision += 1


class _StrictProjectManagerSwitcher:
    def __init__(
        self,
        project_config_id: ID,
        manager: _DummyLinkedChatProjectManager,
    ) -> None:
        self._project_config_id = project_config_id
        self._manager = manager
        self.main = manager

    def get(self, project_config_id: ID, *, share_session_id: str | None = None):
        assert share_session_id is None
        if project_config_id != self._project_config_id:
            raise KeyError(f"Unexpected project config id: {project_config_id}")
        return self._manager


class _DummyAgentRunner:
    def __init__(self) -> None:
        self.disabled = False
        self.config = AllLLMConfigs(
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
        self.calls: list[tuple[object, dict[str, object]]] = []
        self._runs_by_id: dict[ID, AgentRun] = {}

    def _build_completed_run(self, run_id: ID, inputs) -> AgentRun:
        return AgentRun(
            id=run_id,
            status=AgentRunStatus.completed,
            inputs=inputs,
            outputs={
                "messages": [
                    AssistantChatMessage(
                        content=[MessageTextContent(text="Linked planner reply")]
                    ).model_dump(mode="json")
                ]
            },
        )

    def start_run(
        self,
        profile,
        inputs,
        *,
        emit_stream: bool = True,  # noqa: ARG002
        emit_ai_follow: bool = True,  # noqa: ARG002
    ) -> AgentRun:
        self.calls.append((profile, dict(inputs or {})))
        run = self._build_completed_run(ID(f"linked-run-{len(self.calls)}"), inputs)
        self._runs_by_id[run.id] = run
        return run

    async def wait_for_run(self, run_id: ID) -> AgentRun:
        return self._runs_by_id[run_id]

    async def run_sub_agent(self, profile, inputs):
        run = self.start_run(profile, inputs, emit_stream=False, emit_ai_follow=False)
        return await self.wait_for_run(run.id)


class _BlockingDummyAgentRunner(_DummyAgentRunner):
    def __init__(self) -> None:
        super().__init__()
        self.first_call_started = asyncio.Event()
        self.second_call_started = asyncio.Event()
        self.release_calls = asyncio.Event()

    def start_run(
        self,
        profile,
        inputs,
        *,
        emit_stream: bool = True,  # noqa: ARG002
        emit_ai_follow: bool = True,  # noqa: ARG002
    ) -> AgentRun:
        self.calls.append((profile, dict(inputs or {})))
        if len(self.calls) == 1:
            self.first_call_started.set()
        if len(self.calls) == 2:
            self.second_call_started.set()
        run = self._build_completed_run(ID(f"linked-run-{len(self.calls)}"), inputs)
        self._runs_by_id[run.id] = run
        return run

    async def wait_for_run(self, run_id: ID) -> AgentRun:
        await self.release_calls.wait()
        return self._runs_by_id[run_id]


class _FailingStartDummyAgentRunner(_DummyAgentRunner):
    def start_run(
        self,
        profile,
        inputs,
        *,
        emit_stream: bool = True,  # noqa: ARG002
        emit_ai_follow: bool = True,  # noqa: ARG002
    ) -> AgentRun:
        self.calls.append((profile, dict(inputs or {})))
        raise ValueError("synthetic startup failure")


class _DummyExternalAgentRunner:
    def __init__(self) -> None:
        self.disabled = False
        self.calls: list[tuple[ID, object, object, dict[str, object]]] = []
        self._runs_by_id: dict[ID, AgentRun] = {}

    def start_run(
        self,
        engine_config_id: ID,
        external_config,
        profile,
        inputs,
    ) -> AgentRun:
        self.calls.append(
            (
                engine_config_id,
                external_config,
                profile,
                dict(inputs or {}),
            )
        )
        run = AgentRun(
            id=ID(f"external-linked-run-{len(self.calls)}"),
            status=AgentRunStatus.completed,
            inputs=inputs,
            outputs={
                "messages": [
                    AssistantChatMessage(
                        content=[MessageTextContent(text="Linked planner reply")]
                    ).model_dump(mode="json")
                ]
            },
        )
        self._runs_by_id[run.id] = run
        return run

    async def wait_for_run(self, run_id: ID) -> AgentRun:
        return self._runs_by_id[run_id]


class _FailingStartDummyExternalAgentRunner(_DummyExternalAgentRunner):
    def start_run(
        self,
        engine_config_id: ID,
        external_config,
        profile,
        inputs,
    ) -> AgentRun:
        self.calls.append(
            (
                engine_config_id,
                external_config,
                profile,
                dict(inputs or {}),
            )
        )
        raise ValueError("synthetic external startup failure")


async def _noop_wait_until_ready(self) -> None:  # noqa: ARG001
    return None


def _seed_engine_config(dbe: DBE, engine_config_id: ID) -> None:
    _seed_engine_config_with_type(
        dbe,
        engine_config_id=engine_config_id,
        engine_type=EngineType.setta_llm,
    )


def _seed_engine_config_with_type(
    dbe: DBE,
    *,
    engine_config_id: ID,
    engine_type: EngineType,
) -> None:
    external_agent_config_id: ID | None = None
    if engine_type == EngineType.external_agent:
        external_agent_config_id = ID("external-agent-linked")
        save_external_agent_configs(
            dbe,
            [
                ExternalAgentConfig(
                    id=external_agent_config_id,
                    name="Linked external agent",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.sdk,
                    settingsMode=ExternalAgentSettingsMode.managed_local,
                )
            ],
        )
    save_engine_configs(
        dbe,
        [
            EngineConfig(
                id=engine_config_id,
                name="Linked engine",
                engineType=engine_type,
                settaLlmConfigId="primary"
                if engine_type == EngineType.setta_llm
                else None,
                externalAgentConfigId=external_agent_config_id,
            )
        ],
    )


def _build_project_state(
    *,
    managed_target: bool = True,
    seed_target_chat_id: bool = True,
) -> tuple[ProjectStateSingleConfig, ID, ID, ID, ID | None]:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="linked-chat-tool-test")
    )
    caller_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    target_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    project_state.sections[caller_section_id].displayName = "Caller"
    project_state.sections[target_section_id].displayName = "Planner"
    existing_target_chat_id = ID("linked-thread-1") if seed_target_chat_id else None
    if existing_target_chat_id is not None:
        set_chat_section_chat_id(
            project_state,
            target_section_id,
            existing_target_chat_id,
        )
    set_chat_section_settings(
        project_state,
        target_section_id,
        managed_target,
        ID("engine-linked") if managed_target else None,
        None,
        None,
        False,
        ChatPermissionMode.minimal,
        True,
        ChatDictationMode.auto,
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=ID("edge-linked"),
            sourceSectionId=caller_section_id,
            targetSectionId=target_section_id,
            kind=AgenticEdgeKind.chat_chat,
        ),
    )
    return (
        project_state,
        project_state.projectConfig.id,
        caller_section_id,
        target_section_id,
        existing_target_chat_id,
    )


def _build_test_app(
    tmp_path,
    *,
    managed_target: bool = True,
    seed_target_chat_id: bool = True,
    agent_runner_override: _DummyAgentRunner | None = None,
    external_agent_runner_override: object | None = None,
    engine_type: EngineType = EngineType.setta_llm,
) -> tuple[
    FastAPI,
    _DummyAgentRunner,
    _DummyLinkedChatProjectManager,
    dict[ID, ID],
    ID,
    ID,
    ID,
]:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        caller_section_id,
        target_section_id,
        target_chat_id,
    ) = _build_project_state(
        managed_target=managed_target,
        seed_target_chat_id=seed_target_chat_id,
    )
    _seed_engine_config_with_type(
        dbe,
        engine_config_id=ID("engine-linked"),
        engine_type=engine_type,
    )
    manager = _DummyLinkedChatProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    agent_runner = agent_runner_override or _DummyAgentRunner()
    external_agent_runner = external_agent_runner_override or SimpleNamespace(
        disabled=True
    )

    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    ids_to_map = [
        project_config_id,
        caller_section_id,
        target_section_id,
        ID("caller-chat-1"),
    ]
    if target_chat_id is not None:
        ids_to_map.append(target_chat_id)
    _ = convert_canonical_ids_to_temporary(
        ids_to_map,
        canonical_to_temporary,
        temporary_to_canonical,
    )
    dbe.write_temporary_id_map(canonical_to_temporary)

    state = type(
        "_State",
        (),
        {
            "project_manager_switcher": switcher,
            "dbe": dbe,
            "share_mode": False,
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
            "wait_until_ready": _noop_wait_until_ready,
            "agent_runner": agent_runner,
            "external_agent_runner": external_agent_runner,
        },
    )()
    app = FastAPI()
    mcp_server = SettaFastMCP(
        app,
        state,
        "/mcp-test",
        "Test MCP Server",
        frontend_sender,
        dbe,
    )
    state.mcp_server = mcp_server
    app.state.setta = state
    app.include_router(mcp_tools_router)
    return (
        app,
        agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    )


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_runs_direct_linked_target(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]
    tmp_target_chat_id = canonical_to_temporary[ID("linked-thread-1")]
    tmp_caller_chat_id = canonical_to_temporary[ID("caller-chat-1")]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(tmp_caller_chat_id),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is False
    assert payload["structuredContent"]["targetSectionId"] == str(tmp_target_section_id)
    assert payload["structuredContent"]["chatId"] == str(tmp_target_chat_id)
    assert payload["structuredContent"]["status"] == "completed"
    assert payload["structuredContent"]["assistantText"] == "Linked planner reply"
    assert agent_runner.calls
    _, captured_inputs = agent_runner.calls[0]
    assert captured_inputs["projectConfigId"] == str(project_config_id)
    assert captured_inputs["sectionId"] == str(target_section_id)
    assert captured_inputs["chatId"] == "linked-thread-1"
    assert captured_inputs["runType"] == LLM_CHAT_RUN_TYPE
    assert captured_inputs["linkedChatInvocationDepth"] == 1
    assert captured_inputs["linkedChatInvocationChainSectionIds"] == [
        str(caller_section_id)
    ]
    assert manager.set_chat_section_chat_id_calls == [
        (project_config_id, target_section_id, ID("linked-thread-1"))
    ]


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_rejects_mixed_engine_history(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    target_chat_id = ID("linked-thread-1")
    save_agent_run(
        app.state.setta.dbe,
        AgentRun(
            id=ID("external-run-1"),
            status=AgentRunStatus.completed,
            inputs={
                "runType": EXTERNAL_AGENT_RUN_TYPE,
                "chatId": str(target_chat_id),
                "projectConfigId": str(project_config_id),
                "engineConfigId": "engine-external",
            },
            outputs={
                "messages": [
                    AssistantChatMessage(
                        content=[MessageTextContent(text="External reply")]
                    ).model_dump(mode="json")
                ]
            },
        ),
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]
    tmp_caller_chat_id = canonical_to_temporary[ID("caller-chat-1")]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(tmp_caller_chat_id),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "chat_history_conflict"
    assert (
        payload["structuredContent"]["message"]
        == "Chat engine mismatch; start a new chat."
    )
    assert agent_runner.calls == []
    assert manager.set_chat_section_chat_id_calls == [
        (project_config_id, target_section_id, ID("linked-thread-1"))
    ]


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_reuses_history_for_typed_managed_runs(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        _manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]
    tmp_caller_chat_id = canonical_to_temporary[ID("caller-chat-1")]

    request_payload = {
        "tool": "invoke_linked_chat",
        "arguments": {
            "targetSectionId": str(tmp_target_section_id),
            "prompt": "Plan the next implementation step.",
        },
        "agenticContext": {
            "projectConfigId": str(tmp_project_id),
            "chatId": str(tmp_caller_chat_id),
            "sectionId": str(tmp_caller_section_id),
        },
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first_response = await client.post(
            "/__setta__/tools/call",
            json=request_payload,
        )

        assert first_response.status_code == 200
        assert first_response.json()["isError"] is False

        _, first_inputs = agent_runner.calls[0]
        save_agent_run(
            app.state.setta.dbe,
            AgentRun(
                id=ID("linked-run-saved"),
                status=AgentRunStatus.completed,
                inputs=first_inputs,
                outputs={
                    "messages": [
                        AssistantChatMessage(
                            content=[MessageTextContent(text="Linked planner reply")]
                        ).model_dump(mode="json")
                    ]
                },
            ),
        )

        second_response = await client.post(
            "/__setta__/tools/call",
            json={
                **request_payload,
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Continue the plan with concrete steps.",
                },
            },
        )

    assert second_response.status_code == 200
    assert second_response.json()["isError"] is False
    assert len(agent_runner.calls) == 2

    _, second_inputs = agent_runner.calls[1]
    assert second_inputs["runType"] == LLM_CHAT_RUN_TYPE
    assert [
        message["content"][0]["text"]
        for message in second_inputs["messages"]
        if message["content"]
    ] == [
        "Plan the next implementation step.",
        "Linked planner reply",
        "Continue the plan with concrete steps.",
    ]


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_rejects_scriptable_history(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    target_chat_id = ID("linked-thread-1")
    save_agent_run(
        app.state.setta.dbe,
        AgentRun(
            id=ID("scriptable-run-1"),
            status=AgentRunStatus.completed,
            inputs={
                "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                "chatId": str(target_chat_id),
                "projectConfigId": str(project_config_id),
                "engineConfigId": "engine-scriptable",
                "messages": [],
            },
            outputs={
                "messages": [
                    AssistantChatMessage(
                        content=[MessageTextContent(text="Scriptable reply")]
                    ).model_dump(mode="json")
                ]
            },
        ),
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]
    tmp_caller_chat_id = canonical_to_temporary[ID("caller-chat-1")]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(tmp_caller_chat_id),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "chat_history_conflict"
    assert (
        payload["structuredContent"]["message"]
        == "Chat engine mismatch; start a new chat."
    )
    assert agent_runner.calls == []
    assert manager.set_chat_section_chat_id_calls == [
        (project_config_id, target_section_id, ID("linked-thread-1"))
    ]


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_does_not_bind_chat_when_managed_runner_is_unavailable(
    tmp_path,
) -> None:
    disabled_runner = _DummyAgentRunner()
    disabled_runner.disabled = True
    (
        app,
        _agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(
        tmp_path,
        seed_target_chat_id=False,
        agent_runner_override=disabled_runner,
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "runner_unavailable"
    assert manager.set_chat_section_chat_id_calls == []
    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        project_config_id,
    )
    assert (
        get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        ).chatId
        is None
    )


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_does_not_bind_chat_when_managed_start_fails(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(
        tmp_path,
        seed_target_chat_id=False,
        agent_runner_override=_FailingStartDummyAgentRunner(),
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "run_start_failed"
    assert payload["structuredContent"]["message"] == "synthetic startup failure"
    assert agent_runner.calls
    assert len(manager.set_chat_section_chat_id_calls) == 1
    assert manager.set_chat_section_chat_id_calls[0][:2] == (
        project_config_id,
        target_section_id,
    )
    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        project_config_id,
    )
    assert (
        get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        ).chatId
        is None
    )


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_does_not_bind_chat_when_external_runner_is_unavailable(
    tmp_path,
) -> None:
    (
        app,
        _agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(
        tmp_path,
        seed_target_chat_id=False,
        engine_type=EngineType.external_agent,
        external_agent_runner_override=SimpleNamespace(disabled=True),
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "runner_unavailable"
    assert manager.set_chat_section_chat_id_calls == []
    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        project_config_id,
    )
    assert (
        get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        ).chatId
        is None
    )


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_does_not_bind_chat_when_external_start_fails(
    tmp_path,
) -> None:
    external_runner = _FailingStartDummyExternalAgentRunner()
    (
        app,
        _agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(
        tmp_path,
        seed_target_chat_id=False,
        engine_type=EngineType.external_agent,
        external_agent_runner_override=external_runner,
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Plan the next implementation step.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "run_start_failed"
    assert (
        payload["structuredContent"]["message"] == "synthetic external startup failure"
    )
    assert external_runner.calls
    assert len(manager.set_chat_section_chat_id_calls) == 1
    assert manager.set_chat_section_chat_id_calls[0][:2] == (
        project_config_id,
        target_section_id,
    )
    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        project_config_id,
    )
    assert (
        get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        ).chatId
        is None
    )


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_blocks_when_depth_cap_is_reached(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        _manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Try to recurse.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                    "linkedChatInvocationDepth": 1,
                    "linkedChatInvocationChainSectionIds": [str(tmp_caller_section_id)],
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "max_depth_exceeded"
    assert agent_runner.calls == []


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_blocks_cycles(tmp_path) -> None:
    (
        app,
        agent_runner,
        _manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Try a cyclic call.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                    "linkedChatInvocationChainSectionIds": [str(tmp_target_section_id)],
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "cycle_detected"
    assert agent_runner.calls == []


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_rejects_scriptable_targets(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        _manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path, managed_target=False)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Try a scriptable target.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "unsupported_scriptable_target"
    assert agent_runner.calls == []


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_rejects_stale_non_chat_targets(
    tmp_path,
) -> None:
    (
        app,
        agent_runner,
        _manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(tmp_path)
    backend = app.state.setta.project_manager_switcher.main.project_state_backend
    target_variant_id = backend.projectConfigs[project_config_id].sectionVariantMap[
        target_section_id
    ]
    target_impl_id = backend.sectionVariants[target_variant_id].impl
    backend.sectionImpls[target_impl_id] = TextBlockSectionImpl(id=target_impl_id)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "invoke_linked_chat",
                "arguments": {
                    "targetSectionId": str(tmp_target_section_id),
                    "prompt": "Try a stale target.",
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(canonical_to_temporary[ID("caller-chat-1")]),
                    "sectionId": str(tmp_caller_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "unsupported_target_type"
    assert agent_runner.calls == []


@pytest.mark.asyncio
async def test_tools_call_invoke_linked_chat_reserves_the_target_chat_before_overlapping_runs(
    tmp_path,
) -> None:
    blocking_runner = _BlockingDummyAgentRunner()
    (
        app,
        agent_runner,
        manager,
        canonical_to_temporary,
        project_config_id,
        caller_section_id,
        target_section_id,
    ) = _build_test_app(
        tmp_path,
        seed_target_chat_id=False,
        agent_runner_override=blocking_runner,
    )
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_caller_section_id = canonical_to_temporary[caller_section_id]
    tmp_target_section_id = canonical_to_temporary[target_section_id]
    tmp_caller_chat_id = canonical_to_temporary[ID("caller-chat-1")]

    request_payload = {
        "tool": "invoke_linked_chat",
        "arguments": {
            "targetSectionId": str(tmp_target_section_id),
            "prompt": "Plan the next implementation step.",
        },
        "agenticContext": {
            "projectConfigId": str(tmp_project_id),
            "chatId": str(tmp_caller_chat_id),
            "sectionId": str(tmp_caller_section_id),
        },
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first_request = asyncio.create_task(
            client.post("/__setta__/tools/call", json=request_payload)
        )
        await asyncio.wait_for(blocking_runner.first_call_started.wait(), timeout=1)

        assert len(manager.set_chat_section_chat_id_calls) == 1
        first_reserved_chat_id = manager.set_chat_section_chat_id_calls[0][2]
        if first_reserved_chat_id is None:
            raise AssertionError("Expected the first call to reserve a target chat id.")

        second_request = asyncio.create_task(
            client.post("/__setta__/tools/call", json=request_payload)
        )
        await asyncio.wait_for(blocking_runner.second_call_started.wait(), timeout=1)
        blocking_runner.release_calls.set()

        first_response, second_response = await asyncio.gather(
            first_request,
            second_request,
        )

    assert agent_runner is blocking_runner
    assert first_response.status_code == 200
    assert second_response.status_code == 200

    first_payload = first_response.json()
    second_payload = second_response.json()
    assert first_payload["isError"] is False
    assert second_payload["isError"] is False
    assert (
        first_payload["structuredContent"]["chatId"]
        == second_payload["structuredContent"]["chatId"]
    )

    assert len(manager.set_chat_section_chat_id_calls) == 2
    assert manager.set_chat_section_chat_id_calls == [
        (project_config_id, target_section_id, first_reserved_chat_id),
        (project_config_id, target_section_id, first_reserved_chat_id),
    ]
    assert [captured_inputs["chatId"] for _, captured_inputs in agent_runner.calls] == [
        str(first_reserved_chat_id),
        str(first_reserved_chat_id),
    ]

    project_state = convert_backend_to_single_config(
        manager.project_state_backend,
        project_config_id,
    )
    assert (
        get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        ).chatId
        == first_reserved_chat_id
    )
