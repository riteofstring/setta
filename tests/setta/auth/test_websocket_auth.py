import os
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from setta.auth import session as auth_session
from setta.routers.websocket import _authenticate_websocket
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.utils.constants import C


class WebsocketAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_sessions_root = C.RUN_SESSIONS_FOLDER
        self.addCleanup(self._restore_sessions_root)
        C.RUN_SESSIONS_FOLDER = (
            Path(self.temp_dir.name) / "setta_files" / "run" / "sessions"
        )

        os.environ.pop(SESSION_ID_ENV_VAR, None)
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

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _restore_sessions_root(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root

    def test_websocket_closes_with_auth_code(self) -> None:
        with self.client.websocket_connect("/ws") as websocket:
            with self.assertRaises(WebSocketDisconnect) as cm:
                websocket.receive_text()
        self.assertEqual(cm.exception.code, 4401)


if __name__ == "__main__":
    unittest.main()
