from __future__ import annotations

import base64
import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from unittest import mock

TEST_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(TEST_ROOT / "packages" / "setta-runtime" / "scripts"))

import smoke_setta_wheel as smoke  # pyright: ignore[reportMissingImports]
from setta_wheel_smoke import (
    acceptance,  # pyright: ignore[reportMissingImports]
    models,  # pyright: ignore[reportMissingImports]
    process,  # pyright: ignore[reportMissingImports]
)


class WheelInspectionTests(unittest.TestCase):
    def test_accepts_a_closed_platform_wheel_with_manifest_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(Path(temporary_directory))
            inspection = smoke.inspect_wheel(wheel)
        self.assertEqual(inspection.version, "1.2.3")
        self.assertEqual(inspection.platform_tag, "macosx_13_0_arm64")
        self.assertEqual(inspection.target, ("darwin", "arm64"))
        self.assertEqual(inspection.native_member, "setta/_runtime/bin/python-canvas")
        self.assertIn(
            "setta/_runtime/python-canvas/web/index.html", inspection.web_members
        )

    def test_rejects_a_source_tree_path_even_when_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(
                Path(temporary_directory),
                extra_entries={"apps/python-canvas/source.go": b"source must not ship"},
            )
            with self.assertRaises(smoke.SmokeError):
                smoke.inspect_wheel(wheel)

    def test_accepts_the_installed_app_adapter_package(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(
                Path(temporary_directory),
                extra_entries={
                    "setta/apps/__init__.py": b"",
                    "setta/apps/python_canvas.py": b"",
                },
            )
            smoke.inspect_wheel(wheel)

    def test_rejects_a_nested_package_manager_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(
                Path(temporary_directory),
                extra_entries={"setta/node_modules/example/package.json": b"{}"},
            )
            with self.assertRaisesRegex(smoke.SmokeError, "package-manager path"):
                smoke.inspect_wheel(wheel)

    def test_rejects_a_retired_console_alias(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(
                Path(temporary_directory),
                entry_points="[console_scripts]\nsetta = setta.cli:main\npython-canvas = setta.cli:main\n",
            )
            with self.assertRaisesRegex(smoke.SmokeError, "retired python-canvas"):
                smoke.inspect_wheel(wheel)

    def test_rejects_an_unexpected_policy_platform_tag(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(Path(temporary_directory))
            with self.assertRaisesRegex(smoke.SmokeError, "does not match expected"):
                smoke.inspect_wheel(wheel, expected_platform_tag="macosx_14_0_arm64")

    def test_rejects_the_unpublished_windows_arm64_platform_tag(self) -> None:
        with self.assertRaisesRegex(
            smoke.SmokeError, "unsupported Setta release platform"
        ):
            models.target_for_platform_tag("win_arm64")

    def test_smoke_accepts_exactly_the_five_release_platform_tags(self) -> None:
        self.assertEqual(
            models.PLATFORM_TAG_TARGETS,
            {
                "macosx_13_0_arm64": ("darwin", "arm64"),
                "macosx_13_0_x86_64": ("darwin", "amd64"),
                "manylinux_2_28_aarch64": ("linux", "arm64"),
                "manylinux_2_28_x86_64": ("linux", "amd64"),
                "win_amd64": ("windows", "amd64"),
            },
        )

    def test_rejects_a_manifest_target_that_disagrees_with_the_wheel_tag(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel = _write_wheel(
                Path(temporary_directory),
                manifest_target={"arch": "amd64", "os": "darwin"},
            )
            with self.assertRaisesRegex(
                smoke.SmokeError, "does not match the wheel platform tag"
            ):
                smoke.inspect_wheel(wheel)


class PublicContractValidationTests(unittest.TestCase):
    def test_runtime_environment_removes_selectors_and_has_only_the_clean_scripts_path(
        self,
    ) -> None:
        environment = process.scrubbed_environment(
            {
                "PATH": "/repository/bin:/tools",
                "PYTHONHOME": "/ambient/python",
                "PYTHONPATH": "/repository/packages",
                "PYTHONUTF8": "1",
                "VIRTUAL_ENV": "/ambient/venv",
                "SETTA_PYTHON": "/ambient/setta-python",
                "NODE_PATH": "/repository/node_modules",
                "LD_LIBRARY_PATH": "/repository/lib",
                "UNCHANGED": "value",
            },
            path="/clean/venv/bin",
        )
        self.assertEqual(environment["PATH"], "/clean/venv/bin")
        self.assertEqual(environment["PYTHONUTF8"], "1")
        self.assertEqual(environment["UNCHANGED"], "value")
        for key in (
            "PYTHONHOME",
            "PYTHONPATH",
            "VIRTUAL_ENV",
            "SETTA_PYTHON",
            "NODE_PATH",
            "LD_LIBRARY_PATH",
        ):
            self.assertNotIn(key, environment)

    def test_windows_runtime_path_has_only_clean_scripts_and_system32(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            scripts = Path(temporary_directory) / "Scripts"
            scripts.mkdir()
            with (
                mock.patch.object(process, "_WINDOWS", True),
                mock.patch.object(
                    process,
                    "windows_system_directory",
                    return_value=Path("C:/Windows/System32"),
                ),
            ):
                environment = process.runtime_environment(scripts)
        self.assertEqual(
            environment["PATH"], f"{scripts.resolve()};C:/Windows/System32"
        )

    @unittest.skipIf(
        process._WINDOWS, "POSIX virtual environments use a Python symlink"
    )
    def test_venv_python_preserves_its_launcher_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "environment"
            scripts = root / "bin"
            scripts.mkdir(parents=True)
            target = root / "base-python"
            target.write_bytes(b"base interpreter")
            target.chmod(0o755)
            launcher = scripts / "python"
            launcher.symlink_to(target)
            self.assertEqual(process.venv_python(root), launcher)

    def test_public_readiness_rejects_extensions_and_requires_exact_loopback_origin(
        self,
    ) -> None:
        readiness: dict[str, object] = {
            "schemaVersion": "setta-open/v1",
            "appId": "python-canvas",
            "projectPath": "/tmp/project/canvas.json",
            "url": "http://127.0.0.1:43123",
        }
        self.assertEqual(
            acceptance.assert_open_readiness(readiness, "/tmp/project/canvas.json"),
            "http://127.0.0.1:43123",
        )
        readiness["unexpected"] = True
        with self.assertRaises(smoke.SmokeError):
            acceptance.assert_open_readiness(readiness, "/tmp/project/canvas.json")

    def test_ai_run_result_enforces_bounded_streams_and_exit_semantics(self) -> None:
        result: dict[str, object] = {
            "projectId": "id:project",
            "revision": 1,
            "stdout": "",
            "stderr": "",
            "stdoutTruncated": False,
            "stderrTruncated": False,
            "exitCode": 0,
            "terminationReason": "exited",
            "elapsedMilliseconds": 1,
        }
        acceptance.assert_ai_run_result(result, "id:project", 1)
        result["terminationReason"] = "timed_out"
        with self.assertRaises(smoke.SmokeError):
            acceptance.assert_ai_run_result(result, "id:project", 1)

    def test_offline_schema_requires_the_public_dotted_session_command(self) -> None:
        document: dict[str, object] = {
            "commands": [
                {"name": name}
                for name in (
                    "schema",
                    "open",
                    "session.inspect",
                    "snapshot",
                    "apply",
                    "run",
                )
            ],
            "errors": [],
            "operations": [],
            "results": [],
            "v2Vocabulary": {},
            "version": "v2",
        }
        acceptance.assert_offline_schema_document(document)
        document["commands"] = [
            {"name": name}
            for name in ("schema", "open", "session", "snapshot", "apply", "run")
        ]
        with self.assertRaisesRegex(smoke.SmokeError, "public AI-native commands"):
            acceptance.assert_offline_schema_document(document)

    def test_blank_project_run_requires_normal_zero_exit(self) -> None:
        result: dict[str, object] = {
            "projectId": "id:project",
            "revision": 1,
            "stdout": "",
            "stderr": "",
            "stdoutTruncated": False,
            "stderrTruncated": False,
            "exitCode": 0,
            "terminationReason": "exited",
            "elapsedMilliseconds": 1,
        }
        acceptance.assert_normal_blank_project_run_result(result)
        result["exitCode"] = 1
        with self.assertRaises(smoke.SmokeError):
            acceptance.assert_normal_blank_project_run_result(result)

    @unittest.skipIf(
        process._WINDOWS, "POSIX virtual environments use a Python symlink"
    )
    def test_clean_launcher_report_requires_the_clean_venv_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            base_prefix = root / "base-python"
            base_prefix.mkdir()
            base_python = base_prefix / "python"
            base_python.write_bytes(b"base interpreter")
            launcher = root / "clean-environment" / "bin" / "python"
            launcher.parent.mkdir(parents=True)
            launcher.symlink_to(base_python)
            report = {
                "basePrefix": str(base_prefix),
                "executable": str(base_python),
                "prefix": str(launcher.parent.parent),
            }
            acceptance.assert_clean_launcher_report(json.dumps(report), launcher)
            report["prefix"] = str(base_prefix)
            with self.assertRaises(models.SmokeError):
                acceptance.assert_clean_launcher_report(json.dumps(report), launcher)

    def test_deterministic_apply_uses_the_installed_cli_and_reaps_its_input(
        self,
    ) -> None:
        expected = models.ProjectIdentity("project:wheel", "Untitled", 1)
        applied: dict[str, object] = {
            "version": "v2",
            "project": {
                "id": "project:wheel",
                "name": "Setta Wheel Acceptance",
                "revision": 2,
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            operation = root / "operation.json"

            def invoke(
                command: object, *arguments: object, **keywords: object
            ) -> dict[str, object]:
                self.assertEqual(
                    command,
                    (
                        "/clean/bin/setta",
                        "python-canvas",
                        "apply",
                        "--project",
                        "/project/canvas.json",
                        "--file",
                        str(operation),
                    ),
                )
                self.assertEqual(
                    json.loads(operation.read_text(encoding="utf-8")),
                    {"name": "Setta Wheel Acceptance", "operation": "project.rename"},
                )
                return applied

            with mock.patch.object(acceptance, "run_json_command", side_effect=invoke):
                acceptance.assert_deterministic_apply(
                    Path("/clean/bin/setta"),
                    {},
                    root,
                    Path("/project/canvas.json"),
                    expected,
                    operation,
                )
            self.assertFalse(operation.exists())

    def test_terminal_probe_closes_the_same_origin_terminal(self) -> None:
        origin = "http://127.0.0.1:43123"
        opened = models.HTTPResult(
            url=origin + "/api/v2/project/terminal",
            status=200,
            content_type="application/json",
            body=b'{"created":true,"columns":80,"rows":24}',
        )
        closed = models.HTTPResult(
            url=origin + "/api/v2/project/terminal/close",
            status=204,
            content_type="text/plain",
            body=b"",
        )
        with mock.patch.object(
            acceptance, "http_post_json", side_effect=[opened, closed]
        ) as request:
            acceptance.exercise_same_origin_terminal(origin, "project:wheel")
        self.assertEqual(
            request.call_args_list,
            [
                mock.call(
                    origin + "/api/v2/project/terminal",
                    {"projectId": "project:wheel", "columns": 80, "rows": 24},
                ),
                mock.call(
                    origin + "/api/v2/project/terminal/close",
                    {"projectId": "project:wheel"},
                ),
            ],
        )

    def test_html_asset_selection_does_not_accept_an_external_url(self) -> None:
        with self.assertRaises(smoke.SmokeError):
            acceptance.find_same_origin_asset(
                "http://127.0.0.1:43123",
                b'<script src="https://example.test/app.js"></script>',
            )


class WheelSmokeContainmentTests(unittest.TestCase):
    @unittest.skipIf(process._WINDOWS, "POSIX-only retained session containment")
    def test_retained_posix_session_stops_app_after_outer_launcher_exits(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            child_marker = root / "child.pid"
            guardian_source = (
                "from pathlib import Path\n"
                "import signal, subprocess, sys, time\n"
                "signal.signal(signal.SIGINT, signal.SIG_IGN)\n"
                "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "child = subprocess.Popen((sys.executable, '-c', "
                '"import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)"))\n'
                f"Path({str(child_marker)!r}).write_text(str(child.pid), encoding='ascii')\n"
                "time.sleep(60)\n"
            )
            outer_source = (
                "import subprocess, sys\n"
                f"child = subprocess.Popen((sys.executable, '-c', {guardian_source!r}), "
                "start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n"
                "print(child.pid, flush=True)\n"
            )
            completed = subprocess.run(
                (sys.executable, "-c", outer_source),
                check=True,
                capture_output=True,
                text=True,
                timeout=5.0,
            )
            guardian_pid = int(completed.stdout.strip())
            child_pid = _wait_for_marker_pid(child_marker)
            retained = process._capture_posix_app_session(
                models.LiveSessionIdentity(
                    project_path=str(root / "canvas.json"),
                    url="http://127.0.0.1:43123",
                    owner_pid=guardian_pid,
                    instance_nonce="x" * 16,
                )
            )
            try:
                with (
                    mock.patch.object(process, "APP_SESSION_GRACE_SECONDS", 0.05),
                    mock.patch.object(
                        process, "APP_SESSION_FORCE_SETTLE_SECONDS", 0.05
                    ),
                ):
                    retained.force_stop()
                _wait_for_pid_exit(guardian_pid)
                _wait_for_pid_exit(child_pid)
            finally:
                _kill_test_session(guardian_pid)

    def test_failed_live_assertion_cleans_and_verifies_before_reraising(self) -> None:
        live = mock.Mock()
        live.wait_for_readiness.return_value = json.dumps(
            {
                "schemaVersion": "setta-open/v1",
                "appId": "python-canvas",
                "projectPath": "/unused",
                "url": "http://127.0.0.1:43123",
            }
        ).encode()
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            project = root / "project" / "canvas.json"
            readiness = json.loads(live.wait_for_readiness.return_value)
            readiness["projectPath"] = str(project.resolve(strict=False))
            live.wait_for_readiness.return_value = json.dumps(readiness).encode()
            session = {
                "formatVersion": "setta-live-session/v1",
                "appId": "python-canvas",
                "projectPath": str(project.resolve(strict=False)),
                "url": "http://127.0.0.1:43123",
                "ownerPid": 123,
                "instanceNonce": "x" * 16,
            }
            with (
                mock.patch.object(
                    acceptance, "start_foreground_open", return_value=live
                ),
                mock.patch.object(acceptance, "run_json_command", return_value=session),
                mock.patch.object(
                    acceptance,
                    "assert_same_origin_http",
                    side_effect=models.SmokeError("primary acceptance failure"),
                ),
                mock.patch.object(
                    acceptance,
                    "assert_session_cleanup",
                    side_effect=models.SmokeError("session cleanup failure"),
                ) as session_cleanup,
                mock.patch.object(
                    acceptance, "assert_server_unavailable"
                ) as unavailable,
                self.assertRaisesRegex(
                    models.SmokeError,
                    "primary acceptance failure; cleanup also failed: session cleanup failure",
                ),
            ):
                acceptance.exercise_live_server(
                    Path("/clean/bin/setta"),
                    {},
                    root,
                    root,
                    Path("/clean/bin/python"),
                )
            live.retain_app_session.assert_called_once()
            live.terminate.assert_called_once()
            live.cleanup_retained_session.assert_called_once()
            session_cleanup.assert_called_once()
            unavailable.assert_called_once_with(
                "http://127.0.0.1:43123",
                timeout=models.APP_SESSION_VERIFY_TIMEOUT_SECONDS,
            )

    def test_non_smoke_failure_still_runs_every_cleanup_step(self) -> None:
        live = mock.Mock()
        live.wait_for_readiness.return_value = json.dumps(
            {
                "schemaVersion": "setta-open/v1",
                "appId": "python-canvas",
                "projectPath": "/unused",
                "url": "http://127.0.0.1:43123",
            }
        ).encode()
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            project = root / "project" / "canvas.json"
            readiness = json.loads(live.wait_for_readiness.return_value)
            readiness["projectPath"] = str(project.resolve(strict=False))
            live.wait_for_readiness.return_value = json.dumps(readiness).encode()
            session = {
                "formatVersion": "setta-live-session/v1",
                "appId": "python-canvas",
                "projectPath": str(project.resolve(strict=False)),
                "url": "http://127.0.0.1:43123",
                "ownerPid": 123,
                "instanceNonce": "x" * 16,
            }
            with (
                mock.patch.object(
                    acceptance, "start_foreground_open", return_value=live
                ),
                mock.patch.object(acceptance, "run_json_command", return_value=session),
                mock.patch.object(
                    acceptance,
                    "assert_same_origin_http",
                    side_effect=OSError("unexpected transport failure"),
                ),
                mock.patch.object(
                    acceptance,
                    "assert_session_cleanup",
                    side_effect=models.SmokeError("session cleanup failure"),
                ) as session_cleanup,
                mock.patch.object(
                    acceptance, "assert_server_unavailable"
                ) as unavailable,
                self.assertRaisesRegex(
                    OSError, "unexpected transport failure"
                ) as raised,
            ):
                acceptance.exercise_live_server(
                    Path("/clean/bin/setta"),
                    {},
                    root,
                    root,
                    Path("/clean/bin/python"),
                )
            live.terminate.assert_called_once()
            live.cleanup_retained_session.assert_called_once()
            session_cleanup.assert_called_once()
            unavailable.assert_called_once()
            self.assertIn(
                "Setta wheel smoke cleanup also failed: session cleanup failure",
                getattr(raised.exception, "__notes__", []),
            )

    def test_windows_bootstrap_is_assigned_before_it_is_released(self) -> None:
        fake_process = mock.Mock()
        fake_process.stdin = mock.Mock()
        events: list[str] = []
        fake_process.stdin.write.side_effect = lambda _value: events.append("release")
        tree = mock.Mock()
        tree.assign.side_effect = lambda _value: events.append("assign")
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            with (
                mock.patch.object(process, "_WINDOWS", True),
                mock.patch.object(
                    process, "_create_windows_foreground_tree", return_value=tree
                ),
                mock.patch.object(
                    process.subprocess, "Popen", return_value=fake_process
                ) as spawned,
            ):
                result, result_tree = process.popen_foreground(
                    ("/clean/Scripts/setta.exe", "python-canvas", "open"),
                    cwd=root,
                    env={},
                    stdin=subprocess.DEVNULL,
                )
        self.assertIs(result, fake_process)
        self.assertIs(result_tree, tree)
        self.assertEqual(events, ["assign", "release"])
        bootstrap = spawned.call_args.args[0]
        self.assertEqual(
            bootstrap[-3:], ("/clean/Scripts/setta.exe", "python-canvas", "open")
        )
        self.assertEqual(spawned.call_args.kwargs["stdin"], subprocess.PIPE)

    def test_windows_bootstrap_keeps_its_pid_and_never_execs_the_launcher(self) -> None:
        prelude = process._WINDOWS_BOOTSTRAP_PRELUDE
        self.assertIn("subprocess.Popen(sys.argv[2:]", prelude)
        self.assertIn("child.wait()", prelude)
        self.assertIn(
            "signal.signal(signal.SIGINT,signal.SIG_IGN)",
            prelude,
        )
        self.assertIn(
            "signal.signal(signal.SIGBREAK,signal.SIG_IGN)",
            prelude,
        )
        self.assertLess(
            prelude.index("child=subprocess.Popen"),
            prelude.index("signal.signal(signal.SIGINT"),
        )
        self.assertNotIn("execv", prelude)

    def test_windows_bootstrap_skips_its_private_label_and_runs_exact_command(
        self,
    ) -> None:
        child = (
            sys.executable,
            "-I",
            "-S",
            "-c",
            "import sys;print(sys.argv[1],flush=True)",
            "exact-child-argument",
        )
        bootstrap = subprocess.Popen(
            (
                sys.executable,
                "-I",
                "-S",
                "-c",
                process._WINDOWS_BOOTSTRAP_PRELUDE,
                "setta-wheel-smoke-bootstrap",
                *child,
            ),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
        )
        try:
            self.assertIsNotNone(bootstrap.stdin)
            bootstrap.stdin.write(process._WINDOWS_BOOTSTRAP_RELEASE_TOKEN)
            bootstrap.stdin.flush()
            stdout, stderr = bootstrap.communicate(timeout=5.0)
        finally:
            if bootstrap.poll() is None:
                bootstrap.kill()
                bootstrap.wait(timeout=2.0)
        self.assertEqual(bootstrap.returncode, 0, stderr)
        self.assertEqual(stdout.strip(), b"exact-child-argument")

    def test_windows_job_close_failure_terminates_before_retrying_close(self) -> None:
        kernel32 = mock.Mock()
        kernel32.CloseHandle.side_effect = (False, True)
        kernel32.TerminateJobObject.return_value = True
        tree = process._WindowsForegroundTree(37, kernel32)
        with self.assertRaises(OSError):
            tree.close()
        kernel32.TerminateJobObject.assert_called_once()
        self.assertEqual(kernel32.CloseHandle.call_count, 2)


def _wait_for_marker_pid(marker: Path) -> int:
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        try:
            published = marker.read_text(encoding="ascii").strip()
        except FileNotFoundError:
            published = ""
        if published.isdecimal() and int(published) > 0:
            return int(published)
        time.sleep(0.01)
    raise AssertionError("guardian did not publish its child PID")


def _wait_for_pid_exit(pid: int) -> None:
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.02)
    raise AssertionError(f"process {pid} survived containment cleanup")


def _kill_test_session(session_leader: int) -> None:
    try:
        if os.getsid(session_leader) == session_leader:
            os.killpg(session_leader, 9)
    except OSError:
        return


def _write_wheel(
    directory: Path,
    *,
    entry_points: str = "[console_scripts]\nsetta = setta.cli:main\n",
    extra_entries: dict[str, bytes] | None = None,
    manifest_target: dict[str, str] | None = None,
) -> Path:
    wheel = directory / "setta-1.2.3-py3-none-macosx_13_0_arm64.whl"
    runtime = {
        "bin/python-canvas": (b"native-server", True),
        "python-canvas/web/assets/app-abc.js": (b"console.log('setta')", False),
        "python-canvas/web/index.html": (
            b"<script src='/assets/app-abc.js'></script>",
            False,
        ),
    }
    assets = [
        {
            "executable": executable,
            "path": path,
            "sha256": hashlib.sha256(content).hexdigest(),
        }
        for path, (content, executable) in sorted(runtime.items())
    ]
    manifest = {
        "apps": [
            {
                "id": "python-canvas",
                "nativeServer": "bin/python-canvas",
                "webRoot": "python-canvas/web",
            }
        ],
        "assets": assets,
        "formatVersion": "setta-runtime/v1",
        "target": manifest_target or {"arch": "arm64", "os": "darwin"},
    }
    entries: dict[str, tuple[bytes, int]] = {
        "setta/__init__.py": (b"__version__ = '1.2.3'\n", 0o644),
        "setta/__main__.py": (b"", 0o644),
        "setta/cli.py": (b"", 0o644),
        "setta/_runtime/manifest.json": (
            json.dumps(manifest, separators=(",", ":"), sort_keys=True).encode("utf-8"),
            0o644,
        ),
        "setta-1.2.3.dist-info/METADATA": (
            b"Metadata-Version: 2.3\nName: setta\nVersion: 1.2.3\n",
            0o644,
        ),
        "setta-1.2.3.dist-info/WHEEL": (
            b"Wheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: py3-none-macosx_13_0_arm64\n",
            0o644,
        ),
        "setta-1.2.3.dist-info/entry_points.txt": (entry_points.encode("utf-8"), 0o644),
    }
    for relative, (content, executable) in runtime.items():
        entries["setta/_runtime/" + relative] = (
            content,
            0o755 if executable else 0o644,
        )
    for path, content in (extra_entries or {}).items():
        entries[path] = (content, 0o644)
    record_lines = []
    for path, (content, _mode) in sorted(entries.items()):
        digest = (
            base64.urlsafe_b64encode(hashlib.sha256(content).digest())
            .decode("ascii")
            .rstrip("=")
        )
        record_lines.append(f"{path},sha256={digest},{len(content)}")
    record_name = "setta-1.2.3.dist-info/RECORD"
    entries[record_name] = (
        ("\n".join([*record_lines, f"{record_name},,"]) + "\n").encode("utf-8"),
        0o644,
    )
    with zipfile.ZipFile(wheel, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, (content, mode) in sorted(entries.items()):
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | mode) << 16
            archive.writestr(info, content)
    return wheel


if __name__ == "__main__":
    unittest.main()
