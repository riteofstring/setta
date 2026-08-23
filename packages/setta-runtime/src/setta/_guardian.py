"""Private POSIX session guardian for one packaged native server.

The public supervisor starts this module as a fresh session leader.  The
native worker inherits its standard descriptors unchanged, so readiness and
diagnostics cross the boundary as the original UTF-8 byte stream.  Keeping the
guardian alive until cleanup makes its PID a stable session identifier while
we stop workers which made their own process groups.
"""

from __future__ import annotations

import ctypes
import errno
import os
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from types import FrameType, TracebackType
from typing import Any

_PROCESS_SNAPSHOT_TIMEOUT_SECONDS = 0.1
_FORCED_WORKER_REAP_SECONDS = 0.3
_TERMINATE_SETTLE_SECONDS = 0.15
_KILL_SETTLE_SECONDS = 0.03
_CLEANUP_FAILURE_EXIT_CODE = 70
_POSIX_PS_PATHS = (Path("/bin/ps"), Path("/usr/bin/ps"))
_LINUX_PROC_ROOT = Path("/proc")
_LINUX_PR_SET_CHILD_SUBREAPER = 36
_HANGUP_SIGNAL = getattr(signal, "SIGHUP", None)
_FORWARDED_SIGNALS = (
    (signal.SIGINT, signal.SIGTERM, _HANGUP_SIGNAL)
    if isinstance(_HANGUP_SIGNAL, signal.Signals)
    else (signal.SIGINT, signal.SIGTERM)
)
_UNCHANGEABLE_SIGNALS = frozenset(
    delivery
    for delivery in (getattr(signal, "SIGKILL", None), getattr(signal, "SIGSTOP", None))
    if isinstance(delivery, signal.Signals)
)


@dataclass(frozen=True)
class _ProcessIdentity:
    pid: int
    parent_pid: int
    session_id: int


class _CleanupFailure(RuntimeError):
    """The guardian could not prove that its remaining session is clean."""


class _WorkerSignalForwarder:
    """Wake the guardian lifecycle without directly targeting a worker PID."""

    def __init__(self) -> None:
        self._wake = threading.Event()

    def handle(self, _signum: int, _frame: FrameType | None) -> None:
        self._wake.set()

    def wait_for_lifecycle_change(self) -> None:
        self._wake.wait()

    def wake(self) -> None:
        self._wake.set()


class _WorkerWaiter:
    """Own the one worker wait/reap call without blocking signal escalation."""

    def __init__(
        self, worker: subprocess.Popen[bytes], forwarder: _WorkerSignalForwarder
    ) -> None:
        self._worker = worker
        self._forwarder = forwarder
        self._done = threading.Event()
        self.error: OSError | None = None
        self.returncode: int | None = None

    def start(self) -> None:
        threading.Thread(target=self._wait, daemon=True).start()

    def wait(self, timeout: float) -> bool:
        return self._done.wait(timeout)

    def _wait(self) -> None:
        try:
            self.returncode = self._worker.wait()
        except OSError as error:
            self.error = error
        finally:
            self._done.set()
            self._forwarder.wake()


def main(arguments: Sequence[str] | None = None) -> int:
    """Run the private native worker and clean its POSIX session on exit."""

    command = _worker_command(arguments if arguments is not None else sys.argv[1:])
    if command is None:
        _write_stderr("The private Setta server guardian needs a worker command.\n")
        return 2
    try:
        _enable_linux_child_subreaper()
    except OSError as error:
        _write_stderr(
            f"Unable to establish packaged server child containment: {error}\n"
        )
        return 127
    forwarder = _WorkerSignalForwarder()
    with _forward_worker_signals(forwarder):
        try:
            worker = subprocess.Popen(command)
        except OSError as error:
            _write_stderr(f"Unable to start the packaged server worker: {error}\n")
            return 127
        waiter = _WorkerWaiter(worker, forwarder)
        waiter.start()
        forwarder.wait_for_lifecycle_change()
        cleanup_failure = _stop_and_reap_worker_boundary(worker, waiter, os.getpid())
    if cleanup_failure is not None:
        _write_stderr(f"Setta server guardian cleanup failed: {cleanup_failure}\n")
    return _guardian_exit_status(waiter.returncode, cleanup_failure)


