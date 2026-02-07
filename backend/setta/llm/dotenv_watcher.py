"""File watcher that pushes LLM API-key updates when .env changes."""

import logging
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
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


class DotEnvWatcher:
    CATEGORY = "DotEnvWatcher"

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

        normalized_path = normalize_state_path(self.dbe.dot_env)
        callbacks: CallbacksDict = {normalized_path: fn}
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately={normalized_path},
        )

    async def _reload_from_disk(self) -> None:
        try:
            self.dbe.reload_dot_env()
            env_vars = self.dbe.read_dot_env()
        except Exception as exc:  # pragma: no cover - defensive log
            await (
                self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                    exc,
                    label="dotenv-reload",
                    message="Failed to reload API keys; keeping previous values",
                    severity=SettaBackendLogEventSeverity.error,
                    handled=True,
                    logger=logger,
                    context={"dot_env": str(self.dbe.dot_env)},
                )
            )
            return

        self.agent_runner.update_api_keys(env_vars)
        await self.websocket_msg_handler.broadcast_llm_api_keys_update(
            self.agent_runner.api_keys
        )
