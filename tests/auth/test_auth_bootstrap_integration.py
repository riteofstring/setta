import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.middleware import AuthMiddleware
from setta.routers.bootstrap import router as bootstrap_router
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR
from setta.utils.constants import C


class AuthBootstrapIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_sessions_root = C.RUN_SESSIONS_FOLDER
        self.addCleanup(self._restore_sessions_root)
        C.RUN_SESSIONS_FOLDER = (
            Path(self.temp_dir.name) / "setta_files" / "run" / "sessions"
        )

        self._set_session_env(None)

        self.registry = SessionRegistry()
        workspace = Path(self.temp_dir.name) / "workspace"
        workspace.mkdir()
        self.session = self.registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=os.getpid(),
        )
        self.secret = self.registry.load_secret(self.session)
        self._set_session_env(self.session.id)

        app = FastAPI()
        app.state.setta = SimpleNamespace(share_mode=False)
        app.add_middleware(AuthMiddleware)
        app.include_router(bootstrap_router)

        @app.get("/api/secure")
        async def secure_endpoint() -> dict[str, bool]:
            return {"ok": True}

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _restore_sessions_root(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root

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

    def test_bootstrap_token_sets_cookie_for_protected_route(self) -> None:
        response = self.client.get("/api/secure")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Unauthorized"})

        token = BOOTSTRAP_TOKEN_MANAGER.mint(self.session.id, self.secret)
        response = self.client.post(
            "/__setta__/bootstrap/consume", json={"token": token}
        )
        response.raise_for_status()
        self.assertEqual(response.json(), {"status": "ok"})

        response = self.client.get("/api/secure")
        response.raise_for_status()
        self.assertEqual(response.json(), {"ok": True})

    def test_bootstrap_page_trailing_slash_redirects(self) -> None:
        response = self.client.get(
            "/__setta__/bootstrap/",
            follow_redirects=False,
        )
        self.assertIn(response.status_code, {307, 308})
        location = response.headers.get("location", "")
        self.assertTrue(location.endswith("/__setta__/bootstrap"))


if __name__ == "__main__":
    unittest.main()
