import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.project_state.settings_project import create_settings_project_state
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import DictSectionImpl
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.project_state.jsonSource.jsonSource import JSONSource

logger = logging.getLogger(__name__)


class SettingsFile:
    def __init__(self, dbe: DBE, websocket_msg_handler: WMHFrontendSender):
        self.dbe = dbe
        self.websocket_msg_handler = websocket_msg_handler
        self._json_source: "JSONSource | None" = None
        self.settings = self.load_settings()

    def attach_json_source(self, json_source: "JSONSource"):
        self._json_source = json_source

    async def save_settings(self, settings: SettingsState):
        logger.debug("Saving settings")
        logger.critical(
            "SettingsFile.save_settings grid_pattern=%s", settings.gui.gridPattern
        )
        paths = self.get_settings_paths()
        to_be_saved: dict[Path, dict] = {}
        for settings_slice, path in paths.items():
            value = getattr(settings, settings_slice)
            if hasattr(value, "model_dump"):
                serialized = value.model_dump()
            else:
                serialized = value
            to_be_saved.setdefault(path, {})[settings_slice] = serialized

        for filename, data in to_be_saved.items():
            existing = self._load_settings_path(filename)
            merged = self._merge_settings_data(existing, data)
            self.dbe.write_json(filename, merged)
            if self._json_source:
                self._json_source.replace_file_data(filename, merged, dirty=False)
        await self.load_and_broadcast_settings()

    def load_settings(self) -> SettingsState:
        logger.debug("Loading settings")
        paths = self.get_settings_paths()
        path_set = set(paths.values())
        contents = {}
        for p in path_set:
            contents[p] = self._load_settings_path(p)
        output = {}
        for settings_slice, path in paths.items():
            output[settings_slice] = contents[path][settings_slice]

        self.settings = SettingsState.model_validate(output)
        return self.settings

    def _load_settings_path(self, path: Path) -> dict:
        if self._json_source:
            cached = self._json_source.get_cached_json(path)
            if cached is not None:
                return cached
        return self.dbe.read_json(path)

    def _merge_settings_data(self, target: dict, updates: dict) -> dict:
        for key, value in updates.items():
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                self._merge_settings_data(target[key], value)
            else:
                target[key] = value
        return target

    async def load_and_broadcast_settings(self):
        self.load_settings()
        logger.critical(
            "SettingsFile.load_and_broadcast_settings grid_pattern=%s",
            self.settings.gui.gridPattern,
        )
        await self.websocket_msg_handler.broadcast_settings(self.settings)

    def get_settings_paths(self):
        settings_slice_to_path: dict[str, Path] = {}
        p = self.load_settings_project()
        for k in SettingsState.model_fields.keys():
            path = self.find_path_for_settings_slice(p, k)
            if not path.exists():
                self.dbe.write_json(path, SettingsState().model_dump())
            settings_slice_to_path[k] = path
        return settings_slice_to_path

    def find_path_for_settings_slice(self, p: ProjectStateSingleConfig, slice: str):
        for sectionId in p.sections.keys():
            impl = get_curr_effective_section_impl_with_type_guard(
                p, sectionId, DictSectionImpl
            )
            if impl.jsonSourceKeys == [slice]:
                variant = get_curr_section_variant(p, sectionId)
                return Path(variant.name)
        return self.dbe.settings

    def load_settings_project(self):
        if not os.path.exists(self.dbe.settings_project):
            self.dbe.write_settings_project(
                create_settings_project_state(self.dbe.settings)
            )
        return self.dbe.read_settings_project()
