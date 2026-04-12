from setta.auth.manager import AUTH_COOKIE_MANAGER, BOOTSTRAP_TOKEN_MANAGER
from setta.auth.tokens import AuthCookiePayload, BootstrapTokenPayload


def validate_auth_cookie(
    token: str, session_id: str, secret: bytes
) -> AuthCookiePayload | None:
    try:
        payload = AUTH_COOKIE_MANAGER.validate(token, secret)
    except ValueError:
        return None
    if payload.sessionId != session_id:
        return None
    return payload


def consume_bootstrap_token(
    token: str, session_id: str, secret: bytes
) -> BootstrapTokenPayload | None:
    try:
        payload = BOOTSTRAP_TOKEN_MANAGER.consume(token, secret)
    except ValueError:
        return None
    if payload.sessionId != session_id:
        return None
    return payload
