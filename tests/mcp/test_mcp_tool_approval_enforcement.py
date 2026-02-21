import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from mcp.types import CallToolResult

from setta.database.db_objs import DBE
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER,
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SETTA_TOOL_APPROVAL_POLICY_HEADER,
)
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.project_state.history import History
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

ensure_setta_mcp_tools_loaded()


class _DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = headers


class _DummyProjectManager:
    def __init__(self, project_state_single: ProjectStateSingleConfig) -> None:
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
        self.delete_calls = 0

    @property
    def project_state_backend(self) -> ProjectStateBackend:
        return self.history.get_current()

    async def delete_sections(self, request) -> dict[str, int]:
        self.delete_calls += 1
        return {"deletedSectionCount": len(request.sectionIds)}


class _StrictProjectManagerSwitcher:
    def __init__(self, project_config_id: ID, manager: _DummyProjectManager) -> None:
        self._project_config_id = project_config_id
        self._manager = manager
        self.main = manager

    def get(self, project_config_id: ID, *, share_session_id: str | None = None):  # noqa: ARG002
        if project_config_id != self._project_config_id:
            raise KeyError(f"Unexpected project config id: {project_config_id}")
        return self._manager


def _build_context_with_headers(
    *,
    mcp_server: SettaFastMCP,
    project_config_id: ID,
    policy: str,
) -> Context:
    headers: dict[str, str] = {
        AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER: str(project_config_id),
        AGENTIC_CONTEXT_CHAT_ID_HEADER: "chat-1",
        AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER: "true",
        AGENTIC_CONTEXT_SETTA_TOOL_APPROVAL_POLICY_HEADER: policy,
    }
    request_context = RequestContext(
        request_id=1,
        meta=None,
        session=object(),
        lifespan_context=object(),
        request=_DummyRequest(headers=headers),
    )
    return Context(fastmcp=mcp_server, request_context=request_context)


def _build_project_state() -> tuple[ProjectStateSingleConfig, ID]:
    settings = SettingsState()
    single = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="tool-approval-enforcement")
    )
    target_section_id = create_top_level_section(
        settings,
        single,
        SectionType.TextBlock,
        Position(),
    )
    return single, target_section_id


def _seed_temporary_ids(dbe: DBE, canonical_ids: list[ID]) -> dict[ID, ID]:
    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        canonical_ids,
        canonical_to_temporary,
        temporary_to_canonical,
    )
    dbe.write_temporary_id_map(canonical_to_temporary)
    return canonical_to_temporary


@pytest.mark.asyncio
async def test_delete_sections_blocked_by_setta_tool_approval_policy(tmp_path) -> None:
    dbe = DBE(tmp_path)
    project_state, target_section_id = _build_project_state()
    tmp_map = _seed_temporary_ids(
        dbe,
        [project_state.projectConfig.id, target_section_id],
    )
    tmp_project_config_id = tmp_map[project_state.projectConfig.id]
    tmp_target_section_id = tmp_map[target_section_id]
    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_state.projectConfig.id, manager)
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
        project_config_id=tmp_project_config_id,
        policy="deny_destructive_without_approval_channel",
    )
    tool = mcp_server.get_tool("delete_sections")
    assert tool is not None
    result = await tool.run(
        {
            "projectConfigId": str(tmp_project_config_id),
            "sectionIds": [str(tmp_target_section_id)],
        },
        context=ctx,
    )

    assert isinstance(result, CallToolResult)
    assert result.isError
    assert manager.delete_calls == 0
    structured = result.structuredContent
    assert isinstance(structured, dict)
    assert structured.get("error") == "ApprovalRequired"
    assert structured.get("reason") == "approval_channel_unavailable"


@pytest.mark.asyncio
async def test_delete_sections_allowed_with_allow_all_policy(tmp_path) -> None:
    dbe = DBE(tmp_path)
    project_state, target_section_id = _build_project_state()
    tmp_map = _seed_temporary_ids(
        dbe,
        [project_state.projectConfig.id, target_section_id],
    )
    tmp_project_config_id = tmp_map[project_state.projectConfig.id]
    tmp_target_section_id = tmp_map[target_section_id]
    manager = _DummyProjectManager(project_state)
    switcher = _StrictProjectManagerSwitcher(project_state.projectConfig.id, manager)
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
        project_config_id=tmp_project_config_id,
        policy="allow_all",
    )
    tool = mcp_server.get_tool("delete_sections")
    assert tool is not None
    result = await tool.run(
        {
            "projectConfigId": str(tmp_project_config_id),
            "sectionIds": [str(tmp_target_section_id)],
        },
        context=ctx,
    )

    assert result == {"deletedSectionCount": 1}
    assert manager.delete_calls == 1
