import asyncio
import logging
import os
import site
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from setta.logging.tasks import spawn_background_task
from setta.utils.constants import C


def _default_ignore_paths() -> list[Path]:
    return [
        C.RUNTIME_MCP_FOLDER.resolve(),
    ]


logger = logging.getLogger(__name__)


class LSPFileWatcher:
    def __init__(self, notify_callback):
        """
        Initialize the file watcher.

        Args:
            notify_callback: Callback function that sends notifications to the LSP server.
                           Should accept FileSystemEvent as parameter.
        """
        self.observer = Observer()
        self.watched_paths: set[str] = set()
        self.handler = LSPEventHandler(
            notify_callback,
            asyncio.get_event_loop(),
            _default_ignore_paths(),
        )

    def add_workspace_folder(self, path: str) -> None:
        """
        Add a workspace folder to watch.

        Args:
            path: Path to the workspace folder
        """
        if not os.path.exists(path):
            raise ValueError(f"Path does not exist: {path}")

        absolute_path = os.path.abspath(path)
        if absolute_path not in self.watched_paths:
            self.watched_paths.add(absolute_path)
            self.observer.schedule(self.handler, absolute_path, recursive=True)

    def add_python_site_packages(self) -> None:
        """Add Python site-packages directories to watched paths."""
        for path in site.getsitepackages():
            try:
                self.add_workspace_folder(path)
            except ValueError:
                continue  # Skip if path doesn't exist

    def start(self) -> None:
        """Start the file watcher."""
        if not self.observer.is_alive():
            self.observer.start()

    def stop(self) -> None:
        """Stop the file watcher."""
        self.observer.stop()
        self.observer.join()


class LSPEventHandler(FileSystemEventHandler):
    def __init__(self, callback, loop, ignore_paths: list[Path] | None = None):
        self.callback = callback
        self.loop = loop
        self.ignore_paths = [path.resolve() for path in (ignore_paths or [])]

    def _should_ignore(self, path: str | bytes) -> bool:
        if isinstance(path, bytes):
            path = path.decode("utf-8", errors="replace")
        target = Path(path).resolve()
        for ignored_root in self.ignore_paths:
            if target.is_relative_to(ignored_root):
                return True
        return False

    def on_created(self, event: FileSystemEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        logger.debug("lsp_file_watcher event=created path=%s", event.src_path)
        changes = [{"uri": self._path_to_uri(event.src_path), "type": 1}]
        self._send_changes(changes)

    def on_modified(self, event: FileSystemEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        logger.debug("lsp_file_watcher event=modified path=%s", event.src_path)
        changes = [{"uri": self._path_to_uri(event.src_path), "type": 2}]
        self._send_changes(changes)

    def on_deleted(self, event: FileSystemEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return
        logger.debug("lsp_file_watcher event=deleted path=%s", event.src_path)
        changes = [{"uri": self._path_to_uri(event.src_path), "type": 3}]
        self._send_changes(changes)

    def on_moved(self, event: FileSystemEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path) or self._should_ignore(event.dest_path):
            return
        logger.debug(
            "lsp_file_watcher event=moved src=%s dest=%s",
            event.src_path,
            event.dest_path,
        )
        # Treat move as deletion of the old path and creation of the new path.
        changes_del = [{"uri": self._path_to_uri(event.src_path), "type": 3}]
        changes_cre = [{"uri": self._path_to_uri(event.dest_path), "type": 1}]
        self._send_changes(changes_del)
        self._send_changes(changes_cre)

    def _send_changes(self, changes):
        logger.debug(
            "lsp_file_watcher notify change_count=%s changes=%s",
            len(changes),
            changes,
        )
        if asyncio.iscoroutinefunction(self.callback):
            self.loop.call_soon_threadsafe(
                lambda: spawn_background_task(
                    self.callback(changes),
                    loop=self.loop,
                    label="lsp-file-watcher",
                    extra_values={"change_count": len(changes)},
                )
            )
        else:
            self.callback(changes)

    def _path_to_uri(self, path: str | bytes) -> str:
        if isinstance(path, bytes):
            # Try to decode, fall back to error handling
            try:
                path = path.decode("utf-8")
            except UnicodeDecodeError:
                # Handle the error case - maybe skip the file or use a placeholder
                path = path.decode("utf-8", errors="replace")

        return Path(path).as_uri()  # type: ignore
