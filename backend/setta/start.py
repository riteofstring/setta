import base64
import json
import logging
import os
import shlex
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import click
import uvicorn

from setta import __version__
from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.logging.config import configure_logging
from setta.sessions import SessionMetadata, SessionRegistry
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C

_CONNECT_INFO_JSON_PREFIX = "__SETTA_JSON_B64__"
_DEFAULT_LOCAL_PORT = 61000


@dataclass
class RemoteSessionSummary:
    id: str
    workspace_path: str
    host: str
    port: int
    pid: int
    started_at: datetime


def _parse_json_payload(output: str) -> dict:
    for line in output.splitlines():
        if line.startswith(_CONNECT_INFO_JSON_PREFIX):
            encoded = line.removeprefix(_CONNECT_INFO_JSON_PREFIX)
            decoded = base64.b64decode(encoded).decode("utf-8")
            return json.loads(decoded)
    raise click.ClickException("Missing JSON payload from remote output.")


def _parse_session_list(payload: dict) -> list[RemoteSessionSummary]:
    sessions = payload.get("sessions", [])
    parsed: list[RemoteSessionSummary] = []
    for session in sessions:
        parsed.append(
            RemoteSessionSummary(
                id=session["id"],
                workspace_path=session["workspacePath"],
                host=session["host"],
                port=int(session["port"]),
                pid=int(session["pid"]),
                started_at=datetime.fromisoformat(session["startedAt"]),
            )
        )
    return parsed


def _parse_ssh_args(raw: str | None) -> list[str]:
    if not raw:
        return []
    return shlex.split(raw)


def _run_ssh_command(
    ssh_target: str,
    ssh_args: list[str],
    remote_command: str,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    cmd = ["ssh", *ssh_args, ssh_target, remote_command]
    if capture_output:
        return subprocess.run(cmd, check=False, capture_output=True, text=True)
    return subprocess.run(cmd, check=False)


def _build_remote_shell_command(shell: str, inner_command: str) -> str:
    return f"{shell} -lc {shlex.quote(inner_command)}"


def _resolve_remote_shell(ssh_target: str, ssh_args: list[str]) -> str:
    for candidate in ("bash", "sh"):
        result = _run_ssh_command(
            ssh_target,
            ssh_args,
            f"command -v {candidate}",
            capture_output=True,
        )
        if result.returncode == 255:
            details = (result.stderr or result.stdout or "").strip()
            hint = "SSH failed while probing remote shell."
            if details:
                raise click.ClickException(f"{hint} {details}")
            raise click.ClickException(
                f"{hint} Check that SSH is reachable and credentials are valid."
            )
        if result.returncode == 0:
            return candidate
    raise click.ClickException(
        "Remote shell not found (bash/sh missing). Use --remote-cmd and ensure a POSIX shell is available."
    )


def _resolve_remote_workspace(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
) -> str:
    inner = f"cd {shlex.quote(workspace)} && pwd -P"
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        _build_remote_shell_command(shell, inner),
        capture_output=True,
    )
    if result.returncode != 0:
        raise click.ClickException(
            f"Failed to resolve remote workspace: {result.stderr.strip() or result.stdout.strip()}"
        )
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise click.ClickException("Failed to resolve remote workspace path.")
    return lines[-1]


def _resolve_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    remote_cmd: str | None,
) -> str:
    if remote_cmd:
        return remote_cmd
    activation = "source" if shell == "bash" else "."
    quoted_workspace = shlex.quote(workspace)
    inner = (
        f"cd {quoted_workspace} || exit 1;"
        f'if [ -f "./.venv/bin/activate" ]; then printf \'%s\' "{activation} ./.venv/bin/activate && setta"; exit 0; fi;'
        f'if [ -f "./venv/bin/activate" ]; then printf \'%s\' "{activation} ./venv/bin/activate && setta"; exit 0; fi;'
        f'if [ -f "./env/bin/activate" ]; then printf \'%s\' "{activation} ./env/bin/activate && setta"; exit 0; fi;'
        'if [ -f "pyproject.toml" ] && command -v poetry >/dev/null 2>&1; then printf \'%s\' "poetry run setta"; exit 0; fi;'
        'if [ -f "pyproject.toml" ] && command -v uv >/dev/null 2>&1; then printf \'%s\' "uv run setta"; exit 0; fi;'
        'if [ -n "$CONDA_PREFIX" ]; then printf \'%s\' "setta"; exit 0; fi;'
        "if command -v setta >/dev/null 2>&1; then printf '%s' \"setta\"; exit 0; fi;"
        "exit 2;"
    )
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        _build_remote_shell_command(shell, inner),
        capture_output=True,
    )
    if result.returncode != 0:
        raise click.ClickException(
            "Unable to resolve remote Setta command. Use --remote-cmd "
            "'source .venv/bin/activate && setta' (or equivalent)."
        )
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise click.ClickException(
            "Remote Setta command resolution returned no output. Use --remote-cmd."
        )
    return lines[-1]


