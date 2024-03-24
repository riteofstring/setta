import os
import sys
from pathlib import Path
from pprint import pprint

import click
import uvicorn

from . import __version__
from .backend.db_init import maybe_create_tables_and_seed
from .backend.db_objs import DB
from .backend.db_path import DEFAULT_DB_ALIAS, create_alias
from .backend.db_path import delete_alias as _delete_alias
from .backend.db_path import get_db_path_from_config, load_config
from .backend.environ import set_cli_args
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


@click.command()
def version():
    print(f"runcoder version {__version__}")


@click.command()
@click.argument(
    "path",
    type=click.Path(file_okay=True, dir_okay=False, writable=True),
    required=True,
)
@click.option("--with_example_projects", is_flag=True)
def init_db(path, with_example_projects):
    db = DB(path)
    db.connect()
    with db:
        maybe_create_tables_and_seed(db, with_example_projects)
    db.disconnect()


@click.command()
@click.argument("db", default=DEFAULT_DB_ALIAS, required=False)
def delete_db(db):
    path = get_db_path_from_config(db)
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
@click.option("--w", is_flag=True, help="create dbs it they don't exist")
@click.option("--info", is_flag=True)
def alias(name, path, w, info):
    if name and path:
        create_alias(name, path, w)
    if info or not (name and path):
        config = load_config()
        print("Aliases:")
        pprint(config["databases"])


@click.command()
@click.argument("name", type=str)
def delete_alias(name):
    _delete_alias(name)


@click.group(
    invoke_without_command=True,
    context_settings=dict(
        ignore_unknown_options=True,
    ),
)
@click.option("--reload", is_flag=True)
@click.option("--with_example_projects", is_flag=True)
@click.option("--db", "-d", type=str, multiple=True, default=[])
@click.option("--i", type=str, default=None, help="interactive program path")
@click.option("--w", is_flag=True, help="create dbs it they don't exist")
@click.pass_context
def cli(ctx, reload, with_example_projects, db, i, w):
    if ctx.invoked_subcommand in [
        "version",
        "init-db",
        "delete-db",
        "alias",
        "delete-alias",
    ]:
        return
    if ctx.invoked_subcommand is None:
        set_cli_args(
            with_example_projects=with_example_projects,
            db_specs=db,
            i_path=i,
            create_if_not_exists=w,
        )

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
cli.add_command(init_db)
cli.add_command(delete_db)
cli.add_command(alias)
cli.add_command(delete_alias)
