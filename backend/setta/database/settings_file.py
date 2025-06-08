import json
import logging
import os
from pathlib import Path

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db.jsonSource.save import save_json_source_data
from setta.project_state.settings_project import create_settings_project_state
from setta.types.helpers import get_selected_section_variant
from setta.types.project_state import (
    ProjectLoadState,
    ProjectSaveState,
    ProjectState,
)
from setta.types.settings_state import SettingsState
from setta.utils.constants import SETTA_FILES_FOLDER
from setta.utils.utils import save_json_to_file

logger = logging.getLogger(__name__)


class SettingsFile:
    def __init__(self):
        self.settings: SettingsState = SettingsState()
        self.meta_settings_file = MetaSettingsFile()
        self.load_settings()

    def save_settings(self, settings):
        logger.debug("Saving settings")
        paths = self.meta_settings_file.get_settings_paths()
        to_be_saved = {}
        for settings_slice, path in paths.items():
            if path not in to_be_saved:
                to_be_saved[path] = {}
            to_be_saved[path].update({settings_slice: settings[settings_slice]})

        for filename, data in to_be_saved.items():
            save_json_to_file(filename, data)

    def load_settings(self):
        logger.debug("Loading settings")
        paths = self.meta_settings_file.get_settings_paths()
        output = {}
        for settings_slice, path in paths.items():
            with open(path, "r") as f:
                output[settings_slice] = json.load(f)[settings_slice]

        self.settings = SettingsState.model_validate(output)
        return self.settings

    def load_settings_project(self):
        return self.meta_settings_file.load_settings_project()

    def save_settings_project(self, p: ProjectSaveState):
        self.meta_settings_file.save_settings_project(p)
        return self.load_settings()


class MetaSettingsFile:
    def __init__(self):
        self.path_default_settings = SETTA_FILES_FOLDER / "setta-settings.json"
        self.path_meta_settings = SETTA_FILES_FOLDER / "setta-meta-settings.json"
        self.obj_seed_settings = SettingsState()
        self.obj_seed_meta_settings = create_settings_project_state(
            str(self.path_default_settings)
        )

    def get_settings_paths(self):
        settings_slice_to_path: dict[str, Path] = {}
        p = self.load_meta_settings()
        for k in SettingsState.model_fields.keys():
            path = self.find_path_for_settings_slice(p, k)
            if not path:
                path = self.seed_settings(self.path_default_settings)
            elif not os.path.exists(path):
                self.seed_settings(path)
            settings_slice_to_path[k] = path
        return settings_slice_to_path

    def find_path_for_settings_slice(self, p: ProjectState, slice: str):
        projectConfigId = list(p.projectConfigs.keys())[0]
        for sectionId in p.sections.keys():
            variant = get_selected_section_variant(p, projectConfigId, sectionId)
            if variant.jsonSourceKeys == [slice]:
                return Path(variant.name)
        return None

    def seed_settings(self, path: Path):
        if not os.path.exists(path):
            save_json_to_file(path, self.obj_seed_settings.model_dump())
        return path

    def seed_meta_settings(self):
        if not os.path.exists(self.path_meta_settings):
            save_json_to_file(
                self.path_meta_settings, self.obj_seed_meta_settings.model_dump()
            )

    def load_meta_settings(self):
        logger.debug("Loading meta settings")
        self.seed_meta_settings()
        with open(self.path_meta_settings, "r") as f:
            return ProjectState.model_validate(json.load(f))

    def load_settings_project(self):
        p = self.load_meta_settings()
        load_json_sources_into_data_structures(p)
        return ProjectLoadState(
            projectState=p, projectConfigId=list(p.projectConfigs.keys())[0]
        )

    def save_settings_project(self, p: ProjectSaveState):
        save_json_source_data(p.projectState)
        save_json_to_file(self.path_meta_settings, p.projectState.model_dump())
