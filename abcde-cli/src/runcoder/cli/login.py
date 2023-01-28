import sys

import click

from ..backend.login import login as _login


def login(username, password):
    failed, token = _login(username, password)
    if failed:
        click.echo("Incorrect username/password combination\n")
        sys.exit()
    else:
        click.echo("Login success")
    return token
