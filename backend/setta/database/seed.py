import glob
import json

from setta.utils.constants import CONSTANTS_FOLDER, SEED_FOLDER
from setta.utils.utils import get_absolute_path

from .db.projects.save import save_project_details
from .db.uiTypes.save import save_ui_types


def load_base_ui_types():
    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "BaseUITypes.json"), "r"
    ) as f:
        return json.load(f)


def seed_base_ui_types(dbs):
    data = load_base_ui_types()
    save_ui_types(dbs, data)


def seed_examples(dbs):
    example_jsons = glob.glob(
        str(get_absolute_path(__file__, SEED_FOLDER / "examples/**/*.json"))
    )
    for filepath in example_jsons:
        with open(filepath, "r") as f:
            data = json.load(f)
        save_project_details(dbs, data)


def seed(dbs, with_examples=False, with_base_ui_types=False):
    if with_base_ui_types:
        seed_base_ui_types(dbs)
    if with_examples:
        seed_examples(dbs)
