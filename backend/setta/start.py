import asyncio
import logging
import sys
from pathlib import Path

import click
import uvicorn

from . import __version__
from .logging.config import configure_logging
from .utils.constants import IS_DEV_MODE, C
from .websockets.connect import connect as _connect

CLI_OPEN_BROWSER_DEFAULT = not bool(IS_DEV_MODE)


@click.command()
@click.argument("websocket_id", required=False)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
def connect(websocket_id, host, port):
    C.HOST = host
    C.PORT = port
    asyncio.run(_connect(websocket_id))


@click.command()
def version():
    print(f"setta version {__version__}")


@click.command()
@click.option("--readable", is_flag=True, help="Export in human-readable format")
@click.option(
    "--readable-with-variants",
    is_flag=True,
    help="Export in readable format with variants",
)
def export_db(readable, readable_with_variants):
    if not any([readable, readable_with_variants]):
        readable_with_variants = True

    # TODO


@click.group(
    invoke_without_command=True,
    context_settings=dict(
        ignore_unknown_options=True,
    ),
)
@click.option("--reload", is_flag=True)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
@click.option(
    "--open-browser/--no-open-browser",
    default=CLI_OPEN_BROWSER_DEFAULT,
    help="Open the default browser to http://<host>:<port> (disabled in dev mode)",
)
@click.pass_context
def cli(ctx, reload, host: str, port: int, log_level, open_browser: bool):
    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level)
    if ctx.invoked_subcommand is None:
        print("Starting Setta", flush=True)

        C.HOST = host
        C.PORT = port
        C.OPEN_BROWSER_ON_START = open_browser

        sys.path.append(str(Path(__file__).resolve().parent))

        config = uvicorn.Config(
            "server:app",
            host=host,
            port=port,
            log_level=uvicorn_log_level,
            log_config=None,
            reload=reload,
            timeout_graceful_shutdown=1,
        )
        server = uvicorn.Server(config)

        server.run()


cli.add_command(connect)
cli.add_command(version)
cli.add_command(export_db)
