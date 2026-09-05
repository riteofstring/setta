from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from setta import _guardian
from setta._guardian import (
    _CLEANUP_FAILURE_EXIT_CODE,
    _cleanup_session,
    _CleanupFailure,
    _guardian_exit_status,
    _guardian_members,
    _leaf_first,
    _parse_darwin_process_snapshot,
    _parse_linux_process_stat,
    _parse_process_snapshot,
    _process_session_id,
    _ProcessIdentity,
    _session_members,
    _signal_members,
    _worker_exit_status,
    _WorkerSignalForwarder,
)
from setta.supervisor import _start_process


class GuardianUnitTests(unittest.TestCase):
    def test_process_snapshot_parser_accepts_numeric_pid_ppid_sid_rows(self) -> None:
        records = _parse_process_snapshot(" 1 0 1\n 42 7 500\n 55 42 500\n 66 55 500\n")

        self.assertEqual(
            records,
            (
                _ProcessIdentity(1, 0, 1),
                _ProcessIdentity(42, 7, 500),
                _ProcessIdentity(55, 42, 500),
                _ProcessIdentity(66, 55, 500),
            ),
        )

    def test_malformed_process_snapshot_is_a_cleanup_failure(self) -> None:
        with self.assertRaises(_CleanupFailure):
            _parse_process_snapshot("42 nope 500\n")
        with self.assertRaises(_CleanupFailure):
            _parse_linux_process_stat(42, b"42 (server) R 1 2\n")

    def test_darwin_snapshot_uses_getsid_for_each_numeric_pid(self) -> None:
        with mock.patch("setta._guardian._process_session_id", side_effect=(500, 500)):
            records = _parse_darwin_process_snapshot("501 500\n502 501\n", 700)

        self.assertEqual(
            records,
            (
                _ProcessIdentity(501, 500, 500),
                _ProcessIdentity(502, 501, 500),
            ),
        )

    def test_session_members_exclude_guardian_and_snapshot_process(self) -> None:
        records = (
            _ProcessIdentity(500, 1, 500),
            _ProcessIdentity(501, 500, 500),
            _ProcessIdentity(502, 501, 500),
            _ProcessIdentity(600, 1, 600),
            _ProcessIdentity(700, 500, 500),
        )
        with mock.patch(
            "setta._guardian._process_snapshot", return_value=(records, 700)
        ):
            members = _session_members(500)

        self.assertEqual(
            members,
            (
                _ProcessIdentity(502, 501, 500),
                _ProcessIdentity(501, 500, 500),
            ),
        )

    def test_leaf_first_orders_known_descendants_before_their_parents(self) -> None:
        records = (
            _ProcessIdentity(25, 20, 500),
            _ProcessIdentity(10, 1, 500),
            _ProcessIdentity(30, 25, 500),
            _ProcessIdentity(20, 10, 500),
            _ProcessIdentity(40, 1, 500),
        )

        self.assertEqual(
            _leaf_first(records),
            (
                _ProcessIdentity(30, 25, 500),
                _ProcessIdentity(25, 20, 500),
                _ProcessIdentity(20, 10, 500),
                _ProcessIdentity(10, 1, 500),
                _ProcessIdentity(40, 1, 500),
            ),
        )

    def test_worker_status_preserves_exit_codes_and_signals(self) -> None:
        self.assertEqual(_worker_exit_status(23), 23)
        with mock.patch("setta._guardian._raise_worker_signal") as raise_signal:
            result = _worker_exit_status(-int(signal.SIGTERM))

        self.assertEqual(result, 128 + int(signal.SIGTERM))
        raise_signal.assert_called_once_with(signal.SIGTERM)

    def test_cleanup_failure_cannot_report_a_normal_worker_success(self) -> None:
        self.assertEqual(
            _guardian_exit_status(0, "the process snapshot is unavailable"),
            _CLEANUP_FAILURE_EXIT_CODE,
        )
        with mock.patch("setta._guardian._worker_exit_status", return_value=23):
            self.assertEqual(_guardian_exit_status(23, "survivors remain"), 23)

    def test_cleanup_reports_an_unavailable_snapshot_and_final_survivor(self) -> None:
        survivor = _ProcessIdentity(502, 500, 500)
        with mock.patch(
            "setta._guardian._guardian_members",
            side_effect=_CleanupFailure(
                "The guardian process snapshot is unavailable."
            ),
        ):
            self.assertEqual(
                _cleanup_session(500),
                "The guardian process snapshot is unavailable.",
            )
        with (
            mock.patch(
                "setta._guardian._guardian_members",
                side_effect=((), (), (survivor,), (survivor,)),
            ),
            mock.patch("setta._guardian._signal_members"),
            mock.patch("setta._guardian.time.sleep"),
        ):
            failure = _cleanup_session(500)

        self.assertEqual(failure, "Remaining guardian-session processes: 502.")

    def test_signal_members_revalidates_the_session_before_delivery(self) -> None:
        members = (
            _ProcessIdentity(501, 500, 500),
            _ProcessIdentity(502, 500, 500),
        )
        with (
            mock.patch("setta._guardian.sys.platform", "darwin"),
            mock.patch("setta._guardian._process_session_id", side_effect=(500, 600)),
            mock.patch("setta._guardian.os.kill") as kill,
        ):
            _signal_members(500, members, signal.SIGTERM)

        kill.assert_called_once_with(501, signal.SIGTERM)

    def test_permission_denied_while_stopping_is_a_cleanup_failure(self) -> None:
        member = _ProcessIdentity(501, 500, 500)
        delivery = getattr(signal, "SIGKILL", signal.SIGTERM)
        with (
            mock.patch("setta._guardian._guardian_member_matches", return_value=True),
            mock.patch(
                "setta._guardian.os.kill", side_effect=PermissionError("denied")
            ),
            self.assertRaises(_CleanupFailure),
        ):
            _signal_members(500, (member,), delivery)

    def test_linux_guardian_members_include_a_setsid_descendant(self) -> None:
        records = (
            _ProcessIdentity(500, 1, 500),
            _ProcessIdentity(501, 500, 500),
            _ProcessIdentity(502, 501, 502),
            _ProcessIdentity(700, 500, 500),
            _ProcessIdentity(800, 1, 800),
        )
        with (
            mock.patch("setta._guardian.sys.platform", "linux"),
            mock.patch(
                "setta._guardian._process_snapshot", return_value=(records, 700)
            ),
        ):
            members = _guardian_members(500)

        self.assertEqual(
            members,
            (
                _ProcessIdentity(502, 501, 502),
                _ProcessIdentity(501, 500, 500),
            ),
        )

    def test_permission_denied_while_verifying_is_a_cleanup_failure(self) -> None:
        with (
            mock.patch(
                "setta._guardian.os.getsid",
                side_effect=PermissionError("denied"),
                create=True,
            ),
            self.assertRaises(_CleanupFailure),
        ):
            _process_session_id(501)

    def test_late_signal_after_waiter_completion_never_targets_a_reused_pid(
        self,
    ) -> None:
        forwarder = _WorkerSignalForwarder()
        forwarder.wake()
        with mock.patch("setta._guardian.os.kill") as kill:
            forwarder.handle(int(signal.SIGTERM), None)

        kill.assert_not_called()

    def test_stalled_waiter_keeps_the_subreaper_until_a_late_reap(self) -> None:
        worker = mock.Mock()
        worker.poll.side_effect = (None, 0)
        waiter = mock.Mock()
        waiter.wait.side_effect = (False, True)
        waiter.error = None

        with mock.patch(
            "setta._guardian._cleanup_session", side_effect=(None, None, None)
        ) as cleanup:
            failure = _guardian._stop_and_reap_worker_boundary(worker, waiter, 500)

        self.assertIsNone(failure)
        self.assertEqual(
            cleanup.call_args_list,
            [
                mock.call(500, provisional_survivors=True),
                mock.call(500, provisional_survivors=True),
                mock.call(500, reap_adopted=True),
            ],
        )
        worker.kill.assert_called_once_with()
        self.assertEqual(
            waiter.wait.call_args_list,
            [
                mock.call(_guardian._FORCED_WORKER_REAP_SECONDS),
                mock.call(_guardian._FORCED_WORKER_REAP_SECONDS),
            ],
        )


