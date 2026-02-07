import base64
import json
import os
import shlex
import socket
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from setta.launch import LaunchError
from setta.utils.network import build_bootstrap_urls, format_host_for_ssh_tunnel

_CONNECT_INFO_JSON_PREFIX = "__SETTA_JSON_B64__"


@dataclass(frozen=True)
class RemoteSessionSummary:
    id: str
    workspace_path: str
    workspace_path_canonical: str
    host: str
    port: int
    pid: int
    started_at: datetime


@dataclass(frozen=True)
class RemoteConnectResult:
    bootstrap_url_fragment: str
    session: RemoteSessionSummary
    started_new: bool


def connect_remote_workspace_session(
    *,
    ssh_target: str,
    workspace: str,
    files_root: str | None,
    files_root_base: str | None,
    ssh_args: str | None = None,
    remote_cmd: str | None = None,
    local_port: int | None = None,
    timeout_seconds: float = 30.0,
) -> RemoteConnectResult:
    if not ssh_target or not ssh_target.strip():
        raise LaunchError("InvalidSshTarget", "sshTarget must be a non-empty string.")
    if not workspace or not workspace.strip():
        raise LaunchError(
            "InvalidWorkspace",
            "--workspace is required for SSH connect.",
        )
    if local_port is not None and not (1 <= local_port <= 65535):
        raise LaunchError("InvalidLocalPort", f"Invalid local port: {local_port}")

    try:
        resolved_local_port = local_port or _select_free_port("127.0.0.1")
    except OSError as exc:
        raise LaunchError(
            "LocalPortSelection",
            "Unable to select a local tunnel port. Provide localPort to override.",
        ) from exc

    ssh_args_list = _apply_control_socket_args(_parse_ssh_args(ssh_args))
    shell = _resolve_remote_shell(ssh_target, ssh_args_list)
    remote_workspace = _resolve_remote_workspace(
        ssh_target,
        ssh_args_list,
        shell,
        workspace,
    )
    setta_command = _resolve_remote_setta_command(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        remote_cmd,
    )
    files_root_args = _build_remote_files_root_args(
        files_root=files_root,
        files_root_base=files_root_base,
    )
    sessions = _fetch_remote_sessions(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
    )
    started_new = False
    if not sessions:
        started_new = True
        _start_remote_setta(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
        )
        sessions = _wait_for_remote_sessions(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
            timeout_seconds=timeout_seconds,
        )
    session = max(sessions, key=lambda entry: entry.started_at)
    connect_info = _fetch_remote_connect_info(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
        session_id=session.id,
    )
    remote_bootstrap_url = connect_info.get("bootstrapUrlFragment")
    if not isinstance(remote_bootstrap_url, str) or not remote_bootstrap_url:
        raise LaunchError(
            "RemoteConnectInfo",
            "Remote connect info did not include a bootstrapUrlFragment.",
        )
    token = _extract_token_from_bootstrap_url(remote_bootstrap_url)

    local_bootstrap_url, _ = build_bootstrap_urls(
        "127.0.0.1",
        resolved_local_port,
        token,
    )

    tunnel_args = _build_ssh_tunnel_args(
        ssh_target,
        ssh_args_list,
        session.host,
        resolved_local_port,
        session.port,
    )
    proc = subprocess.Popen(
        tunnel_args,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _ensure_background_process_started(proc)

    return RemoteConnectResult(
        bootstrap_url_fragment=local_bootstrap_url,
        session=session,
        started_new=started_new,
    )


def _run_ssh_command(
    ssh_target: str,
    ssh_args: list[str],
    remote_command: str,
    *,
    timeout: float | None = 15.0,
) -> subprocess.CompletedProcess[str]:
    cmd = [*(_ssh_command_prefix()), *ssh_args, ssh_target, remote_command]
    try:
        return subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise LaunchError("SshTimeout", f"SSH command timed out: {exc.cmd}") from exc


def _ssh_command_prefix() -> list[str]:
    # BatchMode forces SSH to fail fast instead of prompting (the UI cannot handle prompts).
    ssh_bin = os.environ.get("SETTA_SSH_BIN") or "ssh"
    return [ssh_bin, "-o", "BatchMode=yes"]


def _build_remote_shell_command(shell: str, inner_command: str) -> str:
    return f"{shell} -lc {shlex.quote(inner_command)}"


def _parse_json_payload(output: str) -> dict[str, Any]:
    for line in output.splitlines():
        if line.startswith(_CONNECT_INFO_JSON_PREFIX):
            encoded = line.removeprefix(_CONNECT_INFO_JSON_PREFIX)
            try:
                decoded = base64.b64decode(encoded).decode("utf-8")
                data = json.loads(decoded)
            except Exception as exc:
                raise LaunchError(
                    "RemoteJsonPayload",
                    "Failed to decode remote Setta JSON payload.",
                ) from exc
            if not isinstance(data, dict):
                raise LaunchError(
                    "RemoteJsonPayload",
                    "Remote Setta JSON payload is not an object.",
                )
            return data
    raise LaunchError(
        "RemoteJsonPayload",
        "Missing JSON payload from remote output.",
    )


def _parse_session_list(payload: dict[str, Any]) -> list[RemoteSessionSummary]:
    raw_sessions = payload.get("sessions", [])
    if not isinstance(raw_sessions, list):
        raise LaunchError("RemoteSessionList", "Remote sessions payload is invalid.")
    sessions: list[RemoteSessionSummary] = []
    for session in raw_sessions:
        if not isinstance(session, dict):
            continue
        try:
            started_at = datetime.fromisoformat(str(session["startedAt"]))
        except Exception as exc:
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid startedAt values.",
            ) from exc
        sessions.append(
            RemoteSessionSummary(
                id=str(session["id"]),
                workspace_path=str(session["workspacePath"]),
                workspace_path_canonical=str(session["workspacePathCanonical"]),
                host=str(session["host"]),
                port=int(session["port"]),
                pid=int(session["pid"]),
                started_at=started_at,
            )
        )
    return sessions


