from __future__ import annotations

import ctypes
import errno
import os
import queue
import shutil
import signal
import stat
import subprocess
import sys
import threading
import time
from collections.abc import Iterable, Mapping, Sequence
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .models import (
    AMBIENT_RUNTIME_TOOL_KEYS,
    APP_SESSION_FORCE_SETTLE_SECONDS,
    APP_SESSION_GRACE_SECONDS,
    MAX_PROCESS_OUTPUT_BYTES,
    MAX_READINESS_BYTES,
    SELECTOR_ENVIRONMENT_KEYS,
    WINDOWS,
    BoundedBytes,
    LiveSessionIdentity,
    ProcessResult,
    ReadableBytes,
    SmokeError,
    process_failure_message,
    require_pipe,
)

_WINDOWS = WINDOWS
_WINDOWS_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
_WINDOWS_JOB_OBJECT_LIMIT_KILL_ON_CLOSE = 0x00002000
_WINDOWS_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
_WINDOWS_BOOTSTRAP_RELEASE_TOKEN = b"\x01"
_WINDOWS_BOOTSTRAP_PRELUDE = (
    "import signal,subprocess,sys;"
    "sys.stdin.buffer.read(1)==b'\\x01' or sys.exit(125);"
    "child=subprocess.Popen(sys.argv[2:],stdin=sys.stdin,stdout=sys.stdout,stderr=sys.stderr);"
    "signal.signal(signal.SIGINT,signal.SIG_IGN);"
    "hasattr(signal,'SIGBREAK') and signal.signal(signal.SIGBREAK,signal.SIG_IGN);"
    "sys.exit(child.wait())"
)


class _WindowsJobObjectBasicLimitInformation(ctypes.Structure):
    _fields_ = [
        ("per_process_user_time_limit", ctypes.c_longlong),
        ("per_job_user_time_limit", ctypes.c_longlong),
        ("limit_flags", wintypes.DWORD),
        ("minimum_working_set_size", ctypes.c_size_t),
        ("maximum_working_set_size", ctypes.c_size_t),
        ("active_process_limit", wintypes.DWORD),
        ("affinity", ctypes.c_size_t),
        ("priority_class", wintypes.DWORD),
        ("scheduling_class", wintypes.DWORD),
    ]


class _WindowsIoCounters(ctypes.Structure):
    _fields_ = [
        ("read_operation_count", ctypes.c_ulonglong),
        ("write_operation_count", ctypes.c_ulonglong),
        ("other_operation_count", ctypes.c_ulonglong),
        ("read_transfer_count", ctypes.c_ulonglong),
        ("write_transfer_count", ctypes.c_ulonglong),
        ("other_transfer_count", ctypes.c_ulonglong),
    ]


class _WindowsJobObjectExtendedLimitInformation(ctypes.Structure):
    _fields_ = [
        ("basic_limit_information", _WindowsJobObjectBasicLimitInformation),
        ("io_info", _WindowsIoCounters),
        ("process_memory_limit", ctypes.c_size_t),
        ("job_memory_limit", ctypes.c_size_t),
        ("peak_process_memory_used", ctypes.c_size_t),
        ("peak_job_memory_used", ctypes.c_size_t),
    ]


class _ForegroundTree(Protocol):
    def force_stop(self, process: subprocess.Popen[bytes]) -> None:
        pass

    def close(self) -> None:
        pass


class _PosixForegroundTree:
    def force_stop(self, process: subprocess.Popen[bytes]) -> None:
        _terminate_posix_process_group(process)

    def close(self) -> None:
        return


