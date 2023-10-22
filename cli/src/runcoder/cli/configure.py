from pathlib import Path

import yaml

from ..utils.constants import CONFIG_FILENAME, CONFIG_FOLDER


def get_config_path():
    home_config = Path.home() / ".config"
    config_folder_path = home_config / CONFIG_FOLDER
    config_file_path = config_folder_path / CONFIG_FILENAME
    return config_folder_path, config_file_path


def setup_config_file(username):
    config_folder_path, config_file_path = get_config_path()
    config_folder_path.mkdir(parents=True, exist_ok=True)
    to_save = {"username": username}
    with open(config_file_path, "w") as f:
        yaml.dump(to_save, f)


def read_config_file():
    _, config_file_path = get_config_path()
    with open(config_file_path, "r") as f:
        info = yaml.safe_load(f)
    return info
