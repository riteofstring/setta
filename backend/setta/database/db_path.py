import os

DEFAULT_DB_FOLDER = os.getcwd()
DEFAULT_DB_NAME = "setta.db"
DEFAULT_SETTINGS_NAME = "setta-settings.json"


def get_default_db_path():
    return os.path.join(DEFAULT_DB_FOLDER, DEFAULT_DB_NAME)


def get_default_settings_path():
    return os.path.join(DEFAULT_DB_FOLDER, DEFAULT_SETTINGS_NAME)