class _WindowsForegroundTree:
    def __init__(self, handle: int, kernel32: Any):
        self._handle: int | None = handle
        self._kernel32 = kernel32

    def assign(self, process: subprocess.Popen[bytes]) -> None:
        handle = self._require_handle()
        if not self._kernel32.AssignProcessToJobObject(
            wintypes.HANDLE(handle), wintypes.HANDLE(_windows_process_handle(process))
        ):
            raise _windows_os_error(
                "unable to assign foreground open to its process containment"
            )

    def abort_unassigned(self, process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        if not self._kernel32.TerminateProcess(
            wintypes.HANDLE(_windows_process_handle(process)), wintypes.UINT(1)
        ):
            raise _windows_os_error("unable to stop an unassigned foreground process")
        if not _wait_for_process(process, APP_SESSION_FORCE_SETTLE_SECONDS):
            raise OSError("unassigned foreground process did not stop")

    def force_stop(self, process: subprocess.Popen[bytes]) -> None:
        failures: list[OSError] = []
        try:
            self.terminate()
        except OSError as error:
            failures.append(error)
        try:
            self.close()
        except OSError as error:
            failures.append(error)
        if not _wait_for_process(process, APP_SESSION_FORCE_SETTLE_SECONDS):
            failures.append(
                OSError("foreground Job Object did not stop its public process")
            )
        if failures:
            raise _join_os_errors(failures)

    def terminate(self) -> None:
        handle = self._handle
        if handle is None:
            return
        if not self._kernel32.TerminateJobObject(
            wintypes.HANDLE(handle), wintypes.UINT(1)
        ):
            raise _windows_os_error(
                "unable to terminate foreground process containment"
            )

    def close(self) -> None:
        handle = self._handle
        if handle is None:
            return
        if self._kernel32.CloseHandle(wintypes.HANDLE(handle)):
            self._handle = None
            return
        close_error = _windows_os_error(
            "unable to release foreground process containment"
        )
        terminate_error: OSError | None = None
        if not self._kernel32.TerminateJobObject(
            wintypes.HANDLE(handle), wintypes.UINT(1)
        ):
            terminate_error = _windows_os_error(
                "unable to terminate foreground process containment after release failure"
            )
        if self._kernel32.CloseHandle(wintypes.HANDLE(handle)):
            self._handle = None
            raise _join_os_errors(
                [error for error in (close_error, terminate_error) if error is not None]
            )
        retry_error = _windows_os_error(
            "unable to release foreground process containment after termination"
        )
        raise _join_os_errors(
            [
                error
                for error in (close_error, terminate_error, retry_error)
                if error is not None
            ]
        )

    def _require_handle(self) -> int:
        handle = self._handle
        if handle is None:
            raise OSError("foreground process containment is already closed")
        return handle


@dataclass(frozen=True)
class _PosixAppSession:
    identity: LiveSessionIdentity
    session_id: int
    owner_start_token: str

    def force_stop(self) -> None:
        if not self._owner_matches():
            return
        _signal_posix_process_group(self.session_id, signal.SIGINT)
        if self._wait_for_owner_exit(APP_SESSION_GRACE_SECONDS):
            return
        if not self._owner_matches():
            return
        _signal_posix_process_group(self.session_id, signal.SIGTERM)
        if self._wait_for_owner_exit(APP_SESSION_FORCE_SETTLE_SECONDS):
            return
        if not self._owner_matches():
            return
        _signal_posix_process_group(self.session_id, signal.SIGKILL)
        if not self._wait_for_owner_exit(APP_SESSION_FORCE_SETTLE_SECONDS):
            raise SmokeError("retained native-server session did not stop")

    def _wait_for_owner_exit(self, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while True:
            if not _posix_process_exists(self.identity.owner_pid):
                return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.03)

    def _owner_matches(self) -> bool:
        if _process_session_id(self.identity.owner_pid) != self.session_id:
            return False
        return _process_start_token(self.identity.owner_pid) == self.owner_start_token


class ForegroundOpen:
    def __init__(
        self,
        process: subprocess.Popen[bytes],
        command: Sequence[str],
        *,
        tree: _ForegroundTree,
    ):
        self.process = process
        self.command = tuple(command)
        self._tree = tree
        self._app_session: _PosixAppSession | LiveSessionIdentity | None = None
        self.stdout = BoundedBytes(MAX_PROCESS_OUTPUT_BYTES)
        self.stderr = BoundedBytes(MAX_PROCESS_OUTPUT_BYTES)
        self._line: queue.Queue[bytes | Exception] = queue.Queue(maxsize=1)
        self._stdout_thread = start_reader(
            require_pipe(process.stdout, "stdout"),
            self.stdout,
            line_destination=self._line,
        )
        self._stderr_thread = start_reader(
            require_pipe(process.stderr, "stderr"), self.stderr
        )

    def wait_for_readiness(self, timeout: float) -> bytes:
        deadline = time.monotonic() + timeout
        while True:
            if self.stdout.exceeded or self.stderr.exceeded:
                raise SmokeError(
                    "foreground open produced more than the bounded output limit"
                )
            returncode = self.process.poll()
            if returncode is not None:
                raise SmokeError(
                    process_failure_message(
                        self.command,
                        returncode,
                        self.stdout.content(),
                        self.stderr.content(),
                    )
                )
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise SmokeError(
                    "foreground open did not publish readiness before its timeout"
                )
            try:
                value = self._line.get(timeout=min(remaining, 0.1))
            except queue.Empty:
                continue
            if isinstance(value, Exception):
                raise SmokeError("unable to read foreground open readiness") from value
            if len(value) > MAX_READINESS_BYTES:
                raise SmokeError("foreground open readiness exceeded its byte limit")
            return value

    def close_gracefully(self, timeout: float) -> ProcessResult:

        interrupt_foreground_process(self.process)
        deadline = time.monotonic() + timeout
        while self.process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.05)
        if self.process.poll() is None:
            self._force_stop_foreground()
            raise SmokeError(
                "foreground open did not stop after a foreground interrupt"
            )
        self._join_readers()
        if self.stdout.exceeded or self.stderr.exceeded:
            raise SmokeError(
                "foreground open produced more than the bounded output limit"
            )
        returncode = self.process.returncode
        if returncode is None:
            raise SmokeError("foreground open ended without a process status")
        return ProcessResult(
            command=self.command,
            returncode=returncode,
            stdout=self.stdout.content(),
            stderr=self.stderr.content(),
        )

    def terminate(self) -> None:

        self._force_stop_foreground()
        self._join_readers()

    def retain_app_session(self, identity: LiveSessionIdentity) -> None:

        if self._app_session is not None:
            raise SmokeError("foreground open attempted to retain two live sessions")
        if _WINDOWS:
            self._app_session = identity
            return
        self._app_session = _capture_posix_app_session(identity)

    def cleanup_retained_session(self) -> None:

        failures: list[SmokeError] = []
        try:
            retained = self._app_session
            if isinstance(retained, _PosixAppSession):
                retained.force_stop()
            else:
                self._tree.force_stop(self.process)
        except SmokeError as error:
            failures.append(error)
        except OSError as error:
            failures.append(SmokeError("unable to stop foreground process containment"))
            failures[-1].__cause__ = error
        try:
            self._tree.close()
        except OSError as error:
            cleanup_error = SmokeError(
                "unable to release foreground process containment"
            )
            cleanup_error.__cause__ = error
            failures.append(cleanup_error)
        self._join_readers()
        if failures:
            raise _join_smoke_errors("foreground app-session cleanup failed", failures)

    def _force_stop_foreground(self) -> None:
        try:
            self._tree.force_stop(self.process)
        except OSError as error:
            raise SmokeError("unable to stop foreground process containment") from error

    def _join_readers(self) -> None:
        for thread in (self._stdout_thread, self._stderr_thread):
            thread.join(timeout=2.0)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if stream is None:
                continue
            try:
                stream.close()
            except OSError:
                continue


