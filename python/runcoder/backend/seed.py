import glob
import json
import os
from pathlib import Path

from .db.projects.save import save_project_details
from .db.settings.save import save_settings
from .db.uiTypes.save import save_ui_types
from .utils.utils import get_absolute_path

dev_mode = os.environ.get("RUNCODER_DEV_MODE")
seed_folder = Path("../../../seed") if dev_mode else Path("../seed")

def seed_base_ui_types(db):
    with open(get_absolute_path(__file__, seed_folder / "BaseUITypes.json"), "r") as f:
        data = json.load(f)
    save_ui_types(db, data)


def seed_projects(db):
    example_jsons = glob.glob(
        str(get_absolute_path(__file__, seed_folder / "exampleProjects/**/*.json"))
    )
    for filepath in example_jsons:
        with open(filepath, "r") as f:
            data = json.load(f)
        save_project_details(db, data)


def seed_settings(db):
    with open(get_absolute_path(__file__, seed_folder / "Settings.json"), "r") as f:
        data = json.load(f)
    save_settings(db, data)


def seed(db, include_projects):
    seed_base_ui_types(db)
    if include_projects:
        seed_projects(db)
    seed_settings(db)