def _remote_command_exists(ssh_target: str, ssh_args: list[str], command: str) -> bool:
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        f"command -v {shlex.quote(command)}",
        capture_output=True,
    )
    return result.returncode == 0


def _run_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    setta_args: str,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    quoted_workspace = shlex.quote(workspace)
    inner = f"cd {quoted_workspace} && {setta_command} {setta_args}"
    remote_command = _build_remote_shell_command(shell, inner)
    return _run_ssh_command(
        ssh_target, ssh_args, remote_command, capture_output=capture_output
    )


def _fetch_remote_sessions(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
) -> list[RemoteSessionSummary]:
    quoted_workspace = shlex.quote(workspace)
    result = _run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        f"status --list-sessions --json --workspace {quoted_workspace}",
        capture_output=True,
    )
    if result.returncode != 0:
        raise click.ClickException(
            f"Failed to list remote sessions: {result.stderr.strip() or result.stdout.strip()}"
        )
    payload = _parse_json_payload(result.stdout)
    return _parse_session_list(payload)


def _fetch_remote_connect_info(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    session_id: str | None,
    latest: bool,
) -> dict:
    quoted_workspace = shlex.quote(workspace)
    args = f"status --connect-info --json --workspace {quoted_workspace}"
    if session_id:
        args += f" --session {shlex.quote(session_id)}"
    elif latest:
        args += " --latest"
    result = _run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        args,
        capture_output=True,
    )
    if result.returncode != 0:
        raise click.ClickException(
            f"Failed to read remote connect info: {result.stderr.strip() or result.stdout.strip()}"
        )
    return _parse_json_payload(result.stdout)


def _delete_remote_session(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    session_id: str,
) -> None:
    result = _run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        f"status --delete-session {shlex.quote(session_id)}",
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
) -> None:
    runner = None
    if _remote_command_exists(ssh_target, ssh_args, "nohup"):
        runner = "nohup"
    elif _remote_command_exists(ssh_target, ssh_args, "setsid"):
        runner = "setsid"
    if runner is None:
        raise click.ClickException(
            "Remote host missing nohup/setsid for background start. Use --remote-cmd."
        )
    log_file = C.RUN_LOGS_FOLDER / "nohup.out"
    start_cmd = f"cd {shlex.quote(workspace)} && {setta_command} --no-open"
    quoted_start = shlex.quote(start_cmd)
    if runner == "nohup":
        launch = (
            f"mkdir -p {shlex.quote(str(C.RUN_LOGS_FOLDER))} && "
            f"nohup {shell} -lc {quoted_start} > {shlex.quote(str(log_file))} 2>&1 &"
        )
    else:
        launch = (
            f"mkdir -p {shlex.quote(str(C.RUN_LOGS_FOLDER))} && "
            f"setsid {shell} -lc {quoted_start} > {shlex.quote(str(log_file))} 2>&1 < /dev/null &"
        )
    inner = launch
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        _build_remote_shell_command(shell, inner),
        capture_output=True,
    )
    if result.returncode != 0:
        raise click.ClickException(
            f"Failed to start remote Setta: {result.stderr.strip() or result.stdout.strip()}"
        )


