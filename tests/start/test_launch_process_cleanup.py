import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from setta.launch import (
    LaunchError,
    _read_log_tail,
    _terminate_launch_process,
    _wait_for_session,
)
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.sessions.registry import SessionRegistry


def test_read_log_tail_reads_last_bytes(tmp_path: Path) -> None:
    log_path = tmp_path / "launch.log"
    prefix = b"x" * 9000
    suffix = b"TAIL"
    log_path.write_bytes(prefix + suffix)

    tail = _read_log_tail(log_path, max_bytes=8000)
    assert tail.endswith("TAIL")
    assert len(tail.encode("utf-8")) == 8000


def test_wait_for_session_terminates_process_on_timeout(
    tmp_path: Path, monkeypatch
) -> None:
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    monkeypatch.setattr(
        registry,
        "find_sessions_by_workspace_and_mode",
        lambda *_a, **_k: [],
    )

    log_path = tmp_path / "launch.log"
    log_path.write_text("", encoding="utf-8")

    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        with pytest.raises(LaunchError) as excinfo:
            _wait_for_session(
                registry,
                tmp_path,
                "ide",
                proc,
                log_path,
                timeout_seconds=0.1,
                poll_interval_seconds=0.05,
            )
        assert excinfo.value.code == "LaunchTimeout"
        assert proc.poll() is not None
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


def _pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


@pytest.mark.skipif(os.name != "posix", reason="Requires POSIX process groups.")
def test_terminate_launch_process_kills_process_group(tmp_path: Path) -> None:
    child_pid_file = tmp_path / "child_pid.txt"
    log_path = tmp_path / "launch.log"
    log_path.write_text("", encoding="utf-8")

    code = """
import pathlib
import subprocess
import sys
import time

pid_path = pathlib.Path(sys.argv[1])
child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
pid_path.write_text(str(child.pid), encoding="utf-8")
try:
    time.sleep(60)
finally:
    try:
        child.terminate()
    except Exception:
        pass
"""

    proc = subprocess.Popen(
        [sys.executable, "-c", code, str(child_pid_file)],
        start_new_session=True,
    )
    child_pid = None
    try:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline and not child_pid_file.exists():
            time.sleep(0.05)
        child_pid = int(child_pid_file.read_text(encoding="utf-8").strip())
        assert _pid_is_alive(child_pid) is True

        _terminate_launch_process(proc, log_path=log_path)
        assert proc.poll() is not None

        kill_deadline = time.monotonic() + 2.0
        while time.monotonic() < kill_deadline and _pid_is_alive(child_pid):
            time.sleep(0.05)
        assert _pid_is_alive(child_pid) is False
    finally:
        _terminate_launch_process(proc, log_path=log_path)
        if child_pid is not None and _pid_is_alive(child_pid):
            try:
                os.kill(child_pid, 9)
            except OSError:
                pass


def test_wait_for_session_uses_requested_server_mode(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sessions_root = tmp_path / "sessions"
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)

    registry = SessionRegistry(sessions_root=sessions_root)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

    launcher_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    ide_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    launcher_socket.bind(("127.0.0.1", 0))
    ide_socket.bind(("127.0.0.1", 0))
    launcher_socket.listen(1)
    ide_socket.listen(1)

    base_started_at = datetime.now(timezone.utc)
    launcher_session = registry.create_session(
        workspace_path=workspace_root,
        host="127.0.0.1",
        port=launcher_socket.getsockname()[1],
        pid=os.getpid(),
        started_at=base_started_at,
        server_mode="launcher",
    )
    registry.create_session(
        workspace_path=workspace_root,
        host="127.0.0.1",
        port=ide_socket.getsockname()[1],
        pid=os.getpid(),
        started_at=base_started_at + timedelta(seconds=1),
        server_mode="ide",
    )

    log_path = tmp_path / "launch.log"
    log_path.write_text("", encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        session = _wait_for_session(
            registry,
            workspace_root,
            "launcher",
            proc,
            log_path,
            timeout_seconds=1.0,
            poll_interval_seconds=0.05,
        )
        assert session.id == launcher_session.id
        assert session.serverMode == "launcher"
    finally:
        launcher_socket.close()
        ide_socket.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
