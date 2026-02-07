import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from mcp.types import RequestParams

from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded

ensure_setta_mcp_tools_loaded()

from setta.database.db_objs import DBE
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SECTION_ID_HEADER,
)
from setta.mcp.server import SettaFastMCP
from setta.mcp.utils import convert_temporary_ids_to_canonical, convert_canonical_ids_to_temporary
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
    SettaLspDiagnosticsPayload,
    SettaProjectConfigDiagnostics,
    SettaSectionTypeErrors,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from setta.project_state.history import History


class _DummyProjectManager:
    def __init__(
        self,
        project_state_backend: ProjectStateBackend,
        diagnostics_payload: SettaLspDiagnosticsPayload,
    ) -> None:
        self.history = History(project_state_backend)
        self._diagnostics_payload = diagnostics_payload

    @property
    def project_state_backend(self) -> ProjectStateBackend:
        return self.history.get_current()

    async def get_latest_lsp_diagnostics(self, _request) -> SettaLspDiagnosticsPayload:
        return self._diagnostics_payload


class _DummyProjectManagerSwitcher:
    def __init__(self, manager: _DummyProjectManager) -> None:
        self._manager = manager

    def get(self, _project_config_id: ID, *, share_session_id: str | None = None):
        _ = share_session_id
        return self._manager


def _build_diagnostics_payload(
    *,
    project_config_id: ID,
    allowed_section_id: ID,
    blocked_section_id: ID,
) -> SettaLspDiagnosticsPayload:
    diag = SettaLspDiagnostic(
        message="error",
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(line=0, character=0),
            end=SettaLspDiagnosticPosition(line=0, character=1),
        ),
    )
    return SettaLspDiagnosticsPayload(
        projectConfigId=project_config_id,
        genCode=SettaProjectConfigDiagnostics(
            projectConfigId=project_config_id,
            isGenCode=True,
            errors={
                allowed_section_id: SettaSectionTypeErrors(callable=["ok"]),
                blocked_section_id: SettaSectionTypeErrors(callable=["nope"]),
            },
        ),
        codeSections={
            allowed_section_id: [diag],
            blocked_section_id: [diag],
        },
        unmappedGenCode=[diag],
    )


def _build_project_state() -> tuple[ProjectStateBackend, ID, ID, ID, ID]:
    settings = SettingsState()
    single = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="lsp-scope"))
    chat_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Chat,
        Position(),
    )
    allowed_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Code,
        Position(),
    )
    blocked_section_id = create_top_level_section(
        settings,
        single,
        SectionType.Code,
        Position(),
    )
    create_agentic_edge(
        single,
        AgenticEdge(
            id=ID("edge-1"),
            sourceSectionId=allowed_section_id,
            targetSectionId=chat_section_id,
            kind=AgenticEdgeKind.section_chat,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )
    backend = ProjectStateBackend(
        sections=single.sections,
        sectionImpls=single.sectionImpls,
        sectionVariants=single.sectionVariants,
        codeObjs=single.codeObjs,
        codeObjImpls=single.codeObjImpls,
        codeObjVariants=single.codeObjVariants,
        projectConfigs={single.projectConfig.id: single.projectConfig},
        defaultProjectConfigId=single.projectConfig.id,
    )
    return (
        backend,
        single.projectConfig.id,
        chat_section_id,
        allowed_section_id,
        blocked_section_id,
    )


def _ensure_temporary_project_id(dbe: DBE, project_config_id: ID) -> ID:
    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    tmp_id = convert_canonical_ids_to_temporary(
        project_config_id,
        canonical_to_temporary,
        temporary_to_canonical,
    )
    dbe.write_temporary_id_map(canonical_to_temporary)
    return tmp_id


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


@pytest.mark.asyncio
async def test_get_latest_lsp_diagnostics_filtered_by_scope_meta(tmp_path) -> None:
    dbe = DBE(tmp_path)
    backend, project_config_id, chat_section_id, allowed_section_id, blocked_section_id = (
        _build_project_state()
    )
    payload = _build_diagnostics_payload(
        project_config_id=project_config_id,
        allowed_section_id=allowed_section_id,
        blocked_section_id=blocked_section_id,
    )
    manager = _DummyProjectManager(backend, payload)
    switcher = _DummyProjectManagerSwitcher(manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

    state = type(
        "_State",
        (),
        {"project_manager_switcher": switcher, "dbe": dbe},
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

    tmp_project_id = _ensure_temporary_project_id(dbe, project_config_id)
    ctx = _build_context_with_meta(
        mcp_server=mcp_server,
        project_config_id=project_config_id,
        chat_id=ID("chat-1"),
        section_id=chat_section_id,
    )
    tool = mcp_server.get_tool("get_latest_lsp_diagnostics")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)

    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical = convert_temporary_ids_to_canonical(result, temporary_to_canonical)

    assert set(canonical.codeSections.keys()) == {allowed_section_id}
    assert set(canonical.genCode.errors.keys()) == {allowed_section_id}
    assert canonical.unmappedGenCode == []


@pytest.mark.asyncio
async def test_get_latest_lsp_diagnostics_filtered_by_scope_headers(tmp_path) -> None:
    dbe = DBE(tmp_path)
    backend, project_config_id, chat_section_id, allowed_section_id, blocked_section_id = (
        _build_project_state()
    )
    payload = _build_diagnostics_payload(
        project_config_id=project_config_id,
        allowed_section_id=allowed_section_id,
        blocked_section_id=blocked_section_id,
    )
    manager = _DummyProjectManager(backend, payload)
    switcher = _DummyProjectManagerSwitcher(manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

    state = type(
        "_State",
        (),
        {"project_manager_switcher": switcher, "dbe": dbe},
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

    tmp_project_id = _ensure_temporary_project_id(dbe, project_config_id)
    ctx = _build_context_with_headers(
        mcp_server=mcp_server,
        project_config_id=project_config_id,
        chat_id=ID("chat-1"),
        section_id=chat_section_id,
    )
    tool = mcp_server.get_tool("get_latest_lsp_diagnostics")
    assert tool is not None
    result = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)

    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical = convert_temporary_ids_to_canonical(result, temporary_to_canonical)

    assert set(canonical.codeSections.keys()) == {allowed_section_id}
    assert set(canonical.genCode.errors.keys()) == {allowed_section_id}
    assert canonical.unmappedGenCode == []