def _wait_for_remote_session(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    timeout_seconds: float = 30.0,
) -> RemoteSessionSummary:
    deadline = time.monotonic() + timeout_seconds
    while True:
        sessions = _fetch_remote_sessions(
            ssh_target, ssh_args, shell, workspace, setta_command
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


def _extract_token_from_bootstrap_url(url: str) -> str:
    marker = "#token="
    if marker not in url:
        raise click.ClickException("Bootstrap URL missing token fragment.")
    return url.split(marker, 1)[1]


def _build_ssh_tunnel_args(
    ssh_target: str,
    ssh_args: list[str],
    local_port: int,
    remote_port: int,
) -> list[str]:
    return [
        "ssh",
        *ssh_args,
        "-N",
        "-L",
        f"{local_port}:127.0.0.1:{remote_port}",
        "-o",
        "ExitOnForwardFailure=yes",
        ssh_target,
    ]


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
    if not sys.stdin.isatty() and not IS_DEV_MODE:
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
        lines.append("Open this URL in your browser (recommended):")
        lines.append(f"  {bootstrap_url_fragment}")
        lines.append(
            "If the page prompts for a token (fragment stripped or you prefer manual entry), open:"
        )
        lines.append(f"  {bootstrap_url_plain}")
        lines.append("  and paste:")
        lines.append(f"    {token}")
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
@click.option(
    "--list-sessions",
    is_flag=True,
    help="List sessions for SSH connect selection (JSON only)",
)
@click.option("--delete-session", "delete_session_id", default=None)
@click.option("--json", "json_output", is_flag=True, help="Emit JSON (base64) payload")
@click.option("--workspace", type=click.Path(path_type=Path))
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

    registry = SessionRegistry()
    if delete_session_id:
        sessions = registry.load_sessions(prune_stale=False)
        target = next(
            (session for session in sessions if session.id == delete_session_id), None
        )
        if target is None:
            raise click.ClickException(f"Session {delete_session_id} not found.")
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


@click.command()
@click.argument("ssh_target")
@click.option("--workspace", required=True)
@click.option("--session", "session_id", default=None)
@click.option("--latest", is_flag=True)
@click.option("--ssh-args", default=None)
@click.option("--remote-cmd", default=None)
@click.option("--local-port", type=click.IntRange(1, 65535), default=None)
@click.option("--detach", is_flag=True)
@click.option("--print-only", is_flag=True)
@click.option("--no-open", is_flag=True)
def connect(
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
) -> None:
    if session_id and latest:
        raise click.ClickException("Use either --session or --latest, not both.")
    if detach and print_only:
        raise click.ClickException("Use either --detach or --print-only, not both.")

    ssh_args_list = _parse_ssh_args(ssh_args)
    shell = _resolve_remote_shell(ssh_target, ssh_args_list)
    remote_workspace = _resolve_remote_workspace(
        ssh_target, ssh_args_list, shell, workspace
    )
    setta_command = _resolve_remote_setta_command(
        ssh_target, ssh_args_list, shell, remote_workspace, remote_cmd
    )

    sessions = _fetch_remote_sessions(
        ssh_target, ssh_args_list, shell, remote_workspace, setta_command
    )
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
                        target.id,
                    )
                    sessions = _fetch_remote_sessions(
                        ssh_target,
                        ssh_args_list,
                        shell,
                        remote_workspace,
                        setta_command,
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
            ssh_target, ssh_args_list, shell, remote_workspace, setta_command
        )
        selected_session = _wait_for_remote_session(
            ssh_target, ssh_args_list, shell, remote_workspace, setta_command
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
        session_id=selected_session.id,
        latest=False,
    )
    bootstrap_url = connect_info["bootstrapUrlFragment"]
    token = _extract_token_from_bootstrap_url(bootstrap_url)
    resolved_local_port = local_port or _select_free_port("127.0.0.1")
    tunnel_args = _build_ssh_tunnel_args(
        ssh_target, ssh_args_list, resolved_local_port, selected_session.port
    )

    if print_only:
        click.echo(shlex.join(tunnel_args))
        click.echo(bootstrap_url)
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
        if not no_open:
            click.echo("Opening browser...")
            webbrowser.open(bootstrap_url, new=0)
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
        webbrowser.open(bootstrap_url, new=0)
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

        bootstrap_url_fragment, bootstrap_url_plain = _build_bootstrap_urls(
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
                Path.cwd().resolve(),
                bootstrap_url_fragment,
                bootstrap_url_plain,
                token,
                auto_open,
                is_remote_session,
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
cli.add_command(connect)