def run_process(
    command: Sequence[str],
    *,
    cwd: Path,
    env: Mapping[str, str],
    timeout: float,
    label: str,
    allowed_returncodes: frozenset[int] = frozenset({0}),
) -> ProcessResult:
    if timeout <= 0:
        raise SmokeError(f"{label} has an invalid timeout")
    process = popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL)
    stdout = BoundedBytes(MAX_PROCESS_OUTPUT_BYTES)
    stderr = BoundedBytes(MAX_PROCESS_OUTPUT_BYTES)
    stdout_thread = start_reader(require_pipe(process.stdout, "stdout"), stdout)
    stderr_thread = start_reader(require_pipe(process.stderr, "stderr"), stderr)
    failure = _monitor_process(
        process, stdout, stderr, time.monotonic() + timeout, label
    )
    if failure is not None:
        terminate_process_tree(process)
    else:
        process.wait()
    _close_process_output(process, (stdout_thread, stderr_thread))
    if failure is None and (stdout.exceeded or stderr.exceeded):
        failure = SmokeError(f"{label} exceeded the bounded process output limit")
    if failure is not None:
        raise failure
    returncode = process.returncode
    if returncode is None:
        raise SmokeError(f"{label} ended without a process status")
    result = ProcessResult(
        tuple(command), returncode, stdout.content(), stderr.content()
    )
    if returncode not in allowed_returncodes:
        raise SmokeError(
            process_failure_message(
                result.command, returncode, result.stdout, result.stderr
            )
        )
    return result


