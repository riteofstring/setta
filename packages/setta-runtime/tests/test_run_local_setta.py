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
    def test_build_for_one_app_is_reused_by_another(self) -> None:
        wheel = Path("/tmp/current-setta.whl")
        executable = Path("/tmp/local-setta")
        with (
            mock.patch.object(
                run_local_setta,
                "_required_command",
                return_value="/tools/uv",
            ),
            mock.patch.object(
                run_local_setta, "_pinned_go", return_value=Path("/tools/go")
            ),
            mock.patch.object(
                run_local_setta,
                "_local_build_state",
                return_value={"files": []},
            ),
            mock.patch.object(
                run_local_setta,
                "_cached_local_executable",
                side_effect=(None, executable),
            ) as cached,
            mock.patch.object(run_local_setta, "_record_local_build") as record,
            mock.patch.object(run_local_setta, "_run") as run,
            mock.patch.object(
                run_local_setta, "_build_current_wheel", return_value=wheel
            ) as build,
            mock.patch.object(
                run_local_setta, "_install_current_wheel", return_value=executable
            ) as install,
            mock.patch.object(
                run_local_setta, "_run_foreground", side_effect=(7, 9)
            ) as foreground,
        ):
            first_status = run_local_setta.run(("review", "open"))
            second_status = run_local_setta.run(
                ("experiment-lens", "open", "--project-root", "example")
            )
        self.assertEqual(first_status, 7)
        self.assertEqual(second_status, 9)
        self.assertEqual(
            cached.call_args_list,
            [mock.call({"files": []}), mock.call({"files": []})],
        )
        run.assert_not_called()
        self.assertEqual(build.call_count, 1)
        self.assertEqual(build.call_args.args[0], Path("/tools/go"))
        self.assertIsInstance(build.call_args.args[1], Path)
        install.assert_called_once_with("/tools/uv", wheel)
        record.assert_called_once_with({"files": []})
        self.assertEqual(
            foreground.call_args_list,
            [
                mock.call([str(executable), "review", "open"], run_local_setta.ROOT),
                mock.call(
                    [
                        str(executable),
                        "experiment-lens",
                        "open",
                        "--project-root",
                        "example",
                    ],
                    run_local_setta.ROOT,
                ),
            ],
        )

    def test_run_reuses_current_installed_build_without_resolving_tools(self) -> None:
        executable = Path("/installed/setta")
        with (
            mock.patch.object(
                run_local_setta,
                "_local_build_state",
                return_value={"files": []},
            ),
            mock.patch.object(
                run_local_setta,
                "_cached_local_executable",
                return_value=executable,
            ) as cached,
            mock.patch.object(run_local_setta, "_required_command") as required,
            mock.patch.object(
                run_local_setta, "_run_foreground", return_value=9
            ) as foreground,
        ):
            status = run_local_setta.run(
                ("review", "open", "--project-root", "example")
            )
        self.assertEqual(status, 9)
        cached.assert_called_once_with({"files": []})
        required.assert_not_called()
        foreground.assert_called_once_with(
            [str(executable), "review", "open", "--project-root", "example"],
            run_local_setta.ROOT,
        )

    def test_shared_backend_edits_additions_and_removals_invalidate_the_build(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            backend = root / "packages" / "local-backend"
            backend.mkdir(parents=True)
            source = backend / "server.go"
            source.write_text("package server\n", encoding="utf-8")
            executable = root / "setta"
            executable.touch()
            with (
                mock.patch.object(run_local_setta, "ROOT", root),
                mock.patch.object(run_local_setta, "LOCAL_BUILD_INPUTS", (backend,)),
                mock.patch.object(
                    run_local_setta, "LOCAL_BUILD_STATE", root / "state.json"
                ),
                mock.patch.object(
                    run_local_setta,
                    "_environment_executables",
                    return_value=(executable, executable),
                ),
                mock.patch.object(
                    run_local_setta, "_installed_app_assets_valid", return_value=True
                ),
            ):
                for change in (
                    lambda: source.write_text("package changed\n", encoding="utf-8"),
                    lambda: (backend / "added.go").write_text(
                        "package added\n", encoding="utf-8"
                    ),
                    lambda: (backend / "added.go").unlink(),
                ):
                    run_local_setta._record_local_build(
                        run_local_setta._local_build_state()
                    )
                    self.assertEqual(
                        run_local_setta._cached_local_executable(
                            run_local_setta._local_build_state()
                        ),
                        executable,
                    )
                    change()
                    self.assertIsNone(
                        run_local_setta._cached_local_executable(
                            run_local_setta._local_build_state()
                        )
                    )

    def test_local_build_record_requires_every_current_app_install(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            environment = root / "environment"
            state = root / "local-build.json"
            _, setta = run_local_setta._environment_executables(environment)
            setta.parent.mkdir(parents=True)
            setta.touch()
            with (
                mock.patch.object(run_local_setta, "LOCAL_ENVIRONMENT", environment),
                mock.patch.object(run_local_setta, "LOCAL_BUILD_STATE", state),
                mock.patch.object(
                    run_local_setta,
                    "_installed_app_assets_valid",
                    return_value=True,
                ) as assets_valid,
            ):
                run_local_setta._record_local_build({"files": []})
                self.assertEqual(
                    run_local_setta._cached_local_executable({"files": []}), setta
                )
                self.assertIsNone(
                    run_local_setta._cached_local_executable({"files": ["changed"]})
                )
        self.assertEqual(
            assets_valid.call_args_list,
            [mock.call(app_id) for app_id in run_local_setta.PACKAGED_APP_IDS],
        )

    def test_local_build_cache_rejects_a_missing_app_install(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            environment = root / "environment"
            state = root / "local-build.json"
            _, setta = run_local_setta._environment_executables(environment)
            setta.parent.mkdir(parents=True)
            setta.touch()
            state.write_text('{"files": []}\n', encoding="utf-8")
            with (
                mock.patch.object(run_local_setta, "LOCAL_ENVIRONMENT", environment),
                mock.patch.object(run_local_setta, "LOCAL_BUILD_STATE", state),
                mock.patch.object(
                    run_local_setta,
                    "_installed_app_assets_valid",
                    side_effect=(True, False),
                ) as assets_valid,
            ):
                self.assertIsNone(
                    run_local_setta._cached_local_executable({"files": []})
                )
        self.assertEqual(
            assets_valid.call_args_list,
            [mock.call("experiment-lens"), mock.call("python-canvas")],
        )

    def test_wheel_build_uses_the_complete_build_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel_directory = Path(temporary_directory)
            wheel = wheel_directory / "setta.whl"
            wheel.touch()
            with mock.patch.object(run_local_setta, "_run") as run:
                built = run_local_setta._build_current_wheel(
                    Path("/tools/go"), wheel_directory
                )
            self.assertEqual(built, wheel)
            run.assert_called_once_with(
                [
                    sys.executable,
                    str(run_local_setta.BUILD_SCRIPT),
                    "--go",
                    "/tools/go",
                    "--wheel-dir",
                    str(wheel_directory),
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
