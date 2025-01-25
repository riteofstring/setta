from .reader import LanguageServerReader
from .server import LanguageServer
from .writer import LanguageServerWriter


def create_lsps(
    workspace_folder,
    code_folder,
    settings,
):
    return {
        "full": LanguageServer(
            workspace_folder=workspace_folder,
            code_folder=code_folder,
            settings=settings,
        ),
        "basic": LanguageServer(
            workspace_folder=code_folder, code_folder=code_folder, settings={}
        ),
    }


def create_lsp_writers(lsps):
    return {
        k: LanguageServerWriter(v, use_virtual_files=k == "basic")
        for k, v in lsps.items()
    }


def create_lsp_readers(lsps, websocket_manager):
    return {k: LanguageServerReader(v, websocket_manager) for k, v in lsps.items()}


async def start_lsps(lsps, lsp_readers, lsp_writers):
    for k, v in lsps.items():
        await v.start_server()
        await lsp_readers[k].start_listener()
        await lsp_writers[k].send_initialize_request()


async def kill_lsps(lsps, lsp_readers):
    for k, v in lsps.items():
        await lsp_readers[k].stop()  # Wait for reader to finish
        v.kill_server()


async def restart_lsps(lsps, lsp_readers, lsp_writers):
    await kill_lsps(lsps, lsp_readers)
    await start_lsps(lsps, lsp_readers, lsp_writers)
