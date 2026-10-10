from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import playground_server, run_local_setta, run_python_canvas_playground


class PythonCanvasPlaygroundTests(unittest.TestCase):
    def setUp(self) -> None:
        for target, attribute, value in (
            (playground_server, "inspect_session", None),
            (playground_server, "open_browser", None),
            (run_local_setta, "prepare", Path("/installed/setta")),
        ):
            patcher = mock.patch.object(target, attribute, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve() / "model-workshop"
        patcher = mock.patch.object(
            run_python_canvas_playground, "WORKSPACE_ROOT", self.workspace
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = mock.patch.object(
            run_python_canvas_playground.shutil, "which", return_value="/tools/uv"
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = mock.patch.object(run_python_canvas_playground.subprocess, "run")
        self.sync = patcher.start()
        self.addCleanup(patcher.stop)

    def test_launch_copies_a_complete_example_and_preserves_later_edits(self) -> None:
        with mock.patch.object(
            playground_server, "start", return_value={"url": "http://127.0.0.1:1234"}
        ) as launch:
            self.assertEqual(run_python_canvas_playground.main(["--no-open"]), 0)
            launch.assert_called_once_with(
                Path("/installed/setta"), "python-canvas", self.workspace
            )
            source = self.workspace / "model_workshop.py"
            self.assertIn("def show", source.read_text(encoding="utf-8"))
            self.sync.assert_called_once_with(
                [
                    "/tools/uv",
                    "sync",
                    "--frozen",
                    "--no-build",
                    "--no-install-project",
                    "--project",
                    str(self.workspace),
                ],
                cwd=self.workspace,
                check=True,
            )
            self.assertFalse((self.workspace / ".venv").exists())
            self.assertFalse((self.workspace / "__pycache__").exists())
            source.write_text("my experiment", encoding="utf-8")
            self.assertEqual(run_python_canvas_playground.main([]), 0)
        self.assertEqual(source.read_text(encoding="utf-8"), "my experiment")
        self.assertIn(
            "def show",
            (run_python_canvas_playground.FIXTURE_ROOT / "model_workshop.py").read_text(
                encoding="utf-8"
            ),
        )

    def test_fresh_launch_keeps_previous_work_and_can_be_resumed(self) -> None:
        run_python_canvas_playground.prepare_workspace()
        original = self.workspace / "model_workshop.py"
        original.write_text("my experiment", encoding="utf-8")
        with mock.patch.object(
            playground_server, "start", return_value={"url": "http://127.0.0.1:1234"}
        ) as launch:
            self.assertEqual(
                run_python_canvas_playground.main(["--fresh", "--no-open"]), 0
            )
            fresh = launch.call_args.args[2]
            self.assertNotEqual(fresh, self.workspace)
            self.assertIn(
                "def show", (fresh / "model_workshop.py").read_text(encoding="utf-8")
            )
            self.assertEqual(
                run_python_canvas_playground.main(["--workspace", str(fresh)]), 0
            )
            self.assertEqual(launch.call_args.args[2], fresh)
        self.assertEqual(original.read_text(encoding="utf-8"), "my experiment")

    def test_partial_copy_is_not_published(self) -> None:
        with (
            mock.patch.object(
                run_python_canvas_playground.shutil,
                "copytree",
                side_effect=OSError("disk full"),
            ),
            mock.patch.object(playground_server, "start") as launch,
            mock.patch("sys.stderr", new_callable=io.StringIO) as errors,
        ):
            self.assertEqual(run_python_canvas_playground.main([]), 1)
        self.assertFalse(self.workspace.exists())
        self.assertIn("disk full", errors.getvalue())
        self.assertIn("saved work is preserved", errors.getvalue())
        launch.assert_not_called()

    def test_help_explains_recovery_without_creating_a_workspace(self) -> None:
        with mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(run_python_canvas_playground.main(["--help"]), 0)
        self.assertIn("keeping all previous work", output.getvalue())
        self.assertFalse(self.workspace.exists())

    def test_failed_environment_setup_preserves_work_and_can_be_retried(self) -> None:
        self.sync.side_effect = subprocess_error = (
            run_python_canvas_playground.subprocess.CalledProcessError(
                1, ["uv", "sync"]
            )
        )
        with (
            mock.patch.object(playground_server, "start") as launch,
            mock.patch("sys.stderr", new_callable=io.StringIO) as errors,
        ):
            self.assertEqual(run_python_canvas_playground.main(["--no-open"]), 1)
            launch.assert_not_called()
            self.assertIn("cannot sync project environment", errors.getvalue())
            self.assertIn(str(subprocess_error), errors.getvalue())
            self.assertTrue((self.workspace / "project.json").is_file())
        self.sync.side_effect = None
        with mock.patch.object(
            playground_server, "start", return_value={"url": "http://127.0.0.1:1234"}
        ):
            self.assertEqual(run_python_canvas_playground.main(["--no-open"]), 0)


if __name__ == "__main__":
    unittest.main()
