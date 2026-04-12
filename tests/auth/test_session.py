import os
from pathlib import Path

import pytest

from setta.auth import session as auth_session
from setta.auth.session import load_current_session_secret
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.utils.constants import C


def _clear_session_cache() -> None:
    auth_session._cached_metadata = None
    auth_session._cached_secret = None
    auth_session._cached_sessions_root = None


@pytest.fixture(autouse=True)
def session_cache() -> None:
    _clear_session_cache()
    yield
    _clear_session_cache()


def test_load_current_session_secret_returns_metadata(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    created = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    monkeypatch.setenv(SESSION_ID_ENV_VAR, created.id)

    result = load_current_session_secret(registry)

    assert result is not None
    metadata, secret = result
    assert metadata.id == created.id
    assert len(secret) == C.SESSION_SECRET_BYTES


def test_load_current_session_secret_prefers_env_session(
    tmp_path, monkeypatch
) -> None:
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    first = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    second = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61235,
        pid=os.getpid(),
    )
    first_id = min(first.id, second.id)
    target = second if second.id != first_id else first
    monkeypatch.setenv(SESSION_ID_ENV_VAR, target.id)

    result = load_current_session_secret(registry)

    assert result is not None
    metadata, secret = result
    assert metadata.id == target.id
    assert len(secret) == C.SESSION_SECRET_BYTES


def test_load_current_session_secret_uses_sessions_root_env(
    tmp_path, monkeypatch
) -> None:
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    created = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    monkeypatch.setenv(SESSION_ID_ENV_VAR, created.id)
    monkeypatch.setenv(SESSIONS_ROOT_ENV_VAR, str(sessions_root))

    other_dir = tmp_path / "other"
    other_dir.mkdir()
    monkeypatch.chdir(other_dir)

    _clear_session_cache()

    result = load_current_session_secret()

    assert result is not None
    metadata, secret = result
    assert metadata.id == created.id
    assert len(secret) == C.SESSION_SECRET_BYTES


def test_load_current_session_secret_returns_none_without_session_id(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )

    result = load_current_session_secret(registry)

    assert result is None


def test_load_current_session_secret_returns_none_when_secret_missing(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.delenv(SESSION_ID_ENV_VAR, raising=False)
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    created = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    monkeypatch.setenv(SESSION_ID_ENV_VAR, created.id)
    secret_path = Path(created.secretPath)
    secret_path.unlink()

    result = load_current_session_secret(registry)

    assert result is None


def test_load_current_session_secret_clears_cache_when_secret_deleted(
    tmp_path, monkeypatch
) -> None:
    sessions_root = tmp_path / "sessions"
    registry = SessionRegistry(sessions_root=sessions_root)
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    created = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    monkeypatch.setenv(SESSION_ID_ENV_VAR, created.id)
    monkeypatch.setenv(SESSIONS_ROOT_ENV_VAR, str(sessions_root))

    _clear_session_cache()

    result = load_current_session_secret()
    assert result is not None

    secret_path = registry.resolve_secret_path(created)
    secret_path.unlink()

    result = load_current_session_secret()
    assert result is None
