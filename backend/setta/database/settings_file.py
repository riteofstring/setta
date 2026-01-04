import logging
import os
from pathlib import Path

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

logger = logging.getLogger(__name__)


class SettingsFile:
    def __init__(self, dbe: DBE, websocket_msg_handler: WMHFrontendSender):
        self.dbe = dbe
        self.websocket_msg_handler = websocket_msg_handler
        self.settings = self.load_settings()

    async def save_settings(self, settings: SettingsState):
        logger.debug("Saving settings")
        paths = self.get_settings_paths()
        settings_dump = settings.model_dump(mode="json")
        to_be_saved = {}
        for settings_slice, path in paths.items():
            if path not in to_be_saved:
                to_be_saved[path] = {}
            to_be_saved[path].update({settings_slice: settings_dump[settings_slice]})

        for filename, data in to_be_saved.items():
            self.dbe.write_json(filename, data)
        await self.load_and_broadcast_settings()

    def load_settings(self) -> SettingsState:
        logger.debug("Loading settings")
        paths = self.get_settings_paths()
        path_set = set(paths.values())
        contents = {}
        for p in path_set:
            contents[p] = self.dbe.read_json(p)
        output = {}
        for settings_slice, path in paths.items():
            output[settings_slice] = contents[path][settings_slice]

        self.settings = SettingsState.model_validate(output)
        return self.settings

    async def load_and_broadcast_settings(self):
        self.load_settings()
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
