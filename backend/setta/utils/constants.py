import logging
import os
from pathlib import Path

from setta.types.generated import go_shared_constants
from setta.utils.paths import get_setta_paths

logger = logging.getLogger(__name__)

_warned_auth_cookie_name_values: set[tuple[str, str]] = set()


def _resolved_auth_cookie_name() -> str:
    resolved = (
        get_setta_paths().auth_cookie_name
        or go_shared_constants.DEFAULT_AUTH_COOKIE_NAME
    )
    raw_auth_cookie_name = os.environ.get("SETTA_AUTH_COOKIE_NAME")
    if raw_auth_cookie_name is None:
        return resolved
    trimmed_auth_cookie_name = raw_auth_cookie_name.strip()
    if not trimmed_auth_cookie_name or trimmed_auth_cookie_name == resolved:
        return resolved

    warning_key = (trimmed_auth_cookie_name, resolved)
    if warning_key not in _warned_auth_cookie_name_values:
        logger.warning(
            "Sanitized SETTA_AUTH_COOKIE_NAME=%r to %r",
            trimmed_auth_cookie_name,
            resolved,
        )
        _warned_auth_cookie_name_values.add(warning_key)
    return resolved


class classproperty:
    """Descriptor for creating class-level properties"""

    def __init__(self, func):
        self.func = func

    def __get__(self, instance, owner):
        return self.func(owner)


class C:
    # Basic configuration
    DEFAULT_HOST = go_shared_constants.DEFAULT_HOST
    DEFAULT_PORT = go_shared_constants.DEFAULT_PORT

    # Set HOST and PORT from defaults (can be overridden)
    HOST: str = DEFAULT_HOST
    PORT: int = DEFAULT_PORT

    @classproperty
    def RUNTIME_SESSIONS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_sessions_root

    @classproperty
    def AUTH_COOKIE_NAME(cls) -> str:
        return _resolved_auth_cookie_name()

    AUTH_COOKIE_MAX_AGE_SECONDS = go_shared_constants.AUTH_COOKIE_MAX_AGE_SECONDS
    BOOTSTRAP_TOKEN_TTL_SECONDS = go_shared_constants.BOOTSTRAP_TOKEN_TTL_SECONDS
    LAUNCH_INTENT_TOKEN_TTL_SECONDS = (
        go_shared_constants.LAUNCH_INTENT_TOKEN_TTL_SECONDS
    )
    SESSION_SECRET_BYTES = go_shared_constants.SESSION_SECRET_BYTES

    @classproperty
    def BACKEND(cls):
        return f"http://{cls.HOST}:{cls.PORT}"
