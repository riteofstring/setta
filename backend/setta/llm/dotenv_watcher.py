"""File watcher that pushes LLM API-key updates when .env changes."""

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from setta.llm.api_keys import (
    read_env_file,
    reload_process_env,
    resolve_env_path,
)
from setta.llm.llm_chat_manager import LLMChatManager
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:  # pragma: no cover
    from setta.file_watchers.specific_file_watcher import (
        CallbacksDict,
        SpecificFileWatcher,
    )

logger = logging.getLogger(__name__)


class DotEnvWatcher:
    CATEGORY = "DotEnvWatcher"

    def __init__(
        self,
        specific_file_watcher: "SpecificFileWatcher",
        chat_manager: LLMChatManager,
        websocket_msg_handler: WMHFrontendSender,
        *,
        env_path: Path | None = None,
    ) -> None:
        self.specific_file_watcher = specific_file_watcher
        self.chat_manager = chat_manager
        self.websocket_msg_handler = websocket_msg_handler
        self._env_path = resolve_env_path(env_path)
        self._normalized_path = normalize_path(self._env_path)

    def start(self) -> None:
        async def fn(_core_update: FileWatcherCoreUpdate):
            await self._reload_from_disk()

        callbacks: CallbacksDict = {self._normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately={self._normalized_path},
        )

    async def _reload_from_disk(self) -> None:
        try:
            reload_process_env(self._env_path)
        except Exception as exc:  # pragma: no cover - defensive log
            logger.exception("Failed to reload .env", exc_info=exc)
            await self.websocket_msg_handler.broadcast_notification(
                SettaNotification(
                    message="Failed to reload API keys; keeping previous values",
                    type=SettaNotificationType.error,
                )
            )
            return

        env_vars = read_env_file(self._env_path)
        self.chat_manager.update_api_keys(env_vars)
        await self.websocket_msg_handler.broadcast_llm_api_keys_update(
            self.chat_manager.api_keys
        )
