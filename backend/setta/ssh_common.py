import base64
import json
import os
import re
import shlex
import socket
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from setta.launch import LaunchError
from setta.utils.network import format_host_for_ssh_tunnel
from setta.utils.paths import build_files_root_from_base

_CONNECT_INFO_JSON_PREFIX = "__SETTA_JSON_B64__"
_TILDE_PREFIX_RE = re.compile(r"^~[A-Za-z0-9_.-]*$")


@dataclass(frozen=True)
class RemoteSessionSummary:
    id: str
    workspace_path: str
    workspace_path_canonical: str
    host: str
    port: int
    pid: int
    started_at: datetime


def ssh_command_prefix(*, batch_mode: bool) -> list[str]:
    ssh_bin = os.environ.get("SETTA_SSH_BIN") or "ssh"
    prefix = [ssh_bin]
    if batch_mode:
        # BatchMode forces SSH to fail fast instead of prompting.
        prefix += ["-o", "BatchMode=yes"]
    return prefix


def parse_ssh_args(raw: str | None) -> list[str]:
    if not raw:
        return []
    return shlex.split(raw)


def build_remote_shell_command(shell: str, inner_command: str) -> str:
    return f"{shell} -lc {shlex.quote(inner_command)}"


def run_ssh_command(
    ssh_target: str,
    ssh_args: list[str],
    remote_command: str,
    *,
    ssh_prefix: list[str],
    timeout: float | None = 15.0,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    cmd = [*ssh_prefix, *ssh_args, ssh_target, remote_command]
    try:
        return subprocess.run(
            cmd,
            check=False,
            capture_output=capture_output,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise LaunchError("SshTimeout", f"SSH command timed out: {exc.cmd}") from exc


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


def parse_json_payload(output: str) -> dict[str, Any]:
    return _parse_json_payload(output)


def parse_session_list(payload: dict[str, Any]) -> list[RemoteSessionSummary]:
    raw_sessions = payload.get("sessions", [])
    if not isinstance(raw_sessions, list):
        raise LaunchError("RemoteSessionList", "Remote sessions payload is invalid.")
    sessions: list[RemoteSessionSummary] = []
    for session in raw_sessions:
        if not isinstance(session, dict):
            continue
        missing = [
            key
            for key in (
                "id",
                "host",
                "port",
                "pid",
                "startedAt",
            )
            if key not in session
        ]
        if missing:
            missing_joined = ", ".join(missing)
            raise LaunchError(
                "RemoteSessionList",
                f"Remote sessions payload missing required key(s): {missing_joined}.",
            )
        session_id = session.get("id")
        if not isinstance(session_id, str) or not session_id.strip():
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid id values.",
            )
        host = session.get("host")
        if not isinstance(host, str) or not host.strip():
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid host values.",
            )
        try:
            port = int(session.get("port"))
        except (TypeError, ValueError) as exc:
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid port values.",
            ) from exc
        try:
            pid = int(session.get("pid"))
        except (TypeError, ValueError) as exc:
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid pid values.",
            ) from exc
        started_at_raw = session.get("startedAt")
        if not isinstance(started_at_raw, str) or not started_at_raw.strip():
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid startedAt values.",
            )
        try:
            started_at = datetime.fromisoformat(started_at_raw)
        except Exception as exc:
            raise LaunchError(
                "RemoteSessionList",
                "Remote sessions payload has invalid startedAt values.",
            ) from exc
        workspace_path = session.get("workspacePath", "")
        if not isinstance(workspace_path, str):
            workspace_path = ""
        workspace_path_canonical = session.get("workspacePathCanonical", "")
        if not isinstance(workspace_path_canonical, str):
            workspace_path_canonical = ""
        sessions.append(
            RemoteSessionSummary(
                id=session_id,
                workspace_path=workspace_path,
                workspace_path_canonical=workspace_path_canonical,
                host=host,
                port=port,
                pid=pid,
                started_at=started_at,
            )
        )
    return sessions


def has_control_socket_option(ssh_args: list[str]) -> bool:
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


def apply_control_socket_args(ssh_args: list[str]) -> list[str]:
    if has_control_socket_option(ssh_args):
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


