import asyncio
import shutil
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager, suppress
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
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager import ProjectManager
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.websocket_manager import WebsocketManager

__all__ = [
    "ProjectManagerFixture",
    "SettingsManagerFixture",
    "real_project_manager",
    "real_settings_manager",
]


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
    code_files: CodeFiles
    python_script_sender: WMHPythonScriptSender
    websocket_manager: WebsocketManager
    listener_registry: ListenerRegistry


@dataclass(slots=True)
class ProjectManagerFixture:
    manager: ProjectManager
    setta_root: Path
    code_folder: Path
    artifacts_folder: Path
    dbe: DBE
    settings_file: SettingsFile
    artifacts: Artifacts
    json_source: JSONSource
    code_files: CodeFiles
    python_script_sender: WMHPythonScriptSender
    websocket_manager: WebsocketManager
    listener_registry: ListenerRegistry


@asynccontextmanager
async def real_settings_manager() -> AsyncIterator[SettingsManagerFixture]:
    """Provision a SettingsProjectManager backed by real collaborators.

    SettingsProjectManager can bootstrap a blank temp workspace via SettingsFile.
    For project manager coverage, use ``real_project_manager`` which seeds a
    canonical project bundle.
    """
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
            listener_registry = ListenerRegistry()
            python_script_sender = WMHPythonScriptSender(
                websocket_manager, listener_registry
            )
            dbe = DBE(setta_root)
            settings_file = SettingsFile(dbe, frontend_sender)

            lsps = LSPServers(settings_file.settings.languageServer)
            lsp_writers = LSPWriters(lsps)
            lsp_readers = LSPReaders(lsps, frontend_sender)

            specific_file_watcher = SpecificFileWatcher()
            artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
            code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
            json_source = JSONSource(
                frontend_sender, settings_file, specific_file_watcher, dbe
            )

            manager = SettingsProjectManager(
                lsp_writers,
                frontend_sender,
                python_script_sender,
                settings_file,
                specific_file_watcher,
                dbe,
                artifacts,
                json_source,
                code_files,
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
            stack.push_async_callback(
                _stop_specific_file_watcher, specific_file_watcher
            )

            fixture = SettingsManagerFixture(
                manager=manager,
                setta_root=setta_root,
                code_folder=code_folder,
                artifacts_folder=artifacts_folder,
                dbe=dbe,
                settings_file=settings_file,
                artifacts=artifacts,
                json_source=json_source,
                code_files=code_files,
                python_script_sender=python_script_sender,
                websocket_manager=websocket_manager,
                listener_registry=listener_registry,
            )

            yield fixture


@asynccontextmanager
async def real_project_manager() -> AsyncIterator[ProjectManagerFixture]:
    """Provision a ProjectManager backed by the repo's sample setta_files bundle."""

    sample_root = Path(__file__).resolve().parents[2] / "setta_files"
    if not sample_root.exists():
        raise RuntimeError(
            f"Expected sample setta_files at {sample_root}, but the path was not found."
        )

    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        setta_root = root / "setta_files"
        setta_root.mkdir(parents=True, exist_ok=True)

        code_folder = setta_root / "code"
        artifacts_folder = setta_root / "artifacts"
        backup_folder = setta_root / "backups"

        for path in (code_folder, artifacts_folder, backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        shutil.copytree(sample_root / "code", code_folder, dirs_exist_ok=True)
        for filename in (
            "project.json",
            "setta-settings.json",
            "setta-settings-project.json",
        ):
            shutil.copy2(sample_root / filename, setta_root / filename)

        async with AsyncExitStack() as stack:
            stack.enter_context(patch.object(C, "SETTA_FILES_FOLDER", setta_root))
            stack.enter_context(patch.object(C, "CODE_FOLDER", code_folder))
            stack.enter_context(patch.object(C, "ARTIFACTS_FOLDER", artifacts_folder))
            stack.enter_context(patch.object(C, "DB_BACKUP_FOLDER", backup_folder))

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            listener_registry = ListenerRegistry()
            python_script_sender = WMHPythonScriptSender(
                websocket_manager, listener_registry
            )
            dbe = DBE(setta_root)
            settings_file = SettingsFile(dbe, frontend_sender)

            lsps = LSPServers(settings_file.settings.languageServer)
            lsp_writers = LSPWriters(lsps)
            lsp_readers = LSPReaders(lsps, frontend_sender)

            specific_file_watcher = SpecificFileWatcher()
            artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
            code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
            json_source = JSONSource(
                frontend_sender, settings_file, specific_file_watcher, dbe
            )

            manager = ProjectManager(
                lsp_writers,
                frontend_sender,
                python_script_sender,
                settings_file,
                specific_file_watcher,
                dbe,
                artifacts,
                json_source,
                code_files,
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
            stack.push_async_callback(
                _stop_specific_file_watcher, specific_file_watcher
            )

            fixture = ProjectManagerFixture(
                manager=manager,
                setta_root=setta_root,
                code_folder=code_folder,
                artifacts_folder=artifacts_folder,
                dbe=dbe,
                settings_file=settings_file,
                artifacts=artifacts,
                json_source=json_source,
                code_files=code_files,
                python_script_sender=python_script_sender,
                websocket_manager=websocket_manager,
                listener_registry=listener_registry,
            )

            yield fixture


async def _shutdown_manager(manager: BaseProjectManager) -> None:
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
    process = getattr(lsps.full, "server", None)
    await stop_lsps(lsps, lsp_readers)
    stop_file_watcher(lsp_writers)
    await _close_lsp_process(process)


async def _close_lsp_process(process) -> None:
    if process is None:
        return

    writer = getattr(process, "stdin", None)
    if writer is not None:
        writer.close()
        with suppress(RuntimeError, AttributeError):
            await writer.wait_closed()

    with suppress(ProcessLookupError):
        await process.wait()

    for reader in (
        getattr(process, "stdout", None),
        getattr(process, "stderr", None),
    ):
        if reader is None:
            continue
        with suppress(Exception):
            await reader.read()
