import asyncio
import os
import sys
from pathlib import Path
from pprint import pprint

import click
import uvicorn

from . import __version__
from .cli.connect import connect as _connect
from .cli.run import run as _run
from .database.db_init import maybe_create_tables_and_seed
from .database.db_objs import create_dbs_with_input_as_default
from .database.db_path import create_alias
from .database.db_path import delete_alias as _delete_alias
from .database.db_path import (
    get_db_path_from_config,
    get_default_settings_path,
    load_config,
)
from .database.export_db.export_db import export_database
from .database.import_db import import_database
from .utils.constants import C, load_constants, set_constants

load_constants()


@click.command()
@click.argument("code_id")
def run(code_id):
    _run(code_id)


@click.command()
@click.argument("websocket_id", required=False)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
def connect(websocket_id, host, port):
    set_constants(host=host, port=port)
    asyncio.run(_connect(websocket_id))


@click.command()
def version():
    print(f"setta version {__version__}")


@click.command()
@click.argument(
    "path",
    type=click.Path(file_okay=True, dir_okay=False, writable=True),
    required=True,
)
@click.option("--with_examples", is_flag=True)
def init_db(path, with_examples):
    dbs = create_dbs_with_input_as_default(path, True)
    maybe_create_tables_and_seed(dbs, with_examples)


@click.command()
@click.argument("db", default=C.DEFAULT_DB_ALIAS, required=False)
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
@click.argument("db", default=C.DEFAULT_DB_ALIAS, required=False)
def export_db(db):
    path = get_db_path_from_config(db)
    export_database(path)


@click.command()
@click.argument("yaml_path", required=True)
@click.argument("output_path", required=True)
def import_db(yaml_path, output_path):
    import_database(yaml_path, output_path)


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
@click.option("--with_examples", is_flag=True)
@click.option("--db", "-d", type=str, multiple=True, default=[])
@click.option("--settings", "-s", type=str, default=get_default_settings_path())
@click.option("--w", is_flag=True, help="create dbs it they don't exist")
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
@click.pass_context
def cli(ctx, reload, with_examples, db, settings, w, host, port):
    if ctx.invoked_subcommand is None:
        set_constants(
            with_examples=with_examples,
            db_specs=db,
            settings_path=settings,
            create_if_not_exists=w,
            host=host,
            port=port,
        )

        sys.path.append(str(Path(__file__).resolve().parent))
        uvicorn.run(
            "server:app",
            host=host,
            port=port,
            log_level="info",
            reload=reload,
        )


cli.add_command(run)
cli.add_command(connect)
cli.add_command(version)
cli.add_command(init_db)
cli.add_command(delete_db)
cli.add_command(export_db)
cli.add_command(import_db)
cli.add_command(alias)
cli.add_command(delete_alias)