def resolve_remote_shell(
    ssh_target: str,
    ssh_args: list[str],
    *,
    ssh_prefix: list[str],
) -> str:
    for candidate in ("bash", "sh"):
        result = run_ssh_command(
            ssh_target,
            ssh_args,
            f"command -v {candidate}",
            ssh_prefix=ssh_prefix,
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
    if not tilde_prefix:
        return None
    if not _TILDE_PREFIX_RE.fullmatch(tilde_prefix):
        raise LaunchError(
            "RemoteWorkspace",
            f"Invalid remote workspace path. Unsupported tilde prefix: {tilde_prefix!r}",
        )
    return tilde_prefix, remainder.lstrip("/")


def resolve_remote_workspace(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    *,
    ssh_prefix: list[str],
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
    result = run_ssh_command(
        ssh_target,
        ssh_args,
        build_remote_shell_command(shell, inner),
        ssh_prefix=ssh_prefix,
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


def resolve_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    remote_cmd: str | None,
    *,
    ssh_prefix: list[str],
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
    result = run_ssh_command(
        ssh_target,
        ssh_args,
        build_remote_shell_command(shell, inner),
        ssh_prefix=ssh_prefix,
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


def build_remote_files_root_args(
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


def run_remote_setta_command(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    setta_args: str,
    *,
    ssh_prefix: list[str],
    timeout: float | None = 30.0,
) -> subprocess.CompletedProcess[str]:
    quoted_workspace = shlex.quote(workspace)
    inner = f"cd {quoted_workspace} && {setta_command} {setta_args}"
    remote_command = build_remote_shell_command(shell, inner)
    return run_ssh_command(
        ssh_target,
        ssh_args,
        remote_command,
        ssh_prefix=ssh_prefix,
        timeout=timeout,
    )


def fetch_remote_sessions(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    ssh_prefix: list[str],
) -> list[RemoteSessionSummary]:
    quoted_workspace = shlex.quote(workspace)
    root_prefix = f"{files_root_args} " if files_root_args else ""
    result = run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        f"{root_prefix}status --list-sessions --json --workspace {quoted_workspace}",
        ssh_prefix=ssh_prefix,
    )
    if result.returncode != 0:
        details = (result.stderr.strip() or result.stdout.strip() or "").strip()
        raise LaunchError(
            "RemoteSessions",
            f"Failed to list remote sessions. {details}".strip(),
        )
    payload = _parse_json_payload(result.stdout)
    return parse_session_list(payload)


def wait_for_remote_sessions(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    ssh_prefix: list[str],
    timeout_seconds: float,
) -> list[RemoteSessionSummary]:
    deadline = time.monotonic() + timeout_seconds
    while True:
        sessions = fetch_remote_sessions(
            ssh_target,
            ssh_args,
            shell,
            workspace,
            setta_command,
            files_root_args,
            ssh_prefix=ssh_prefix,
        )
        if sessions:
            return sessions
        if time.monotonic() >= deadline:
            raise LaunchError(
                "RemoteLaunchTimeout",
                "Timed out waiting for remote Setta session to start.",
            )
        time.sleep(0.5)


def fetch_remote_connect_info(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    session_id: str,
    ssh_prefix: list[str],
) -> dict[str, Any]:
    quoted_workspace = shlex.quote(workspace)
    root_prefix = f"{files_root_args} " if files_root_args else ""
    args = (
        f"{root_prefix}status --connect-info --json --workspace {quoted_workspace}"
        f" --session {shlex.quote(session_id)}"
    )
    result = run_remote_setta_command(
        ssh_target,
        ssh_args,
        shell,
        workspace,
        setta_command,
        args,
        ssh_prefix=ssh_prefix,
    )
    if result.returncode != 0:
        details = (result.stderr.strip() or result.stdout.strip() or "").strip()
        raise LaunchError(
            "RemoteConnectInfo",
            f"Failed to read remote connect info. {details}".strip(),
        )
    return _parse_json_payload(result.stdout)


def _remote_command_exists(
    ssh_target: str,
    ssh_args: list[str],
    command: str,
    *,
    ssh_prefix: list[str],
) -> bool:
    result = run_ssh_command(
        ssh_target,
        ssh_args,
        f"command -v {shlex.quote(command)}",
        ssh_prefix=ssh_prefix,
    )
    return result.returncode == 0


def _is_safe_remote_path(value: str) -> bool:
    raw = value.strip()
    return raw.startswith("/") and not any(ch.isspace() for ch in raw)


def _resolve_remote_logs_dir(
    *,
    workspace: str,
    files_root: str | None,
    files_root_base: str | None,
) -> str:
    if (
        files_root is not None
        and files_root.strip()
        and _is_safe_remote_path(files_root)
    ):
        root = files_root.strip().rstrip("/")
        return f"{root}/runtime/logs"
    if (
        files_root_base is not None
        and files_root_base.strip()
        and _is_safe_remote_path(files_root_base)
        and _is_safe_remote_path(workspace)
    ):
        computed = build_files_root_from_base(
            Path(files_root_base.strip()),
            Path(workspace),
        )
        return f"{str(computed).rstrip('/')}/runtime/logs"
    # Avoid creating unexpected workspace-relative `setta_files/` directories on the
    # remote host for detached-root launches.
    return "/tmp"


def start_remote_setta(
    ssh_target: str,
    ssh_args: list[str],
    shell: str,
    workspace: str,
    setta_command: str,
    files_root_args: str,
    *,
    ssh_prefix: list[str],
    files_root: str | None,
    files_root_base: str | None,
) -> None:
    runner = None
    if _remote_command_exists(ssh_target, ssh_args, "setsid", ssh_prefix=ssh_prefix):
        runner = "setsid"
    elif _remote_command_exists(ssh_target, ssh_args, "nohup", ssh_prefix=ssh_prefix):
        runner = "nohup"
    if runner is None:
        raise LaunchError(
            "RemoteStart",
            "Remote host missing nohup/setsid for background start. Provide remoteCmd.",
        )

    remote_logs_dir = _resolve_remote_logs_dir(
        workspace=workspace,
        files_root=files_root,
        files_root_base=files_root_base,
    )
    remote_log_file = f"{remote_logs_dir}/nohup.out"
    root_prefix = f"{files_root_args} " if files_root_args else ""
    start_cmd = f"cd {shlex.quote(workspace)} && {setta_command} {root_prefix}--no-open"
    quoted_start = shlex.quote(start_cmd)
    launch = (
        f"cd {shlex.quote(workspace)} && "
        f"mkdir -p {shlex.quote(remote_logs_dir)} && "
        f"{runner} {shell} -lc {quoted_start} > {shlex.quote(remote_log_file)} 2>&1 < /dev/null &"
    )
    remote_command = build_remote_shell_command(shell, launch)
    try:
        result = run_ssh_command(
            ssh_target,
            ssh_args,
            remote_command,
            ssh_prefix=ssh_prefix,
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


def extract_token_from_bootstrap_url(url: str) -> str:
    marker = "#token="
    if marker not in url:
        raise LaunchError("RemoteToken", "Bootstrap URL missing token fragment.")
    return url.split(marker, 1)[1]


def build_ssh_tunnel_args(
    ssh_target: str,
    ssh_args: list[str],
    host: str,
    local_port: int,
    remote_port: int,
    *,
    ssh_prefix: list[str],
) -> list[str]:
    tunnel_host = format_host_for_ssh_tunnel(host)
    return [
        *ssh_prefix,
        *ssh_args,
        "-N",
        "-L",
        f"{local_port}:{tunnel_host}:{remote_port}",
        "-o",
        "ExitOnForwardFailure=yes",
        ssh_target,
    ]


def ensure_background_process_started(
    proc: subprocess.Popen[str], *, wait_seconds: float = 0.2
) -> None:
    time.sleep(wait_seconds)
    if proc.poll() is not None:
        raise LaunchError(
            "TunnelStartFailed",
            f"SSH tunnel failed to start (exit {proc.returncode}).",
        )


def select_free_port(host: str) -> int:
    addr_info = socket.getaddrinfo(host, 0, type=socket.SOCK_STREAM)
    family, socktype, proto, _, sockaddr = addr_info[0]
    with socket.socket(family, socktype, proto) as sock:
        sock.bind(sockaddr)
        return sock.getsockname()[1]