def _join_cleanup_failures(existing: str | None, additional: str | None) -> str | None:
    if additional is None:
        return existing
    if existing is None:
        return additional
    return f"{existing} {additional}"


def _stop_and_reap_worker_boundary(
    worker: subprocess.Popen[bytes],
    waiter: _WorkerWaiter,
    session_id: int,
) -> str | None:
    """Keep this subreaper alive until its direct worker is actually reaped.

    A process can take longer than the ordinary forced-reap budget to leave the
    kernel (for example while an interruptible syscall unwinds). Returning at
    that point would discard the Linux subreaper boundary and let an escaped
    ``setsid`` descendant be reparented to init. Each pass remains bounded, but
    the guardian itself stays alive and repeats containment until its waiter has
    consumed the worker's exit status.
    """

    # The worker's waiter owns the direct-child reap. Until it finishes, a
    # killed adopted descendant can be a zombie that only this still-running
    # guardian can reap later. Keep enumeration and signal failures, but make
    # the pre-reap survivor view provisional so it cannot turn a later-clean
    # exit into a false cleanup failure.
    cleanup_failure = _cleanup_session(session_id, provisional_survivors=True)
    while not waiter.wait(_FORCED_WORKER_REAP_SECONDS):
        cleanup_failure = _join_cleanup_failures(
            cleanup_failure, _kill_worker_if_running(worker)
        )
        cleanup_failure = _join_cleanup_failures(
            cleanup_failure,
            _cleanup_session(session_id, provisional_survivors=True),
        )

    # Linux makes this guardian the reaper for every orphaned worker
    # descendant, including a descendant that called setsid(). Once the direct
    # worker is reaped, make one final bounded cleanup/reap pass while this
    # process is still the stable adoption boundary.
    cleanup_failure = _join_cleanup_failures(
        cleanup_failure, _cleanup_session(session_id, reap_adopted=True)
    )
    if waiter.error is not None:
        cleanup_failure = _join_cleanup_failures(
            cleanup_failure,
            "Unable to reap the packaged server worker.",
        )
    return cleanup_failure


def _kill_worker_if_running(worker: subprocess.Popen[bytes]) -> str | None:
    if worker.poll() is not None:
        return None
    try:
        worker.kill()
    except ProcessLookupError:
        return None
    except OSError as error:
        return f"Unable to force-stop the packaged server worker: {error}."
    return None


def _guardian_exit_status(returncode: int | None, cleanup_failure: str | None) -> int:
    if returncode is None or (returncode == 0 and cleanup_failure is not None):
        return _CLEANUP_FAILURE_EXIT_CODE
    return _worker_exit_status(returncode)


def _worker_command(arguments: Sequence[str]) -> tuple[str, ...] | None:
    if len(arguments) < 2 or arguments[0] != "--":
        return None
    return tuple(arguments[1:])


def _forward_worker_signals(
    forwarder: _WorkerSignalForwarder,
) -> _SignalHandlerRestorer:
    previous = {
        delivery: signal.signal(delivery, forwarder.handle)
        for delivery in _FORWARDED_SIGNALS
    }
    return _SignalHandlerRestorer(previous)


