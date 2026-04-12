import json
import logging
import os
import secrets
import shutil
import stat
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
from pydantic import BaseModel, Field, ValidationError, field_validator
from setta.types.generated.go_shared_constants import (
    DEFAULT_SESSION_SERVER_MODE,
    IN_PROCESS_ENV_VAR,
    SESSION_METADATA_FILENAME,
    SESSION_PROCESS_BASENAMES,
    SESSION_PROCESS_INVOCATION_ARGUMENTS,
    SESSION_PROCESS_INVOCATION_PREFIXES,
    SESSION_SECRET_FILENAME,
    SESSION_SERVER_MODE_VALUES,
)
from setta.utils.constants import C

logger = logging.getLogger(__name__)

_SETTA_PROCESS_BASENAMES = SESSION_PROCESS_BASENAMES
_SETTA_PROCESS_INVOCATION_ARGUMENTS = SESSION_PROCESS_INVOCATION_ARGUMENTS
_SETTA_PROCESS_INVOCATION_PREFIXES = SESSION_PROCESS_INVOCATION_PREFIXES
_ALLOWED_SESSION_SERVER_MODES = frozenset(SESSION_SERVER_MODE_VALUES)


def _require_session_server_mode(value: str) -> str:
    if value not in _ALLOWED_SESSION_SERVER_MODES:
        allowed = ", ".join(repr(mode) for mode in SESSION_SERVER_MODE_VALUES)
        raise ValueError(
            f"Invalid session server mode {value!r}. Expected one of: {allowed}."
        )
    return value


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


class SessionMetadata(BaseModel):
    id: str
    workspacePath: str
    workspacePathCanonical: str
    host: str
    port: int
    pid: int
    pidCreateTime: float | None = None
    startedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    secretPath: str
    settaFilesLocation: str | None = None
    settaFilesRoot: str | None = None
    runtimeRoot: str | None = None
    settaHome: str | None = None
    profile: str | None = None
    serverMode: str

    @field_validator("serverMode")
    @classmethod
    def validate_server_mode(cls, value: str) -> str:
        return _require_session_server_mode(value)


