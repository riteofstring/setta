import asyncio
import logging
import sys
from pathlib import Path

import click
import uvicorn

from . import __version__
from .auth import configure_auth_token, load_auth_token_from_file
from .logging.config import configure_logging
from .utils.constants import C
from .websockets.connect import connect as _connect


@click.command()
@click.argument("websocket_id", required=False)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
@click.option(
    "--token-file",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    required=True,
    help="Path to the auth token file",
)
def connect(websocket_id, host, port, token_file: Path):
    C.HOST = host
    C.PORT = port
    token = load_auth_token_from_file(token_file)
    asyncio.run(_connect(websocket_id, token))


@click.command()
def version():
    click.echo(f"setta version {__version__}")


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
    "--token-file",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Path to the auth token file",
)
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
@click.pass_context
def cli(ctx, reload, host: str, port: int, token_file: Path | None, log_level):
    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()
    if ctx.invoked_subcommand is None:
        logging.getLogger(__name__).info("Starting Setta")

        C.HOST = host
        C.PORT = port
        if token_file is None:
            raise click.UsageError("Missing required option: --token-file")
        configure_auth_token(load_auth_token_from_file(token_file))

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
