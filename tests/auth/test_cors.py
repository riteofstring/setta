import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from setta.middleware import AuthMiddleware, LoggingContextMiddleware
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.types.routes import Route
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
