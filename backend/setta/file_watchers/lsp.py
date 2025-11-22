import asyncio
import os
import site
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers.kqueue import KqueueObserver

# Keep this list small and focused; each excluded directory avoids a kqueue watch.
_EXCLUDED_DIR_NAMES = {
    ".cache",
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "node_modules",
    "setta_files",
}


def _should_exclude(path: Path) -> bool:
    return any(part in _EXCLUDED_DIR_NAMES for part in path.parts)


class LSPFileWatcher:
    def __init__(self, notify_callback):
        """
        Initialize the file watcher.

        Args:
            notify_callback: Callback function that sends notifications to the LSP server.
                           Should accept FileSystemEvent as parameter.
        """
        self.observer = KqueueObserver()
        self.watched_paths: set[str] = set()
        self.handler = LSPEventHandler(notify_callback, asyncio.get_event_loop())

    def add_workspace_folder(self, path: str) -> None:
        """
        Add a workspace folder to watch.

        Args:
            path: Path to the workspace folder
        """
        if not os.path.exists(path):
            raise ValueError(f"Path does not exist: {path}")

        absolute_path = os.path.abspath(path)
        self._schedule_with_exclusions(Path(absolute_path))

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

    def _schedule_with_exclusions(self, path: Path) -> None:
        """
        Recursively schedule watchers while skipping excluded directories such as node_modules.
        """
        if _should_exclude(path) or path.is_symlink():
            return

        self._schedule_path(path)
        if not path.is_dir():
            return

        try:
            children = [
                child
                for child in path.iterdir()
                if child.is_dir() and not child.is_symlink() and not _should_exclude(child)
            ]
        except OSError:
            return

        for child in children:
            self._schedule_with_exclusions(child)

    def _schedule_path(self, path: Path) -> None:
        resolved = str(path.resolve())
        if resolved in self.watched_paths:
            return
        self.watched_paths.add(resolved)
        self.observer.schedule(self.handler, resolved, recursive=False)


class LSPEventHandler(FileSystemEventHandler):
    def __init__(self, callback, loop):
        self.callback = callback
        self.loop = loop

    def on_created(self, event: FileSystemEvent):
        if event.is_directory:
            return
        changes = [{"uri": self._path_to_uri(event.src_path), "type": 1}]
        self._send_changes(changes)

    def on_modified(self, event: FileSystemEvent):
        if event.is_directory:
            return
        changes = [{"uri": self._path_to_uri(event.src_path), "type": 2}]
        self._send_changes(changes)

    def on_deleted(self, event: FileSystemEvent):
        if event.is_directory:
            return
        changes = [{"uri": self._path_to_uri(event.src_path), "type": 3}]
        self._send_changes(changes)

    def on_moved(self, event: FileSystemEvent):
        if event.is_directory:
            return
        # Treat move as deletion of the old path and creation of the new path.
        changes_del = [{"uri": self._path_to_uri(event.src_path), "type": 3}]
        changes_cre = [{"uri": self._path_to_uri(event.dest_path), "type": 1}]
        self._send_changes(changes_del)
        self._send_changes(changes_cre)

    def _send_changes(self, changes):
        if asyncio.iscoroutinefunction(self.callback):
            self.loop.call_soon_threadsafe(
                lambda: self.loop.create_task(self.callback(changes))
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
