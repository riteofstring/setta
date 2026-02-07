import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from mcp.types import CallToolResult, RequestParams

from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded

ensure_setta_mcp_tools_loaded()

from setta.database.db_objs import DBE
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SECTION_ID_HEADER,
)
from setta.mcp.server import SettaFastMCP
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
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


class _DummyProjectManager:
    def __init__(self, project_state_single: ProjectStateSingleConfig) -> None:
        self._single = project_state_single
        self.project_state_backend = ProjectStateBackend(
            sections=project_state_single.sections,
            sectionImpls=project_state_single.sectionImpls,
            sectionVariants=project_state_single.sectionVariants,
            codeObjs=project_state_single.codeObjs,
            codeObjImpls=project_state_single.codeObjImpls,
            codeObjVariants=project_state_single.codeObjVariants,
            projectConfigs={project_state_single.projectConfig.id: project_state_single.projectConfig},
            defaultProjectConfigId=project_state_single.projectConfig.id,
        )
        self.summary_calls = 0

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
    single = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="summary-scope"))
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


def _seed_temporary_ids(dbe: DBE, canonical_ids: list[ID]) -> dict[ID, ID]:
    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        canonical_ids, canonical_to_temporary, temporary_to_canonical
    )
    dbe.write_temporary_id_map(canonical_to_temporary)
    return canonical_to_temporary


def _build_context_with_meta(
    *,
    mcp_server: SettaFastMCP,
    project_config_id: ID,
    chat_id: ID,
    section_id: ID,
) -> Context:
    meta = RequestParams.Meta(
        projectConfigId=str(project_config_id),
        chatId=str(chat_id),
        sectionId=str(section_id),
    )
    request_context = RequestContext(
        request_id=1,
        meta=meta,
        session=object(),
        lifespan_context=object(),
    )
    return Context(fastmcp=mcp_server, request_context=request_context)


def _build_context_with_headers(
    *,
    mcp_server: SettaFastMCP,
    project_config_id: ID,
    chat_id: ID,
    section_id: ID,
) -> Context:
    class _DummyRequest:
        def __init__(self, headers: dict[str, str]) -> None:
            self.headers = headers

    request_context = RequestContext(
        request_id=1,
        meta=None,
        session=object(),
        lifespan_context=object(),
        request=_DummyRequest(
            headers={
                AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER: str(project_config_id),
                AGENTIC_CONTEXT_CHAT_ID_HEADER: str(chat_id),
                AGENTIC_CONTEXT_SECTION_ID_HEADER: str(section_id),
            }
        ),
    )
    return Context(fastmcp=mcp_server, request_context=request_context)


def _build_context_without_agentic_metadata(
    *,
    mcp_server: SettaFastMCP,
    session: object,
) -> Context:
    request_context = RequestContext(
        request_id=1,
        meta=None,
        session=session,
        lifespan_context=object(),
    )
    return Context(fastmcp=mcp_server, request_context=request_context)


