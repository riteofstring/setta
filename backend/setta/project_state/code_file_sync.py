import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Awaitable, Callable, Iterable

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import (
    FileWatcherCallback,
    SpecificFileWatcher,
)
from setta.types.section_impls import CodeFileAccessMode, CodeFileBinding
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.utils import normalize_path

logger = logging.getLogger(__name__)

# TODO: Add focused tests covering file change deduplication and multi-owner dispatch.


class CodeFileSyncEventType(str, Enum):
    created = "created"
    modified = "modified"
    deleted = "deleted"


@dataclass(slots=True)
class CodeFileSyncEvent:
    owner_id: str
    binding: CodeFileBinding
    path: Path
    event_type: CodeFileSyncEventType
    content: str | None
    core_update: FileWatcherCoreUpdate


SyncEventHandler = Callable[[CodeFileSyncEvent], Awaitable[None]]


@dataclass(slots=True)
class BindingOwner:
    owner_id: str
    binding: CodeFileBinding
    project_config_id: str
    section_id: str | None = None
    variant_id: str | None = None
    description: str | None = None
    on_external_update: SyncEventHandler | None = None
    on_created: SyncEventHandler | None = None
    on_deleted: SyncEventHandler | None = None


@dataclass(slots=True)
class _PathSubscribers:
    path: Path
    owners: dict[str, BindingOwner] = field(default_factory=dict)


