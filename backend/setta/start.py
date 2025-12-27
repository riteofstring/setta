import asyncio
import logging
import os
import sys
import threading
import time
from pathlib import Path

import click
import uvicorn

from . import __version__
from .auth import configure_auth_token, load_auth_token_from_file
from .logging.config import configure_logging
from .session import (
    SessionMetadataBase,
    build_listen_info,
    build_session_metadata,
    current_timestamp,
    ensure_log_file,
    ensure_token_permissions,
    prepare_session_layout,
    resolve_listen_info_from_server,
    write_pid_file,
    write_session_metadata,
)
from .utils.constants import C
from .websockets.connect import connect as _connect

_READY_POLL_INTERVAL_SECONDS = 0.05


def _update_session_metadata_when_ready(
    server: uvicorn.Server,
    session_file: Path,
    metadata_base: SessionMetadataBase,
    fallback_listen: dict[str, str | int],
) -> None:
    while not server.started:
        if server.should_exit:
            return
        time.sleep(_READY_POLL_INTERVAL_SECONDS)
    listen_info = resolve_listen_info_from_server(server) or fallback_listen
    if "host" in listen_info and "port" in listen_info:
        C.HOST = str(listen_info["host"])
        C.PORT = int(listen_info["port"])
    metadata = build_session_metadata(
        metadata_base,
        status="ready",
        listen_info=listen_info,
    )
    write_session_metadata(session_file, metadata)


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

        C.HOST = host
        C.PORT = port
        if session_id is None:
            raise click.UsageError("Missing required option: --session-id")
        if token_file is None:
            raise click.UsageError("Missing required option: --token-file")
        session_layout = prepare_session_layout(
            session_id,
            token_file,
            uds,
            run_root=session_root,
        )
        ensure_token_permissions(session_layout.token_file)
        ensure_log_file(session_layout.log_file)
        pid = os.getpid()
        write_pid_file(session_layout.pid_file, pid)
        started_at = current_timestamp()
        metadata_base = SessionMetadataBase(
            session_id=session_layout.session_id,
            version=__version__,
            pid=pid,
            started_at=started_at,
            token_file=session_layout.token_file,
            log_file=session_layout.log_file,
        )
        listen_info = build_listen_info(host, port, session_layout.uds_path)
        write_session_metadata(
            session_layout.session_file,
            build_session_metadata(
                metadata_base,
                status="starting",
                listen_info=listen_info,
            ),
        )

        resolved_log_level = configure_logging(
            level_override=log_level,
            log_file=str(session_layout.log_file),
            force=True,
        )
        uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()

        configure_auth_token(load_auth_token_from_file(session_layout.token_file))

        sys.path.append(str(Path(__file__).resolve().parent))

        if session_layout.uds_path and session_layout.uds_path.exists():
            session_layout.uds_path.unlink()
        config = uvicorn.Config(
            "server:app",
            host=host,
            port=port,
            uds=str(session_layout.uds_path) if session_layout.uds_path else None,
            log_level=uvicorn_log_level,
            log_config=None,
            reload=reload,
            timeout_graceful_shutdown=1,
        )
        server = uvicorn.Server(config)
        monitor_thread = threading.Thread(
            target=_update_session_metadata_when_ready,
            args=(
                server,
                session_layout.session_file,
                metadata_base,
                listen_info,
            ),
            name="setta-session-metadata",
            daemon=True,
        )
        monitor_thread.start()

        server.run()


cli.add_command(connect)
cli.add_command(version)
cli.add_command(export_db)
