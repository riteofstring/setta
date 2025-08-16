import asyncio
import logging
from collections import defaultdict
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
from watchdog.observers.api import ObservedWatch

from setta.file_watchers.utils import FileWatcherCallback
from setta.types.specific_file_watcher import (
    FileEventType,
    FileWatcherCoreUpdate,
)
from setta.utils.constants import CWD
from setta.utils.utils import ensure_str_path

logger = logging.getLogger(__name__)


class MockFileEvent:
    def __init__(self, src_path: Path):
        self.src_path = str(src_path)
        self.dest_path = str(src_path)
        self.is_directory = False


class SpecificFileWatcher:
    def __init__(self):
        self.observer = Observer()
        self.watched_dirs: dict[Path, ObservedWatch] = {}
        self.callbacks: dict[Path, set[FileWatcherCallback]] = defaultdict(set)
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
        callbacks: dict[Path, set[FileWatcherCallback]],
        fire_immediately: bool = True,
    ):
        self.callbacks.clear()
        self.callbacks.update(callbacks)

        # Get all unique parent directories of the files we need to watch
        dirs_to_watch = set()
        for file_path in callbacks.keys():
            # Watch the parent directory of each file
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

        # Fire immediate reads if requested
        if fire_immediately:
            for file_path in callbacks.keys():
                self.request_read(file_path)

    def start(self):
        self.observer.start()
        self.started = True

    def stop(self):
        self.observer.stop()
        self.observer.join()
        self.started = False


class SpecificFileEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        callbacks: dict[Path, set[FileWatcherCallback]],
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

        logger.debug("_send_event")
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

        if dest_abs_path:
            handlers = self.callbacks[dest_abs_path]
            file_to_read = dest_abs_path
        else:
            handlers = self.callbacks[abs_path]
            file_to_read = abs_path

        if len(handlers) == 0:
            return

        core_update = FileWatcherCoreUpdate(
            absPath=abs_path,
            relPath=rel_path,
            eventType=event_type,
            matchingGlobPatterns=list(self.file_to_patterns.get(abs_path, [])),
            destAbsPath=dest_abs_path,
            destRelPath=dest_rel_path,
        )

        self.loop.call_soon_threadsafe(
            lambda: self.loop.create_task(
                self.call_handlers(handlers, core_update, file_to_read)
            )
        )

    async def call_handlers(self, handlers, core_update, file_to_read):
        for h in handlers:
            await h(core_update, file_to_read)
