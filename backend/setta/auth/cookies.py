from setta.utils.constants import C


def auth_cookie_name(session_id: str) -> str:
    trimmed = session_id.strip()
    if not trimmed:
        raise ValueError("session_id must be a non-empty string")
    return f"{C.AUTH_COOKIE_NAME}_{trimmed}"
