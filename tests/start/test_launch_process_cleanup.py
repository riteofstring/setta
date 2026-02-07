import subprocess
import sys
from pathlib import Path

import pytest

from setta.launch import LaunchError, _read_log_tail, _wait_for_session
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
    monkeypatch.setattr(registry, "find_sessions_by_workspace", lambda *_a, **_k: [])

    log_path = tmp_path / "launch.log"
    log_path.write_text("", encoding="utf-8")

    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        with pytest.raises(LaunchError) as excinfo:
            _wait_for_session(
                registry,
                tmp_path,
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

