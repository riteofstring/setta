import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.auth import session as auth_session
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.middleware import AuthMiddleware
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.utils.constants import C


@pytest.fixture
def auth_env(tmp_path, monkeypatch):
    original_metadata = auth_session._cached_metadata
    original_secret = auth_session._cached_secret
    original_sessions_root = auth_session._cached_sessions_root
    auth_session._clear_cached_session()

    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)
    monkeypatch.delenv(SESSIONS_ROOT_ENV_VAR, raising=False)

    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    secret = registry.load_secret(session)
    monkeypatch.setenv(SESSION_ID_ENV_VAR, session.id)
    monkeypatch.setenv(SESSIONS_ROOT_ENV_VAR, str(sessions_root))

    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.get("/api/secure")
    async def secure_endpoint() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/secure")
    async def secure_non_api_endpoint() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app)
    try:
        yield session, secret, client
    finally:
        client.close()
        auth_session._cached_metadata = original_metadata
        auth_session._cached_secret = original_secret
        auth_session._cached_sessions_root = original_sessions_root


def test_auth_cookie_refreshes_near_expiry(auth_env) -> None:
    session, secret, client = auth_env
    seconds_until_exp = max(1, C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS - 30)
    issued_at = datetime.now(timezone.utc) - timedelta(
        seconds=C.AUTH_COOKIE_MAX_AGE_SECONDS - seconds_until_exp
    )
    old_token = AUTH_COOKIE_MANAGER.mint(session.id, secret, now=issued_at)

    client.cookies.set(C.AUTH_COOKIE_NAME, old_token)
    response = client.get("/api/secure")

    assert response.status_code == 200
    cookie_header = response.headers.get("set-cookie", "")
    assert f"{C.AUTH_COOKIE_NAME}=" in cookie_header
    new_token = response.cookies.get(C.AUTH_COOKIE_NAME)
    assert new_token is not None

    old_payload = AUTH_COOKIE_MANAGER.validate(old_token, secret)
    new_payload = AUTH_COOKIE_MANAGER.validate(new_token, secret)
    assert new_payload.exp > old_payload.exp


def test_auth_cookie_not_refreshed_when_fresh(auth_env) -> None:
    session, secret, client = auth_env
    token = AUTH_COOKIE_MANAGER.mint(session.id, secret)

    client.cookies.set(C.AUTH_COOKIE_NAME, token)
    response = client.get("/api/secure")

    assert response.status_code == 200
    cookie_header = response.headers.get("set-cookie")
    if cookie_header is not None:
        assert f"{C.AUTH_COOKIE_NAME}=" not in cookie_header


def test_auth_cookie_not_refreshed_on_non_api_route(auth_env) -> None:
    session, secret, client = auth_env
    seconds_until_exp = max(1, C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS - 30)
    issued_at = datetime.now(timezone.utc) - timedelta(
        seconds=C.AUTH_COOKIE_MAX_AGE_SECONDS - seconds_until_exp
    )
    token = AUTH_COOKIE_MANAGER.mint(session.id, secret, now=issued_at)

    client.cookies.set(C.AUTH_COOKIE_NAME, token)
    response = client.get("/secure")

    assert response.status_code == 200
    cookie_header = response.headers.get("set-cookie")
    if cookie_header is not None:
        assert f"{C.AUTH_COOKIE_NAME}=" not in cookie_header
