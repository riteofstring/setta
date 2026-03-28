import math

import psutil

_PID_CREATE_TIME_ABS_TOLERANCE_SECONDS = 0.01


def is_pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        process = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return False
    is_running = getattr(process, "is_running", None)
    if callable(is_running) and not is_running():
        return False
    try:
        return process.status() != psutil.STATUS_ZOMBIE
    except (psutil.Error, AttributeError):
        return True


def pid_matches_create_time(*, pid: int, expected_create_time: float) -> bool:
    if pid <= 0:
        return False
    if not is_pid_running(pid):
        return False
    try:
        process = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return False
    try:
        actual_create_time = process.create_time()
    except psutil.Error:
        return False
    return math.isclose(
        actual_create_time,
        expected_create_time,
        rel_tol=0.0,
        abs_tol=_PID_CREATE_TIME_ABS_TOLERANCE_SECONDS,
    )


def resolve_pid_create_time(pid: int) -> float | None:
    if pid <= 0:
        return None
    try:
        process = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return None
    try:
        return process.create_time()
    except psutil.Error:
        return None
