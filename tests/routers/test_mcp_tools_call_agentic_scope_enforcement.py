import json

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from setta.database.db_objs import DBE
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SECTION_ID_HEADER,
)
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.routers.mcp_tools import router as mcp_tools_router
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.helpers_lvl3 import build_project_state_summary
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from setta.project_state.history import History

ensure_setta_mcp_tools_loaded()


class _DummyProjectManager:
    def __init__(self, project_state_single: ProjectStateSingleConfig) -> None:
        self._single = project_state_single
        backend = ProjectStateBackend(
            sections=project_state_single.sections,
            sectionImpls=project_state_single.sectionImpls,
            sectionVariants=project_state_single.sectionVariants,
            codeObjs=project_state_single.codeObjs,
            codeObjImpls=project_state_single.codeObjImpls,
            codeObjVariants=project_state_single.codeObjVariants,
            projectConfigs={
                project_state_single.projectConfig.id: project_state_single.projectConfig
            },
            defaultProjectConfigId=project_state_single.projectConfig.id,
        )
        self.history = History(backend)
        self.summary_calls = 0

    @property
    def project_state_backend(self) -> ProjectStateBackend:
        return self.history.get_current()

    async def get_latest_project_state_summary(self, _request):
        self.summary_calls += 1
        return build_project_state_summary(self._single)


class _StrictProjectManagerSwitcher:
    def __init__(self, project_config_id: ID, manager: _DummyProjectManager) -> None:
        self._project_config_id = project_config_id
        self._manager = manager
        self.main = manager

    def get(self, project_config_id: ID, *, share_session_id: str | None = None):  # noqa: ARG002
        if project_config_id != self._project_config_id:
            raise KeyError(f"Unexpected project config id: {project_config_id}")
        return self._manager


def _build_project_state() -> tuple[ProjectStateSingleConfig, ID, ID, ID, ID, ID]:
    settings = SettingsState()
    single = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="tools-call-scope"))
    chat_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Chat,
        Position(),
    )
    peer_chat_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Chat,
        Position(),
    )
    allowed_section_id = create_top_level_section(
        settings,
        single,
        SectionType.TextBlock,
        Position(),
    )
    blocked_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Dict,
        Position(),
    )
    create_agentic_edge(
        single,
        AgenticEdge(
            id=ID("edge-context"),
            sourceSectionId=allowed_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )
    create_agentic_edge(
        single,
        AgenticEdge(
            id=ID("edge-peer"),
            sourceSectionId=chat_section_id,
            targetSectionId=peer_chat_section_id,
            kind=AgenticEdgeKind.chat_chat,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )
    return (
        single,
        single.projectConfig.id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    )


async def _noop_wait_until_ready(self) -> None:  # noqa: ARG001
    return None


@pytest.mark.asyncio
async def test_tools_call_blocks_when_agentic_context_missing(tmp_path) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()

    # Seed temporary IDs so tool arguments can use temp IDs like real agent calls.
    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
        ],
        canonical_to_temporary,
        temporary_to_canonical,
    )
    dbe.write_temporary_id_map(canonical_to_temporary)
    tmp_project_id = canonical_to_temporary[project_config_id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

    state = type(
        "_State",
        (),
        {
            "project_manager_switcher": switcher,
            "dbe": dbe,
            "share_mode": False,
            "wait_until_ready": _noop_wait_until_ready,
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "get_latest_project_state_summary",
                "arguments": {"projectConfigId": str(tmp_project_id)},
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is True
    assert payload["structuredContent"]["reason"] == "missing_context"
    assert manager.summary_calls == 0


@pytest.mark.asyncio
async def test_tools_call_enforces_scope_with_agentic_context_headers(tmp_path) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()

    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
            ID("chat-1"),
        ],
        canonical_to_temporary,
        temporary_to_canonical,
    )
    dbe.write_temporary_id_map(canonical_to_temporary)
    tmp_project_id = canonical_to_temporary[project_config_id]
    tmp_chat_id = canonical_to_temporary[ID("chat-1")]
    tmp_chat_section_id = canonical_to_temporary[chat_section_id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

    state = type(
        "_State",
        (),
        {
            "project_manager_switcher": switcher,
            "dbe": dbe,
            "share_mode": False,
            "wait_until_ready": _noop_wait_until_ready,
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            headers={
                AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER: str(tmp_project_id),
                AGENTIC_CONTEXT_CHAT_ID_HEADER: str(tmp_chat_id),
                AGENTIC_CONTEXT_SECTION_ID_HEADER: str(tmp_chat_section_id),
            },
            json={
                "tool": "get_latest_project_state_summary",
                "arguments": {"projectConfigId": str(tmp_project_id)},
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is False
    assert manager.summary_calls == 1

    content = payload.get("content") or []
    assert isinstance(content, list) and content, "Expected text content in tool result."
    summary_text = content[0].get("text")
    assert isinstance(summary_text, str) and summary_text.strip()
    summary = json.loads(summary_text)

    allowed_ids = {
        str(canonical_to_temporary[allowed_section_id]),
        str(canonical_to_temporary[peer_chat_section_id]),
    }
    assert {entry["sectionId"] for entry in summary["sections"]} == allowed_ids
    assert set(summary["projectConfig"]["sectionVariantMap"].keys()) == allowed_ids
    assert str(canonical_to_temporary[blocked_section_id]) not in summary["parentSectionMap"]
