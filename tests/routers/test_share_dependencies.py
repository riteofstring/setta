import unittest
from typing import Any

from fastapi import Request, WebSocket
from starlette.types import Scope

from setta.routers.dependencies import (
    get_share_session_id_from_request,
    get_share_session_id_from_websocket,
)


def _make_request(
    *,
    path: str = "/share",
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
) -> Request:
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": "GET",
        "path": path,
        "root_path": "",
        "query_string": query_string.encode() if query_string else b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 8000),
        "server": ("testserver", 80),
        "path_params": {},
        "app": object(),
        "state": {},
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


def _make_websocket(
    *,
    path: str = "/share",
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
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
        "path_params": {},
        "app": object(),
    }

    async def empty_receive() -> dict[str, Any]:
        return {
            "type": "websocket.receive",
            "bytes": b"",
            "text": "",
            "more_body": False,
        }

    async def empty_send(_message: dict[str, Any]) -> None:
        return None

    return WebSocket(scope, empty_receive, empty_send)


class ShareDependencyTests(unittest.TestCase):
    def test_request_header_precedence(self) -> None:
        request = _make_request(
            headers=[
                (b"x-share-session-id", b"header"),
                (b"cookie", b"shareSessionId=cookie"),
            ],
            query_string="shareSessionId=query",
        )
        self.assertEqual("header", get_share_session_id_from_request(request))

    def test_request_cookie_fallback(self) -> None:
        request = _make_request(
            headers=[(b"cookie", b"shareSessionId=cookie")],
            query_string="shareSessionId=query",
        )
        self.assertEqual("cookie", get_share_session_id_from_request(request))

    def test_request_query_fallback(self) -> None:
        request = _make_request(query_string="shareSessionId=query")
        self.assertEqual("query", get_share_session_id_from_request(request))

    def test_request_missing_session_id_raises(self) -> None:
        request = _make_request()
        with self.assertRaises(KeyError):
            get_share_session_id_from_request(request)

    def test_websocket_header_precedence(self) -> None:
        websocket = _make_websocket(
            headers=[
                (b"x-share-session-id", b"header"),
                (b"cookie", b"shareSessionId=cookie"),
            ],
            query_string="shareSessionId=query",
        )
        self.assertEqual("header", get_share_session_id_from_websocket(websocket))

    def test_websocket_cookie_fallback(self) -> None:
        websocket = _make_websocket(
            headers=[(b"cookie", b"shareSessionId=cookie")],
            query_string="shareSessionId=query",
        )
        self.assertEqual("cookie", get_share_session_id_from_websocket(websocket))

    def test_websocket_query_fallback(self) -> None:
        websocket = _make_websocket(query_string="shareSessionId=query")
        self.assertEqual("query", get_share_session_id_from_websocket(websocket))

    def test_websocket_missing_session_id_raises(self) -> None:
        websocket = _make_websocket()
        with self.assertRaises(KeyError):
            get_share_session_id_from_websocket(websocket)


if __name__ == "__main__":
    unittest.main()
