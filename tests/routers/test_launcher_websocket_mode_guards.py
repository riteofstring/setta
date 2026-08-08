from types import SimpleNamespace

import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.routers.websocket import (
    route_websocket_frontend,
    route_websocket_python_script,
)


def _close_code(messages: list[Message]) -> int | None:
    for message in messages:
        if message.get("type") == "websocket.close":
            return message.get("code")
    return None


async def _build_websocket(messages: list[Message]) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.disconnect", "code": 1000}

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
        "state": {},
    }
    return WebSocket(scope=scope, receive=receive, send=send)


@pytest.mark.asyncio
async def test_frontend_websocket_is_forbidden_in_launcher_mode() -> None:
    websocket_messages: list[Message] = []
    websocket = await _build_websocket(websocket_messages)
    state = SimpleNamespace(launcher_mode=True, deployment_mode=False)

    await route_websocket_frontend(websocket, state)

    assert _close_code(websocket_messages) == 4403


@pytest.mark.asyncio
async def test_python_script_websocket_is_forbidden_in_launcher_mode() -> None:
    websocket_messages: list[Message] = []
    websocket = await _build_websocket(websocket_messages)
    state = SimpleNamespace(launcher_mode=True, deployment_mode=False)

    await route_websocket_python_script(websocket, state, id="python-client")

    assert _close_code(websocket_messages) == 4403
