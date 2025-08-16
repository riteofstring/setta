from setta.database.db.projects.load import load_project_state
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.lsp.managers import LSPWriters
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.history import History
from setta.project_state.save_load import save
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ProjectManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        settings_file: SettingsFile,
        dbe: DBE,
    ):
        self.dbe = dbe
        super().__init__(lsp_writers, websocket_msg_handler, settings_file)

    def initialize_history(self):
        with self.dbe.session as db:
            return History(
                load_project_state(db),
            )

    def save(self):
        save(self.settings_file.settings, self.dbe, self.project_state_backend)
