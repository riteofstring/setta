import click
import keyring

from .constants import KEYRING_NAME
from .fns import _login, _read_config_file, _run, _setup_config_file


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
