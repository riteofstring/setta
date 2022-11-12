import os
import sys
from pathlib import Path
from subprocess import PIPE, Popen

import click
import requests
import yaml

from .constants import BACKEND, CODE_FOLDER, CONFIG_FILENAME, CONFIG_FOLDER


def _get_config_path():
    home_config = Path.home() / ".config"
    config_folder_path = home_config / CONFIG_FOLDER
    config_file_path = config_folder_path / CONFIG_FILENAME
    return config_folder_path, config_file_path


def _setup_config_file(username):
    config_folder_path, config_file_path = _get_config_path()
    config_folder_path.mkdir(parents=True, exist_ok=True)
    to_save = {"username": username}
    with open(config_file_path, "w") as f:
        yaml.dump(to_save, f)


def _read_config_file():
    _, config_file_path = _get_config_path()
    with open(config_file_path, "r") as f:
        info = yaml.safe_load(f)
    return info


def _login(username, password):
    r = requests.post(
        f"{BACKEND}auth/login",
        data={"username": username, "password": password},
    )
    login_fail = r.status_code != 201
    if login_fail:
        click.echo("Incorrect username/password combination\n")
        sys.exit()
    else:
        click.echo("Login success")
    return r.json()["access_token"]


def _run(access_token, code_id):
    r = requests.post(
        f"{BACKEND}codeGenerator/getCode",
        data={"codeId": code_id},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    click.echo("Received code")
    code = r.json()["code"]

    cwd = os.getcwd()
    code_folder_path = Path(cwd) / CODE_FOLDER
    code_folder_path.mkdir(parents=True, exist_ok=True)

    code_file_path = code_folder_path / f"{code_id}.py"
    with open(code_file_path, "w") as f:
        f.write(code)

    cmd = f'python "{code_file_path}"'
    with Popen(cmd, stdout=PIPE, bufsize=1, universal_newlines=True) as p:
        for line in p.stdout:
            print(line, end="")  # process line here