def _monitor_process(
    process: subprocess.Popen[bytes],
    stdout: BoundedBytes,
    stderr: BoundedBytes,
    deadline: float,
    label: str,
) -> SmokeError | None:
    while process.poll() is None:
        if stdout.exceeded or stderr.exceeded:
            return SmokeError(f"{label} exceeded the bounded process output limit")
        if time.monotonic() >= deadline:
            return SmokeError(f"{label} exceeded its timeout")
        time.sleep(0.02)
    return None


def _close_process_output(
    process: subprocess.Popen[bytes], threads: Sequence[threading.Thread]
) -> None:
    for thread in threads:
        thread.join(timeout=2.0)
    for stream in (process.stdout, process.stderr):
        if stream is None:
            continue
        try:
            stream.close()
        except OSError:
            continue


def popen(
    command: Sequence[str], *, cwd: Path, env: Mapping[str, str], stdin: int
) -> subprocess.Popen[bytes]:
    _validate_popen_inputs(command, cwd)
    try:
        if _WINDOWS:
            return subprocess.Popen(
                tuple(command),
                cwd=str(cwd),
                env=dict(env),
                stdin=stdin,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=False,
                creationflags=_WINDOWS_NEW_PROCESS_GROUP,
            )
        return subprocess.Popen(
            tuple(command),
            cwd=str(cwd),
            env=dict(env),
            stdin=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
            start_new_session=True,
        )
    except OSError as error:
        raise SmokeError(f"cannot execute {command[0]!r}") from error


def popen_foreground(
    command: Sequence[str], *, cwd: Path, env: Mapping[str, str], stdin: int
) -> tuple[subprocess.Popen[bytes], _ForegroundTree]:

    if not _WINDOWS:
        return (popen(command, cwd=cwd, env=env, stdin=stdin), _PosixForegroundTree())
    return _start_windows_foreground(command, cwd=cwd, env=env, stdin=stdin)


def _start_windows_foreground(
    command: Sequence[str], *, cwd: Path, env: Mapping[str, str], stdin: int
) -> tuple[subprocess.Popen[bytes], _WindowsForegroundTree]:
    _validate_popen_inputs(command, cwd)
    del stdin
    launcher = Path(command[0])
    if not launcher.is_absolute():
        raise SmokeError("foreground Windows launcher must be an absolute path")
    tree = _create_windows_foreground_tree()
    process: subprocess.Popen[bytes] | None = None
    assigned = False
    try:
        process = subprocess.Popen(
            (
                os.path.abspath(sys.executable),
                "-I",
                "-S",
                "-c",
                _WINDOWS_BOOTSTRAP_PRELUDE,
                "setta-wheel-smoke-bootstrap",
                *command,
            ),
            cwd=str(cwd),
            env=dict(env),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
            creationflags=_WINDOWS_NEW_PROCESS_GROUP,
        )
        tree.assign(process)
        assigned = True
        _release_windows_bootstrap(process)
    except OSError as error:
        cleanup: list[OSError] = []
        if process is not None:
            try:
                if assigned:
                    tree.force_stop(process)
                else:
                    tree.abort_unassigned(process)
            except OSError as cleanup_error:
                cleanup.append(cleanup_error)
        try:
            tree.close()
        except OSError as cleanup_error:
            cleanup.append(cleanup_error)
        if cleanup:
            details = "; ".join(str(cleanup_error) for cleanup_error in cleanup)
            raise SmokeError(
                f"cannot execute {command[0]!r}; foreground cleanup also failed: {details}"
            ) from error
        raise SmokeError(f"cannot execute {command[0]!r}") from error
    return (process, tree)


def _release_windows_bootstrap(process: subprocess.Popen[bytes]) -> None:
    stream = process.stdin
    if stream is None:
        raise OSError("foreground bootstrap has no lifetime pipe")
    stream.write(_WINDOWS_BOOTSTRAP_RELEASE_TOKEN)
    stream.flush()


def _validate_popen_inputs(command: Sequence[str], cwd: Path) -> None:
    if not command or not command[0]:
        raise SmokeError("cannot execute an empty command")
    if not cwd.is_dir():
        raise SmokeError(f"command working directory is invalid: {cwd}")


