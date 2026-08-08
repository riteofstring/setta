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
    @classproperty
    def RUNTIME_SESSIONS_FOLDER(cls) -> Path:
        return get_setta_paths().runtime_sessions_root

    @classproperty
    def AUTH_COOKIE_NAME(cls) -> str:
        return _resolved_auth_cookie_name()

    @classproperty
    def BACKEND(cls):
        return (
            f"http://{go_shared_constants.DEFAULT_HOST}:"
            f"{go_shared_constants.DEFAULT_PORT}"
        )
