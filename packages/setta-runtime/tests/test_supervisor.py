from __future__ import annotations

import ctypes
import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from setta.errors import RuntimeExecutionError
from setta.supervisor import (
    _BACKEND_CLEANUP_BUDGET_SECONDS,
    _FORCED_REAP_SECONDS,
    _GRACEFUL_SHUTDOWN_SECONDS,
    _WINDOWS_GUARDIAN_PRELUDE,
    _WINDOWS_GUARDIAN_RELEASE_TOKEN,
    _WINDOWS_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
    _WINDOWS_JOB_OBJECT_LIMIT_KILL_ON_CLOSE,
    ExpectedReadiness,
    ManagedServer,
    NativeServerSupervisor,
    ServerReadiness,
    _create_windows_process_tree,
    _PosixProcessTree,
    _start_process,
    _start_windows_process,
    _StartedProcess,
    _windows_guardian_arguments,
    _WindowsJobObjectExtendedLimitInformation,
    _WindowsProcessTree,
)


class NativeServerSupervisorTests(unittest.TestCase):
    def test_native_server_process_declares_strict_utf8(self) -> None:
        with (
            mock.patch("setta.supervisor.os.name", "posix"),
            mock.patch("setta.supervisor.subprocess.Popen") as popen,
        ):
            _start_process(["native-server"], None)

        self.assertTrue(popen.call_args.kwargs["text"])
        self.assertEqual(popen.call_args.kwargs["encoding"], "utf-8")
        self.assertEqual(popen.call_args.kwargs["errors"], "strict")
        self.assertEqual(Path(popen.call_args.args[0][1]).name, "_guardian.py")
        self.assertEqual(popen.call_args.args[0][2], "--")

    def test_windows_server_is_assigned_to_an_owned_job(self) -> None:
        tree = mock.Mock()
        process = mock.Mock()
        process.stdin = mock.Mock()
        with (
            mock.patch(
                "setta.supervisor._create_windows_process_tree", return_value=tree
            ),
            mock.patch("setta.supervisor._WINDOWS_NEW_PROCESS_GROUP", 512),
            mock.patch(
                "setta.supervisor.subprocess.Popen", return_value=process
            ) as popen,
        ):
            launched = _start_windows_process(["native-server"], None)

        self.assertIs(launched.process, process)
        self.assertIs(launched.tree, tree)
        tree.assign.assert_called_once_with(process)
        self.assertEqual(popen.call_args.kwargs["creationflags"], 512)
        self.assertEqual(popen.call_args.kwargs["encoding"], "utf-8")
        self.assertEqual(popen.call_args.kwargs["errors"], "strict")

    def test_windows_bootstrap_joins_the_job_before_native_server_release(
        self,
    ) -> None:
        tree = mock.Mock()
        events: list[str] = []
        process = mock.Mock()
        process.stdin = mock.Mock()
        tree.assign.side_effect = lambda _process: events.append("assign-job")
        process.stdin.write.side_effect = lambda _token: events.append("release")
        with (
            mock.patch(
                "setta.supervisor._create_windows_process_tree", return_value=tree
            ),
            mock.patch(
                "setta.supervisor.subprocess.Popen", return_value=process
            ) as popen,
        ):
            _start_windows_process(
                ["native-server-雪", "--project", "project"], "cwd-工作"
            )

        self.assertEqual(events, ["assign-job", "release"])
        self.assertEqual(
            process.stdin.write.call_args.args, (_WINDOWS_GUARDIAN_RELEASE_TOKEN,)
        )
        process.stdin.flush.assert_called_once_with()
        command = popen.call_args.args[0]
        self.assertEqual(
            command[0:5], [sys.executable, "-I", "-S", "-c", _WINDOWS_GUARDIAN_PRELUDE]
        )
        self.assertEqual(command[6:], ["native-server-雪", "--project", "project"])
        self.assertEqual(popen.call_args.kwargs["cwd"], "cwd-工作")
        self.assertNotIn("env", popen.call_args.kwargs)

    def test_windows_bootstrap_release_failure_stops_the_assigned_tree(self) -> None:
        tree = mock.Mock()
        process = mock.Mock()
        process.stdin = mock.Mock()
        process.stdin.write.side_effect = OSError("bootstrap input failed")
        with (
            mock.patch(
                "setta.supervisor._create_windows_process_tree", return_value=tree
            ),
            mock.patch("setta.supervisor.subprocess.Popen", return_value=process),
            self.assertRaises(OSError),
        ):
            _start_windows_process(["native-server"], None)

        tree.assign.assert_called_once_with(process)
        tree.force_stop.assert_called_once_with(process)
        tree.close.assert_called_once_with()

    def test_windows_bootstrap_keeps_the_assigned_owner_alive_for_child_readiness(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            working_directory = root / "工作目录"
            working_directory.mkdir()
            child = root / "native-server.py"
            child.write_text(
                "import json\n"
                "import os\n"
                "import sys\n"
                "print(json.dumps({'owner': os.getppid(), 'cwd': os.getcwd(), "
                "'value': os.environ['SETTA_BOOTSTRAP_VALUE']}), flush=True)\n"
                "sys.stdin.read()\n",
                encoding="utf-8",
            )
            environment = dict(os.environ)
            environment["SETTA_BOOTSTRAP_VALUE"] = "環境-雪"
            process = subprocess.Popen(
                _windows_guardian_arguments([sys.executable, str(child)]),
                cwd=working_directory,
                env=environment,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="strict",
            )
            try:
                stdin = process.stdin
                stdout = process.stdout
                if stdin is None or stdout is None:
                    self.fail("Windows guardian did not expose its lifetime pipes")
                stdin.write(_WINDOWS_GUARDIAN_RELEASE_TOKEN)
                stdin.flush()
                readiness = json.loads(stdout.readline())
                self.assertEqual(readiness["owner"], process.pid)
                self.assertEqual(readiness["cwd"], str(working_directory.resolve()))
                self.assertEqual(readiness["value"], "環境-雪")
                self.assertIsNone(process.poll())
                stdin.close()
                self.assertEqual(process.wait(timeout=2), 0)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=1)
                for stream in (process.stdin, process.stdout, process.stderr):
                    if stream is not None and not stream.closed:
                        stream.close()

    def test_windows_job_contract_enables_kill_on_close(self) -> None:
        kernel32 = mock.Mock()
        kernel32.CreateJobObjectW.return_value = 123
        kernel32.SetInformationJobObject.return_value = True
        with mock.patch("setta.supervisor._windows_kernel32", return_value=kernel32):
            tree = _create_windows_process_tree()

        call = kernel32.SetInformationJobObject.call_args
        self.assertEqual(call.args[1], _WINDOWS_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION)
        limits = ctypes.cast(
            call.args[2], ctypes.POINTER(_WindowsJobObjectExtendedLimitInformation)
        ).contents
        self.assertEqual(
            limits.basic_limit_information.limit_flags,
            _WINDOWS_JOB_OBJECT_LIMIT_KILL_ON_CLOSE,
        )
        kernel32.CloseHandle.return_value = True
        tree.close()
        tree.close()
        kernel32.CloseHandle.assert_called_once()

    def test_windows_job_assignment_failure_releases_partial_start(self) -> None:
        tree = mock.Mock()
        tree.assign.side_effect = OSError("assign failed")
        process = mock.Mock()
        with (
            mock.patch(
                "setta.supervisor._create_windows_process_tree", return_value=tree
            ),
            mock.patch("setta.supervisor.subprocess.Popen", return_value=process),
            self.assertRaises(OSError),
        ):
            _start_windows_process(["native-server"], None)

        tree.abort_unassigned.assert_called_once_with(process)
        tree.close.assert_called_once_with()
        process.terminate.assert_not_called()
        process.kill.assert_not_called()

    def test_windows_unassigned_abort_reports_a_process_that_will_not_reap(
        self,
    ) -> None:
        kernel32 = mock.Mock()
        kernel32.TerminateProcess.return_value = True
        process = mock.Mock()
        process.poll.return_value = None
        process._handle = 456
        tree = _WindowsProcessTree(123, kernel32)

        with (
            mock.patch("setta.supervisor._wait_for_process", return_value=False),
            self.assertRaisesRegex(
                OSError, "unassigned packaged server process exited"
            ),
        ):
            tree.abort_unassigned(process)

        kernel32.TerminateProcess.assert_called_once()

    def test_windows_force_stop_reports_a_tree_that_will_not_reap(self) -> None:
        kernel32 = mock.Mock()
        kernel32.CloseHandle.return_value = True
        process = mock.Mock()
        process.poll.return_value = None
        tree = _WindowsProcessTree(123, kernel32)

        with (
            mock.patch("setta.supervisor._wait_for_process", return_value=False),
            self.assertRaisesRegex(OSError, "process tree exited"),
        ):
            tree.force_stop(process)

        kernel32.CloseHandle.assert_called_once()
        kernel32.TerminateJobObject.assert_not_called()

    def test_partial_readiness_start_releases_the_owned_tree(self) -> None:
        events: list[str] = []
        process = mock.Mock()
        process.stdin = None
        process.stdout = mock.Mock()
        process.stderr = mock.Mock()
        process.stdout.close.side_effect = lambda: events.append("close-stdout")
        process.stderr.close.side_effect = lambda: events.append("close-stderr")
        process.poll.return_value = None
        tree = mock.Mock()
        tree.force_stop.side_effect = lambda _process: events.append("stop-tree")
        tree.close.side_effect = lambda: events.append("close-tree")
        with (
            mock.patch(
                "setta.supervisor._start_process",
                return_value=_StartedProcess(process=process, tree=tree),
            ),
            self.assertRaises(RuntimeExecutionError),
        ):
            NativeServerSupervisor().start(
                ["native-server"],
                ExpectedReadiness(
                    app_id="fixture-app",
                    project_path="/project",
                    instance_nonce="nonce",
                ),
            )

        tree.force_stop.assert_called_once_with(process)
        tree.close.assert_called_once_with()
        self.assertEqual(
            events,
            ["stop-tree", "close-stdout", "close-stderr", "close-tree"],
        )

    def test_start_failure_preserves_primary_and_all_cleanup_failures(self) -> None:
        process = mock.Mock()
        process.stdin = None
        process.stdout = mock.Mock()
        process.stderr = mock.Mock()
        process.poll.return_value = None
        tree = mock.Mock()
        tree.force_stop.side_effect = OSError("force stop failed")
        tree.close.side_effect = OSError("tree release failed")

        with (
            mock.patch(
                "setta.supervisor._start_process",
                return_value=_StartedProcess(process=process, tree=tree),
            ),
            self.assertRaises(RuntimeExecutionError) as raised,
        ):
            NativeServerSupervisor().start(
                ["native-server"],
                ExpectedReadiness(
                    app_id="fixture-app",
                    project_path="/project",
                    instance_nonce="nonce",
                ),
            )

        self.assertIn("did not expose its readiness stream", raised.exception.message)
        self.assertIn("force stop failed", raised.exception.message)
        self.assertIn("tree release failed", raised.exception.message)
        tree.force_stop.assert_called_once_with(process)
        tree.close.assert_called_once_with()

    def test_start_re_raises_system_exit_after_stopping_before_stream_cleanup(
        self,
    ) -> None:
        events: list[str] = []
        process = mock.Mock()
        process.stdin = mock.Mock()
        process.stdout = mock.Mock()
        process.stderr = mock.Mock()
        process.poll.return_value = None
        for name, stream in (
            ("close-stdin", process.stdin),
            ("close-stdout", process.stdout),
            ("close-stderr", process.stderr),
        ):
            stream.close.side_effect = lambda name=name: events.append(name)
        tree = mock.Mock()
        tree.force_stop.side_effect = lambda _process: events.append("stop-tree")
        tree.close.side_effect = lambda: events.append("close-tree")
        with (
            mock.patch(
                "setta.supervisor._start_process",
                return_value=_StartedProcess(process=process, tree=tree),
            ),
            mock.patch("setta.supervisor._drain_stream"),
            mock.patch("setta.supervisor._read_one_line", side_effect=SystemExit(17)),
            self.assertRaises(SystemExit) as raised,
        ):
            NativeServerSupervisor().start(
                ["native-server"],
                ExpectedReadiness(
                    app_id="fixture-app",
                    project_path="/project",
                    instance_nonce="nonce",
                ),
            )

        self.assertEqual(raised.exception.code, 17)
        self.assertEqual(
            events,
            ["stop-tree", "close-stdin", "close-stdout", "close-stderr", "close-tree"],
        )

    def test_start_keeps_cleanup_failures_visible_on_system_exit(self) -> None:
        process = mock.Mock()
        process.stdin = mock.Mock()
        process.stdout = mock.Mock()
        process.stderr = mock.Mock()
        process.poll.return_value = None
        tree = mock.Mock()
        tree.force_stop.side_effect = OSError("force stop failed")
        tree.close.side_effect = OSError("tree release failed")
        with (
            mock.patch(
                "setta.supervisor._start_process",
                return_value=_StartedProcess(process=process, tree=tree),
            ),
            mock.patch("setta.supervisor._drain_stream"),
            mock.patch("setta.supervisor._read_one_line", side_effect=SystemExit(23)),
            self.assertRaises(SystemExit) as raised,
        ):
            NativeServerSupervisor().start(
                ["native-server"],
                ExpectedReadiness(
                    app_id="fixture-app",
                    project_path="/project",
                    instance_nonce="nonce",
                ),
            )

        notes = "\n".join(getattr(raised.exception, "__notes__", ()))
        self.assertEqual(raised.exception.code, 23)
        self.assertIn("force stop failed", notes)
        self.assertIn("tree release failed", notes)

    def test_wait_foreground_keeps_keyboard_interrupt_exit_semantics(self) -> None:
        process = mock.Mock()
        process.wait.side_effect = KeyboardInterrupt()
        tree = mock.Mock()
        stdin = mock.Mock()
        server = ManagedServer(
            process=process,
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id="fixture-app",
                project_path="/project",
                instance_nonce="nonce",
            ),
            stderr=mock.Mock(),
            tree=tree,
            stdin=stdin,
            stdout=mock.Mock(),
            stderr_stream=mock.Mock(),
        )

        with mock.patch("setta.supervisor._wait_for_process", return_value=True):
            exit_status = NativeServerSupervisor().wait_foreground(server)

        self.assertEqual(exit_status, 130)
        stdin.close.assert_called()
        tree.close.assert_called_once_with()

    def test_wait_foreground_re_raises_system_exit_after_cleanup(self) -> None:
        process = mock.Mock()
        process.wait.side_effect = SystemExit(19)
        tree = mock.Mock()
        stdin = mock.Mock()
        server = ManagedServer(
            process=process,
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id="fixture-app",
                project_path="/project",
                instance_nonce="nonce",
            ),
            stderr=mock.Mock(),
            tree=tree,
            stdin=stdin,
            stdout=mock.Mock(),
            stderr_stream=mock.Mock(),
        )

        with (
            mock.patch("setta.supervisor._wait_for_process", return_value=True),
            self.assertRaises(SystemExit) as raised,
        ):
            NativeServerSupervisor().wait_foreground(server)

        self.assertEqual(raised.exception.code, 19)
        stdin.close.assert_called()
        tree.close.assert_called_once_with()

    def test_windows_job_close_is_the_forced_tree_stop_and_is_idempotent(self) -> None:
        kernel32 = mock.Mock()
        kernel32.CloseHandle.return_value = True
        process = mock.Mock()
        process.poll.return_value = None
        tree = _WindowsProcessTree(123, kernel32)
        with mock.patch(
            "setta.supervisor._wait_for_process", return_value=True
        ) as wait:
            tree.force_stop(process)
            tree.close()

        kernel32.CloseHandle.assert_called_once()
        kernel32.TerminateJobObject.assert_not_called()
        kernel32.TerminateProcess.assert_not_called()
        wait.assert_called_once_with(process, _FORCED_REAP_SECONDS)
        process.terminate.assert_not_called()
        process.kill.assert_not_called()

    def test_windows_failed_job_close_terminates_the_whole_tree_and_retries(
        self,
    ) -> None:
        kernel32 = mock.Mock()
        kernel32.CloseHandle.side_effect = (False, True)
        kernel32.TerminateJobObject.return_value = True
        process = mock.Mock()
        process.poll.return_value = None
        tree = _WindowsProcessTree(123, kernel32)
        with (
            mock.patch("setta.supervisor._wait_for_process", return_value=True),
            self.assertRaises(OSError),
        ):
            tree.force_stop(process)

        self.assertIsNone(tree._handle)
        kernel32.TerminateJobObject.assert_called_once()
        kernel32.TerminateProcess.assert_not_called()
        process.terminate.assert_not_called()
        process.kill.assert_not_called()
        self.assertEqual(kernel32.CloseHandle.call_count, 2)

    def test_windows_root_exit_surfaces_job_release_failure(
        self,
    ) -> None:
        kernel32 = mock.Mock()
        kernel32.CloseHandle.side_effect = (False, True)
        kernel32.TerminateJobObject.return_value = True
        process = mock.Mock()
        process.wait.return_value = 0
        tree = _WindowsProcessTree(123, kernel32)
        server = ManagedServer(
            process=process,
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id="fixture-app",
                project_path="/project",
                instance_nonce="nonce",
            ),
            stderr=mock.Mock(),
            tree=tree,
            stdin=mock.Mock(),
            stdout=mock.Mock(),
            stderr_stream=mock.Mock(),
        )

        with self.assertRaises(RuntimeExecutionError):
            NativeServerSupervisor().wait_foreground(server)

        kernel32.TerminateJobObject.assert_called_once_with(mock.ANY, mock.ANY)
        self.assertEqual(kernel32.CloseHandle.call_count, 2)

    def test_stop_gives_backend_cleanup_time_before_forcing_the_tree(self) -> None:
        process = mock.Mock()
        process.poll.return_value = None
        tree = mock.Mock()
        server = ManagedServer(
            process=process,
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id="fixture-app",
                project_path="/project",
                instance_nonce="nonce",
            ),
            stderr=mock.Mock(),
            tree=tree,
            stdin=mock.Mock(),
            stdout=mock.Mock(),
            stderr_stream=mock.Mock(),
        )
        with mock.patch(
            "setta.supervisor._wait_for_process", return_value=False
        ) as wait:
            NativeServerSupervisor().stop(server)

        self.assertEqual(
            _GRACEFUL_SHUTDOWN_SECONDS,
            _BACKEND_CLEANUP_BUDGET_SECONDS + 1.0,
        )
        wait.assert_called_once_with(process, _GRACEFUL_SHUTDOWN_SECONDS)
        tree.force_stop.assert_called_once_with(process)
        tree.close.assert_called_once_with()

    def test_stop_preserves_force_and_tree_release_failures(self) -> None:
        process = mock.Mock()
        process.poll.return_value = None
        tree = mock.Mock()
        tree.force_stop.side_effect = OSError("force stop failed")
        tree.close.side_effect = OSError("tree release failed")
        server = ManagedServer(
            process=process,
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id="fixture-app",
                project_path="/project",
                instance_nonce="nonce",
            ),
            stderr=mock.Mock(),
            tree=tree,
            stdin=mock.Mock(),
            stdout=mock.Mock(),
            stderr_stream=mock.Mock(),
        )

        with (
            mock.patch("setta.supervisor._wait_for_process", return_value=False),
            self.assertRaises(RuntimeExecutionError) as raised,
        ):
            NativeServerSupervisor().stop(server)

        self.assertIn("force stop failed", raised.exception.message)
        self.assertIn("tree release failed", raised.exception.message)
        tree.force_stop.assert_called_once_with(process)
        tree.close.assert_called_once_with()

    def test_wait_foreground_preserves_wait_and_tree_release_failures(self) -> None:
        process = mock.Mock()
        process.wait.side_effect = OSError("wait failed")
        tree = mock.Mock()
        tree.close.side_effect = OSError("tree release failed")
        server = ManagedServer(
            process=process,
            readiness=ServerReadiness(
                url="http://127.0.0.1:43123",
                app_id="fixture-app",
                project_path="/project",
                instance_nonce="nonce",
            ),
            stderr=mock.Mock(),
            tree=tree,
            stdin=mock.Mock(),
            stdout=mock.Mock(),
            stderr_stream=mock.Mock(),
        )

        with self.assertRaises(RuntimeExecutionError) as raised:
            NativeServerSupervisor().wait_foreground(server)

        self.assertIn("wait failed", raised.exception.message)
        self.assertIn("tree release failed", raised.exception.message)
        tree.close.assert_called_once_with()

    def test_posix_force_stops_the_guardian_process_group(self) -> None:
        process = mock.Mock()
        process.pid = 500
        process.poll.return_value = None
        events: list[tuple[str, signal.Signals | float]] = []

        def signal_group(target: object, delivery: signal.Signals) -> None:
            self.assertIs(target, process)
            events.append(("group", delivery))

        outcomes = iter((False, True))

        def wait_for_process(target: object, timeout: float) -> bool:
            self.assertIs(target, process)
            events.append(("wait", timeout))
            return next(outcomes)

        with (
            mock.patch(
                "setta.supervisor._signal_posix_process_group", side_effect=signal_group
            ),
            mock.patch(
                "setta.supervisor._wait_for_process", side_effect=wait_for_process
            ),
        ):
            _PosixProcessTree().force_stop(process)

        self.assertEqual(
            events,
            [
                ("group", signal.SIGTERM),
                ("wait", _FORCED_REAP_SECONDS),
                ("group", signal.SIGKILL),
                ("wait", _FORCED_REAP_SECONDS),
            ],
        )

    def test_posix_force_does_nothing_after_the_guardian_exits(self) -> None:
        process = mock.Mock()
        process.pid = 500
        process.poll.return_value = 0

        with mock.patch("setta.supervisor._signal_posix_process_group") as patched:
            _PosixProcessTree().force_stop(process)

        patched.assert_not_called()

    def test_posix_force_reports_signal_failure_and_a_surviving_tree(self) -> None:
        process = mock.Mock()
        process.pid = 500
        process.poll.return_value = None
        denied = PermissionError("signal denied")

        with (
            mock.patch(
                "setta.supervisor._signal_posix_process_group",
                side_effect=(denied, None),
            ) as signal_group,
            mock.patch(
                "setta.supervisor._wait_for_process", side_effect=(False, False)
            ) as wait,
            self.assertRaises(OSError) as raised,
        ):
            _PosixProcessTree().force_stop(process)

        self.assertIn("signal denied", str(raised.exception))
        self.assertIn("process tree exited", str(raised.exception))
        self.assertEqual(
            signal_group.call_args_list,
            [
                mock.call(process, signal.SIGTERM),
                mock.call(process, signal.SIGKILL),
            ],
        )
        self.assertEqual(wait.call_count, 2)

    def test_startup_eof_includes_the_native_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            server = root / "server.py"
            server.write_text(
                "import sys\n"
                "sys.stderr.write('project directory is missing\\n')\n"
                "sys.stderr.flush()\n",
                encoding="utf-8",
            )
            supervisor = NativeServerSupervisor(readiness_timeout=1)

            with self.assertRaises(RuntimeExecutionError) as raised:
                supervisor.start(
                    [sys.executable, server],
                    ExpectedReadiness(
                        app_id="python-canvas",
                        project_path=str(root / "project.json"),
                        instance_nonce="nonce",
                    ),
                )

            self.assertIn("readiness message is incomplete", raised.exception.message)
            self.assertIn("project directory is missing", raised.exception.message)

    def test_startup_preserves_non_ascii_utf8_readiness_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project_path = str(root / "café" / "東京.canvas.json")
            server = root / "server.py"
            server.write_text(
                "import json\n"
                "import sys\n"
                f"project = {project_path!r}\n"
                "readiness = {\n"
                "    'app': 'fixture-app',\n"
                "    'nonce': 'nonce',\n"
                "    'project': project,\n"
                "    'url': 'http://127.0.0.1:43123',\n"
                "}\n"
                "sys.stdout.buffer.write(\n"
                "    json.dumps(readiness, ensure_ascii=False).encode('utf-8') "
                "+ b'\\n'\n"
                ")\n"
                "sys.stdout.buffer.flush()\n"
                "sys.stdin.read()\n",
                encoding="utf-8",
            )
            supervisor = NativeServerSupervisor(readiness_timeout=1)
            managed = supervisor.start(
                [sys.executable, server],
                ExpectedReadiness(
                    app_id="fixture-app",
                    project_path=project_path,
                    instance_nonce="nonce",
                ),
            )
            try:
                self.assertEqual(managed.readiness.project_path, project_path)
            finally:
                supervisor.stop(managed)

    def test_invalid_utf8_readiness_fails_with_a_typed_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            server = root / "server.py"
            server.write_text(
                "import sys\n"
                "sys.stdout.buffer.write(b'\\xff\\n')\n"
                "sys.stdout.buffer.flush()\n"
                "sys.stdin.read()\n",
                encoding="utf-8",
            )
            supervisor = NativeServerSupervisor(readiness_timeout=1)

            with self.assertRaises(RuntimeExecutionError) as raised:
                supervisor.start(
                    [sys.executable, server],
                    ExpectedReadiness(
                        app_id="fixture-app",
                        project_path="/project",
                        instance_nonce="nonce",
                    ),
                )

            self.assertEqual(raised.exception.code, "runtime_failed")
            self.assertIn(
                "Unable to read the packaged server readiness message.",
                raised.exception.message,
            )

    def test_stop_closes_supervised_stdin_and_server_observes_eof(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary = Path(temporary_directory)
            marker = temporary / "eof.txt"
            stub = temporary / "server.py"
            stub.write_text(
                "import json\n"
                "import sys\n"
                "from pathlib import Path\n"
                "print(json.dumps({'app': 'fixture-app', 'nonce': 'nonce', "
                "'project': '/project', "
                "'url': 'http://127.0.0.1:43123'}), flush=True)\n"
                "sys.stdin.read()\n"
                "Path(sys.argv[1]).write_text('eof', encoding='utf-8')\n",
                encoding="utf-8",
            )
            supervisor = NativeServerSupervisor(readiness_timeout=2)
            managed = supervisor.start(
                [sys.executable, stub, marker],
                ExpectedReadiness(
                    app_id="fixture-app",
                    project_path="/project",
                    instance_nonce="nonce",
                ),
            )
            self.assertFalse(managed.stdin.closed)
            supervisor.stop(managed)
            self.assertTrue(managed.stdin.closed)
            self.assertEqual(managed.process.poll(), 0)
            self.assertEqual(marker.read_text(encoding="utf-8"), "eof")
