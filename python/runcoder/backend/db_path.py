import json
import os

import click

DEFAULT_DB_FOLDER = os.getcwd()
DEFAULT_DB_NAME = "runcoder.db"
DEFAULT_DB_ALIAS = "default"
CONFIG_FOLDER = click.get_app_dir("runcoder")


class DBPath:
    FOLDER = DEFAULT_DB_FOLDER
    NAME = DEFAULT_DB_NAME


def get_default_db_path():
    return os.path.join(DEFAULT_DB_FOLDER, DEFAULT_DB_NAME)


def get_db_path():
    return os.path.join(DBPath.FOLDER, DBPath.NAME)


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


def validate_path(path):
    foldername, filename = os.path.split(path)
    if not filename.endswith(".db"):
        raise ValueError(f"filename is {filename} but needs to end in .db")
    return foldername, filename


def create_alias(name, path):
    if name == DEFAULT_DB_ALIAS:
        raise ValueError(
            f"Alias cannot be '{DEFAULT_DB_ALIAS}' because that is a reserved name."
        )
    config = load_config()
    validate_path(path)
    config["databases"][name] = path
    save_config(config)


def delete_alias(name):
    config = load_config()
    config["databases"].pop(name, None)
    save_config(config)


def get_db_path_from_config(name):
    if name == DEFAULT_DB_ALIAS:
        return get_default_db_path()
    config = load_config()
    return config["databases"].get(name)


def use_db(name):
    path = get_db_path_from_config(name)
    if path:
        foldername, filename = validate_path(path)
        DBPath.FOLDER = foldername
        DBPath.NAME = filename
    else:
        raise ValueError(f"{name} not found in config file")
