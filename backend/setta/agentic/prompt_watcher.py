import logging
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import ValidationError

from setta.agentic.store import list_prompt_templates
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


class PromptTemplateWatcher:
    CATEGORY = "PromptTemplateWatcher"

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
        self._update_callbacks(fire_immediately=True)

    def refresh(self) -> None:
        self._update_callbacks(fire_immediately=False)

    def _list_prompt_paths(self) -> set[Path]:
        paths = set(self.dbe.list_prompt_paths())
        if self.dbe.prompts_example.exists():
            paths.add(self.dbe.prompts_example)
        return paths

    def _update_callbacks(self, *, fire_immediately: bool) -> None:
        async def fn(_core_update: FileWatcherCoreUpdate):
            await self._reload_prompts()

        paths = self._list_prompt_paths()
        callbacks: CallbacksDict = {normalize_state_path(path): fn for path in paths}
        fire_paths = set(callbacks.keys()) if fire_immediately else set()
        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately=fire_paths,
        )

    async def _reload_prompts(self) -> None:
        try:
            prompts = list_prompt_templates(self.dbe)
        except ValidationError as exc:
            await self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                exc,
                label="prompt-parse",
                message="Failed to parse prompt templates; keeping previous prompts",
                severity=SettaBackendLogEventSeverity.error,
                handled=True,
                logger=logger,
                context={"prompts_path": str(self.dbe.prompts)},
            )
            return

        await self.websocket_msg_handler.broadcast_prompt_templates_update(prompts)
        logger.info("Reloaded %s prompt templates", len(prompts))
        self._update_callbacks(fire_immediately=False)