@pytest.mark.asyncio
async def test_get_latest_project_state_summary_filtered_by_scope_meta(tmp_path) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()

    tmp_map = _seed_temporary_ids(
        dbe,
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
        ],
    )
    tmp_project_id = tmp_map[project_config_id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type("_State", (), {"project_manager_switcher": switcher, "dbe": dbe})()
    app = FastAPI()
    mcp_server = SettaFastMCP(
        app,
        state,
        "/mcp-test",
        "Test MCP Server",
        frontend_sender,
        dbe,
    )

    ctx = _build_context_with_meta(
        mcp_server=mcp_server,
        project_config_id=project_config_id,
        chat_id=ID("chat-1"),
        section_id=chat_section_id,
    )
    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    assert manager.summary_calls == 1

    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical = convert_temporary_ids_to_canonical(result, temporary_to_canonical)

    allowed_ids = {allowed_section_id, peer_chat_section_id}
    assert {entry.sectionId for entry in canonical.sections} == allowed_ids
    assert set(canonical.projectConfig.sectionVariantMap.keys()) == allowed_ids
    assert blocked_section_id not in canonical.parentSectionMap


@pytest.mark.asyncio
async def test_get_latest_project_state_summary_filtered_by_scope_headers(tmp_path) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()

    tmp_map = _seed_temporary_ids(
        dbe,
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
        ],
    )
    tmp_project_id = tmp_map[project_config_id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type("_State", (), {"project_manager_switcher": switcher, "dbe": dbe})()
    app = FastAPI()
    mcp_server = SettaFastMCP(
        app,
        state,
        "/mcp-test",
        "Test MCP Server",
        frontend_sender,
        dbe,
    )

    ctx = _build_context_with_headers(
        mcp_server=mcp_server,
        project_config_id=project_config_id,
        chat_id=ID("chat-1"),
        section_id=chat_section_id,
    )
    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    assert manager.summary_calls == 1

    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical = convert_temporary_ids_to_canonical(result, temporary_to_canonical)

    allowed_ids = {allowed_section_id, peer_chat_section_id}
    assert {entry.sectionId for entry in canonical.sections} == allowed_ids
    assert set(canonical.projectConfig.sectionVariantMap.keys()) == allowed_ids
    assert blocked_section_id not in canonical.parentSectionMap


@pytest.mark.asyncio
async def test_get_latest_project_state_summary_allows_temporary_agentic_context_headers(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()

    tmp_map = _seed_temporary_ids(
        dbe,
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
        ],
    )
    tmp_project_id = tmp_map[project_config_id]
    tmp_chat_section_id = tmp_map[chat_section_id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type("_State", (), {"project_manager_switcher": switcher, "dbe": dbe})()
    app = FastAPI()
    mcp_server = SettaFastMCP(
        app,
        state,
        "/mcp-test",
        "Test MCP Server",
        frontend_sender,
        dbe,
    )

    ctx = _build_context_with_headers(
        mcp_server=mcp_server,
        project_config_id=tmp_project_id,
        chat_id=ID("chat-1"),
        section_id=tmp_chat_section_id,
    )
    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    assert manager.summary_calls == 1

    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical = convert_temporary_ids_to_canonical(result, temporary_to_canonical)

    allowed_ids = {allowed_section_id, peer_chat_section_id}
    assert {entry.sectionId for entry in canonical.sections} == allowed_ids
    assert set(canonical.projectConfig.sectionVariantMap.keys()) == allowed_ids
    assert blocked_section_id not in canonical.parentSectionMap


@pytest.mark.asyncio
async def test_mcp_blocks_tool_calls_when_agentic_context_missing(tmp_path) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()
    tmp_map = _seed_temporary_ids(
        dbe,
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
        ],
    )
    tmp_project_id = tmp_map[project_config_id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type("_State", (), {"project_manager_switcher": switcher, "dbe": dbe})()
    app = FastAPI()
    mcp_server = SettaFastMCP(
        app,
        state,
        "/mcp-test",
        "Test MCP Server",
        frontend_sender,
        dbe,
    )

    session = type("_Session", (), {})()
    ctx = _build_context_without_agentic_metadata(mcp_server=mcp_server, session=session)
    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    assert manager.summary_calls == 0

    assert isinstance(result, CallToolResult)
    assert result.isError
    assert (
        result.structuredContent is not None
        and result.structuredContent.get("reason") == "missing_context"
    )


@pytest.mark.asyncio
async def test_set_agentic_context_allows_session_scoped_tool_calls(tmp_path) -> None:
    dbe = DBE(tmp_path)
    (
        project_state,
        project_config_id,
        chat_section_id,
        peer_chat_section_id,
        allowed_section_id,
        blocked_section_id,
    ) = _build_project_state()
    tmp_map = _seed_temporary_ids(
        dbe,
        [
            project_config_id,
            chat_section_id,
            peer_chat_section_id,
            allowed_section_id,
            blocked_section_id,
            ID("chat-1"),
        ],
    )
    tmp_project_id = tmp_map[project_config_id]
    tmp_section_id = tmp_map[chat_section_id]
    tmp_chat_id = tmp_map[ID("chat-1")]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type("_State", (), {"project_manager_switcher": switcher, "dbe": dbe})()
    app = FastAPI()
    mcp_server = SettaFastMCP(
        app,
        state,
        "/mcp-test",
        "Test MCP Server",
        frontend_sender,
        dbe,
    )

    session = type("_Session", (), {})()
    ctx = _build_context_without_agentic_metadata(mcp_server=mcp_server, session=session)

    init_tool = mcp_server.get_tool("set_agentic_context")
    assert init_tool is not None
    init_result = await init_tool.run(
        {
            "projectConfigId": str(tmp_project_id),
            "chatId": str(tmp_chat_id),
            "sectionId": str(tmp_section_id),
        },
        context=ctx,
    )
    assert init_result == {"status": "ok"}

    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    assert manager.summary_calls == 1

    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical = convert_temporary_ids_to_canonical(result, temporary_to_canonical)

    allowed_ids = {allowed_section_id, peer_chat_section_id}
    assert {entry.sectionId for entry in canonical.sections} == allowed_ids
    assert set(canonical.projectConfig.sectionVariantMap.keys()) == allowed_ids
    assert blocked_section_id not in canonical.parentSectionMap
