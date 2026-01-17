"""File watcher that keeps agentic assets in sync with disk edits."""

from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:  # pragma: no cover
    from setta.file_watchers.specific_file_watcher import (
        CallbacksDict,
        SpecificFileWatcher,
    )


class AgenticWatcher:
    CATEGORY = "AgenticWatcher"

    def __init__(
        self,
        specific_file_watcher: "SpecificFileWatcher",
        websocket_msg_handler: WMHFrontendSender,
        dbe: DBE,
    ) -> None:
        self.specific_file_watcher = specific_file_watcher
        self.websocket_msg_handler = websocket_msg_handler
        self.dbe = dbe
        self._started = False

    def start(self) -> None:
        self._started = True
        self.refresh()

    def refresh(self) -> None:
        if not self._started:
            return

        async def fn(_core_update: FileWatcherCoreUpdate):
            await self._broadcast_updates()

        callbacks: "CallbacksDict" = {
            normalize_path(self.dbe.agent_profiles): fn,
        }
        for path in self.dbe.list_prompt_paths():
            callbacks[normalize_path(path)] = fn

        self.specific_file_watcher.update_callbacks(
            callbacks,
            self.CATEGORY,
            fire_immediately=callbacks.keys(),
        )

    async def _broadcast_updates(self) -> None:
        profiles = self.dbe.read_agent_profiles()
        prompts = self.dbe.read_prompts()
        await self.websocket_msg_handler.broadcast_agent_profiles_update(profiles)
        await self.websocket_msg_handler.broadcast_prompt_assets_update(prompts)
