import setta.api.listener_connection as listener_connection_mod
from setta.api.listener import SettaListener
from setta.auth.cookies import auth_cookie_name
from setta.sessions.registry import SessionMetadata
from setta.types.id import ID


def test_resolve_auth_headers_treats_loopback_values_as_equivalent(
    monkeypatch,
) -> None:
    session_metadata = SessionMetadata(
        id="sess-1",
        workspacePath="/tmp/workspace",
        workspacePathCanonical="/tmp/workspace",
        host="127.0.0.1",
        port=8000,
        pid=123,
        secretPath="/tmp/secret",
        serverMode="ide",
    )
    monkeypatch.setattr(
        listener_connection_mod,
        "load_current_session_secret",
        lambda: (session_metadata, b"secret"),
    )
    monkeypatch.setattr(
        listener_connection_mod.AUTH_COOKIE_MANAGER,
        "mint",
        lambda _session_id, _secret: "cookie-value",
    )

    listener = SettaListener(project_config_id=ID("proj-1"), host="localhost", port=8000)

    assert listener._resolve_auth_headers() == {
        "Cookie": f"{auth_cookie_name(session_metadata.id)}=cookie-value"
    }


def test_resolve_auth_headers_rejects_non_loopback_host_mismatch(monkeypatch) -> None:
    session_metadata = SessionMetadata(
        id="sess-1",
        workspacePath="/tmp/workspace",
        workspacePathCanonical="/tmp/workspace",
        host="example.com",
        port=8000,
        pid=123,
        secretPath="/tmp/secret",
        serverMode="ide",
    )
    monkeypatch.setattr(
        listener_connection_mod,
        "load_current_session_secret",
        lambda: (session_metadata, b"secret"),
    )
    monkeypatch.setattr(
        listener_connection_mod.AUTH_COOKIE_MANAGER,
        "mint",
        lambda _session_id, _secret: "cookie-value",
    )

    listener = SettaListener(project_config_id=ID("proj-1"), host="127.0.0.1", port=8000)

    assert listener._resolve_auth_headers() is None


def test_resolve_auth_headers_uses_autoconnected_session_when_current_session_missing(
    monkeypatch,
) -> None:
    session_metadata = SessionMetadata(
        id="sess-2",
        workspacePath="/tmp/workspace",
        workspacePathCanonical="/tmp/workspace",
        host="127.0.0.1",
        port=8000,
        pid=123,
        secretPath="/tmp/secret",
        serverMode="ide",
    )
    monkeypatch.setattr(
        listener_connection_mod,
        "load_current_session_secret",
        lambda: None,
    )
    monkeypatch.setattr(
        listener_connection_mod.AUTH_COOKIE_MANAGER,
        "mint",
        lambda _session_id, _secret: "cookie-value",
    )

    listener = SettaListener(project_config_id=ID("proj-1"), host="localhost", port=8000)
    listener._auto_session_metadata = session_metadata
    listener._auto_session_secret = b"secret"

    assert listener._resolve_auth_headers() == {
        "Cookie": f"{auth_cookie_name(session_metadata.id)}=cookie-value"
    }
