import hashlib
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import psutil
from pydantic import BaseModel

from setta.launch import LaunchError
from setta.ssh_common import (
    RemoteSessionSummary,
    apply_control_socket_args,
    build_remote_files_root_args,
    build_ssh_tunnel_args,
    ensure_background_process_started,
    extract_token_from_bootstrap_url,
    fetch_remote_connect_info,
    fetch_remote_sessions,
    parse_ssh_args,
    resolve_remote_setta_command,
    resolve_remote_shell,
    resolve_remote_workspace,
    select_free_port,
    ssh_command_prefix,
    start_remote_setta,
    wait_for_remote_sessions,
)
from setta.utils.network import build_bootstrap_urls
from setta.utils.paths import get_setta_paths


@dataclass(frozen=True)
class RemoteConnectResult:
    bootstrap_url_fragment: str
    session: RemoteSessionSummary
    started_new: bool


class SshTunnelMetadata(BaseModel):
    key: str
    sshTarget: str
    sshArgs: list[str]
    remoteHost: str
    remotePort: int
    localPort: int
    pid: int
    createdAt: str
    lastUsedAt: str


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

    ssh_prefix = ssh_command_prefix(batch_mode=True)
    ssh_args_list = apply_control_socket_args(parse_ssh_args(ssh_args))
    shell = resolve_remote_shell(ssh_target, ssh_args_list, ssh_prefix=ssh_prefix)
    remote_workspace = resolve_remote_workspace(
        ssh_target,
        ssh_args_list,
        shell,
        workspace,
        ssh_prefix=ssh_prefix,
    )
    setta_command = resolve_remote_setta_command(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        remote_cmd,
        ssh_prefix=ssh_prefix,
    )
    files_root_args = build_remote_files_root_args(
        files_root=files_root,
        files_root_base=files_root_base,
    )
    sessions = fetch_remote_sessions(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
        ssh_prefix=ssh_prefix,
    )
    started_new = False
    if not sessions:
        started_new = True
        start_remote_setta(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
            ssh_prefix=ssh_prefix,
            files_root=files_root,
            files_root_base=files_root_base,
        )
        sessions = wait_for_remote_sessions(
            ssh_target,
            ssh_args_list,
            shell,
            remote_workspace,
            setta_command,
            files_root_args,
            ssh_prefix=ssh_prefix,
            timeout_seconds=timeout_seconds,
        )

    session = max(sessions, key=lambda entry: entry.started_at)
    connect_info = fetch_remote_connect_info(
        ssh_target,
        ssh_args_list,
        shell,
        remote_workspace,
        setta_command,
        files_root_args,
        session_id=session.id,
        ssh_prefix=ssh_prefix,
    )
    remote_bootstrap_url = connect_info.get("bootstrapUrlFragment")
    if not isinstance(remote_bootstrap_url, str) or not remote_bootstrap_url:
        raise LaunchError(
            "RemoteConnectInfo",
            "Remote connect info did not include a bootstrapUrlFragment.",
        )
    token = extract_token_from_bootstrap_url(remote_bootstrap_url)

    tunnel = _ensure_ssh_tunnel(
        ssh_target=ssh_target,
        ssh_prefix=ssh_prefix,
        ssh_args=ssh_args_list,
        remote_host=session.host,
        remote_port=session.port,
        requested_local_port=local_port,
    )
    local_bootstrap_url, _ = build_bootstrap_urls(
        "127.0.0.1",
        tunnel.localPort,
        token,
    )

    return RemoteConnectResult(
        bootstrap_url_fragment=local_bootstrap_url,
        session=session,
        started_new=started_new,
    )


def _tunnels_root(runtime_root: Path) -> Path:
    return runtime_root / "ssh_tunnels"


