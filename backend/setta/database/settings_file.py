import json
import os

from setta.utils.constants import SEED_FOLDER
from setta.utils.utils import get_absolute_path


class SettingsFile:
    def __init__(self, settings_path, create_if_not_exists):
        self.settings_path = settings_path
        if create_if_not_exists and not os.path.exists(self.settings_path):
            self.seed()

    def load(self):
        with open(self.settings_path, "r") as f:
            return json.load(f)

    def save(self, settings):
        with open(self.settings_path, "w") as f:
            json.dump(settings, f, indent=2)

    def seed(self):
        with open(get_absolute_path(__file__, SEED_FOLDER / "Settings.json"), "r") as f:
            data = json.load(f)
        self.save(data)
