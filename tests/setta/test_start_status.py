import base64
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from click.testing import CliRunner

from setta.sessions import SessionRegistry
from setta.start import status
from setta.utils.constants import C


class StartStatusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_sessions_root = C.RUN_SESSIONS_FOLDER
        self.addCleanup(self._restore_sessions_root)
        self.sessions_root = (
            Path(self.temp_dir.name) / "setta_files" / "run" / "sessions"
        )
        C.RUN_SESSIONS_FOLDER = self.sessions_root

        self.workspace = Path(self.temp_dir.name) / "workspace"
        self.workspace.mkdir()

        self.process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import time; time.sleep(60)",
                "setta-cli-test",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.process.wait)
        self.addCleanup(self._terminate_process)

        self.registry = SessionRegistry()

    def _restore_sessions_root(self) -> None:
        C.RUN_SESSIONS_FOLDER = self.original_sessions_root

    def _terminate_process(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()

    def _create_session(
        self, port: int, started_at: datetime | None = None
    ) -> None:
        self.registry.create_session(
            workspace_path=self.workspace,
            host="127.0.0.1",
            port=port,
            pid=self.process.pid,
            started_at=started_at,
        )

    def _decode_connect_info(self, output: str) -> dict:
        line = output.strip()
        self.assertTrue(line.startswith("__SETTA_JSON_B64__"))
        encoded = line.removeprefix("__SETTA_JSON_B64__")
        decoded = base64.b64decode(encoded).decode("utf-8")
        return json.loads(decoded)

    def test_status_connect_info_json_emits_payload(self) -> None:
        self._create_session(port=61234)
        runner = CliRunner()

        result = runner.invoke(status, ["--connect-info", "--json"])

        self.assertEqual(result.exit_code, 0, result.output)
        payload = self._decode_connect_info(result.output)

        session = payload["session"]
        self.assertEqual(session["port"], 61234)
        self.assertEqual(session["workspacePath"], str(self.workspace.resolve()))
        self.assertEqual(
            payload["bootstrapUrlPlain"],
            "http://127.0.0.1:61234/__setta__/bootstrap",
        )
        self.assertTrue(
            payload["bootstrapUrlFragment"].startswith(
                "http://127.0.0.1:61234/__setta__/bootstrap#token="
            )
        )
        self.assertEqual(
            payload["sshTunnelCommand"],
            "ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 <user@host> -o ExitOnForwardFailure=yes",
        )

    def test_status_requires_session_or_latest_for_multiple_sessions_json(self) -> None:
        self._create_session(port=61234)
        self._create_session(port=61235)
        runner = CliRunner()

        result = runner.invoke(status, ["--connect-info", "--json"])

        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("Multiple sessions found", result.output)

    def test_status_rejects_missing_session(self) -> None:
        self._create_session(port=61234)
        runner = CliRunner()

        result = runner.invoke(
            status, ["--connect-info", "--json", "--session", "missing"]
        )

        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("Session missing not found", result.output)

    def test_status_latest_selects_newest(self) -> None:
        now = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        later = now + timedelta(minutes=5)
        self._create_session(port=61234, started_at=now)
        self._create_session(port=61235, started_at=later)
        runner = CliRunner()

        result = runner.invoke(status, ["--connect-info", "--json", "--latest"])

        self.assertEqual(result.exit_code, 0, result.output)
        payload = self._decode_connect_info(result.output)
        session = payload["session"]
        self.assertEqual(session["port"], 61235)
        self.assertEqual(session["startedAt"], later.isoformat())


if __name__ == "__main__":
    unittest.main()
