from datetime import datetime, timezone
import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta import trusted_frontend_origins as trusted_frontend_origins_module
from setta.middleware import (
    AuthMiddleware,
    LoggingContextMiddleware,
    SettaCORSMiddleware,
)
from setta.routers.launch import router as launch_router
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStore,
    TrustedFrontendOriginStoreUnavailableError,
    trust_frontend_origin,
)
from setta.types.routes import Route
from setta.utils import constants
from setta.utils.constants import C


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
        SettaCORSMiddleware,
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


def test_launcher_mode_cors_allows_configured_loopback_origin_launch_intent(
    monkeypatch,
) -> None:
    # Explicitly configured launcher origins should keep credentialed CORS access.
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    trusted_origin = "http://127.0.0.1:61234"
    monkeypatch.setenv("SETTA_FRONTEND_ORIGINS", trusted_origin)
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
        SettaCORSMiddleware,
        allow_origins=C.FRONTEND_ORIGINS,
        allow_origin_regex=C.FRONTEND_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(launch_router, prefix=Route.PREFIX.value)

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


def test_launcher_mode_cors_allows_handoff_trusted_loopback_preflight_origin(
    monkeypatch,
) -> None:
    # Trusted launcher handoff origins should be allowlisted without env wiring.
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.delenv("SETTA_FRONTEND_ORIGINS", raising=False)
    trusted_origin = "http://127.0.0.1:61234"
    now = int(time.time())
    trust_frontend_origin(
        trusted_origin,
        session_id="session-1",
        exp=now + 300,
        now=now,
    )
    monkeypatch.setattr(
        "setta.middleware.cors.load_current_session_secret",
        lambda: (SimpleNamespace(id="session-1"), b"secret"),
    )

    app = FastAPI()
    app.add_middleware(
        SettaCORSMiddleware,
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
                "Origin": trusted_origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == trusted_origin
    assert preflight.headers.get("access-control-allow-credentials") == "true"


def test_launch_handoff_trusts_workspace_origin_for_launcher_cors(monkeypatch) -> None:
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.delenv("SETTA_FRONTEND_ORIGINS", raising=False)
    launcher_origin = "http://127.0.0.1:7000"
    launched_workspace_origin = "http://127.0.0.1:61234"
    monkeypatch.setattr(
        "setta.routers.launch.load_current_session_secret",
        lambda: (SimpleNamespace(id="session-1"), b"secret"),
    )
    monkeypatch.setattr(
        "setta.middleware.cors.load_current_session_secret",
        lambda: (SimpleNamespace(id="session-1"), b"secret"),
    )

    def fake_launch_workspace_session(**_kwargs):
        session = SimpleNamespace(
            id="workspace-session",
            workspacePath="/tmp/workspace",
            workspacePathCanonical="/tmp/workspace",
            host="127.0.0.1",
            port=61234,
            pid=12345,
            startedAt=datetime.now(timezone.utc),
        )
        paths = SimpleNamespace(
            workspace_root="/tmp/workspace",
            setta_files_location="local",
            setta_files_root="/tmp/workspace/setta_files",
            runtime_root="/tmp/workspace/setta_files/runtime",
            setta_home="/tmp/setta-home",
            profile_name=None,
        )
        registry = SimpleNamespace(load_secret=lambda _session: b"workspace-secret")
        return SimpleNamespace(
            session=session,
            paths=paths,
            registry=registry,
            started_new=True,
        )

    monkeypatch.setattr(
        "setta.routers.launch.launch_workspace_session",
        fake_launch_workspace_session,
    )
    monkeypatch.setattr(
        "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint",
        lambda *_a, **_k: "tok",
    )
    monkeypatch.setattr(
        "setta.routers.launch.build_bootstrap_urls",
        lambda host, port, token: (
            f"http://{host}:{port}/__setta__/bootstrap#token={token}",
            f"http://{host}:{port}/__setta__/bootstrap",
        ),
    )

    app = FastAPI()
    app.state.setta = SimpleNamespace(
        deployment_mode=False,
        launcher_mode=True,
        share_mode=False,
        app_mode=False,
    )
    app.add_middleware(
        SettaCORSMiddleware,
        allow_origins=C.FRONTEND_ORIGINS,
        allow_origin_regex=C.FRONTEND_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(launch_router, prefix=Route.PREFIX.value)

    with TestClient(app, base_url=C.BACKEND) as client:
        # A successful launcher /launch call should trust the launched workspace origin.
        launch_response = client.post(
            f"{Route.PREFIX.value}{Route.LAUNCH.value}",
            headers={"Origin": launcher_origin},
            json={"workspaceRoot": "/tmp/workspace"},
        )
        assert launch_response.status_code == 200
        assert launch_response.json()["ok"] is True

        trusted_preflight = client.options(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={
                "Origin": launched_workspace_origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert trusted_preflight.status_code == 200
        assert (
            trusted_preflight.headers.get("access-control-allow-origin")
            == launched_workspace_origin
        )

        trusted_post = client.post(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={"Origin": launched_workspace_origin},
            json={
                "launchRequest": {"workspaceRoot": "/tmp/workspace"},
                "returnUrl": f"{launched_workspace_origin}/home",
            },
        )
        assert trusted_post.status_code == 200
        assert (
            trusted_post.headers.get("access-control-allow-origin")
            == launched_workspace_origin
        )
        assert trusted_post.json()["ok"] is True

        untrusted_preflight = client.options(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={
                "Origin": "http://127.0.0.1:61235",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    assert untrusted_preflight.status_code == 400


def test_launcher_mode_cors_rejects_unconfigured_loopback_preflight_origin(
    monkeypatch,
) -> None:
    # Unconfigured loopback origins should fail preflight in launcher mode.
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.delenv("SETTA_FRONTEND_ORIGINS", raising=False)

    app = FastAPI()
    app.add_middleware(
        SettaCORSMiddleware,
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
                "Origin": "http://127.0.0.1:61234",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert preflight.status_code == 400
    assert preflight.headers.get("access-control-allow-origin") is None


def test_launcher_mode_cors_credentialed_request_blocks_non_allowlisted_loopback(
    monkeypatch,
) -> None:
    # Browser credentialed requests from untrusted loopback origins should not get allow-origin.
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.delenv("SETTA_FRONTEND_ORIGINS", raising=False)
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
        SettaCORSMiddleware,
        allow_origins=C.FRONTEND_ORIGINS,
        allow_origin_regex=C.FRONTEND_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(launch_router, prefix=Route.PREFIX.value)

    untrusted_origin = "http://127.0.0.1:61234"
    with TestClient(app, base_url=C.BACKEND) as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
            headers={"Origin": untrusted_origin},
            json={
                "launchRequest": {"workspaceRoot": "/tmp/workspace"},
                "returnUrl": f"{C.BACKEND}/home",
            },
        )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") is None


def test_launcher_mode_cors_fails_closed_when_store_read_raises(
    monkeypatch,
) -> None:
    monkeypatch.setattr(constants, "IS_DEV_MODE", False)
    monkeypatch.setattr(C, "LAUNCHER_MODE", True)
    monkeypatch.setattr(C, "HOST", C.DEFAULT_HOST)
    monkeypatch.setattr(C, "PORT", C.DEFAULT_PORT)
    monkeypatch.delenv("SETTA_FRONTEND_ORIGINS", raising=False)
    monkeypatch.setattr(
        "setta.middleware.cors.load_current_session_secret",
        lambda: (SimpleNamespace(id="session-1"), b"secret"),
    )

    class _BrokenStore:
        def is_trusted(self, **_kwargs) -> bool:
            raise TrustedFrontendOriginStoreUnavailableError("boom")

    monkeypatch.setattr(
        trusted_frontend_origins_module,
        "_TRUSTED_FRONTEND_ORIGIN_STORE",
        _BrokenStore(),
    )

    app = FastAPI()
    app.add_middleware(
        SettaCORSMiddleware,
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
                "Origin": "http://127.0.0.1:61234",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert preflight.status_code == 400
