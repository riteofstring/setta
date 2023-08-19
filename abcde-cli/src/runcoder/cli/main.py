import click
import keyring

from ..utils.constants import KEYRING_NAME
from .configure import setup_config_file
from .login import login as _login
from .login import try_reading_access_token
from .run import run as _run
from .web import web as _web


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
        if c[1] == "web":
            _web(access_token)


@click.command()
@click.option("--username", prompt=True)
@click.option("--password", prompt=True, hide_input=True)
def configure(username, password):
    access_token = _login(username, password)
    setup_config_file(username)
    keyring.set_password(KEYRING_NAME, username, access_token)
    click.echo("Done!")


@click.command()
@click.argument("code_id")
def run(code_id):
    access_token = try_reading_access_token()
    if access_token:
        _run(access_token, code_id)


@click.command()
def web():
    access_token = try_reading_access_token()
    if access_token:
        _web(access_token)


@click.group()
def cli():
    pass


cli.add_command(run)
cli.add_command(login)
cli.add_command(configure)
cli.add_command(web)
