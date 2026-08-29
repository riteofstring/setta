from __future__ import annotations

import hashlib
import json
import os
import secrets
import tempfile
import time
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .errors import (
    RuntimeExecutionError,
    SessionAlreadyRunningError,
    SessionNotFoundError,
    SessionStaleError,
)

SESSION_FORMAT = "setta-live-session/v1"
LOCK_FORMAT = "setta-live-session-lock/v1"
_SESSION_RECORD_KEYS = {
    "appId",
    "formatVersion",
    "instanceNonce",
    "ownerPid",
    "projectPath",
    "url",
}
_LOCK_WAIT_SECONDS = 5.0
_LOCK_POLL_SECONDS = 0.05
_WINDOWS_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_WINDOWS_STILL_ACTIVE = 259
_WINDOWS_ERROR_ACCESS_DENIED = 5
_WINDOWS_ERROR_INVALID_PARAMETER = 87
_WINDOWS_ERROR_NOT_FOUND = 1168


class _WindowsProcessApi(Protocol):
    def open_query_handle(self, process_id: int) -> int: ...

    def last_error(self) -> int: ...

    def exit_code(self, handle: int) -> int | None: ...

    def close_handle(self, handle: int) -> bool: ...


@dataclass(frozen=True)
class LiveSession:
    app_id: str
    project_path: str
    url: str
    owner_pid: int
    instance_nonce: str

    def document(self) -> dict[str, object]:
        return {
            "appId": self.app_id,
            "formatVersion": SESSION_FORMAT,
            "instanceNonce": self.instance_nonce,
            "ownerPid": self.owner_pid,
            "projectPath": self.project_path,
            "url": self.url,
        }


class SessionLease(AbstractContextManager["SessionLease"]):
    def __init__(
        self, store: LiveSessionStore, app_id: str, project_path: str, lock_path: Path
    ):
        self._store = store
        self.app_id = app_id
        self.project_path = project_path
        self._lock_path = lock_path
        self._closed = False
        self._startup_lock_held = True

    def publish(self, session: LiveSession) -> None:
        if self._closed:
            raise RuntimeExecutionError(
                "The live-session ownership lease is already closed."
            )
        if session.app_id != self.app_id or session.project_path != self.project_path:
            raise RuntimeExecutionError(
                "The live-session record does not match its ownership lease."
            )
        if not self._startup_lock_held:
            raise RuntimeExecutionError(
                "The live-session ownership lease has already published a record."
            )
        self._store._write_record(session)
        self._release_startup_lock()

    def close(self) -> None:
        if self._closed:
            return
        self._release_startup_lock()
        self._closed = True

    def _release_startup_lock(self) -> None:
        if not self._startup_lock_held:
            return
        try:
            self._lock_path.unlink()
        except FileNotFoundError:
            pass
        except OSError as error:
            raise RuntimeExecutionError(
                "Unable to release live-session startup ownership."
            ) from error
        self._startup_lock_held = False

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        self.close()


