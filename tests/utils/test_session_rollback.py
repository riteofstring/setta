import subprocess
import sys

import psutil
import pytest

from setta.utils import session_rollback


def test_rollback_started_local_session_stops_then_deletes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    steps: list[str] = []

    monkeypatch.setattr(
        session_rollback,
        "stop_local_session_process",
        lambda **kwargs: steps.append(f"stop:{kwargs['session_id']}"),
    )

    class _Registry:
        def delete_session(self, session_id: str) -> None:
            steps.append(f"delete:{session_id}")

    session_rollback.rollback_started_local_session(
        session_id="session-1",
        pid=12345,
        pid_create_time=1.0,
        registry=_Registry(),
    )

    assert steps == ["stop:session-1", "delete:session-1"]


def test_rollback_started_local_session_raises_when_delete_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        session_rollback,
        "stop_local_session_process",
        lambda **_kwargs: None,
    )

    class _Registry:
        def delete_session(self, _session_id: str) -> None:
            raise OSError("disk full")

    with pytest.raises(session_rollback.LocalSessionRollbackError) as excinfo:
        session_rollback.rollback_started_local_session(
            session_id="session-1",
            pid=12345,
            pid_create_time=1.0,
            registry=_Registry(),
        )

    assert "Failed deleting session metadata for session-1" in str(excinfo.value)


def test_rollback_started_local_session_fails_closed_on_pid_identity_mismatch() -> None:
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    delete_calls: list[str] = []

    class _Registry:
        def delete_session(self, session_id: str) -> None:
            delete_calls.append(session_id)

    try:
        process_create_time = psutil.Process(process.pid).create_time()
        with pytest.raises(session_rollback.LocalSessionRollbackError) as excinfo:
            session_rollback.rollback_started_local_session(
                session_id="session-1",
                pid=process.pid,
                pid_create_time=process_create_time + 10.0,
                registry=_Registry(),
            )
        assert "Process identity mismatch" in str(excinfo.value)
        assert delete_calls == []
        assert process.poll() is None
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
