import json

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mcp.server.fastmcp.exceptions import ToolError

from setta.database.db_objs import DBE
from setta.mcp.agentic_context_headers import (
    AGENTIC_CONTEXT_CHAT_ID_HEADER,
    AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER,
    AGENTIC_CONTEXT_SECTION_ID_HEADER,
)
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.ui_settings_context import (
    resolve_frontend_websocket_id_from_ctx,
    resolve_project_config_id_from_ctx,
)
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


class _ShareSessionRecordingProjectManagerSwitcher:
    def __init__(self, project_config_id: ID, manager: _DummyProjectManager) -> None:
        self._project_config_id = project_config_id
        self._manager = manager
        self.main = manager
        self.calls: list[tuple[ID, str | None]] = []

    def get(self, project_config_id: ID, *, share_session_id: str | None = None):
        self.calls.append((project_config_id, share_session_id))
        if project_config_id != self._project_config_id:
            raise KeyError(f"Unexpected project config id: {project_config_id}")
        return self._manager


def _build_project_state() -> tuple[ProjectStateSingleConfig, ID, ID, ID, ID, ID]:
    settings = SettingsState()
    single = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="tools-call-scope")
    )
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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
    assert manager.summary_calls == 0

    content = payload.get("content") or []
    assert isinstance(content, list) and content, (
        "Expected text content in tool result."
    )
    summary_text = content[0].get("text")
    assert isinstance(summary_text, str) and summary_text.strip()
    summary = json.loads(summary_text)

    allowed_ids = {
        str(canonical_to_temporary[allowed_section_id]),
        str(canonical_to_temporary[peer_chat_section_id]),
    }
    assert {entry["sectionId"] for entry in summary["sections"]} == allowed_ids
    assert set(summary["projectConfig"]["sectionVariantMap"].keys()) == allowed_ids
    assert (
        str(canonical_to_temporary[blocked_section_id])
        not in summary["parentSectionMap"]
    )


@pytest.mark.asyncio
async def test_tools_call_enforces_scope_with_agentic_context_body(tmp_path) -> None:
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(tmp_chat_id),
                    "sectionId": str(tmp_chat_section_id),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is False
    assert manager.summary_calls == 0

    content = payload.get("content") or []
    assert isinstance(content, list) and content, (
        "Expected text content in tool result."
    )
    summary_text = content[0].get("text")
    assert isinstance(summary_text, str) and summary_text.strip()
    summary = json.loads(summary_text)

    allowed_ids = {
        str(canonical_to_temporary[allowed_section_id]),
        str(canonical_to_temporary[peer_chat_section_id]),
    }
    assert {entry["sectionId"] for entry in summary["sections"]} == allowed_ids
    assert set(summary["projectConfig"]["sectionVariantMap"].keys()) == allowed_ids
    assert (
        str(canonical_to_temporary[blocked_section_id])
        not in summary["parentSectionMap"]
    )


@pytest.mark.asyncio
async def test_tools_call_ignores_agentic_share_session_id_in_ide_mode(
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
    switcher = _ShareSessionRecordingProjectManagerSwitcher(project_config_id, manager)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

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
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(tmp_chat_id),
                    "sectionId": str(tmp_chat_section_id),
                    "allowUnscoped": True,
                    "shareSessionId": "caller-supplied-share",
                },
            },
        )

    assert response.status_code == 200
    assert switcher.calls
    for _, share_session_id in switcher.calls:
        assert share_session_id is None


@pytest.mark.asyncio
async def test_tools_call_rejects_ui_setting_project_argument_mismatch(
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

    mismatched_project_config_id = ID("project-mismatch")
    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    _ = convert_canonical_ids_to_temporary(
        [
            project_config_id,
            mismatched_project_config_id,
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
    tmp_mismatched_project_id = canonical_to_temporary[mismatched_project_config_id]
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
            "deployment_mode": False,
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
                "tool": "get_ui_setting_value",
                "arguments": {
                    "settingId": "core.watch_code.enabled",
                    "projectConfigId": str(tmp_mismatched_project_id),
                },
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "chatId": str(tmp_chat_id),
                    "sectionId": str(tmp_chat_section_id),
                    "allowUnscoped": True,
                },
            },
        )

    assert response.status_code == 422
    payload = response.json()
    assert payload["detail"]["error"] == "InvalidToolArguments"
    assert "projectConfigId argument" in payload["detail"]["message"]
    assert (
        "does not match agentic context projectConfigId" in payload["detail"]["message"]
    )


