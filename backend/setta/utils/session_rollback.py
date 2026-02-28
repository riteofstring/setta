import time

import psutil

from setta.utils.pid_identity import is_pid_running, pid_matches_create_time

_LOCAL_ROLLBACK_TERMINATE_TIMEOUT_SECONDS = 2.0
_LOCAL_ROLLBACK_KILL_TIMEOUT_SECONDS = 2.0
_LOCAL_ROLLBACK_POLL_INTERVAL_SECONDS = 0.05


class LocalSessionRollbackError(RuntimeError):
    pass


def _wait_for_pid_exit(*, pid: int, timeout_seconds: float) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not is_pid_running(pid):
            return True
        time.sleep(_LOCAL_ROLLBACK_POLL_INTERVAL_SECONDS)
    return not is_pid_running(pid)


def stop_local_session_process(
    *, session_id: str, pid: int, pid_create_time: float
) -> None:
    if pid <= 0 or not is_pid_running(pid):
        return
    if not pid_matches_create_time(pid=pid, expected_create_time=pid_create_time):
        raise LocalSessionRollbackError(
            f"Process identity mismatch for session process {pid} during rollback "
            f"of {session_id}."
        )
    try:
        process = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return
    try:
        process.terminate()
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return
    except psutil.Error as exc:
        raise LocalSessionRollbackError(
            f"Failed terminating session process {pid} for {session_id} during rollback."
        ) from exc
    if _wait_for_pid_exit(
        pid=pid,
        timeout_seconds=_LOCAL_ROLLBACK_TERMINATE_TIMEOUT_SECONDS,
    ):
        return
    if not pid_matches_create_time(pid=pid, expected_create_time=pid_create_time):
        raise LocalSessionRollbackError(
            f"Process identity changed for session process {pid} during rollback "
            f"of {session_id}."
        )
    try:
        process.kill()
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return
    except psutil.Error as exc:
        raise LocalSessionRollbackError(
            f"Failed killing session process {pid} for {session_id} during rollback."
        ) from exc
    if _wait_for_pid_exit(
        pid=pid,
        timeout_seconds=_LOCAL_ROLLBACK_KILL_TIMEOUT_SECONDS,
    ):
        return
    raise LocalSessionRollbackError(
        f"Session process {pid} for {session_id} did not exit during rollback."
    )


def rollback_started_local_session(
    *, session_id: str, pid: int, pid_create_time: float, registry: object
) -> None:
    stop_local_session_process(
        session_id=session_id,
        pid=pid,
        pid_create_time=pid_create_time,
    )
    delete_session = getattr(registry, "delete_session", None)
    if not callable(delete_session):
        raise LocalSessionRollbackError(
            f"Session registry cannot delete session {session_id} during rollback."
        )
    try:
        delete_session(session_id)
    except OSError as exc:
        raise LocalSessionRollbackError(
            f"Failed deleting session metadata for {session_id} during rollback."
        ) from exc
