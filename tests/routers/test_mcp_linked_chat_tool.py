from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE, SCRIPTABLE_CHAT_RUN_TYPE
from setta.agentic.store import save_agent_run, save_engine_configs
from setta.database.db_objs import DBE
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.project_state.history import History
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.types.agentic import AgentRun, AgentRunStatus, EngineConfig, EngineType
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl3 import merge_single_config_into_backend
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
        backend = merge_single_config_into_backend(
            ProjectStateBackend(
                defaultProjectConfigId=project_state_single.projectConfig.id
            ),
            project_state_single,
        )
        self.history = History(backend)
        self.set_chat_section_chat_id_calls: list[tuple[ID, ID, ID | None]] = []

    @property
    def project_state_backend(self) -> ProjectStateBackend:
        return self.history.get_current()

    async def set_chat_section_chat_id(self, payload) -> None:
        self.set_chat_section_chat_id_calls.append(
            (payload.projectConfigId, payload.sectionId, payload.chatId)
        )


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

    async def run_sub_agent(self, profile, inputs):
        self.calls.append((profile, dict(inputs or {})))
        return AgentRun(
            id=ID("linked-run-1"),
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


async def _noop_wait_until_ready(self) -> None:  # noqa: ARG001
    return None


def _seed_engine_config(dbe: DBE, engine_config_id: ID) -> None:
    save_engine_configs(
        dbe,
        [
            EngineConfig(
                id=engine_config_id,
                name="Linked engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
        ],
    )


def _build_project_state(
    *,
    managed_target: bool = True,
) -> tuple[ProjectStateSingleConfig, ID, ID, ID, ID]:
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
    existing_target_chat_id = ID("linked-thread-1")
    project_state.sections[caller_section_id].displayName = "Caller"
    project_state.sections[target_section_id].displayName = "Planner"
    set_chat_section_chat_id(project_state, target_section_id, existing_target_chat_id)
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
    ) = _build_project_state(managed_target=managed_target)
    _seed_engine_config(dbe, ID("engine-linked"))
    manager = _DummyLinkedChatProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    agent_runner = _DummyAgentRunner()
    external_agent_runner = SimpleNamespace(disabled=True)

    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        [
            project_config_id,
            caller_section_id,
            target_section_id,
            target_chat_id,
            ID("caller-chat-1"),
        ],
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
    assert manager.set_chat_section_chat_id_calls == []


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
    assert manager.set_chat_section_chat_id_calls == []


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
