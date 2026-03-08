from dataclasses import dataclass
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from setta.agentic.store import save_agent_profiles
from setta.database.db_objs import DBE
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.share.session_store import MemorySessionStore
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.types.share_deployment import SharePolicy
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

ensure_setta_mcp_tools_loaded()


class _DummyProjectManager:
    def __init__(self, project_state_single: ProjectStateSingleConfig) -> None:
        self.project_state_backend = merge_single_config_into_backend(
            ProjectStateBackend(
                defaultProjectConfigId=project_state_single.projectConfig.id
            ),
            project_state_single,
        )
        self.history = SimpleNamespace(revision=0)


class _DeploymentProjectManagerSwitcher:
    def __init__(self, project_config_id: ID, manager: _DummyProjectManager) -> None:
        self._project_config_id = project_config_id
        self._manager = manager
        self.calls: list[tuple[ID, str | None]] = []

    def get(self, project_config_id: ID, *, share_session_id: str | None = None):
        self.calls.append((project_config_id, share_session_id))
        if share_session_id is None:
            raise KeyError("Missing share session id")
        if project_config_id != self._project_config_id:
            raise KeyError(f"Unexpected project config id: {project_config_id}")
        return self._manager


class _DummyShareRuntimeState:
    def __init__(
        self,
        share_policy: SharePolicy,
        *,
        initial_run_counts: dict[str, int] | None = None,
    ) -> None:
        self.share_policy = share_policy
        self.session_backend_calls: list[str] = []
        self.increment_calls: list[str] = []
        self.rollback_calls: list[str] = []
        self._session_run_counts = dict(initial_run_counts or {})

    def get_or_create_session_backend(self, session_id: str) -> dict[str, object]:
        self.session_backend_calls.append(session_id)
        self._session_run_counts.setdefault(session_id, 0)
        return {"sessionId": session_id}

    async def try_reserve_session_run_count(self, session_id: str) -> bool:
        self._session_run_counts.setdefault(session_id, 0)
        if self._session_run_counts[session_id] > 0:
            return False
        self._session_run_counts[session_id] += 1
        return True

    async def rollback_reserved_session_run_count(self, session_id: str) -> int:
        self.rollback_calls.append(session_id)
        self._session_run_counts.setdefault(session_id, 0)
        if self._session_run_counts[session_id] > 0:
            self._session_run_counts[session_id] -= 1
        return self._session_run_counts[session_id]

    def increment_session_run_count(self, session_id: str) -> int:
        self.increment_calls.append(session_id)
        self._session_run_counts.setdefault(session_id, 0)
        self._session_run_counts[session_id] += 1
        return self._session_run_counts[session_id]

    def get_session_run_count(self, session_id: str) -> int:
        return self._session_run_counts.get(session_id, 0)


@dataclass
class _DummyAgentRunner:
    start_exception: Exception | None = None

    def __post_init__(self) -> None:
        self.disabled = False
        self.start_calls: list[tuple[AgentProfile, dict[str, object]]] = []
        self.wait_calls: list[ID] = []
        self._runs_by_id: dict[ID, AgentRun] = {}

    def start_run(
        self,
        profile: AgentProfile,
        inputs: dict[str, object] | None,
        *,
        emit_stream: bool = True,  # noqa: ARG002
        emit_ai_follow: bool = True,  # noqa: ARG002
    ) -> AgentRun:
        normalized_inputs = dict(inputs or {})
        self.start_calls.append((profile, normalized_inputs))
        if self.start_exception is not None:
            raise self.start_exception
        run_id = ID(f"run-{len(self.start_calls)}")
        run = AgentRun(
            id=run_id,
            status=AgentRunStatus.completed,
            inputs=normalized_inputs,
        )
        self._runs_by_id[run_id] = run
        return run

    async def wait_for_run(self, run_id: ID) -> AgentRun:
        self.wait_calls.append(run_id)
        return self._runs_by_id[run_id]


async def _noop_wait_until_ready(self) -> None:  # noqa: ARG001
    return None


