import subprocess
import sys
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

    def test_delete_session_removes_extra_files(self) -> None:
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
            extra_file = session_dir / "extra.txt"
            extra_file.write_text("extra", encoding="utf-8")

            registry.delete_session(created.id)

            self.assertFalse(session_dir.exists())

    def test_is_session_process_setta_detects_console_script_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sessions_root = root / "sessions"
            workspace = root / "workspace"
            workspace.mkdir()
            script_path = root / "setta"
            script_path.write_text("import time\n\ntime.sleep(60)\n", encoding="utf-8")

            process = subprocess.Popen(
                [sys.executable, str(script_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.addCleanup(process.wait)
            self.addCleanup(process.terminate)

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            self.assertTrue(registry.is_session_process_setta(session))

    def test_is_session_process_setta_detects_script_py_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sessions_root = root / "sessions"
            workspace = root / "workspace"
            workspace.mkdir()
            script_path = root / "setta-script.py"
            script_path.write_text("import time\n\ntime.sleep(60)\n", encoding="utf-8")

            process = subprocess.Popen(
                [sys.executable, str(script_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.addCleanup(process.wait)
            self.addCleanup(process.terminate)

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61235,
                pid=process.pid,
            )

            self.assertTrue(registry.is_session_process_setta(session))

    def test_load_sessions_tracks_suspicious_when_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sessions_root = Path(temp_dir) / "sessions"
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            process = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    "import time; time.sleep(60)",
                    "setta.server:app",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.addCleanup(process.wait)
            self.addCleanup(process.terminate)

            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            registry.load_sessions(prune_stale=False, track_suspicious=False)
            self.assertEqual(registry.suspicious_session_ids(), set())

            registry.load_sessions(prune_stale=False, track_suspicious=True)
            self.assertEqual(registry.suspicious_session_ids(), {session.id})

    def test_load_sessions_prunes_non_setta_process(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sessions_root = root / "sessions"
            workspace = root / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            process = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    "import time; time.sleep(60)",
                    "unit-test",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.addCleanup(process.wait)
            self.addCleanup(process.terminate)

            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )
            sessions = registry.load_sessions(prune_stale=True)

            self.assertEqual(sessions, [])
            self.assertFalse((sessions_root / session.id).exists())
            self.assertIsNone(process.poll())

    def test_load_session_prunes_non_setta_process(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            sessions_root = root / "sessions"
            workspace = root / "workspace"
            workspace.mkdir()
            registry = SessionRegistry(sessions_root=sessions_root)

            process = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    "import time; time.sleep(60)",
                    "unit-test",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.addCleanup(process.wait)
            self.addCleanup(process.terminate)

            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            loaded = registry.load_session(session.id, prune_stale=True)

            self.assertIsNone(loaded)
            self.assertFalse((sessions_root / session.id).exists())
            self.assertIsNone(process.poll())


if __name__ == "__main__":
    unittest.main()