class _SignalHandlerRestorer:
    def __init__(self, previous: dict[signal.Signals, Any]) -> None:
        self._previous = previous

    def __enter__(self) -> None:
        return None

    def __exit__(
        self,
        _exception_type: type[BaseException] | None,
        _exception: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        for delivery, handler in self._previous.items():
            signal.signal(delivery, handler)


def _cleanup_session(
    session_id: int,
    *,
    reap_adopted: bool = False,
    provisional_survivors: bool = False,
) -> str | None:
    """Boundedly stop every still-live member of the guardian's session.

    This runs after either worker exit or a forced guardian signal. It is an
    intentionally small, fixed cleanup sequence rather than a tracker. The
    guardian is still the session leader, so its live PID makes matching
    numeric session IDs belong to this supervision boundary. POSIX has no portable atomic
    inspect-and-signal operation, so a member may naturally exit between a
    snapshot and delivery; an already-gone member is therefore harmless.
    Other enumeration, permission, and final-survivor failures are returned so
    a normal worker exit cannot falsely report a clean shutdown.
    """

    try:
        members = _guardian_members(session_id)
        _signal_members(session_id, members, signal.SIGTERM)
        if members:
            time.sleep(_TERMINATE_SETTLE_SECONDS)
        members = _guardian_members(session_id)
        _signal_members(session_id, members, signal.SIGKILL)
        time.sleep(_KILL_SETTLE_SECONDS)
        survivors = _guardian_members(session_id)
        _signal_members(session_id, survivors, signal.SIGKILL)
        if survivors:
            time.sleep(_KILL_SETTLE_SECONDS)
        reap_failure = _reap_linux_adopted_children() if reap_adopted else None
        final_survivors = _guardian_members(session_id)
    except _CleanupFailure as error:
        return str(error)
    if not final_survivors or provisional_survivors:
        return reap_failure
    survivor_pids = ", ".join(str(member.pid) for member in final_survivors)
    return _join_cleanup_failures(
        reap_failure, f"Remaining guardian-session processes: {survivor_pids}."
    )


def _session_members(session_id: int) -> tuple[_ProcessIdentity, ...]:
    records, snapshot_pid = _process_snapshot()
    return _session_members_from_snapshot(records, snapshot_pid, session_id)


def _guardian_members(session_id: int) -> tuple[_ProcessIdentity, ...]:
    if not sys.platform.startswith("linux"):
        return _session_members(session_id)
    records, snapshot_pid = _process_snapshot()
    session_members = _session_members_from_snapshot(records, snapshot_pid, session_id)
    descendants = _guardian_descendants(records, snapshot_pid, session_id)
    by_pid = {member.pid: member for member in (*session_members, *descendants)}
    return _leaf_first(tuple(by_pid.values()))


def _session_members_from_snapshot(
    records: Sequence[_ProcessIdentity], snapshot_pid: int, session_id: int
) -> tuple[_ProcessIdentity, ...]:
    members = tuple(
        record
        for record in records
        if record.session_id == session_id
        and record.pid != session_id
        and record.pid != snapshot_pid
    )
    return _leaf_first(members)


def _guardian_descendants(
    records: Sequence[_ProcessIdentity], snapshot_pid: int, guardian_pid: int
) -> tuple[_ProcessIdentity, ...]:
    """Return the live process-tree boundary that a Linux subreaper owns.

    A descendant that calls setsid() leaves the guardian's SID but remains a
    child of the running worker. Once that worker exits, PR_SET_CHILD_SUBREAPER
    reparents it to this guardian instead of init. We derive membership from a
    single numeric PID/PPID snapshot, then re-snapshot immediately before every
    delivery in _guardian_member_matches.
    """

    by_pid = {record.pid: record for record in records}
    members: list[_ProcessIdentity] = []
    for record in records:
        if record.pid in {guardian_pid, snapshot_pid}:
            continue
        parent_pid = record.parent_pid
        visited = {record.pid}
        while parent_pid not in visited:
            if parent_pid == guardian_pid:
                members.append(record)
                break
            parent = by_pid.get(parent_pid)
            if parent is None:
                break
            visited.add(parent_pid)
            parent_pid = parent.parent_pid
    return _leaf_first(tuple(members))


def _process_snapshot() -> tuple[tuple[_ProcessIdentity, ...], int]:
    if sys.platform == "darwin":
        return _darwin_process_snapshot()
    if sys.platform.startswith("linux"):
        return _linux_process_snapshot()
    raise _CleanupFailure("This POSIX platform has no supported process snapshot.")


def _darwin_process_snapshot() -> tuple[tuple[_ProcessIdentity, ...], int]:
    command = _posix_ps_command()
    if command is None:
        raise _CleanupFailure("The fixed-path process snapshot command is unavailable.")
    snapshot: subprocess.Popen[str] | None = None
    try:
        snapshot = subprocess.Popen(
            command,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="strict",
        )
        output, _ = snapshot.communicate(timeout=_PROCESS_SNAPSHOT_TIMEOUT_SECONDS)
    except (OSError, UnicodeError, subprocess.TimeoutExpired) as error:
        if snapshot is not None:
            _stop_snapshot(snapshot)
        raise _CleanupFailure("The guardian process snapshot failed.") from error
    if snapshot.returncode != 0:
        raise _CleanupFailure("The guardian process snapshot command failed.")
    return (_parse_darwin_process_snapshot(output, snapshot.pid), snapshot.pid)


def _linux_process_snapshot() -> tuple[tuple[_ProcessIdentity, ...], int]:
    try:
        with os.scandir(_LINUX_PROC_ROOT) as directory:
            entries = tuple(
                entry.name
                for entry in directory
                if entry.name.isascii() and entry.name.isdecimal()
            )
    except OSError as error:
        raise _CleanupFailure(
            "The guardian process snapshot is unavailable."
        ) from error
    identities: dict[int, _ProcessIdentity] = {}
    for name in entries:
        pid = int(name)
        try:
            value = (_LINUX_PROC_ROOT / name / "stat").read_bytes()
        except OSError as error:
            if _is_process_gone(error):
                continue
            if isinstance(error, PermissionError):
                raise _CleanupFailure(
                    "Permission was denied while enumerating guardian processes."
                ) from error
            raise _CleanupFailure("The guardian process snapshot failed.") from error
        identity = _parse_linux_process_stat(pid, value)
        if identity.pid in identities:
            raise _CleanupFailure("The guardian process snapshot was malformed.")
        identities[identity.pid] = identity
    return (tuple(identities.values()), -1)


def _stop_snapshot(snapshot: subprocess.Popen[str]) -> None:
    try:
        snapshot.kill()
        snapshot.wait(timeout=_KILL_SETTLE_SECONDS)
    except (OSError, subprocess.TimeoutExpired):
        return


def _posix_ps_command() -> tuple[str, str, str] | None:
    for executable in _POSIX_PS_PATHS:
        if executable.is_file() and os.access(executable, os.X_OK):
            return (str(executable), "-axo", "pid=,ppid=")
    return None


def _parse_process_snapshot(value: str) -> tuple[_ProcessIdentity, ...]:
    identities: dict[int, _ProcessIdentity] = {}
    for line in value.splitlines():
        fields = line.split()
        if len(fields) != 3 or not all(
            field.isascii() and field.isdecimal() for field in fields
        ):
            raise _CleanupFailure("The guardian process snapshot was malformed.")
        pid, parent_pid, session_id = (int(field) for field in fields)
        if pid < 1 or parent_pid < 0 or session_id < 1 or pid in identities:
            raise _CleanupFailure("The guardian process snapshot was malformed.")
        identities[pid] = _ProcessIdentity(pid, parent_pid, session_id)
    return tuple(identities.values())


def _parse_darwin_process_snapshot(
    value: str, snapshot_pid: int
) -> tuple[_ProcessIdentity, ...]:
    identities: dict[int, _ProcessIdentity] = {}
    for line in value.splitlines():
        fields = line.split()
        if len(fields) != 2 or not all(
            field.isascii() and field.isdecimal() for field in fields
        ):
            raise _CleanupFailure("The guardian process snapshot was malformed.")
        pid, parent_pid = (int(field) for field in fields)
        if pid == snapshot_pid:
            continue
        if pid < 1 or parent_pid < 0:
            raise _CleanupFailure("The guardian process snapshot was malformed.")
        session_id = _process_session_id(pid)
        if session_id is None:
            continue
        if pid in identities:
            raise _CleanupFailure("The guardian process snapshot was malformed.")
        identities[pid] = _ProcessIdentity(pid, parent_pid, session_id)
    return tuple(identities.values())


def _parse_linux_process_stat(pid: int, value: bytes) -> _ProcessIdentity:
    closing_parenthesis = value.rfind(b")")
    fields = value[closing_parenthesis + 1 :].split()
    if (
        pid < 1
        or closing_parenthesis < 1
        or len(fields) < 4
        or not _decimal_bytes(fields[1])
        or not _decimal_bytes(fields[3])
    ):
        raise _CleanupFailure("The guardian process snapshot was malformed.")
    parent_pid = int(fields[1])
    session_id = int(fields[3])
    if parent_pid < 0 or session_id < 1:
        raise _CleanupFailure("The guardian process snapshot was malformed.")
    return _ProcessIdentity(pid, parent_pid, session_id)


def _decimal_bytes(value: bytes) -> bool:
    return bool(value) and all(48 <= character <= 57 for character in value)


def _leaf_first(
    identities: Sequence[_ProcessIdentity],
) -> tuple[_ProcessIdentity, ...]:
    selected = tuple(identities)
    by_pid = {identity.pid: identity for identity in selected}

    def depth(identity: _ProcessIdentity) -> int:
        result = 0
        parent_pid = identity.parent_pid
        visited = {identity.pid}
        while parent_pid in by_pid and parent_pid not in visited:
            visited.add(parent_pid)
            result += 1
            parent_pid = by_pid[parent_pid].parent_pid
        return result

    return tuple(
        sorted(selected, key=lambda identity: (-depth(identity), identity.pid))
    )


def _signal_members(
    session_id: int,
    members: Sequence[_ProcessIdentity],
    delivery: signal.Signals,
) -> None:
    for member in members:
        # Re-check directly before delivery. This catches a PID that exited
        # after the snapshot and was reused outside the live guardian boundary.
        if not _guardian_member_matches(session_id, member.pid):
            continue
        try:
            os.kill(member.pid, delivery)
        except OSError as error:
            if _is_process_gone(error):
                continue
            if isinstance(error, PermissionError):
                raise _CleanupFailure(
                    "Permission was denied while stopping guardian processes."
                ) from error
            raise _CleanupFailure("Unable to stop guardian processes.") from error


def _guardian_member_matches(guardian_pid: int, pid: int) -> bool:
    """Revalidate a selected member before signaling it.

    The guardian SID remains the authority on every POSIX platform. Linux also
    accepts a live descendant of the subreaper so a worker's setsid() child is
    still contained. A fresh snapshot makes an unrelated PID with the same
    numeric value ineligible unless it is currently in that guardian tree.
    """

    if _process_session_id(pid) == guardian_pid:
        return True
    if not sys.platform.startswith("linux"):
        return False
    records, snapshot_pid = _process_snapshot()
    return any(
        member.pid == pid
        for member in _guardian_descendants(records, snapshot_pid, guardian_pid)
    )


def _enable_linux_child_subreaper() -> None:
    """Make this Linux guardian the reaper for orphaned worker descendants."""

    if not sys.platform.startswith("linux"):
        return
    libc = ctypes.CDLL(None, use_errno=True)
    try:
        prctl = libc.prctl
    except AttributeError as error:
        raise OSError("Linux prctl is unavailable for child containment.") from error
    prctl.argtypes = [
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
    ]
    prctl.restype = ctypes.c_int
    if prctl(_LINUX_PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) == 0:
        return
    error_number = ctypes.get_errno()
    raise OSError(error_number, os.strerror(error_number))


def _reap_linux_adopted_children() -> str | None:
    """Reap exited children adopted through the Linux subreaper boundary."""

    if not sys.platform.startswith("linux"):
        return None
    deadline = time.monotonic() + _KILL_SETTLE_SECONDS
    try:
        while True:
            pid, _status = os.waitpid(-1, os.WNOHANG)
            if pid != 0:
                continue
            if time.monotonic() >= deadline:
                return None
            time.sleep(_KILL_SETTLE_SECONDS / 3)
    except ChildProcessError:
        return None
    except OSError as error:
        return f"Unable to reap packaged server descendants: {error}."


def _process_session_id(pid: int) -> int | None:
    get_session_id = getattr(os, "getsid", None)
    if not callable(get_session_id):
        raise _CleanupFailure("This POSIX platform cannot verify guardian processes.")
    try:
        session_id = get_session_id(pid)
    except OSError as error:
        if _is_process_gone(error):
            return None
        if isinstance(error, PermissionError):
            raise _CleanupFailure(
                "Permission was denied while verifying guardian processes."
            ) from error
        raise _CleanupFailure("Unable to verify guardian processes.") from error
    if not isinstance(session_id, int):
        raise _CleanupFailure("Unable to verify guardian processes.")
    return session_id


def _is_process_gone(error: OSError) -> bool:
    return error.errno in {errno.ENOENT, errno.ESRCH}


def _worker_exit_status(returncode: int) -> int:
    if returncode >= 0:
        return returncode
    delivery = signal.Signals(-returncode)
    _raise_worker_signal(delivery)
    return 128 + int(delivery)


def _raise_worker_signal(delivery: signal.Signals) -> None:
    if delivery not in _UNCHANGEABLE_SIGNALS:
        signal.signal(delivery, signal.SIG_DFL)
    os.kill(os.getpid(), delivery)


def _write_stderr(message: str) -> None:
    try:
        sys.stderr.write(message)
        sys.stderr.flush()
    except OSError:
        return


if __name__ == "__main__":
    raise SystemExit(main())
