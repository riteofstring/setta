import json

from .db.codeInfo.save import save_code_info
from .db.uiTypes.save import save_ui_types
from .schema import create_tables, db
from .utils.utils import get_absolute_path


def seed_code_info():
    with open(get_absolute_path(__file__, "seedData/CodeInfo.json"), "r") as f:
        data = json.load(f)
    save_code_info(data)


def seed_base_ui_types():
    with open(get_absolute_path(__file__, "seedData/BaseUITypes.json"), "r") as f:
        data = json.load(f)
    save_ui_types(data)


if __name__ == "__main__":
    db.delete()
    create_tables()
    seed_code_info()
    seed_base_ui_types()
