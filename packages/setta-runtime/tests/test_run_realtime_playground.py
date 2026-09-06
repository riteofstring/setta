from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import run_local_setta, run_realtime_playground


class RealtimePlaygroundRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.fixture = self.root / "fixture"
        self.workspace = self.root / "workspace"
        fixture_patch = mock.patch.object(
            run_realtime_playground, "FIXTURE_ROOT", self.fixture
        )
        workspace_patch = mock.patch.object(
            run_realtime_playground, "WORKSPACE_ROOT", self.workspace
        )
        fixture_patch.start()
        workspace_patch.start()
        self.addCleanup(fixture_patch.stop)
        self.addCleanup(workspace_patch.stop)

    def test_first_run_seeds_fixture_and_opens_staged_workspace(self) -> None:
        _write_project(self.fixture, "fixture")
        extra = self.fixture / "assets" / "palette.txt"
        extra.parent.mkdir()
        extra.write_text("neon", encoding="utf-8")
        with mock.patch.object(run_local_setta, "main", return_value=7) as local_main:
            status = run_realtime_playground.main([])
        self.assertEqual(status, 7)
        self.assertEqual(_file_tree(self.workspace), _file_tree(self.fixture))
        local_main.assert_called_once_with(
            [
                "realtime",
                "open",
                "--project-root",
                str(self.workspace),
            ]
        )

    def test_existing_workspace_is_preserved_before_open(self) -> None:
        _write_project(self.fixture, "fixture")
        _write_project(self.workspace, "edited")
        sentinel = self.workspace / "local-state.txt"
        sentinel.write_text("keep", encoding="utf-8")
        before = _file_tree(self.workspace)
        with mock.patch.object(run_local_setta, "main", return_value=0) as local_main:
            status = run_realtime_playground.main([])
        self.assertEqual(status, 0)
        self.assertEqual(_file_tree(self.workspace), before)
        local_main.assert_called_once()

    def test_missing_required_fixture_file_does_not_create_workspace(self) -> None:
        _write_project(self.fixture, "fixture")
        (self.fixture / "uv.toml").unlink()
        stderr = io.StringIO()
        with (
            mock.patch.object(run_realtime_playground.sys, "stderr", stderr),
            mock.patch.object(run_local_setta, "main") as local_main,
        ):
            status = run_realtime_playground.main([])
        self.assertEqual(status, 1)
        self.assertIn("uv.toml", stderr.getvalue())
        self.assertFalse(self.workspace.exists())
        local_main.assert_not_called()

    def test_copy_failure_leaves_no_partial_workspace(self) -> None:
        _write_project(self.fixture, "fixture")
        extra = self.fixture / "assets" / "palette.txt"
        extra.parent.mkdir()
        extra.write_text("neon", encoding="utf-8")

        def fail_after_copy(
            source: Path,
            destination: Path,
            *,
            symlinks: bool,
            dirs_exist_ok: bool,
        ) -> None:
            self.assertTrue(symlinks)
            self.assertTrue(dirs_exist_ok)
            for relative in run_realtime_playground.REQUIRED_FILES:
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((source / relative).read_bytes())
            raise OSError("injected copy failure")

        stderr = io.StringIO()
        with (
            mock.patch.object(run_realtime_playground.sys, "stderr", stderr),
            mock.patch.object(
                run_realtime_playground.shutil,
                "copytree",
                side_effect=fail_after_copy,
            ),
            mock.patch.object(run_local_setta, "main") as local_main,
        ):
            status = run_realtime_playground.main([])
        self.assertEqual(status, 1)
        self.assertIn("injected copy failure", stderr.getvalue())
        self.assertFalse(self.workspace.exists())
        self.assertEqual(tuple(self.workspace.parent.glob(".neon-sketch-*")), ())
        local_main.assert_not_called()

    def test_required_fixture_symlink_is_rejected_before_copy(self) -> None:
        _write_project(self.fixture, "fixture")
        source = self.root / "outside.py"
        source.write_text("outside", encoding="utf-8")
        app = self.fixture / "app.py"
        app.unlink()
        try:
            app.symlink_to(source)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with mock.patch.object(run_local_setta, "main") as local_main:
            status = run_realtime_playground.main([])
        self.assertEqual(status, 1)
        self.assertFalse(self.workspace.exists())
        local_main.assert_not_called()

    def test_required_workspace_symlink_is_rejected_without_mutation(self) -> None:
        _write_project(self.fixture, "fixture")
        _write_project(self.workspace, "edited")
        source = self.root / "outside.py"
        source.write_text("outside", encoding="utf-8")
        app = self.workspace / "app.py"
        app.unlink()
        try:
            app.symlink_to(source)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        with mock.patch.object(run_local_setta, "main") as local_main:
            status = run_realtime_playground.main([])
        self.assertEqual(status, 1)
        self.assertTrue(app.is_symlink())
        local_main.assert_not_called()


def _write_project(root: Path, marker: str) -> None:
    for relative in run_realtime_playground.REQUIRED_FILES:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{marker}:{relative.as_posix()}", encoding="utf-8")


def _file_tree(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }
