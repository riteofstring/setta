import os

from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR

_cached_metadata: SessionMetadata | None = None
_cached_secret: bytes | None = None


def _get_cached_session(
    session_id: str | None, pid: int
) -> tuple[SessionMetadata, bytes] | None:
    if _cached_metadata is None or _cached_secret is None:
        return None
    if session_id:
        if _cached_metadata.id != session_id:
            return None
    else:
        if _cached_metadata.pid != pid:
            return None
    return _cached_metadata, _cached_secret


def _update_cached_session(metadata: SessionMetadata, secret: bytes) -> None:
    global _cached_metadata
    global _cached_secret
    _cached_metadata = metadata
    _cached_secret = secret


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
    if registry is None:
        cached = _get_cached_session(session_id, os.getpid())
        if cached is not None:
            return cached
    if session_id:
        metadata = active_registry.load_session(
            session_id, prune_stale=False, track_suspicious=False
        )
    if metadata is None:
        metadata = find_session_for_pid(os.getpid(), active_registry)
    if metadata is None:
        return None
    secret_path = active_registry.resolve_secret_path(metadata)
    if not secret_path.exists():
        return None
    secret = secret_path.read_bytes()
    if registry is None:
        _update_cached_session(metadata, secret)
    return metadata, secret