@pytest.mark.asyncio
async def test_tools_call_returns_500_for_internal_tool_value_error(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
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
            "deployment_mode": False,
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

    class _InternalFailureTool:
        async def run(
            self,
            _arguments,
            *,
            context,  # noqa: ARG002
            convert_result,  # noqa: ARG002
        ):
            try:
                raise ValueError("internal invariant failure")
            except ValueError as exc:
                raise ToolError("internal tool failure") from exc

    original_get_tool = state.mcp_server.get_tool

    def _patched_get_tool(name: str):
        if name == "internal_value_error_tool":
            return _InternalFailureTool()
        return original_get_tool(name)

    monkeypatch.setattr(state.mcp_server, "get_tool", _patched_get_tool)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "internal_value_error_tool",
                "arguments": {},
            },
        )

    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"]["error"] == "ToolError"
    assert "internal tool failure" in payload["detail"]["message"]


@pytest.mark.asyncio
async def test_tools_call_returns_422_for_invalid_tool_arguments(tmp_path) -> None:
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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
    non_utf8_file = tmp_path / "non_utf8.dat"
    non_utf8_file.write_bytes(b"\xff\xfe\xfa")

    agentic_context = {
        "projectConfigId": str(tmp_project_id),
        "allowUnscoped": True,
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        blank_query_response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "search_ui_settings",
                "arguments": {
                    "query": "   ",
                    "projectConfigId": str(tmp_project_id),
                },
                "agenticContext": agentic_context,
            },
        )
        tokenless_query_response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "search_mcp_tools",
                "arguments": {"query": "!!!"},
                "agenticContext": agentic_context,
            },
        )
        outside_workspace_response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "read_file_range",
                "arguments": {"path": "../outside.txt"},
                "agenticContext": agentic_context,
            },
        )
        non_utf8_read_response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "read_file_range",
                "arguments": {
                    "path": str(non_utf8_file),
                    "workspace_root": str(tmp_path),
                },
                "agenticContext": agentic_context,
            },
        )
        malformed_stream_patch_response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "stream_app_definition",
                "arguments": {
                    "patches": '{"op":"set","path":"/elements/missing/props/title","value":"Hello"}',
                    "baseAppSpec": {},
                },
                "agenticContext": agentic_context,
            },
        )

    assert blank_query_response.status_code == 422
    blank_payload = blank_query_response.json()
    assert blank_payload["detail"]["error"] == "InvalidToolArguments"
    assert "query must not be empty" in blank_payload["detail"]["message"]

    assert tokenless_query_response.status_code == 422
    tokenless_payload = tokenless_query_response.json()
    assert tokenless_payload["detail"]["error"] == "InvalidToolArguments"
    assert "searchable token" in tokenless_payload["detail"]["message"]

    assert outside_workspace_response.status_code == 422
    outside_payload = outside_workspace_response.json()
    assert outside_payload["detail"]["error"] == "InvalidToolArguments"
    assert "within the project root" in outside_payload["detail"]["message"]

    assert non_utf8_read_response.status_code == 422
    non_utf8_payload = non_utf8_read_response.json()
    assert non_utf8_payload["detail"]["error"] == "InvalidToolArguments"
    assert "not UTF-8 encoded" in non_utf8_payload["detail"]["message"]

    assert malformed_stream_patch_response.status_code == 422
    malformed_stream_patch_payload = malformed_stream_patch_response.json()
    assert malformed_stream_patch_payload["detail"]["error"] == "InvalidToolArguments"
    assert (
        "Invalid patches payload" in malformed_stream_patch_payload["detail"]["message"]
    )


@pytest.mark.asyncio
async def test_tools_call_rejects_whitespace_only_frontend_affinity_token(
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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
                "tool": "search_mcp_tools",
                "arguments": {"query": "setting"},
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "frontendAffinityToken": "   ",
                    "allowUnscoped": True,
                },
            },
        )

    assert response.status_code == 422
    payload = response.json()
    detail = payload.get("detail")
    assert isinstance(detail, list) and detail
    first_error = detail[0]
    assert first_error["loc"] == ["body", "agenticContext", "frontendAffinityToken"]
    assert "frontendAffinityToken must be a non-empty string" in first_error["msg"]


