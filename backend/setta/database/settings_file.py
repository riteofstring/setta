import json
import logging
import os
from pathlib import Path

from setta.project_state.settings_project import create_settings_project_state
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers import (
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import DictSectionImpl
from setta.utils.constants import SETTA_FILES_FOLDER
from setta.utils.utils import save_json_to_file
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


class SettingsFile:
    def __init__(self, websocket_msg_handler: WMHFrontendSender):
        self.websocket_msg_handler = websocket_msg_handler
        self.settings = SettingsState()
        self.path_default_settings = SETTA_FILES_FOLDER / "setta-settings.json"
        self.path_default_settings_project = (
            SETTA_FILES_FOLDER / "setta-settings-project.json"
        )
        self.obj_seed_settings = SettingsState()
        self.obj_seed_settings_project = create_settings_project_state(
            self.path_default_settings
        )
        self.project_state = self.obj_seed_settings_project.model_copy()
        self.load_settings()

    async def save_settings(self, settings: SettingsState):
        logger.debug("Saving settings")
        paths = self.get_settings_paths()
        to_be_saved = {}
        for settings_slice, path in paths.items():
            if path not in to_be_saved:
                to_be_saved[path] = {}
            to_be_saved[path].update(
                {settings_slice: getattr(settings, settings_slice)}
            )

        for filename, data in to_be_saved.items():
            save_json_to_file(filename, data)
        await self.load_and_broadcast_settings()

    def load_settings(self):
        logger.debug("Loading settings")
        paths = self.get_settings_paths()
        output = {}
        for settings_slice, path in paths.items():
            with open(path, "r") as f:
                output[settings_slice] = json.load(f)[settings_slice]

        self.settings = SettingsState.model_validate(output)
        return self.settings

    async def load_and_broadcast_settings(self):
        self.load_settings()
        await self.websocket_msg_handler.broadcast_settings(self.settings)

    def get_settings_paths(self):
        settings_slice_to_path: dict[str, Path] = {}
        p = self.seed_settings_project()
        for k in SettingsState.model_fields.keys():
            path = self.find_path_for_settings_slice(p, k)
            if not path:
                path = self.seed_settings(self.path_default_settings)
            elif not os.path.exists(path):
                self.seed_settings(path)
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
        return None

    def seed_settings(self, path: Path):
        if not os.path.exists(path):
            save_json_to_file(path, self.obj_seed_settings.model_dump())
        return path

    def seed_settings_project(self):
        if not os.path.exists(self.path_default_settings_project):
            save_json_to_file(
                self.path_default_settings_project,
                self.obj_seed_settings_project.model_dump(),
            )
        with open(self.path_default_settings_project, "r") as f:
            return ProjectStateSingleConfig.model_validate(json.load(f))