class CodeFileSyncService:
    def __init__(
        self,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
        *,
        callback_category: str | None = None,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None:
        self._specific_file_watcher = specific_file_watcher
        self._dbe = dbe
        self._callback_category = callback_category or f"{self.__class__.__name__}"
        self._loop = loop or asyncio.get_event_loop()
        self._registry: dict[Path, _PathSubscribers] = {}
        self._owner_to_path: dict[str, Path] = {}
        self._pending_updates: dict[Path, FileWatcherCoreUpdate] = {}
        self._processing_tasks: dict[Path, asyncio.Task[None]] = {}
        self._locks: dict[Path, asyncio.Lock] = {}

    def register_binding(self, owner: BindingOwner) -> None:
        if owner.binding.access_mode == CodeFileAccessMode.write_only:
            logger.debug(
                "Skipping registration for owner_id=%s due to write_only binding",
                owner.owner_id,
            )
            self.unregister_binding(owner.owner_id)
            return

        self.unregister_binding(owner.owner_id)
        self._add_owner(owner)

    def unregister_binding(self, owner: BindingOwner | str) -> None:
        owner_id = owner.owner_id if isinstance(owner, BindingOwner) else owner
        path = self._owner_to_path.pop(owner_id, None)
        if path is None:
            return

        subscribers = self._registry.get(path)
        if not subscribers:
            return

        subscribers.owners.pop(owner_id, None)
        if not subscribers.owners:
            self._registry.pop(path, None)
            self._pending_updates.pop(path, None)
            task = self._processing_tasks.pop(path, None)
            if task and not task.done():
                task.cancel()
            self._locks.pop(path, None)

        self._sync_watcher_callbacks()

    def refresh_binding(self, owner: BindingOwner) -> None:
        current_path = self._owner_to_path.get(owner.owner_id)
        next_path = normalize_path(owner.binding.canonical_path)

        if owner.binding.access_mode == CodeFileAccessMode.write_only:
            self.unregister_binding(owner.owner_id)
            return

        if current_path is None:
            self._add_owner(owner)
            return

        if next_path != current_path:
            self.unregister_binding(owner.owner_id)
            self._add_owner(owner)
            return

        subscribers = self._registry.get(next_path)
        if not subscribers:
            self._add_owner(owner)
            return

        subscribers.owners[owner.owner_id] = owner
        self._owner_to_path[owner.owner_id] = next_path

    def _add_owner(self, owner: BindingOwner) -> None:
        path = normalize_path(owner.binding.canonical_path)
        subscribers = self._registry.get(path)
        is_new_path = False
        if not subscribers:
            subscribers = _PathSubscribers(path=path)
            self._registry[path] = subscribers
            is_new_path = True

        subscribers.owners[owner.owner_id] = owner
        self._owner_to_path[owner.owner_id] = path

        fire_immediately: Iterable[Path] = [path] if is_new_path else []
        self._sync_watcher_callbacks(fire_immediately=fire_immediately)

        try:
            self._specific_file_watcher.request_read(path)
        except Exception:
            logger.exception("Failed to request initial read for %s", path)

    def _sync_watcher_callbacks(
        self,
        *,
        fire_immediately: Iterable[Path] | None = None,
    ) -> None:
        callbacks = {
            path: self._create_callback(path) for path in self._registry.keys()
        }
        fire_set = set(fire_immediately) if fire_immediately else set()
        self._specific_file_watcher.update_callbacks(
            callbacks, self._callback_category, fire_set
        )

    def _create_callback(self, path: Path) -> FileWatcherCallback:
        async def _callback(core_update: FileWatcherCoreUpdate) -> None:
            normalized_path = normalize_path(path)
            self._pending_updates[normalized_path] = core_update
            task = self._processing_tasks.get(normalized_path)
            if task is None or task.done():
                self._processing_tasks[normalized_path] = self._loop.create_task(
                    self._process_updates(normalized_path)
                )

        return _callback

    async def _process_updates(self, path: Path) -> None:
        lock = self._locks.setdefault(path, asyncio.Lock())
        async with lock:
            while True:
                core_update = self._pending_updates.pop(path, None)
                if core_update is None:
                    break
                try:
                    await self._dispatch_update(path, core_update)
                except Exception:
                    logger.exception("Failed to handle code file update for %s", path)

    async def _dispatch_update(
        self, path: Path, core_update: FileWatcherCoreUpdate
    ) -> None:
        subscribers = self._registry.get(path)
        if not subscribers or not subscribers.owners:
            return

        event_type = self._convert_event_type(core_update.eventType)
        if event_type is None:
            return

        content: str | None = None
        final_event_type = event_type

        if event_type != CodeFileSyncEventType.deleted:
            try:
                content = self._dbe.read(core_update.fileToRead)
            except Exception:
                logger.exception("Failed to read code file %s", core_update.fileToRead)
            if content is None:
                final_event_type = CodeFileSyncEventType.deleted

        await asyncio.gather(
            *[
                self._emit_event(owner, final_event_type, content, core_update)
                for owner in subscribers.owners.values()
            ],
            return_exceptions=True,
        )

    async def _emit_event(
        self,
        owner: BindingOwner,
        event_type: CodeFileSyncEventType,
        content: str | None,
        core_update: FileWatcherCoreUpdate,
    ) -> None:
        event = CodeFileSyncEvent(
            owner_id=owner.owner_id,
            binding=owner.binding,
            path=normalize_path(owner.binding.canonical_path),
            event_type=event_type,
            content=content,
            core_update=core_update,
        )

        callbacks: list[SyncEventHandler] = []
        if event_type == CodeFileSyncEventType.deleted:
            if owner.on_deleted:
                callbacks.append(owner.on_deleted)
        else:
            if owner.on_external_update:
                callbacks.append(owner.on_external_update)
            if event_type == CodeFileSyncEventType.created and owner.on_created:
                callbacks.append(owner.on_created)

        for callback in callbacks:
            try:
                await callback(event)
            except Exception:
                logger.exception(
                    "Error while executing callback for owner_id=%s on %s",
                    owner.owner_id,
                    event_type.value,
                )

    @staticmethod
    def _convert_event_type(
        event_type: FileEventType,
    ) -> CodeFileSyncEventType | None:
        if event_type == FileEventType.deleted:
            return CodeFileSyncEventType.deleted
        if event_type == FileEventType.created:
            return CodeFileSyncEventType.created
        if event_type in (FileEventType.modified, FileEventType.readRequested):
            return CodeFileSyncEventType.modified
        return None
