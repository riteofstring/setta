import logging
import sys
import threading
from pathlib import Path

import click
import psutil
import uvicorn

from . import __version__
from .auth import configure_auth_token, load_auth_token_from_file
from .logging.config import configure_logging
from .remote_connect import (
    DEFAULT_LOCAL_HOST,
    DEFAULT_REMOTE_COMMAND,
    connect_remote_session,
    disconnect_remote_session,
    list_local_metadata,
    read_local_metadata,
)
from .session import (
    bootstrap_session,
    update_session_metadata_when_ready,
)
from .types.routes import Route
from .utils.constants import C, configure_storage_root, configure_workspace_root


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


@click.command(name="remote-connect")
@click.option("--ssh-target", required=True, help="SSH target (user@host)")
@click.option(
    "--session-id",
    default=None,
    help="Reuse a specific session id (auto-generated if omitted)",
)
@click.option(
    "--reuse",
    is_flag=True,
    help="Reuse a remote session if session.json already exists",
)
@click.option(
    "--local-host",
    default=DEFAULT_LOCAL_HOST,
    help="Local bind host for the tunnel",
)
@click.option(
    "--local-port",
    type=int,
    default=None,
    help="Local port for the SSH tunnel (defaults to a free port)",
)
@click.option("--ui-host", default=DEFAULT_LOCAL_HOST, help="Local UI host")
@click.option("--ui-port", default=8001, help="Local UI port")
@click.option(
    "--remote-run-root",
    default=None,
    help="Remote session root (defaults to ~/.setta/run)",
)
@click.option(
    "--remote-workspace-root",
    required=True,
    help="Remote workspace root for the agent session",
)
@click.option(
    "--remote-storage-root",
    default=None,
    help="Remote storage root for setta_files (defaults to session run dir)",
)
@click.option(
    "--local-run-root",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Local session root (defaults to ~/.setta/run)",
)
@click.option(
    "--frontend-root",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Path to local UI frontend assets",
)
@click.option(
    "--remote-command",
    default=DEFAULT_REMOTE_COMMAND,
    help="Remote command used to start the Setta agent",
)
@click.option("--no-uds", is_flag=True, help="Disable UDS and use TCP on the remote")
@click.option(
    "--ssh-option",
    multiple=True,
    help="Extra ssh -o options (repeatable)",
)
@click.option(
    "--ssh-identity",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Path to SSH identity file",
)
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
def remote_connect(
    ssh_target: str,
    session_id: str | None,
    reuse: bool,
    local_host: str,
    local_port: int | None,
    ui_host: str,
    ui_port: int,
    remote_run_root: str | None,
    remote_workspace_root: str,
    remote_storage_root: str | None,
    local_run_root: Path | None,
    frontend_root: Path | None,
    remote_command: str,
    no_uds: bool,
    ssh_option: tuple[str, ...],
    ssh_identity: Path | None,
    log_level: str | None,
) -> None:
    configure_logging(level_override=log_level)
    metadata = connect_remote_session(
        ssh_target=ssh_target,
        ssh_options=list(ssh_option),
        ssh_identity=ssh_identity,
        session_id=session_id,
        remote_run_root=remote_run_root,
        remote_workspace_root=remote_workspace_root,
        remote_storage_root=remote_storage_root,
        local_run_root=local_run_root,
        local_host=local_host,
        local_port=local_port,
        ui_host=ui_host,
        ui_port=ui_port,
        frontend_root=frontend_root,
        remote_command=remote_command,
        no_uds=no_uds,
        reuse_existing=reuse,
        log_level=log_level,
    )
    api_url = f"http://{metadata.local_host}:{metadata.local_port}{Route.PREFIX.value}"
    ui_url = f"http://{metadata.ui_host}:{metadata.ui_port}"
    click.echo(f"Remote session {metadata.session_id} connected.")
    click.echo(f"Local UI: {ui_url}")
    click.echo(f"Local API: {api_url}")


@click.command(name="remote-disconnect")
@click.option("--session-id", required=True, help="Session id to disconnect")
@click.option(
    "--local-run-root",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Local session root (defaults to ~/.setta/run)",
)
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
def remote_disconnect(
    session_id: str,
    local_run_root: Path | None,
    log_level: str | None,
) -> None:
    configure_logging(level_override=log_level)
    metadata = read_local_metadata(session_id=session_id, run_root=local_run_root)
    updated = disconnect_remote_session(
        metadata=metadata,
        local_run_root=local_run_root,
    )
    click.echo(f"Remote session {updated.session_id} disconnected.")


@click.command(name="remote-status")
@click.option(
    "--local-run-root",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Local session root (defaults to ~/.setta/run)",
)
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
def remote_status(
    local_run_root: Path | None,
    log_level: str | None,
) -> None:
    configure_logging(level_override=log_level)
    sessions = list_local_metadata(local_run_root)
    if not sessions:
        click.echo("No local remote sessions found.")
        return
    for session in sessions:
        tunnel_state = "running" if psutil.pid_exists(session.tunnel_pid) else "stopped"
        ui_state = "running" if psutil.pid_exists(session.local_ui_pid) else "stopped"
        ui_url = f"http://{session.ui_host}:{session.ui_port}"
        api_url = (
            f"http://{session.local_host}:{session.local_port}{Route.PREFIX.value}"
        )
        click.echo(
            f"{session.session_id} | {session.status} | ssh {session.ssh_target}"
        )
        click.echo(f"  ui {ui_state} {ui_url}")
        click.echo(f"  tunnel {tunnel_state} {api_url}")


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
    "--workspace-root",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Workspace root for this agent session",
)
@click.option(
    "--storage-root",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Root directory for setta_files storage (defaults to session run dir)",
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
    workspace_root: Path | None,
    storage_root: Path | None,
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
        if workspace_root is None:
            raise click.UsageError("Missing required option: --workspace-root")
        session_bootstrap = bootstrap_session(
            session_id=session_id,
            token_file=token_file,
            uds_path=uds,
            run_root=session_root,
            host=host,
            port=port,
            version=__version__,
            workspace_root=workspace_root,
            storage_root=storage_root,
        )
        configure_workspace_root(session_bootstrap.metadata_base.workspace_root)
        configure_storage_root(session_bootstrap.metadata_base.storage_root)

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
cli.add_command(remote_connect)
cli.add_command(remote_disconnect)
cli.add_command(remote_status)
