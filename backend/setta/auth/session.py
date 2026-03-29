import os
from pathlib import Path

from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR

_cached_metadata: SessionMetadata | None = None
_cached_secret: bytes | None = None
_cached_sessions_root: str | None = None


def _get_cached_session(
    session_id: str, sessions_root: Path | None
) -> tuple[SessionMetadata, bytes] | None:
    if _cached_metadata is None or _cached_secret is None:
        return None
    if sessions_root is not None:
        if _cached_sessions_root != str(sessions_root):
            return None
    elif _cached_sessions_root is not None:
        return None
    if _cached_metadata.id != session_id:
        return None
    return _cached_metadata, _cached_secret


def _update_cached_session(
    metadata: SessionMetadata, secret: bytes, sessions_root: Path | None
) -> None:
    global _cached_metadata
    global _cached_secret
    global _cached_sessions_root
    _cached_metadata = metadata
    _cached_secret = secret
    _cached_sessions_root = str(sessions_root) if sessions_root is not None else None


def _clear_cached_session() -> None:
    global _cached_metadata
    global _cached_secret
    global _cached_sessions_root
    _cached_metadata = None
    _cached_secret = None
    _cached_sessions_root = None


def _resolve_sessions_root_from_env() -> Path | None:
    sessions_root = os.environ.get(SESSIONS_ROOT_ENV_VAR)
    if not sessions_root:
        return None
    expanded = os.path.expandvars(os.path.expanduser(sessions_root))
    return Path(expanded).resolve()


def load_current_session_secret(
    registry: SessionRegistry | None = None,
) -> tuple[SessionMetadata, bytes] | None:
    session_id = os.environ.get(SESSION_ID_ENV_VAR)
    if not session_id:
        return None
    sessions_root = None
    if registry is None:
        sessions_root = _resolve_sessions_root_from_env()
        if sessions_root is not None:
            active_registry = SessionRegistry(sessions_root=sessions_root)
        else:
            active_registry = SessionRegistry()
    else:
        active_registry = registry
    if registry is None:
        cached = _get_cached_session(session_id, sessions_root)
        if cached is not None:
            cached_metadata, cached_secret = cached
            secret_path = active_registry.resolve_secret_path(cached_metadata)
            if secret_path.exists():
                return cached
            _clear_cached_session()
    metadata = active_registry.load_session(
        session_id, prune_stale=False, track_suspicious=False
    )
    if metadata is None:
        return None
    secret_path = active_registry.resolve_secret_path(metadata)
    if not secret_path.exists():
        return None
    secret = secret_path.read_bytes()
    if registry is None:
        _update_cached_session(metadata, secret, sessions_root)
    return metadata, secret
