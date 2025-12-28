import os
from pathlib import Path

from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR


def find_session_for_pid(
    pid: int, registry: SessionRegistry | None = None
) -> SessionMetadata | None:
    active_registry = registry or SessionRegistry()
    sessions = active_registry.load_sessions(prune_stale=False)
    for session in sessions:
        if session.pid == pid:
            return session
    return None


def load_current_session_secret(
    registry: SessionRegistry | None = None,
) -> tuple[SessionMetadata, bytes] | None:
    active_registry = registry or SessionRegistry()
    metadata: SessionMetadata | None = None
    session_id = os.environ.get(SESSION_ID_ENV_VAR)
    if session_id:
        metadata = active_registry.load_session(
            session_id, prune_stale=False, track_suspicious=False
        )
    if metadata is None:
        metadata = find_session_for_pid(os.getpid(), active_registry)
    if metadata is None:
        return None
    secret_path = Path(metadata.secretPath)
    if not secret_path.exists():
        return None
    secret = secret_path.read_bytes()
    return metadata, secret
