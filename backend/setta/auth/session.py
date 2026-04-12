import os
from pathlib import Path

from setta.sessions.registry import SessionMetadata, SessionRegistry
from setta.types.generated.go_shared_constants import (
    SESSION_ID_ENV_VAR,
    SESSIONS_ROOT_ENV_VAR,
)

_cached_metadata: SessionMetadata | None = None
_cached_secret: bytes | None = None
_cached_sessions_root: str | None = None


def _sessions_root_cache_key(sessions_root: Path | None) -> str | None:
    return None if sessions_root is None else str(sessions_root)


def _get_cached_session(
    session_id: str, sessions_root: Path | None
) -> tuple[SessionMetadata, bytes] | None:
    metadata = _cached_metadata
    secret = _cached_secret
    if metadata is None or secret is None:
        return None
    if (metadata.id, _cached_sessions_root) != (
        session_id,
        _sessions_root_cache_key(sessions_root),
    ):
        return None
    return metadata, secret


def _update_cached_session(
    metadata: SessionMetadata, secret: bytes, sessions_root: Path | None
) -> None:
    global _cached_metadata
    global _cached_secret
    global _cached_sessions_root
    _cached_metadata = metadata
    _cached_secret = secret
    _cached_sessions_root = _sessions_root_cache_key(sessions_root)


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


def _resolve_active_registry(
    registry: SessionRegistry | None,
) -> tuple[SessionRegistry, Path | None, bool]:
    if registry is not None:
        return registry, None, False
    sessions_root = _resolve_sessions_root_from_env()
    if sessions_root is None:
        return SessionRegistry(), None, True
    return SessionRegistry(sessions_root=sessions_root), sessions_root, True


def _load_cached_session_secret(
    active_registry: SessionRegistry,
    session_id: str,
    sessions_root: Path | None,
) -> tuple[SessionMetadata, bytes] | None:
    cached = _get_cached_session(session_id, sessions_root)
    if cached is None:
        return None
    cached_metadata, _ = cached
    secret_path = active_registry.resolve_secret_path(cached_metadata)
    if secret_path.exists():
        return cached
    _clear_cached_session()
    return None


def _load_session_secret(
    active_registry: SessionRegistry, session_id: str
) -> tuple[SessionMetadata, bytes] | None:
    metadata = active_registry.load_session(
        session_id, prune_stale=False, track_suspicious=False
    )
    if metadata is None:
        return None
    secret_path = active_registry.resolve_secret_path(metadata)
    if not secret_path.exists():
        return None
    return metadata, secret_path.read_bytes()


def _load_session_secret_with_optional_cache(
    active_registry: SessionRegistry,
    session_id: str,
    sessions_root: Path | None,
    allow_cache: bool,
) -> tuple[SessionMetadata, bytes] | None:
    if allow_cache:
        cached = _load_cached_session_secret(active_registry, session_id, sessions_root)
        if cached is not None:
            return cached
    loaded = _load_session_secret(active_registry, session_id)
    if loaded is None or not allow_cache:
        return loaded
    metadata, secret = loaded
    _update_cached_session(metadata, secret, sessions_root)
    return loaded


def load_current_session_secret(
    registry: SessionRegistry | None = None,
) -> tuple[SessionMetadata, bytes] | None:
    session_id = os.environ.get(SESSION_ID_ENV_VAR)
    if not session_id:
        return None
    active_registry, sessions_root, allow_cache = _resolve_active_registry(registry)
    return _load_session_secret_with_optional_cache(
        active_registry,
        session_id,
        sessions_root,
        allow_cache,
    )
