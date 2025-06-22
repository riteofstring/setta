import asyncio
import glob
import logging
from collections import defaultdict
from pathlib import Path
from typing import Awaitable, Callable

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from setta.types.specific_file_watcher import (
    FileEventType,
    FileWatcherCoreUpdate,
    FileWatcherUpdate,
    FileWatcherUpdateHandler,
    FileWatchGroupName,
)
from setta.utils.constants import CWD
from setta.utils.utils import ensure_str_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


def create_specific_file_watcher(websocket_msg_handler: WMHFrontendSender):
    async def event_callback(event_info: FileWatcherUpdate):
        logger.debug(f"event_callback {event_info}")
        await websocket_msg_handler.broadcast_file_updates(event_info)

    return SpecificFileWatcher(event_callback)


class MockFileEvent:
    """Simple mock for a FileSystemEvent to use when firing immediate events."""

    def __init__(self, src_path: Path):
        self.src_path = str(src_path)
        self.dest_path = str(src_path)
        self.is_directory = False


class SpecificFileWatcher:
    """File watcher that monitors specific files and notifies via a single callback."""

    def __init__(self, event_callback: Callable[[FileWatcherUpdate], Awaitable[None]]):
        """
        Initialize the file watcher for specific files.

        Args:
            callback: Function to call when any watched file changes
                     Callback receives (file_path, event_type) where event_type is
                     one of 'created', 'modified', 'deleted', or 'moved'
        """
        self.observer = Observer()
        # map from fileWatchGroupName to set of filepaths
        self.watched_files: dict[FileWatchGroupName, set[Path]] = defaultdict(set)
        self.file_watcher_update_handlers: dict[Path, FileWatcherUpdateHandler] = {}
        self.file_to_patterns: dict[Path, set[str]] = {}
        self.handler = SpecificFileEventHandler(
            event_callback,
            asyncio.get_event_loop(),
            self.watched_files,
            self.file_watcher_update_handlers,
            self.file_to_patterns,
        )

    def request_read_all_files(self):
        for file_watch_group_name, filepaths in self.watched_files.items():
            for f in filepaths:
                mock_event = MockFileEvent(f)
                self.handler._send_event(
                    file_watch_group_name, mock_event, "readRequested"
                )

    def request_read(self, file_watch_group_name: FileWatchGroupName, abs_path: Path):
        mock_event = MockFileEvent(abs_path)
        self.handler._send_event(file_watch_group_name, mock_event, "readRequested")

    def add_file(
        self,
        file_path: Path,
        file_watch_group_name: FileWatchGroupName,
        file_watcher_update_handler: FileWatcherUpdateHandler,
        fire_immediately: bool = True,
    ):
        """
        Add a specific file to watch.

        Args:
            file_path: Path to the file to watch
            file_watch_group_name: Name of the group to add this file to
            file_watcher_update_handler:
            fire_immediately: If True, trigger an event for this file right away

        Returns:
            bool: True if the file was added, False if it doesn't exist
        """
        # Convert to Path if string
        file_path = Path(file_path)

        if not file_path.exists():
            return False

        absolute_path = file_path.resolve()
        dir_path = absolute_path.parent
        is_new_file = absolute_path not in self.watched_files[file_watch_group_name]

        # Add file to watched files if not already there
        if is_new_file:
            self.watched_files[file_watch_group_name].add(absolute_path)
            self.file_watcher_update_handlers[absolute_path] = (
                file_watcher_update_handler
            )
        else:
            # Already watching this file - update processor if provided
            self.file_watcher_update_handlers[absolute_path] = (
                file_watcher_update_handler
            )

        # Schedule the directory for watching if needed
        dir_path_str = str(dir_path)
        if not self.observer.emitters:
            # No directories are being watched yet
            self.observer.schedule(self.handler, dir_path_str, recursive=False)
        else:
            # Check if the directory is already being watched
            is_dir_watched = False
            for emitter in self.observer.emitters:
                if emitter.watch.path == dir_path_str:
                    is_dir_watched = True
                    break

            if not is_dir_watched:
                self.observer.schedule(self.handler, dir_path_str, recursive=False)

        # If requested, fire an immediate event
        if fire_immediately:
            self.request_read(file_watch_group_name, absolute_path)

        return True

    def remove_file(self, file_path: Path, file_watch_group_name: FileWatchGroupName):
        """
        Remove a file from being watched.

        Args:
            file_path: Path to the file
            file_watch_group_name: Name of the group to remove this file from
        """
        # Convert to Path if string
        absolute_path = Path(file_path).resolve()

        if absolute_path in self.watched_files[file_watch_group_name]:
            self.watched_files[file_watch_group_name].discard(absolute_path)

            # Check if file is still being watched in any group
            still_watched = any(
                absolute_path in files for files in self.watched_files.values()
            )

            # Only remove the processor if file is no longer watched in any group
            if not still_watched and absolute_path in self.file_watcher_update_handlers:
                del self.file_watcher_update_handlers[absolute_path]

    def update_watch_list(
        self,
        filepaths_and_glob_patterns: list[str],
        file_watch_group_name: FileWatchGroupName,
        file_watcher_update_handler: FileWatcherUpdateHandler,
        fire_immediately: bool = True,
    ):
        """
        Update the entire list of files being watched with a single function call.
        This efficiently handles adding new files and removing files that are no longer needed.

        Args:
            filepaths_and_glob_patterns: List of file paths that should be watched
            file_watch_group_name: Name of the group for these files
            content_processor:
            fire_immediately: If True, trigger an event for each added file right away

        Returns:
            Dict containing 'added' and 'removed' lists of file paths
        """
        file_paths = self.get_actual_file_paths_to_watch(filepaths_and_glob_patterns)

        # Convert all input paths to absolute paths (only if they exist)
        absolute_paths = {
            Path(path).resolve() for path in file_paths if Path(path).exists()
        }

        # Calculate differences
        files_to_add = absolute_paths - self.watched_files[file_watch_group_name]
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

    def get_actual_file_paths_to_watch(self, filepaths_and_glob_patterns: list[str]):
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
        callback: Callable[[FileWatcherUpdate], Awaitable[None]],
        loop: asyncio.AbstractEventLoop,
        watched_files_ref: dict[FileWatchGroupName, set[Path]],
        file_watcher_update_handlers: dict[Path, FileWatcherUpdateHandler],
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
        self.callback = callback
        self.loop = loop
        self.watched_files_ref = watched_files_ref
        self.file_watcher_update_handlers = file_watcher_update_handlers
        self.file_to_patterns = file_to_patterns

    def on_created(self, event: FileSystemEvent):
        """Handle file creation event."""
        if not event.is_directory:
            file_path = Path(ensure_str_path(event.src_path)).resolve()
            for file_watch_group_name, filepaths in self.watched_files_ref.items():
                if file_path in filepaths:
                    self._send_event(file_watch_group_name, event, "created")
                    break

    def on_modified(self, event: FileSystemEvent):
        """Handle file modification event."""
        if not event.is_directory:
            file_path = Path(ensure_str_path(event.src_path)).resolve()
            for file_watch_group_name, filepaths in self.watched_files_ref.items():
                if file_path in filepaths:
                    self._send_event(file_watch_group_name, event, "modified")
                    break

    def on_deleted(self, event: FileSystemEvent):
        """Handle file deletion event."""
        if not event.is_directory:
            file_path = Path(ensure_str_path(event.src_path)).resolve()
            for file_watch_group_name, filepaths in self.watched_files_ref.items():
                if file_path in filepaths:
                    self._send_event(file_watch_group_name, event, "deleted")
                    break

    def on_moved(self, event: FileSystemEvent):
        """Handle file move event."""
        if not event.is_directory:
            # For moved events, we need to check both source and destination
            src_path = Path(ensure_str_path(event.src_path)).resolve()
            dest_path = (
                Path(ensure_str_path(event.dest_path)).resolve()
                if hasattr(event, "dest_path")
                else None
            )

            # If the source was being watched, notify about the move
            for file_watch_group_name, filepaths in self.watched_files_ref.items():
                if src_path in filepaths:
                    self._send_event(file_watch_group_name, event, "moved")
                    break

            # If the destination is also being watched, notify about modification
            for file_watch_group_name, filepaths in self.watched_files_ref.items():
                if dest_path and dest_path in filepaths and dest_path != src_path:
                    # Create a modified event for the destination
                    self._send_event(file_watch_group_name, event, "modified")
                    break

    def _send_event(
        self,
        file_watch_group_name: FileWatchGroupName,
        event: FileSystemEvent | MockFileEvent,
        event_type: str,
    ):
        """
        Process and send the event to the callback.

        Args:
            file_watch_group_name: Group name for the file
            event: The file system event
            event_type: The type of event ('created', 'modified', 'deleted', 'moved', 'readRequested')
        """
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
            handler = self.file_watcher_update_handlers.get(dest_abs_path)
            file_to_read = dest_abs_path
        else:
            handler = self.file_watcher_update_handlers.get(abs_path)
            file_to_read = abs_path

        if not handler:
            return

        core_update = FileWatcherCoreUpdate(
            absPath=abs_path,
            relPath=rel_path,
            eventType=FileEventType(event_type),
            matchingGlobPatterns=list(self.file_to_patterns.get(abs_path, [])),
            destAbsPath=dest_abs_path,
            destRelPath=dest_rel_path,
        )

        file_watch_update = handler(core_update, file_to_read)

        logger.debug(f"will send {file_watch_update}")
        if asyncio.iscoroutinefunction(self.callback):
            coro = self.callback(file_watch_update)
            self.loop.call_soon_threadsafe(lambda: self.loop.create_task(coro))
        else:
            self.callback(file_watch_update)
