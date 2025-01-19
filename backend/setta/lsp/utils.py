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
            watch_files=True
        ),
        "basic": LanguageServer(
            workspace_folder=code_folder, code_folder=code_folder, settings={}
        ),
    }


def create_lsp_writers(lsps):
    return {k: LanguageServerWriter(v) for k, v in lsps.items()}


def create_lsp_readers(lsps, websocket_manager):
    return {k: LanguageServerReader(v, websocket_manager) for k, v in lsps.items()}


async def start_lsps(lsps, lsp_readers, lsp_writers):
    for k, v in lsps.items():
        await v.start_server()
        await lsp_readers[k].start_listener()
        await lsp_writers[k].send_initialize_request()


def kill_lsps(lsps, lsp_readers):
    for k, v in lsps.items():
        lsp_readers[k].stop_event.set()
        v.kill_server()


async def restart_lsps(lsps, lsp_readers, lsp_writers):
    kill_lsps(lsps, lsp_readers)
    await start_lsps(lsps, lsp_readers, lsp_writers)
