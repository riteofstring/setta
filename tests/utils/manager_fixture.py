from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import (
    LSPReaders,
    LSPServers,
    LSPWriters,
    start_lsps,
    stop_file_watcher,
    stop_lsps,
)
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


__all__ = ["SettingsManagerFixture", "real_settings_manager"]


@dataclass(slots=True)
class SettingsManagerFixture:
    manager: SettingsProjectManager
    setta_root: Path
    code_folder: Path
    artifacts_folder: Path
    dbe: DBE
    settings_file: SettingsFile
    artifacts: Artifacts
    json_source: JSONSource
    websocket_manager: WebsocketManager


@asynccontextmanager
async def real_settings_manager() -> AsyncIterator[SettingsManagerFixture]:
    """Provision a SettingsProjectManager backed by real collaborators."""
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        setta_root = root / "setta_files"
        code_folder = setta_root / "code"
        artifacts_folder = setta_root / "artifacts"
        backup_folder = setta_root / "backups"

        for path in (code_folder, artifacts_folder, backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        async with AsyncExitStack() as stack:
            stack.enter_context(patch.object(C, "SETTA_FILES_FOLDER", setta_root))
            stack.enter_context(patch.object(C, "CODE_FOLDER", code_folder))
            stack.enter_context(patch.object(C, "ARTIFACTS_FOLDER", artifacts_folder))
            stack.enter_context(patch.object(C, "DB_BACKUP_FOLDER", backup_folder))

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            dbe = DBE(setta_root)
            settings_file = SettingsFile(dbe, frontend_sender)

            lsps = LSPServers(settings_file.settings.languageServer)
            lsp_writers = LSPWriters(lsps)
            lsp_readers = LSPReaders(lsps, frontend_sender)

            specific_file_watcher = SpecificFileWatcher()
            artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
            json_source = JSONSource(
                frontend_sender, settings_file, specific_file_watcher, dbe
            )

            manager = SettingsProjectManager(
                lsp_writers,
                frontend_sender,
                settings_file,
                specific_file_watcher,
                dbe,
                artifacts,
                json_source,
            )

            stack.push_async_callback(_shutdown_manager, manager)
            await manager._process_queue_task_started.wait()

            try:
                await start_lsps(lsps, lsp_readers, lsp_writers)
            except FileNotFoundError as exc:  # pragma: no cover - environment dependent
                raise RuntimeError(
                    "basedpyright-langserver is required for tests; ensure it is on PATH"
                ) from exc

            stack.push_async_callback(
                _stop_lsps_and_file_watcher, lsps, lsp_readers, lsp_writers
            )

            specific_file_watcher.start()
            stack.push_async_callback(_stop_specific_file_watcher, specific_file_watcher)

            fixture = SettingsManagerFixture(
                manager=manager,
                setta_root=setta_root,
                code_folder=code_folder,
                artifacts_folder=artifacts_folder,
                dbe=dbe,
                settings_file=settings_file,
                artifacts=artifacts,
                json_source=json_source,
                websocket_manager=websocket_manager,
            )

            yield fixture


async def _shutdown_manager(manager: SettingsProjectManager) -> None:
    manager.autosave_debouncer.cancel()
    manager.autosave_debouncer.cancel_pending()
    manager.queue_task.cancel()

    while True:
        try:
            coroutine, future, frontend_op_id = manager.message_queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        if not future.done():
            future.cancel()
        manager._finalize_frontend_op(frontend_op_id, success=False)
        manager.message_queue.task_done()

    try:
        await manager.queue_task
    except asyncio.CancelledError:
        pass


async def _stop_specific_file_watcher(watcher: SpecificFileWatcher) -> None:
    try:
        watcher.stop()
    except RuntimeError:
        pass


async def _stop_lsps_and_file_watcher(
    lsps: LSPServers, lsp_readers: LSPReaders, lsp_writers: LSPWriters
) -> None:
    await stop_lsps(lsps, lsp_readers)
    stop_file_watcher(lsp_writers)

