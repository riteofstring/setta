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
    def test_realtime_run_reuses_unrelated_app_assets(self) -> None:
        wheel = Path("/tmp/current-setta.whl")
        executable = Path("/tmp/local-setta")
        reusable = run_local_setta.ReusableAppAssets(
            native_server=Path("/installed/python-canvas"),
            web_root=Path("/installed/python-canvas-web"),
        )
        experiment_lens = run_local_setta.ReusableAppAssets(
            native_server=Path("/installed/experiment-lens"),
            web_root=Path("/installed/experiment-lens-web"),
        )
        review = run_local_setta.ReusableAppAssets(
            native_server=Path("/installed/review"),
            web_root=Path("/installed/review-web"),
        )
        with (
            mock.patch.object(
                run_local_setta,
                "_required_command",
                side_effect=["/tools/uv", "/tools/pnpm"],
            ),
            mock.patch.object(
                run_local_setta, "_pinned_go", return_value=Path("/tools/go")
            ),
            mock.patch.object(
                run_local_setta,
                "_realtime_build_fingerprint",
                return_value="realtime-inputs",
            ),
            mock.patch.object(
                run_local_setta,
                "_cached_realtime_executable",
                return_value=None,
            ),
            mock.patch.object(
                run_local_setta,
                "_realtime_reusable_assets",
                return_value={
                    "experiment-lens": experiment_lens,
                    "python-canvas": reusable,
                    "review": review,
                },
            ),
            mock.patch.object(run_local_setta, "_record_realtime_build") as record,
            mock.patch.object(run_local_setta, "_build_realtime_frontend") as frontend,
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
            [
                "/tools/pnpm",
                "install",
                "--frozen-lockfile",
                "--ignore-scripts",
            ],
            run_local_setta.ROOT,
        )
        frontend.assert_called_once_with("/tools/pnpm", Path("/tools/go"))
        self.assertEqual(build.call_args.args[0], Path("/tools/go"))
        self.assertEqual(
            build.call_args.args[2],
            {
                "experiment-lens": experiment_lens,
                "python-canvas": reusable,
                "review": review,
            },
        )
        install.assert_called_once_with("/tools/uv", wheel)
        record.assert_called_once_with("realtime-inputs")
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

    def test_first_run_builds_every_packaged_app(self) -> None:
        wheel = Path("/tmp/current-setta.whl")
        with (
            mock.patch.object(
                run_local_setta,
                "_required_command",
                side_effect=["/tools/uv", "/tools/pnpm"],
            ),
            mock.patch.object(
                run_local_setta, "_pinned_go", return_value=Path("/tools/go")
            ),
            mock.patch.object(
                run_local_setta,
                "_realtime_build_fingerprint",
                return_value="realtime-inputs",
            ),
            mock.patch.object(
                run_local_setta,
                "_cached_realtime_executable",
                return_value=None,
            ),
            mock.patch.object(
                run_local_setta, "_realtime_reusable_assets", return_value=None
            ),
            mock.patch.object(run_local_setta, "_record_realtime_build") as record,
            mock.patch.object(run_local_setta, "_build_realtime_frontend") as frontend,
            mock.patch.object(run_local_setta, "_run"),
            mock.patch.object(
                run_local_setta, "_build_current_wheel", return_value=wheel
            ) as build,
            mock.patch.object(
                run_local_setta,
                "_install_current_wheel",
                return_value=Path("/tmp/local-setta"),
            ),
            mock.patch.object(run_local_setta, "_run_foreground", return_value=0),
        ):
            self.assertEqual(run_local_setta.run(("realtime", "open")), 0)
        frontend.assert_not_called()
        self.assertIsNone(build.call_args.args[2])
        record.assert_called_once_with("realtime-inputs")

    def test_realtime_run_reuses_current_installed_build(self) -> None:
        executable = Path("/installed/setta")
        with (
            mock.patch.object(
                run_local_setta,
                "_realtime_build_fingerprint",
                return_value="realtime-inputs",
            ),
            mock.patch.object(
                run_local_setta,
                "_cached_realtime_executable",
                return_value=executable,
            ) as cached,
            mock.patch.object(run_local_setta, "_required_command") as required,
            mock.patch.object(
                run_local_setta, "_run_foreground", return_value=9
            ) as foreground,
        ):
            status = run_local_setta.run(
                ("realtime", "open", "--project-root", "example")
            )
        self.assertEqual(status, 9)
        cached.assert_called_once_with("realtime-inputs")
        required.assert_not_called()
        foreground.assert_called_once_with(
            [str(executable), "realtime", "open", "--project-root", "example"],
            run_local_setta.ROOT,
        )

    def test_realtime_build_fingerprint_tracks_input_content(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source.ts"
            source.write_text("first", encoding="utf-8")
            with (
                mock.patch.object(run_local_setta, "ROOT", root),
                mock.patch.object(run_local_setta, "REALTIME_BUILD_INPUTS", (source,)),
            ):
                first = run_local_setta._realtime_build_fingerprint()
                source.write_text("second", encoding="utf-8")
                second = run_local_setta._realtime_build_fingerprint()
        self.assertNotEqual(first, second)

    def test_realtime_build_record_requires_exact_current_install(self) -> None:
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
                    "_reusable_app_assets",
                    return_value=run_local_setta.ReusableAppAssets(
                        native_server=root / "realtime",
                        web_root=root / "web",
                    ),
                ),
            ):
                run_local_setta._record_realtime_build("current")
                self.assertEqual(
                    run_local_setta._cached_realtime_executable("current"), setta
                )
                self.assertIsNone(
                    run_local_setta._cached_realtime_executable("changed")
                )

    def test_targeted_wheel_build_reuses_unrelated_app_paths(self) -> None:
        reusable = {
            "experiment-lens": run_local_setta.ReusableAppAssets(
                native_server=Path("/installed/experiment-lens"),
                web_root=Path("/installed/experiment-lens-web"),
            ),
            "python-canvas": run_local_setta.ReusableAppAssets(
                native_server=Path("/installed/python-canvas"),
                web_root=Path("/installed/python-canvas-web"),
            ),
            "review": run_local_setta.ReusableAppAssets(
                native_server=Path("/installed/review"),
                web_root=Path("/installed/review-web"),
            ),
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel_directory = Path(temporary_directory)
            wheel = wheel_directory / "setta.whl"
            wheel.touch()
            with mock.patch.object(run_local_setta, "_run") as run:
                built = run_local_setta._build_current_wheel(
                    Path("/tools/go"), wheel_directory, reusable
                )
        self.assertEqual(built, wheel)
        command = run.call_args.args[0]
        self.assertIn("--skip-frontend-build", command)
        self.assertIn("experiment-lens=/installed/experiment-lens", command)
        self.assertIn("experiment-lens=/installed/experiment-lens-web", command)
        self.assertIn(
            "python-canvas=/installed/python-canvas",
            command,
        )
        self.assertIn(
            "python-canvas=/installed/python-canvas-web",
            command,
        )
        self.assertIn("review=/installed/review", command)
        self.assertIn("review=/installed/review-web", command)

    def test_targeted_realtime_build_requires_every_unrelated_app(self) -> None:
        lens = run_local_setta.ReusableAppAssets(
            native_server=Path("/installed/experiment-lens"),
            web_root=Path("/installed/experiment-lens-web"),
        )
        canvas = run_local_setta.ReusableAppAssets(
            native_server=Path("/installed/python-canvas"),
            web_root=Path("/installed/python-canvas-web"),
        )
        with mock.patch.object(
            run_local_setta,
            "_reusable_app_assets",
            side_effect=(lens, canvas, None),
        ) as lookup:
            self.assertIsNone(run_local_setta._realtime_reusable_assets())
        self.assertEqual(
            lookup.call_args_list,
            [
                mock.call("experiment-lens"),
                mock.call("python-canvas"),
                mock.call("review"),
            ],
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
