import asyncio
import signal
import sys
from pathlib import Path

import click
import uvicorn

from . import __version__
from .cli.connect import connect as _connect
from .database.db_init import maybe_create_tables_and_seed
from .database.db_objs import DBQueue
from .database.db_path import get_default_db_path, get_default_settings_path
from .database.export_db.export_db import export_database
from .database.import_db import import_database
from .utils.constants import C, load_constants, set_constants

load_constants()


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
    dbq = DBQueue(path, True)
    maybe_create_tables_and_seed(dbq, with_examples)


@click.command()
@click.argument("path", default=get_default_db_path(), required=False)
def export_db(path):
    export_database(path)


@click.command()
@click.argument("yaml_path", required=True)
@click.argument("output_path", required=True)
def import_db(yaml_path, output_path):
    import_database(yaml_path, output_path)


@click.group(
    invoke_without_command=True,
    context_settings=dict(
        ignore_unknown_options=True,
    ),
)
@click.option("--reload", is_flag=True)
@click.option("--with_examples", is_flag=True)
@click.option("--db", "-d", type=str, default=get_default_db_path())
@click.option("--settings", "-s", type=str, default=get_default_settings_path())
@click.option("--w", is_flag=True, help="create db if it doesn't exist")
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
@click.pass_context
def cli(ctx, reload, with_examples, db, settings, w, host, port):
    if ctx.invoked_subcommand is None:
        set_constants(
            with_examples=with_examples,
            db_path=db,
            settings_path=settings,
            create_if_not_exists=w,
            host=host,
            port=port,
        )

        sys.path.append(str(Path(__file__).resolve().parent))

        config = uvicorn.Config(
            "server:app",
            host=host,
            port=port,
            log_level="info",
            reload=reload,
        )

        # Create the server
        server = uvicorn.Server(config)

        async def shutdown_server(sig: int):
            """Gracefully shutdown the server"""
            print(f"Received signal {sig}. Starting graceful shutdown...")
            if server:
                # Set should_exit first to stop accepting new connections
                server.should_exit = True
                try:
                    # Give the server time to process pending requests and run cleanup
                    await asyncio.sleep(1)
                    await server.shutdown()
                except Exception as e:
                    print(f"Error during shutdown: {e}")

        # Setup signal handlers
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # Add signal handlers to the event loop
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(
                sig, lambda s=sig: asyncio.create_task(shutdown_server(s, loop))
            )

        # Start the server
        print("Starting uvicorn server...")
        try:
            server.run()
        except Exception as e:
            print(f"Server error: {e}")
        finally:
            loop.close()


cli.add_command(connect)
cli.add_command(version)
cli.add_command(init_db)
cli.add_command(export_db)
cli.add_command(import_db)
