import asyncio
import logging
from contextlib import suppress

from setta.logging.tasks import spawn_background_task
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.utils.paths import get_setta_paths
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from ..file_watchers.lsp import LSPFileWatcher
from .reader import LanguageServerReader
from .server import LanguageServer
from .writer import LanguageServerWriter

LSP_SHUTDOWN_TIMEOUT_SECONDS = 3
logger = logging.getLogger(__name__)


class LSPServers:
    def __init__(self, settings, *, workspace_root=None):
        resolved_workspace_root = workspace_root or get_setta_paths().workspace_root
        self.full = LanguageServer(
            workspace_folder=resolved_workspace_root,
            settings=settings,
            name="full",
        )

    async def start(self):
        await self.full.start()

    def stop(self):
        self.full.stop()


class LSPWriters:
    def __init__(self, servers):
        self.full = LanguageServerWriter(servers.full)
        self.file_watcher = LSPFileWatcher(self.full.send_did_change_watched_files)
        self.file_watcher.add_workspace_folder(self.full.workspace_folder)

    async def start(self):
        await self.full.start()
        self.file_watcher.start()


class _NoopFileWatcher:
    def stop(self) -> None:
        return None


class NoopLSPWriters:
    def __init__(self) -> None:
        self.full = None
        self.file_watcher = _NoopFileWatcher()

    async def start(self) -> None:
        return None


class LSPReaders:
    def __init__(self, servers, websocket_msg_handler: WMHFrontendSender):
        server_name = servers.full.name

        def initialization_callback():
            async def broadcast_started() -> None:
                await websocket_msg_handler.log_and_broadcast_backend_log_event(
                    "Language Server Started"
                )
                notification = SettaNotification(
                    message="Language Server Started",
                    type=SettaNotificationType.info,
                )
                await websocket_msg_handler.broadcast_notification(notification)

            spawn_background_task(
                broadcast_started(),
                label="lsp-init-notification",
                extra_values={"lsp_server": server_name},
            )

        self.full = LanguageServerReader(servers.full, initialization_callback)

    async def start(self):
        await self.full.start()

    async def stop(self):
        await self.full.stop()


async def start_lsps(lsps, lsp_readers, lsp_writers):
    await lsps.start()
    await lsp_readers.start()
    await lsp_writers.start()


async def stop_lsps(lsps: LSPServers, lsp_readers: LSPReaders):
    process = getattr(lsps.full, "server", None)
    await lsp_readers.stop()
    lsps.stop()
    if process is None:
        return
    writer = getattr(process, "stdin", None)
    if writer is not None:
        writer.close()
        with suppress(asyncio.TimeoutError, RuntimeError, AttributeError):
            await asyncio.wait_for(
                writer.wait_closed(),
                timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS,
            )
    try:
        await asyncio.wait_for(process.wait(), timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        with suppress(ProcessLookupError):
            process.kill()
        try:
            await asyncio.wait_for(process.wait(), timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, ProcessLookupError):
            logger.warning("Timed out waiting for LSP process to exit after kill.")
    for reader in (getattr(process, "stdout", None), getattr(process, "stderr", None)):
        if reader is None:
            continue
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(
                reader.read(),
                timeout=LSP_SHUTDOWN_TIMEOUT_SECONDS,
            )


def stop_file_watcher(lsp_writers):
    lsp_writers.file_watcher.stop()


async def restart_lsps(lsps, lsp_readers, lsp_writers):
    await stop_lsps(lsps, lsp_readers)
    await start_lsps(lsps, lsp_readers, lsp_writers)
