import subprocess
import sys
import time

import psutil

from setta import ssh_connect


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
