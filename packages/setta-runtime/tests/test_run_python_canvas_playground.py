from __future__ import annotations

import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import run_local_setta, run_python_canvas_playground


class PythonCanvasPlaygroundTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve() / "rocket-lab"
        patcher = mock.patch.object(
            run_python_canvas_playground, "WORKSPACE_ROOT", self.workspace
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_launch_copies_a_complete_example_and_preserves_later_edits(self) -> None:
        with mock.patch.object(run_local_setta, "main", return_value=0) as launch:
            self.assertEqual(run_python_canvas_playground.main(["--no-open"]), 0)
            launch.assert_called_once_with(
                [
                    "python-canvas",
                    "open",
                    "--project",
                    str(self.workspace / "project.json"),
                    "--no-open",
                ]
            )
            source = self.workspace / "rocket_lab.py"
            self.assertIn("def trajectory", source.read_text(encoding="utf-8"))
            source.write_text("my experiment", encoding="utf-8")
            self.assertEqual(run_python_canvas_playground.main([]), 0)
        self.assertEqual(source.read_text(encoding="utf-8"), "my experiment")
        self.assertIn(
            "def trajectory",
            (run_python_canvas_playground.FIXTURE_ROOT / "rocket_lab.py").read_text(
                encoding="utf-8"
            ),
        )

    def test_fresh_launch_keeps_previous_work_and_can_be_resumed(self) -> None:
        run_python_canvas_playground.prepare_workspace()
        original = self.workspace / "rocket_lab.py"
        original.write_text("my experiment", encoding="utf-8")
        with mock.patch.object(run_local_setta, "main", return_value=0) as launch:
            self.assertEqual(
                run_python_canvas_playground.main(["--fresh", "--no-open"]), 0
            )
            fresh = Path(launch.call_args.args[0][3]).parent
            self.assertNotEqual(fresh, self.workspace)
            self.assertIn(
                "def trajectory", (fresh / "rocket_lab.py").read_text(encoding="utf-8")
            )
            self.assertEqual(
                run_python_canvas_playground.main(["--workspace", str(fresh)]), 0
            )
            self.assertEqual(launch.call_args.args[0][3], str(fresh / "project.json"))
        self.assertEqual(original.read_text(encoding="utf-8"), "my experiment")

    def test_partial_copy_is_not_published(self) -> None:
        with (
            mock.patch.object(
                run_python_canvas_playground.shutil,
                "copytree",
                side_effect=OSError("disk full"),
            ),
            mock.patch.object(run_local_setta, "main") as launch,
            mock.patch("sys.stderr", new_callable=io.StringIO) as errors,
        ):
            self.assertEqual(run_python_canvas_playground.main([]), 1)
        self.assertFalse(self.workspace.exists())
        self.assertIn("disk full", errors.getvalue())
        self.assertIn("--fresh", errors.getvalue())
        launch.assert_not_called()

    def test_help_explains_recovery_without_creating_a_workspace(self) -> None:
        with mock.patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(run_python_canvas_playground.main(["--help"]), 0)
        self.assertIn("keeping all previous work", output.getvalue())
        self.assertFalse(self.workspace.exists())

    def test_rocket_example_reports_physics_and_handles_invalid_settings(self) -> None:
        path = run_python_canvas_playground.FIXTURE_ROOT / "rocket_lab.py"
        spec = importlib.util.spec_from_file_location("rocket_lab", path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        earth = module.trajectory("Earth", 30, 45, 9.81)
        moon = module.trajectory("Moon", 30, 45, 1.62)
        self.assertIn("Range 91.7 m", earth)
        self.assertIn("Range 555.6 m", moon)
        self.assertIn("Air time 26.2 s", moon)
        self.assertIn("Try a positive", module.trajectory("Earth", 30, 45, 0))
        self.assertIn(
            "finite numbers", module.trajectory("Earth", float("nan"), 45, 9.81)
        )


if __name__ == "__main__":
    unittest.main()
