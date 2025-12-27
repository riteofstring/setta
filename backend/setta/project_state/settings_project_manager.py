import logging
from pathlib import Path
from typing import Any

from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.jsonSource.load import (
    load_json_sources_into_data_structures,
)
from setta.project_state.jsonSource.save import (
    remove_json_source_values,
    save_json_source_data,
)
from setta.project_state.project_manager_types import SaveAsNewProjectConfigRequest
from setta.project_state.settings_project import apply_settings_display_names
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_state import ProjectStateBackend

logger = logging.getLogger(__name__)


class SettingsProjectManager(BaseProjectManager):
    def load_initial_state(self):
        logger.debug("Loading settings project")
        p = self.settings_file.load_settings_project()
        return merge_single_config_into_backend(ProjectStateBackend(), p)

    def save(self):
        self._flush_code_files_for_all_configs()
        default_id = self.project_state_backend.defaultProjectConfigId
        if not default_id:
            raise ValueError

        p = convert_backend_to_single_config(
            self.project_state_backend,
            default_id,
        )
        save_json_source_data(self.dbe, p)
        remove_json_source_values(p)
        self.dbe.write_settings_project(p)
        self.artifacts.save()

    async def save_as_new_project_config(self, _x: SaveAsNewProjectConfigRequest):
        raise ValueError

    async def load_json_sources(
        self,
        json_sources: dict[Path, Any],
        section_variants_to_load: list[tuple[str, str]],
    ):
        p = self.project_state_backend
        existing_code_obj_ids = set(p.codeObjs.keys())
        load_json_sources_into_data_structures(
            p,
            json_sources,
            section_variants_to_load,
        )
        apply_settings_display_names(p, existing_code_obj_ids=existing_code_obj_ids)

        for config_id in p.projectConfigs.keys():
            single_config = convert_backend_to_single_config(p, config_id)
            await self.update_and_broadcast_project_state(
                single_config, updateFileWatcher=False
            )
        await self.settings_file.load_and_broadcast_settings()
