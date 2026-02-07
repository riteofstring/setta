import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from setta.sessions.registry import SessionMetadata, SessionRegistry
from setta.utils.paths import SettaPaths, resolve_setta_paths, validate_workspace_root

DEFAULT_LAUNCH_TIMEOUT_SECONDS = 30.0
DEFAULT_LAUNCH_POLL_INTERVAL_SECONDS = 0.5


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
        session = max(sessions, key=lambda entry: entry.startedAt)
        return LaunchResult(
            session=session,
            registry=registry,
            paths=paths,
            started_new=False,
        )

    process = _start_setta_process(paths)
    session = _wait_for_session(
        registry,
        paths.workspace_root,
        process,
        timeout_seconds=timeout_seconds,
        poll_interval_seconds=poll_interval_seconds,
    )
    return LaunchResult(
        session=session,
        registry=registry,
        paths=paths,
        started_new=True,
    )


def _start_setta_process(paths: SettaPaths) -> subprocess.Popen[str]:
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
    return subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def _wait_for_session(
    registry: SessionRegistry,
    workspace_root: Path,
    process: subprocess.Popen[str],
    *,
    timeout_seconds: float,
    poll_interval_seconds: float,
) -> SessionMetadata:
    deadline = time.monotonic() + timeout_seconds
    while True:
        sessions = registry.find_sessions_by_workspace(workspace_root)
        if sessions:
            return max(sessions, key=lambda entry: entry.startedAt)
        if process.poll() is not None:
            stdout, stderr = process.communicate(timeout=0)
            details = (stderr or stdout or "").strip()
            message = details or "Setta exited before session startup completed."
            raise LaunchError("LaunchFailed", message)
        if time.monotonic() >= deadline:
            raise LaunchError("LaunchTimeout", "Timed out waiting for Setta to launch.")
        time.sleep(poll_interval_seconds)


def _validate_optional_dir(
    raw_path: Path | str | None, *, label: str, code: str
) -> None:
    if raw_path is None:
        return
    path = Path(raw_path).expanduser()
    if path.exists() and not path.is_dir():
        raise LaunchError(code, f"{label} is not a directory: {path}")
