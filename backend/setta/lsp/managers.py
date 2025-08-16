import asyncio

from setta.types.notifications import SettaNotification
from setta.utils.constants import CWD
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from ..file_watchers.lsp import LSPFileWatcher
from .reader import LanguageServerReader
from .server import LanguageServer
from .writer import LanguageServerWriter


class LSPServers:
    def __init__(self, settings):
        self.full = LanguageServer(
            workspace_folder=CWD,
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


class LSPReaders:
    def __init__(self, servers, websocket_msg_handler: WMHFrontendSender):
        def initialization_callback():
            content = SettaNotification(
                message="Language Server Started",
            )
            asyncio.create_task(websocket_msg_handler.broadcast_notification(content))

        self.full = LanguageServerReader(servers.full, initialization_callback)

    async def start(self):
        await self.full.start()

    async def stop(self):
        await self.full.stop()


async def start_lsps(lsps, lsp_readers, lsp_writers):
    await lsps.start()
    await lsp_readers.start()
    await lsp_writers.start()


async def stop_lsps(lsps, lsp_readers):
    await lsp_readers.stop()
    lsps.stop()


def stop_file_watcher(lsp_writers):
    lsp_writers.file_watcher.stop()


async def restart_lsps(lsps, lsp_readers, lsp_writers):
    await stop_lsps(lsps, lsp_readers)
    await start_lsps(lsps, lsp_readers, lsp_writers)
