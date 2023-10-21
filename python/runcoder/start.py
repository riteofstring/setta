import sys
from pathlib import Path

import click
import uvicorn

from .backend.db_init import maybe_create_tables_and_seed
from .cli.run import run as _run
from .cli.web import web as _web


@click.command()
@click.argument("code_id")
def run(code_id):
    _run(code_id)


@click.command()
@click.argument("websocket_id", required=False)
def web(websocket_id):
    _web(websocket_id)


@click.group(invoke_without_command=True)
@click.option("--reload", is_flag=True)
@click.option("--with_example_projects", is_flag=True)
@click.pass_context
def cli(ctx, reload, with_example_projects):
    if ctx.invoked_subcommand is None:
        maybe_create_tables_and_seed(with_example_projects)
        sys.path.append(str(Path(__file__).resolve().parent))
        uvicorn.run(
            "backend.server:app",
            host="0.0.0.0",
            port=8000,
            log_level="info",
            reload=reload,
        )


cli.add_command(run)
cli.add_command(web)
