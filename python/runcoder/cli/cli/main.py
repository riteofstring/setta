import click

from .run import run as _run
from .web import web as _web


@click.command()
@click.argument("code_id")
def run(code_id):
    _run(code_id)


@click.command()
@click.argument("websocket_id", required=False)
def web(websocket_id):
    _web(websocket_id)


@click.group()
def cli():
    pass


cli.add_command(run)
cli.add_command(web)
