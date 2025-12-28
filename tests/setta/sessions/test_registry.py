import tempfile
import unittest
from pathlib import Path

from setta.sessions.registry import SessionRegistry
from setta.utils.constants import C


class SessionRegistryTests(unittest.TestCase):
    def test_create_and_load_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            created = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=12345,
            )
            sessions = registry.load_sessions(prune_stale=False)

            self.assertEqual(len(sessions), 1)
            loaded = sessions[0]
            self.assertEqual(loaded.id, created.id)
            self.assertEqual(Path(loaded.workspacePath), workspace.resolve())
            self.assertEqual(loaded.host, "127.0.0.1")
            self.assertEqual(loaded.port, 61234)
            self.assertEqual(loaded.pid, 12345)
            self.assertEqual(Path(loaded.secretPath).parent, sessions_root / created.id)

            metadata_path = sessions_root / created.id / "session.json"
            secret_path = sessions_root / created.id / "secret"
            self.assertTrue(metadata_path.exists())
            self.assertTrue(secret_path.exists())

            secret_bytes = registry.load_secret(loaded)
            self.assertEqual(len(secret_bytes), C.SESSION_SECRET_BYTES)

    def test_find_sessions_by_workspace_resolves_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sessions_root = root / "sessions"
            workspace = root / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=12345,
            )

            alt_path = workspace / "." / Path("..") / workspace.name
            matches = registry.find_sessions_by_workspace(alt_path, prune_stale=False)
            self.assertEqual(len(matches), 1)
            self.assertEqual(Path(matches[0].workspacePath), workspace.resolve())

    def test_delete_session_removes_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            created = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=12345,
            )
            session_dir = sessions_root / created.id
            self.assertTrue(session_dir.exists())

            registry.delete_session(created.id)
            self.assertFalse(session_dir.exists())


if __name__ == "__main__":
    unittest.main()
