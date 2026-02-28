from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from setta.routers.launch import router as launch_router
from setta.middleware import AuthMiddleware, LoggingContextMiddleware
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.types.routes import Route
from setta.utils import constants
from setta.utils.constants import C


@pytest.fixture
def cors_client(tmp_path, monkeypatch):
    sessions_root = tmp_path / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(C, "RUNTIME_SESSIONS_FOLDER", sessions_root)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)

    app = FastAPI()
    app.add_middleware(LoggingContextMiddleware)
    app.add_middleware(AuthMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=C.FRONTEND_ORIGINS,
        allow_origin_regex=C.FRONTEND_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get(f"{Route.PREFIX.value}/cors-check")
    async def cors_check() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(app) as client:
        yield client


def test_cors_headers_on_unauthorized(cors_client) -> None:
    origin = C.FRONTEND_ORIGINS[0]
    response = cors_client.get(
        f"{Route.PREFIX.value}/cors-check", headers={"Origin": origin}
    )

    assert response.status_code == 401
    assert response.headers.get("access-control-allow-origin") == origin
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_launcher_mode_cors_allows_loopback_cross_origin_launch_intent(
    monkeypatch,
) -> None:
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.setattr(
        "setta.routers.launch.load_current_session_secret",
        lambda: (SimpleNamespace(id="session-1"), b"secret"),
    )

    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        launcher_mode=True,
        share_mode=False,
        app_mode=False,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=C.FRONTEND_ORIGINS,
        allow_origin_regex=C.FRONTEND_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(launch_router, prefix=Route.PREFIX.value)

    trusted_origin = "http://127.0.0.1:61234"
    with TestClient(app, base_url=C.BACKEND) as client:
        preflight = client.options(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={
                "Origin": trusted_origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers.get("access-control-allow-origin") == trusted_origin
        assert preflight.headers.get("access-control-allow-credentials") == "true"

        response = client.post(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={"Origin": trusted_origin},
            json={
                "launchRequest": {"workspaceRoot": "/tmp/workspace"},
                "returnUrl": f"{C.BACKEND}/home",
            },
        )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == trusted_origin
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert response.json()["ok"] is True


def test_launcher_mode_cors_rejects_untrusted_preflight_origin(
    monkeypatch,
) -> None:
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=C.FRONTEND_ORIGINS,
        allow_origin_regex=C.FRONTEND_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post(f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}")
    async def launch_intent_stub() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(app, base_url=C.BACKEND) as client:
        preflight = client.options(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert preflight.status_code == 400
    assert preflight.headers.get("access-control-allow-origin") is None
