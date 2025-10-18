from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack, asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import AsyncIterator
from unittest.mock import patch

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class TestWebsocketManager:
    """In-memory websocket manager that records messages."""

    def __init__(self) -> None:
        self.broadcasts: list[tuple[object, object, object]] = []
        self.sent_messages: list[tuple[object, object]] = []
        self.returned_messages: list[tuple[object, object]] = []

    async def broadcast(self, message, connectionType=None, currentAddress=None):
        self.broadcasts.append((message, connectionType, currentAddress))

    async def send_message(self, message, toWebsocketId):
        self.sent_messages.append((message, toWebsocketId))

    async def return_to_requester(self, message, request_msg_id):
        self.returned_messages.append((message, request_msg_id))

    async def broadcast_connections(self):
        # Tests do not open websocket connections, so nothing to broadcast.
        return None


class TestLanguageServerWriter:
    """Lightweight substitute for LanguageServerWriter."""

    def __init__(self) -> None:
        self.latest_version_numbers: dict[str, int] = {}
        self.diagnostics_response_callbacks: dict[str, object] = {}

    def _uri(self, filepath: Path) -> str:
        return filepath.resolve().as_uri()

    async def send_document_open_request(self, filepath, code, diagnostics_callback=None):
        uri = self._uri(filepath)
        if diagnostics_callback:
            self.diagnostics_response_callbacks[uri] = diagnostics_callback
        self.latest_version_numbers[uri] = self.latest_version_numbers.get(uri, -1) + 1
        return uri

    async def send_document_close_request(self, filepath):
        uri = self._uri(filepath)
        self.latest_version_numbers.pop(uri, None)
        self.diagnostics_response_callbacks.pop(uri, None)

    async def send_document_update(self, filepath, code):
        uri = self._uri(filepath)
        self.latest_version_numbers[uri] = self.latest_version_numbers.get(uri, 0) + 1

    def get_latest_version_number(self, uri: str) -> int | None:
        return self.latest_version_numbers.get(uri)

    def add_diagnostics_response_callback(self, uri: str, callback):
        self.diagnostics_response_callbacks[uri] = callback

    def remove_diagnostics_response_callback(self, uri: str):
        self.diagnostics_response_callbacks.pop(uri, None)

    async def send_autocomplete_request(self, **_kwargs):
        return None

    async def send_signature_help_request(self, **_kwargs):
        return None

    async def send_did_change_watched_files(self, _changes):
        return None

    async def send_and_wait(self, fn_call, _request_id):
        return await fn_call


class TestLSPWriters:
    """Container with the minimal surface area needed by tests."""

    def __init__(self) -> None:
        self.full = TestLanguageServerWriter()


@dataclass(slots=True)
class SettingsManagerTestContext:
    manager: SettingsProjectManager
    dbe: DBE
    settings_file: SettingsFile
    artifacts: Artifacts
    json_source: JSONSource
    websocket_manager: TestWebsocketManager
    websocket_sender: WMHFrontendSender
    lsp_writers: TestLSPWriters
    temp_dir: Path
    code_folder: Path


async def _cancel_task(task: asyncio.Task) -> None:
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


@asynccontextmanager
async def settings_manager() -> AsyncIterator[SettingsManagerTestContext]:
    """Async context manager that provisions a real SettingsProjectManager for tests."""

    with TemporaryDirectory(prefix="setta-manager-") as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        setta_root = temp_dir / "setta_files"
        code_folder = setta_root / "code"
        artifacts_folder = setta_root / "artifacts"
        backups_folder = setta_root / "backups"

        code_folder.mkdir(parents=True, exist_ok=True)
        artifacts_folder.mkdir(parents=True, exist_ok=True)
        backups_folder.mkdir(parents=True, exist_ok=True)

        async with AsyncExitStack() as stack:
            stack.enter_context(patch.object(C, "SETTA_FILES_FOLDER", setta_root))
            stack.enter_context(patch.object(C, "CODE_FOLDER", code_folder))
            stack.enter_context(patch.object(C, "ARTIFACTS_FOLDER", artifacts_folder))
            stack.enter_context(patch.object(C, "DB_BACKUP_FOLDER", backups_folder))

            websocket_manager = TestWebsocketManager()
            websocket_sender = WMHFrontendSender(websocket_manager)
            specific_file_watcher = SpecificFileWatcher()
            dbe_path = temp_dir / "db"
            dbe = DBE(dbe_path)
            settings_file = SettingsFile(dbe, websocket_sender)
            json_source = JSONSource(
                websocket_sender,
                settings_file,
                specific_file_watcher,
                dbe,
            )
            artifacts = Artifacts(
                websocket_sender,
                specific_file_watcher,
                dbe,
            )
            lsp_writers = TestLSPWriters()

            manager = SettingsProjectManager(
                lsp_writers=lsp_writers,
                websocket_msg_handler=websocket_sender,
                settings_file=settings_file,
                specific_file_watcher=specific_file_watcher,
                dbe=dbe,
                artifacts=artifacts,
                json_source=json_source,
            )

            # Let any startup tasks settle before yielding control to tests.
            await asyncio.sleep(0)

            context = SettingsManagerTestContext(
                manager=manager,
                dbe=dbe,
                settings_file=settings_file,
                artifacts=artifacts,
                json_source=json_source,
                websocket_manager=websocket_manager,
                websocket_sender=websocket_sender,
                lsp_writers=lsp_writers,
                temp_dir=temp_dir,
                code_folder=code_folder,
            )

            try:
                yield context
            finally:
                manager.autosave_debouncer.cancel()
                manager.autosave_debouncer.cancel_pending()
                await _cancel_task(manager.queue_task)
                if specific_file_watcher.observer.is_alive():
                    try:
                        specific_file_watcher.stop()
                    except RuntimeError:
                        # Watcher may never have started; ignore shutdown errors.
                        pass


__all__ = [
    "settings_manager",
    "SettingsManagerTestContext",
    "TestLSPWriters",
]
