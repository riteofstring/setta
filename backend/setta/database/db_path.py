import json
import os

import click

from setta.utils.constants import C

DEFAULT_DB_FOLDER = os.getcwd()
DEFAULT_DB_NAME = "setta.db"
DEFAULT_SETTINGS_NAME = "setta-settings.json"
CONFIG_FOLDER = click.get_app_dir("setta")


def get_default_db_path():
    return os.path.join(DEFAULT_DB_FOLDER, DEFAULT_DB_NAME)


def get_default_settings_path():
    return os.path.join(DEFAULT_DB_FOLDER, DEFAULT_SETTINGS_NAME)


def get_config_path():
    return os.path.join(CONFIG_FOLDER, "config.json")


def load_config():
    config_path = get_config_path()
    if os.path.exists(config_path):
        with open(config_path, "r") as file:
            config = json.load(file)
    else:
        config = {"databases": {}}
        save_config(config)
    return config


def save_config(config):
    os.makedirs(CONFIG_FOLDER, exist_ok=True)
    config_path = get_config_path()
    with open(config_path, "w") as file:
        json.dump(config, file, indent=4)


def validate_path(path, create_if_not_exists):
    _, filename = os.path.split(path)
    if not filename.endswith(".db"):
        raise ValueError(f"filename is {filename} but needs to end in .db")
    if not create_if_not_exists and not os.path.exists(path):
        raise FileNotFoundError(f"{path} not found")


def create_alias(name, path, create_if_not_exists):
    config = load_config()
    validate_path(path, create_if_not_exists)
    config["databases"][name] = path
    save_config(config)


def delete_alias(name):
    config = load_config()
    config["databases"].pop(name, None)
    save_config(config)


def get_db_path_from_config(name):
    config = load_config()
    if name == C.DEFAULT_DB_ALIAS and name not in config["databases"]:
        return get_default_db_path()
    return config["databases"].get(name)
