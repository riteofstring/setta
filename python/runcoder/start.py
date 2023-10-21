import sys
from pathlib import Path

import click
import uvicorn

from .cli.cli.run import run as _run
from .cli.cli.web import web as _web


@click.command()
@click.argument("code_id")
def run(code_id):
    _run(code_id)


@click.command()
@click.argument("websocket_id", required=False)
def web(websocket_id):
    _web(websocket_id)


@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    if ctx.invoked_subcommand is None:
        sys.path.append(str(Path(__file__).resolve().parent))
        uvicorn.run(
            "backend.server:app",
            host="0.0.0.0",
            port=8000,
            log_level="info",
            reload=True,
        )


cli.add_command(run)
cli.add_command(web)
