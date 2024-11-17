import json
import os

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
        with open(self.settings_path, "w") as f:
            json.dump(settings, f, indent=2)
            USER_SETTINGS.update(settings)

    def seed(self):
        with open(get_absolute_path(__file__, SEED_FOLDER / "Settings.json"), "r") as f:
            data = json.load(f)
        self.save(data)


class MetaSettingsFile:
    def __init__(self, settings_path):
        settings_path_provided = bool(settings_path)
        if not settings_path:
            settings_path = "setta-settings.json"

        if not settings_path.startswith("setta-settings") or not settings_path.endswith(
            ".json"
        ):
            raise ValueError(
                f"settings filepath must start with 'setta-settings' and end with '.json'. The provided path is {settings_path}"
            )

        self.settings_path = settings_path
        self.meta_settings_path = "setta-meta-settings.json"

        if not os.path.exists(self.meta_settings_path):
            self.seed()
        elif settings_path_provided:
            self.update_settings_path(self.settings_path)

    def load(self):
        with open(self.meta_settings_path, "r") as f:
            x = json.load(f)
            return x

    def load_settings_project(self):
        return self.load()["settingsProject"]

    def load_settings_path(self):
        return self.load()["settingsPath"]

    def update_settings_path(self, settings_path):
        print("updating settings path")
        data = self.load()
        data["settingsPath"] = settings_path
        self.save(data)
        self.settings_path = settings_path

    def save(self, settings):
        with open(self.meta_settings_path, "w") as f:
            json.dump(settings, f, indent=2)

    def seed(self):
        with open(
            get_absolute_path(__file__, CONSTANTS_FOLDER / "settingsProject.json"), "r"
        ) as f:
            data = json.load(f)
        self.save({"settingsProject": data, "settingsPath": self.settings_path})
