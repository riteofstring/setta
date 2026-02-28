"""File watcher that keeps the LLM config in sync with disk edits."""

import logging
from typing import TYPE_CHECKING

from pydantic import ValidationError

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.config import load_llm_config
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


class LLMConfigWatcher:
    CATEGORY = "LLMConfigWatcher"

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
            await self._reload_config()

        normalized_path = normalize_state_path(self.dbe.llm_config)
        callbacks: CallbacksDict = {normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately={normalized_path},
        )

    async def _reload_config(self) -> None:
        try:
            config = load_llm_config(self.dbe)
        except ValidationError as exc:
            await self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                exc,
                label="llm-config-parse",
                message="Failed to parse llm_config.json; keeping previous settings",
                severity=SettaBackendLogEventSeverity.error,
                handled=True,
                logger=logger,
                context={"llm_config_path": str(self.dbe.llm_config)},
            )
            return

        self.agent_runner.update_config(config)
        logger.info(
            "Reloaded LLM config with %s providers",
            len(self.agent_runner.config.configs),
        )

        await self.websocket_msg_handler.broadcast_llm_config_update(
            self.agent_runner.config
        )
        await self.websocket_msg_handler.broadcast_llm_api_keys_update(
            self.agent_runner.api_keys
        )
