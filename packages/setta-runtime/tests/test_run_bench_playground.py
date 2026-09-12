from __future__ import annotations

import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import run_bench_playground, run_local_setta


class BenchPlaygroundRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.fixture = self.root / "fixture"
        self.workspace = self.root / "workspace"
        self.source = self.root / "candidate" / "main.go"
        for target, value in (
            ("FIXTURE_ROOT", self.fixture),
            ("WORKSPACE_ROOT", self.workspace),
            ("CANDIDATE_SOURCE", self.source),
            ("ROOT", self.root),
        ):
            patcher = mock.patch.object(run_bench_playground, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.source.parent.mkdir(parents=True)
        self.source.write_text("package main", encoding="utf-8")

    def test_first_run_seeds_fixture_builds_candidate_and_opens_workspace(self) -> None:
        _write_fixture(self.fixture)
        executable = self.workspace / ".local" / "bench" / "bin" / "candidate"

        def build(_workspace: Path) -> Path:
            executable.parent.mkdir(parents=True)
            executable.write_bytes(b"candidate")
            return executable

        with (
            mock.patch.object(
                run_bench_playground, "build_candidate", side_effect=build
            ),
            mock.patch.object(run_local_setta, "main", return_value=7) as local_main,
        ):
            status = run_bench_playground.main([])
        self.assertEqual(status, 7)
        self.assertFalse((self.workspace / "project.json").exists())
        self.assertTrue(
            (self.workspace / run_bench_playground.PROJECT_DESTINATION).is_file()
        )
        local_main.assert_called_once_with(
            ["bench", "open", "--project-root", str(self.workspace)]
        )

    def test_existing_workspace_is_preserved_before_candidate_rebuild(self) -> None:
        _write_workspace(self.workspace)
        sentinel = self.workspace / "local-state.txt"
        sentinel.write_text("keep", encoding="utf-8")
        binary_directory = self.workspace / ".local" / "bench" / "bin"
        with (
            mock.patch.object(
                run_bench_playground,
                "build_candidate",
                return_value=binary_directory / "thumbnail-candidate",
            ),
            mock.patch.object(run_local_setta, "main", return_value=0),
        ):
            self.assertEqual(run_bench_playground.main([]), 0)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_missing_or_symlink_fixture_input_prevents_workspace_creation(self) -> None:
        _write_fixture(self.fixture)
        missing = self.fixture / "inputs" / "product-10.png"
        missing.unlink()
        outside = self.root / "outside.png"
        outside.write_bytes(b"png")
        try:
            missing.symlink_to(outside)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        stderr = io.StringIO()
        with (
            mock.patch.object(run_bench_playground.sys, "stderr", stderr),
            mock.patch.object(run_local_setta, "main") as local_main,
        ):
            self.assertEqual(run_bench_playground.main([]), 1)
        self.assertIn("regular non-symlink", stderr.getvalue())
        self.assertFalse(self.workspace.exists())
        local_main.assert_not_called()

    def test_candidate_build_uses_locked_go_and_workspace_only_output(self) -> None:
        _write_workspace(self.workspace)
        go = Path("/tools/go")

        def build(command: list[str], **_keywords: object) -> None:
            output = Path(command[command.index("-o") + 1])
            output.write_bytes(b"binary")

        with (
            mock.patch.object(run_local_setta, "_pinned_go", return_value=go),
            mock.patch.object(
                run_bench_playground.subprocess, "run", side_effect=build
            ) as run,
        ):
            executable = run_bench_playground.build_candidate(self.workspace)
        self.assertTrue(executable.is_file())
        self.assertTrue(executable.is_relative_to(self.workspace))
        self.assertEqual(run.call_args.args[0][0], str(go))
        self.assertEqual(run.call_args.kwargs["env"]["GO111MODULE"], "off")

    def test_candidate_build_failure_prevents_open(self) -> None:
        _write_fixture(self.fixture)
        with (
            mock.patch.object(run_local_setta, "_pinned_go", return_value=Path("/go")),
            mock.patch.object(
                run_bench_playground.subprocess,
                "run",
                side_effect=OSError("unavailable"),
            ),
            mock.patch.object(run_local_setta, "main") as local_main,
        ):
            self.assertEqual(run_bench_playground.main([]), 1)
        local_main.assert_not_called()

    def test_open_temporarily_prepends_the_candidate_directory(self) -> None:
        binary_directory = self.root / "bin"
        previous = os.environ.get("PATH")

        def opened(_arguments: list[str]) -> int:
            self.assertEqual(
                os.environ["PATH"].split(os.pathsep)[0], str(binary_directory)
            )
            return 3

        with mock.patch.object(run_local_setta, "main", side_effect=opened):
            self.assertEqual(
                run_bench_playground.open_workspace(self.workspace, binary_directory), 3
            )
        self.assertEqual(os.environ.get("PATH"), previous)


def _write_fixture(root: Path) -> None:
    for relative in run_bench_playground.REQUIRED_FIXTURE_FILES:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(relative.as_posix().encode("utf-8"))


def _write_workspace(root: Path) -> None:
    for relative in run_bench_playground.REQUIRED_WORKSPACE_FILES:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(relative.as_posix().encode("utf-8"))


if __name__ == "__main__":
    unittest.main()
