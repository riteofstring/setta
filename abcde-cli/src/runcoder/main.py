import sys
from pathlib import Path

import click
import keyring
import requests
import yaml

from .constants import BACKEND, CONFIG_FILENAME, CONFIG_FOLDER, KEYRING_NAME


def get_config_path():
    home_config = Path.home() / ".config"
    config_folder_path = home_config / CONFIG_FOLDER
    config_file_path = config_folder_path / CONFIG_FILENAME
    return config_folder_path, config_file_path


def _setup_config_file(username):
    config_folder_path, config_file_path = get_config_path()
    Path(config_folder_path).mkdir(parents=True, exist_ok=True)
    to_save = {"username": username}
    with open(config_file_path, "w") as f:
        yaml.dump(to_save, f)


def _read_config_file():
    _, config_file_path = get_config_path()
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


@click.command()
@click.option("--username", prompt=True)
@click.option("--password", prompt=True, hide_input=True)
def login(username, password):
    access_token = _login(username, password)
    while True:
        c = click.prompt(">", type=str, prompt_suffix="")
        c = c.strip()
        c = c.strip().split()
        if (c[0]) != "runcoder":
            click.echo("Command must start with 'runcoder'")
        if c[1] == "run":
            if len(c) != 3:
                click.echo("The run command takes only one argument")
            _run(access_token, c[2])


@click.command()
@click.option("--username", prompt=True)
@click.option("--password", prompt=True, hide_input=True)
def configure(username, password):
    access_token = _login(username, password)
    _setup_config_file(username)
    keyring.set_password(KEYRING_NAME, username, access_token)
    click.echo("Done!")


@click.command()
@click.argument("code_id")
def run(code_id):
    username = _read_config_file()["username"]
    access_token = keyring.get_password(KEYRING_NAME, username)
    _run(access_token, code_id)


@click.group()
def cli():
    pass


cli.add_command(run)
cli.add_command(login)
cli.add_command(configure)
