from typing import Any

import pytest

from setta.logging.context import (
    get_logging_context,
    push_logging_context,
    reset_logging_context,
)
from setta.logging.context_bindings import bind_websocket_logging_context
from setta.logging.context_sources import ensure_websocket_context
from setta.logging.tasks import spawn_background_task
from starlette.types import Scope
from starlette.websockets import WebSocket


@pytest.fixture(autouse=True)
def logging_context_scope():
    token = push_logging_context(replace=True)
    yield
    reset_logging_context(token)


@pytest.mark.asyncio
async def test_bind_websocket_logging_context_infers_metadata() -> None:
    websocket = _make_websocket(
        path="/api/ws/frontend",
    )
    expected_websocket_id = ensure_websocket_context(websocket)
    async with bind_websocket_logging_context(
        websocket,
        project_config_id="alpha",
    ):
        context = get_logging_context()
        assert context["websocket_id"] == expected_websocket_id
        assert context["project_config_id"] == "alpha"
        assert context["path"] == "/api/ws/frontend"


@pytest.mark.asyncio
async def test_spawn_background_task_sets_context() -> None:
    async def _coro() -> str:
        return get_logging_context()["task"]

    task = spawn_background_task(
        _coro(),
        label="manual-task",
        request_id="req-123",
    )
    result = await task
    assert result == "manual-task"


def _make_websocket(
    *,
    path: str,
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
    path_params: dict[str, Any] | None = None,
) -> WebSocket:
    scope: Scope = {
        "type": "websocket",
        "path": path,
        "query_string": query_string.encode() if query_string else b"",
        "scheme": "ws",
        "headers": headers or [],
        "client": ("127.0.0.1", 9100),
        "server": ("testserver", 80),
        "subprotocols": [],
        "extensions": {},
        "state": {},
        "path_params": path_params or {},
        "app": object(),
    }

    async def empty_receive() -> dict[str, Any]:
        return {
            "type": "websocket.receive",
            "bytes": b"",
            "text": "",
            "more_body": False,
        }

    async def empty_send(message: dict[str, Any]) -> None:
        return None

    return WebSocket(scope, empty_receive, empty_send)

