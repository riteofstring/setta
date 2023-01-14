import sys

import click
import requests

from .utils.constants import BACKEND


def _login(username, password):
    r = requests.post(
        f"{BACKEND}auth/login",
        json={"username": username, "password": password},
    )
    failed = r.status_code != 200
    if failed:
        click.echo("Incorrect username/password combination\n")
        sys.exit()
    else:
        click.echo("Login success")
    return r.cookies.get_dict()["connect.sid"]
