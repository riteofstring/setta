import logging
from typing import TYPE_CHECKING

from pydantic import ValidationError

from setta.agentic.store import load_engine_configs
from setta.database.db_objs import DBE
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.paths import normalize_state_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:  # pragma: no cover
    from setta.file_watchers.specific_file_watcher import (
        CallbacksDict,
        SpecificFileWatcher,
    )

logger = logging.getLogger(__name__)


class EngineConfigWatcher:
    CATEGORY = "EngineConfigWatcher"

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
            await self._reload_configs()

        normalized_path = normalize_state_path(self.dbe.engine_configs)
        callbacks: CallbacksDict = {normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately={normalized_path},
        )

    async def _reload_configs(self) -> None:
        try:
            configs = load_engine_configs(self.dbe)
        except ValidationError as exc:
            await self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                exc,
                label="engine-configs-parse",
                message="Failed to parse engine_configs.json; keeping previous configs",
                severity=SettaBackendLogEventSeverity.error,
                handled=True,
                logger=logger,
                context={"engine_configs_path": str(self.dbe.engine_configs)},
            )
            return

        await self.websocket_msg_handler.broadcast_engine_configs_update(configs)
        logger.info("Reloaded %s engine configs", len(configs))
