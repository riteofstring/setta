import os
import sys
from pathlib import Path
from pprint import pprint

import click
import uvicorn

from runcoder import __version__
from runcoder.backend.db_init import maybe_create_tables_and_seed
from runcoder.backend.db_path import DEFAULT_DB_ALIAS, create_alias
from runcoder.backend.db_path import delete_alias as _delete_alias
from runcoder.backend.db_path import (
    get_db_path_from_config,
    get_default_db_path,
    load_config,
    use_db,
)
from runcoder.cli.run import run as _run
from runcoder.cli.web import web as _web


@click.command()
@click.argument("code_id")
def run(code_id):
    _run(code_id)


@click.command()
@click.argument("websocket_id", required=False)
def web(websocket_id):
    _web(websocket_id)


@click.command()
def version():
    print(f"runcoder version {__version__}")


@click.command()
@click.argument("db", required=False)
def delete_db(db):
    db = db if db else DEFAULT_DB_ALIAS
    path = get_db_path_from_config(db) if db else get_default_db_path()
    if path:
        confirmation = click.confirm(
            f"Are you sure you want to delete the database '{db}' located at {path}?"
        )
    else:
        print(f"No db found with alias '{db}'")
        return
    if confirmation:
        try:
            os.remove(path)
            print(f"Deleted database '{db}' located at {path}")
        except FileNotFoundError:
            print("File not found. No action taken.")
    else:
        print("Operation cancelled.")


@click.command()
@click.argument("name", type=str, required=False)
@click.argument("path", type=click.Path(), required=False)
@click.option("--info", is_flag=True)
def alias(name, path, info):
    if name and path:
        create_alias(name, path)
    if info or not (name and path):
        config = load_config()
        print("Aliases:")
        pprint(config["databases"])


@click.command()
@click.argument("name", type=str)
def delete_alias(name):
    _delete_alias(name)


@click.group(invoke_without_command=True)
@click.option("--reload", is_flag=True)
@click.option("--with_example_projects", is_flag=True)
@click.option("--db", type=str, default=DEFAULT_DB_ALIAS)
@click.option("--i", type=str, default=None)
@click.pass_context
def cli(ctx, reload, with_example_projects, db, i):
    if ctx.invoked_subcommand in ["version", "delete-db", "alias", "delete-alias"]:
        return
    use_db(db)
    maybe_create_tables_and_seed(with_example_projects)
    if ctx.invoked_subcommand is None:
        if db:
            os.environ["RUNCODER_DB_ALIAS"] = db
        if i:
            os.environ["RUNCODER_I_PATH"] = i
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
cli.add_command(version)
cli.add_command(delete_db)
cli.add_command(alias)
cli.add_command(delete_alias)
