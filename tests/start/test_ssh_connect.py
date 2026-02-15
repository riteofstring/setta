import subprocess
import sys
import time

import psutil
import pytest

from setta import ssh_connect
from setta.launch import LaunchError
from tests.utils.setta_paths import temporary_setta_paths


def _spawn_sleep_process() -> subprocess.Popen[str]:
    # Use Python so the test works consistently across platforms.
    return subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )


def _cleanup_process(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)


def test_pid_matches_create_time_detects_pid_reuse() -> None:
    proc = _spawn_sleep_process()
    try:
        create_time = psutil.Process(proc.pid).create_time()

        assert ssh_connect._pid_matches_create_time(proc.pid, create_time) is True
        assert ssh_connect._pid_matches_create_time(proc.pid, create_time + 10) is False
    finally:
        _cleanup_process(proc)


def test_stop_pid_skips_when_create_time_mismatch() -> None:
    proc = _spawn_sleep_process()
    try:
        create_time = psutil.Process(proc.pid).create_time()

        ssh_connect._stop_pid(proc.pid, expected_create_time=create_time + 10)
        time.sleep(0.2)

        assert proc.poll() is None
    finally:
        _cleanup_process(proc)


def test_stop_pid_terminates_when_create_time_matches() -> None:
    proc = _spawn_sleep_process()
    try:
        create_time = psutil.Process(proc.pid).create_time()

        ssh_connect._stop_pid(proc.pid, expected_create_time=create_time)
        proc.wait(timeout=5)

        assert proc.poll() is not None
    finally:
        _cleanup_process(proc)


def test_stop_pid_treats_no_such_process_races_as_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeProc:
        def __init__(self, pid: int) -> None:
            self._pid = pid

        def create_time(self) -> float:
            return 123.456

        def terminate(self) -> None:
            raise psutil.NoSuchProcess(pid=self._pid)

    monkeypatch.setattr(psutil, "Process", lambda pid: _FakeProc(pid))

    # Should not raise even if the process disappears between checks.
    ssh_connect._stop_pid(99, expected_create_time=123.456)


def test_ensure_ssh_tunnel_reports_missing_ssh_binary(tmp_path) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    setta_files_root = workspace_root / "setta_files"
    setta_files_root.mkdir()

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
    ):
        with pytest.raises(LaunchError) as excinfo:
            ssh_connect._ensure_ssh_tunnel(
                ssh_target="user@host",
                ssh_prefix=["ssh-does-not-exist"],
                ssh_args=[],
                remote_host="127.0.0.1",
                remote_port=61234,
                requested_local_port=61000,
            )
    assert excinfo.value.code == "SshMissing"
