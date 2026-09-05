from __future__ import annotations

import ctypes
import json
import os
import queue
import signal
import subprocess
import sys
import threading
from collections.abc import Sequence
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, NoReturn, Protocol, cast

from .errors import InvalidInputError, RuntimeExecutionError
from .network import validate_loopback_http_url

_READINESS_TIMEOUT_SECONDS = 15.0
_MAX_READINESS_LINE_BYTES = 16 * 1024
_MAX_CAPTURED_STDERR_BYTES = 16 * 1024


_BACKEND_CLEANUP_BUDGET_SECONDS = 5.0
_GRACEFUL_SHUTDOWN_SECONDS = _BACKEND_CLEANUP_BUDGET_SECONDS + 1.0
_FORCED_REAP_SECONDS = 2.0
_WINDOWS_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
_WINDOWS_JOB_OBJECT_LIMIT_KILL_ON_CLOSE = 0x00002000
_WINDOWS_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
_WINDOWS_GUARDIAN_RELEASE_TOKEN = "\x01"
_WINDOWS_GUARDIAN_FAILURE_CODE = 125
_WINDOWS_GUARDIAN_PRELUDE = (
    "import os,subprocess,sys;"
    "os.read(sys.stdin.fileno(),1)==b'\\x01' or sys.exit(125);"
    "child=subprocess.Popen(sys.argv[2:],stdin=sys.stdin,stdout=sys.stdout,"
    "stderr=sys.stderr);"
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


@dataclass(frozen=True)
class ExpectedReadiness:
    app_id: str
    project_path: str
    instance_nonce: str


@dataclass(frozen=True)
class ServerReadiness:
    url: str
    app_id: str
    project_path: str
    instance_nonce: str


class _ProcessTree(Protocol):
    def force_stop(self, process: subprocess.Popen[str]) -> None:
        pass

    def close(self) -> None:
        pass


@dataclass(frozen=True)
class _StartedProcess:
    process: subprocess.Popen[str]
    tree: _ProcessTree


class _PosixProcessTree:
    def force_stop(self, process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return
        failures: list[OSError] = []
        try:
            _signal_posix_process_group(process, signal.SIGTERM)
        except OSError as error:
            failures.append(error)
        if _wait_for_process(process, _FORCED_REAP_SECONDS):
            if failures:
                raise _join_posix_tree_errors(failures)
            return
        try:
            _signal_posix_process_group(process, signal.SIGKILL)
        except OSError as error:
            failures.append(error)
        if not _wait_for_process(process, _FORCED_REAP_SECONDS):
            failures.append(
                OSError("Unable to confirm the packaged server process tree exited.")
            )
        if failures:
            raise _join_posix_tree_errors(failures)

    def close(self) -> None:
        return


def _join_posix_tree_errors(failures: Sequence[OSError]) -> OSError:
    return OSError("; ".join(str(failure) for failure in failures))


class _WindowsProcessTree:
    def __init__(self, handle: int, kernel32: Any):
        self._handle: int | None = handle
        self._kernel32 = kernel32

    def assign(self, process: subprocess.Popen[str]) -> None:
        handle = self._handle
        if handle is None:
            raise OSError("The native server process tree is already closed.")
        if not self._kernel32.AssignProcessToJobObject(
            wintypes.HANDLE(handle), wintypes.HANDLE(_windows_process_handle(process))
        ):
            raise _windows_os_error(
                "Unable to assign the packaged server to its process tree"
            )

    def abort_unassigned(self, process: subprocess.Popen[str]) -> None:
        _terminate_windows_process(process, self._kernel32)
        if not _wait_for_process(process, _FORCED_REAP_SECONDS):
            raise OSError(
                "Unable to confirm the unassigned packaged server process exited."
            )

    def force_stop(self, process: subprocess.Popen[str]) -> None:
        failure: OSError | None = None
        try:
            self.close()
        except OSError as error:
            failure = error
        if _wait_for_process(process, _FORCED_REAP_SECONDS):
            if failure is not None:
                raise failure
            return
        if self._handle is not None:
            try:
                self.terminate()
            except OSError as error:
                failure = _join_windows_errors(failure, error)
            try:
                self.close()
            except OSError as error:
                failure = _join_windows_errors(failure, error)
        if _wait_for_process(process, _FORCED_REAP_SECONDS):
            if failure is not None:
                raise failure
            return
        timeout = OSError("Unable to confirm the packaged server process tree exited.")
        raise _join_windows_errors(failure, timeout)

    def close(self) -> None:
        handle = self._handle
        if handle is None:
            return
        if self._kernel32.CloseHandle(wintypes.HANDLE(handle)):
            self._handle = None
            return
        close_error = _windows_os_error(
            "Unable to release the native server process tree"
        )
        terminate_error: OSError | None = None
        if not self._kernel32.TerminateJobObject(
            wintypes.HANDLE(handle), wintypes.UINT(1)
        ):
            terminate_error = _windows_os_error(
                "Unable to terminate the native server process tree after release "
                "failure"
            )
        if self._kernel32.CloseHandle(wintypes.HANDLE(handle)):
            self._handle = None
            raise _join_windows_errors(close_error, terminate_error)
        retry_error = _windows_os_error(
            "Unable to release the native server process tree after termination"
        )
        raise _join_windows_errors(
            _join_windows_errors(close_error, terminate_error), retry_error
        )

    def terminate(self) -> None:
        handle = self._handle
        if handle is None:
            return
        if not self._kernel32.TerminateJobObject(
            wintypes.HANDLE(handle), wintypes.UINT(1)
        ):
            raise _windows_os_error(
                "Unable to terminate the native server process tree"
            )


def _join_windows_errors(first: OSError | None, second: OSError | None) -> OSError:
    if first is None:
        return second or OSError("The Windows process-tree operation failed.")
    if second is None:
        return first
    return OSError(f"{first}; {second}")


@dataclass
class ManagedServer:
    process: subprocess.Popen[str]
    readiness: ServerReadiness
    stderr: _BoundedBytes
    tree: _ProcessTree
    stdin: IO[str]
    stdout: IO[str]
    stderr_stream: IO[str]


class NativeServerSupervisor:
    def __init__(self, *, readiness_timeout: float = _READINESS_TIMEOUT_SECONDS):
        self._readiness_timeout = readiness_timeout

    def start(
        self,
        command: Sequence[str | Path],
        expected: ExpectedReadiness,
        *,
        cwd: Path | None = None,
    ) -> ManagedServer:
        if not command:
            raise RuntimeExecutionError("The packaged native server command is empty.")
        stderr = _BoundedBytes(_MAX_CAPTURED_STDERR_BYTES)
        try:
            launched = _start_process(command, cwd)
        except OSError as error:
            raise RuntimeExecutionError(
                "Unable to start the packaged Python Canvas server."
            ) from error
        process = launched.process
        try:
            if (
                process.stdin is None
                or process.stdout is None
                or process.stderr is None
            ):
                raise RuntimeExecutionError(
                    "The packaged server did not expose its readiness stream."
                )
            stderr_thread = threading.Thread(
                target=_drain_stream,
                args=(cast(IO[str], process.stderr), stderr),
                daemon=True,
            )
            stderr_thread.start()
            try:
                line = _read_one_line(
                    cast(IO[str], process.stdout), self._readiness_timeout
                )
            except RuntimeExecutionError as error:
                if process.poll() is not None:
                    stderr_thread.join(timeout=0.2)
                raise RuntimeExecutionError(
                    _startup_message(error.message, stderr)
                ) from error
            readiness = _parse_readiness(line, expected)
            if process.poll() is not None:
                raise RuntimeExecutionError(
                    _startup_message(
                        "The packaged Python Canvas server exited during startup.",
                        stderr,
                    )
                )
            managed = ManagedServer(
                process=process,
                readiness=readiness,
                stderr=stderr,
                tree=launched.tree,
                stdin=cast(IO[str], process.stdin),
                stdout=cast(IO[str], process.stdout),
                stderr_stream=cast(IO[str], process.stderr),
            )
            return managed
        except (OSError, RuntimeError, RuntimeExecutionError) as error:
            _raise_after_cleanup(
                error,
                self._cleanup_failed_start(process, launched.tree),
            )
            raise AssertionError("startup cleanup unexpectedly returned") from error
        except (KeyboardInterrupt, SystemExit) as error:
            _raise_control_flow_after_cleanup(
                error,
                self._cleanup_failed_start(process, launched.tree),
            )

    def wait_foreground(self, server: ManagedServer) -> int:
        primary: Exception | None = None
        system_exit: SystemExit | None = None
        exit_status: int | None = None
        cleanup: list[RuntimeExecutionError | None] = []
        try:
            exit_status = server.process.wait()
        except KeyboardInterrupt:
            exit_status = 130
            cleanup.extend(self._stop_running_server(server))
        except SystemExit as error:
            system_exit = error
            cleanup.extend(self._stop_running_server(server))
        except OSError as error:
            primary = error
        cleanup.extend(self._close_server_streams(server))
        cleanup.append(self._close_process_tree(server.tree))
        if system_exit is not None:
            _raise_control_flow_after_cleanup(system_exit, cleanup)
        _raise_after_cleanup(primary, cleanup)
        if exit_status is None:
            raise RuntimeExecutionError(
                "The packaged server did not report an exit status."
            )
        return exit_status

    def stop(self, server: ManagedServer) -> None:
        cleanup = self._stop_running_server(server)
        cleanup.extend(self._close_server_streams(server))
        cleanup.append(self._close_process_tree(server.tree))
        _raise_after_cleanup(None, cleanup)

    @classmethod
    def _stop_running_server(
        cls, server: ManagedServer
    ) -> list[RuntimeExecutionError | None]:
        cleanup: list[RuntimeExecutionError | None] = [cls._close_server_stdin(server)]
        if not _wait_for_process(server.process, _GRACEFUL_SHUTDOWN_SECONDS):
            cleanup.append(cls._stop_process(server.process, server.tree))
        return cleanup

    @classmethod
    def _cleanup_failed_start(
        cls,
        process: subprocess.Popen[str],
        tree: _ProcessTree,
    ) -> list[RuntimeExecutionError | None]:

        cleanup = [cls._stop_process(process, tree)]
        cleanup.extend(cls._close_process_streams(process))
        cleanup.append(cls._close_process_tree(tree))
        return cleanup

    @staticmethod
    def _close_server_stdin(server: ManagedServer) -> RuntimeExecutionError | None:
        try:
            server.stdin.close()
        except OSError as error:
            return RuntimeExecutionError(
                f"Unable to close packaged server stdin: {error}"
            )
        return None

    @staticmethod
    def _close_server_streams(
        server: ManagedServer,
    ) -> list[RuntimeExecutionError | None]:
        cleanup: list[RuntimeExecutionError | None] = []
        for stream in (server.stdin, server.stdout, server.stderr_stream):
            try:
                stream.close()
            except OSError as error:
                cleanup.append(
                    RuntimeExecutionError(
                        f"Unable to close a packaged server stream: {error}"
                    )
                )
                continue
        return cleanup

    @staticmethod
    def _close_process_streams(
        process: subprocess.Popen[str],
    ) -> list[RuntimeExecutionError | None]:
        cleanup: list[RuntimeExecutionError | None] = []
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is None:
                continue
            try:
                stream.close()
            except OSError as error:
                cleanup.append(
                    RuntimeExecutionError(
                        f"Unable to close a packaged server stream: {error}"
                    )
                )
                continue
        return cleanup

    @staticmethod
    def _close_process_tree(tree: _ProcessTree) -> RuntimeExecutionError | None:
        try:
            tree.close()
        except OSError as error:
            return RuntimeExecutionError(
                f"Unable to release packaged server process containment: {error}"
            )
        return None

    @staticmethod
    def _stop_process(
        process: subprocess.Popen[str], tree: _ProcessTree
    ) -> RuntimeExecutionError | None:
        if process.poll() is not None:
            return None
        try:
            tree.force_stop(process)
        except OSError as error:
            return RuntimeExecutionError(
                f"Unable to stop packaged server process containment: {error}"
            )
        return None


def _raise_after_cleanup(
    primary: Exception | None,
    cleanup: Sequence[RuntimeExecutionError | None],
) -> None:
    failures = tuple(failure for failure in cleanup if failure is not None)
    if primary is None:
        if not failures:
            return
        if len(failures) == 1:
            raise failures[0]
        details = "; ".join(failure.message for failure in failures)
        raise RuntimeExecutionError(f"Packaged server cleanup failed: {details}")
    if not failures:
        raise primary
    details = "; ".join(failure.message for failure in failures)
    if isinstance(primary, RuntimeExecutionError):
        message = primary.message
    else:
        message = f"The packaged server operation failed: {primary}"
    raise RuntimeExecutionError(
        f"{message} Cleanup also failed: {details}"
    ) from primary


def _raise_control_flow_after_cleanup(
    primary: KeyboardInterrupt | SystemExit,
    cleanup: Sequence[RuntimeExecutionError | None],
) -> NoReturn:
    failures = tuple(failure for failure in cleanup if failure is not None)
    if failures:
        details = "; ".join(failure.message for failure in failures)
        primary.add_note(f"Cleanup also failed: {details}")
    raise primary


class _BoundedBytes:
    def __init__(self, limit: int):
        self._limit = limit
        self._value = bytearray()
        self._lock = threading.Lock()

    def append(self, value: bytes) -> None:
        with self._lock:
            self._value.extend(value)
            if len(self._value) > self._limit:
                del self._value[: len(self._value) - self._limit]

    def text(self) -> str:
        with self._lock:
            return bytes(self._value).decode("utf-8", errors="replace").strip()


def _start_process(command: Sequence[str | Path], cwd: Path | None) -> _StartedProcess:
    arguments = [str(part) for part in command]
    working_directory = str(cwd) if cwd is not None else None
    if os.name == "nt":
        return _start_windows_process(arguments, working_directory)
    guardian_arguments = [
        os.path.abspath(sys.executable),
        os.path.abspath(str(Path(__file__).with_name("_guardian.py"))),
        "--",
        *arguments,
    ]
    process = subprocess.Popen(
        guardian_arguments,
        bufsize=1,
        cwd=working_directory,
        start_new_session=True,
        stderr=subprocess.PIPE,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="strict",
    )
    return _StartedProcess(process=process, tree=_PosixProcessTree())


def _start_windows_process(
    arguments: Sequence[str], working_directory: str | None
) -> _StartedProcess:
    tree = _create_windows_process_tree()
    process: subprocess.Popen[str] | None = None
    assigned = False
    try:
        process = subprocess.Popen(
            _windows_guardian_arguments(arguments),
            bufsize=1,
            cwd=working_directory,
            creationflags=_WINDOWS_NEW_PROCESS_GROUP,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="strict",
        )
        tree.assign(process)
        assigned = True
        _release_windows_guardian(process)
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
            raise OSError(
                f"{error}; native server cleanup failed: {details}"
            ) from error
        raise
    return _StartedProcess(process=process, tree=tree)


def _windows_guardian_arguments(arguments: Sequence[str]) -> list[str]:
    if not arguments:
        raise OSError("The packaged native server command is empty.")
    return [
        os.path.abspath(sys.executable),
        "-I",
        "-S",
        "-c",
        _WINDOWS_GUARDIAN_PRELUDE,
        "setta-native-server-bootstrap",
        *arguments,
    ]


def _release_windows_guardian(process: subprocess.Popen[str]) -> None:
    stream = process.stdin
    if stream is None:
        raise OSError("The packaged native server bootstrap has no stdin stream.")
    stream.write(_WINDOWS_GUARDIAN_RELEASE_TOKEN)
    stream.flush()


def _create_windows_process_tree() -> _WindowsProcessTree:
    kernel32 = _windows_kernel32()
    raw_handle = kernel32.CreateJobObjectW(None, None)
    if not raw_handle:
        raise _windows_os_error("Unable to create the native server process tree")
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
        raise _windows_os_error("Unable to configure the native server process tree")
    return _WindowsProcessTree(handle, kernel32)


def _windows_kernel32() -> Any:
    loader = getattr(ctypes, "WinDLL", None)
    if not callable(loader):
        raise OSError("Windows process-tree APIs are unavailable.")
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


def _windows_process_handle(process: subprocess.Popen[str]) -> int:
    handle = getattr(process, "_handle", None)
    if not isinstance(handle, int) or handle < 1:
        raise OSError("The native server did not expose a Windows process handle.")
    return handle


def _terminate_windows_process(process: subprocess.Popen[str], kernel32: Any) -> None:
    if process.poll() is not None:
        return
    if not kernel32.TerminateProcess(
        wintypes.HANDLE(_windows_process_handle(process)), wintypes.UINT(1)
    ):
        raise _windows_os_error("Unable to terminate the packaged server process")


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


def _wait_for_process(process: subprocess.Popen[str], timeout: float) -> bool:
    if process.poll() is not None:
        return True
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        return False
    except OSError:
        return process.poll() is not None
    return True


def _signal_posix_process_group(
    process: subprocess.Popen[str], delivery: signal.Signals
) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, delivery)
    except ProcessLookupError:
        return
    except OSError:
        if process.poll() is not None:
            return
        raise


def _drain_stream(stream: IO[str], destination: _BoundedBytes) -> None:
    try:
        while True:
            chunk = stream.read(1024)
            if not chunk:
                return
            destination.append(chunk.encode("utf-8"))
    except UnicodeError:
        destination.append(b"The packaged server wrote invalid UTF-8 to stderr.\n")
    except (OSError, ValueError):
        return


def _read_one_line(stream: IO[str], timeout: float) -> str:
    result: queue.Queue[str | Exception] = queue.Queue(maxsize=1)

    def read() -> None:
        try:
            line = stream.readline(_MAX_READINESS_LINE_BYTES + 1)
            result.put(line)
        except (OSError, ValueError) as error:
            result.put(error)

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    try:
        value = result.get(timeout=timeout)
    except queue.Empty as error:
        raise RuntimeExecutionError(
            "The packaged Python Canvas server did not become ready in time."
        ) from error
    if isinstance(value, Exception):
        raise RuntimeExecutionError(
            "Unable to read the packaged server readiness message."
        ) from value
    if len(value.encode("utf-8")) > _MAX_READINESS_LINE_BYTES:
        raise RuntimeExecutionError(
            "The packaged server readiness message is too large."
        )
    if not value.endswith("\n"):
        raise RuntimeExecutionError(
            "The packaged server readiness message is incomplete."
        )
    return value.rstrip("\r\n")


def _parse_readiness(value: str, expected: ExpectedReadiness) -> ServerReadiness:
    try:
        raw: object = json.loads(value)
    except json.JSONDecodeError as error:
        raise RuntimeExecutionError(
            "The packaged server readiness message is not valid JSON."
        ) from error
    document = _readiness_mapping(raw)
    if document is None or set(document) != {
        "app",
        "nonce",
        "project",
        "url",
    }:
        raise RuntimeExecutionError(
            "The packaged server readiness message has an invalid shape."
        )
    fields = _readiness_fields(document)
    if fields is None:
        raise RuntimeExecutionError(
            "The packaged server readiness message has invalid values."
        )
    url, app_id, project_path, nonce = fields
    try:
        normalized_url = validate_loopback_http_url(url)
    except InvalidInputError as error:
        raise RuntimeExecutionError(
            "The packaged server readiness message has an invalid loopback URL."
        ) from error
    if (
        app_id != expected.app_id
        or project_path != expected.project_path
        or nonce != expected.instance_nonce
    ):
        raise RuntimeExecutionError(
            "The packaged server readiness identity does not match its launch."
        )
    return ServerReadiness(
        url=normalized_url,
        app_id=app_id,
        project_path=project_path,
        instance_nonce=nonce,
    )


def _startup_message(prefix: str, stderr: _BoundedBytes) -> str:
    diagnostic = stderr.text()
    if not diagnostic:
        return prefix
    return f"{prefix} {diagnostic}"


def _readiness_mapping(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    document: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            return None
        document[key] = item
    return document


def _readiness_fields(document: dict[str, object]) -> tuple[str, str, str, str] | None:
    url = document["url"]
    app_id = document["app"]
    project_path = document["project"]
    nonce = document["nonce"]
    if not isinstance(url, str) or not isinstance(app_id, str):
        return None
    if not isinstance(project_path, str) or not isinstance(nonce, str):
        return None
    return url, app_id, project_path, nonce
