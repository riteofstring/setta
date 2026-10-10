from __future__ import annotations

import io
import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
import urllib.request
from contextlib import suppress
from pathlib import Path
from unittest import mock

from scripts import (
    playground_server,
    run_experiment_lens_playground,
    run_local_setta,
    run_python_canvas_playground,
    run_realtime_playground,
    run_review_playground,
)

RUNNERS = (
    run_python_canvas_playground,
    run_realtime_playground,
    run_review_playground,
    run_experiment_lens_playground,
)


class PlaygroundCommandsTests(unittest.TestCase):
    def test_every_command_reopens_a_live_session_without_setup(self) -> None:
        for runner in RUNNERS:
            with (
                self.subTest(runner=runner.__name__),
                mock.patch.object(
                    playground_server,
                    "inspect_session",
                    return_value={"url": "http://127.0.0.1:1234"},
                ),
                mock.patch.object(playground_server, "open_browser") as browser,
                mock.patch.object(run_local_setta, "prepare") as build,
                mock.patch.object(runner, "prepare_workspace") as prepare,
                mock.patch("sys.stdout", new_callable=io.StringIO) as output,
            ):
                self.assertEqual(runner.main([]), 0)
                browser.assert_called_once_with("http://127.0.0.1:1234")
                self.assertIn("--stop", output.getvalue())
                self.assertIn("keeps running", output.getvalue())
                prepare.assert_not_called()
                build.assert_not_called()

    def test_every_command_can_stop_without_building_or_creating_a_copy(self) -> None:
        for runner in RUNNERS:
            with (
                self.subTest(runner=runner.__name__),
                mock.patch.object(
                    playground_server, "inspect_session", return_value=None
                ),
                mock.patch.object(run_local_setta, "prepare") as build,
                mock.patch.object(runner, "prepare_workspace") as prepare,
                mock.patch("sys.stdout", new_callable=io.StringIO) as output,
            ):
                self.assertEqual(runner.main(["--stop"]), 0)
                self.assertIn("already stopped", output.getvalue())
                prepare.assert_not_called()
                build.assert_not_called()

    def test_browser_failure_leaves_a_usable_url_and_success(self) -> None:
        for failure in (False, OSError("no desktop")):
            with (
                self.subTest(failure=failure),
                mock.patch.object(
                    playground_server,
                    "inspect_session",
                    return_value={"url": "http://127.0.0.1:1234"},
                ),
                mock.patch.object(
                    playground_server.webbrowser, "open", side_effect=[failure]
                ),
                mock.patch("sys.stdout", new_callable=io.StringIO) as output,
                mock.patch("sys.stderr", new_callable=io.StringIO) as errors,
            ):
                self.assertEqual(run_python_canvas_playground.main([]), 0)
                self.assertIn("http://127.0.0.1:1234", output.getvalue())
                self.assertIn("Open the URL above", errors.getvalue())

    def test_no_open_does_not_attempt_browser_launch(self) -> None:
        with (
            mock.patch.object(
                playground_server,
                "inspect_session",
                return_value={"url": "http://127.0.0.1:1234"},
            ),
            mock.patch.object(playground_server, "open_browser") as browser,
        ):
            self.assertEqual(run_python_canvas_playground.main(["--no-open"]), 0)
        browser.assert_not_called()

    def test_stop_cannot_create_a_fresh_copy(self) -> None:
        with mock.patch("sys.stderr", new_callable=io.StringIO) as errors:
            self.assertEqual(
                run_python_canvas_playground.main(["--fresh", "--stop"]), 2
            )
        self.assertIn("omit --fresh", errors.getvalue())


@unittest.skipIf(os.name == "nt", "The process fixture uses a POSIX executable script")
class PlaygroundProcessTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.executable = self.root / "setta"
        fixture = Path(__file__).with_name("playground_process_fixture.py")
        self.executable.write_text(f"#!{sys.executable}\n" + fixture.read_text())
        self.executable.chmod(0o700)
        self.runtime = Path(__file__).resolve().parents[1]

    def launch(
        self, app: str, workspace: Path, *arguments: str
    ) -> subprocess.CompletedProcess[str]:
        script = (
            "import sys; from pathlib import Path; "
            "from scripts import playground_options, playground_server; "
            "from scripts import run_local_setta; "
            "executable=Path(sys.argv[1]); workspace=Path(sys.argv[3]); "
            "run_local_setta.prepare=lambda: executable; "
            "playground_server.LOG_ROOT=workspace/'logs'; "
            "options=playground_options.parse_options("
            "sys.argv[2],workspace,sys.argv[4:]); "
            "status=playground_server.run(sys.argv[2],options,lambda path:path); "
            "raise SystemExit(status)"
        )
        return subprocess.run(
            [
                sys.executable,
                "-c",
                script,
                str(self.executable),
                app,
                str(workspace),
                "--no-open",
                *arguments,
            ],
            cwd=self.runtime,
            env={
                **os.environ,
                "PYTHONPATH": str(self.runtime / "src"),
                "XDG_RUNTIME_DIR": str(self.root / "runtime"),
            },
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

    def test_servers_survive_the_launcher_exit_reopen_and_stop(self) -> None:
        for app in run_local_setta.PACKAGED_APP_IDS:
            with self.subTest(app=app):
                workspace = self.root / app
                workspace.mkdir()
                launched = self.launch(app, workspace)
                self.assertEqual(launched.returncode, 0, launched.stderr)
                session = json.loads((workspace / "session.json").read_text())
                self.addCleanup(self.stop_fixture, session["ownerPid"])
                with urllib.request.urlopen(session["url"], timeout=2) as response:
                    self.assertEqual(response.read(), b"ready")
                sentinel = workspace / "experiment.txt"
                sentinel.write_text("my edits")
                reopened = self.launch(app, workspace)
                self.assertEqual(reopened.returncode, 0, reopened.stderr)
                self.assertIn(session["url"], reopened.stdout)
                self.assertEqual(
                    json.loads((workspace / "session.json").read_text()), session
                )
                stopped = self.launch(app, workspace, "--stop")
                self.assertEqual(stopped.returncode, 0, stopped.stderr)
                self.assertIn("Stopped", stopped.stdout)
                with self.assertRaises(OSError):
                    urllib.request.urlopen(session["url"], timeout=2)
                self.assertEqual(sentinel.read_text(), "my edits")
                restarted = self.launch(app, workspace)
                self.assertEqual(restarted.returncode, 0, restarted.stderr)
                replacement = json.loads((workspace / "session.json").read_text())
                self.addCleanup(self.stop_fixture, replacement["ownerPid"])
                self.assertNotEqual(replacement["ownerPid"], session["ownerPid"])
                self.assertEqual(sentinel.read_text(), "my edits")

    def test_failed_startup_reports_the_cause_and_log_without_claiming_ready(
        self,
    ) -> None:
        (self.root / "fail-startup").touch()
        result = self.launch("review", self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("The example could not be loaded", result.stderr)
        self.assertIn("Log:", result.stderr)
        self.assertNotIn("is ready", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    @staticmethod
    def stop_fixture(pid: int) -> None:
        with suppress(ProcessLookupError):
            os.kill(pid, signal.SIGTERM)


if __name__ == "__main__":
    unittest.main()
