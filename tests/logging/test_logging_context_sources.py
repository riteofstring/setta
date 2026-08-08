from typing import Any

from setta.logging.context_sources import (
    build_background_task_context,
    build_request_context,
    build_websocket_context,
    ensure_request_context,
    ensure_websocket_context,
)
from starlette.requests import Request
from starlette.types import Scope
from starlette.websockets import WebSocket


class TestLoggingContextSources:
    def test_build_request_context_sets_request_metadata(self) -> None:
        def get_project_status() -> None:
            return None

        request = _make_request(
            method="post",
            path="/api/projects/alpha/load",
            endpoint=get_project_status,
        )
        context = build_request_context(request)
        assert context["method"] == "POST"
        assert context["path"] == "/api/projects/alpha/load"
        assert context["endpoint"] == "get_project_status"
        first_request_id = context["request_id"]
        second_request_id = build_request_context(request)["request_id"]
        assert first_request_id == second_request_id
        assert first_request_id.startswith("req-")

    def test_build_request_context_merges_extra_values(self) -> None:
        request = _make_request(
            method="get",
            path="/api/projects",
            query_string="projectConfigId=beta",
        )
        context = build_request_context(
            request,
            extra_values={"section_id": "sec-9"},
        )
        assert context["method"] == "GET"
        assert context["path"] == "/api/projects"
        assert context["section_id"] == "sec-9"
        assert ensure_request_context(request) == context["request_id"]

    def test_build_websocket_context_accepts_project_id(self) -> None:
        websocket = _make_websocket(
            path="/api/ws",
        )
        context = build_websocket_context(websocket, project_config_id="delta")
        websocket_id = context["websocket_id"]
        assert context["project_config_id"] == "delta"
        assert websocket_id.startswith("ws-")
        assert websocket_id == ensure_websocket_context(websocket)

    def test_build_background_task_context_merges_values(self) -> None:
        context = build_background_task_context(
            label="autosave",
            project_config_id="alpha",
            request_id="req-zeta",
            websocket_id="ws-2",
            extra_values={"section_id": "sec-9"},
        )
        assert context == {
            "task": "autosave",
            "project_config_id": "alpha",
            "request_id": "req-zeta",
            "websocket_id": "ws-2",
            "section_id": "sec-9",
        }


def _make_request(
    *,
    method: str,
    path: str,
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
    path_params: dict[str, Any] | None = None,
    endpoint: Any | None = None,
) -> Request:
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": method.upper(),
        "path": path,
        "root_path": "",
        "query_string": query_string.encode() if query_string else b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 8000),
        "server": ("testserver", 80),
        "path_params": path_params or {},
        "app": object(),
        "state": {},
    }
    if endpoint is not None:
        scope["endpoint"] = endpoint

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


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
        "client": ("127.0.0.1", 9000),
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

