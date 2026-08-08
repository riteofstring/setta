from typing import Any

from fastapi import Request

from setta.middleware import auth as auth_middleware
from setta.utils import constants


def _make_request(
    *,
    headers: list[tuple[bytes, bytes]] | None = None,
    client_host: str = "127.0.0.1",
) -> Request:
    scope: dict[str, Any] = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": "GET",
        "path": "/",
        "root_path": "",
        "query_string": b"",
        "headers": headers or [],
        "client": (client_host, 8000),
        "server": ("testserver", 80),
        "path_params": {},
        "app": object(),
        "state": {},
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


def _force_dev_mode(monkeypatch) -> None:
    monkeypatch.setattr(auth_middleware, "IS_DEV_MODE", True)
    monkeypatch.setattr(constants, "IS_DEV_MODE", True)
    monkeypatch.setattr(constants.C, "HOST", "127.0.0.1")
    monkeypatch.setattr(constants.C, "DEV_MODE_FRONTEND_PORT", 3000)


def test_dev_auto_auth_allows_referer_even_with_untrusted_origin(monkeypatch):
    _force_dev_mode(monkeypatch)
    allowed_origin = (
        f"http://{constants.C.HOST}:{constants.C.DEV_MODE_FRONTEND_PORT}"
    )
    request = _make_request(
        headers=[
            (b"origin", b"http://evil.local"),
            (b"referer", f"{allowed_origin}/path".encode()),
        ]
    )
    assert auth_middleware._should_auto_auth_dev_request(
        request,
        session_id="session-1",
    )


def test_dev_auto_auth_accepts_allowed_origin(monkeypatch):
    _force_dev_mode(monkeypatch)
    allowed_origin = (
        f"http://{constants.C.HOST}:{constants.C.DEV_MODE_FRONTEND_PORT}"
    )
    request = _make_request(headers=[(b"origin", allowed_origin.encode())])
    assert auth_middleware._should_auto_auth_dev_request(
        request,
        session_id="session-1",
    )


def test_dev_auto_auth_falls_back_to_referer_when_origin_missing(monkeypatch):
    _force_dev_mode(monkeypatch)
    allowed_origin = (
        f"http://{constants.C.HOST}:{constants.C.DEV_MODE_FRONTEND_PORT}"
    )
    request = _make_request(
        headers=[(b"referer", f"{allowed_origin}/path".encode())]
    )
    assert auth_middleware._should_auto_auth_dev_request(
        request,
        session_id="session-1",
    )
