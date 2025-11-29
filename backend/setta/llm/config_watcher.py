"""File watcher that keeps the LLM config in sync with disk edits."""

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import ValidationError

from setta.llm.config import load_llm_config
from setta.llm.llm_chat_manager import LLMChatManager
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.constants import CWD, C
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:  # pragma: no cover
    from setta.file_watchers.specific_file_watcher import (
        CallbacksDict,
        SpecificFileWatcher,
    )

logger = logging.getLogger(__name__)


class LLMConfigWatcher:
    CATEGORY = "LLMConfigWatcher"

    def __init__(
        self,
        specific_file_watcher: "SpecificFileWatcher",
        chat_manager: LLMChatManager,
        websocket_msg_handler: WMHFrontendSender,
        *,
        config_path: Path | None = None,
    ) -> None:
        self.specific_file_watcher = specific_file_watcher
        self.chat_manager = chat_manager
        self.websocket_msg_handler = websocket_msg_handler
        raw_path = config_path or (C.SETTA_FILES_FOLDER / C.LLM_CONFIG_FILENAME)
        self._config_path = (CWD / raw_path).resolve()
        self._normalized_path = normalize_path(self._config_path)

    def start(self) -> None:
        async def fn(_core_update: FileWatcherCoreUpdate):
            await self._reload_config()

        callbacks: CallbacksDict = {self._normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately=set(),
        )

    async def _reload_config(self) -> None:
        try:
            config = load_llm_config(self._config_path)
        except ValidationError as exc:
            logger.exception("Invalid LLM config", exc_info=exc)
            await self.websocket_msg_handler.broadcast_notification(
                SettaNotification(
                    message="Failed to parse llm_config.json; keeping previous settings",
                    type=SettaNotificationType.error,
                )
            )
            return

        self.chat_manager.update_config(config)
        logger.info(
            "Reloaded LLM config with %s providers",
            len(self.chat_manager.config.configs),
        )
