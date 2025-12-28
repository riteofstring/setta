import asyncio
from typing import TYPE_CHECKING

from setta.share.session_store import ShareSessionStore

DEFAULT_SHARE_SESSION_TTL_SECONDS = 60 * 30
DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS = 60 * 5

if TYPE_CHECKING:
    from setta.project_state.share_project_manager import ShareProjectManager
    from setta.project_state.share_session_project_manager_switcher import (
        ShareSessionProjectManagerSwitcher,
    )


def cleanup_expired_share_sessions(
    share_session_store: ShareSessionStore,
    share_project_manager: "ShareProjectManager",
    session_manager_switcher: "ShareSessionProjectManagerSwitcher | None" = None,
) -> list[str]:
    expired_ids = share_session_store.cleanup_expired()
    for session_id in expired_ids:
        if share_project_manager.has_session_state(session_id):
            share_project_manager.delete_session_state(session_id)
        if session_manager_switcher is not None:
            session_manager_switcher.drop_session_manager(session_id)
    return expired_ids


async def run_share_session_cleanup_loop(
    share_session_store: ShareSessionStore,
    share_project_manager: "ShareProjectManager",
    session_manager_switcher: "ShareSessionProjectManagerSwitcher | None" = None,
    *,
    interval_seconds: int = DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS,
) -> None:
    while True:
        cleanup_expired_share_sessions(
            share_session_store,
            share_project_manager,
            session_manager_switcher,
        )
        await asyncio.sleep(interval_seconds)
