import os
import tempfile
import unittest
from pathlib import Path

from setta.auth import session as auth_session
from setta.auth.session import load_current_session_secret
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.utils.constants import C


class AuthSessionTests(unittest.TestCase):
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

    def test_load_current_session_secret_returns_metadata(self) -> None:
        self._set_session_env(None)
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            created = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )
            self._set_session_env(created.id)

            result = load_current_session_secret(registry)

            self.assertIsNotNone(result)
            metadata, secret = result
            self.assertEqual(metadata.id, created.id)
            self.assertEqual(len(secret), C.SESSION_SECRET_BYTES)

    def test_load_current_session_secret_prefers_env_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            first = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )
            second = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61235,
                pid=os.getpid(),
            )
            first_id = min(first.id, second.id)
            target = second if second.id != first_id else first
            self._set_session_env(target.id)

            result = load_current_session_secret(registry)

            self.assertIsNotNone(result)
            metadata, secret = result
            self.assertEqual(metadata.id, target.id)
            self.assertEqual(len(secret), C.SESSION_SECRET_BYTES)

    def test_load_current_session_secret_uses_sessions_root_env(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            created = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )
            self._set_session_env(created.id)
            self._set_sessions_root_env(str(sessions_root))

            with tempfile.TemporaryDirectory() as other_dir:
                original_cwd = Path.cwd()
                os.chdir(other_dir)
                self.addCleanup(lambda: os.chdir(original_cwd))

                self._clear_session_cache()

                result = load_current_session_secret()

            self.assertIsNotNone(result)
            metadata, secret = result
            self.assertEqual(metadata.id, created.id)
            self.assertEqual(len(secret), C.SESSION_SECRET_BYTES)

    def test_load_current_session_secret_returns_none_without_session_id(
        self,
    ) -> None:
        self._set_session_env(None)
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            result = load_current_session_secret(registry)

            self.assertIsNone(result)

    def test_load_current_session_secret_returns_none_when_secret_missing(
        self,
    ) -> None:
        self._set_session_env(None)
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            created = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )
            self._set_session_env(created.id)
            secret_path = Path(created.secretPath)
            secret_path.unlink()

            result = load_current_session_secret(registry)

            self.assertIsNone(result)

    def test_load_current_session_secret_clears_cache_when_secret_deleted(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            created = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )
            self._set_session_env(created.id)
            self._set_sessions_root_env(str(sessions_root))

            self._clear_session_cache()
            self.addCleanup(self._clear_session_cache)

            result = load_current_session_secret()
            self.assertIsNotNone(result)

            secret_path = registry.resolve_secret_path(created)
            secret_path.unlink()

            result = load_current_session_secret()
            self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
