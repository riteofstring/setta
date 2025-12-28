import json
import os
import secrets
import shlex
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import psutil
import requests

from setta.local_ui_server import CONFIG_ENDPOINT
from setta.session import (
    SESSION_DIR_MODE,
    SESSION_FILE_MODE,
    current_timestamp,
    ensure_dir,
    ensure_log_file,
    resolve_run_root,
)
from setta.types.routes import Route

if TYPE_CHECKING:
    from subprocess import Popen

DEFAULT_LOCAL_HOST = "127.0.0.1"
DEFAULT_REMOTE_COMMAND = "setta"
LOCAL_METADATA_FILENAME = "local.json"
LOCAL_UI_LOG_NAME = "local-ui.log"
LOCAL_TUNNEL_LOG_NAME = "ssh-tunnel.log"
LOCAL_UI_READY_TIMEOUT_SECONDS = 6.0
LOCAL_UI_RETRY_INTERVAL_SECONDS = 0.1


@dataclass(frozen=True)
class LocalSessionLayout:
    session_id: str
    run_dir: Path
    local_file: Path
    logs_dir: Path
    ui_log: Path
    tunnel_log: Path


@dataclass(frozen=True)
class LocalSessionMetadata:
    session_id: str
    ssh_target: str
    ssh_options: list[str]
    ssh_identity: str | None
    remote_run_root: str
    local_host: str
    local_port: int
    ui_host: str
    ui_port: int
    tunnel_pid: int
    local_ui_pid: int
    status: str
    started_at: str
    remote_listen: dict[str, str | int]


def prepare_local_session_layout(
    session_id: str,
    run_root: Path | None,
) -> LocalSessionLayout:
    resolved_root = resolve_run_root(run_root)
    resolved_root.mkdir(parents=True, exist_ok=True)
    run_dir = resolved_root / session_id
    ensure_dir(run_dir, SESSION_DIR_MODE)
    logs_dir = run_dir / "logs"
    ensure_dir(logs_dir, SESSION_DIR_MODE)
    local_file = run_dir / LOCAL_METADATA_FILENAME
    ui_log = logs_dir / LOCAL_UI_LOG_NAME
    tunnel_log = logs_dir / LOCAL_TUNNEL_LOG_NAME
    ensure_log_file(ui_log)
    ensure_log_file(tunnel_log)
    return LocalSessionLayout(
        session_id=session_id,
        run_dir=run_dir,
        local_file=local_file,
        logs_dir=logs_dir,
        ui_log=ui_log,
        tunnel_log=tunnel_log,
    )


def _normalize_remote_run_root(run_root: str | None) -> str:
    if not run_root:
        return "$HOME/.setta/run"
    if run_root == "~":
        return "$HOME"
    if run_root.startswith("~/"):
        return f"$HOME/{run_root[2:]}"
    return run_root


def _escape_double_quotes(value: str) -> str:
    return value.replace('"', '\\"')


def _build_remote_bootstrap_script(
    *,
    session_id: str,
    token: str,
    remote_run_root: str,
    remote_command: str,
    use_uds: bool,
) -> str:
    run_root_value = _escape_double_quotes(_normalize_remote_run_root(remote_run_root))
    command_value = _escape_double_quotes(remote_command)
    uds_flag = "1" if use_uds else "0"
    lines = [
        "set -euo pipefail",
        f"SESSION_ID={shlex.quote(session_id)}",
        f'RUN_ROOT="{run_root_value}"',
        f'REMOTE_COMMAND="{command_value}"',
        f"TOKEN={shlex.quote(token)}",
        f"USE_UDS={uds_flag}",
        'RUN_DIR="${RUN_ROOT}/${SESSION_ID}"',
        'LOG_DIR="${RUN_DIR}/logs"',
        'SESSION_FILE="${RUN_DIR}/session.json"',
        'TOKEN_FILE="${RUN_DIR}/token"',
        'UDS_PATH="${RUN_DIR}/agent.sock"',
        'mkdir -p "${LOG_DIR}"',
        'chmod 700 "${RUN_DIR}" "${LOG_DIR}"',
        "umask 077",
        'printf "%s" "${TOKEN}" > "${TOKEN_FILE}"',
        'if [ "${USE_UDS}" = "1" ]; then',
        '  nohup ${REMOTE_COMMAND} --session-id "${SESSION_ID}" '
        '--token-file "${TOKEN_FILE}" --session-root "${RUN_ROOT}" '
        '--uds "${UDS_PATH}" --host 127.0.0.1 --port 0 '
        '> "${LOG_DIR}/agent.log" 2>&1 </dev/null &',
        "else",
        '  nohup ${REMOTE_COMMAND} --session-id "${SESSION_ID}" '
        '--token-file "${TOKEN_FILE}" --session-root "${RUN_ROOT}" '
        "--host 127.0.0.1 --port 0 "
        '> "${LOG_DIR}/agent.log" 2>&1 </dev/null &',
        "fi",
        "for _ in {1..200}; do",
        '  if [ -f "${SESSION_FILE}" ]; then',
        '    if grep -q \'"status": "ready"\' "${SESSION_FILE}"; then',
        '      cat "${SESSION_FILE}"',
        "      exit 0",
        "    fi",
        "  fi",
        f"  sleep {LOCAL_UI_RETRY_INTERVAL_SECONDS}",
        "done",
        'echo "Session did not become ready." >&2',
        "exit 1",
    ]
    return "\n".join(lines) + "\n"


