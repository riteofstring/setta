import base64
import json
import logging
import os
import shlex
import signal
import subprocess
import sys
import time
import webbrowser
from functools import lru_cache
from pathlib import Path, PurePath
from typing import Any

import click
import requests
import yaml

from setta import __version__, ssh_common
from setta.auth.manager import AUTH_COOKIE_MANAGER, BOOTSTRAP_TOKEN_MANAGER
from setta.database.db_objs import DBE
from setta.launch import LaunchError, launch_workspace_session
from setta.logging.config import configure_logging
from setta.mcp.namespacing import MCP_TOOL_NAME_SEPARATOR
from setta.mcp.tool_registry import build_setta_tool_payloads
from setta.project_state.readable_export import build_readable_project_export
from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.utils import resolve_sessions_root
from setta.share.deployment_utils import (
    iter_share_deployment_versions,
    parse_share_deployment_version,
)
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.network import (
    build_bootstrap_urls,
    format_host_for_ssh_tunnel,
    format_host_for_url,
)
from setta.utils.paths import (
    clear_setta_paths_cache,
    get_setta_paths,
    resolve_setta_paths,
    validate_optional_dir,
    validate_workspace_root,
)

_CONNECT_INFO_JSON_PREFIX = "__SETTA_JSON_B64__"
_DEFAULT_LOCAL_PORT = 61000
_ROUTE_NAMES = {route.value.lstrip("/") for route in Route}
_MISSING_AUTH_MESSAGE = (
    "Missing Setta auth. Provide auth_headers or bootstrap_token, or set "
    "SETTA_SESSION_ID (and SETTA_SESSIONS_ROOT if running outside the session "
    "workspace)."
)
_WORKSPACE_ROOT_ENV = "SETTA_WORKSPACE_ROOT"
_FILES_ROOT_ENV = "SETTA_FILES_ROOT"

RemoteSessionSummary = ssh_common.RemoteSessionSummary


def _resolve_cli_paths(
    *,
    workspace: str | Path | None,
    files_root: str | Path | None,
    files_root_base: str | Path | None,
    validate: bool,
):
    paths = resolve_setta_paths(
        workspace_root=workspace,
        files_root=files_root,
        files_root_base=files_root_base,
    )
    if validate:
        try:
            validate_workspace_root(paths.workspace_root)
        except ValueError as exc:
            # Click should render a clean message without an exception traceback.
            raise click.ClickException(str(exc)) from exc
        _validate_optional_dir(files_root, label="files root")
        _validate_optional_dir(files_root_base, label="files root base")
    return paths


def _validate_optional_dir(raw_path: Path | str | None, *, label: str) -> None:
    try:
        validate_optional_dir(raw_path, label=label)
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc


def _apply_paths_to_env(paths) -> None:
    os.environ[_WORKSPACE_ROOT_ENV] = str(paths.workspace_root)
    os.environ[_FILES_ROOT_ENV] = str(paths.setta_files_root)
    clear_setta_paths_cache()


def _parse_json_payload(output: str) -> dict:
    try:
        return ssh_common.parse_json_payload(output)
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _parse_session_list(payload: dict) -> list[RemoteSessionSummary]:
    try:
        return ssh_common.parse_session_list(payload)
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _parse_ssh_args(raw: str | None) -> list[str]:
    return ssh_common.parse_ssh_args(raw)


def _has_control_socket_option(ssh_args: list[str]) -> bool:
    return ssh_common.has_control_socket_option(ssh_args)


def _apply_control_socket_args(ssh_args: list[str]) -> list[str]:
    return ssh_common.apply_control_socket_args(ssh_args)


def _run_ssh_command(
    ssh_target: str,
    ssh_args: list[str],
    remote_command: str,
    capture_output: bool = True,
    timeout: float | None = None,
) -> subprocess.CompletedProcess[str]:
    return ssh_common.run_ssh_command(
        ssh_target,
        ssh_args,
        remote_command,
        ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        timeout=timeout,
        capture_output=capture_output,
    )


def _build_remote_shell_command(shell: str, inner_command: str) -> str:
    return ssh_common.build_remote_shell_command(shell, inner_command)


def _format_remote_path(path: PurePath) -> str:
    return path.as_posix()


def _resolve_remote_shell(ssh_target: str, ssh_args: list[str]) -> str:
    try:
        return ssh_common.resolve_remote_shell(
            ssh_target,
            ssh_args,
            ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        )
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _resolve_remote_workspace(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
) -> str:
    try:
        return ssh_common.resolve_remote_workspace(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        )
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _resolve_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    remote_cmd: str | None,
) -> str:
    try:
        return ssh_common.resolve_remote_setta_command(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            remote_cmd,
            ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        )
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _run_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    setta_args: str,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    return ssh_common.run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        setta_args,
        ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        timeout=None,
    )


def _build_remote_files_root_args(
    *,
    files_root: Path | None,
    files_root_base: Path | None,
) -> str:
    return ssh_common.build_remote_files_root_args(
        files_root=str(files_root) if files_root is not None else None,
        files_root_base=str(files_root_base) if files_root_base is not None else None,
    )


def _fetch_remote_sessions(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
) -> list[RemoteSessionSummary]:
    try:
        return ssh_common.fetch_remote_sessions(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            setta_command,
            files_root_args,
            ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        )
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _fetch_remote_connect_info(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    session_id: str | None,
    latest: bool,
) -> dict:
    if session_id is None:
        if not latest:
            raise click.ClickException("Use --session or --latest for remote connect.")
        sessions = _fetch_remote_sessions(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            setta_command,
            files_root_args,
        )
        if not sessions:
            raise click.ClickException("No matching Setta sessions found.")
        session_id = max(sessions, key=lambda entry: entry.started_at).id
    try:
        return ssh_common.fetch_remote_connect_info(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            setta_command,
            files_root_args,
            session_id=session_id,
            ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
        )
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _delete_remote_session(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    session_id: str,
) -> None:
    root_prefix = f"{files_root_args} " if files_root_args else ""
    result = _run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        f"{root_prefix}status --delete-session {shlex.quote(session_id)}",
        capture_output=True,
    )
    if result.returncode != 0:
        raise click.ClickException(
            f"Failed to delete remote session {session_id}: {result.stderr.strip() or result.stdout.strip()}"
        )


