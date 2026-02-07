import asyncio
import logging
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Iterable

from watchdog.events import FileSystemEvent, FileSystemEventHandler

from setta.logging.tasks import spawn_background_task
from setta.types.specific_file_watcher import (
    FileEventType,
    FileWatcherCoreUpdate,
)
from setta.utils.paths import normalize_workspace_path
from setta.utils.utils import ensure_str_path
from setta.utils.watchdog_observer import build_watchdog_observer

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
        self.observer = build_watchdog_observer()
        self.observer.daemon = True
        self.watched_dirs: dict[Path, "ObservedWatch"] = {}
        self.callbacks: CallbackCategoryToCallbacksDict = defaultdict(dict)
        self.file_to_patterns: dict[Path, set[str]] = {}
        self._pending_dirs: set[Path] = set()
        self._pending_reads: set[Path] = set()
        self._loop = loop
        self._started = False
        self.handler = SpecificFileEventHandler(
            self._get_loop,
            self.callbacks,
            self.file_to_patterns,
            self._handle_directory_created,
        )

    def _get_loop(self) -> asyncio.AbstractEventLoop | None:
        if self._loop is not None:
            return self._loop
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            return None
        self._flush_pending_reads()
        return self._loop

    def _flush_pending_reads(self) -> None:
        if not self._pending_reads:
            return
        pending = list(self._pending_reads)
        self._pending_reads.clear()
        for abs_path in pending:
            mock_event = MockFileEvent(abs_path)
            self.handler._send_event(mock_event, FileEventType.readRequested)

    def _find_existing_ancestor(self, path: Path) -> Path | None:
        current = path
        while True:
            parent = current.parent
            if parent == current:
                break
            current = parent
            if current.exists():
                return current
        if current.exists():
            return current
        return None

    def _handle_directory_created(self, path: Path) -> None:
        if not self._pending_dirs:
            return
        for pending_dir in self._pending_dirs:
            if pending_dir == path or pending_dir.is_relative_to(path):
                self._sync_watches()
                return

    def request_read(self, abs_path: Path):
        resolved = abs_path.resolve()
        if self._get_loop() is None:
            self._pending_reads.add(resolved)
            return
        mock_event = MockFileEvent(resolved)
        self.handler._send_event(mock_event, FileEventType.readRequested)

    def _sync_watches(self) -> None:
        desired_parent_dirs: set[Path] = set()
        parent_to_files: dict[Path, set[Path]] = defaultdict(set)
        for category_callbacks in self.callbacks.values():
            for file_path in category_callbacks.keys():
                parent_dir = file_path.parent
                desired_parent_dirs.add(parent_dir)
                parent_to_files[parent_dir].add(file_path)

        pending_dirs: set[Path] = set()
        dirs_to_watch: set[Path] = set()
        for parent_dir in desired_parent_dirs:
            if parent_dir.exists():
                dirs_to_watch.add(parent_dir)
                continue
            pending_dirs.add(parent_dir)
            ancestor = self._find_existing_ancestor(parent_dir)
            if ancestor is not None:
                dirs_to_watch.add(ancestor)

        previous_pending_dirs = self._pending_dirs
        self._pending_dirs = pending_dirs

        current_watched_dirs = set(self.watched_dirs.keys())
        dirs_to_remove = current_watched_dirs - dirs_to_watch
        for dir_path in dirs_to_remove:
            if dir_path in self.watched_dirs:
                try:
                    self.observer.unschedule(self.watched_dirs[dir_path])
                except KeyError:
                    logger.debug(
                        "Specific file watcher watch already unscheduled: %s",
                        dir_path,
                    )
                del self.watched_dirs[dir_path]

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

        newly_available_dirs = previous_pending_dirs - pending_dirs
        for parent_dir in newly_available_dirs:
            files = parent_to_files.get(parent_dir)
            if not files:
                continue
            for file_path in files:
                if file_path.exists():
                    self.request_read(file_path)

    def update_callbacks(
        self,
        callbacks: CallbacksDict,
        callbackCategory: str,
        fire_immediately: Iterable[Path],
    ):
        self.callbacks[callbackCategory].clear()
        self.callbacks[callbackCategory].update(callbacks)
        self._sync_watches()

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
        observer = self.observer
        if observer.is_alive():
            observer.stop()
            observer.join(timeout=1.0)
            if observer.is_alive():
                logger.warning(
                    "Specific file watcher observer did not shut down within timeout."
                )
        self._started = False


class SpecificFileEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        loop_getter: Callable[[], asyncio.AbstractEventLoop | None],
        callbacks: CallbackCategoryToCallbacksDict,
        file_to_patterns: dict[Path, set[str]],
        dir_created_callback: Callable[[Path], None] | None = None,
    ):
        self._loop_getter = loop_getter
        self.callbacks = callbacks
        self.file_to_patterns = file_to_patterns
        self._dir_created_callback = dir_created_callback

    def on_created(self, event: FileSystemEvent):
        if event.is_directory:
            self._handle_directory_created(event)
            return
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

    def _handle_directory_created(self, event: FileSystemEvent) -> None:
        if self._dir_created_callback is None:
            return
        loop = self._loop_getter()
        if loop is None:
            logger.debug(
                "Specific file watcher missing event loop; skipping directory event."
            )
            return
        if loop.is_closed():
            logger.debug(
                "Specific file watcher event loop closed; skipping directory event."
            )
            return
        abs_path = Path(ensure_str_path(event.src_path)).resolve()
        loop.call_soon_threadsafe(lambda: self._dir_created_callback(abs_path))

    def _send_event(
        self,
        event: FileSystemEvent | MockFileEvent,
        event_type: FileEventType,
    ):
        loop = self._loop_getter()
        if loop is None:
            logger.debug("Specific file watcher missing event loop; skipping event.")
            return
        if loop.is_closed():
            logger.debug("Specific file watcher event loop closed; skipping event.")
            return
        if event.is_directory:
            return

        # Get absolute path
        abs_path = Path(ensure_str_path(event.src_path)).resolve()
        normalized_path = normalize_workspace_path(abs_path)

        # For moved events, get the content of the destination file
        dest_abs_path = None
        normalized_dest_path = None
        if event_type == FileEventType.moved and hasattr(event, "dest_path"):
            dest_abs_path = Path(ensure_str_path(event.dest_path)).resolve()
            normalized_dest_path = normalize_workspace_path(dest_abs_path)

        handlers: list[FileWatcherCallback] = []
        file_to_read = (
            normalized_dest_path if normalized_dest_path else normalized_path
        )
        for callbacks in self.callbacks.values():
            c = callbacks.get(file_to_read)
            if c:
                handlers.append(c)

        if len(handlers) == 0:
            return

        core_update = FileWatcherCoreUpdate(
            absPath=abs_path,
            relPath=normalized_path,
            eventType=event_type,
            matchingGlobPatterns=list(self.file_to_patterns.get(abs_path, [])),
            destAbsPath=dest_abs_path,
            destRelPath=normalized_dest_path,
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
