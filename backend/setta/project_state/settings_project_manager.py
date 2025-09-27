import logging
from pathlib import Path
from typing import Any, Iterable

from setta.database.db.jsonSource.save import (
    remove_json_source_values,
    save_json_source_data,
)
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import (
    SaveAsExistingProjectConfigRequest,
    SaveAsNewProjectConfigRequest,
)
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

    async def save_as_new_project_config(self, x: SaveAsNewProjectConfigRequest):
        raise ValueError

    def save_as_existing_project_config(self, x: SaveAsExistingProjectConfigRequest):
        raise ValueError

    async def load_json_sources(
        self,
        json_sources: dict[Path, Any],
        section_variant_ids: Iterable[str] | None = None,
    ):
        await super().load_json_sources(json_sources, section_variant_ids)
        await self.settings_file.load_and_broadcast_settings()