class SessionRegistry:
    def __init__(self, sessions_root: Path | None = None) -> None:
        self._sessions_root = sessions_root or C.RUNTIME_SESSIONS_FOLDER
        self._suspicious_session_ids: set[str] = set()

    def load_session(
        self,
        session_id: str,
        prune_stale: bool = True,
        track_suspicious: bool = True,
    ) -> SessionMetadata | None:
        session_dir = self._session_dir(session_id)
        metadata_path = session_dir / SESSION_METADATA_FILENAME
        if not metadata_path.exists():
            return None
        return self._load_active_metadata(
            metadata_path,
            prune_stale=prune_stale,
            track_suspicious=track_suspicious,
        )

    def create_session(
        self,
        workspace_path: Path | str,
        host: str,
        port: int,
        pid: int,
        pid_create_time: float | None = None,
        started_at: datetime | None = None,
        workspace_display_path: str | None = None,
        setta_files_location: str | None = None,
        setta_files_root: str | None = None,
        runtime_root: str | None = None,
        setta_home: str | None = None,
        profile: str | None = None,
        server_mode: str = DEFAULT_SESSION_SERVER_MODE,
    ) -> SessionMetadata:
        canonical_workspace = self._canonicalize_workspace_path(workspace_path)
        display_workspace = workspace_display_path or str(workspace_path)
        session_id = self._create_session_id()
        session_dir = self._session_dir(session_id)
        while session_dir.exists():
            session_id = self._create_session_id()
            session_dir = self._session_dir(session_id)

        session_dir.mkdir(parents=True, exist_ok=False)
        secret_path = session_dir / SESSION_SECRET_FILENAME
        secret_path.write_bytes(secrets.token_bytes(C.SESSION_SECRET_BYTES))
        if os.name != "nt":
            os.chmod(secret_path, stat.S_IRUSR | stat.S_IWUSR)

        resolved_pid_create_time = pid_create_time
        if resolved_pid_create_time is None:
            resolved_pid_create_time = resolve_pid_create_time(pid)
        metadata = SessionMetadata(
            id=session_id,
            workspacePath=display_workspace,
            workspacePathCanonical=str(canonical_workspace),
            host=host,
            port=port,
            pid=pid,
            pidCreateTime=resolved_pid_create_time,
            startedAt=started_at or datetime.now(timezone.utc),
            secretPath=str(secret_path),
            settaFilesLocation=setta_files_location,
            settaFilesRoot=setta_files_root,
            runtimeRoot=runtime_root,
            settaHome=setta_home,
            profile=profile,
            serverMode=server_mode,
        )
        self._write_metadata(metadata)
        return metadata

    def load_sessions(
        self, prune_stale: bool = True, track_suspicious: bool = False
    ) -> list[SessionMetadata]:
        self._suspicious_session_ids.clear()
        if not self._sessions_root.exists():
            return []
        return [
            metadata
            for metadata_path in self._iter_session_metadata_paths()
            if (
                metadata := self._load_active_metadata(
                    metadata_path,
                    prune_stale=prune_stale,
                    track_suspicious=track_suspicious,
                )
            )
            is not None
        ]

    def find_sessions_by_workspace(
        self,
        workspace_path: Path | str,
        prune_stale: bool = True,
        track_suspicious: bool = False,
    ) -> list[SessionMetadata]:
        canonical_workspace = self._canonicalize_workspace_path(workspace_path)
        sessions = self.load_sessions(
            prune_stale=prune_stale, track_suspicious=track_suspicious
        )
        return [
            session
            for session in sessions
            if Path(session.workspacePathCanonical).resolve() == canonical_workspace
        ]

    def find_sessions_by_workspace_and_mode(
        self,
        workspace_path: Path | str,
        server_mode: str,
        prune_stale: bool = True,
        track_suspicious: bool = False,
    ) -> list[SessionMetadata]:
        expected_server_mode = _require_session_server_mode(server_mode)
        return [
            session
            for session in self.find_sessions_by_workspace(
                workspace_path=workspace_path,
                prune_stale=prune_stale,
                track_suspicious=track_suspicious,
            )
            if session.serverMode == expected_server_mode
        ]

    def delete_session(self, session_id: str) -> None:
        session_dir = self._session_dir(session_id)
        if not session_dir.exists():
            return
        shutil.rmtree(session_dir)

    def suspicious_session_ids(self) -> set[str]:
        return set(self._suspicious_session_ids)

    def resolve_secret_path(self, metadata: SessionMetadata) -> Path:
        secret_path = Path(metadata.secretPath)
        if not secret_path.is_absolute():
            raise ValueError(
                f"Invalid session metadata for {metadata.id}: secretPath must be absolute."
            )
        return secret_path

    def load_secret(self, metadata: SessionMetadata) -> bytes:
        secret_path = self.resolve_secret_path(metadata)
        if not secret_path.exists():
            raise FileNotFoundError(f"Secret file missing for session {metadata.id}")
        return secret_path.read_bytes()

    def is_session_process_setta(self, metadata: SessionMetadata) -> bool:
        if metadata.pid <= 0:
            return False
        process = self._get_process(metadata.pid)
        if process is None:
            return False
        if not _process_create_time_matches_session(process, metadata.pidCreateTime):
            return False
        return self._is_setta_process(process) is True

    def _canonicalize_workspace_path(self, workspace_path: Path | str) -> Path:
        if isinstance(workspace_path, Path):
            raw = str(workspace_path)
        else:
            raw = workspace_path
        expanded = os.path.expandvars(os.path.expanduser(raw))
        return Path(expanded).resolve()

    def _create_session_id(self) -> str:
        return secrets.token_hex(3)

    def _session_dir(self, session_id: str) -> Path:
        return self._sessions_root / session_id

    def _iter_session_metadata_paths(self) -> list[Path]:
        return [
            session_dir / SESSION_METADATA_FILENAME
            for session_dir in sorted(self._sessions_root.iterdir())
            if session_dir.is_dir()
            and (session_dir / SESSION_METADATA_FILENAME).exists()
        ]

    def _load_active_metadata(
        self,
        metadata_path: Path,
        *,
        prune_stale: bool,
        track_suspicious: bool,
    ) -> SessionMetadata | None:
        metadata = self._read_metadata_path(metadata_path, prune_invalid=prune_stale)
        if metadata is None:
            return None
        if prune_stale and self._is_session_stale(metadata):
            self.delete_session(metadata.id)
            return None
        if track_suspicious and self._is_session_suspicious(metadata):
            self._suspicious_session_ids.add(metadata.id)
        return metadata

    def _write_metadata(self, metadata: SessionMetadata) -> None:
        path = self._session_dir(metadata.id) / SESSION_METADATA_FILENAME
        payload = metadata.model_dump(mode="json")

        # Write atomically so readers never see a truncated/partial JSON payload.
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        tmp_path.replace(path)

    def _is_recently_modified(self, path: Path, *, seconds: float) -> bool:
        try:
            mtime = path.stat().st_mtime
        except OSError:
            return False
        return (time.time() - mtime) <= seconds

    def _prune_invalid_session_dir(self, path: Path, *, reason: str) -> None:
        session_dir = path.parent
        quarantine_root = self._sessions_root / "invalid"
        quarantine_dir = quarantine_root / f"{session_dir.name}-{time.time_ns()}"
        try:
            quarantine_root.mkdir(parents=True, exist_ok=True)
            session_dir.replace(quarantine_dir)
        except OSError:
            logger.warning(
                "Failed to quarantine invalid session directory %s (%s).",
                session_dir,
                reason,
                exc_info=True,
            )
            return
        logger.warning(
            "Quarantined invalid session directory %s to %s (%s).",
            session_dir,
            quarantine_dir,
            reason,
        )

    def _read_metadata_path(
        self, path: Path, *, prune_invalid: bool
    ) -> SessionMetadata | None:
        raw_text = self._read_metadata_text(path)
        if raw_text is None:
            return None
        raw = self._parse_metadata_text(
            path,
            raw_text,
            prune_invalid=prune_invalid,
        )
        if raw is None:
            return None
        metadata = self._validate_metadata(
            path,
            raw,
            prune_invalid=prune_invalid,
        )
        if metadata is None:
            return None
        if self._has_absolute_secret_path(metadata):
            return metadata
        self._handle_invalid_secret_path(path, metadata, prune_invalid=prune_invalid)
        return None

    def _read_metadata_text(self, path: Path) -> str | None:
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            self._log_metadata_read_failure(path)
            return None

    def _parse_metadata_text(
        self, path: Path, raw_text: str, *, prune_invalid: bool
    ) -> dict | None:
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            self._handle_invalid_metadata_json(path, prune_invalid=prune_invalid)
            return None

    def _validate_metadata(
        self, path: Path, raw: dict, *, prune_invalid: bool
    ) -> SessionMetadata | None:
        try:
            return SessionMetadata.model_validate(raw)
        except ValidationError:
            self._handle_invalid_metadata_schema(path, prune_invalid=prune_invalid)
            return None

    def _is_transient_metadata_path(self, path: Path) -> bool:
        return self._is_recently_modified(path, seconds=2.0)

    def _log_metadata_read_failure(self, path: Path) -> None:
        if self._is_transient_metadata_path(path):
            logger.debug(
                "Failed to read session metadata at %s (transient).",
                path,
                exc_info=True,
            )
            return
        logger.warning(
            "Failed to read session metadata at %s; skipping.",
            path,
            exc_info=True,
        )

    def _handle_invalid_metadata_json(self, path: Path, *, prune_invalid: bool) -> None:
        if self._is_transient_metadata_path(path):
            logger.debug(
                "Failed to parse session metadata JSON at %s (transient).",
                path,
                exc_info=True,
            )
            return
        if prune_invalid:
            self._prune_invalid_session_dir(path, reason="invalid session.json")
            return
        logger.warning(
            "Failed to parse session metadata JSON at %s; skipping.",
            path,
            exc_info=True,
        )

    def _handle_invalid_metadata_schema(
        self, path: Path, *, prune_invalid: bool
    ) -> None:
        if prune_invalid and not self._is_transient_metadata_path(path):
            self._prune_invalid_session_dir(path, reason="invalid metadata schema")
            return
        logger.warning(
            "Invalid session metadata at %s; skipping.",
            path,
            exc_info=True,
        )

    def _has_absolute_secret_path(self, metadata: SessionMetadata) -> bool:
        return Path(metadata.secretPath).is_absolute()

    def _handle_invalid_secret_path(
        self, path: Path, metadata: SessionMetadata, *, prune_invalid: bool
    ) -> None:
        if prune_invalid and not self._is_transient_metadata_path(path):
            self._prune_invalid_session_dir(path, reason="secretPath must be absolute")
            return
        logger.warning(
            "Invalid session metadata for %s at %s (secretPath must be absolute); skipping.",
            metadata.id,
            path,
        )

    def _is_session_stale(self, metadata: SessionMetadata) -> bool:
        if metadata.pid <= 0:
            return True
        process = self._get_process(metadata.pid)
        if process is None:
            return True
        if not _process_create_time_matches_session(process, metadata.pidCreateTime):
            return True
        is_setta = self._is_setta_process(process)
        if is_setta is False:
            if metadata.pid == os.getpid() and self._is_in_process_backend():
                return False
            return True
        return False

    def _is_in_process_backend(self) -> bool:
        raw = os.environ.get(IN_PROCESS_ENV_VAR)
        if not raw:
            return False
        return raw.strip().lower() not in {"0", "false", "no"}

    def _is_session_suspicious(self, metadata: SessionMetadata) -> bool:
        if metadata.pid <= 0:
            return False
        process = self._get_process(metadata.pid)
        if process is None:
            return False
        if not _process_create_time_matches_session(process, metadata.pidCreateTime):
            return False
        is_setta = self._is_setta_process(process)
        if is_setta is False:
            return False
        if is_setta is None:
            return False
        return not self._is_port_listening(process, metadata.host, metadata.port)

    def _get_process(self, pid: int) -> psutil.Process | None:
        try:
            return psutil.Process(pid)
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return None

    def _is_setta_process(self, process: psutil.Process) -> bool | None:
        cmdline = self._load_process_cmdline(process)
        if cmdline is None:
            return None
        if not cmdline:
            return False
        return _cmdline_matches_setta_process(cmdline)

    def _load_process_cmdline(self, process: psutil.Process) -> list[str] | None:
        try:
            return process.cmdline()
        except psutil.AccessDenied:
            return None
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return []

    def _is_port_listening(self, process: psutil.Process, host: str, port: int) -> bool:
        connections, fallback = self._load_process_listen_probe_connections(process)
        if fallback is not None:
            return fallback
        return any(
            self._connection_matches_listen_target(conn, host, port)
            for conn in connections
        )

    def _load_process_listen_probe_connections(
        self, process: psutil.Process
    ) -> tuple[list, bool | None]:
        try:
            return process.net_connections(kind="inet"), None
        except psutil.AccessDenied:
            return [], True
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return [], False

    def _connection_matches_listen_target(self, conn, host: str, port: int) -> bool:
        return (
            conn.status == psutil.CONN_LISTEN
            and conn.laddr.port == port
            and self._host_matches_listen(host, conn.laddr.ip)
        )

    def _host_matches_listen(self, host: str, listen_host: str) -> bool:
        if listen_host in {"0.0.0.0", "::"}:
            return True
        return host == listen_host


def _cmdline_matches_setta_process(cmdline: list[str]) -> bool:
    # Python session lookup needs a local psutil path before any Go runtime is
    # available. Go owns the Setta process recognition tables via generated
    # constants; Python only mirrors the minimal cmdline walk needed to apply
    # those Go-owned rules to local process metadata.
    if not cmdline:
        return False
    if _process_basename_matches_setta(cmdline[0]):
        return True
    return any(
        _process_basename_matches_setta(item)
        or _process_invocation_argument_matches_setta(item)
        for item in cmdline[1:]
    )


def _process_create_time_matches_session(
    process: psutil.Process,
    expected_create_time: float | None,
) -> bool:
    if expected_create_time is None:
        return True
    try:
        return process.create_time() == expected_create_time
    except psutil.Error:
        return False


def _process_basename_matches_setta(value: str) -> bool:
    return os.path.basename(value).lower() in _SETTA_PROCESS_BASENAMES


def _process_invocation_argument_matches_setta(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in _SETTA_PROCESS_INVOCATION_ARGUMENTS:
        return True
    return any(
        lowered.startswith(prefix) for prefix in _SETTA_PROCESS_INVOCATION_PREFIXES
    )
