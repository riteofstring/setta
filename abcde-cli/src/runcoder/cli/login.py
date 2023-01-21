import sys

import click
from ..backend.login import login as _login

def login(username, password):
    r = _login(username, password)
    failed = r.status_code != 200
    if failed:
        click.echo("Incorrect username/password combination\n")
        sys.exit()
    else:
        click.echo("Login success")
    return r.cookies.get_dict()["connect.sid"]