def _start_remote_setta(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    files_root: Path | None,
    files_root_base: Path | None,
    verbose: bool = False,
) -> None:
    try:
        ssh_common.start_remote_setta(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            setta_command,
            files_root_args,
            ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
            files_root=str(files_root) if files_root is not None else None,
            files_root_base=str(files_root_base)
            if files_root_base is not None
            else None,
        )
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _wait_for_remote_session(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    timeout_seconds: float = 30.0,
    verbose: bool = False,
) -> RemoteSessionSummary:
    deadline = time.monotonic() + timeout_seconds
    attempt = 0
    while True:
        attempt += 1
        sessions = _fetch_remote_sessions(
            ssh_target, ssh_args, shell, workspace, setta_command, files_root_args
        )
        if verbose:
            click.echo(
                f"Remote session poll #{attempt}: {len(sessions)} session(s) found."
            )
        if sessions:
            return max(sessions, key=lambda session: session.started_at)
        if time.monotonic() >= deadline:
            raise click.ClickException(
                "Timed out waiting for remote Setta session to start."
            )
        time.sleep(0.5)


def _stop_session_process(pid: int) -> None:
    if pid <= 0:
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except PermissionError as exc:
        raise click.ClickException(
            f"Failed to stop session process {pid}: {exc}"
        ) from exc


def _ensure_background_process_started(
    proc: subprocess.Popen[str], wait_seconds: float = 0.2
) -> None:
    try:
        ssh_common.ensure_background_process_started(proc, wait_seconds=wait_seconds)
    except LaunchError as exc:
        raise click.ClickException(f"{exc} Try --print-only or --verbose.") from exc


def _extract_token_from_bootstrap_url(url: str) -> str:
    try:
        return ssh_common.extract_token_from_bootstrap_url(url)
    except LaunchError as exc:
        raise click.ClickException(str(exc)) from exc


def _build_ssh_tunnel_args(
    ssh_target: str,
    ssh_args: list[str],
    host: str,
    local_port: int,
    remote_port: int,
) -> list[str]:
    return ssh_common.build_ssh_tunnel_args(
        ssh_target,
        ssh_args,
        host,
        local_port,
        remote_port,
        ssh_prefix=ssh_common.ssh_command_prefix(batch_mode=False),
    )


def _prompt_for_session_action(
    sessions: list[RemoteSessionSummary],
) -> tuple[str, RemoteSessionSummary | None]:
    sessions_sorted = sorted(
        sessions, key=lambda session: session.started_at, reverse=True
    )
    click.echo("Multiple sessions found:")
    for idx, session in enumerate(sessions_sorted, start=1):
        started_at = session.started_at.isoformat()
        click.echo(f"{idx}. {session.id} started {started_at} port {session.port}")
    prompt = f"Select [1-{len(sessions_sorted)}], dN delete, q quit"
    while True:
        selection = click.prompt(prompt, type=str).strip().lower()
        if selection == "q":
            return "quit", None
        if selection.startswith("d"):
            suffix = selection[1:].strip()
            if suffix.isdigit():
                index = int(suffix)
                if 1 <= index <= len(sessions_sorted):
                    return "delete", sessions_sorted[index - 1]
        if selection.isdigit():
            index = int(selection)
            if 1 <= index <= len(sessions_sorted):
                return "select", sessions_sorted[index - 1]
        click.echo("Invalid selection.")


def _select_free_port(host: str) -> int:
    return ssh_common.select_free_port(host)


def _resolve_port(host: str, port: int | None) -> int:
    if port is None:
        return _select_free_port(host)
    return port


def _resolve_share_deployment_root(
    *,
    deployment_root: Path | None,
    deployment_name: str | None,
    deployment_version: str | None,
    latest: bool,
) -> Path:
    if deployment_root is not None:
        if deployment_name or deployment_version or latest:
            raise click.ClickException(
                "Use either --deployment-root or --deployment-name/--version/--latest."
            )
        resolved = deployment_root.expanduser().resolve()
        if not resolved.exists():
            raise click.ClickException(f"Share deployment root not found: {resolved}")
        return resolved
    if not deployment_name:
        raise click.ClickException(
            "Missing --deployment-name (or use --deployment-root)."
        )
    if deployment_version and latest:
        raise click.ClickException("Use either --version or --latest, not both.")
    if not deployment_version and not latest:
        raise click.ClickException("Missing --version or --latest.")
    project_root = (C.SHARE_DEPLOYMENTS_FOLDER / deployment_name).resolve()
    if not project_root.exists():
        raise click.ClickException(f"Share deployment not found: {deployment_name}")
    if latest:
        versions = iter_share_deployment_versions(project_root)
        if not versions:
            raise click.ClickException(f"Share deployment not found: {deployment_name}")
        _, latest_root = max(versions, key=lambda item: item[0])
        return latest_root.resolve()
    if parse_share_deployment_version(deployment_version) is None:
        raise click.ClickException(
            "Invalid --version value. Expected vN (for example v3)."
        )
    resolved = (project_root / deployment_version).resolve()
    if not resolved.exists():
        raise click.ClickException(
            f"Share deployment not found: {deployment_name}/{deployment_version}"
        )
    return resolved


