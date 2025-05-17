from setta.utils.constants import CWD, USER_SETTINGS

from .file_watcher import LSPFileWatcher
from .reader import LanguageServerReader
from .server import LanguageServer
from .writer import LanguageServerWriter


class LSPServers:
    def __init__(self):
        self.full = LanguageServer(
            workspace_folder=CWD,
            settings=USER_SETTINGS["languageServer"],
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


class LSPReaders:
    def __init__(self, servers):
        self.full = LanguageServerReader(servers.full)

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
