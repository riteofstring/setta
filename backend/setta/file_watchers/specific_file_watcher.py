import asyncio
import logging
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Iterable

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from setta.logging.tasks import spawn_background_task
from setta.types.specific_file_watcher import (
    FileEventType,
    FileWatcherCoreUpdate,
)
from setta.utils.utils import ensure_str_path, normalize_path

if TYPE_CHECKING:
    from watchdog.observers.api import ObservedWatch

logger = logging.getLogger(__name__)


FileWatcherCallback = Callable[[FileWatcherCoreUpdate], Coroutine[Any, Any, None]]
CallbacksDict = dict[Path, FileWatcherCallback]
CallbackCategoryToCallbacksDict = dict[str, CallbacksDict]


class MockFileEvent:
    def __init__(self, src_path: Path):
        self.src_path = str(src_path)
        self.dest_path = str(src_path)
        self.is_directory = False


class SpecificFileWatcher:
    def __init__(self, loop: asyncio.AbstractEventLoop | None = None):
        self.observer = Observer()
        self.watched_dirs: dict[Path, "ObservedWatch"] = {}
        self.callbacks: CallbackCategoryToCallbacksDict = defaultdict(dict)
        self.file_to_patterns: dict[Path, set[str]] = {}
        self._loop = loop
        self._started = False
        self.handler = SpecificFileEventHandler(
            self._get_loop,
            self.callbacks,
            self.file_to_patterns,
        )

    def _get_loop(self) -> asyncio.AbstractEventLoop | None:
        if self._loop is not None:
            return self._loop
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            return None
        return self._loop

    def request_read(self, abs_path: Path):
        mock_event = MockFileEvent(abs_path)
        self.handler._send_event(mock_event, FileEventType.readRequested)

    def update_callbacks(
        self,
        callbacks: CallbacksDict,
        callbackCategory: str,
        fire_immediately: Iterable[Path],
    ):
        self.callbacks[callbackCategory].clear()
        self.callbacks[callbackCategory].update(callbacks)

        # Get all unique parent directories of the files we need to watch
        dirs_to_watch = set()
        for category_callbacks in self.callbacks.values():
            for file_path in category_callbacks.keys():
                parent_dir = file_path.parent
                if parent_dir.exists():
                    dirs_to_watch.add(parent_dir)

        # Remove watches for directories no longer needed
        current_watched_dirs = set(self.watched_dirs.keys())
        dirs_to_remove = current_watched_dirs - dirs_to_watch
        for dir_path in dirs_to_remove:
            if dir_path in self.watched_dirs:
                self.observer.unschedule(self.watched_dirs[dir_path])
                del self.watched_dirs[dir_path]

        # Add watches for new directories
        dirs_to_add = dirs_to_watch - current_watched_dirs
        for dir_path in dirs_to_add:
            if not dir_path.exists():
                logger.debug(
                    "Skipping watch for missing directory: %s",
                    dir_path,
                )
                continue
            watch = self.observer.schedule(self.handler, str(dir_path), recursive=False)
            self.watched_dirs[dir_path] = watch

        # Fire immediate reads if requested (only for new files)
        for f in fire_immediately:
            if f in callbacks and f.exists():
                self.request_read(f)

    def start(self):
        self._get_loop()
        self.observer.start()
        self._started = True

    def stop(self):
        if not self._started:
            return
        self.observer.stop()
        self.observer.join()
        self._started = False


class SpecificFileEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        loop_getter: Callable[[], asyncio.AbstractEventLoop | None],
        callbacks: CallbackCategoryToCallbacksDict,
        file_to_patterns: dict[Path, set[str]],
    ):
        self._loop_getter = loop_getter
        self.callbacks = callbacks
        self.file_to_patterns = file_to_patterns

    def on_created(self, event: FileSystemEvent):
        self._send_event(event, FileEventType.created)

    def on_modified(self, event: FileSystemEvent):
        self._send_event(event, FileEventType.modified)

    def on_deleted(self, event: FileSystemEvent):
        # this can happen when using Path().replace()
        if Path(ensure_str_path(event.src_path)).exists():
            self._send_event(event, FileEventType.modified)
        else:
            self._send_event(event, FileEventType.deleted)

    def on_moved(self, event: FileSystemEvent):
        # TODO
        pass

    def _send_event(
        self,
        event: FileSystemEvent | MockFileEvent,
        event_type: FileEventType,
    ):
        loop = self._loop_getter()
        if loop is None:
            logger.debug("Specific file watcher missing event loop; skipping event.")
            return
        if event.is_directory:
            return

        # Get absolute path
        abs_path = Path(ensure_str_path(event.src_path)).resolve()
        rel_path = normalize_path(abs_path)

        # For moved events, get the content of the destination file
        dest_abs_path = None
        dest_rel_path = None
        if event_type == FileEventType.moved and hasattr(event, "dest_path"):
            dest_abs_path = Path(ensure_str_path(event.dest_path)).resolve()
            dest_rel_path = normalize_path(dest_abs_path)

        handlers: list[FileWatcherCallback] = []
        file_to_read = dest_rel_path if dest_rel_path else rel_path
        for callbacks in self.callbacks.values():
            c = callbacks.get(file_to_read)
            if c:
                handlers.append(c)

        if len(handlers) == 0:
            return

        core_update = FileWatcherCoreUpdate(
            absPath=abs_path,
            relPath=rel_path,
            eventType=event_type,
            matchingGlobPatterns=list(self.file_to_patterns.get(abs_path, [])),
            destAbsPath=dest_abs_path,
            destRelPath=dest_rel_path,
            fileToRead=file_to_read,
        )

        loop.call_soon_threadsafe(
            lambda: spawn_background_task(
                self.call_handlers(handlers, core_update),
                loop=loop,
                label="specific-file-watcher-dispatch",
                extra_values={
                    "file_event_type": event_type.value,
                    "handler_count": len(handlers),
                    "file_to_read": str(file_to_read),
                },
            )
        )

    async def call_handlers(
        self, handlers: list[FileWatcherCallback], core_update: FileWatcherCoreUpdate
    ):
        for h in handlers:
            await h(core_update)