def _parse_ssh_args(raw: str | None) -> list[str]:
    if not raw:
        return []
    return shlex.split(raw)


def _has_control_socket_option(ssh_args: list[str]) -> bool:
    control_keys = ("controlmaster", "controlpath", "controlpersist")
    for idx, arg in enumerate(ssh_args):
        if arg in {"-M", "-S"}:
            return True
        if arg.startswith("-S") and len(arg) > 2:
            return True
        lower = arg.lower()
        if lower == "-o":
            if idx + 1 >= len(ssh_args):
                continue
            option = ssh_args[idx + 1].lower()
            if any(option.startswith(f"{key}=") for key in control_keys):
                return True
            continue
        if lower.startswith("-o"):
            option = lower[2:]
            if any(option.startswith(f"{key}=") for key in control_keys):
                return True
    return False


def _apply_control_socket_args(ssh_args: list[str]) -> list[str]:
    if _has_control_socket_option(ssh_args):
        return ssh_args
    control_args = [
        "-o",
        "ControlMaster=auto",
        "-o",
        "ControlPersist=5m",
        "-o",
        "ControlPath=~/.ssh/setta-ctl-%r@%h:%p",
    ]
    return control_args + ssh_args


def _resolve_remote_shell(ssh_target: str, ssh_args: list[str]) -> str:
    for candidate in ("bash", "sh"):
        result = _run_ssh_command(
            ssh_target,
            ssh_args,
            f"command -v {candidate}",
        )
        if result.returncode == 0:
            return candidate
        if result.returncode == 255:
            details = (result.stderr or result.stdout or "").strip()
            raise LaunchError(
                "SshFailed",
                f"SSH failed while probing remote shell. {details}".strip(),
            )
    raise LaunchError("RemoteShell", "Remote shell not found (bash/sh missing).")


