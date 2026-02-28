from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.trusted_frontend_origins import trust_frontend_origin
from setta.utils.launcher_origin_handoff import normalize_launcher_origin

if TYPE_CHECKING:
    from setta.sessions.registry import SessionMetadata


def resolve_bootstrap_origin(bootstrap_url_fragment: str) -> str | None:
    parsed = urlsplit(bootstrap_url_fragment)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return normalize_launcher_origin(f"{parsed.scheme}://{parsed.netloc}")


def trust_launched_workspace_origin_for_launcher_session(
    *,
    request_origin: str | None,
    bootstrap_url_fragment: str,
    launcher_session_info: tuple["SessionMetadata", bytes] | None,
) -> None:
    if request_origin is None:
        return
    if launcher_session_info is None:
        return
    launched_workspace_origin = resolve_bootstrap_origin(bootstrap_url_fragment)
    if launched_workspace_origin is None:
        return
    if launched_workspace_origin == request_origin:
        return
    trust_frontend_origin_for_launcher_session(
        origin=launched_workspace_origin,
        launcher_session_info=launcher_session_info,
    )


def trust_frontend_origin_for_launcher_session(
    *,
    origin: str,
    launcher_session_info: tuple["SessionMetadata", bytes],
    exp: int | None = None,
) -> None:
    session_metadata, session_secret = launcher_session_info
    if exp is None:
        auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, session_secret)
        auth_cookie_payload = AUTH_COOKIE_MANAGER.validate(auth_cookie, session_secret)
        exp = auth_cookie_payload.exp
    trust_frontend_origin(
        origin,
        session_id=session_metadata.id,
        exp=exp,
    )
