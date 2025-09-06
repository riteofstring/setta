from setta.database.db.projects.load import load_project_state
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPWriters
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import (
    SaveAsExistingProjectConfigRequest,
    SaveAsNewProjectConfigRequest,
)
from setta.project_state.save_load import save
from setta.types.helpers_lvl2 import (
    copy_project,
    copy_project_config,
    merge_single_config_into_backend,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ProjectManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        settings_file: SettingsFile,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
    ):
        self.dbe = dbe
        super().__init__(
            lsp_writers, websocket_msg_handler, settings_file, specific_file_watcher
        )

    def load_initial_state(self):
        with self.dbe.session as db:
            return load_project_state(db)

    def save(self):
        save(self.settings_file.settings, self.dbe, self.project_state_backend)

    async def save_as_new_project_config(self, x: SaveAsNewProjectConfigRequest):
        if x.withRefs:
            new_project_config = copy_project_config(
                x.project.projectConfig, x.newConfigName, do_create_new_id=True
            )
            self.project_state_backend.projectConfigs[new_project_config.id] = (
                new_project_config
            )
        else:
            new_project_config = copy_project(
                x.project, x.newConfigName, do_create_new_id=True
            )
            self.project_state_backend = merge_single_config_into_backend(
                self.project_state_backend, new_project_config
            )
        self.save()
        await self.broadcast_all_project_metadata()

    def save_as_existing_project_config(self, x: SaveAsExistingProjectConfigRequest):
        pass
