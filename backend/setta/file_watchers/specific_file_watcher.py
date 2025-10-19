import asyncio
import logging
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Iterable

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
from watchdog.observers.polling import PollingObserver

from setta.types.specific_file_watcher import (
    FileEventType,
    FileWatcherCoreUpdate,
)
from setta.utils.constants import C
from setta.utils.utils import ensure_str_path, normalize_path

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from watchdog.observers.api import ObservedWatch


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
        self.polling_observer = PollingObserver()
        self.watched_dirs: dict[Path, "ObservedWatch"] = {}
        self.polling_watched_dirs: dict[Path, "ObservedWatch"] = {}
        self.callbacks: CallbackCategoryToCallbacksDict = defaultdict(dict)
        self.file_to_patterns: dict[Path, set[str]] = {}
        self.handler = SpecificFileEventHandler(
            asyncio.get_event_loop(),
            self.callbacks,
            self.file_to_patterns,
        )
        self._repo_root = Path.cwd().resolve()
        self._setta_files_root = (self._repo_root / C.SETTA_FILES_FOLDER).resolve()

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
                dirs_to_watch.add(file_path.parent)

        logger.critical(
            "code_sync_debug watcher_update category=%s dirs_to_watch=%s",
            callbackCategory,
            [str(d) for d in dirs_to_watch],
        )

        desired_default_dirs: set[Path] = set()
        desired_polling_dirs: set[Path] = set()
        for dir_path in dirs_to_watch:
            abs_dir_path = self._resolve_watch_dir(dir_path)
            if self._should_use_polling(abs_dir_path):
                desired_polling_dirs.add(dir_path)
            else:
                desired_default_dirs.add(dir_path)

        current_default_dirs = set(self.watched_dirs.keys())
        logger.critical(
            "code_sync_debug watcher_current_dirs_default category=%s current=%s",
            callbackCategory,
            [str(d) for d in current_default_dirs],
        )
        current_polling_dirs = set(self.polling_watched_dirs.keys())
        logger.critical(
            "code_sync_debug watcher_current_dirs_polling category=%s current=%s",
            callbackCategory,
            [str(d) for d in current_polling_dirs],
        )

        default_dirs_to_remove = current_default_dirs - desired_default_dirs
        for dir_path in default_dirs_to_remove:
            watch = self.watched_dirs.pop(dir_path, None)
            if watch:
                self.observer.unschedule(watch)
                logger.critical(
                    "code_sync_debug watcher_remove_default category=%s dir=%s",
                    callbackCategory,
                    self._resolve_watch_dir(dir_path),
                )

        polling_dirs_to_remove = current_polling_dirs - desired_polling_dirs
        for dir_path in polling_dirs_to_remove:
            watch = self.polling_watched_dirs.pop(dir_path, None)
            if watch:
                self.polling_observer.unschedule(watch)
                logger.critical(
                    "code_sync_debug watcher_remove_polling category=%s dir=%s",
                    callbackCategory,
                    self._resolve_watch_dir(dir_path),
                )

        default_dirs_to_add = desired_default_dirs - current_default_dirs
        for dir_path in default_dirs_to_add:
            abs_dir_path = self._resolve_watch_dir(dir_path)
            watch = self.observer.schedule(
                self.handler, str(abs_dir_path), recursive=True
            )
            self.watched_dirs[dir_path] = watch
            logger.critical(
                "code_sync_debug watcher_add_default category=%s dir=%s",
                callbackCategory,
                abs_dir_path,
            )

        polling_dirs_to_add = desired_polling_dirs - current_polling_dirs
        for dir_path in polling_dirs_to_add:
            abs_dir_path = self._resolve_watch_dir(dir_path)
            watch = self.polling_observer.schedule(
                self.handler, str(abs_dir_path), recursive=True
            )
            self.polling_watched_dirs[dir_path] = watch
            logger.critical(
                "code_sync_debug watcher_add_polling category=%s dir=%s",
                callbackCategory,
                abs_dir_path,
            )

        logger.critical(
            "code_sync_debug watcher_final_dirs category=%s final_default=%s final_polling=%s",
            callbackCategory,
            [str(d) for d in self.watched_dirs.keys()],
            [str(d) for d in self.polling_watched_dirs.keys()],
        )

        # Fire immediate reads if requested (only for new files)
        for f in fire_immediately:
            if f in callbacks:
                self.request_read(f)

    def start(self):
        self.observer.start()
        self.polling_observer.start()

    def stop(self):
        self.observer.stop()
        self.observer.join()
        self.polling_observer.stop()
        self.polling_observer.join()

    def _resolve_watch_dir(self, dir_path: Path) -> Path:
        if dir_path.is_absolute():
            return dir_path
        return (self._repo_root / dir_path).resolve()

    def _should_use_polling(self, abs_dir_path: Path) -> bool:
        try:
            abs_dir_path.relative_to(self._setta_files_root)
            return False
        except ValueError:
            return True


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
        self._send_event(event, FileEventType.moved)

    def _send_event(
        self,
        event: FileSystemEvent | MockFileEvent,
        event_type: FileEventType,
    ):
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
            logger.critical(
                "code_sync_debug watcher_event_no_handlers path=%s abs_path=%s dest=%s event=%s",
                rel_path,
                abs_path,
                dest_rel_path,
                event_type,
            )
            return

        logger.critical(
            "code_sync_debug watcher_event_dispatch path=%s abs_path=%s dest=%s event=%s handlers=%s",
            rel_path,
            abs_path,
            dest_rel_path,
            event_type,
            len(handlers),
        )

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