@unittest.skipIf(os.name == "nt", "POSIX session containment is not used on Windows")
class GuardianIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(
        sys.platform.startswith("linux"),
        "Linux subreaper containment is required for setsid descendants",
    )
    def test_worker_exit_reaps_a_setsid_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "setsid-child.pid"
            worker = root / "setsid-worker.py"
            worker.write_text(
                "import os\n"
                "import signal\n"
                "import subprocess\n"
                "import sys\n"
                "import time\n"
                "from pathlib import Path\n"
                "\n"
                "if sys.argv[1] == 'child':\n"
                "    os.setsid()\n"
                "    signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "    Path(sys.argv[2]).write_text(str(os.getpid()), encoding='utf-8')\n"
                "    while True:\n"
                "        time.sleep(1)\n"
                "\n"
                "marker = Path(sys.argv[1])\n"
                "subprocess.Popen([sys.executable, __file__, 'child', str(marker)])\n"
                "deadline = time.monotonic() + 2\n"
                "while not marker.exists():\n"
                "    if time.monotonic() >= deadline:\n"
                "        raise SystemExit(24)\n"
                "    time.sleep(0.01)\n"
                "raise SystemExit(23)\n",
                encoding="utf-8",
            )
            guardian = subprocess.Popen(
                [
                    sys.executable,
                    str(Path(_guardian.__file__)),
                    "--",
                    sys.executable,
                    str(worker),
                    str(marker),
                ],
                start_new_session=True,
                stderr=subprocess.PIPE,
                stdout=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="strict",
            )
            child_pid: int | None = None
            try:
                guardian.wait(timeout=3)
                self.assertEqual(guardian.returncode, 23)
                child_pid = int(marker.read_text(encoding="utf-8"))
                self._assert_process_gone(child_pid)
            finally:
                if child_pid is None and marker.exists():
                    child_pid = int(marker.read_text(encoding="utf-8"))
                if child_pid is not None:
                    self._kill_if_live(child_pid)
                if guardian.poll() is None:
                    guardian.kill()
                    guardian.wait(timeout=1)
                for stream in (guardian.stdout, guardian.stderr):
                    if stream is not None:
                        stream.close()

    @unittest.skipUnless(
        sys.platform.startswith("linux"),
        "Linux subreaper containment is required for setsid descendants",
    )
    def test_clean_worker_exit_reaps_a_setsid_child_without_cleanup_failure(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "setsid-child.pid"
            worker = root / "setsid-worker.py"
            worker.write_text(
                "import subprocess\n"
                "import sys\n"
                "import time\n"
                "from pathlib import Path\n"
                "\n"
                "child = (\n"
                "    'import os, signal, sys, time; '\n"
                "    'from pathlib import Path; '\n"
                "    'os.setsid(); signal.signal(signal.SIGTERM, signal.SIG_IGN); '\n"
                "    'Path(sys.argv[1]).write_text(str(os.getpid()), "
                'encoding="utf-8"); \'\n'
                "    'time.sleep(60)'\n"
                ")\n"
                "marker = Path(sys.argv[1])\n"
                "subprocess.Popen([sys.executable, '-c', child, str(marker)])\n"
                "deadline = time.monotonic() + 2\n"
                "while not marker.exists():\n"
                "    if time.monotonic() >= deadline:\n"
                "        raise SystemExit(24)\n"
                "    time.sleep(0.01)\n"
                "raise SystemExit(0)\n",
                encoding="utf-8",
            )
            guardian = subprocess.Popen(
                [
                    sys.executable,
                    str(Path(_guardian.__file__)),
                    "--",
                    sys.executable,
                    str(worker),
                    str(marker),
                ],
                start_new_session=True,
                stderr=subprocess.PIPE,
                stdout=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="strict",
            )
            child_pid: int | None = None
            try:
                guardian.wait(timeout=3)
                self.assertEqual(guardian.returncode, 0)
                child_pid = int(marker.read_text(encoding="utf-8"))
                self._assert_process_gone(child_pid)
            finally:
                if child_pid is None and marker.exists():
                    child_pid = int(marker.read_text(encoding="utf-8"))
                if child_pid is not None:
                    self._kill_if_live(child_pid)
                if guardian.poll() is None:
                    guardian.kill()
                    guardian.wait(timeout=1)
                for stream in (guardian.stdout, guardian.stderr):
                    if stream is not None:
                        stream.close()

    def test_worker_crashes_repeatedly_and_reaps_setpgid_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            worker = root / "worker.py"
            worker.write_text(
                "import os\n"
                "import signal\n"
                "import subprocess\n"
                "import sys\n"
                "import time\n"
                "from pathlib import Path\n"
                "\n"
                "if sys.argv[1] == 'child':\n"
                "    os.setpgid(0, 0)\n"
                "    signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "    Path(sys.argv[2]).write_text(str(os.getpid()), encoding='utf-8')\n"
                "    while True:\n"
                "        time.sleep(1)\n"
                "\n"
                "marker = Path(sys.argv[1])\n"
                "subprocess.Popen([sys.executable, __file__, 'child', str(marker)])\n"
                "deadline = time.monotonic() + 2\n"
                "while not marker.exists():\n"
                "    if time.monotonic() >= deadline:\n"
                "        raise SystemExit(24)\n"
                "    time.sleep(0.01)\n"
                "time.sleep(0.05)\n"
                "raise SystemExit(23)\n",
                encoding="utf-8",
            )
            for attempt in range(3):
                marker = root / f"child-{attempt}.pid"
                guardian = subprocess.Popen(
                    [
                        sys.executable,
                        str(Path(_guardian.__file__)),
                        "--",
                        sys.executable,
                        str(worker),
                        str(marker),
                    ],
                    start_new_session=True,
                    stderr=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="strict",
                )
                child_pid: int | None = None
                try:
                    guardian.wait(timeout=2)
                    self.assertEqual(guardian.returncode, 23)
                    child_pid = int(marker.read_text(encoding="utf-8"))
                    self._assert_process_gone(child_pid)
                finally:
                    if child_pid is None and marker.exists():
                        child_pid = int(marker.read_text(encoding="utf-8"))
                    if child_pid is not None:
                        self._kill_if_live(child_pid)
                    if guardian.poll() is None:
                        guardian.kill()
                        guardian.wait(timeout=1)
                    if guardian.stdout is not None:
                        guardian.stdout.close()
                    if guardian.stderr is not None:
                        guardian.stderr.close()

    def test_sigkill_worker_status_propagates_without_setting_a_handler(self) -> None:
        guardian = subprocess.Popen(
            [
                sys.executable,
                str(Path(_guardian.__file__)),
                "--",
                sys.executable,
                "-c",
                "import os, signal; os.kill(os.getpid(), signal.SIGKILL)",
            ],
            start_new_session=True,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
        )
        try:
            guardian.wait(timeout=2)
            self.assertEqual(guardian.returncode, -int(signal.SIGKILL))
        finally:
            if guardian.poll() is None:
                guardian.kill()
                guardian.wait(timeout=1)

    def test_term_force_stops_an_ignoring_worker_and_separate_group_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "child.pid"
            ready = root / "worker-ready"
            worker = root / "ignoring-worker.py"
            worker.write_text(
                "import os\n"
                "import signal\n"
                "import subprocess\n"
                "import sys\n"
                "import time\n"
                "from pathlib import Path\n"
                "\n"
                "if sys.argv[1] == 'child':\n"
                "    os.setpgid(0, 0)\n"
                "    signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "    Path(sys.argv[2]).write_text(str(os.getpid()), encoding='utf-8')\n"
                "    while True:\n"
                "        time.sleep(1)\n"
                "\n"
                "marker = Path(sys.argv[1])\n"
                "subprocess.Popen([sys.executable, __file__, 'child', str(marker)])\n"
                "deadline = time.monotonic() + 2\n"
                "while not marker.exists():\n"
                "    if time.monotonic() >= deadline:\n"
                "        raise SystemExit(24)\n"
                "    time.sleep(0.01)\n"
                "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "(marker.parent / 'worker-ready').write_text("
                "'ready', encoding='utf-8')\n"
                "while True:\n"
                "    time.sleep(1)\n",
                encoding="utf-8",
            )
            launched = _start_process([sys.executable, worker, marker], None)
            guardian = launched.process
            child_pid: int | None = None
            try:
                self._wait_for_marker(ready)
                started = time.monotonic()
                launched.tree.force_stop(guardian)
                guardian.wait(timeout=1.5)
                self.assertLess(time.monotonic() - started, 1.5)
                self.assertEqual(guardian.returncode, -int(signal.SIGKILL))
                child_pid = int(marker.read_text(encoding="utf-8"))
                self._assert_process_gone(child_pid)
            finally:
                if child_pid is None and marker.exists():
                    child_pid = int(marker.read_text(encoding="utf-8"))
                if child_pid is not None:
                    self._kill_if_live(child_pid)
                if guardian.poll() is None:
                    guardian.kill()
                    guardian.wait(timeout=1)
                launched.tree.close()
                for stream in (guardian.stdin, guardian.stdout, guardian.stderr):
                    if stream is not None:
                        stream.close()

    @unittest.skipUnless(
        sys.platform.startswith("linux"),
        "Linux subreaper containment is required for setsid descendants",
    )
    def test_force_stop_reaps_a_setsid_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "setsid-child.pid"
            ready = root / "worker-ready"
            worker = root / "setsid-ignoring-worker.py"
            worker.write_text(
                "import os\n"
                "import signal\n"
                "import subprocess\n"
                "import sys\n"
                "import time\n"
                "from pathlib import Path\n"
                "\n"
                "if sys.argv[1] == 'child':\n"
                "    os.setsid()\n"
                "    signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "    Path(sys.argv[2]).write_text(str(os.getpid()), encoding='utf-8')\n"
                "    while True:\n"
                "        time.sleep(1)\n"
                "\n"
                "marker = Path(sys.argv[1])\n"
                "subprocess.Popen([sys.executable, __file__, 'child', str(marker)])\n"
                "deadline = time.monotonic() + 2\n"
                "while not marker.exists():\n"
                "    if time.monotonic() >= deadline:\n"
                "        raise SystemExit(24)\n"
                "    time.sleep(0.01)\n"
                "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
                "(marker.parent / 'worker-ready').write_text("
                "'ready', encoding='utf-8')\n"
                "while True:\n"
                "    time.sleep(1)\n",
                encoding="utf-8",
            )
            launched = _start_process([sys.executable, worker, marker], None)
            guardian = launched.process
            child_pid: int | None = None
            try:
                self._wait_for_marker(ready)
                launched.tree.force_stop(guardian)
                guardian.wait(timeout=2)
                child_pid = int(marker.read_text(encoding="utf-8"))
                self._assert_process_gone(child_pid)
            finally:
                if child_pid is None and marker.exists():
                    child_pid = int(marker.read_text(encoding="utf-8"))
                if child_pid is not None:
                    self._kill_if_live(child_pid)
                if guardian.poll() is None:
                    guardian.kill()
                    guardian.wait(timeout=1)
                launched.tree.close()
                for stream in (guardian.stdin, guardian.stdout, guardian.stderr):
                    if stream is not None:
                        stream.close()

    def _assert_process_gone(self, pid: int) -> None:
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.02)
        self.fail(f"escaped Setpgid child {pid} is still alive after guardian cleanup")

    @staticmethod
    def _wait_for_marker(marker: Path) -> None:
        deadline = time.monotonic() + 2
        while not marker.exists():
            if time.monotonic() >= deadline:
                raise AssertionError("worker did not start its separate-group child")
            time.sleep(0.01)

    @staticmethod
    def _kill_if_live(pid: int) -> None:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            return


if __name__ == "__main__":
    unittest.main()
