import os
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.middleware import AuthMiddleware
from setta.routers.bootstrap import router as bootstrap_router
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.utils.constants import C


@pytest.fixture
def bootstrap_client(tmp_path, monkeypatch):
    sessions_root = tmp_path / "setta_files" / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(C, "RUNTIME_SESSIONS_FOLDER", sessions_root)
    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)

    registry = SessionRegistry()
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

    app = FastAPI()
    app.state.setta = SimpleNamespace(share_mode=False, deployment_mode=False)
    app.add_middleware(AuthMiddleware)
    app.include_router(bootstrap_router)

    @app.get("/api/secure")
    async def secure_endpoint() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(app) as client:
        yield client, session, secret


def test_bootstrap_token_sets_cookie_for_protected_route(
    bootstrap_client,
) -> None:
    client, session, secret = bootstrap_client
    response = client.get("/api/secure")
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}

    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    response = client.post("/__setta__/bootstrap/consume", json={"token": token})
    response.raise_for_status()
    assert response.json() == {"status": "ok"}

    response = client.get("/api/secure")
    response.raise_for_status()
    assert response.json() == {"ok": True}


def test_bootstrap_page_trailing_slash_redirects(bootstrap_client) -> None:
    client, _, _ = bootstrap_client
    response = client.get(
        "/__setta__/bootstrap/",
        follow_redirects=False,
    )
    assert response.status_code in {307, 308}
    location = response.headers.get("location", "")
    assert location.endswith("/__setta__/bootstrap")


def test_bootstrap_page_hydrates_workspace_history_and_launcher_origin(
    bootstrap_client,
) -> None:
    client, _, _ = bootstrap_client
    response = client.get("/__setta__/bootstrap")
    response.raise_for_status()
    html = response.text

    assert (
        'const workspaceHistoryHandoffKey = "setta.workspaceHistoryHandoff";'
        in html
    )
    assert "localStorage.setItem(workspaceHistoryHandoffKey, trimmed);" in html

    assert 'const launcherOriginKey = "setta.launcherOrigin";' in html
    assert (
        "const launcherOriginStorage = localStorage;" in html
        or "const launcherOriginStorage = sessionStorage;" in html
    )
    assert 'hashParams.get("lo")' in html
    assert 'url.protocol !== "http:"' in html
    assert 'url.protocol !== "https:"' in html
    assert "launcherOriginStorage.setItem(launcherOriginKey, url.origin);" in html


def test_tools_call_unauthorized_returns_json(bootstrap_client) -> None:
    client, _, _ = bootstrap_client
    response = client.post("/__setta__/tools/call")
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_bootstrap_page_dev_redirect_forces_http_scheme(monkeypatch, tmp_path) -> None:
    from setta.routers import bootstrap as bootstrap_module

    monkeypatch.setattr(bootstrap_module, "IS_DEV_MODE", "1")
    monkeypatch.delenv("SETTA_DEV_FRONTEND_SCHEME", raising=False)

    app = FastAPI()
    app.state.setta = SimpleNamespace(share_mode=False, deployment_mode=False)
    app.add_middleware(AuthMiddleware)
    app.include_router(bootstrap_router)

    with TestClient(app, base_url="https://backend.example:61234") as client:
        response = client.get("/__setta__/bootstrap")
        response.raise_for_status()
        html = response.text

    expected_prefix = (
        f'const redirectUrl = "http://127.0.0.1:{bootstrap_module.C.DEV_MODE_FRONTEND_PORT}/'
    )
    assert expected_prefix in html
    assert (
        "__setta_backend_origin=https%3A%2F%2Fbackend.example%3A61234" in html
    )