def _split_tilde_path(path: str) -> tuple[str, str] | None:
    if not path.startswith("~"):
        return None
    tilde_prefix, _, remainder = path.partition("/")
    if not tilde_prefix or any(ch.isspace() for ch in tilde_prefix):
        return None
    return tilde_prefix, remainder.lstrip("/")


def _resolve_remote_workspace(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
) -> str:
    tilde_parts = _split_tilde_path(workspace)
    if tilde_parts is None:
        inner = f"cd {shlex.quote(workspace)} && pwd -P"
    else:
        tilde_prefix, rest = tilde_parts
        if rest:
            inner = f"cd {tilde_prefix} && cd {shlex.quote(rest)} && pwd -P"
        else:
            inner = f"cd {tilde_prefix} && pwd -P"
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        _build_remote_shell_command(shell, inner),
    )
    if result.returncode != 0:
        details = (result.stderr.strip() or result.stdout.strip() or "").strip()
        raise LaunchError(
            "RemoteWorkspace",
            f"Failed to resolve remote workspace. {details}".strip(),
        )
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise LaunchError("RemoteWorkspace", "Failed to resolve remote workspace path.")
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
        "if command -v setta >/dev/null 2>&1; then printf '%s' \"setta\"; exit 0; fi;"
        "exit 2;"
    )
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        _build_remote_shell_command(shell, inner),
    )
    if result.returncode != 0:
        raise LaunchError(
            "RemoteSettaCmd",
            "Unable to resolve remote Setta command. Provide remoteCmd or ensure setta is installed.",
        )
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise LaunchError(
            "RemoteSettaCmd",
            "Remote Setta command resolution returned no output.",
        )
    return lines[-1]


def _run_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    setta_args: str,
) -> subprocess.CompletedProcess[str]:
    quoted_workspace = shlex.quote(workspace)
    inner = f"cd {quoted_workspace} && {setta_command} {setta_args}"
    remote_command = _build_remote_shell_command(shell, inner)
    return _run_ssh_command(
        ssh_target,
        ssh_args,
        remote_command,
        timeout=30.0,
    )


def _build_remote_files_root_args(
    *,
    files_root: str | None,
    files_root_base: str | None,
) -> str:
    args: list[str] = []
    if files_root is not None and files_root.strip():
        args.append(f"--files-root {shlex.quote(files_root)}")
    if files_root_base is not None and files_root_base.strip():
        args.append(f"--files-root-base {shlex.quote(files_root_base)}")
    return " ".join(args)


def _fetch_remote_sessions(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
) -> list[RemoteSessionSummary]:
    quoted_workspace = shlex.quote(workspace)
    root_prefix = f"{files_root_args} " if files_root_args else ""
    result = _run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        f"{root_prefix}status --list-sessions --json --workspace {quoted_workspace}",
    )
    if result.returncode != 0:
        details = (result.stderr.strip() or result.stdout.strip() or "").strip()
        raise LaunchError(
            "RemoteSessions",
            f"Failed to list remote sessions. {details}".strip(),
        )
    payload = _parse_json_payload(result.stdout)
    return _parse_session_list(payload)


def _wait_for_remote_sessions(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    timeout_seconds: float,
) -> list[RemoteSessionSummary]:
    deadline = time.monotonic() + timeout_seconds
    while True:
        sessions = _fetch_remote_sessions(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            setta_command,
            files_root_args,
        )
        if sessions:
            return sessions
        if time.monotonic() >= deadline:
            raise LaunchError(
                "RemoteLaunchTimeout",
                "Timed out waiting for remote Setta session to start.",
            )
        time.sleep(0.5)


def _fetch_remote_connect_info(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    session_id: str,
) -> dict[str, Any]:
    quoted_workspace = shlex.quote(workspace)
    root_prefix = f"{files_root_args} " if files_root_args else ""
    args = (
        f"{root_prefix}status --connect-info --json --workspace {quoted_workspace}"
        f" --session {shlex.quote(session_id)}"
    )
    result = _run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        args,
    )
    if result.returncode != 0:
        details = (result.stderr.strip() or result.stdout.strip() or "").strip()
        raise LaunchError(
            "RemoteConnectInfo",
            f"Failed to read remote connect info. {details}".strip(),
        )
    return _parse_json_payload(result.stdout)


