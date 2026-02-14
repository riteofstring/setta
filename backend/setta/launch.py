import os
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from setta.sessions.registry import SessionMetadata, SessionRegistry
from setta.utils.env_vars import PROFILE_LOOKUP_HOME_ENV
from setta.utils.paths import (
    ConflictingSettaFilesRootAndLocationError,
    InvalidSettaFilesLocationError,
    InvalidSettaFilesRootError,
    InvalidSettaProfileError,
    SettaFilesLocation,
    SettaPaths,
    SettaPathsError,
    UnknownSettaProfileError,
    get_optional_dir_validation_error,
    resolve_setta_paths,
    validate_workspace_root,
)
from setta.utils.user_config import SettaUserConfigError

DEFAULT_LAUNCH_TIMEOUT_SECONDS = 30.0
DEFAULT_LAUNCH_POLL_INTERVAL_SECONDS = 0.5
DEFAULT_EXISTING_SESSION_GRACE_SECONDS = 2.0
DEFAULT_EXISTING_SESSION_EXTENDED_GRACE_SECONDS = 10.0
DEFAULT_EXISTING_SESSION_RECENT_SECONDS = 15.0


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


def _existing_session_grace_seconds(
    session: SessionMetadata, *, timeout_seconds: float
) -> float:
    """Return how long we should wait for a newly registered existing session.

    Setta sessions register metadata before uvicorn starts listening. If startup is
    slower than DEFAULT_EXISTING_SESSION_GRACE_SECONDS, spawning a second backend
    for the same workspace is confusing and wasteful.
    """

    base_grace = min(timeout_seconds, DEFAULT_EXISTING_SESSION_GRACE_SECONDS)
    if session.pid <= 0:
        return base_grace
    started_at = session.startedAt
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
    if not (0.0 <= age_seconds <= DEFAULT_EXISTING_SESSION_RECENT_SECONDS):
        return base_grace
    return min(timeout_seconds, DEFAULT_EXISTING_SESSION_EXTENDED_GRACE_SECONDS)