def _build_deployment_app(
    tmp_path,
    *,
    share_policy: SharePolicy,
    initial_run_counts: dict[str, int] | None = None,
    agent_runner: _DummyAgentRunner | None = None,
) -> tuple[
    FastAPI,
    _DummyAgentRunner,
    _DummyShareRuntimeState,
    _DeploymentProjectManagerSwitcher,
    dict[ID, ID],
    ID,
    AgentProfile,
    str,
]:
    dbe = DBE(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="mcp-tools-runtime-policy")
    )
    create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    dbe.write_project(
        merge_single_config_into_backend(
            ProjectStateBackend(defaultProjectConfigId=project_state.projectConfig.id),
            project_state,
        )
    )
    profile = AgentProfile(
        id=ID("profile-runtime-policy"),
        name="Planner",
        description="Profile used for tools/call policy tests.",
        systemPrompt="Classified planner instructions.",
    )
    save_agent_profiles(dbe, [profile])

    manager = _DummyProjectManager(project_state)
    switcher = _DeploymentProjectManagerSwitcher(
        project_state.projectConfig.id, manager
    )
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
    share_session_store = MemorySessionStore()
    request_session_id = share_session_store.create_session().id
    share_runtime_state = _DummyShareRuntimeState(
        share_policy,
        initial_run_counts=initial_run_counts,
    )

    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        [project_state.projectConfig.id, profile.id],
        canonical_to_temporary,
        temporary_to_canonical,
    )
    dbe.write_temporary_id_map(canonical_to_temporary)

    resolved_agent_runner = agent_runner or _DummyAgentRunner()
    state = type(
        "_State",
        (),
        {
            "project_manager_switcher": switcher,
            "dbe": dbe,
            "share_mode": True,
            "deployment_mode": True,
            "wmh_frontend_sender": frontend_sender,
            "wait_until_ready": _noop_wait_until_ready,
            "agent_runner": resolved_agent_runner,
            "external_agent_runner": SimpleNamespace(disabled=True),
            "share_session_store": share_session_store,
            "share_runtime_state": share_runtime_state,
            "terminals": object(),
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
        resolved_agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_state.projectConfig.id,
        profile,
        request_session_id,
    )


def _build_unscoped_agentic_context(
    canonical_to_temporary: dict[ID, ID],
    project_config_id: ID,
) -> dict[str, object]:
    return {
        "projectConfigId": str(canonical_to_temporary[project_config_id]),
        "allowUnscoped": True,
    }


@pytest.mark.asyncio
async def test_tools_call_list_agent_profiles_denies_llm_disabled_deployments(
    tmp_path,
) -> None:
    """Profile reads must fail closed before the tool body runs."""

    (
        app,
        _agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_config_id,
        _profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(allowRun=True, allowLLM=False),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "list_agent_profiles",
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 403
    assert switcher.calls == []
    assert share_runtime_state.session_backend_calls == [request_session_id]


@pytest.mark.asyncio
async def test_tools_call_get_agent_profile_denies_llm_disabled_deployments(
    tmp_path,
) -> None:
    """Single-profile reads must share the same LLM gate as the HTTP routes."""

    (
        app,
        _agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(allowRun=True, allowLLM=False),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "get_agent_profile",
                "arguments": {"profileId": str(canonical_to_temporary[profile.id])},
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 403
    assert switcher.calls == []
    assert share_runtime_state.session_backend_calls == [request_session_id]


@pytest.mark.asyncio
async def test_tools_call_agent_profile_reads_succeed_when_llm_is_allowed(
    tmp_path,
) -> None:
    """The runtime policy should block only disallowed deployments, not valid reads."""

    (
        app,
        _agent_runner,
        _share_runtime_state,
        _switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(allowRun=True, allowLLM=True),
    )
    agentic_context = _build_unscoped_agentic_context(
        canonical_to_temporary,
        project_config_id,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        list_response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "list_agent_profiles",
                "agenticContext": agentic_context,
            },
        )
        get_response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "get_agent_profile",
                "arguments": {"profileId": str(canonical_to_temporary[profile.id])},
                "agenticContext": agentic_context,
            },
        )

    assert list_response.status_code == 200
    assert list_response.json()["structuredContent"]["profiles"][0]["systemPrompt"] == (
        profile.systemPrompt
    )

    assert get_response.status_code == 200
    assert (
        get_response.json()["structuredContent"]["systemPrompt"] == profile.systemPrompt
    )


