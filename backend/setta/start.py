import logging
import sys
import threading
from pathlib import Path

import click
import uvicorn

from . import __version__
from .auth import configure_auth_token, load_auth_token_from_file
from .logging.config import configure_logging
from .session import (
    bootstrap_session,
    update_session_metadata_when_ready,
)
from .utils.constants import C


@click.command(name="local-ui")
@click.option("--host", default=C.DEFAULT_HOST, help="Local UI host")
@click.option("--port", default=8001, help="Local UI port")
@click.option(
    "--frontend-root",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Path to the built frontend assets",
)
@click.option(
    "--remote-base-url",
    default=None,
    help="Remote agent base URL (including /api)",
)
@click.option(
    "--token",
    default=None,
    help="Auth token for the remote agent",
)
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
def local_ui(
    host: str,
    port: int,
    frontend_root: Path | None,
    remote_base_url: str | None,
    token: str | None,
    log_level,
):
    from .local_ui_server import LocalUIConfig, create_local_ui_app

    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()

    initial_config = None
    if remote_base_url or token:
        if not remote_base_url or not token:
            raise click.UsageError(
                "Both --remote-base-url and --token are required to preconfigure the UI."
            )
        initial_config = LocalUIConfig(apiBaseUrl=remote_base_url, token=token)

    app = create_local_ui_app(
        frontend_root=frontend_root,
        config=initial_config,
    )
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level=uvicorn_log_level,
        log_config=None,
    )
    server = uvicorn.Server(config)
    server.run()


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
    "--session-id",
    default=None,
    help="Session id for this agent run",
)
@click.option(
    "--session-root",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Override the session root (defaults to ~/.setta/run)",
)
@click.option(
    "--uds",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Bind to a Unix domain socket path",
)
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
def cli(
    ctx,
    reload,
    host: str,
    port: int,
    session_id: str | None,
    session_root: Path | None,
    uds: Path | None,
    token_file: Path | None,
    log_level,
):
    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()
    if ctx.invoked_subcommand is None:
        logging.getLogger(__name__).info("Starting Setta")
        if reload:
            raise click.UsageError("--reload is not supported for agent sessions.")

        C.HOST = host
        C.PORT = port
        if session_id is None:
            raise click.UsageError("Missing required option: --session-id")
        if token_file is None:
            raise click.UsageError("Missing required option: --token-file")
        session_bootstrap = bootstrap_session(
            session_id=session_id,
            token_file=token_file,
            uds_path=uds,
            run_root=session_root,
            host=host,
            port=port,
            version=__version__,
        )

        resolved_log_level = configure_logging(
            level_override=log_level,
            log_file=str(session_bootstrap.layout.log_file),
            force=True,
        )
        uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()

        configure_auth_token(
            load_auth_token_from_file(session_bootstrap.layout.token_file)
        )

        sys.path.append(str(Path(__file__).resolve().parent))

        if (
            session_bootstrap.layout.uds_path
            and session_bootstrap.layout.uds_path.exists()
        ):
            session_bootstrap.layout.uds_path.unlink()
        config = uvicorn.Config(
            "server:app",
            host=host,
            port=port,
            uds=(
                str(session_bootstrap.layout.uds_path)
                if session_bootstrap.layout.uds_path
                else None
            ),
            log_level=uvicorn_log_level,
            log_config=None,
            reload=reload,
            timeout_graceful_shutdown=1,
        )
        server = uvicorn.Server(config)
        monitor_thread = threading.Thread(
            target=update_session_metadata_when_ready,
            args=(
                server,
                session_bootstrap.layout.session_file,
                session_bootstrap.metadata_base,
                session_bootstrap.listen_info,
            ),
            name="setta-session-metadata",
            daemon=True,
        )
        monitor_thread.start()

        server.run()


cli.add_command(local_ui)
cli.add_command(version)
cli.add_command(export_db)
