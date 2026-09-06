from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from scripts import run_local_setta


class LocalSettaRunnerTests(unittest.TestCase):
    def test_run_builds_and_reinstalls_before_forwarding_arguments(self) -> None:
        wheel = Path("/tmp/current-setta.whl")
        executable = Path("/tmp/local-setta")
        with (
            mock.patch.object(
                run_local_setta,
                "_required_command",
                side_effect=["/tools/uv", "/tools/pnpm"],
            ),
            mock.patch.object(
                run_local_setta, "_pinned_go", return_value=Path("/tools/go")
            ),
            mock.patch.object(run_local_setta, "_run") as run,
            mock.patch.object(
                run_local_setta, "_build_current_wheel", return_value=wheel
            ) as build,
            mock.patch.object(
                run_local_setta, "_install_current_wheel", return_value=executable
            ) as install,
            mock.patch.object(
                run_local_setta, "_run_foreground", return_value=7
            ) as foreground,
        ):
            status = run_local_setta.run(
                ("realtime", "open", "--project-root", "example")
            )
        self.assertEqual(status, 7)
        run.assert_called_once_with(
            ["/tools/pnpm", "install", "--frozen-lockfile"], run_local_setta.ROOT
        )
        self.assertEqual(build.call_args.args[0], Path("/tools/go"))
        install.assert_called_once_with("/tools/uv", wheel)
        foreground.assert_called_once_with(
            [
                str(executable),
                "realtime",
                "open",
                "--project-root",
                "example",
            ],
            run_local_setta.ROOT,
        )

    def test_install_replaces_same_version_setta_with_current_wheel(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            environment = root / "environment"
            uv = run_local_setta._required_command("uv")
            subprocess.run(
                [uv, "venv", "--python", sys.executable, str(environment)],
                check=True,
                capture_output=True,
                text=True,
            )
            old_wheel = _fixture_wheel(root / "old", "old")
            current_wheel = _fixture_wheel(root / "current", "current")
            with mock.patch.object(run_local_setta, "LOCAL_ENVIRONMENT", environment):
                run_local_setta._install_current_wheel(uv, old_wheel)
                self.assertEqual(_installed_marker(environment), "old")
                run_local_setta._install_current_wheel(uv, current_wheel)
                self.assertEqual(_installed_marker(environment), "current")

    def test_main_reports_setup_failure_without_traceback(self) -> None:
        with (
            mock.patch.object(
                run_local_setta,
                "run",
                side_effect=run_local_setta.LocalRunError("uv is required"),
            ),
            mock.patch.object(run_local_setta.sys, "stderr") as stderr,
        ):
            self.assertEqual(run_local_setta.main(["realtime"]), 1)
        stderr.write.assert_called_once_with("run_local_setta: uv is required\n")

    def test_foreground_interrupt_is_a_clean_local_shutdown(self) -> None:
        with mock.patch.object(
            run_local_setta.subprocess,
            "run",
            side_effect=KeyboardInterrupt,
        ):
            self.assertEqual(
                run_local_setta._run_foreground(
                    ["/local/setta", "realtime"], run_local_setta.ROOT
                ),
                0,
            )


def _fixture_wheel(directory: Path, marker: str) -> Path:
    directory.mkdir()
    wheel = directory / "setta-0.1.0-py3-none-any.whl"
    entries = {
        "setta/__init__.py": f'BUILD = "{marker}"\n',
        "setta/cli.py": "def main():\n    return 0\n",
        "setta-0.1.0.dist-info/METADATA": (
            "Metadata-Version: 2.4\nName: setta\nVersion: 0.1.0\n"
        ),
        "setta-0.1.0.dist-info/WHEEL": (
            "Wheel-Version: 1.0\nGenerator: test\nRoot-Is-Purelib: true\n"
            "Tag: py3-none-any\n"
        ),
        "setta-0.1.0.dist-info/entry_points.txt": (
            "[console_scripts]\nsetta = setta.cli:main\n"
        ),
    }
    record = "\n".join(f"{path},," for path in entries)
    record_path = "setta-0.1.0.dist-info/RECORD"
    entries[record_path] = f"{record}\n{record_path},,\n"
    with zipfile.ZipFile(wheel, "w") as archive:
        for path, content in entries.items():
            archive.writestr(path, content)
    return wheel


def _installed_marker(environment: Path) -> str:
    python, _ = run_local_setta._environment_executables(environment)
    completed = subprocess.run(
        [str(python), "-c", "import setta; print(setta.BUILD)"],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()
