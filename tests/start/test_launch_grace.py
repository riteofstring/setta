import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from setta.launch import (
    DEFAULT_EXISTING_SESSION_EXTENDED_GRACE_SECONDS,
    DEFAULT_EXISTING_SESSION_GRACE_SECONDS,
    DEFAULT_EXISTING_SESSION_RECENT_SECONDS,
    _existing_session_grace_seconds,
)
from setta.sessions.registry import SessionMetadata


def _build_session(*, secret_path: Path, started_at: datetime) -> SessionMetadata:
    secret_path.write_bytes(b"secret")
    return SessionMetadata(
        id="session-1",
        workspacePath=str(secret_path.parent),
        workspacePathCanonical=str(secret_path.parent),
        host="127.0.0.1",
        port=8000,
        pid=os.getpid(),
        startedAt=started_at,
        secretPath=str(secret_path),
    )


def test_existing_session_grace_extends_for_recent_sessions(tmp_path: Path) -> None:
    session = _build_session(
        secret_path=tmp_path / "secret",
        started_at=datetime.now(timezone.utc),
    )
    assert (
        _existing_session_grace_seconds(session, timeout_seconds=30.0)
        == DEFAULT_EXISTING_SESSION_EXTENDED_GRACE_SECONDS
    )


def test_existing_session_grace_uses_base_for_older_sessions(tmp_path: Path) -> None:
    session = _build_session(
        secret_path=tmp_path / "secret",
        started_at=datetime.now(timezone.utc)
        - timedelta(seconds=DEFAULT_EXISTING_SESSION_RECENT_SECONDS + 1),
    )
    assert (
        _existing_session_grace_seconds(session, timeout_seconds=30.0)
        == DEFAULT_EXISTING_SESSION_GRACE_SECONDS
    )
