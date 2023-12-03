import json

from .db.projects.save import save_project_details
from .db.settings.save import save_settings
from .db.uiTypes.save import save_ui_types
from .utils.utils import get_absolute_path


def seed_base_ui_types():
    with open(get_absolute_path(__file__, "seedData/BaseUITypes.json"), "r") as f:
        data = json.load(f)
    save_ui_types(data)


def seed_projects():
    with open(
        get_absolute_path(__file__, "seedData/exampleProjects/diffusionDrops.json"), "r"
    ) as f:
        data = json.load(f)
    save_project_details(data)


def seed_settings():
    with open(get_absolute_path(__file__, "seedData/Settings.json"), "r") as f:
        data = json.load(f)
    save_settings(data)


def seed(include_projects):
    seed_base_ui_types()
    if include_projects:
        seed_projects()
    seed_settings()
