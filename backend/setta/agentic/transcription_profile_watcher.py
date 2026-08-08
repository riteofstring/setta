import logging
from typing import TYPE_CHECKING

from setta.agentic.store import load_transcription_profiles
from setta.database.db_objs import DBE
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.paths import normalize_state_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:  # pragma: no cover
    from setta.file_watchers.specific_file_watcher import (
        CallbacksDict,
        SpecificFileWatcher,
    )

logger = logging.getLogger(__name__)


class TranscriptionProfileWatcher:
    CATEGORY = "TranscriptionProfileWatcher"

    def __init__(
        self,
        specific_file_watcher: "SpecificFileWatcher",
        websocket_msg_handler: WMHFrontendSender,
        dbe: DBE,
    ) -> None:
        self.specific_file_watcher = specific_file_watcher
        self.websocket_msg_handler = websocket_msg_handler
        self.dbe = dbe

    def start(self) -> None:
        async def fn(_core_update: FileWatcherCoreUpdate):
            await self._reload_profiles()

        normalized_path = normalize_state_path(self.dbe.transcription_profiles)
        callbacks: CallbacksDict = {normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately={normalized_path},
        )

    async def _reload_profiles(self) -> None:
        profiles = load_transcription_profiles(self.dbe)
        await self.websocket_msg_handler.broadcast_transcription_profiles_update(
            profiles
        )
        logger.info("Reloaded %s transcription profiles", len(profiles))
