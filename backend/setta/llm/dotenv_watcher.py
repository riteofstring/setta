"""File watcher that pushes LLM API-key updates when the managed key store changes."""

import logging
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.api_key_runtime_sync import sync_managed_api_keys_to_runtime
from setta.llm.api_keys import llm_api_keys_path
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
        await sync_managed_api_keys_to_runtime(
            dbe=self.dbe,
            agent_runner=self.agent_runner,
            websocket_msg_handler=self.websocket_msg_handler,
            logger=logger,
            log_label="llm-api-keys-reload",
            corruption_message=(
                "Failed to parse llm_api_keys.json; applying empty API keys snapshot"
            ),
            context={"api_keys_path": str(llm_api_keys_path(self.dbe))},
        )
