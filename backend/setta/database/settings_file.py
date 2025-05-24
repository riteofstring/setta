import json
import logging
import os
from pathlib import Path

from setta.database.db.sections.jsonSource import save_json_source_data
from setta.project_state.project_state import ProjectLoadState, ProjectState
from setta.project_state.settings_state import SettingsState
from setta.utils.constants import CONSTANTS_FOLDER, SETTA_FILES_FOLDER, USER_SETTINGS
from setta.utils.utils import get_absolute_path, save_json_to_file

logger = logging.getLogger(__name__)


class SettingsFile:
    def __init__(self):
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

        USER_SETTINGS.update(settings)

    def load_settings(self):
        logger.debug("Loading settings")
        paths = self.meta_settings_file.get_settings_paths()
        output = {}
        for settings_slice, path in paths.items():
            with open(path, "r") as f:
                output[settings_slice] = json.load(f)[settings_slice]

        SettingsState.model_validate(output)

        USER_SETTINGS.update(output)
        return output

    def load_settings_project(self):
        return self.meta_settings_file.load_settings_project()

    def save_settings_project(self, p):
        self.meta_settings_file.save_settings_project(p)
        return self.load_settings()


class MetaSettingsFile:
    def __init__(self):
        self.path_seed_meta_settings = get_absolute_path(
            __file__, CONSTANTS_FOLDER / "settingsProject.json"
        )
        self.path_default_settings = SETTA_FILES_FOLDER / "setta-settings.json"
        self.path_meta_settings = SETTA_FILES_FOLDER / "setta-meta-settings.json"
        self.load_seed_files()

    def get_settings_paths(self):
        settings_slice_to_path: dict[str, Path] = {}
        p = self.load_meta_settings()
        for k in self.obj_seed_settings.model_fields.keys():
            path = self.find_path_for_settings_slice(p, k)
            if not path:
                path = self.seed_settings(self.path_default_settings)
            elif not os.path.exists(path):
                self.seed_settings(path)
            settings_slice_to_path[k] = path
        return settings_slice_to_path

    def find_path_for_settings_slice(self, p: ProjectState, slice: str):
        for sectionId in p.sections.keys():
            variant = p.get_selected_section_variant(sectionId)
            if not variant:
                continue
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
        p = ProjectLoadState(
            projectState=p, projectConfigId=list(p.projectConfigs.keys())[0]
        )
        return p

    def load_seed_files(self):
        self.obj_seed_settings = SettingsState()
        with open(self.path_seed_meta_settings, "r") as f:
            self.obj_seed_meta_settings = ProjectState.model_validate(json.load(f))

    def save_settings_project(self, p):
        save_json_source_data(p)
        save_json_to_file(self.path_meta_settings, p)
