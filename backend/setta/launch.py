import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from setta.sessions.registry import SessionMetadata, SessionRegistry
from setta.utils.paths import (
    SettaPaths,
    resolve_setta_paths,
    validate_optional_dir,
    validate_workspace_root,
)

DEFAULT_LAUNCH_TIMEOUT_SECONDS = 30.0
DEFAULT_LAUNCH_POLL_INTERVAL_SECONDS = 0.5
DEFAULT_EXISTING_SESSION_GRACE_SECONDS = 2.0


class LaunchError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LaunchResult:
    session: SessionMetadata
    registry: SessionRegistry
    paths: SettaPaths
    started_new: bool


def launch_workspace_session(
    *,
    workspace_root: Path | str | None,
    files_root: Path | str | None,
    files_root_base: Path | str | None,
    timeout_seconds: float = DEFAULT_LAUNCH_TIMEOUT_SECONDS,
    poll_interval_seconds: float = DEFAULT_LAUNCH_POLL_INTERVAL_SECONDS,
) -> LaunchResult:
    paths = resolve_setta_paths(
        workspace_root=workspace_root,
        files_root=files_root,
        files_root_base=files_root_base,
    )
    try:
        validate_workspace_root(paths.workspace_root)
    except ValueError as exc:
        raise LaunchError("InvalidWorkspace", str(exc)) from exc
    _validate_optional_dir(files_root, label="files root", code="InvalidFilesRoot")
    _validate_optional_dir(
        files_root_base, label="files root base", code="InvalidFilesRootBase"
    )

    registry = SessionRegistry(sessions_root=paths.runtime_sessions_root)
    sessions = registry.find_sessions_by_workspace(paths.workspace_root)
    if sessions:
        reachable_sessions = [
            session for session in sessions if _can_connect_to_session(session)
        ]
        if reachable_sessions:
            session = max(reachable_sessions, key=lambda entry: entry.startedAt)
            return LaunchResult(
                session=session,
                registry=registry,
                paths=paths,
                started_new=False,
            )

        latest = max(sessions, key=lambda entry: entry.startedAt)
        grace_deadline = time.monotonic() + min(
            timeout_seconds, DEFAULT_EXISTING_SESSION_GRACE_SECONDS
        )
        while time.monotonic() < grace_deadline:
            if _can_connect_to_session(latest):
                return LaunchResult(
                    session=latest,
                    registry=registry,
                    paths=paths,
                    started_new=False,
                )
            time.sleep(min(poll_interval_seconds, 0.2))

    process = _start_setta_process(paths)
    session = _wait_for_session(
        registry,
        paths.workspace_root,
        process.process,
        process.log_path,
        timeout_seconds=timeout_seconds,
        poll_interval_seconds=poll_interval_seconds,
    )
    return LaunchResult(
        session=session,
        registry=registry,
        paths=paths,
        started_new=True,
    )


@dataclass(frozen=True)
class _LaunchProcess:
    process: subprocess.Popen[str]
    log_path: Path


def _start_setta_process(paths: SettaPaths) -> _LaunchProcess:
    cmd = [
        sys.executable,
        "-m",
        "setta",
        "--no-open",
        "--workspace",
        str(paths.workspace_root),
        "--files-root",
        str(paths.setta_files_root),
    ]
    log_dir = paths.runtime_logs_root
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"launch-{time.time_ns()}-{os.getpid()}.log"
    handle = log_path.open("w", encoding="utf-8")
    try:
        process = subprocess.Popen(
            cmd,
            stdout=handle,
            stderr=subprocess.STDOUT,
            text=True,
        )
    finally:
        handle.close()
    return _LaunchProcess(process=process, log_path=log_path)


def _wait_for_session(
    registry: SessionRegistry,
    workspace_root: Path,
    process: subprocess.Popen[str],
    log_path: Path,
    *,
    timeout_seconds: float,
    poll_interval_seconds: float,
) -> SessionMetadata:
    deadline = time.monotonic() + timeout_seconds
    while True:
        sessions = registry.find_sessions_by_workspace(workspace_root)
        if sessions:
            # A Setta session registers itself before uvicorn starts listening, so
            # ensure the backend port is reachable before returning a bootstrap URL.
            latest = max(sessions, key=lambda entry: entry.startedAt)
            if _can_connect_to_session(latest):
                return latest
        if process.poll() is not None:
            details = _read_log_tail(log_path)
            message = details or "Setta exited before session startup completed."
            raise LaunchError("LaunchFailed", message)
        if time.monotonic() >= deadline:
            _terminate_launch_process(process, log_path=log_path)
            raise LaunchError(
                "LaunchTimeout",
                f"Timed out waiting for Setta to launch. Check logs at: {log_path}",
            )
        time.sleep(poll_interval_seconds)


def _can_connect_to_session(session: SessionMetadata) -> bool:
    host = session.host
    if host == "0.0.0.0":
        host = "127.0.0.1"
    elif host == "::":
        host = "::1"
    try:
        with socket.create_connection((host, session.port), timeout=0.25):
            return True
    except OSError:
        return False


def _validate_optional_dir(
    raw_path: Path | str | None, *, label: str, code: str
) -> None:
    try:
        validate_optional_dir(raw_path, label=label)
    except ValueError as exc:
        raise LaunchError(code, str(exc)) from exc


def _terminate_launch_process(
    process: subprocess.Popen[str], *, log_path: Path
) -> None:
    if process.poll() is not None:
        return
    try:
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(
                f"\n[setta] launch timed out; terminating process {process.pid}\n"
            )
    except OSError:
        pass
    try:
        process.terminate()
    except OSError:
        return
    try:
        process.wait(timeout=5.0)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        process.kill()
    except OSError:
        return
    try:
        process.wait(timeout=5.0)
    except subprocess.TimeoutExpired:
        return


def _read_log_tail(log_path: Path, *, max_bytes: int = 8000) -> str:
    try:
        with log_path.open("rb") as handle:
            try:
                handle.seek(0, os.SEEK_END)
                size = handle.tell()
                offset = max(0, size - max_bytes)
                handle.seek(offset, os.SEEK_SET)
            except OSError:
                pass
            data = handle.read(max_bytes)
    except OSError:
        return ""
    return data.decode("utf-8", errors="replace").strip()