def _remote_command_exists(ssh_target: str, ssh_args: list[str], command: str) -> bool:
    result = _run_ssh_command(
        ssh_target,
        ssh_args,
        f"command -v {shlex.quote(command)}",
    )
    return result.returncode == 0


def _start_remote_setta(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
) -> None:
    runner = None
    if _remote_command_exists(ssh_target, ssh_args, "setsid"):
        runner = "setsid"
    elif _remote_command_exists(ssh_target, ssh_args, "nohup"):
        runner = "nohup"
    if runner is None:
        raise LaunchError(
            "RemoteStart",
            "Remote host missing nohup/setsid for background start. Provide remoteCmd.",
        )
    remote_logs_dir = "setta_files/runtime/logs"
    remote_log_file = f"{remote_logs_dir}/nohup.out"
    root_prefix = f"{files_root_args} " if files_root_args else ""
    start_cmd = f"cd {shlex.quote(workspace)} && {setta_command} {root_prefix}--no-open"
    quoted_start = shlex.quote(start_cmd)
    if runner == "nohup":
        launch = (
            f"cd {shlex.quote(workspace)} && "
            f"mkdir -p {shlex.quote(remote_logs_dir)} && "
            f"nohup {shell} -lc {quoted_start} > {shlex.quote(remote_log_file)} 2>&1 < /dev/null &"
        )
    else:
        launch = (
            f"cd {shlex.quote(workspace)} && "
            f"mkdir -p {shlex.quote(remote_logs_dir)} && "
            f"setsid {shell} -lc {quoted_start} > {shlex.quote(remote_log_file)} 2>&1 < /dev/null &"
        )
    remote_command = _build_remote_shell_command(shell, launch)
    try:
        result = _run_ssh_command(
            ssh_target,
            ssh_args,
            remote_command,
            timeout=10.0,
        )
    except LaunchError:
        # When the start command is backgrounded (nohup/setsid) some hosts can hang
        # briefly. We'll rely on the session polling timeout instead.
        return
    if result.returncode != 0:
        details = (result.stderr.strip() or result.stdout.strip() or "").strip()
        raise LaunchError(
            "RemoteStart",
            f"Failed to start remote Setta. {details}".strip(),
        )


def _extract_token_from_bootstrap_url(url: str) -> str:
    marker = "#token="
    if marker not in url:
        raise LaunchError("RemoteToken", "Bootstrap URL missing token fragment.")
    return url.split(marker, 1)[1]


def _build_ssh_tunnel_args(
    ssh_target: str,
    ssh_args: list[str],
    host: str,
    local_port: int,
    remote_port: int,
) -> list[str]:
    tunnel_host = format_host_for_ssh_tunnel(host)
    return [
        *_ssh_command_prefix(),
        *ssh_args,
        "-N",
        "-L",
        f"{local_port}:{tunnel_host}:{remote_port}",
        "-o",
        "ExitOnForwardFailure=yes",
        ssh_target,
    ]


def _ensure_background_process_started(
    proc: subprocess.Popen[str], wait_seconds: float = 0.2
) -> None:
    time.sleep(wait_seconds)
    if proc.poll() is not None:
        raise LaunchError(
            "TunnelStartFailed",
            f"SSH tunnel failed to start (exit {proc.returncode}).",
        )


def _select_free_port(host: str) -> int:
    addr_info = socket.getaddrinfo(host, 0, type=socket.SOCK_STREAM)
    family, socktype, proto, _, sockaddr = addr_info[0]
    with socket.socket(family, socktype, proto) as sock:
        sock.bind(sockaddr)
        return sock.getsockname()[1]
