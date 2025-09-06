import logging
from typing import Iterable

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db.jsonSource.save import save_json_source_data
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import (
    SaveAsExistingProjectConfigRequest,
    SaveAsNewProjectConfigRequest,
)
from setta.types.helpers_lvl2 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_state import ProjectStateBackend
from setta.utils.utils import save_json_to_file

logger = logging.getLogger(__name__)


class SettingsProjectManager(BaseProjectManager):
    def load_initial_state(self):
        logger.debug("Loading settings project")
        p = self.settings_file.seed_settings_project()
        load_json_sources_into_data_structures(self.settings_file.settings, p)
        return merge_single_config_into_backend(ProjectStateBackend(), p)

    def save(self):
        default_id = self.project_state_backend.defaultProjectConfigId
        if not default_id:
            raise ValueError

        p = convert_backend_to_single_config(
            self.project_state_backend,
            default_id,
        )
        save_json_source_data(p)
        save_json_to_file(
            self.settings_file.path_default_settings_project, p.model_dump()
        )

    async def save_as_new_project_config(self, x: SaveAsNewProjectConfigRequest):
        raise ValueError

    def save_as_existing_project_config(self, x: SaveAsExistingProjectConfigRequest):
        raise ValueError

    async def load_json_sources(
        self,
        section_variant_ids: Iterable[str] | None = None,
    ):
        await super().load_json_sources(section_variant_ids)
        await self.settings_file.load_and_broadcast_settings()
