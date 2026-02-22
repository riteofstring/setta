"""File watcher that pushes LLM API-key updates when the managed key store changes."""

import logging
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.api_keys import llm_api_keys_path, read_managed_api_keys
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


class LLMApiKeyWatcher:
    CATEGORY = "LLMApiKeyWatcher"

    def __init__(
        self,
        specific_file_watcher: "SpecificFileWatcher",
        agent_runner: AgentRunner,
        websocket_msg_handler: WMHFrontendSender,
        dbe: DBE,
    ) -> None:
        self.specific_file_watcher = specific_file_watcher
        self.agent_runner = agent_runner
        self.websocket_msg_handler = websocket_msg_handler
        self.dbe = dbe

    def start(self) -> None:
        async def fn(_core_update: FileWatcherCoreUpdate):
            await self._reload_from_disk()

        normalized_path = normalize_state_path(llm_api_keys_path(self.dbe))
        callbacks: CallbacksDict = {normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately={normalized_path},
        )

    async def _reload_from_disk(self) -> None:
        try:
            api_keys = read_managed_api_keys(self.dbe)
        except Exception as exc:  # pragma: no cover - defensive log
            await (
                self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                    exc,
                    label="llm-api-keys-reload",
                    message="Failed to reload API keys; keeping previous values",
                    severity=SettaBackendLogEventSeverity.error,
                    handled=True,
                    logger=logger,
                    context={"api_keys_path": str(llm_api_keys_path(self.dbe))},
                )
            )
            return

        self.agent_runner.update_api_keys(api_keys)
        await self.websocket_msg_handler.broadcast_llm_api_keys_update(api_keys)
