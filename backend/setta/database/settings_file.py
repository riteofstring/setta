import json
import os

from setta.code_gen.export_selected import get_selected_section_variant
from setta.database.db.projects.utils import (
    remove_json_source_data,
    save_json_source_data,
)
from setta.database.db.sections.load import load_json_sources_into_data_structures
from setta.database.db.sectionVariants.utils import new_section_variant
from setta.utils.constants import CONSTANTS_FOLDER, SEED_FOLDER, USER_SETTINGS
from setta.utils.utils import get_absolute_path


class SettingsFile:
    def __init__(self, settings_path=None):
        self.meta_settings_file = MetaSettingsFile(settings_path)
        if not os.path.exists(self.settings_path):
            self.seed()
        else:
            self.load()

    @property
    def settings_path(self):
        return self.meta_settings_file.settings_path

    def load(self):
        with open(self.settings_path, "r") as f:
            print("loading", self.settings_path)
            x = json.load(f)
            USER_SETTINGS.update(x)
            return x

    def save_settings_project(self, p):
        new_settings = self.meta_settings_file.save(p)
        USER_SETTINGS.update(new_settings)
        return new_settings

    def load_settings_project(self):
        return self.meta_settings_file.load()

    def seed(self):
        with open(get_absolute_path(__file__, SEED_FOLDER / "Settings.json"), "r") as f:
            data = json.load(f)
        with open(self.settings_path, "w") as f:
            json.dump(data, f, indent=2)
        USER_SETTINGS.update(data)


class MetaSettingsFile:
    def __init__(self, settings_path):
        if settings_path and (
            not settings_path.startswith("setta-settings")
            or not settings_path.endswith(".json")
        ):
            raise ValueError(
                f"settings filepath must start with 'setta-settings' and end with '.json'. The provided path is {settings_path}"
            )

        self.meta_settings_path = "setta-meta-settings.json"
        p = None
        if not os.path.exists(self.meta_settings_path):
            p = self.seed()
        if not p:
            p = self.load()

        sectionId = self.get_settings_section_id(p)
        saved_settings_path = get_selected_section_variant(p, sectionId)["name"]
        if settings_path:
            self.update_settings_path(p, sectionId, saved_settings_path, settings_path)
        else:
            self.settings_path = saved_settings_path

    def load(self):
        with open(self.meta_settings_path, "r") as f:
            p = json.load(f)
        load_json_sources_into_data_structures(
            p["sections"], p["codeInfo"], p["codeInfoCols"], p["sectionVariants"]
        )
        return p

    def get_settings_section_id(self, p):
        num_sections = len(p["sections"])
        if num_sections > 1:
            raise ValueError(
                f"The settings project should have only 1 section. Found {num_sections} sections"
            )
        return list(p["sections"].keys())[0]

    def update_settings_path(self, p, sectionId, saved_settings_path, settings_path):
        print("updating settings path", settings_path)
        if saved_settings_path == settings_path:
            self.settings_path = settings_path
            return
        section = p["sections"][sectionId]
        variantId = None
        for v in section["variantIds"]:
            if p["sectionVariants"][v]["name"] == settings_path:
                variantId = v
                break

        if not variantId:
            variant = new_section_variant(name=settings_path)
            variantId = variant["id"]
            codeInfoColId = variant["codeInfoColId"]
            p["sectionVariants"][variantId] = variant
            p["codeInfoCols"][codeInfoColId] = {
                "id": codeInfoColId,
                "children": {None: []},
            }
            section["variantIds"].append(variantId)

        section["variantId"] = variantId
        remove_json_source_data(p, keepCodeInfoThatHaveUITypes=False)
        self.save_raw(p)

    def save(self, p):
        saved_data = save_json_source_data(p)
        remove_json_source_data(p, keepCodeInfoThatHaveUITypes=False)
        p["uiTypes"] = {
            k: v for k, v in p["uiTypes"].items() if v["presetType"] != "BASE"
        }
        self.save_raw(p)
        return saved_data[self.settings_path]

    def save_raw(self, data):
        with open(self.meta_settings_path, "w") as f:
            json.dump(data, f, indent=2)
        self.settings_path = get_selected_section_variant(
            data, self.get_settings_section_id(data)
        )["name"]

    def seed(self):
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "settingsProject.json"), "r"
        ) as f:
            data = json.load(f)
        self.save_raw(data)
        return data
