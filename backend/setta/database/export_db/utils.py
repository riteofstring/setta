import os
from collections import defaultdict
from pathlib import Path

import yaml
from yaml.representer import Representer

from setta.database.db.projects.load import load_full_project
from setta.database.seed import load_base_ui_types


def get_configs_and_root_folder(db, filename):
    # export defaultdict the same way as dict
    yaml.add_representer(defaultdict, Representer.represent_dict)

    configs = load_full_project(db)
    base_ui_types = load_base_ui_types()
    for c in configs:
        c["uiTypes"].update(base_ui_types)

    root_folder = Path(os.getcwd()) / f"{filename}_export"
    return configs, root_folder
