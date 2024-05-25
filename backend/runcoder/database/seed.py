import glob
import json

from runcoder.utils.constants import CONSTANTS_FOLDER, SEED_FOLDER
from runcoder.utils.utils import get_absolute_path

from .db.projects.save import save_project_details
from .db.settings.save import save_settings
from .db.uiTypes.save import save_ui_types


def seed_base_ui_types(dbs):
    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "BaseUITypes.json"), "r"
    ) as f:
        data = json.load(f)
    save_ui_types(dbs, data)


def seed_projects(dbs):
    example_jsons = glob.glob(
        str(get_absolute_path(__file__, SEED_FOLDER / "exampleProjects/**/*.json"))
    )
    for filepath in example_jsons:
        with open(filepath, "r") as f:
            data = json.load(f)
        save_project_details(dbs, data, withPreviewImgColor=True)


def seed_settings(dbs):
    with open(get_absolute_path(__file__, SEED_FOLDER / "Settings.json"), "r") as f:
        data = json.load(f)
    save_settings(dbs, data)


def seed(
    dbs, with_example_projects=False, with_base_ui_types=False, with_settings=False
):
    if with_base_ui_types:
        seed_base_ui_types(dbs)
    if with_example_projects:
        seed_projects(dbs)
    if with_settings:
        seed_settings(dbs)
