from starlette.requests import Request

from setta.middleware import auth as auth_middleware
from setta.utils import constants


def build_request(headers: dict[str, str], client_host: str) -> Request:
    raw_headers = [(key.encode(), value.encode()) for key, value in headers.items()]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "GET",
        "path": "/api/secure",
        "raw_path": b"/api/secure",
        "headers": raw_headers,
        "client": (client_host, 1234),
        "server": ("127.0.0.1", 8000),
        "scheme": "http",
        "query_string": b"",
    }
    return Request(scope)


def enable_dev_mode(monkeypatch) -> None:
    monkeypatch.setattr(constants, "IS_DEV_MODE", "1")
    monkeypatch.setattr(auth_middleware, "IS_DEV_MODE", "1")


def disable_dev_mode(monkeypatch) -> None:
    monkeypatch.setattr(constants, "IS_DEV_MODE", None)
    monkeypatch.setattr(auth_middleware, "IS_DEV_MODE", None)


def test_auto_auth_allows_origin_in_dev_mode(monkeypatch) -> None:
    enable_dev_mode(monkeypatch)
    origin = constants.C.FRONTEND_ORIGINS[0]
    request = build_request({"origin": origin}, "127.0.0.1")

    assert auth_middleware._should_auto_auth_dev_request(request) is True


def test_auto_auth_allows_referer_in_dev_mode(monkeypatch) -> None:
    enable_dev_mode(monkeypatch)
    origin = constants.C.FRONTEND_ORIGINS[0]
    request = build_request({"referer": f"{origin}/chat"}, "127.0.0.1")

    assert auth_middleware._should_auto_auth_dev_request(request) is True


def test_auto_auth_rejects_non_local_client(monkeypatch) -> None:
    enable_dev_mode(monkeypatch)
    origin = constants.C.FRONTEND_ORIGINS[0]
    request = build_request({"origin": origin}, "10.0.0.5")

    assert auth_middleware._should_auto_auth_dev_request(request) is False


def test_auto_auth_rejects_when_not_dev_mode(monkeypatch) -> None:
    disable_dev_mode(monkeypatch)
    origin = constants.C.FRONTEND_ORIGINS[0]
    request = build_request({"origin": origin}, "127.0.0.1")

    assert auth_middleware._should_auto_auth_dev_request(request) is False