def launch_workspace_session(
    *,
    workspace_root: Path | str | None,
    setta_home: Path | str | None = None,
    profile: str | None = None,
    setta_files_root: Path | str | None = None,
    setta_files_location: SettaFilesLocation | None,
    runtime_root: Path | str | None = None,
    timeout_seconds: float = DEFAULT_LAUNCH_TIMEOUT_SECONDS,
    poll_interval_seconds: float = DEFAULT_LAUNCH_POLL_INTERVAL_SECONDS,
) -> LaunchResult:
    try:
        paths = resolve_setta_paths(
            workspace_root=workspace_root,
            setta_home=setta_home,
            profile=profile,
            setta_files_root=setta_files_root,
            setta_files_location=setta_files_location,
            runtime_root=runtime_root,
        )
    except InvalidSettaFilesLocationError as exc:
        raise LaunchError("InvalidSettaFilesLocation", str(exc)) from exc
    except InvalidSettaFilesRootError as exc:
        raise LaunchError("InvalidSettaFilesRoot", str(exc)) from exc
    except ConflictingSettaFilesRootAndLocationError as exc:
        raise LaunchError("InvalidSettaFilesConfig", str(exc)) from exc
    except UnknownSettaProfileError as exc:
        raise LaunchError("UnknownSettaProfile", str(exc)) from exc
    except InvalidSettaProfileError as exc:
        raise LaunchError("InvalidSettaProfile", str(exc)) from exc
    except SettaUserConfigError as exc:
        raise LaunchError("InvalidSettaUserConfig", str(exc)) from exc
    except (SettaPathsError, ValueError) as exc:
        raise LaunchError("BadRequest", str(exc)) from exc
    try:
        validate_workspace_root(paths.workspace_root)
    except ValueError as exc:
        raise LaunchError("InvalidWorkspace", str(exc)) from exc
    for raw_path, label, code in (
        (paths.setta_home, "setta home", "InvalidSettaHome"),
        (paths.setta_files_root, "setta files root", "InvalidSettaFilesRoot"),
        (paths.runtime_root, "runtime root", "InvalidRuntimeRoot"),
    ):
        message = get_optional_dir_validation_error(raw_path, label=label)
        if message:
            raise LaunchError(code, message)

    registry = SessionRegistry(sessions_root=paths.runtime_sessions_root)
    sessions = registry.find_sessions_by_workspace(paths.workspace_root)
    if sessions:
        sessions.sort(key=lambda entry: entry.startedAt, reverse=True)
        for session in sessions:
            if _can_connect_to_session(session):
                return LaunchResult(
                    session=session,
                    registry=registry,
                    paths=paths,
                    started_new=False,
                )

        latest = sessions[0]
        grace_deadline = time.monotonic() + _existing_session_grace_seconds(
            latest, timeout_seconds=timeout_seconds
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
    ]
    if not paths.profile_name:
        cmd.extend(["--setta-home", str(paths.setta_home)])
    if paths.profile_name:
        cmd.extend(["--profile", paths.profile_name])
    if paths.setta_files_location is not None:
        cmd.extend(["--setta-files-location", paths.setta_files_location])
    else:
        cmd.extend(["--setta-files-root", str(paths.setta_files_root)])
    if paths.uses_explicit_runtime_root:
        cmd.extend(["--runtime-root", str(paths.runtime_root)])
    log_dir = paths.runtime_logs_root
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise LaunchError(
            "InvalidRuntimeRoot",
            f"Failed to initialize runtime logs directory: {log_dir}\nReason: {exc}",
        ) from exc
    log_path = log_dir / f"launch-{time.time_ns()}-{os.getpid()}.log"
    try:
        handle = log_path.open("w", encoding="utf-8")
    except OSError as exc:
        raise LaunchError(
            "InvalidRuntimeRoot",
            f"Failed to create launch log file: {log_path}\nReason: {exc}",
        ) from exc
    process: subprocess.Popen[str] | None = None
    try:
        popen_kwargs: dict[str, object] = {
            "stdout": handle,
            "stderr": subprocess.STDOUT,
            "text": True,
            "stdin": subprocess.DEVNULL,
            "cwd": str(paths.workspace_root),
        }
        env = os.environ.copy()
        env["SETTA_HOME"] = str(paths.setta_home)
        env[PROFILE_LOOKUP_HOME_ENV] = str(paths.profile_lookup_home)
        if paths.auth_cookie_name:
            env["SETTA_AUTH_COOKIE_NAME"] = paths.auth_cookie_name
        else:
            env.pop("SETTA_AUTH_COOKIE_NAME", None)
        popen_kwargs["env"] = env
        if os.name == "posix":
            popen_kwargs["start_new_session"] = True
        elif sys.platform == "win32":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        try:
            process = subprocess.Popen(
                cmd,
                **popen_kwargs,
            )
        except OSError as exc:
            try:
                handle.write(f"[setta] failed to spawn setta process: {exc}\n")
                handle.write(f"[setta] command: {cmd!r}\n")
                handle.flush()
            except OSError:
                pass
            raise LaunchError(
                "LaunchFailed",
                f"Failed to start Setta. Check logs at: {log_path}",
            ) from exc
    finally:
        handle.close()
    if process is None:  # pragma: no cover
        raise LaunchError(
            "LaunchFailed",
            f"Failed to start Setta. Check logs at: {log_path}",
        )
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
            raise LaunchError(
                "LaunchFailed",
                f"{message}\n\nCheck logs at: {log_path}",
            )
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
    if os.name == "posix" and process.pid:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except OSError:
            pass
        else:
            try:
                process.wait(timeout=5.0)
                return
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except OSError:
                    return
                try:
                    process.wait(timeout=5.0)
                except subprocess.TimeoutExpired:
                    return
                return

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
