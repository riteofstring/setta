import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta.auth import session as auth_session
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.middleware import AuthMiddleware
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.utils.constants import C


class AuthCookieRefreshTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self._set_session_env(None)
        self._set_sessions_root_env(None)
        self._clear_session_cache()

        sessions_root = Path(self.temp_dir.name) / "sessions"
        registry = SessionRegistry(sessions_root=sessions_root)
        workspace = Path(self.temp_dir.name) / "workspace"
        workspace.mkdir()
        self.session = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=os.getpid(),
        )
        self.secret = registry.load_secret(self.session)
        self._set_session_env(self.session.id)
        self._set_sessions_root_env(str(sessions_root))

        app = FastAPI()
        app.state.setta = SimpleNamespace(share_mode=False)
        app.add_middleware(AuthMiddleware)

        @app.get("/api/secure")
        async def secure_endpoint() -> dict[str, bool]:
            return {"ok": True}

        @app.get("/secure")
        async def secure_non_api_endpoint() -> dict[str, bool]:
            return {"ok": True}

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def _clear_session_cache(self) -> None:
        auth_session._cached_metadata = None
        auth_session._cached_secret = None
        auth_session._cached_sessions_root = None

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

    def _set_sessions_root_env(self, value: str | None) -> None:
        original = os.environ.get(SESSIONS_ROOT_ENV_VAR)

        def restore_env() -> None:
            if original is None:
                os.environ.pop(SESSIONS_ROOT_ENV_VAR, None)
            else:
                os.environ[SESSIONS_ROOT_ENV_VAR] = original

        self.addCleanup(restore_env)
        if value is None:
            os.environ.pop(SESSIONS_ROOT_ENV_VAR, None)
        else:
            os.environ[SESSIONS_ROOT_ENV_VAR] = value

    def test_auth_cookie_refreshes_near_expiry(self) -> None:
        seconds_until_exp = max(1, C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS - 30)
        issued_at = datetime.now(timezone.utc) - timedelta(
            seconds=C.AUTH_COOKIE_MAX_AGE_SECONDS - seconds_until_exp
        )
        old_token = AUTH_COOKIE_MANAGER.mint(
            self.session.id, self.secret, now=issued_at
        )

        self.client.cookies.set(C.AUTH_COOKIE_NAME, old_token)
        response = self.client.get("/api/secure")

        self.assertEqual(response.status_code, 200)
        cookie_header = response.headers.get("set-cookie", "")
        self.assertIn(f"{C.AUTH_COOKIE_NAME}=", cookie_header)
        new_token = response.cookies.get(C.AUTH_COOKIE_NAME)
        self.assertIsNotNone(new_token)

        old_payload = AUTH_COOKIE_MANAGER.validate(old_token, self.secret)
        new_payload = AUTH_COOKIE_MANAGER.validate(new_token, self.secret)
        self.assertGreater(new_payload.exp, old_payload.exp)

    def test_auth_cookie_not_refreshed_when_fresh(self) -> None:
        token = AUTH_COOKIE_MANAGER.mint(self.session.id, self.secret)

        self.client.cookies.set(C.AUTH_COOKIE_NAME, token)
        response = self.client.get("/api/secure")

        self.assertEqual(response.status_code, 200)
        cookie_header = response.headers.get("set-cookie")
        if cookie_header is not None:
            self.assertNotIn(f"{C.AUTH_COOKIE_NAME}=", cookie_header)

    def test_auth_cookie_not_refreshed_on_non_api_route(self) -> None:
        seconds_until_exp = max(1, C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS - 30)
        issued_at = datetime.now(timezone.utc) - timedelta(
            seconds=C.AUTH_COOKIE_MAX_AGE_SECONDS - seconds_until_exp
        )
        token = AUTH_COOKIE_MANAGER.mint(self.session.id, self.secret, now=issued_at)

        self.client.cookies.set(C.AUTH_COOKIE_NAME, token)
        response = self.client.get("/secure")

        self.assertEqual(response.status_code, 200)
        cookie_header = response.headers.get("set-cookie")
        if cookie_header is not None:
            self.assertNotIn(f"{C.AUTH_COOKIE_NAME}=", cookie_header)


if __name__ == "__main__":
    unittest.main()
