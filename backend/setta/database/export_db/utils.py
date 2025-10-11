from collections import defaultdict

import yaml
from yaml.representer import Representer

from setta.utils.constants import C
from setta.utils.utils import normalize_path


def get_configs_and_root_folder(db, filename):
    # export defaultdict the same way as dict
    yaml.add_representer(defaultdict, Representer.represent_dict)
    configs = load_full_project(db, do_load_json_sources=False)
    root_folder = normalize_path(C.SETTA_FILES_FOLDER) / f"{filename}_export"
    return configs, root_folder
