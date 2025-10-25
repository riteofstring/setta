from setta.database.backup import maybe_create_backup
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.jsonSource.save import (
    remove_json_source_values,
    save_json_source_data,
)
from setta.project_state.project_manager_types import (
    SaveAsExistingProjectConfigRequest,
    SaveAsNewProjectConfigRequest,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    copy_project,
    copy_project_config,
    merge_single_config_into_backend,
)


class ProjectManager(BaseProjectManager):
    def load_initial_state(self):
        return self.dbe.read_project()

    def save(self):
        p = self.project_state_backend.model_copy(deep=True)
        save_json_source_data(self.dbe, p)
        remove_json_source_values(p)
        maybe_create_backup(
            self.dbe.project,
            self.settings_file.settings.backend.autobackup,
            self.settings_file.settings.backend.autobackupFreq,
            self.settings_file.settings.backend.autobackupKeepLastN,
        )
        self.dbe.write_project(p)
        # maybe_export_database(
        #     db,
        #     dbe.path,
        #     settings.backend.exportDbReadableOnSave,
        #     settings.backend.exportDbReadableWithVariantsOnSave,
        # )
        self.artifacts.save()

    async def save_as_new_project_config(self, x: SaveAsNewProjectConfigRequest):
        project_state = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )
        if x.withRefs:
            new_project_config = copy_project_config(
                project_state.projectConfig, x.newConfigName, do_create_new_id=True
            )
            self.project_state_backend.projectConfigs[new_project_config.id] = (
                new_project_config
            )
        else:
            new_project_config = copy_project(
                project_state, x.newConfigName, do_create_new_id=True
            )
            self.project_state_backend = merge_single_config_into_backend(
                self.project_state_backend, new_project_config
            )
        self.perform_manual_save()
        await self.broadcast_all_project_metadata()

    def save_as_existing_project_config(self, x: SaveAsExistingProjectConfigRequest):
        pass
