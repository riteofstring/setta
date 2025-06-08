import asyncio
from pathlib import Path

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.project_manager import ProjectManager
from setta.types.simplified_states import SimplifiedSectionCreation
from setta.websockets.websocket_manager import WebsocketManager


async def main():
    lsp_servers = LSPServers({})
    lsp_writers = LSPWriters(lsp_servers)
    websocket_manager = WebsocketManager()
    settings_file = SettingsFile()
    dbe = DBE(Path("setta_files/setta.db"))
    pm = ProjectManager(lsp_writers, websocket_manager, settings_file, dbe)
    print(pm.project_state.projectConfigs)
    await pm.create_sections(
        "2cd25ec7-18ea-455e-ad28-5ba67aef5f3b", [SimplifiedSectionCreation(name="dog")]
    )


asyncio.run(main())
