import json
import os

from setta.database.db.projects.utils import (
    add_defaults_to_project,
    filter_data_for_json_export,
)
from setta.database.db.sections.jsonSource import (
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

        curr_variant, setting_sections = self.get_selected_section_variant(p)
        saved_settings_path = curr_variant["name"]
        if settings_path:
            self.update_settings_path(
                p, setting_sections, saved_settings_path, settings_path
            )
        else:
            self.settings_path = saved_settings_path

    def load(self):
        with open(self.meta_settings_path, "r") as f:
            p = json.load(f)
        add_defaults_to_project(p)
        load_json_sources_into_data_structures(
            p["sections"], p["codeInfo"], p["codeInfoCols"], p["sectionVariants"]
        )
        return p

    def get_selected_section_variant(self, p):
        variantIds = set()
        setting_sections = []
        for s in p["sections"].values():
            if s["jsonSource"].startswith("setta-settings"):
                setting_sections.append(s)
                variantIds.add(s["variantId"])

        if len(variantIds) != 1:
            raise ValueError(
                "The settings sections are not all referring to the same file."
            )

        return p["sectionVariants"][list(variantIds)[0]], setting_sections

    def update_settings_path(
        self, p, setting_sections, saved_settings_path, settings_path
    ):
        print("updating settings path", settings_path)
        if saved_settings_path == settings_path:
            self.settings_path = settings_path
            return
        variantId = None
        for section in setting_sections:
            for v in section["variantIds"]:
                if p["sectionVariants"][v]["name"] == settings_path:
                    variantId = v
                    break
            if variantId:
                break

        if not variantId:
            variantId, variant = new_section_variant(name=settings_path)
            p["sectionVariants"][variantId] = variant
            for section in setting_sections:
                section["variantId"] = variantId
                section["variantIds"].append(variantId)
        else:
            for section in setting_sections:
                section["variantId"] = variantId
        remove_json_source_data(p, keepCodeInfoThatHaveUITypes=False)
        self.save_raw(p)

    def save(self, p):
        saved_data = save_json_source_data(p)
        remove_json_source_data(p, keepCodeInfoThatHaveUITypes=False)
        # TODO: make this less horrible
        p["uiTypes"] = {
            k: v for k, v in p["uiTypes"].items() if v["presetType"] != "BASE"
        }
        filter_data_for_json_export(p)
        self.save_raw(p)
        return saved_data[self.settings_path]

    def save_raw(self, data):
        with open(self.meta_settings_path, "w") as f:
            json.dump(data, f, indent=2)
        curr_variant, _ = self.get_selected_section_variant(data)
        self.settings_path = curr_variant["name"]

    def seed(self):
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "settingsProject.json"), "r"
        ) as f:
            data = json.load(f)
        self.save_raw(data)
        return data
