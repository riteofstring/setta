import sys

import click
import requests

BACKEND = "http://localhost:8000/"
VALID_COMMANDS = ["run"]


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
        c = click.prompt("Enter command", type=str)
        c = c.strip()
        c = c.strip().split()
        if (c[0]) != "runcoder":
            click.echo("Command must start with 'runcoder'")
        if c[1] == "run":
            if len(c) != 3:
                click.echo("The run command takes only one argument")
            _run(access_token, c[2])


@click.command()
@click.argument("code_id")
@click.option("--username", prompt=True)
@click.option("--password", prompt=True, hide_input=True)
def run(code_id, username, password):
    access_token = _login(username, password)
    _run(access_token, code_id)


@click.group()
def cli():
    pass


cli.add_command(run)
cli.add_command(login)
