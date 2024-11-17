import json
import os

from setta.code_gen.export_selected import get_selected_section_variant
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

    def save(self, settings):
        print("saving settings to", self.settings_path)
        with open(self.settings_path, "w") as f:
            json.dump(settings, f, indent=2)
            USER_SETTINGS.update(settings)

    def seed(self):
        with open(get_absolute_path(__file__, SEED_FOLDER / "Settings.json"), "r") as f:
            data = json.load(f)
        self.save(data)


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
        if not os.path.exists(self.meta_settings_path):
            self.seed()
        if settings_path:
            self.update_settings_path(settings_path)
        else:
            self.settings_path = self.get_saved_variant()["settings_path"]

    def load(self):
        with open(self.meta_settings_path, "r") as f:
            return json.load(f)

    def get_saved_variant(self):
        p = self.load()
        num_sections = len(p["sections"])
        if num_sections > 1:
            raise ValueError(
                f"The settings project should have only 1 section. Found {num_sections} sections"
            )
        sid = list(p["sections"].keys())[0]
        s = p["sections"][sid]
        variant = get_selected_section_variant(p, sid)
        return {
            "settings_path": variant["name"],
            "sections": s,
            "project": p,
            "variant": variant,
        }

    def update_settings_path(self, settings_path):
        print("updating settings path", settings_path)
        data = self.get_saved_variant()
        s = data["sections"]
        p = data["project"]
        variant = data["variant"]
        loaded_settings_path = data["settings_path"]
        if loaded_settings_path == settings_path:
            s["variantId"] = variant["id"]
        else:
            variant = new_section_variant(name=settings_path)
            variantId = variant["id"]
            codeInfoColId = variant["codeInfoColId"]
            p["sectionVariants"][variantId] = variant
            s["variantId"] = variantId
            s["variantIds"].append(variantId)
            p["codeInfoCols"][codeInfoColId] = {
                "id": codeInfoColId,
                "children": {None: []},
            }
        self.save(p)
        self.settings_path = settings_path

    def save(self, data):
        with open(self.meta_settings_path, "w") as f:
            json.dump(data, f, indent=2)

    def seed(self):
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "settingsProject.json"), "r"
        ) as f:
            data = json.load(f)
        self.save(data)