@pytest.mark.asyncio
async def test_tools_call_run_agent_profile_denies_when_runs_are_disabled(
    tmp_path,
) -> None:
    """Run-starting MCP tools must obey the allowRun deployment gate."""

    (
        app,
        agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(allowRun=False, allowLLM=True),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "run_agent_profile",
                "arguments": {
                    "profileId": str(canonical_to_temporary[profile.id]),
                    "inputs": {"allowUnscoped": True},
                },
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 403
    assert agent_runner.start_calls == []
    assert switcher.calls == []
    assert share_runtime_state.get_session_run_count(request_session_id) == 0
    assert share_runtime_state.increment_calls == []
    assert share_runtime_state.rollback_calls == []


@pytest.mark.asyncio
async def test_tools_call_run_agent_profile_denies_when_llm_is_disabled(
    tmp_path,
) -> None:
    """Run-starting MCP tools must obey the allowLLM deployment gate."""

    (
        app,
        agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(allowRun=True, allowLLM=False),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "run_agent_profile",
                "arguments": {
                    "profileId": str(canonical_to_temporary[profile.id]),
                    "inputs": {"allowUnscoped": True},
                },
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 403
    assert agent_runner.start_calls == []
    assert switcher.calls == []
    assert share_runtime_state.get_session_run_count(request_session_id) == 0
    assert share_runtime_state.increment_calls == []
    assert share_runtime_state.rollback_calls == []


@pytest.mark.asyncio
async def test_tools_call_run_agent_profile_denies_when_single_run_slot_is_taken(
    tmp_path,
) -> None:
    """A second run must be blocked when the session already owns the only slot."""

    (
        app,
        agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(
            allowRun=True,
            allowLLM=True,
            allowMultipleRuns=False,
        ),
        initial_run_counts={},
    )
    share_runtime_state._session_run_counts[request_session_id] = 1

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "run_agent_profile",
                "arguments": {
                    "profileId": str(canonical_to_temporary[profile.id]),
                    "inputs": {"allowUnscoped": True},
                },
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 403
    assert agent_runner.start_calls == []
    assert switcher.calls == []
    assert share_runtime_state.get_session_run_count(request_session_id) == 1
    assert share_runtime_state.increment_calls == []
    assert share_runtime_state.rollback_calls == []


@pytest.mark.asyncio
async def test_tools_call_run_agent_profile_tracks_started_runs(
    tmp_path,
) -> None:
    """Successful run starts must update the session count exactly once."""

    (
        app,
        agent_runner,
        share_runtime_state,
        switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(allowRun=True, allowLLM=True),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "run_agent_profile",
                "arguments": {
                    "profileId": str(canonical_to_temporary[profile.id]),
                    "inputs": {"allowUnscoped": True},
                },
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 200
    assert response.json()["structuredContent"]["status"] == "completed"
    assert len(agent_runner.start_calls) == 1
    assert len(agent_runner.wait_calls) == 1
    assert switcher.calls == [
        (project_config_id, request_session_id),
    ]
    assert share_runtime_state.get_session_run_count(request_session_id) == 1
    assert share_runtime_state.increment_calls == [request_session_id]
    assert share_runtime_state.rollback_calls == []


@pytest.mark.asyncio
async def test_tools_call_run_agent_profile_rolls_back_reserved_slot_when_start_fails(
    tmp_path,
) -> None:
    """Reserved single-run slots must be released if the tool fails before start."""

    (
        app,
        agent_runner,
        share_runtime_state,
        _switcher,
        canonical_to_temporary,
        project_config_id,
        profile,
        request_session_id,
    ) = _build_deployment_app(
        tmp_path,
        share_policy=SharePolicy(
            allowRun=True,
            allowLLM=True,
            allowMultipleRuns=False,
        ),
        agent_runner=_DummyAgentRunner(start_exception=ValueError("synthetic failure")),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={"X-Share-Session-Id": request_session_id},
            json={
                "tool": "run_agent_profile",
                "arguments": {
                    "profileId": str(canonical_to_temporary[profile.id]),
                    "inputs": {"allowUnscoped": True},
                },
                "agenticContext": _build_unscoped_agentic_context(
                    canonical_to_temporary,
                    project_config_id,
                ),
            },
        )

    assert response.status_code == 500
    assert len(agent_runner.start_calls) == 1
    assert agent_runner.wait_calls == []
    assert share_runtime_state.get_session_run_count(request_session_id) == 0
    assert share_runtime_state.increment_calls == []
    assert share_runtime_state.rollback_calls == [request_session_id]
