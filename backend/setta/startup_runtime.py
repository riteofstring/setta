import os
import shlex
import sys
from pathlib import Path
from typing import Protocol

import click

from setta import ssh_common
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C, normalize_cookie_name
from setta.utils.env_vars import (
    FILES_LOCATION_ENV,
    FILES_ROOT_ENV,
    PROFILE_ENV,
    PROFILE_LOOKUP_HOME_ENV,
    RUNTIME_ROOT_ENV,
    SETTA_HOME_ENV,
    WORKSPACE_ROOT_ENV,
)
from setta.utils.network import format_host_for_ssh_tunnel
from setta.utils.paths import (
    SettaFilesLocation,
    SettaPaths,
    clear_setta_paths_cache,
    get_optional_dir_validation_error,
    resolve_setta_paths,
    validate_workspace_root,
)

_DEFAULT_LOCAL_PORT = 61000
_DEFAULT_AUTH_COOKIE_NAME = C.AUTH_COOKIE_NAME


def _resolve_cli_paths(
    *,
    workspace: str | Path | None,
    setta_home: str | Path | None,
    profile: str | None,
    setta_files_root: str | Path | None,
    setta_files_location: SettaFilesLocation | None,
    runtime_root: str | Path | None,
    validate: bool,
) -> SettaPaths:
    try:
        paths = resolve_setta_paths(
            workspace_root=workspace,
            setta_home=setta_home,
            profile=profile,
            setta_files_root=setta_files_root,
            setta_files_location=setta_files_location,
            runtime_root=runtime_root,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    if validate:
        try:
            validate_workspace_root(paths.workspace_root)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc
        for raw_path, label in (
            (paths.setta_home, "setta home"),
            (paths.setta_files_root, "setta files root"),
            (paths.runtime_root, "runtime root"),
        ):
            message = get_optional_dir_validation_error(raw_path, label=label)
            if message:
                raise click.ClickException(message)
    return paths


def _apply_paths_to_env(paths: SettaPaths) -> None:
    os.environ[WORKSPACE_ROOT_ENV] = str(paths.workspace_root)
    os.environ[SETTA_HOME_ENV] = str(paths.setta_home)
    os.environ[PROFILE_LOOKUP_HOME_ENV] = str(paths.profile_lookup_home)
    os.environ[RUNTIME_ROOT_ENV] = str(paths.runtime_root)
    if paths.profile_name:
        os.environ[PROFILE_ENV] = paths.profile_name
    else:
        os.environ.pop(PROFILE_ENV, None)
    if paths.setta_files_location is None:
        os.environ[FILES_ROOT_ENV] = str(paths.setta_files_root)
        os.environ.pop(FILES_LOCATION_ENV, None)
    else:
        os.environ[FILES_LOCATION_ENV] = paths.setta_files_location
        os.environ.pop(FILES_ROOT_ENV, None)
    if paths.auth_cookie_name:
        os.environ["SETTA_AUTH_COOKIE_NAME"] = paths.auth_cookie_name
        C.AUTH_COOKIE_NAME = normalize_cookie_name(
            paths.auth_cookie_name, default="setta_auth"
        )
    else:
        os.environ.pop("SETTA_AUTH_COOKIE_NAME", None)
        C.AUTH_COOKIE_NAME = _DEFAULT_AUTH_COOKIE_NAME
    clear_setta_paths_cache()


class _ServerRunner(Protocol):
    def run(self) -> None: ...


def _run_uvicorn_server(server: _ServerRunner) -> None:
    try:
        server.run()
    except KeyboardInterrupt:
        return


def _select_free_port(host: str) -> int:
    return ssh_common.select_free_port(host)


def _resolve_port(host: str, port: int | None) -> int:
    if port is None:
        return _select_free_port(host)
    return port


def _is_loopback_host(host: str) -> bool:
    normalized = host.strip().lower()
    return normalized in {"127.0.0.1", "localhost", "::1"}


def _warn_if_public_host_no_auth(*, mode: str, host: str) -> None:
    if _is_loopback_host(host):
        return
    click.echo(
        (
            f"WARNING: {mode} mode disables auth. "
            f"Binding to {host!r} may expose your deployment publicly."
        ),
        err=True,
    )


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
    if not sys.stdin.isatty() and not IS_DEV_MODE:
        return False
    if _is_ssh_session():
        return False
    if not _has_gui():
        return False
    return True


def _format_bind_hint(host: str, port: int) -> str:
    suffix = " (remote only)" if host in {"127.0.0.1", "::1"} else ""
    return f"{host}:{port}{suffix}"


def _build_ssh_tunnel_command(host: str, port: int) -> str:
    tunnel_host = format_host_for_ssh_tunnel(host)
    return (
        f"ssh -N -L ${{LOCAL_PORT}}:{tunnel_host}:{port} "
        "<user@host> -o ExitOnForwardFailure=yes"
    )


def _build_ssh_tunnel_command_for_port(
    host: str, local_port: int, remote_port: int
) -> str:
    tunnel_host = format_host_for_ssh_tunnel(host)
    return (
        f"ssh -N -L {local_port}:{tunnel_host}:{remote_port} "
        "<user@host> -o ExitOnForwardFailure=yes"
    )


def _render_startup_message(
    session_id: str,
    host: str,
    port: int,
    workspace_path: Path,
    bootstrap_url_fragment: str,
    bootstrap_url_plain: str,
    token: str,
    auto_open: bool,
    is_remote_session: bool,
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

    if not is_remote_session:
        lines.append("")
        lines.append("Bootstrap URL (recommended):")
        lines.append(f"  {bootstrap_url_fragment}")
        lines.append("")
        lines.append("Manual token entry:")
        lines.append(f"  {bootstrap_url_plain}")
        lines.append(f"  Token: {token}")
        return "\n".join(lines)

    quoted_workspace = shlex.quote(str(workspace_path))
    lines.append("")
    lines.append("From your laptop (Setta installed):")
    lines.append(
        f"  setta connect <user@host> --workspace {quoted_workspace} --session {session_id}"
    )
    lines.append("")
    lines.append("Manual tunnel (no local Setta install):")
    local_port = _DEFAULT_LOCAL_PORT
    lines.append(f"  LOCAL_PORT={local_port}")
    lines.append(f"  {_build_ssh_tunnel_command(host, port)}")
    lines.append("  Open in browser (recommended):")
    lines.append(
        f"    http://127.0.0.1:${{LOCAL_PORT}}{Route.BOOTSTRAP_PAGE.value}#token={token}"
    )
    lines.append("  Manual token entry:")
    lines.append(f"    http://127.0.0.1:${{LOCAL_PORT}}{Route.BOOTSTRAP_PAGE.value}")
    lines.append(f"    and paste: {token}")
    lines.append("  Tip: set LOCAL_PORT to change the local port.")
    lines.append(
        "  macOS: open URL | Linux: xdg-open URL | Windows: start URL | "
        "Python: python -m webbrowser URL"
    )
    return "\n".join(lines)