@pytest.mark.asyncio
async def test_tools_call_trims_frontend_affinity_token_in_agentic_context(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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

    class _CaptureFrontendWebsocketIdTool:
        async def run(
            self,
            _arguments,
            *,
            context,
            convert_result,  # noqa: ARG002
        ):
            meta = context.request_context.meta
            if meta is None:
                raise AssertionError("Expected agentic context metadata.")
            return ([], {"frontendAffinityToken": meta.frontendAffinityToken})

    original_get_tool = state.mcp_server.get_tool

    def _patched_get_tool(name: str):
        if name == "capture_frontend_affinity_token":
            return _CaptureFrontendWebsocketIdTool()
        return original_get_tool(name)

    monkeypatch.setattr(state.mcp_server, "get_tool", _patched_get_tool)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "capture_frontend_affinity_token",
                "arguments": {},
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "frontendAffinityToken": "  frontend-trimmed  ",
                    "allowUnscoped": True,
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["isError"] is False
    assert payload["structuredContent"]["frontendAffinityToken"] == "frontend-trimmed"


@pytest.mark.asyncio
async def test_tools_call_rejects_malformed_agentic_context_without_scope_fallback(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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

    def _raise_type_error(_ctx) -> object:
        raise TypeError("allowUnscoped must be a boolean")

    monkeypatch.setattr(state.mcp_server, "_resolve_agentic_context", _raise_type_error)

    class _ResolveProjectConfigTool:
        async def run(
            self,
            _arguments,
            *,
            context,
            convert_result,  # noqa: ARG002
        ):
            resolved_project_config_id = resolve_project_config_id_from_ctx(
                ctx=context,
                project_config_id=None,
            )
            return ([], {"projectConfigId": str(resolved_project_config_id)})

    original_get_tool = state.mcp_server.get_tool

    def _patched_get_tool(name: str):
        if name == "resolve_project_config":
            return _ResolveProjectConfigTool()
        return original_get_tool(name)

    monkeypatch.setattr(state.mcp_server, "get_tool", _patched_get_tool)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "resolve_project_config",
                "arguments": {},
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "allowUnscoped": True,
                },
            },
        )

    assert response.status_code == 422
    payload = response.json()
    detail = payload.get("detail")
    assert isinstance(detail, dict)
    assert detail["error"] == "InvalidToolArguments"
    assert detail["message"] == "allowUnscoped must be a boolean"


@pytest.mark.asyncio
async def test_tools_call_rejects_frontend_websocket_id_passed_as_affinity_token(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
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
            "deployment_mode": False,
            "wmh_frontend_sender": frontend_sender,
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

    monkeypatch.setattr(
        frontend_sender,
        "list_frontend_websocket_ids_for_ui_setting_reveal",
        lambda *, share_session_id=None: ["frontend-raw-id"],  # noqa: ARG005
    )
    monkeypatch.setattr(
        frontend_sender,
        "resolve_frontend_websocket_id_from_affinity_token",
        lambda *, affinity_token, share_session_id=None: None,  # noqa: ARG005
    )

    class _ResolveFrontendAffinityTool:
        async def run(
            self,
            _arguments,
            *,
            context,
            convert_result,  # noqa: ARG002
        ):
            resolved_frontend_websocket_id = resolve_frontend_websocket_id_from_ctx(
                context
            )
            return ([], {"frontendAffinityToken": resolved_frontend_websocket_id})

    original_get_tool = state.mcp_server.get_tool

    def _patched_get_tool(name: str):
        if name == "resolve_frontend_affinity":
            return _ResolveFrontendAffinityTool()
        return original_get_tool(name)

    monkeypatch.setattr(state.mcp_server, "get_tool", _patched_get_tool)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/__setta__/tools/call",
            json={
                "tool": "resolve_frontend_affinity",
                "arguments": {},
                "agenticContext": {
                    "projectConfigId": str(tmp_project_id),
                    "frontendAffinityToken": "frontend-raw-id",
                    "allowUnscoped": True,
                },
            },
        )

    assert response.status_code == 422
    payload = response.json()
    detail = payload.get("detail")
    assert isinstance(detail, dict)
    assert detail["error"] == "InvalidToolArguments"
    assert "not a websocket id" in detail["message"]
