import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from mcp.types import RequestParams

from setta.database.db_objs import DBE
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.utils import (
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.project_state.history import History
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    convert_backend_to_single_config,
)
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

ensure_setta_mcp_tools_loaded()


class _DummyProjectManager:
    def __init__(self, project_state_single: ProjectStateSingleConfig) -> None:
        self._project_config_id = project_state_single.projectConfig.id
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
            projectChatWindowingByProjectConfigId={
                project_state_single.projectConfig.id: project_state_single.projectChatWindowing
            },
            defaultProjectConfigId=project_state_single.projectConfig.id,
        )
        self.history = History(backend)

    @property
    def project_state_backend(self) -> ProjectStateBackend:
        return self.history.get_current()

    async def get_latest_project_state_summary(self, _request):
        single = convert_backend_to_single_config(
            self.project_state_backend,
            self._project_config_id,
        )
        return build_project_state_summary(single)


class _StrictProjectManagerSwitcher:
    def __init__(self, project_config_id: ID, manager: _DummyProjectManager) -> None:
        self._project_config_id = project_config_id
        self._manager = manager
        self.main = manager

    def get(self, project_config_id: ID, *, share_session_id: str | None = None):  # noqa: ARG002
        if project_config_id != self._project_config_id:
            raise KeyError(f"Unexpected project config id: {project_config_id}")
        return self._manager


class _Session:
    pass


def _build_project_state() -> tuple[ProjectStateSingleConfig, ID, ID, ID, ID, ID]:
    settings = SettingsState()
    single = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="scope-cache"))
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
        ),
    )
    create_agentic_edge(
        single,
        AgenticEdge(
            id=ID("edge-peer"),
            sourceSectionId=chat_section_id,
            targetSectionId=peer_chat_section_id,
            kind=AgenticEdgeKind.chat_chat,
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
    session: object,
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
        session=session,
        lifespan_context=object(),
    )
    return Context(fastmcp=mcp_server, request_context=request_context)


@pytest.mark.asyncio
async def test_mcp_agentic_scope_cache_invalidates_on_history_coalesce(tmp_path) -> None:
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
    # Prime coalescing state so the next add_current_copy returns the existing
    # backend object (mutated in place).
    manager.history.add_current_copy(coalesce_key="agenticEdges", coalesce_window_s=60)

    switcher = _StrictProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type(
        "_State",
        (),
        {
            "project_manager_switcher": switcher,
            "dbe": dbe,
            "deployment_mode": False,
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

    session = _Session()
    ctx = _build_context_with_meta(
        mcp_server=mcp_server,
        session=session,
        project_config_id=project_config_id,
        chat_id=ID("chat-1"),
        section_id=chat_section_id,
    )
    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None

    first_backend_id = id(manager.project_state_backend)
    result1 = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical1 = convert_temporary_ids_to_canonical(result1, temporary_to_canonical)
    assert {entry.sectionId for entry in canonical1.sections} == {
        allowed_section_id,
        peer_chat_section_id,
    }

    # Coalesce a new history entry (no new object), then mutate edges in place to
    # grant access to the previously blocked section.
    manager.history.add_current_copy(coalesce_key="agenticEdges", coalesce_window_s=60)
    assert id(manager.project_state_backend) == first_backend_id
    backend = manager.project_state_backend
    backend.projectConfigs[project_config_id].agenticEdges.append(
        AgenticEdge(
            id=ID("edge-write"),
            sourceSectionId=chat_section_id,
            targetSectionId=blocked_section_id,
            kind=AgenticEdgeKind.chat_section,
        )
    )

    result2 = await tool.run({"projectConfigId": str(tmp_project_id)}, context=ctx)
    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    canonical2 = convert_temporary_ids_to_canonical(result2, temporary_to_canonical)
    assert {entry.sectionId for entry in canonical2.sections} == {
        allowed_section_id,
        peer_chat_section_id,
        blocked_section_id,
    }


@pytest.mark.asyncio
async def test_mcp_agentic_scope_cache_does_not_clear_all_entries_when_full(
    tmp_path,
) -> None:
    dbe = DBE(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="scope-cache-eviction")
    )

    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    chat_section_ids: list[ID] = []
    for idx in range(9):
        chat_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(x=idx * 10, y=0),
        )
        chat_section_ids.append(chat_section_id)
        create_agentic_edge(
            project_state,
            AgenticEdge(
                id=ID(f"edge-context-{idx}"),
                sourceSectionId=context_section_id,
                targetSectionId=chat_section_id,
                kind=AgenticEdgeKind.section_chat,
            ),
        )

    tmp_map = _seed_temporary_ids(
        dbe,
        [project_state.projectConfig.id, context_section_id, *chat_section_ids],
    )
    tmp_project_id = tmp_map[project_state.projectConfig.id]

    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_state.projectConfig.id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    state = type(
        "_State",
        (),
        {
            "project_manager_switcher": switcher,
            "dbe": dbe,
            "deployment_mode": False,
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
    tool = mcp_server.get_tool("get_latest_project_state_summary")
    assert tool is not None

    session = _Session()
    for idx, chat_section_id in enumerate(chat_section_ids):
        ctx = _build_context_with_meta(
            mcp_server=mcp_server,
            session=session,
            project_config_id=project_state.projectConfig.id,
            chat_id=ID(f"chat-{idx}"),
            section_id=chat_section_id,
        )
        await tool.run(
            {"projectConfigId": str(tmp_project_id)},
            context=ctx,
        )

    scope_cache = mcp_server._agentic_scope_cache_by_session.get(session)
    assert scope_cache is not None
    assert len(scope_cache) == len(chat_section_ids)
