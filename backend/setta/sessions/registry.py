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
from pydantic import BaseModel, Field, ValidationError

from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.utils.constants import C

SESSION_METADATA_FILENAME = "session.json"
SESSION_SECRET_FILENAME = "secret"

logger = logging.getLogger(__name__)


class SessionMetadata(BaseModel):
    id: str
    workspacePath: str
    workspacePathCanonical: str
    host: str
    port: int
    pid: int
    startedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    secretPath: str


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
        metadata = self._read_metadata_path(metadata_path, prune_invalid=prune_stale)
        if metadata is None:
            return None
        if prune_stale and self._is_session_stale(metadata):
            self.delete_session(metadata.id)
            return None
        if track_suspicious and self._is_session_suspicious(metadata):
            self._suspicious_session_ids.add(metadata.id)
        return metadata

    def create_session(
        self,
        workspace_path: Path | str,
        host: str,
        port: int,
        pid: int,
        started_at: datetime | None = None,
        workspace_display_path: str | None = None,
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

        metadata = SessionMetadata(
            id=session_id,
            workspacePath=display_workspace,
            workspacePathCanonical=str(canonical_workspace),
            host=host,
            port=port,
            pid=pid,
            startedAt=started_at or datetime.now(timezone.utc),
            secretPath=str(secret_path),
        )
        self._write_metadata(metadata)
        return metadata

    def load_sessions(
        self, prune_stale: bool = True, track_suspicious: bool = False
    ) -> list[SessionMetadata]:
        self._suspicious_session_ids.clear()
        sessions: list[SessionMetadata] = []
        if not self._sessions_root.exists():
            return sessions
        for session_dir in sorted(self._sessions_root.iterdir()):
            if not session_dir.is_dir():
                continue
            metadata_path = session_dir / SESSION_METADATA_FILENAME
            if not metadata_path.exists():
                continue
            metadata = self._read_metadata_path(
                metadata_path, prune_invalid=prune_stale
            )
            if metadata is None:
                continue
            if prune_stale and self._is_session_stale(metadata):
                self.delete_session(metadata.id)
                continue
            if track_suspicious and self._is_session_suspicious(metadata):
                self._suspicious_session_ids.add(metadata.id)
            sessions.append(metadata)
        return sessions

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
        try:
            shutil.rmtree(session_dir)
        except OSError:
            logger.warning(
                "Failed to delete invalid session directory %s (%s).",
                session_dir,
                reason,
                exc_info=True,
            )
            return
        logger.warning(
            "Deleted invalid session directory %s (%s).", session_dir, reason
        )

    def _read_metadata_path(
        self, path: Path, *, prune_invalid: bool
    ) -> SessionMetadata | None:
        raw_text: str
        try:
            raw_text = path.read_text(encoding="utf-8")
        except OSError:
            if self._is_recently_modified(path, seconds=2.0):
                logger.debug(
                    "Failed to read session metadata at %s (transient).",
                    path,
                    exc_info=True,
                )
            else:
                logger.warning(
                    "Failed to read session metadata at %s; skipping.",
                    path,
                    exc_info=True,
                )
            return None

        raw: dict
        try:
            raw = json.loads(raw_text)
        except json.JSONDecodeError:
            if self._is_recently_modified(path, seconds=2.0):
                logger.debug(
                    "Failed to parse session metadata JSON at %s (transient).",
                    path,
                    exc_info=True,
                )
            else:
                if prune_invalid:
                    self._prune_invalid_session_dir(path, reason="invalid session.json")
                else:
                    logger.warning(
                        "Failed to parse session metadata JSON at %s; skipping.",
                        path,
                        exc_info=True,
                    )
            return None
        try:
            metadata = SessionMetadata.model_validate(raw)
        except ValidationError:
            if prune_invalid and not self._is_recently_modified(path, seconds=2.0):
                self._prune_invalid_session_dir(path, reason="invalid metadata schema")
            else:
                logger.warning(
                    "Invalid session metadata at %s; skipping.",
                    path,
                    exc_info=True,
                )
            return None
        secret_path = Path(metadata.secretPath)
        if not secret_path.is_absolute():
            if prune_invalid and not self._is_recently_modified(path, seconds=2.0):
                self._prune_invalid_session_dir(
                    path, reason="secretPath must be absolute"
                )
            else:
                logger.warning(
                    "Invalid session metadata for %s at %s (secretPath must be absolute); skipping.",
                    metadata.id,
                    path,
                )
            return None
        return metadata

    def _is_session_stale(self, metadata: SessionMetadata) -> bool:
        if metadata.pid <= 0:
            return True
        process = self._get_process(metadata.pid)
        if process is None:
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
        try:
            cmdline = process.cmdline()
        except psutil.AccessDenied:
            return None
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return False
        if not cmdline:
            return False
        script_basenames = {"setta", "setta.exe", "setta-script.py"}
        first = cmdline[0].lower()
        if os.path.basename(first) in script_basenames:
            return True
        for item in cmdline[1:]:
            if os.path.basename(item).lower() in script_basenames:
                return True
        lowered = [item.lower() for item in cmdline]
        for idx, item in enumerate(lowered):
            if item == "-m" and idx + 1 < len(lowered) and lowered[idx + 1] == "setta":
                return True
            if item.startswith("setta.") or item.startswith("setta:"):
                return True
        return False

    def _is_port_listening(self, process: psutil.Process, host: str, port: int) -> bool:
        try:
            connections = process.net_connections(kind="inet")
        except psutil.AccessDenied:
            return True
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return False
        for conn in connections:
            if conn.status != psutil.CONN_LISTEN:
                continue
            if conn.laddr.port != port:
                continue
            if not self._host_matches_listen(host, conn.laddr.ip):
                continue
            return True
        return False

    def _host_matches_listen(self, host: str, listen_host: str) -> bool:
        if listen_host in {"0.0.0.0", "::"}:
            return True
        return host == listen_host
