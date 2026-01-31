import json

import pytest
from setta.project_state.lsp_diagnostics_state import ProjectLspDiagnosticsState
from setta.types.id import ID
from setta.types.lsp import (
    SettaLspDiagnostic,
    SettaLspDiagnosticPosition,
    SettaLspDiagnosticRange,
    SettaProjectConfigDiagnostics,
    SettaSectionTypeErrors,
)
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from starlette.types import Message, Scope
from starlette.websockets import WebSocket


async def _build_websocket(messages: list[Message]) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "scheme": "ws",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 0),
        "server": ("testserver", 80),
        "subprotocols": [],
    }
    return WebSocket(scope=scope, receive=receive, send=send)


def _build_diagnostic(message: str) -> SettaLspDiagnostic:
    return SettaLspDiagnostic(
        message=message,
        severity=1,
        code="reportFoo",
        source="pyright",
        range=SettaLspDiagnosticRange(
            start=SettaLspDiagnosticPosition(line=0, character=0),
            end=SettaLspDiagnosticPosition(line=0, character=5),
        ),
        uri="file:///tmp/example.py",
    )


def _lsp_payloads(messages: list[Message]) -> list[dict]:
    payloads: list[dict] = []
    for message in messages:
        if message.get("type") != "websocket.send" or "text" not in message:
            continue
        payload = json.loads(message["text"])
        if payload.get("messageType") == "LSPDiagnostics":
            payloads.append(payload)
    return payloads


async def _build_diagnostics_state(
    project_config_id: ID,
) -> tuple[ProjectLspDiagnosticsState, list[Message]]:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager)
    messages: list[Message] = []
    websocket = await _build_websocket(messages)
    await websocket.accept()
    websocket_id = f"lsp-diagnostics-{project_config_id}"
    websocket_manager.sockets[websocket_id] = WebsocketConnectionInfoWithSocket(
        id=websocket_id,
        connectionType=WebsocketConnectionType.FRONTEND,
        currentAddress=None,
        websocket=websocket,
    )
    diagnostics_state = ProjectLspDiagnosticsState(
        project_config_id=project_config_id,
        websocket_msg_handler=frontend_sender,
    )
    return diagnostics_state, messages


@pytest.mark.asyncio
async def test_update_gen_code_skips_duplicate_broadcast() -> None:
    project_config_id = ID("project-1")
    diagnostics_state, messages = await _build_diagnostics_state(project_config_id)
    diagnostic = _build_diagnostic("Bad code")
    gen_code = SettaProjectConfigDiagnostics(
        projectConfigId=project_config_id,
        errors={
            ID("section-1"): SettaSectionTypeErrors(callable=["Bad code"]),
        },
        isGenCode=True,
    )

    await diagnostics_state.update_gen_code(gen_code, [diagnostic])
    assert len(_lsp_payloads(messages)) == 1

    await diagnostics_state.update_gen_code(gen_code, [diagnostic])
    assert len(_lsp_payloads(messages)) == 1


@pytest.mark.asyncio
async def test_update_code_section_skips_duplicate_broadcast() -> None:
    project_config_id = ID("project-1")
    diagnostics_state, messages = await _build_diagnostics_state(project_config_id)
    diagnostic = _build_diagnostic("Bad code")
    section_id = ID("section-1")

    await diagnostics_state.update_code_section(section_id, [diagnostic])
    assert len(_lsp_payloads(messages)) == 1

    await diagnostics_state.update_code_section(section_id, [diagnostic])
    assert len(_lsp_payloads(messages)) == 1