def _compute_tunnel_key(
    *,
    ssh_target: str,
    ssh_args: list[str],
    remote_host: str,
    remote_port: int,
) -> str:
    payload = {
        "remoteHost": remote_host,
        "remotePort": remote_port,
        "sshArgs": ssh_args,
        "sshTarget": ssh_target,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _tunnel_id_for_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


def _load_tunnel_metadata(path: Path) -> SshTunnelMetadata | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    try:
        return SshTunnelMetadata.model_validate(raw)
    except Exception:
        return None


def _write_tunnel_metadata(path: Path, metadata: SshTunnelMetadata) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(metadata.model_dump(mode="json"), indent=2, sort_keys=True),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def _is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        proc = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return False
    if not proc.is_running():
        return False
    try:
        return proc.status() != psutil.STATUS_ZOMBIE
    except psutil.Error:
        return True


def _stop_pid(pid: int) -> None:
    if pid <= 0:
        return
    try:
        proc = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return
    try:
        proc.terminate()
        proc.wait(timeout=2)
    except psutil.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)


def _preferred_local_port(key: str) -> int:
    raw = hashlib.sha256(key.encode("utf-8")).digest()
    value = int.from_bytes(raw[:4], "big")
    min_port = 61000
    max_port = 65535
    return min_port + (value % (max_port - min_port + 1))


def _ensure_ssh_tunnel(
    *,
    ssh_target: str,
    ssh_prefix: list[str],
    ssh_args: list[str],
    remote_host: str,
    remote_port: int,
    requested_local_port: int | None,
) -> SshTunnelMetadata:
    runtime_root = get_setta_paths().runtime_root
    tunnels_root = _tunnels_root(runtime_root)
    key = _compute_tunnel_key(
        ssh_target=ssh_target,
        ssh_args=ssh_args,
        remote_host=remote_host,
        remote_port=remote_port,
    )
    tunnel_id = _tunnel_id_for_key(key)
    metadata_path = tunnels_root / f"{tunnel_id}.json"
    existing = _load_tunnel_metadata(metadata_path)
    if existing is not None and existing.key != key:
        existing = None

    now = datetime.now(timezone.utc).isoformat()
    if existing is not None and _is_pid_alive(existing.pid):
        if requested_local_port is None or requested_local_port == existing.localPort:
            updated = existing.model_copy(
                update={
                    "lastUsedAt": now,
                }
            )
            _write_tunnel_metadata(metadata_path, updated)
            return updated

        # The caller asked for a different port; stop the prior tunnel to avoid
        # accumulating orphan tunnels.
        _stop_pid(existing.pid)

    if existing is not None and not _is_pid_alive(existing.pid):
        try:
            metadata_path.unlink()
        except OSError:
            pass

    candidate_ports: list[int] = []
    if requested_local_port is not None:
        candidate_ports.append(requested_local_port)
    else:
        candidate_ports.append(_preferred_local_port(key))
        candidate_ports.append(select_free_port("127.0.0.1"))

    seen_ports = set()
    for candidate_port in candidate_ports:
        if candidate_port in seen_ports:
            continue
        seen_ports.add(candidate_port)

        tunnel_args = build_ssh_tunnel_args(
            ssh_target,
            ssh_args,
            remote_host,
            candidate_port,
            remote_port,
            ssh_prefix=ssh_prefix,
        )
        proc = subprocess.Popen(
            tunnel_args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        try:
            ensure_background_process_started(proc)
        except LaunchError:
            _stop_pid(proc.pid)
            continue

        metadata = SshTunnelMetadata(
            key=key,
            sshTarget=ssh_target,
            sshArgs=ssh_args,
            remoteHost=remote_host,
            remotePort=remote_port,
            localPort=candidate_port,
            pid=proc.pid,
            createdAt=now,
            lastUsedAt=now,
        )
        _write_tunnel_metadata(metadata_path, metadata)
        return metadata

    raise LaunchError(
        "TunnelStartFailed",
        "Unable to start SSH tunnel (all candidate ports failed). Provide localPort to override.",
    )