class LiveSessionStore:
    def __init__(
        self,
        root: Path | None = None,
        *,
        process_alive: Callable[[int], bool] | None = None,
        now: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self._root = root or default_session_root()
        self._process_alive = process_alive or process_is_alive
        self._now = now
        self._sleep = sleep

    @property
    def root(self) -> Path:
        self._ensure_root()
        return self._root

    def canonical_project_path(self, path: str | Path) -> str:
        value = str(path).strip()
        if not value:
            raise SessionNotFoundError(
                "A project path is required to locate a live session."
            )
        return str(Path(value).expanduser().resolve(strict=False))

    def claim(
        self,
        app_id: str,
        project_path: str | Path,
        verify: Callable[[LiveSession], bool],
    ) -> SessionLease:
        canonical_path = self.canonical_project_path(project_path)
        record_path = self._record_path(app_id, canonical_path)
        lock_path = self._acquire_lock(app_id, canonical_path)
        lease_created = False
        try:
            existing = self._read_record(record_path, app_id, canonical_path)
            if existing is not None:
                if self._is_live(existing, verify):
                    raise SessionAlreadyRunningError(
                        "A live Setta session is already running for this project.",
                        {"projectPath": canonical_path, "url": existing.url},
                    )
                self._remove_record_path(record_path)
            elif _path_exists(record_path):
                self._remove_record_path(record_path)
            lease = SessionLease(self, app_id, canonical_path, lock_path)
            lease_created = True
            return lease
        finally:
            if not lease_created:
                _unlink_if_exists(lock_path)

    def resolve(
        self,
        app_id: str,
        project_path: str | Path,
        verify: Callable[[LiveSession], bool],
    ) -> LiveSession:
        canonical_path = self.canonical_project_path(project_path)
        record_path = self._record_path(app_id, canonical_path)
        lock_path = self._acquire_lock(app_id, canonical_path)
        try:
            session = self._read_record(record_path, app_id, canonical_path)
            if session is None:
                if _path_exists(record_path):
                    self._remove_record_path(record_path)
                    raise SessionStaleError(
                        "The recorded Setta live session is invalid.",
                        {"projectPath": canonical_path},
                    )
                raise SessionNotFoundError(
                    "No live Setta session exists for this project.",
                    {"projectPath": canonical_path},
                )
            if self._is_live(session, verify):
                return session
            self._remove_record_path(record_path)
            raise SessionStaleError(
                "The recorded Setta live session is no longer live.",
                {"projectPath": canonical_path},
            )
        finally:
            _unlink_if_exists(lock_path)

    def remove_if_owned(self, session: LiveSession) -> None:
        canonical_path = self.canonical_project_path(session.project_path)
        if session.project_path != canonical_path:
            raise RuntimeExecutionError(
                "The live-session ownership record has a non-canonical project path."
            )
        record_path = self._record_path(session.app_id, canonical_path)
        lock_path = self._acquire_lock(session.app_id, canonical_path)
        try:
            current = self._read_record(record_path, session.app_id, canonical_path)
            if current is not None and current.instance_nonce == session.instance_nonce:
                self._remove_record_path(record_path)
        finally:
            _unlink_if_exists(lock_path)

    def _is_live(
        self, session: LiveSession, verify: Callable[[LiveSession], bool]
    ) -> bool:
        if not self._process_alive(session.owner_pid):
            return False
        return bool(verify(session))

    def _record_path(self, app_id: str, canonical_path: str) -> Path:
        self._validate_app_id(app_id)
        digest = hashlib.sha256(f"{app_id}\x00{canonical_path}".encode()).hexdigest()
        return self.root / f"{app_id}-{digest}.json"

    def _lock_path(self, app_id: str, canonical_path: str) -> Path:
        return self._record_path(app_id, canonical_path).with_suffix(".lock")

    def _acquire_lock(self, app_id: str, canonical_path: str) -> Path:
        lock_path = self._lock_path(app_id, canonical_path)
        deadline = self._now() + _LOCK_WAIT_SECONDS
        payload = json.dumps(
            {
                "formatVersion": LOCK_FORMAT,
                "ownerPid": os.getpid(),
                "nonce": secrets.token_urlsafe(24),
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        while True:
            try:
                descriptor = os.open(
                    lock_path,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                    0o600,
                )
            except FileExistsError:
                if self._lock_belongs_to_current_process(lock_path):
                    raise SessionAlreadyRunningError(
                        "Another Setta command is starting or inspecting this project."
                    )
                if self._lock_is_stale(lock_path):
                    _unlink_if_exists(lock_path)
                    continue
                if self._now() >= deadline:
                    raise SessionAlreadyRunningError(
                        "Another Setta command is starting or inspecting this project."
                    )
                self._sleep(_LOCK_POLL_SECONDS)
                continue
            except OSError as error:
                raise RuntimeExecutionError(
                    "Unable to acquire live-session ownership for this project."
                ) from error
            written = False
            try:
                with os.fdopen(descriptor, "wb") as stream:
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                written = True
                return lock_path
            finally:
                if not written:
                    _unlink_if_exists(lock_path)

    def _lock_is_stale(self, lock_path: Path) -> bool:
        owner_pid = self._lock_owner_pid(lock_path)
        return owner_pid is None or not self._process_alive(owner_pid)

    def _lock_belongs_to_current_process(self, lock_path: Path) -> bool:
        return self._lock_owner_pid(lock_path) == os.getpid()

    @staticmethod
    def _lock_owner_pid(lock_path: Path) -> int | None:
        try:
            raw = json.loads(lock_path.read_text(encoding="utf-8"))
            owner_pid = raw.get("ownerPid") if isinstance(raw, dict) else None
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return None
        return owner_pid if isinstance(owner_pid, int) and owner_pid >= 1 else None

    def _write_record(self, session: LiveSession) -> None:
        self._validate_app_id(session.app_id)
        if session.owner_pid < 1 or not session.instance_nonce or not session.url:
            raise RuntimeExecutionError("The live-session record is invalid.")
        if self.canonical_project_path(session.project_path) != session.project_path:
            raise RuntimeExecutionError(
                "The live-session record project path must be canonical."
            )
        target = self._record_path(session.app_id, session.project_path)
        temporary = target.with_name(f".{target.name}.{secrets.token_hex(12)}.tmp")
        descriptor: int | None = None
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                descriptor = None
                json.dump(
                    session.document(), stream, separators=(",", ":"), sort_keys=True
                )
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            _fsync_directory(target.parent)
        except OSError as error:
            raise RuntimeExecutionError(
                "Unable to publish the live-session record."
            ) from error
        finally:
            if descriptor is not None:
                os.close(descriptor)
            _unlink_if_exists(temporary)

    def _read_record(
        self, path: Path, expected_app_id: str, expected_project_path: str
    ) -> LiveSession | None:
        raw = _read_record_document(path)
        if raw is None:
            return None
        session = _parse_record_document(raw)
        if session is None:
            return None
        if not self._matches_record_key(
            session, expected_app_id, expected_project_path
        ):
            return None
        return session

    def _matches_record_key(
        self, session: LiveSession, expected_app_id: str, expected_project_path: str
    ) -> bool:
        if session.app_id != expected_app_id:
            return False
        if session.project_path != expected_project_path:
            return False
        try:
            return (
                self.canonical_project_path(session.project_path)
                == session.project_path
            )
        except RuntimeExecutionError:
            return False

    def _remove_record_path(self, path: Path) -> None:
        try:
            path.unlink()
            _fsync_directory(path.parent)
        except FileNotFoundError:
            return
        except OSError as error:
            raise RuntimeExecutionError(
                "Unable to remove a stale live-session record."
            ) from error

    def _ensure_root(self) -> None:
        try:
            self._root.mkdir(mode=0o700, parents=True, exist_ok=True)
            if not self._root.is_dir() or self._root.is_symlink():
                raise RuntimeExecutionError("The live-session directory is invalid.")
            if os.name != "nt":
                self._root.chmod(0o700)
        except OSError as error:
            if isinstance(error, RuntimeExecutionError):
                raise
            raise RuntimeExecutionError(
                "Unable to prepare the live-session directory."
            ) from error

    @staticmethod
    def _validate_app_id(app_id: str) -> None:
        if not app_id or any(character in app_id for character in "/\\\x00"):
            raise RuntimeExecutionError("The live-session app ID is invalid.")


def default_session_root() -> Path:
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        base = Path(local_app_data) if local_app_data else Path(tempfile.gettempdir())
        return base / "Setta" / "runtime" / "sessions"
    runtime_directory = os.environ.get("XDG_RUNTIME_DIR")
    if runtime_directory:
        return Path(runtime_directory) / "setta" / "sessions"
    uid = os.getuid() if hasattr(os, "getuid") else os.getpid()
    return Path(tempfile.gettempdir()) / f"setta-{uid}" / "sessions"


def process_is_alive(pid: int) -> bool:

    return _process_is_alive(
        pid,
        os.name,
        _windows_process_is_alive,
        _posix_process_is_alive,
    )


def _process_is_alive(
    pid: int,
    platform: str,
    windows_probe: Callable[[int], bool],
    posix_probe: Callable[[int], bool],
) -> bool:
    if pid < 1:
        return False
    if pid == os.getpid():
        return True
    if platform == "nt":
        return windows_probe(pid)
    return posix_probe(pid)


def _posix_process_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _windows_process_is_alive(pid: int, api: _WindowsProcessApi | None = None) -> bool:
    process_api = api or _CtypesWindowsProcessApi()
    handle = process_api.open_query_handle(pid)
    if handle == 0:
        error = process_api.last_error()
        if error == _WINDOWS_ERROR_ACCESS_DENIED:
            return True
        if error in {_WINDOWS_ERROR_INVALID_PARAMETER, _WINDOWS_ERROR_NOT_FOUND}:
            return False
        raise RuntimeExecutionError("Unable to query the Windows live-session owner.")
    try:
        exit_code = process_api.exit_code(handle)
        if exit_code is None:
            raise RuntimeExecutionError(
                "Unable to query the Windows live-session owner."
            )
        return exit_code == _WINDOWS_STILL_ACTIVE
    finally:
        if not process_api.close_handle(handle):
            raise RuntimeExecutionError(
                "Unable to close the Windows live-session handle."
            )


class _CtypesWindowsProcessApi:
    def __init__(self) -> None:
        import ctypes
        from ctypes import wintypes

        win_dll: Any = getattr(ctypes, "WinDLL", None)
        get_last_error: Any = getattr(ctypes, "get_last_error", None)
        if not callable(win_dll) or not callable(get_last_error):
            raise RuntimeExecutionError("Windows process APIs are unavailable.")
        self._ctypes = ctypes
        self._wintypes = wintypes
        self._get_last_error: Any = get_last_error
        kernel32: Any = win_dll("kernel32", use_last_error=True)
        self._open_process = kernel32.OpenProcess
        self._open_process.argtypes = (
            wintypes.DWORD,
            wintypes.BOOL,
            wintypes.DWORD,
        )
        self._open_process.restype = wintypes.HANDLE
        self._get_exit_code_process = kernel32.GetExitCodeProcess
        self._get_exit_code_process.argtypes = (
            wintypes.HANDLE,
            ctypes.POINTER(wintypes.DWORD),
        )
        self._get_exit_code_process.restype = wintypes.BOOL
        self._close_handle = kernel32.CloseHandle
        self._close_handle.argtypes = (wintypes.HANDLE,)
        self._close_handle.restype = wintypes.BOOL

    def open_query_handle(self, process_id: int) -> int:
        handle = self._open_process(
            _WINDOWS_PROCESS_QUERY_LIMITED_INFORMATION,
            False,
            process_id,
        )
        return int(handle or 0)

    def last_error(self) -> int:
        return int(self._get_last_error())

    def exit_code(self, handle: int) -> int | None:
        exit_code = self._wintypes.DWORD()
        if not self._get_exit_code_process(handle, self._ctypes.byref(exit_code)):
            return None
        return int(exit_code.value)

    def close_handle(self, handle: int) -> bool:
        return bool(self._close_handle(handle))


def _unlink_if_exists(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def _path_exists(path: Path) -> bool:
    try:
        return path.exists() or path.is_symlink()
    except OSError:
        return False


def _read_record_document(path: Path) -> object | None:
    try:
        if not path.exists() or not path.is_file() or path.is_symlink():
            return None
        raw: object = json.loads(path.read_text(encoding="utf-8"))
        return raw
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def _parse_record_document(raw: object) -> LiveSession | None:
    document = _record_mapping(raw)
    if document is None or set(document) != _SESSION_RECORD_KEYS:
        return None
    if document["formatVersion"] != SESSION_FORMAT:
        return None
    fields = _record_fields(document)
    if fields is None:
        return None
    app_id, project_path, url, owner_pid, nonce = fields
    return LiveSession(
        app_id=app_id,
        project_path=project_path,
        url=url,
        owner_pid=owner_pid,
        instance_nonce=nonce,
    )


def _record_mapping(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    document: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            return None
        document[key] = item
    return document


def _record_fields(
    document: dict[str, object],
) -> tuple[str, str, str, int, str] | None:
    app_id = document["appId"]
    project_path = document["projectPath"]
    url = document["url"]
    owner_pid = document["ownerPid"]
    nonce = document["instanceNonce"]
    if (
        not isinstance(app_id, str)
        or not isinstance(project_path, str)
        or not isinstance(url, str)
    ):
        return None
    if not isinstance(owner_pid, int) or owner_pid < 1:
        return None
    if not isinstance(nonce, str) or not nonce:
        return None
    return app_id, project_path, url, owner_pid, nonce


def _fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    try:
        descriptor = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    except OSError:
        return
    finally:
        os.close(descriptor)