def _build_session_registry(workspace: Path | str | None) -> SessionRegistry:
    sessions_root = resolve_sessions_root(workspace)
    if sessions_root is None:
        return SessionRegistry()
    return SessionRegistry(sessions_root=sessions_root)


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
    ]
    lines.append("")
    lines.append("Remote start (run on host, if needed):")
    lines.append(f"  cd {quoted_workspace} && source .venv/bin/activate && setta")
    lines.append("")
    lines.append("Bootstrap URL (fragment token):")
    lines.append(f"  {bootstrap_url_fragment}")
    lines.append("")
    lines.append("Bootstrap URL (manual token entry):")
    lines.append(f"  {bootstrap_url_plain}")
    lines.append(f"  Token: {token}")
    lines.append("")
    lines.append("From your laptop (Setta installed):")
    lines.append(
        f"  setta connect <user@host> --workspace {quoted_workspace} --session {session.id}"
    )
    lines.append("")
    lines.append("Manual tunnel (no local Setta install):")
    lines.append(
        f"  {_build_ssh_tunnel_command_for_port(session.host, _DEFAULT_LOCAL_PORT, session.port)}"
    )
    lines.append("  Open in browser (recommended):")
    lines.append(
        f"    http://127.0.0.1:{_DEFAULT_LOCAL_PORT}"
        f"{Route.BOOTSTRAP_PAGE.value}#token={token}"
    )
    lines.append("  Manual token entry:")
    lines.append(
        f"    http://127.0.0.1:{_DEFAULT_LOCAL_PORT}{Route.BOOTSTRAP_PAGE.value}"
    )
    lines.append(f"    Token: {token}")
    lines.append(
        f"  Tip: if you change the local port, replace {_DEFAULT_LOCAL_PORT} in the tunnel + URLs."
    )
    lines.append(
        "  macOS: open URL | Linux: xdg-open URL | Windows: start URL | "
        "Python: python -m webbrowser URL"
    )
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


def _normalize_base_url(base_url: str) -> str:
    trimmed = base_url.strip()
    if not trimmed:
        raise click.ClickException("Empty base URL.")
    trimmed = trimmed.rstrip("/")
    if trimmed.endswith(Route.PREFIX.value):
        trimmed = trimmed[: -len(Route.PREFIX.value)].rstrip("/")
    if not trimmed.startswith(("http://", "https://")):
        trimmed = f"http://{trimmed}"
    return trimmed


def _base_url_from_session(session: SessionMetadata) -> str:
    host = format_host_for_url(session.host)
    return f"http://{host}:{session.port}"


def _build_bootstrap_urls_from_base(base_url: str, token: str) -> tuple[str, str]:
    plain = f"{base_url}{Route.BOOTSTRAP_PAGE.value}"
    return f"{plain}#token={token}", plain


def _format_session_payload(session: SessionMetadata) -> dict[str, Any]:
    return {
        "id": session.id,
        "workspacePath": session.workspacePath,
        "workspacePathCanonical": session.workspacePathCanonical,
        "host": session.host,
        "port": session.port,
        "pid": session.pid,
        "startedAt": session.startedAt.isoformat(),
    }


def _load_session_secret(registry: SessionRegistry, session: SessionMetadata) -> bytes:
    secret_path = registry.resolve_secret_path(session)
    if not secret_path.exists():
        raise click.ClickException(f"Secret file missing for session {session.id}.")
    return secret_path.read_bytes()


def _resolve_latest_session_for_workspace(
    workspace: Path,
) -> tuple[SessionMetadata, bytes]:
    registry = _build_session_registry(workspace)
    sessions = registry.find_sessions_by_workspace(workspace)
    if not sessions:
        raise click.ClickException("No matching Setta sessions found.")
    session = max(sessions, key=lambda entry: entry.startedAt)
    secret = _load_session_secret(registry, session)
    return session, secret


def _emit_json_output(payload: Any) -> None:
    click.echo(json.dumps(payload, separators=(",", ":"), sort_keys=True))


