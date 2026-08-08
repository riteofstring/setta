import os
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta import trusted_frontend_origins as trusted_frontend_origins_module
from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.middleware import AuthMiddleware
from setta.routers.bootstrap import router as bootstrap_router
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStore,
    is_trusted_frontend_origin,
)
from setta.utils.constants import C
from setta.utils.launcher_origin_handoff import mint_launcher_origin_handoff_proof


@pytest.fixture(autouse=True)
def isolated_trusted_frontend_origins_store(tmp_path, monkeypatch) -> None:
    store = TrustedFrontendOriginStore(
        storage_path=tmp_path / "trusted_frontend_origins.json"
    )
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        store,
    )


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


def test_bootstrap_consume_returns_verified_launcher_origin(bootstrap_client) -> None:
    client, session, secret = bootstrap_client
    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    launcher_origin = "http://127.0.0.1:9001"
    launcher_origin_proof = mint_launcher_origin_handoff_proof(
        session_id=session.id,
        launcher_origin=launcher_origin,
        secret=secret,
    )

    response = client.post(
        "/__setta__/bootstrap/consume",
        json={
            "token": token,
            "launcherOrigin": launcher_origin,
            "launcherOriginProof": launcher_origin_proof,
        },
    )

    response.raise_for_status()
    assert response.json() == {"status": "ok", "launcherOrigin": launcher_origin}
    assert is_trusted_frontend_origin(launcher_origin, session_id=session.id) is True
    assert (
        is_trusted_frontend_origin(launcher_origin, session_id="different-session")
        is False
    )


def test_bootstrap_consume_ignores_invalid_launcher_origin_proof(
    bootstrap_client,
) -> None:
    client, session, secret = bootstrap_client
    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)

    response = client.post(
        "/__setta__/bootstrap/consume",
        json={
            "token": token,
            "launcherOrigin": "http://127.0.0.1:9001",
            "launcherOriginProof": "invalid-proof",
        },
    )

    response.raise_for_status()
    assert response.json() == {"status": "ok"}
    assert (
        is_trusted_frontend_origin(
            "http://127.0.0.1:9001",
            session_id=session.id,
        )
        is False
    )


def test_bootstrap_consume_returns_503_when_trusted_origin_store_is_unavailable(
    bootstrap_client,
    tmp_path,
    monkeypatch,
) -> None:
    client, session, secret = bootstrap_client
    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    launcher_origin = "http://127.0.0.1:9001"
    launcher_origin_proof = mint_launcher_origin_handoff_proof(
        session_id=session.id,
        launcher_origin=launcher_origin,
        secret=secret,
    )
    lock_parent = tmp_path / "lock-parent-as-file"
    lock_parent.write_text("not-a-directory", encoding="utf-8")
    broken_store = TrustedFrontendOriginStore(
        storage_path=lock_parent / "trusted_frontend_origins.json"
    )
    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        broken_store,
    )

    # Trust-store lock failures should map to the route's explicit 503 contract.
    response = client.post(
        "/__setta__/bootstrap/consume",
        json={
            "token": token,
            "launcherOrigin": launcher_origin,
            "launcherOriginProof": launcher_origin_proof,
        },
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Trusted frontend origin store unavailable"}


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

    assert 'const workspaceHistoryHandoffKey = "setta.workspaceHistoryHandoff";' in html
    assert "localStorage.setItem(workspaceHistoryHandoffKey, trimmed);" in html

    assert 'const launcherOriginKey = "setta.launcherOrigin";' in html
    assert "const launcherOriginStorage = sessionStorage;" in html
    assert 'hashParams.get("lo")' in html
    assert 'hashParams.get("lop")' in html
    assert 'hashParams.get("osw")' in html
    assert (
        'const openWorkspaceSwitcherQueryParam = "__setta_open_workspace_switcher";'
        in html
    )
    assert 'redirect.searchParams.set(openWorkspaceSwitcherQueryParam, "1");' in html
    assert "consumeBody.launcherOrigin = launcherOriginHandoff.origin;" in html
    assert "consumeBody.launcherOriginProof = launcherOriginHandoff.proof;" in html
    assert "launcherOriginStorage.setItem(launcherOriginKey, trimmed);" in html


def test_tools_call_unauthorized_returns_json(bootstrap_client) -> None:
    client, _, _ = bootstrap_client
    response = client.post("/__setta__/tools/call")
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


def test_bootstrap_page_dev_redirect_forces_http_scheme(monkeypatch) -> None:
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

    expected_prefix = f'const redirectUrl = "http://127.0.0.1:{bootstrap_module.C.DEV_MODE_FRONTEND_PORT}/'
    assert expected_prefix in html
    assert "__setta_backend_origin=https%3A%2F%2Fbackend.example%3A61234" in html