def _build_ssh_base_args(
    *,
    ssh_options: list[str],
    ssh_identity: Path | None,
) -> list[str]:
    args = ["ssh", "-T", "-o", "LogLevel=ERROR"]
    for option in ssh_options:
        args.extend(["-o", option])
    if ssh_identity is not None:
        args.extend(["-i", str(ssh_identity)])
    return args


def _generate_session_id() -> str:
    return secrets.token_hex(16)


def _generate_token() -> str:
    return secrets.token_hex(32)


def _find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _parse_remote_session(payload: dict[str, object]) -> dict[str, str | int]:
    if "status" not in payload:
        raise KeyError("Remote session metadata missing status.")
    status = payload["status"]
    if not isinstance(status, str):
        raise ValueError("Remote session status is invalid.")
    if status != "ready":
        raise RuntimeError(f"Remote session status is {status!r}.")
    if "listen" not in payload:
        raise KeyError("Remote session metadata missing listen info.")
    listen = payload["listen"]
    if not isinstance(listen, dict):
        raise ValueError("Remote session listen info is invalid.")
    if "uds" in listen:
        uds = listen["uds"]
        if not isinstance(uds, str) or not uds:
            raise ValueError("Remote session uds path is invalid.")
        return {"uds": uds}
    if "host" not in listen or "port" not in listen:
        raise KeyError("Remote session listen info missing host/port.")
    host = listen["host"]
    port = listen["port"]
    if not isinstance(host, str) or not host:
        raise ValueError("Remote session host is invalid.")
    if not isinstance(port, int):
        raise ValueError("Remote session port is invalid.")
    return {"host": host, "port": port}


def _fetch_remote_session(
    *,
    ssh_target: str,
    ssh_options: list[str],
    ssh_identity: Path | None,
    remote_run_root: str,
    session_id: str,
) -> dict[str, object] | None:
    run_root = _normalize_remote_run_root(remote_run_root)
    run_root_value = _escape_double_quotes(run_root)
    session_id_value = _escape_double_quotes(session_id)
    command = f'cat "{run_root_value}/{session_id_value}/session.json"'
    args = _build_ssh_base_args(
        ssh_options=ssh_options,
        ssh_identity=ssh_identity,
    )
    args.extend([ssh_target, command])
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if not raw:
        return None
    return json.loads(raw)


def _fetch_remote_token(
    *,
    ssh_target: str,
    ssh_options: list[str],
    ssh_identity: Path | None,
    token_file: str,
) -> str:
    token_path = _escape_double_quotes(token_file)
    args = _build_ssh_base_args(
        ssh_options=ssh_options,
        ssh_identity=ssh_identity,
    )
    args.extend([ssh_target, f'cat "{token_path}"'])
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    token = result.stdout.strip()
    if not token:
        raise ValueError("Remote token file is empty.")
    return token


def _bootstrap_remote_session(
    *,
    ssh_target: str,
    ssh_options: list[str],
    ssh_identity: Path | None,
    session_id: str,
    token: str,
    remote_run_root: str,
    remote_command: str,
    use_uds: bool,
) -> dict[str, object]:
    script = _build_remote_bootstrap_script(
        session_id=session_id,
        token=token,
        remote_run_root=remote_run_root,
        remote_command=remote_command,
        use_uds=use_uds,
    )
    args = _build_ssh_base_args(
        ssh_options=ssh_options,
        ssh_identity=ssh_identity,
    )
    args.extend([ssh_target, "bash", "-s"])
    result = subprocess.run(
        args, input=script, text=True, capture_output=True, check=True
    )
    output = result.stdout.strip()
    if not output:
        raise RuntimeError("Remote bootstrap did not return session metadata.")
    return json.loads(output)


