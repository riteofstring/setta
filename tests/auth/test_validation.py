import secrets

from setta.auth.manager import AUTH_COOKIE_MANAGER, BOOTSTRAP_TOKEN_MANAGER
from setta.auth.validation import consume_bootstrap_token, validate_auth_cookie


def test_validate_auth_cookie_accepts_matching_session() -> None:
    secret = secrets.token_bytes(32)
    session_id = "session-accept"
    token = AUTH_COOKIE_MANAGER.mint(session_id, secret)

    payload = validate_auth_cookie(token, session_id, secret)

    assert payload is not None
    assert payload.sessionId == session_id


def test_validate_auth_cookie_rejects_session_mismatch() -> None:
    secret = secrets.token_bytes(32)
    token = AUTH_COOKIE_MANAGER.mint("session-a", secret)

    payload = validate_auth_cookie(token, "session-b", secret)

    assert payload is None


def test_validate_auth_cookie_rejects_invalid_token() -> None:
    secret = secrets.token_bytes(32)

    payload = validate_auth_cookie("invalid-token", "session-a", secret)

    assert payload is None


def test_validate_auth_cookie_rejects_invalid_encoding() -> None:
    secret = secrets.token_bytes(32)

    payload = validate_auth_cookie("a.a", "session-a", secret)

    assert payload is None


def test_consume_bootstrap_token_accepts_matching_session() -> None:
    secret = secrets.token_bytes(32)
    session_id = "bootstrap-accept"
    token = BOOTSTRAP_TOKEN_MANAGER.mint(session_id, secret)

    payload = consume_bootstrap_token(token, session_id, secret)

    assert payload is not None
    assert payload.sessionId == session_id


def test_consume_bootstrap_token_rejects_session_mismatch() -> None:
    secret = secrets.token_bytes(32)
    token = BOOTSTRAP_TOKEN_MANAGER.mint("session-a", secret)

    payload = consume_bootstrap_token(token, "session-b", secret)

    assert payload is None


def test_consume_bootstrap_token_rejects_invalid_token() -> None:
    secret = secrets.token_bytes(32)

    payload = consume_bootstrap_token("invalid-token", "session-a", secret)

    assert payload is None


def test_consume_bootstrap_token_rejects_invalid_encoding() -> None:
    secret = secrets.token_bytes(32)

    payload = consume_bootstrap_token("a.a", "session-a", secret)

    assert payload is None
