import asyncio

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    SpecificFileWatcher,
)
from setta.lsp.managers import LSPReaders, LSPServers, LSPWriters, start_lsps
from setta.mcp.chat_manager import ChatManager
from setta.mcp.client import MCPClient
from setta.mcp.server import SettaFastMCP
from setta.project_state.artifacts import Artifacts
from setta.project_state.project_manager import ProjectManager
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.terminals.terminals import Terminals
from setta.utils.constants import SETTA_FILES_FOLDER, C
from setta.websockets.msg_handlers.cli_receiver import WMHCLIReceiver
from setta.websockets.msg_handlers.cli_sender import WMHCLISender
from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_logger_receiver import WMHPythonLoggerReceiver
from setta.websockets.msg_handlers.python_script_receiver import WMHPythonScriptReceiver
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager


class SettaFastAPIState:
    def __init__(self, app):
        self.websocket_manager = WebsocketManager()
        self.wmh_frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.dbe = DBE(SETTA_FILES_FOLDER)
        self.settings_file = SettingsFile(self.dbe, self.wmh_frontend_sender)
        self.lsps = LSPServers(self.settings_file.settings.languageServer)
        self.lsp_writers = LSPWriters(self.lsps)
        self.script_metadata = ScriptMetadata()

        self.wmh_cli_sender = WMHCLISender(self.websocket_manager)
        self.specific_file_watcher = SpecificFileWatcher()
        project_manager = ProjectManager(
            self.lsp_writers,
            self.wmh_frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )
        settings_project_manager = SettingsProjectManager(
            self.lsp_writers,
            self.wmh_frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )
        self.project_manager_switcher = ProjectManagerSwitcher(
            project_manager, settings_project_manager
        )
        self.wmh_frontend_receiver = WMHFrontendReceiver(
            self.websocket_manager,
            project_manager,
            self.script_metadata,
        )
        self.wmh_cli_receiver = WMHCLIReceiver(self.websocket_manager)
        self.wmh_python_script_receiver = WMHPythonScriptReceiver(
            self.websocket_manager, self.script_metadata, project_manager
        )
        self.wmh_python_logger_receiver = WMHPythonLoggerReceiver(
            self.websocket_manager
        )

        self.lsp_readers = LSPReaders(self.lsps, self.wmh_frontend_sender)
        self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)

        self.mcp_server = SettaFastMCP(
            app,
            self,
            "/mcp",
            "Setta MCP Server",
            self.wmh_frontend_sender,
            self.dbe,
        )
        self.mcp_client = MCPClient(
            f"{C.BACKEND}/mcp",
        )
        self.chat_manager = ChatManager(
            self.dbe, self.mcp_client, self.wmh_frontend_sender
        )
        self.artifacts = Artifacts()

        asyncio.create_task(self.mcp_client.connect_to_server())
        asyncio.create_task(start_lsps(self.lsps, self.lsp_readers, self.lsp_writers))
        self.specific_file_watcher.start()