def _load_json_value(raw: str, label: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise click.ClickException(f"Invalid {label} JSON: {exc}") from exc


def _load_json_payload(
    json_payload: str | None, payload_stdin: bool, payload_file: Path | None
) -> Any | None:
    sources = [json_payload is not None, payload_stdin, payload_file is not None]
    if sum(sources) > 1:
        raise click.ClickException("Use only one of --json, --stdin, or --file.")
    if json_payload is not None:
        raw = json_payload.strip()
    elif payload_stdin:
        raw = sys.stdin.read().strip()
    elif payload_file is not None:
        raw = payload_file.read_text(encoding="utf-8").strip()
    else:
        return None
    if not raw:
        return None
    return _load_json_value(raw, "payload")


def _load_auth_payload(
    auth_json: Path | None, auth_stdin: bool
) -> dict[str, Any] | None:
    if auth_json is None and not auth_stdin:
        return None
    if auth_json is not None and auth_stdin:
        raise click.ClickException("Use only one of --auth-json or --auth-stdin.")
    if auth_json is not None:
        raw = auth_json.read_text(encoding="utf-8").strip()
    else:
        raw = sys.stdin.read().strip()
    if not raw:
        raise click.ClickException("Auth JSON input was empty.")
    payload = _load_json_value(raw, "auth")
    if not isinstance(payload, dict):
        raise click.ClickException("Auth JSON must be an object.")
    return payload


def _strip_cookie_header_prefix(value: str) -> str:
    cleaned = value.strip()
    if cleaned.lower().startswith("cookie:"):
        return cleaned.split(":", 1)[1].strip()
    return cleaned


def _cookie_header_from_auth_payload(payload: dict[str, Any]) -> str:
    header = payload.get("cookieHeader")
    if isinstance(header, str) and header.strip():
        return _strip_cookie_header_prefix(header)
    cookie = payload.get("cookie")
    if isinstance(cookie, str) and cookie.strip():
        cookie_value = _strip_cookie_header_prefix(cookie)
        if "=" not in cookie_value:
            name = payload.get("cookieName") or C.AUTH_COOKIE_NAME
            cookie_value = f"{name}={cookie_value}"
        return cookie_value
    raise click.ClickException("Auth JSON missing cookieHeader/cookie fields.")


def _base_url_from_auth_payload(payload: dict[str, Any]) -> str | None:
    base_url = payload.get("baseUrl")
    if isinstance(base_url, str) and base_url.strip():
        return _normalize_base_url(base_url)
    api_base_url = payload.get("apiBaseUrl")
    if isinstance(api_base_url, str) and api_base_url.strip():
        return _normalize_base_url(api_base_url)
    return None


def _normalize_tool_name(raw: str) -> str:
    name = raw.strip()
    if not name:
        raise click.ClickException("Tool name must be a non-empty string.")
    if name.startswith("/"):
        raise click.ClickException(
            "Tool name must be a bare MCP tool name, not a path."
        )
    if MCP_TOOL_NAME_SEPARATOR in name:
        raise click.ClickException("Tool name must be a bare MCP tool name.")
    if _is_route_name(name):
        raise click.ClickException("Tool name must be a bare MCP tool name.")
    return name


def _is_route_name(name: str) -> bool:
    return name in _ROUTE_NAMES


@lru_cache(maxsize=1)
def _get_setta_tool_names() -> set[str]:
    return {tool["name"] for tool in build_setta_tool_payloads()}


def _build_tool_call_url(base_url: str) -> str:
    normalized_base = _normalize_base_url(base_url)
    return f"{normalized_base}{Route.TOOLS_CALL.value}"


def _build_http_error_payload(
    response: requests.Response | None, tool_name: str
) -> dict[str, Any]:
    body: Any = None
    status = None
    if response is not None:
        status = response.status_code
        try:
            body = response.json()
        except ValueError:
            body = response.text
    return {
        "error": "HTTPError",
        "status": status,
        "tool": tool_name,
        "body": body,
    }


def _build_request_error_payload(
    exc: Exception, tool_name: str | None
) -> dict[str, Any]:
    payload: dict[str, Any] = {"error": "RequestError", "message": str(exc)}
    if tool_name is not None:
        payload["tool"] = tool_name
    return payload


def _select_local_stop_targets(
    sessions: list[SessionMetadata],
    session_id: str | None,
    latest: bool,
    stop_all: bool,
) -> list[SessionMetadata]:
    if stop_all:
        return sessions
    if session_id:
        target = next(
            (session for session in sessions if session.id == session_id), None
        )
        if target is None:
            raise click.ClickException(f"Session {session_id} not found.")
        return [target]
    if latest:
        return [max(sessions, key=lambda session: session.startedAt)]
    if len(sessions) == 1:
        return sessions
    raise click.ClickException(
        "Multiple sessions found; use --session <id>, --latest, or --all."
    )


def _select_remote_stop_targets(
    sessions: list[RemoteSessionSummary],
    session_id: str | None,
    latest: bool,
    stop_all: bool,
) -> list[RemoteSessionSummary]:
    if stop_all:
        return sessions
    if session_id:
        target = next(
            (session for session in sessions if session.id == session_id), None
        )
        if target is None:
            raise click.ClickException(f"Session {session_id} not found.")
        return [target]
    if latest:
        return [max(sessions, key=lambda session: session.started_at)]
    if len(sessions) == 1:
        return sessions
    raise click.ClickException(
        "Multiple sessions found; use --session <id>, --latest, or --all."
    )


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
@click.option(
    "--output",
    type=click.Path(path_type=Path),
    default=None,
    help="Output path for readable export (default: setta_files/project.readable.yaml).",
)
def export_db(
    readable: bool, readable_with_variants: bool, output: Path | None
) -> None:
    if not any([readable, readable_with_variants]):
        readable_with_variants = True

    include_variants = readable_with_variants
    dbe = DBE(C.SETTA_FILES_FOLDER)
    project_state = dbe.read_project_required()
    payload = build_readable_project_export(
        project_state,
        include_variants=include_variants,
    )
    output_path = (
        output if output is not None else C.SETTA_FILES_FOLDER / "project.readable.yaml"
    )
    yaml_payload = yaml.safe_dump(payload, sort_keys=False)
    dbe.write(output_path, yaml_payload)
    click.echo(f"Wrote readable export to {output_path}")


@click.command()
@click.option(
    "--deployment-root",
    type=click.Path(path_type=Path),
    default=None,
    help="Path to a share deployment root (contains manifest.json/project.json).",
)
@click.option(
    "--deployment-name",
    default=None,
    help="Deployment name under setta_files/share_deployments.",
)
@click.option(
    "--version",
    "deployment_version",
    default=None,
    help="Deployment version (vN).",
)
@click.option("--latest", is_flag=True, help="Use the latest deployment version.")
@click.pass_context
def share(
    ctx: click.Context,
    deployment_root: Path | None,
    deployment_name: str | None,
    deployment_version: str | None,
    latest: bool,
) -> None:
    params = ctx.obj or {}
    reload = params.get("reload", False)
    host = params.get("host", C.DEFAULT_HOST)
    port = params.get("port", None)
    log_level = params.get("log_level", None)
    no_open = params.get("no_open", False)
    if reload:
        raise click.ClickException("Share mode does not support --reload.")

    resolved_host = host
    resolved_port = _resolve_port(resolved_host, port)
    C.HOST = resolved_host
    C.PORT = resolved_port

    resolved_deployment_root = _resolve_share_deployment_root(
        deployment_root=deployment_root,
        deployment_name=deployment_name,
        deployment_version=deployment_version,
        latest=latest,
    )
    manifest = DBE(resolved_deployment_root).read_share_manifest_optional()
    if manifest is None:
        raise click.ClickException(
            f"Share deployment manifest not found: {resolved_deployment_root / 'manifest.json'}"
        )
    C.SHARE_MODE = True
    C.SHARE_DEPLOYMENT_ROOT = resolved_deployment_root

    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()
    resolved_version = manifest.deploymentVersion
    resolved_deployment_label = deployment_name or manifest.deploymentName
    share_url = C.BACKEND
    auto_open = _should_auto_open(no_open)
    C.OPEN_BROWSER_ON_START = share_url if auto_open else None
    click.echo(
        f"Starting share backend for {resolved_deployment_label}/{resolved_version}"
    )
    click.echo(f"Share URL: {share_url}")

    import uvicorn

    config = uvicorn.Config(
        "setta.server:app",
        host=resolved_host,
        port=resolved_port,
        log_level=uvicorn_log_level,
        log_config=None,
        reload=False,
        timeout_graceful_shutdown=1,
    )
    server = uvicorn.Server(config)
    server.run()


@click.command()
@click.option("--json", "json_output", is_flag=True, help="Emit JSON payload only")
@click.option("-w", "--workspace", type=click.Path(path_type=Path))
@click.option("--files-root", type=click.Path(path_type=Path))
@click.option("--files-root-base", type=click.Path(path_type=Path))
@click.option(
    "--timeout",
    type=float,
    default=None,
    help="Seconds to wait for session startup (defaults to 30s).",
)
def launch(
    json_output: bool,
    workspace: Path | None,
    files_root: Path | None,
    files_root_base: Path | None,
    timeout: float | None,
) -> None:
    if not json_output:
        raise click.ClickException("Use --json with launch.")

    try:
        timeout_seconds = timeout if timeout is not None else 30.0
        result = launch_workspace_session(
            workspace_root=workspace,
            files_root=files_root,
            files_root_base=files_root_base,
            timeout_seconds=timeout_seconds,
        )
    except LaunchError as exc:
        _emit_json_output(
            {"ok": False, "error": {"code": exc.code, "message": str(exc)}}
        )
        raise SystemExit(1) from exc

    secret = result.registry.load_secret(result.session)
    token = BOOTSTRAP_TOKEN_MANAGER.mint(result.session.id, secret)
    bootstrap_url_fragment, _ = build_bootstrap_urls(
        result.session.host, result.session.port, token
    )
    payload = {
        "ok": True,
        "bootstrapUrlFragment": bootstrap_url_fragment,
        "workspaceRoot": str(result.paths.workspace_root),
        "filesRoot": str(result.paths.setta_files_root),
        "sessionId": result.session.id,
        "startedNew": result.started_new,
        "session": _format_session_payload(result.session),
    }
    _emit_json_output(payload)


@click.command()
@click.option(
    "--connect-info",
    is_flag=True,
    help="Print connection info for SSH + bootstrap flows",
)
@click.option(
    "--list-sessions",
    is_flag=True,
    help="List sessions for SSH connect selection (JSON only)",
)
@click.option("--delete-session", "delete_session_id", default=None)
@click.option("--json", "json_output", is_flag=True, help="Emit JSON (base64) payload")
@click.option("-w", "--workspace", type=click.Path(path_type=Path))
@click.option("--session", "session_id", default=None)
@click.option("--latest", is_flag=True)
def status(
    connect_info: bool,
    list_sessions: bool,
    delete_session_id: str | None,
    json_output: bool,
    workspace: Path | None,
    session_id: str | None,
    latest: bool,
) -> None:
    if session_id and latest:
        raise click.ClickException("Use either --session or --latest, not both.")

    registry = _build_session_registry(workspace)
    if delete_session_id:
        sessions = registry.load_sessions(prune_stale=False)
        target = next(
            (session for session in sessions if session.id == delete_session_id), None
        )
        if target is None:
            raise click.ClickException(f"Session {delete_session_id} not found.")
        if registry.is_session_process_setta(target):
            _stop_session_process(target.pid)
        registry.delete_session(target.id)
        click.echo(f"Deleted session {target.id}.")
        return

    if list_sessions:
        if not json_output:
            raise click.ClickException("Use --json with --list-sessions.")
        if workspace is None:
            sessions = registry.load_sessions()
        else:
            sessions = registry.find_sessions_by_workspace(workspace)
        payload = {
            "sessions": [
                {
                    "id": session.id,
                    "workspacePath": session.workspacePath,
                    "workspacePathCanonical": session.workspacePathCanonical,
                    "host": session.host,
                    "port": session.port,
                    "pid": session.pid,
                    "startedAt": session.startedAt.isoformat(),
                }
                for session in sessions
            ]
        }
        _emit_connect_info_json(payload)
        return

    if not connect_info:
        raise click.ClickException("Use --connect-info to print session details.")

    if workspace is None:
        sessions = registry.load_sessions()
    else:
        sessions = registry.find_sessions_by_workspace(workspace)
        if not sessions:
            sessions = registry.find_sessions_by_workspace(workspace, prune_stale=False)

    if not sessions:
        raise click.ClickException("No matching Setta sessions found.")

    allow_prompt = sys.stdin.isatty() and not json_output
    session = _select_session_for_connect_info(
        sessions,
        session_id=session_id,
        latest=latest,
        allow_prompt=allow_prompt,
    )

    secret_path = registry.resolve_secret_path(session)
    if not secret_path.exists():
        raise click.ClickException(f"Secret file missing for session {session.id}.")
    secret = secret_path.read_bytes()

    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    bootstrap_url_fragment, bootstrap_url_plain = build_bootstrap_urls(
        session.host, session.port, token
    )
    ssh_tunnel_command = _build_ssh_tunnel_command(session.host, session.port)

    if json_output:
        payload = {
            "session": {
                "id": session.id,
                "workspacePath": session.workspacePath,
                "workspacePathCanonical": session.workspacePathCanonical,
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


@click.command()
@click.option("--json", "json_output", is_flag=True, help="Emit JSON payload only")
@click.option("-w", "--workspace", type=click.Path(path_type=Path))
@click.option("--session", "session_id", default=None)
@click.option("--latest", is_flag=True)
@click.option(
    "--base-url",
    default=None,
    help="Override the backend base URL (scheme://host:port).",
)
def auth(
    json_output: bool,
    workspace: Path | None,
    session_id: str | None,
    latest: bool,
    base_url: str | None,
) -> None:
    if session_id and latest:
        raise click.ClickException("Use either --session or --latest, not both.")

    registry = _build_session_registry(workspace)
    if workspace is None:
        sessions = registry.load_sessions()
    else:
        sessions = registry.find_sessions_by_workspace(workspace)
        if not sessions:
            sessions = registry.find_sessions_by_workspace(workspace, prune_stale=False)

    if not sessions:
        raise click.ClickException("No matching Setta sessions found.")

    allow_prompt = sys.stdin.isatty() and not json_output
    session = _select_session_for_connect_info(
        sessions,
        session_id=session_id,
        latest=latest,
        allow_prompt=allow_prompt,
    )

    secret = _load_session_secret(registry, session)
    resolved_base_url = (
        _normalize_base_url(base_url) if base_url else _base_url_from_session(session)
    )
    api_base_url = f"{resolved_base_url}{Route.PREFIX.value}"
    token_for_output = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    bootstrap_url_fragment, bootstrap_url_plain = _build_bootstrap_urls_from_base(
        resolved_base_url, token_for_output
    )

    cookie_value = AUTH_COOKIE_MANAGER.mint(session.id, secret)
    cookie = f"{C.AUTH_COOKIE_NAME}={cookie_value}"
    cookie_header = f"Cookie: {cookie}"

    payload = {
        "baseUrl": resolved_base_url,
        "apiBaseUrl": api_base_url,
        "cookieHeader": cookie_header,
        "cookie": cookie,
        "cookieName": C.AUTH_COOKIE_NAME,
        "session": _format_session_payload(session),
        "bootstrapUrlFragment": bootstrap_url_fragment,
        "bootstrapUrlPlain": bootstrap_url_plain,
        "source": "bootstrap",
    }

    if json_output:
        _emit_json_output(payload)
        return

    click.echo(f"Base URL: {resolved_base_url}")
    click.echo(f"API Base URL: {api_base_url}")
    click.echo(f"Cookie Header: {cookie_header}")
    click.echo(f"Bootstrap URL: {bootstrap_url_fragment}")


@click.command()
def tools() -> None:
    payload = build_setta_tool_payloads()
    _emit_json_output(payload)


@click.command()
@click.argument("tool_name")
@click.option("--json", "json_payload", default=None, help="Inline JSON arguments")
@click.option(
    "--stdin", "payload_stdin", is_flag=True, help="Read JSON arguments from stdin"
)
@click.option(
    "--file",
    "payload_file",
    type=click.Path(path_type=Path),
    default=None,
    help="Read JSON arguments from a file",
)
@click.option(
    "--json-output",
    is_flag=True,
    help="Emit JSON only (stdout) for machine parsing",
)
@click.option("--cookie-header", default=None, help="Explicit Cookie header value")
@click.option("--cookie", default=None, help="Explicit cookie value")
@click.option(
    "--auth-json",
    type=click.Path(path_type=Path),
    default=None,
    help="Auth JSON file from `setta auth --json`",
)
@click.option("--auth-stdin", is_flag=True, help="Read auth JSON from stdin")
@click.option(
    "--timeout",
    type=float,
    default=30.0,
    show_default=True,
    help="Request timeout in seconds (0 disables).",
)
@click.option("--base-url", default=None, help="Override backend base URL")
def api(
    tool_name: str,
    json_payload: str | None,
    payload_stdin: bool,
    payload_file: Path | None,
    json_output: bool,
    cookie_header: str | None,
    cookie: str | None,
    auth_json: Path | None,
    auth_stdin: bool,
    timeout: float,
    base_url: str | None,
) -> None:
    if auth_stdin and payload_stdin:
        raise click.ClickException("Use --auth-stdin or --stdin, not both.")

    normalized_tool_name: str | None = tool_name.strip() if tool_name else None
    try:
        normalized_tool_name = _normalize_tool_name(tool_name)
        has_explicit_auth = bool(
            auth_json
            or auth_stdin
            or cookie_header
            or cookie
            or (base_url and (cookie_header or cookie))
        )
        payload = _load_json_payload(json_payload, payload_stdin, payload_file)
        if payload is None:
            arguments: dict[str, Any] = {}
        elif isinstance(payload, dict):
            arguments = payload
        else:
            raise click.ClickException("Tool arguments must be a JSON object.")
        auth_payload = _load_auth_payload(auth_json, auth_stdin)
        if normalized_tool_name not in _get_setta_tool_names():
            if not has_explicit_auth:
                raise click.ClickException(_MISSING_AUTH_MESSAGE)
            if json_output:
                _emit_json_output(
                    {"error": "UnknownTool", "tool": normalized_tool_name}
                )
                raise SystemExit(1)
            raise click.ClickException(f"Unknown tool: {normalized_tool_name}")
        resolved_base_url = _normalize_base_url(base_url) if base_url else None
        cookie_value: str | None = None

        if cookie_header or cookie:
            if cookie_header:
                cookie_value = _strip_cookie_header_prefix(cookie_header)
            elif cookie:
                cookie_value = _strip_cookie_header_prefix(cookie)
                if "=" not in cookie_value:
                    cookie_value = f"{C.AUTH_COOKIE_NAME}={cookie_value}"
            if resolved_base_url is None:
                session, _ = _resolve_latest_session_for_workspace(
                    get_setta_paths().workspace_root
                )
                resolved_base_url = _base_url_from_session(session)
        elif auth_payload is not None:
            cookie_value = _cookie_header_from_auth_payload(auth_payload)
            if resolved_base_url is None:
                resolved_base_url = _base_url_from_auth_payload(auth_payload)
            if resolved_base_url is None:
                session, _ = _resolve_latest_session_for_workspace(
                    get_setta_paths().workspace_root
                )
                resolved_base_url = _base_url_from_session(session)
        else:
            session, secret = _resolve_latest_session_for_workspace(
                get_setta_paths().workspace_root
            )
            resolved_base_url = (
                _normalize_base_url(base_url)
                if base_url
                else _base_url_from_session(session)
            )
            cookie_value = (
                f"{C.AUTH_COOKIE_NAME}={AUTH_COOKIE_MANAGER.mint(session.id, secret)}"
            )

        if resolved_base_url is None:
            raise click.ClickException(
                "Missing base URL. Use --base-url or --auth-json."
            )
        if cookie_value is None:
            raise click.ClickException("Missing auth cookie.")

        url = _build_tool_call_url(resolved_base_url)
    except click.ClickException as exc:
        if json_output:
            payload = {"error": "InputError", "message": str(exc)}
            if normalized_tool_name:
                payload["tool"] = normalized_tool_name
            _emit_json_output(payload)
            raise SystemExit(1) from exc
        raise

    headers = {"Cookie": cookie_value}
    request_kwargs: dict[str, Any] = {
        "headers": headers,
        "json": {"tool": normalized_tool_name, "arguments": arguments},
    }
    timeout_value: float | None = None if timeout <= 0 else timeout
    request_kwargs["timeout"] = timeout_value

    response: requests.Response | None = None
    try:
        response = requests.post(url, **request_kwargs)
        response.raise_for_status()
    except requests.HTTPError as exc:
        if json_output:
            _emit_json_output(
                _build_http_error_payload(
                    exc.response, normalized_tool_name or tool_name
                )
            )
            raise SystemExit(1) from exc
        raise click.ClickException(
            f"{response.status_code} {response.text if response else ''}".strip()
        ) from exc
    except requests.RequestException as exc:
        if json_output:
            _emit_json_output(
                _build_request_error_payload(exc, normalized_tool_name or tool_name)
            )
            raise SystemExit(1) from exc
        raise click.ClickException(str(exc)) from exc

    if response is None or not response.content:
        if json_output:
            _emit_json_output(None)
        return

    try:
        data = response.json()
    except ValueError:
        if json_output:
            _emit_json_output({"raw": response.text})
        else:
            click.echo(response.text)
        return

    if json_output:
        _emit_json_output(data)
    else:
        click.echo(json.dumps(data, indent=2, sort_keys=True))


@click.command()
@click.argument("ssh_target", required=False)
@click.option("-w", "--workspace", required=True)
@click.option("--session", "session_id", default=None)
@click.option("--latest", is_flag=True)
@click.option("--all", "stop_all", is_flag=True)
@click.option("--ssh-args", default=None)
@click.option("--remote-cmd", default=None)
@click.pass_context
def stop(
    ctx: click.Context,
    ssh_target: str | None,
    workspace: str,
    session_id: str | None,
    latest: bool,
    stop_all: bool,
    ssh_args: str | None,
    remote_cmd: str | None,
) -> None:
    if session_id and latest:
        raise click.ClickException("Use either --session or --latest, not both.")
    if stop_all and (session_id or latest):
        raise click.ClickException("Use --all by itself.")

    if ssh_target is None:
        registry = _build_session_registry(workspace)
        sessions = registry.find_sessions_by_workspace(workspace)
        if not sessions:
            raise click.ClickException("No matching Setta sessions found.")
        targets = _select_local_stop_targets(sessions, session_id, latest, stop_all)
        for session in targets:
            if registry.is_session_process_setta(session):
                _stop_session_process(session.pid)
            registry.delete_session(session.id)
            click.echo(f"Stopped session {session.id}.")
        return

    params = ctx.obj or {}
    files_root_args = _build_remote_files_root_args(
        files_root=params.get("files_root"),
        files_root_base=params.get("files_root_base"),
    )
    ssh_args_list = _apply_control_socket_args(_parse_ssh_args(ssh_args))
    shell = _resolve_remote_shell(ssh_target, ssh_args_list)
    remote_workspace = _resolve_remote_workspace(
        ssh_target, ssh_args_list, shell, workspace
    )
    setta_command = _resolve_remote_setta_command(
        ssh_target, ssh_args_list, shell, remote_workspace, remote_cmd
    )
    sessions = _fetch_remote_sessions(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
    )
    if not sessions:
        raise click.ClickException("No matching Setta sessions found.")
    targets = _select_remote_stop_targets(sessions, session_id, latest, stop_all)
    for session in targets:
        _delete_remote_session(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
            session.id,
        )
        click.echo(f"Stopped session {session.id}.")


@click.command()
@click.argument("ssh_target")
@click.option("-w", "--workspace", required=True)
@click.option("--session", "session_id", default=None)
@click.option("--latest", is_flag=True)
@click.option("--ssh-args", default=None)
@click.option("--remote-cmd", default=None)
@click.option("--local-port", type=click.IntRange(1, 65535), default=None)
@click.option("--detach", is_flag=True)
@click.option("--print-only", is_flag=True)
@click.option("--no-open", is_flag=True)
@click.option("--verbose", is_flag=True)
@click.pass_context
def connect(
    ctx: click.Context,
    ssh_target: str,
    workspace: str,
    session_id: str | None,
    latest: bool,
    ssh_args: str | None,
    remote_cmd: str | None,
    local_port: int | None,
    detach: bool,
    print_only: bool,
    no_open: bool,
    verbose: bool,
) -> None:
    if session_id and latest:
        raise click.ClickException("Use either --session or --latest, not both.")
    if detach and print_only:
        raise click.ClickException("Use either --detach or --print-only, not both.")

    params = ctx.obj or {}
    files_root_args = _build_remote_files_root_args(
        files_root=params.get("files_root"),
        files_root_base=params.get("files_root_base"),
    )

    ssh_args_list = _apply_control_socket_args(_parse_ssh_args(ssh_args))
    if verbose:
        click.echo(
            f"SSH args: {shlex.join(ssh_args_list) if ssh_args_list else '(none)'}"
        )
    shell = _resolve_remote_shell(ssh_target, ssh_args_list)
    if verbose:
        click.echo(f"Remote shell: {shell}")
    remote_workspace = _resolve_remote_workspace(
        ssh_target, ssh_args_list, shell, workspace
    )
    if verbose:
        click.echo(f"Remote workspace: {remote_workspace}")
    setta_command = _resolve_remote_setta_command(
        ssh_target, ssh_args_list, shell, remote_workspace, remote_cmd
    )
    if verbose:
        click.echo(f"Remote Setta command: {setta_command}")

    sessions = _fetch_remote_sessions(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
    )
    if verbose:
        click.echo(f"Remote sessions found: {len(sessions)}")
    selected_session: RemoteSessionSummary | None = None
    if session_id:
        selected_session = next(
            (session for session in sessions if session.id == session_id), None
        )
        if selected_session is None:
            raise click.ClickException(f"Session {session_id} not found.")
    elif latest:
        if sessions:
            selected_session = max(sessions, key=lambda session: session.started_at)
    elif len(sessions) == 1:
        selected_session = sessions[0]
    elif len(sessions) > 1:
        if not sys.stdin.isatty():
            raise click.ClickException(
                "Multiple sessions found; use --session <id> or --latest."
            )
        while True:
            action, target = _prompt_for_session_action(sessions)
            if action == "quit":
                raise click.ClickException("Aborted.")
            if action == "delete" and target is not None:
                if click.confirm(f"Delete session {target.id}?", default=False):
                    _delete_remote_session(
                        ssh_target,
                        ssh_args_list,
                        shell,
                        remote_workspace,
                        setta_command,
                        files_root_args,
                        target.id,
                    )
                    sessions = _fetch_remote_sessions(
                        ssh_target,
                        ssh_args_list,
                        shell,
                        remote_workspace,
                        setta_command,
                        files_root_args,
                    )
                    if not sessions:
                        break
                    if len(sessions) == 1:
                        selected_session = sessions[0]
                        break
                continue
            if action == "select":
                selected_session = target
                break

    if selected_session is None:
        if not print_only:
            click.echo(
                f"Starting Setta on {ssh_target} (workspace {remote_workspace})..."
            )
        _start_remote_setta(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
            files_root=params.get("files_root"),
            files_root_base=params.get("files_root_base"),
            verbose=verbose,
        )
        selected_session = _wait_for_remote_session(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
            verbose=verbose,
        )

    if not print_only:
        click.echo(
            f"Using session {selected_session.id} (port {selected_session.port})."
        )

    connect_info = _fetch_remote_connect_info(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
        session_id=selected_session.id,
        latest=False,
    )
    bootstrap_url = connect_info["bootstrapUrlFragment"]
    token = _extract_token_from_bootstrap_url(bootstrap_url)
    resolved_local_port = local_port or _select_free_port("127.0.0.1")
    local_bootstrap_url, _ = build_bootstrap_urls(
        "127.0.0.1", resolved_local_port, token
    )
    if verbose:
        click.echo(f"Local bootstrap URL: {local_bootstrap_url}")
    tunnel_args = _build_ssh_tunnel_args(
        ssh_target,
        ssh_args_list,
        selected_session.host,
        resolved_local_port,
        selected_session.port,
    )

    if print_only:
        click.echo(shlex.join(tunnel_args))
        click.echo(local_bootstrap_url)
        click.echo(token)
        return

    if detach:
        click.echo(f"Opening local tunnel on {resolved_local_port} (background).")
        proc = subprocess.Popen(
            tunnel_args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        _ensure_background_process_started(proc)
        if not no_open:
            click.echo("Opening browser...")
            webbrowser.open(local_bootstrap_url, new=0)
        click.echo(
            f"Tunnel running in background (pid {proc.pid}, local port {resolved_local_port})."
        )
        click.echo(f"To stop: kill {proc.pid}")
        return

    click.echo(
        f"Opening local tunnel on {resolved_local_port} (keep this terminal open)."
    )
    proc = subprocess.Popen(tunnel_args)
    if not no_open:
        click.echo("Opening browser...")
        webbrowser.open(local_bootstrap_url, new=0)
    click.echo("Tunnel active (Ctrl+C to stop).")
    click.echo(
        "Tip: use --detach to background the tunnel or --print-only to copy commands."
    )
    proc.wait()


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
    "-w",
    "--workspace",
    type=click.Path(path_type=Path),
    default=None,
    help="Workspace root for code operations (defaults to CWD).",
)
@click.option(
    "--files-root",
    type=click.Path(path_type=Path),
    default=None,
    help="Root directory for setta_files (overrides --files-root-base).",
)
@click.option(
    "--files-root-base",
    type=click.Path(path_type=Path),
    default=None,
    help="Base directory for hashed setta_files roots.",
)
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
    workspace: Path | None,
    files_root: Path | None,
    files_root_base: Path | None,
    log_level: str | None,
    no_open: bool,
) -> None:
    ctx.ensure_object(dict)
    ctx.obj["reload"] = reload
    ctx.obj["host"] = host
    ctx.obj["port"] = port
    ctx.obj["workspace"] = workspace
    ctx.obj["files_root"] = files_root
    ctx.obj["files_root_base"] = files_root_base
    ctx.obj["log_level"] = log_level
    ctx.obj["no_open"] = no_open
    resolved_log_level = configure_logging(level_override=log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()
    paths_override = None
    if workspace is not None or files_root is not None or files_root_base is not None:
        paths_override = _resolve_cli_paths(
            workspace=workspace,
            files_root=files_root,
            files_root_base=files_root_base,
            validate=True,
        )
        _apply_paths_to_env(paths_override)
    if ctx.invoked_subcommand is None:
        logging.getLogger(__name__).info("Starting Setta")

        paths = paths_override or _resolve_cli_paths(
            workspace=workspace,
            files_root=files_root,
            files_root_base=files_root_base,
            validate=True,
        )
        if paths_override is None:
            _apply_paths_to_env(paths)

        resolved_host = host
        resolved_port = _resolve_port(resolved_host, port)
        C.HOST = resolved_host
        C.PORT = resolved_port

        sessions_root = paths.runtime_sessions_root
        registry = SessionRegistry(sessions_root=sessions_root)
        display_workspace = workspace or paths.workspace_root
        session = registry.create_session(
            paths.workspace_root,
            resolved_host,
            resolved_port,
            os.getpid(),
            workspace_display_path=str(display_workspace),
        )
        os.environ[SESSION_ID_ENV_VAR] = session.id
        os.environ[SESSIONS_ROOT_ENV_VAR] = str(sessions_root)
        secret = registry.load_secret(session)
        token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)

        bootstrap_url_fragment, bootstrap_url_plain = build_bootstrap_urls(
            resolved_host, resolved_port, token
        )
        auto_open = _should_auto_open(no_open)
        C.OPEN_BROWSER_ON_START = bootstrap_url_fragment if auto_open else None

        is_remote_session = _is_ssh_session()
        click.echo(
            _render_startup_message(
                session.id,
                resolved_host,
                resolved_port,
                Path(str(display_workspace)),
                bootstrap_url_fragment,
                bootstrap_url_plain,
                token,
                auto_open,
                is_remote_session,
            )
        )

        import uvicorn

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
cli.add_command(share)
cli.add_command(launch)
cli.add_command(status)
cli.add_command(auth)
cli.add_command(tools)
cli.add_command(api)
cli.add_command(stop)
cli.add_command(connect)
cli.add_command(connect, name="c")
