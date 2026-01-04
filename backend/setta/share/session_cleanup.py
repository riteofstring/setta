import asyncio
from typing import TYPE_CHECKING

from setta.share.session_store import ShareSessionStore

DEFAULT_SHARE_SESSION_TTL_SECONDS = 60 * 30
DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS = 60 * 5

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.project_state.share_runtime_state import ShareRuntimeState
    from setta.share.chat_manager import ShareChatManager
    from setta.share.listener_runtime import ShareListenerRuntime
    from setta.terminals.terminals import Terminals


async def cleanup_expired_share_sessions(
    share_session_store: ShareSessionStore,
    share_runtime_state: "ShareRuntimeState",
    session_manager_switcher: "ProjectManagerSwitcher | None" = None,
    share_listener_runtime: "ShareListenerRuntime | None" = None,
    share_chat_manager: "ShareChatManager | None" = None,
    terminals: "Terminals | None" = None,
) -> list[str]:
    expired_ids = share_session_store.cleanup_expired()
    for session_id in expired_ids:
        if terminals is not None:
            await terminals.delete_terminals_for_share_session(session_id)
        if share_listener_runtime is not None:
            share_listener_runtime.drop_session_listener(session_id)
        if share_chat_manager is not None:
            share_chat_manager.drop_session(session_id)
        if share_runtime_state.has_session_state(session_id):
            share_runtime_state.delete_session_state(session_id)
        if session_manager_switcher is not None:
            session_manager_switcher.drop_session_manager(session_id)
    return expired_ids


async def run_share_session_cleanup_loop(
    share_session_store: ShareSessionStore,
    share_runtime_state: "ShareRuntimeState",
    session_manager_switcher: "ProjectManagerSwitcher | None" = None,
    share_listener_runtime: "ShareListenerRuntime | None" = None,
    share_chat_manager: "ShareChatManager | None" = None,
    terminals: "Terminals | None" = None,
    *,
    interval_seconds: int = DEFAULT_SHARE_SESSION_CLEANUP_INTERVAL_SECONDS,
) -> None:
    while True:
        await cleanup_expired_share_sessions(
            share_session_store,
            share_runtime_state,
            session_manager_switcher,
            share_listener_runtime,
            share_chat_manager,
            terminals,
        )
        await asyncio.sleep(interval_seconds)
