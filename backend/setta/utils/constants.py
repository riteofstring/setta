import logging
import os
from pathlib import Path

from setta.utils.paths import get_setta_paths

logger = logging.getLogger(__name__)

_HTTP_TOKEN_SEPARATORS = set("()<>@,;:/[]?={} \t")
_HTTP_TOKEN_SEPARATORS.update({"\\", '"'})


def normalize_cookie_name(raw: str | None, *, default: str = "setta_auth") -> str:
    if raw is None:
        return default
    trimmed = raw.strip()
    if not trimmed:
        return default

    def is_token_char(ch: str) -> bool:
        codepoint = ord(ch)
        if codepoint < 0x21 or codepoint > 0x7E:
            return False
        return ch not in _HTTP_TOKEN_SEPARATORS

    sanitized = "".join(ch if is_token_char(ch) else "_" for ch in trimmed)
    return sanitized or default


class classproperty:
    """Descriptor for creating class-level properties"""

    def __init__(self, func):
        self.func = func

    def __get__(self, instance, owner):
        return self.func(owner)


class C:
    # Basic configuration
    DEFAULT_HOST = "127.0.0.1"
    DEFAULT_PORT = 8000

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT

    @classproperty
    def RUNTIME_SESSIONS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_sessions_root

    _raw_auth_cookie_name = os.environ.get("SETTA_AUTH_COOKIE_NAME")
    AUTH_COOKIE_NAME = normalize_cookie_name(
        _raw_auth_cookie_name, default="setta_auth"
    )
    if _raw_auth_cookie_name is not None:
        _trimmed_auth_cookie_name = _raw_auth_cookie_name.strip()
        if _trimmed_auth_cookie_name and _trimmed_auth_cookie_name != AUTH_COOKIE_NAME:
            logger.warning(
                "Sanitized SETTA_AUTH_COOKIE_NAME=%r to %r",
                _trimmed_auth_cookie_name,
                AUTH_COOKIE_NAME,
            )
    AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12
    BOOTSTRAP_TOKEN_TTL_SECONDS = 60 * 10
    LAUNCH_INTENT_TOKEN_TTL_SECONDS = 60 * 5
    SESSION_SECRET_BYTES = 32

    @classproperty
    def BACKEND(cls):
        return f"http://{cls.HOST}:{cls.PORT}"
