from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

from .errors import InvalidInputError

_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


def validate_loopback_http_url(value: str) -> str:

    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise InvalidInputError("The service URL is invalid.") from error
    host = (parsed.hostname or "").lower()
    if (
        parsed.scheme != "http"
        or host not in _LOOPBACK_HOSTS
        or port is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise InvalidInputError(
            "The service URL must be an absolute loopback HTTP URL with a port."
        )
    authority_host = f"[{host}]" if host == "::1" else host
    return urlunsplit(("http", f"{authority_host}:{port}", "", "", ""))