def start_reader(
    stream: ReadableBytes,
    destination: BoundedBytes,
    *,
    line_destination: queue.Queue[bytes | Exception] | None = None,
) -> threading.Thread:
    def read() -> None:
        pending = bytearray()
        line_sent = False
        try:
            while True:
                chunk = read_stream_chunk(stream)
                if not chunk:
                    return
                destination.append(chunk)
                if line_destination is not None and not line_sent:
                    pending.extend(chunk)
                    if len(pending) > MAX_READINESS_BYTES + 1:
                        queue_once(
                            line_destination,
                            SmokeError("readiness line is too large"),
                        )
                        line_sent = True
                    elif b"\n" in pending:
                        line, _, _ = pending.partition(b"\n")
                        queue_once(line_destination, bytes(line))
                        line_sent = True
        except (OSError, SmokeError, ValueError) as error:
            if line_destination is not None and not line_sent:
                queue_once(line_destination, error)

    thread = threading.Thread(target=read, daemon=True)
    thread.start()
    return thread


def read_stream_chunk(stream: ReadableBytes) -> bytes:

    read_one = getattr(stream, "read1", None)
    if callable(read_one):
        chunk = read_one(64 * 1024)
    else:
        chunk = stream.read(64 * 1024)
    if not isinstance(chunk, bytes):
        raise SmokeError("process stream did not produce bytes")
    return chunk


def queue_once(
    destination: queue.Queue[bytes | Exception], value: bytes | Exception
) -> None:
    try:
        destination.put_nowait(value)
    except queue.Full:
        return


