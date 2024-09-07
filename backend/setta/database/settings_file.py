import json
import os

from setta.utils.constants import SEED_FOLDER
from setta.utils.utils import get_absolute_path


class SettingsFile:
    def __init__(self, settings_path, create_if_not_exists):
        self.settings = None
        self.settings_path = settings_path
        if create_if_not_exists and not os.path.exists(self.settings_path):
            self.seed()
        else:
            self.load()
        

    def load(self):
        with open(self.settings_path, "r") as f:
            self.settings = json.load(f)
            return self.settings

    def save(self, settings):
        with open(self.settings_path, "w") as f:
            json.dump(settings, f, indent=2)
            self.settings = settings

    def seed(self):
        with open(get_absolute_path(__file__, SEED_FOLDER / "Settings.json"), "r") as f:
            data = json.load(f)
        self.save(data)
