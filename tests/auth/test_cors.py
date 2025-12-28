import os
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from setta.middleware import AuthMiddleware, LoggingContextMiddleware
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.types.routes import Route
from setta.utils.constants import C


class AuthCORSTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_sessions_root = C.RUN_SESSIONS_FOLDER
        self.original_host = C.HOST
        self.original_port = C.PORT
        self.addCleanup(self._restore_constants)

        C.RUN_SESSIONS_FOLDER = Path(self.temp_dir.name) / "sessions"
        C.HOST = C.DEFAULT_HOST
        C.PORT = C.DEFAULT_PORT

        self._set_session_env(None)

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

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _restore_constants(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root
        C.HOST = self.original_host
        C.PORT = self.original_port

    def _set_session_env(self, value: str | None) -> None:
        original = os.environ.get(SESSION_ID_ENV_VAR)

        def restore_env() -> None:
            if original is None:
                os.environ.pop(SESSION_ID_ENV_VAR, None)
            else:
                os.environ[SESSION_ID_ENV_VAR] = original

        self.addCleanup(restore_env)
        if value is None:
            os.environ.pop(SESSION_ID_ENV_VAR, None)
        else:
            os.environ[SESSION_ID_ENV_VAR] = value

    def test_cors_headers_on_unauthorized(self) -> None:
        origin = C.FRONTEND_ORIGINS[0]
        response = self.client.get(
            f"{Route.PREFIX.value}/cors-check", headers={"Origin": origin}
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
        self.assertEqual(
            response.headers.get("access-control-allow-credentials"), "true"
        )


if __name__ == "__main__":
    unittest.main()
