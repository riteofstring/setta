import os
import tempfile
import unittest
from pathlib import Path

from setta.auth.session import load_current_session_secret
from setta.sessions import SessionRegistry
from setta.utils.constants import C


class AuthSessionTests(unittest.TestCase):
    def test_load_current_session_secret_returns_metadata(self) -> None:
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

            result = load_current_session_secret(registry)

            self.assertIsNotNone(result)
            metadata, secret = result
            self.assertEqual(metadata.id, created.id)
            self.assertEqual(len(secret), C.SESSION_SECRET_BYTES)

    def test_load_current_session_secret_returns_none_without_matching_pid(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            registry = SessionRegistry(sessions_root=sessions_root)
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()

            registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=0,
            )

            result = load_current_session_secret(registry)

            self.assertIsNone(result)

    def test_load_current_session_secret_returns_none_when_secret_missing(
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
            secret_path = Path(created.secretPath)
            secret_path.unlink()

            result = load_current_session_secret(registry)

            self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
