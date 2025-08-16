import asyncio
import glob
import logging
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from setta.file_watchers.utils import FileWatcherUpdateHandler
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
        self.file_watcher_update_handlers: dict[Path, set[FileWatcherUpdateHandler]] = (
            defaultdict(set)
        )
        self.file_to_patterns: dict[Path, set[str]] = {}
        self.handler = SpecificFileEventHandler(
            asyncio.get_event_loop(),
            self.file_watcher_update_handlers,
            self.file_to_patterns,
        )

    def request_read(self, abs_path: Path):
        mock_event = MockFileEvent(abs_path)
        self.handler._send_event(mock_event, "readRequested")

    def add_file(
        self,
        file_path: Path,
        file_watcher_update_handler: FileWatcherUpdateHandler,
        fire_immediately: bool = True,
    ):
        file_path = Path(file_path)

        if not file_path.exists():
            return False

        absolute_path = file_path.resolve()
        dir_path = absolute_path.parent

        self.file_watcher_update_handlers[absolute_path].add(
            file_watcher_update_handler
        )

        dir_path_str = str(dir_path)
        if not self.observer.emitters:
            self.observer.schedule(self.handler, dir_path_str, recursive=False)
        else:
            is_dir_watched = False
            for emitter in self.observer.emitters:
                if emitter.watch.path == dir_path_str:
                    is_dir_watched = True
                    break

            if not is_dir_watched:
                self.observer.schedule(self.handler, dir_path_str, recursive=False)

        if fire_immediately:
            self.request_read(absolute_path)

        return True

    def remove_file(
        self,
        file_path: Path,
        file_watcher_update_handler: FileWatcherUpdateHandler,
    ):
        absolute_path = Path(file_path).resolve()
        if absolute_path in self.file_watcher_update_handlers:
            self.file_watcher_update_handlers[absolute_path].discard(
                file_watcher_update_handler
            )

    def update_watch_list(
        self,
        filepaths_and_glob_patterns: Iterable[str],
        file_watcher_update_handler: FileWatcherUpdateHandler,
        fire_immediately: bool = True,
    ):
        file_paths = self.get_actual_file_paths_to_watch(filepaths_and_glob_patterns)

        # Convert all input paths to absolute paths (only if they exist)
        absolute_paths = {
            Path(path).resolve() for path in file_paths if Path(path).exists()
        }

        # Calculate differences
        files_to_add = absolute_paths - self.file[file_watch_group_name]
        files_to_remove = self.watched_files[file_watch_group_name] - absolute_paths

        # Track which files were successfully added
        added_files: list[Path] = []

        # Add new files
        for file_path in files_to_add:
            success = self.add_file(
                file_path,
                file_watch_group_name,
                file_watcher_update_handler,
                fire_immediately,
            )
            if success:
                added_files.append(file_path)

        # Remove files no longer in the list
        for file_path in files_to_remove:
            self.remove_file(file_path, file_watch_group_name)

        # Return information about what changed
        return {"added": added_files, "removed": list(files_to_remove)}

    def get_actual_file_paths_to_watch(
        self, filepaths_and_glob_patterns: Iterable[str]
    ):
        actual_filepaths: set[Path] = set()
        # Expand glob patterns and build the mapping
        for pattern in filepaths_and_glob_patterns:
            matching_files = glob.glob(pattern)
            for file_path_str in matching_files:
                file_path = Path(file_path_str)
                # Only add actual files, not directories
                if file_path.is_file():
                    abs_path = file_path.resolve()
                    actual_filepaths.add(abs_path)

                    # Add to the mapping
                    if abs_path not in self.file_to_patterns:
                        self.file_to_patterns[abs_path] = set()
                    self.file_to_patterns[abs_path].add(pattern)

        return actual_filepaths

    def start(self):
        """Start the file watcher."""
        self.observer.start()
        self.started = True

    def stop(self):
        """Stop the file watcher."""
        self.observer.stop()
        self.observer.join()
        self.started = False


class SpecificFileEventHandler(FileSystemEventHandler):
    """Event handler for specific file events."""

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        file_watcher_update_handlers: dict[Path, set[FileWatcherUpdateHandler]],
        file_to_patterns: dict[Path, set[str]],
    ):
        """
        Initialize the event handler.

        Args:
            callback: Function to call when a watched file changes
            loop: Asyncio event loop for async callbacks
            watched_files_ref: Reference to the dict of files being watched
            file_watcher_update_handlers: Reference to the dict of file update handlers
            file_to_patterns: Reference to the dict of file to pattern mappings
        """
        self.loop = loop
        self.file_watcher_update_handlers = file_watcher_update_handlers
        self.file_to_patterns = file_to_patterns

    def on_created(self, event: FileSystemEvent):
        self._send_event(event, "created")

    def on_modified(self, event: FileSystemEvent):
        self._send_event(event, "modified")

    def on_deleted(self, event: FileSystemEvent):
        self._send_event(event, "deleted")

    def on_moved(self, event: FileSystemEvent):
        # TODO
        pass

    def _send_event(
        self,
        event: FileSystemEvent | MockFileEvent,
        event_type: str,
    ):
        """
        Process and send the event to the callback.

        Args:
            event: The file system event
            event_type: The type of event ('created', 'modified', 'deleted', 'moved', 'readRequested')
        """
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
            handlers = self.file_watcher_update_handlers[dest_abs_path]
            file_to_read = dest_abs_path
        else:
            handlers = self.file_watcher_update_handlers[abs_path]
            file_to_read = abs_path

        if len(handlers) == 0:
            return

        core_update = FileWatcherCoreUpdate(
            absPath=abs_path,
            relPath=rel_path,
            eventType=FileEventType(event_type),
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
