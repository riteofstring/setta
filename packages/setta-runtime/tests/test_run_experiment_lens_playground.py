from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import run_experiment_lens_playground


class ExperimentLensPlaygroundRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.fixture = self.root / "fixture"
        self.workspace = self.root / "workspace"
        self.fixture.mkdir()
        (self.fixture / "experiment.json").write_text("{}\n", encoding="utf-8")
        data = self.fixture / "data"
        data.mkdir()
        (data / "observations.json").write_text("{}\n", encoding="utf-8")
        series = self.fixture / "artifacts" / "series"
        series.mkdir(parents=True)
        (series / "charge.json").write_text("{}\n", encoding="utf-8")
        thermal = self.fixture / "artifacts" / "thermal"
        thermal.mkdir()
        (thermal / "run-1.svg").write_text("<svg/>\n", encoding="utf-8")
        self.fixture_patch = mock.patch.object(
            run_experiment_lens_playground, "FIXTURE_ROOT", self.fixture
        )
        self.workspace_patch = mock.patch.object(
            run_experiment_lens_playground, "WORKSPACE_ROOT", self.workspace
        )
        self.fixture_patch.start()
        self.workspace_patch.start()
        self.addCleanup(self.fixture_patch.stop)
        self.addCleanup(self.workspace_patch.stop)

    def test_prepare_workspace_copies_the_immutable_fixture(self) -> None:
        workspace = run_experiment_lens_playground.prepare_workspace()
        self.assertEqual(workspace, self.workspace)
        self.assertEqual(
            (workspace / "experiment.json").read_text(encoding="utf-8"), "{}\n"
        )
        self.assertEqual(
            (workspace / "artifacts" / "thermal" / "run-1.svg").read_text(
                encoding="utf-8"
            ),
            "<svg/>\n",
        )

    def test_prepare_workspace_preserves_an_existing_valid_project(self) -> None:
        workspace = run_experiment_lens_playground.prepare_workspace()
        manifest = workspace / "experiment.json"
        manifest.write_text('{"name":"local"}\n', encoding="utf-8")
        self.assertEqual(run_experiment_lens_playground.prepare_workspace(), workspace)
        self.assertEqual(manifest.read_text(encoding="utf-8"), '{"name":"local"}\n')

    def test_main_prepares_and_opens_the_working_project(self) -> None:
        with mock.patch.object(
            run_experiment_lens_playground, "_open_workspace", return_value=7
        ) as open_workspace:
            self.assertEqual(run_experiment_lens_playground.main([]), 7)
        open_workspace.assert_called_once_with(self.workspace, no_open=False)

    def test_main_can_leave_the_browser_closed(self) -> None:
        with mock.patch.object(
            run_experiment_lens_playground, "_open_workspace", return_value=7
        ) as open_workspace:
            self.assertEqual(run_experiment_lens_playground.main(["--no-open"]), 7)
        open_workspace.assert_called_once_with(self.workspace, no_open=True)

    def test_main_rejects_arguments_without_touching_the_fixture(self) -> None:
        stderr = io.StringIO()
        with mock.patch.object(run_experiment_lens_playground.sys, "stderr", stderr):
            self.assertEqual(run_experiment_lens_playground.main(["--reset"]), 2)
        self.assertIn("unrecognized arguments: --reset", stderr.getvalue())
        self.assertFalse(self.workspace.exists())

    def test_fixture_symlink_is_rejected(self) -> None:
        target = self.fixture / "artifacts" / "thermal" / "run-1.svg"
        link = self.fixture / "artifacts" / "thermal" / "linked.svg"
        try:
            link.symlink_to(target)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with self.assertRaises(run_experiment_lens_playground.PlaygroundError):
            run_experiment_lens_playground.prepare_workspace()

    def test_fixture_requires_the_observation_source(self) -> None:
        (self.fixture / "data" / "observations.json").unlink()
        with self.assertRaises(run_experiment_lens_playground.PlaygroundError):
            run_experiment_lens_playground.prepare_workspace()

    def test_fixture_mutable_state_is_rejected(self) -> None:
        state = self.fixture / ".local"
        state.mkdir()
        (state / "state.json").write_text("{}\n", encoding="utf-8")
        with self.assertRaisesRegex(
            run_experiment_lens_playground.PlaygroundError, "mutable local state"
        ):
            run_experiment_lens_playground.prepare_workspace()


if __name__ == "__main__":
    unittest.main()