def _build_local_api_base_url(local_host: str, local_port: int) -> str:
    return f"http://{local_host}:{local_port}{Route.PREFIX.value}"


def _start_ssh_tunnel(
    *,
    ssh_target: str,
    ssh_options: list[str],
    ssh_identity: Path | None,
    local_host: str,
    local_port: int,
    remote_listen: dict[str, str | int],
    log_path: Path,
) -> "Popen[bytes]":
    if "uds" in remote_listen:
        remote_uds = remote_listen["uds"]
        if not isinstance(remote_uds, str):
            raise ValueError("Remote UDS path is invalid.")
        forward = f"{local_host}:{local_port}:{remote_uds}"
    else:
        if "host" not in remote_listen or "port" not in remote_listen:
            raise KeyError("Remote listen info missing host/port.")
        remote_host = remote_listen["host"]
        remote_port = remote_listen["port"]
        if not isinstance(remote_host, str) or not isinstance(remote_port, int):
            raise ValueError("Remote host/port info is invalid.")
        forward = f"{local_host}:{local_port}:{remote_host}:{remote_port}"

    args = _build_ssh_base_args(
        ssh_options=ssh_options,
        ssh_identity=ssh_identity,
    )
    args.extend(
        [
            "-N",
            "-o",
            "ExitOnForwardFailure=yes",
            "-L",
            forward,
            ssh_target,
        ]
    )
    log_handle = log_path.open("ab")
    process = subprocess.Popen(
        args,
        stdin=subprocess.DEVNULL,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log_handle.close()
    return process


def _start_local_ui(
    *,
    ui_host: str,
    ui_port: int,
    frontend_root: Path | None,
    log_level: str | None,
    log_path: Path,
) -> "Popen[bytes]":
    args = [
        sys.executable,
        "-m",
        "setta.start",
        "local-ui",
        "--host",
        ui_host,
        "--port",
        str(ui_port),
    ]
    if frontend_root is not None:
        args.extend(["--frontend-root", str(frontend_root)])
    if log_level is not None:
        args.extend(["--log-level", log_level])
    log_handle = log_path.open("ab")
    process = subprocess.Popen(
        args,
        stdin=subprocess.DEVNULL,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log_handle.close()
    return process


def _configure_local_ui(
    *,
    ui_host: str,
    ui_port: int,
    api_base_url: str,
    token: str,
) -> None:
    payload = {"apiBaseUrl": api_base_url, "token": token}
    deadline = time.monotonic() + LOCAL_UI_READY_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        try:
            response = requests.post(
                f"http://{ui_host}:{ui_port}{CONFIG_ENDPOINT}",
                json=payload,
                timeout=1.0,
            )
        except requests.RequestException:
            time.sleep(LOCAL_UI_RETRY_INTERVAL_SECONDS)
            continue
        if response.ok:
            return
        time.sleep(LOCAL_UI_RETRY_INTERVAL_SECONDS)
    raise TimeoutError("Local UI server did not accept runtime config in time.")


def _write_local_metadata(
    layout: LocalSessionLayout,
    metadata: LocalSessionMetadata,
) -> None:
    payload = {
        "session_id": metadata.session_id,
        "ssh_target": metadata.ssh_target,
        "ssh_options": metadata.ssh_options,
        "ssh_identity": metadata.ssh_identity,
        "remote_run_root": metadata.remote_run_root,
        "local_host": metadata.local_host,
        "local_port": metadata.local_port,
        "ui_host": metadata.ui_host,
        "ui_port": metadata.ui_port,
        "tunnel_pid": metadata.tunnel_pid,
        "local_ui_pid": metadata.local_ui_pid,
        "status": metadata.status,
        "started_at": metadata.started_at,
        "remote_listen": metadata.remote_listen,
    }
    layout.local_file.write_text(f"{json.dumps(payload, indent=2)}\n")
    layout.local_file.chmod(SESSION_FILE_MODE)


def _parse_local_metadata(payload: dict[str, object]) -> LocalSessionMetadata:
    required = [
        "session_id",
        "ssh_target",
        "ssh_options",
        "remote_run_root",
        "local_host",
        "local_port",
        "ui_host",
        "ui_port",
        "tunnel_pid",
        "local_ui_pid",
        "status",
        "started_at",
        "remote_listen",
    ]
    for key in required:
        if key not in payload:
            raise KeyError(f"Local session metadata missing {key}.")
    session_id = payload["session_id"]
    ssh_target = payload["ssh_target"]
    ssh_options = payload["ssh_options"]
    ssh_identity = payload["ssh_identity"] if "ssh_identity" in payload else None
    remote_run_root = payload["remote_run_root"]
    local_host = payload["local_host"]
    local_port = payload["local_port"]
    ui_host = payload["ui_host"]
    ui_port = payload["ui_port"]
    tunnel_pid = payload["tunnel_pid"]
    local_ui_pid = payload["local_ui_pid"]
    status = payload["status"]
    started_at = payload["started_at"]
    remote_listen = payload["remote_listen"]
    if not isinstance(session_id, str) or not session_id:
        raise ValueError("Local session id is invalid.")
    if not isinstance(ssh_target, str) or not ssh_target:
        raise ValueError("Local ssh target is invalid.")
    if not isinstance(ssh_options, list):
        raise ValueError("Local ssh options are invalid.")
    if ssh_identity is not None and not isinstance(ssh_identity, str):
        raise ValueError("Local ssh identity is invalid.")
    if not isinstance(remote_run_root, str) or not remote_run_root:
        raise ValueError("Local remote run root is invalid.")
    if not isinstance(local_host, str) or not local_host:
        raise ValueError("Local host is invalid.")
    if not isinstance(local_port, int):
        raise ValueError("Local port is invalid.")
    if not isinstance(ui_host, str) or not ui_host:
        raise ValueError("Local UI host is invalid.")
    if not isinstance(ui_port, int):
        raise ValueError("Local UI port is invalid.")
    if not isinstance(tunnel_pid, int):
        raise ValueError("Local tunnel pid is invalid.")
    if not isinstance(local_ui_pid, int):
        raise ValueError("Local UI pid is invalid.")
    if not isinstance(status, str) or not status:
        raise ValueError("Local session status is invalid.")
    if not isinstance(started_at, str) or not started_at:
        raise ValueError("Local session started_at is invalid.")
    if not isinstance(remote_listen, dict):
        raise ValueError("Local remote listen info is invalid.")
    return LocalSessionMetadata(
        session_id=session_id,
        ssh_target=ssh_target,
        ssh_options=ssh_options,
        ssh_identity=ssh_identity,
        remote_run_root=remote_run_root,
        local_host=local_host,
        local_port=local_port,
        ui_host=ui_host,
        ui_port=ui_port,
        tunnel_pid=tunnel_pid,
        local_ui_pid=local_ui_pid,
        status=status,
        started_at=started_at,
        remote_listen=remote_listen,
    )


def read_local_metadata(
    *,
    session_id: str,
    run_root: Path | None,
) -> LocalSessionMetadata:
    resolved_root = resolve_run_root(run_root)
    local_file = resolved_root / session_id / LOCAL_METADATA_FILENAME
    if not local_file.exists():
        raise FileNotFoundError(f"Local session metadata not found: {local_file}")
    payload = json.loads(local_file.read_text())
    if not isinstance(payload, dict):
        raise ValueError("Local session metadata is invalid.")
    return _parse_local_metadata(payload)


def list_local_metadata(run_root: Path | None) -> list[LocalSessionMetadata]:
    resolved_root = resolve_run_root(run_root)
    if not resolved_root.exists():
        return []
    sessions: list[LocalSessionMetadata] = []
    for local_file in resolved_root.glob(f"*/{LOCAL_METADATA_FILENAME}"):
        payload = json.loads(local_file.read_text())
        if not isinstance(payload, dict):
            continue
        sessions.append(_parse_local_metadata(payload))
    return sessions


def connect_remote_session(
    *,
    ssh_target: str,
    ssh_options: list[str],
    ssh_identity: Path | None,
    session_id: str | None,
    remote_run_root: str | None,
    local_run_root: Path | None,
    local_host: str,
    local_port: int | None,
    ui_host: str,
    ui_port: int,
    frontend_root: Path | None,
    remote_command: str,
    no_uds: bool,
    reuse_existing: bool,
    log_level: str | None,
) -> LocalSessionMetadata:
    resolved_session_id = session_id or _generate_session_id()
    use_uds = not no_uds and os.name != "nt"
    layout = prepare_local_session_layout(resolved_session_id, local_run_root)

    token = _generate_token()
    normalized_remote_run_root = _normalize_remote_run_root(remote_run_root)
    remote_payload: dict[str, object] | None = None
    if reuse_existing:
        remote_payload = _fetch_remote_session(
            ssh_target=ssh_target,
            ssh_options=ssh_options,
            ssh_identity=ssh_identity,
            remote_run_root=normalized_remote_run_root,
            session_id=resolved_session_id,
        )
        if remote_payload is not None:
            if "token_file" not in remote_payload:
                raise KeyError("Remote session metadata missing token_file.")
            token_file = remote_payload["token_file"]
            if not isinstance(token_file, str) or not token_file:
                raise ValueError("Remote session token_file is invalid.")
            token = _fetch_remote_token(
                ssh_target=ssh_target,
                ssh_options=ssh_options,
                ssh_identity=ssh_identity,
                token_file=token_file,
            )

    if remote_payload is None:
        remote_payload = _bootstrap_remote_session(
            ssh_target=ssh_target,
            ssh_options=ssh_options,
            ssh_identity=ssh_identity,
            session_id=resolved_session_id,
            token=token,
            remote_run_root=normalized_remote_run_root,
            remote_command=remote_command,
            use_uds=use_uds,
        )

    remote_listen = _parse_remote_session(remote_payload)

    resolved_local_port = local_port or _find_free_port(local_host)
    tunnel_process = _start_ssh_tunnel(
        ssh_target=ssh_target,
        ssh_options=ssh_options,
        ssh_identity=ssh_identity,
        local_host=local_host,
        local_port=resolved_local_port,
        remote_listen=remote_listen,
        log_path=layout.tunnel_log,
    )

    local_ui_process = _start_local_ui(
        ui_host=ui_host,
        ui_port=ui_port,
        frontend_root=frontend_root,
        log_level=log_level,
        log_path=layout.ui_log,
    )

    api_base_url = _build_local_api_base_url(local_host, resolved_local_port)
    _configure_local_ui(
        ui_host=ui_host,
        ui_port=ui_port,
        api_base_url=api_base_url,
        token=token,
    )

    metadata = LocalSessionMetadata(
        session_id=resolved_session_id,
        ssh_target=ssh_target,
        ssh_options=ssh_options,
        ssh_identity=str(ssh_identity) if ssh_identity else None,
        remote_run_root=normalized_remote_run_root,
        local_host=local_host,
        local_port=resolved_local_port,
        ui_host=ui_host,
        ui_port=ui_port,
        tunnel_pid=tunnel_process.pid,
        local_ui_pid=local_ui_process.pid,
        status="connected",
        started_at=current_timestamp(),
        remote_listen=remote_listen,
    )
    _write_local_metadata(layout, metadata)
    return metadata


def disconnect_remote_session(
    *,
    metadata: LocalSessionMetadata,
    local_run_root: Path | None,
) -> LocalSessionMetadata:
    if metadata.tunnel_pid > 0 and psutil.pid_exists(metadata.tunnel_pid):
        os.kill(metadata.tunnel_pid, signal.SIGTERM)
    if metadata.local_ui_pid > 0 and psutil.pid_exists(metadata.local_ui_pid):
        os.kill(metadata.local_ui_pid, signal.SIGTERM)

    run_root_value = _escape_double_quotes(metadata.remote_run_root)
    session_id_value = _escape_double_quotes(metadata.session_id)
    remote_cmd = (
        f'if [ -f "{run_root_value}/{session_id_value}/agent.pid" ]; then '
        f'kill "$(cat "{run_root_value}/{session_id_value}/agent.pid")"; '
        "fi"
    )
    args = _build_ssh_base_args(
        ssh_options=metadata.ssh_options,
        ssh_identity=Path(metadata.ssh_identity) if metadata.ssh_identity else None,
    )
    args.extend([metadata.ssh_target, remote_cmd])
    subprocess.run(args, check=True)

    layout = prepare_local_session_layout(metadata.session_id, local_run_root)
    updated = LocalSessionMetadata(
        session_id=metadata.session_id,
        ssh_target=metadata.ssh_target,
        ssh_options=metadata.ssh_options,
        ssh_identity=metadata.ssh_identity,
        remote_run_root=metadata.remote_run_root,
        local_host=metadata.local_host,
        local_port=metadata.local_port,
        ui_host=metadata.ui_host,
        ui_port=metadata.ui_port,
        tunnel_pid=metadata.tunnel_pid,
        local_ui_pid=metadata.local_ui_pid,
        status="disconnected",
        started_at=metadata.started_at,
        remote_listen=metadata.remote_listen,
    )
    _write_local_metadata(layout, updated)
    return updated
