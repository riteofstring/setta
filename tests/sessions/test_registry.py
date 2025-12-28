import tempfile
import unittest
from pathlib import Path

from setta.sessions import SessionRegistry
from setta.utils.constants import C


class SessionRegistryTests(unittest.TestCase):
    def test_create_session_writes_metadata_and_secret(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            metadata = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=12345,
            )

            session_dir = sessions_root / metadata.id
            metadata_path = session_dir / "session.json"
            secret_path = session_dir / "secret"

            self.assertTrue(metadata_path.exists())
            self.assertTrue(secret_path.exists())
            self.assertEqual(Path(metadata.workspacePath), workspace.resolve())
            self.assertEqual(len(secret_path.read_bytes()), C.SESSION_SECRET_BYTES)

    def test_find_sessions_by_workspace_uses_canonical_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            metadata = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=12345,
            )
            alt_path = workspace / ".." / workspace.name

            matches = registry.find_sessions_by_workspace(
                alt_path, prune_stale=False
            )

            self.assertEqual([session.id for session in matches], [metadata.id])

    def test_delete_session_removes_session_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            metadata = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=12345,
            )
            session_dir = sessions_root / metadata.id

            registry.delete_session(metadata.id)

            self.assertFalse(session_dir.exists())


if __name__ == "__main__":
    unittest.main()
