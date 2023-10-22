import sys

import click
import keyring

from ..backend.login import login as _login
from ..utils.constants import KEYRING_NAME
from .configure import read_config_file


def login(username, password):
    failed, token = _login(username, password)
    if failed:
        click.echo("Incorrect username/password combination\n")
        sys.exit()
    else:
        click.echo("Login success")
    return token


def try_reading_access_token():
    username = read_config_file()["username"]
    access_token = keyring.get_password(KEYRING_NAME, username)
    if not access_token:
        click.echo("access_token not found")
    return access_token
