import json
import tempfile
import unittest
from pathlib import Path

from setta.session import bootstrap_session


class SessionBootstrapTests(unittest.TestCase):
    def test_bootstrap_writes_starting_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            run_root = temp_path / "run"
            token_file = temp_path / "token"
            token_file.write_text("test-token\n")

            session_bootstrap = bootstrap_session(
                session_id="session-1",
                token_file=token_file,
                uds_path=None,
                run_root=run_root,
                host="127.0.0.1",
                port=8123,
                version="0.0.0-test",
            )

            self.assertTrue(session_bootstrap.layout.run_dir.exists())
            self.assertTrue(session_bootstrap.layout.logs_dir.exists())
            self.assertTrue(session_bootstrap.layout.session_file.exists())
            self.assertTrue(session_bootstrap.layout.pid_file.exists())
            self.assertTrue(session_bootstrap.layout.log_file.exists())

            payload = json.loads(session_bootstrap.layout.session_file.read_text())
            self.assertEqual(payload["session_id"], "session-1")
            self.assertEqual(payload["version"], "0.0.0-test")
            self.assertEqual(payload["status"], "starting")
            self.assertEqual(payload["listen"]["host"], "127.0.0.1")
            self.assertEqual(payload["listen"]["port"], 8123)
            self.assertEqual(payload["token_file"], str(token_file.resolve()))
            self.assertEqual(
                payload["log_file"],
                str(session_bootstrap.layout.log_file),
            )
