import base64
import json
import logging
import os
import shlex
import socket
import sys
from pathlib import Path

import click
import uvicorn

from setta import __version__
from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.logging.config import configure_logging
from setta.sessions import SessionMetadata, SessionRegistry
from setta.types.routes import Route
from setta.utils.constants import C

_CONNECT_INFO_JSON_PREFIX = "__SETTA_JSON_B64__"
_DEFAULT_LOCAL_PORT = 61000


def _select_free_port(host: str) -> int:
    addr_info = socket.getaddrinfo(host, 0, type=socket.SOCK_STREAM)
    family, socktype, proto, _, sockaddr = addr_info[0]
    with socket.socket(family, socktype, proto) as sock:
        sock.bind(sockaddr)
        return sock.getsockname()[1]


def _resolve_port(host: str, port: int | None) -> int:
    if port is None:
        return _select_free_port(host)
    return port


def _is_ssh_session() -> bool:
    return bool(os.environ.get("SSH_CONNECTION") or os.environ.get("SSH_TTY"))


def _has_gui() -> bool:
    if sys.platform == "darwin":
        return True
    if os.name == "nt":
        return True
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def _should_auto_open(no_open: bool) -> bool:
    if no_open:
        return False
    if not sys.stdin.isatty():
        return False
    if _is_ssh_session():
        return False
    if not _has_gui():
        return False
    return True


def _format_host_for_url(host: str) -> str:
    if host in {"0.0.0.0", "::"}:
        return "127.0.0.1"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


def _build_bootstrap_urls(host: str, port: int, token: str) -> tuple[str, str]:
    url_host = _format_host_for_url(host)
    base = f"http://{url_host}:{port}{Route.BOOTSTRAP_PAGE.value}"
    return f"{base}#token={token}", base


def _format_bind_hint(host: str, port: int) -> str:
    suffix = " (remote only)" if host in {"127.0.0.1", "::1"} else ""
    return f"{host}:{port}{suffix}"


def _build_ssh_tunnel_command(port: int) -> str:
    return (
        "ssh -N -L ${LOCAL_PORT}:127.0.0.1:"
        f"{port} <user@host> -o ExitOnForwardFailure=yes"
    )


def _render_startup_message(
    session_id: str,
    host: str,
    port: int,
    workspace_path: Path,
    bootstrap_url_fragment: str,
    token: str,
    auto_open: bool,
) -> str:
    bind_label = _format_bind_hint(host, port)
    lines = [
        f"Setta running (session {session_id})",
        f"Bind: {bind_label}",
    ]
    if auto_open:
        lines.append("Opening browser to:")
        lines.append(f"  {bootstrap_url_fragment}")
        return "\n".join(lines)

    quoted_workspace = shlex.quote(str(workspace_path))
    lines.append("From your laptop (recommended if Setta is installed locally):")
    lines.append(
        f"  setta connect <user@host> --workspace {quoted_workspace} --session {session_id}"
    )
    lines.append("Manual tunnel (if Setta is not installed locally):")
    lines.append("  LOCAL_PORT=61000")
    lines.append(
        "  ssh -N -L ${LOCAL_PORT}:127.0.0.1:"
        f"{port} <user@host> -o ExitOnForwardFailure=yes"
    )
    lines.append("  Open this URL in your browser (recommended):")
    lines.append(
        "    http://127.0.0.1:${LOCAL_PORT}"
        f"{Route.BOOTSTRAP_PAGE.value}#token={token}"
    )
    lines.append(
        "  If the page prompts for a token (fragment stripped or you prefer manual entry), open:"
    )
    lines.append(f"    http://127.0.0.1:${{LOCAL_PORT}}{Route.BOOTSTRAP_PAGE.value}")
    lines.append("    and paste:")
    lines.append(f"      {token}")
    lines.append(
        "  (macOS: open URL, Linux: xdg-open URL, Windows: start URL, "
        "Python: python -m webbrowser URL)"
    )
    return "\n".join(lines)


def _render_connect_info_message(
    session: SessionMetadata,
    bootstrap_url_fragment: str,
    bootstrap_url_plain: str,
    token: str,
) -> str:
    bind_label = _format_bind_hint(session.host, session.port)
    quoted_workspace = shlex.quote(session.workspacePath)
    lines = [
        f"Setta session {session.id}",
        f"Bind: {bind_label}",
        "Remote start (copy/paste on host, if needed):",
        f"  cd {quoted_workspace} && source .venv/bin/activate && setta",
        "Bootstrap URL with fragment token:",
        f"  {bootstrap_url_fragment}",
        "Bootstrap URL (no token):",
        f"  {bootstrap_url_plain}",
        "From your laptop (recommended if Setta is installed locally):",
        f"  setta connect <user@host> --workspace {quoted_workspace} --session {session.id}",
        "Manual tunnel (if Setta is not installed locally):",
        f"  LOCAL_PORT={_DEFAULT_LOCAL_PORT}",
        f"  {_build_ssh_tunnel_command(session.port)}",
        "  Open this URL in your browser (recommended):",
        "    http://127.0.0.1:${LOCAL_PORT}"
        f"{Route.BOOTSTRAP_PAGE.value}#token={token}",
        "  If the page prompts for a token (fragment stripped or you prefer manual entry), open:",
        f"    http://127.0.0.1:${{LOCAL_PORT}}{Route.BOOTSTRAP_PAGE.value}",
        "    and paste:",
        f"      {token}",
        "  (macOS: open URL, Linux: xdg-open URL, Windows: start URL, "
        "Python: python -m webbrowser URL)",
    ]
    return "\n".join(lines)