def terminate_process_tree(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if not _WINDOWS:
        _terminate_posix_process_group(process)
        return
    try:
        process.terminate()
    except (OSError, ProcessLookupError):
        return
    try:
        process.wait(timeout=5.0)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        process.kill()
    except (OSError, ProcessLookupError):
        return
    try:
        process.wait(timeout=2.0)
    except subprocess.TimeoutExpired:
        return


def interrupt_foreground_process(process: subprocess.Popen[bytes]) -> None:

    if process.poll() is not None:
        return
    try:
        if _WINDOWS:
            control_break = getattr(signal, "CTRL_BREAK_EVENT", signal.SIGINT)
            process.send_signal(control_break)
        else:
            os.killpg(process.pid, signal.SIGINT)
    except (OSError, ProcessLookupError) as error:
        if process.poll() is None:
            raise SmokeError(
                "unable to interrupt foreground open for graceful cleanup"
            ) from error


def _terminate_posix_process_group(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        return
    try:
        process.wait(timeout=5.0)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (OSError, ProcessLookupError):
        return
    try:
        process.wait(timeout=2.0)
    except subprocess.TimeoutExpired:
        return


def _capture_posix_app_session(identity: LiveSessionIdentity) -> _PosixAppSession:
    session_id = _process_session_id(identity.owner_pid)
    if session_id is None or session_id != identity.owner_pid:
        raise SmokeError(
            "live-session owner is not a dedicated native-server session leader"
        )
    start_token = _process_start_token(identity.owner_pid)
    if start_token is None:
        raise SmokeError("live-session owner exited before smoke retained cleanup")
    return _PosixAppSession(identity, session_id, start_token)


def _process_session_id(pid: int) -> int | None:
    get_session_id = getattr(os, "getsid", None)
    if not callable(get_session_id):
        raise SmokeError("POSIX smoke cleanup cannot verify process sessions")
    try:
        session_id = get_session_id(pid)
    except OSError as error:
        if _is_process_gone(error):
            return None
        raise SmokeError("unable to verify retained native-server session") from error
    if not isinstance(session_id, int) or session_id < 1:
        raise SmokeError("unable to verify retained native-server session")
    return session_id


def _process_start_token(pid: int) -> str | None:
    if sys.platform.startswith("linux"):
        return _linux_process_start_token(pid)
    if sys.platform == "darwin":
        return _darwin_process_start_token(pid)
    raise SmokeError(
        "POSIX smoke cleanup has no stable process identity on this platform"
    )


def _linux_process_start_token(pid: int) -> str | None:
    try:
        value = (Path("/proc") / str(pid) / "stat").read_bytes()
    except OSError as error:
        if _is_process_gone(error):
            return None
        raise SmokeError("unable to read retained native-server identity") from error
    closing_parenthesis = value.rfind(b")")
    fields = value[closing_parenthesis + 1 :].split()
    if closing_parenthesis < 1 or len(fields) < 20 or not fields[19].isdigit():
        raise SmokeError("retained native-server identity was malformed")
    return "linux:" + fields[19].decode("ascii")


def _darwin_process_start_token(pid: int) -> str | None:
    executable = _posix_ps_executable()
    if executable is None:
        raise SmokeError("POSIX smoke cleanup cannot find its fixed process inspector")
    try:
        completed = subprocess.run(
            (str(executable), "-p", str(pid), "-o", "lstart="),
            check=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=False,
            timeout=1.0,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SmokeError("unable to read retained native-server identity") from error
    if completed.returncode != 0:
        return None
    value = completed.stdout.strip()
    if not value:
        return None
    try:
        token = value.decode("ascii")
    except UnicodeDecodeError as error:
        raise SmokeError("retained native-server identity was malformed") from error
    if "\n" in token or "\r" in token:
        raise SmokeError("retained native-server identity was malformed")
    return "darwin:" + token


def _posix_ps_executable() -> Path | None:
    for executable in (Path("/bin/ps"), Path("/usr/bin/ps")):
        if executable.is_file() and os.access(executable, os.X_OK):
            return executable
    return None


def _signal_posix_process_group(session_id: int, delivery: signal.Signals) -> None:
    try:
        os.killpg(session_id, delivery)
    except OSError as error:
        if _is_process_gone(error):
            return
        raise SmokeError("unable to stop retained native-server session") from error


def _posix_process_exists(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError as error:
        if _is_process_gone(error):
            return False
        if isinstance(error, PermissionError):
            return True
        raise SmokeError("unable to verify retained native-server session") from error
    return True


def _is_process_gone(error: OSError) -> bool:
    return error.errno in {errno.ENOENT, errno.ESRCH}


def _wait_for_process(process: subprocess.Popen[bytes], timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while process.poll() is None and time.monotonic() < deadline:
        time.sleep(0.03)
    return process.poll() is not None


def _create_windows_foreground_tree() -> _WindowsForegroundTree:
    kernel32 = _windows_kernel32()
    raw_handle = kernel32.CreateJobObjectW(None, None)
    if not raw_handle:
        raise _windows_os_error("unable to create foreground process containment")
    handle = int(raw_handle)
    limits = _WindowsJobObjectExtendedLimitInformation()
    limits.basic_limit_information.limit_flags = _WINDOWS_JOB_OBJECT_LIMIT_KILL_ON_CLOSE
    if not kernel32.SetInformationJobObject(
        wintypes.HANDLE(handle),
        _WINDOWS_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
        ctypes.byref(limits),
        wintypes.DWORD(ctypes.sizeof(limits)),
    ):
        _close_windows_handle_quietly(kernel32, handle)
        raise _windows_os_error("unable to configure foreground process containment")
    return _WindowsForegroundTree(handle, kernel32)


def _windows_kernel32() -> Any:
    loader = getattr(ctypes, "WinDLL", None)
    if not callable(loader):
        raise OSError("Windows process containment APIs are unavailable")
    kernel32: Any = loader("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        wintypes.LPVOID,
        wintypes.DWORD,
    ]
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel32.TerminateJobObject.restype = wintypes.BOOL
    kernel32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel32.TerminateProcess.restype = wintypes.BOOL
    return kernel32


def _windows_process_handle(process: subprocess.Popen[bytes]) -> int:
    handle = getattr(process, "_handle", None)
    if not isinstance(handle, int) or handle < 1:
        raise OSError("foreground process did not expose a Windows process handle")
    return handle


def _close_windows_handle_quietly(kernel32: Any, handle: int) -> None:
    try:
        kernel32.CloseHandle(wintypes.HANDLE(handle))
    except OSError:
        return


def _windows_os_error(message: str) -> OSError:
    last_error = getattr(ctypes, "get_last_error", None)
    if callable(last_error):
        code = last_error()
        if isinstance(code, int):
            return OSError(code, message)
    return OSError(message)


def _join_os_errors(errors: Sequence[OSError]) -> OSError:
    return OSError("; ".join(str(error) for error in errors))


def _join_smoke_errors(label: str, errors: Sequence[SmokeError]) -> SmokeError:
    return SmokeError(f"{label}: " + "; ".join(str(error) for error in errors))


def venv_scripts(root: Path) -> Path:
    scripts = root / ("Scripts" if _WINDOWS else "bin")
    if not scripts.is_dir() or scripts.is_symlink():
        raise SmokeError("clean virtual environment has no scripts directory")
    return scripts


def venv_python(root: Path) -> Path:
    names = ("python.exe", "python") if _WINDOWS else ("python",)
    scripts = venv_scripts(root)
    for name in names:
        candidate = scripts / name
        try:
            mode = candidate.lstat().st_mode
            resolved = candidate.resolve(strict=True)
            resolved_mode = resolved.lstat().st_mode
        except OSError:
            continue
        if (stat.S_ISREG(mode) or stat.S_ISLNK(mode)) and stat.S_ISREG(resolved_mode):
            return candidate
    raise SmokeError("clean virtual environment Python is missing")


def venv_setta(root: Path) -> Path:
    names = ("setta.exe", "setta-script.py", "setta") if _WINDOWS else ("setta",)
    return first_regular_path(
        venv_scripts(root), names, "installed setta console command"
    )


def first_regular_path(directory: Path, names: Iterable[str], label: str) -> Path:
    for name in names:
        candidate = directory / name
        try:
            resolved = candidate.resolve(strict=True)
            mode = resolved.lstat().st_mode
        except OSError:
            continue
        if stat.S_ISREG(mode):
            return resolved
    raise SmokeError(f"{label} is missing")


def require_python(value: Path) -> Path:
    path = value.expanduser().resolve(strict=False)
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise SmokeError(f"Python launcher is missing: {path}") from error
    if not stat.S_ISREG(mode):
        raise SmokeError(f"Python launcher must resolve to a regular file: {path}")
    return path


def install_environment() -> dict[str, str]:
    return scrubbed_environment(os.environ, path=os.environ.get("PATH", ""))


def runtime_environment(scripts: Path) -> dict[str, str]:

    return scrubbed_environment(os.environ, path=runtime_path(scripts))


def runtime_path(scripts: Path) -> str:
    clean_scripts = scripts.resolve(strict=True)
    if not _WINDOWS:
        return str(clean_scripts)
    system_directory = windows_system_directory()
    return ";".join((str(clean_scripts), str(system_directory)))


def windows_system_directory() -> Path:
    root = os.environ.get("SystemRoot") or os.environ.get("SYSTEMROOT")
    if not root:
        raise SmokeError("Windows runtime has no SystemRoot for its platform shell")
    system_directory = (Path(root) / "System32").resolve(strict=False)
    try:
        mode = system_directory.lstat().st_mode
    except OSError as error:
        raise SmokeError("Windows runtime System32 directory is unavailable") from error
    if (
        not system_directory.is_absolute()
        or stat.S_ISLNK(mode)
        or not stat.S_ISDIR(mode)
    ):
        raise SmokeError("Windows runtime System32 directory is invalid")
    return system_directory


def scrubbed_environment(base: Mapping[str, str], *, path: str) -> dict[str, str]:
    environment: dict[str, str] = {}
    for key, value in base.items():
        upper = key.upper()
        if (
            upper in SELECTOR_ENVIRONMENT_KEYS
            or upper in AMBIENT_RUNTIME_TOOL_KEYS
            or upper.startswith(("COREPACK_", "NPM_", "PNPM_", "SETTA_"))
        ):
            continue
        if upper == "PATH":
            continue
        environment[key] = value
    environment["PATH"] = path
    return environment


def assert_no_retired_alias(scripts: Path, environment: Mapping[str, str]) -> None:
    alias_names = (
        ("python-canvas.exe", "python-canvas-script.py", "python-canvas")
        if _WINDOWS
        else ("python-canvas", "python-canvas-script.py")
    )
    existing = [name for name in alias_names if (scripts / name).exists()]
    if existing:
        raise SmokeError(
            f"wheel exposes retired python-canvas console alias: {', '.join(existing)}"
        )
    located = shutil.which("python-canvas", path=environment.get("PATH"))
    if located is not None:
        raise SmokeError("runtime PATH exposes a retired python-canvas console alias")
