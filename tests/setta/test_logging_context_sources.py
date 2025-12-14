import unittest
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


class LoggingContextSourcesTests(unittest.TestCase):
    def test_build_request_context_infers_project_and_request_id(self) -> None:
        request = _make_request(
            method="post",
            path="/api/projects/alpha/load",
            path_params={"project_id": "alpha"},
        )
        context = build_request_context(request)
        self.assertEqual(context["project_id"], "alpha")
        first_request_id = context["request_id"]
        second_request_id = build_request_context(request)["request_id"]
        self.assertEqual(first_request_id, second_request_id)
        self.assertTrue(first_request_id.startswith("req-"))

    def test_build_request_context_uses_query_params_as_fallback(self) -> None:
        request = _make_request(
            method="get",
            path="/api/projects",
            query_string="projectConfigId=beta",
        )
        context = build_request_context(request)
        self.assertEqual(context["project_id"], "beta")
        self.assertEqual(ensure_request_context(request), context["request_id"])

    def test_build_websocket_context_uses_path_params(self) -> None:
        websocket = _make_websocket(
            path="/api/ws",
            path_params={"projectConfigId": "delta"},
        )
        context = build_websocket_context(websocket)
        websocket_id = context["websocket_id"]
        self.assertEqual(context["project_id"], "delta")
        self.assertTrue(websocket_id.startswith("ws-"))
        self.assertEqual(websocket_id, ensure_websocket_context(websocket))

    def test_build_background_task_context_merges_values(self) -> None:
        context = build_background_task_context(
            label="autosave",
            project_id="alpha",
            request_id="req-zeta",
            websocket_id="ws-2",
            extra_values={"section_id": "sec-9"},
        )
        self.assertEqual(
            context,
            {
                "task": "autosave",
                "project_id": "alpha",
                "request_id": "req-zeta",
                "websocket_id": "ws-2",
                "section_id": "sec-9",
            },
        )


def _make_request(
    *,
    method: str,
    path: str,
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
    path_params: dict[str, Any] | None = None,
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


if __name__ == "__main__":
    unittest.main()
