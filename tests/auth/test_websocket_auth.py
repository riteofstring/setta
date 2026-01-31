import pytest
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from setta.auth import session as auth_session
from setta.routers.websocket import _authenticate_websocket
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.utils.constants import C


@pytest.fixture
def websocket_client(tmp_path, monkeypatch):
    sessions_root = tmp_path / "setta_files" / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(C, "RUNTIME_SESSIONS_FOLDER", sessions_root)
    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)

    auth_session._cached_metadata = None
    auth_session._cached_secret = None

    app = FastAPI()

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket) -> None:
        if not await _authenticate_websocket(websocket):
            return
        await websocket.accept()
        await websocket.send_text("ok")
        await websocket.close()

    with TestClient(app) as client:
        yield client


def test_websocket_closes_with_auth_code(websocket_client) -> None:
    with websocket_client.websocket_connect("/ws") as websocket:
        with pytest.raises(WebSocketDisconnect) as exc:
            websocket.receive_text()
    assert exc.value.code == 4401
