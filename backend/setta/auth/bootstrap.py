from urllib.parse import urlparse

from setta.utils.constants import C


def origin_from_backend_url(backend_url: str) -> str:
    parsed = urlparse(backend_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid backend URL: {backend_url}")
    return f"{parsed.scheme}://{parsed.netloc}"


def select_auth_cookie_name(cookie_names: list[str]) -> str | None:
    # Bootstrap consume should always return a session-scoped cookie.
    prefix = f"{C.AUTH_COOKIE_NAME}_"
    for name in cookie_names:
        if name.startswith(prefix):
            return name
    return None