def _select_session_for_connect_info(
    sessions: list[SessionMetadata],
    session_id: str | None,
    latest: bool,
    allow_prompt: bool,
) -> SessionMetadata:
    if session_id:
        for session in sessions:
            if session.id == session_id:
                return session
        raise click.ClickException(f"Session {session_id} not found.")
    if latest:
        return max(sessions, key=lambda session: session.startedAt)
    if len(sessions) == 1:
        return sessions[0]
    if not allow_prompt:
        raise click.ClickException(
            "Multiple sessions found; use --session <id> or --latest."
        )
    sessions_sorted = sorted(
        sessions, key=lambda session: session.startedAt, reverse=True
    )
    click.echo("Multiple sessions found:")
    for idx, session in enumerate(sessions_sorted, start=1):
        started_at = session.startedAt.isoformat()
        click.echo(f"{idx}. {session.id} started {started_at} port {session.port}")
    selection = click.prompt(
        f"Select [1-{len(sessions_sorted)}]",
        type=click.IntRange(1, len(sessions_sorted)),
    )
    return sessions_sorted[selection - 1]


def _emit_connect_info_json(payload: dict) -> None:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    encoded = base64.b64encode(raw.encode("utf-8")).decode("ascii")
    click.echo(f"{_CONNECT_INFO_JSON_PREFIX}{encoded}")


@click.command()
def version() -> None:
    click.echo(f"setta version {__version__}")


@click.command()
@click.option("--readable", is_flag=True, help="Export in human-readable format")
@click.option(
    "--readable-with-variants",
    is_flag=True,
    help="Export in readable format with variants",
)
def export_db(readable: bool, readable_with_variants: bool) -> None:
    if not any([readable, readable_with_variants]):
        readable_with_variants = True

    # TODO


@click.command()
@click.option(
    "--connect-info",
    is_flag=True,
    help="Print connection info for SSH + bootstrap flows",
)
@click.option("--json", "json_output", is_flag=True, help="Emit JSON (base64) payload")
@click.option("--workspace", type=click.Path(path_type=Path))
@click.option("--session", "session_id", default=None)
@click.option("--latest", is_flag=True)
def status(
    connect_info: bool,
    json_output: bool,
    workspace: Path | None,
    session_id: str | None,
    latest: bool,
) -> None:
    if not connect_info:
        raise click.ClickException("Use --connect-info to print session details.")
    if session_id and latest:
        raise click.ClickException("Use either --session or --latest, not both.")

    registry = SessionRegistry()
    if workspace is None:
        sessions = registry.load_sessions()
    else:
        sessions = registry.find_sessions_by_workspace(workspace)

    if not sessions:
        raise click.ClickException("No matching Setta sessions found.")

    allow_prompt = sys.stdin.isatty() and not json_output
    session = _select_session_for_connect_info(
        sessions,
        session_id=session_id,
        latest=latest,
        allow_prompt=allow_prompt,
    )

    secret_path = Path(session.secretPath)
    if not secret_path.exists():
        raise click.ClickException(f"Secret file missing for session {session.id}.")
    secret = secret_path.read_bytes()

    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    bootstrap_url_fragment, bootstrap_url_plain = _build_bootstrap_urls(
        session.host, session.port, token
    )
    ssh_tunnel_command = _build_ssh_tunnel_command(session.port)

    if json_output:
        payload = {
            "session": {
                "id": session.id,
                "workspacePath": session.workspacePath,
                "host": session.host,
                "port": session.port,
                "pid": session.pid,
                "startedAt": session.startedAt.isoformat(),
            },
            "bootstrapUrlFragment": bootstrap_url_fragment,
            "bootstrapUrlPlain": bootstrap_url_plain,
            "sshTunnelCommand": ssh_tunnel_command,
        }
        _emit_connect_info_json(payload)
        return

    click.echo(
        _render_connect_info_message(
            session,
            bootstrap_url_fragment,
            bootstrap_url_plain,
            token,
        )
    )


@click.group(
    invoke_without_command=True,
    context_settings=dict(
        ignore_unknown_options=True,
    ),
)
@click.option("--reload", is_flag=True)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", type=int, default=None, help="backend port (random if omitted)")
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default=None,
    help="Override the logging level (defaults to SETTA_LOG_LEVEL or INFO)",
)
@click.option("--no-open", is_flag=True, help="Skip opening a local browser")
@click.pass_context
def cli(
    ctx: click.Context,
    reload: bool,
    host: str,
    port: int | None,
    log_level: str | None,
    no_open: bool,
) -> None:
    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()
    if ctx.invoked_subcommand is None:
        logging.getLogger(__name__).info("Starting Setta")

        resolved_host = host
        resolved_port = _resolve_port(resolved_host, port)
        C.HOST = resolved_host
        C.PORT = resolved_port

        registry = SessionRegistry()
        session = registry.create_session(
            Path.cwd(), resolved_host, resolved_port, os.getpid()
        )
        secret = registry.load_secret(session)
        token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)

        bootstrap_url_fragment, _ = _build_bootstrap_urls(
            resolved_host, resolved_port, token
        )
        auto_open = _should_auto_open(no_open)
        C.OPEN_BROWSER_ON_START = bootstrap_url_fragment if auto_open else None

        click.echo(
            _render_startup_message(
                session.id,
                resolved_host,
                resolved_port,
                Path.cwd().resolve(),
                bootstrap_url_fragment,
                token,
                auto_open,
            )
        )

        config = uvicorn.Config(
            "setta.server:app",
            host=resolved_host,
            port=resolved_port,
            log_level=uvicorn_log_level,
            log_config=None,
            reload=reload,
            timeout_graceful_shutdown=1,
        )
        server = uvicorn.Server(config)

        server.run()


cli.add_command(version)
cli.add_command(export_db)
cli.add_command(status)
