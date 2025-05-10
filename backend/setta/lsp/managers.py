from setta.utils.constants import CODE_FOLDER, CWD, USER_SETTINGS

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
        self.basic = LanguageServer(
            workspace_folder=CODE_FOLDER / "temp_folder_basic",
            settings={},
            name="basic",
        )

    async def start(self):
        await self.full.start()
        await self.basic.start()

    def stop(self):
        self.full.stop()
        self.basic.stop()


class LSPWriters:
    def __init__(self, servers):
        self.full = LanguageServerWriter(servers.full, use_virtual_files=False)
        self.basic = LanguageServerWriter(servers.basic, use_virtual_files=True)

        self.file_watcher = LSPFileWatcher(self.full.send_did_change_watched_files)
        self.file_watcher.add_workspace_folder(self.full.workspace_folder)

    async def start(self):
        await self.full.start()
        await self.basic.start()


class LSPReaders:
    def __init__(self, servers):
        self.full = LanguageServerReader(servers.full)
        self.basic = LanguageServerReader(servers.basic)

    async def start(self):
        await self.full.start()
        await self.basic.start()

    async def stop(self):
        await self.full.stop()
        await self.basic.stop()


async def start_lsps(lsps, lsp_readers, lsp_writers):
    await lsps.start()
    await lsp_readers.start()
    await lsp_writers.start()


async def stop_lsps(lsps, lsp_readers):
    await lsp_readers.stop()
    lsps.stop()
