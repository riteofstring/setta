import asyncio
import logging
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from setta.types.specific_file_watcher import (
    FileEventType,
    FileWatcherCoreUpdate,
)
from setta.utils.constants import CWD
from setta.utils.utils import ensure_str_path

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
    def __init__(self):
        self.observer = Observer()
        self.watched_dirs: dict[Path, "ObservedWatch"] = {}
        self.callbacks: CallbackCategoryToCallbacksDict = defaultdict(dict)
        self.file_to_patterns: dict[Path, set[str]] = {}
        self.handler = SpecificFileEventHandler(
            asyncio.get_event_loop(),
            self.callbacks,
            self.file_to_patterns,
        )

    def request_read(self, abs_path: Path):
        mock_event = MockFileEvent(abs_path)
        self.handler._send_event(mock_event, FileEventType.readRequested)

    def update_callbacks(
        self,
        callbacks: CallbacksDict,
        callbackCategory: str,
        fire_immediately: list[Path],
    ):
        self.callbacks[callbackCategory].clear()
        self.callbacks[callbackCategory].update(callbacks)

        # Get all unique parent directories of the files we need to watch
        dirs_to_watch = set()
        for category_callbacks in self.callbacks.values():
            for file_path in category_callbacks.keys():
                dirs_to_watch.add(file_path.parent)

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
            watch = self.observer.schedule(self.handler, str(dir_path), recursive=False)
            self.watched_dirs[dir_path] = watch

        # Fire immediate reads if requested (only for new files)
        for f in fire_immediately:
            if f in callbacks:
                self.request_read(f)

    def start(self):
        self.observer.start()

    def stop(self):
        self.observer.stop()
        self.observer.join()


class SpecificFileEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        callbacks: CallbackCategoryToCallbacksDict,
        file_to_patterns: dict[Path, set[str]],
    ):
        self.loop = loop
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
        if event.is_directory:
            return

        print("\n\nsend_event", event, flush=True)
        # Get absolute path
        abs_path = Path(ensure_str_path(event.src_path)).resolve()

        # Get relative path to current working directory
        try:
            rel_path = abs_path.relative_to(CWD)
        except ValueError:
            # If path is not relative to CWD, use the absolute path
            rel_path = abs_path

        # For moved events, get the content of the destination file
        dest_abs_path = None
        dest_rel_path = None
        if event_type == FileEventType.moved and hasattr(event, "dest_path"):
            dest_abs_path = Path(ensure_str_path(event.dest_path)).resolve()
            try:
                dest_rel_path = dest_abs_path.relative_to(CWD)
            except ValueError:
                dest_rel_path = dest_abs_path

        handlers: list[FileWatcherCallback] = []
        file_to_read = dest_abs_path if dest_abs_path else abs_path
        for callbacks in self.callbacks.values():
            c = callbacks.get(file_to_read)
            if c:
                handlers.append(c)

        print("\n\n\nhandlers", handlers)
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

        self.loop.call_soon_threadsafe(
            lambda: self.loop.create_task(self.call_handlers(handlers, core_update))
        )

    async def call_handlers(
        self, handlers: list[FileWatcherCallback], core_update: FileWatcherCoreUpdate
    ):
        for h in handlers:
            await h(core_update)
