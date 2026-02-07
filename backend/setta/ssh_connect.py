import hashlib
import json
import math
import os
import subprocess
import sys
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
    keyHash: str
    remoteHost: str
    remotePort: int
    localPort: int
    pid: int
    pidCreateTime: float
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


def _compute_tunnel_key_hash(
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
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _tunnel_id_for_key_hash(key_hash: str) -> str:
    return key_hash[:12]


def _load_tunnel_metadata(path: Path) -> SshTunnelMetadata | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        try:
            path.unlink()
        except OSError:
            pass
        return None
    try:
        return SshTunnelMetadata.model_validate(raw)
    except Exception:
        try:
            path.unlink()
        except OSError:
            pass
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


def _pid_matches_create_time(pid: int, expected_create_time: float) -> bool:
    if pid <= 0:
        return False
    if not _is_pid_alive(pid):
        return False
    try:
        proc = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return False
    try:
        actual = proc.create_time()
    except psutil.Error:
        return False
    return math.isclose(actual, expected_create_time, rel_tol=0.0, abs_tol=0.01)


def _stop_pid(pid: int, *, expected_create_time: float | None = None) -> None:
    if pid <= 0:
        return
    try:
        proc = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return
    if expected_create_time is not None:
        try:
            if not math.isclose(
                proc.create_time(),
                expected_create_time,
                rel_tol=0.0,
                abs_tol=0.01,
            ):
                return
        except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.Error):
            return
    try:
        proc.terminate()
    except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied, psutil.Error):
        return
    try:
        proc.wait(timeout=2)
        return
    except psutil.TimeoutExpired:
        pass
    except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied, psutil.Error):
        return
    try:
        proc.kill()
    except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied, psutil.Error):
        return
    try:
        proc.wait(timeout=2)
    except (
        psutil.TimeoutExpired,
        psutil.NoSuchProcess,
        psutil.ZombieProcess,
        psutil.AccessDenied,
        psutil.Error,
    ):
        return


def _preferred_local_port(key_hash: str) -> int:
    raw = bytes.fromhex(key_hash)
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
    key_hash = _compute_tunnel_key_hash(
        ssh_target=ssh_target,
        ssh_args=ssh_args,
        remote_host=remote_host,
        remote_port=remote_port,
    )
    tunnel_id = _tunnel_id_for_key_hash(key_hash)
    metadata_path = tunnels_root / f"{tunnel_id}.json"
    existing = _load_tunnel_metadata(metadata_path)
    if existing is not None and existing.keyHash != key_hash:
        existing = None

    now = datetime.now(timezone.utc).isoformat()
    if existing is not None and _is_pid_alive(existing.pid):
        if not _pid_matches_create_time(existing.pid, existing.pidCreateTime):
            # Metadata is stale (PID reuse). Delete metadata but do not touch the
            # running process.
            try:
                metadata_path.unlink()
            except OSError:
                pass
            existing = None
        elif requested_local_port is None or requested_local_port == existing.localPort:
            updated = existing.model_copy(
                update={
                    "lastUsedAt": now,
                }
            )
            _write_tunnel_metadata(metadata_path, updated)
            return updated
        else:
            # The caller asked for a different port; stop the prior tunnel to
            # avoid accumulating orphan tunnels.
            _stop_pid(existing.pid, expected_create_time=existing.pidCreateTime)

    if existing is not None and not _is_pid_alive(existing.pid):
        try:
            metadata_path.unlink()
        except OSError:
            pass

    candidate_ports: list[int] = []
    if requested_local_port is not None:
        candidate_ports.append(requested_local_port)
    # Always attempt a stable port and a random free port as fallbacks, even if the
    # caller requested a specific port (it can be grabbed by another process).
    candidate_ports.append(_preferred_local_port(key_hash))
    try:
        candidate_ports.append(select_free_port("127.0.0.1"))
    except OSError:
        pass

    seen_ports = set()
    last_failure: str | None = None
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
        popen_kwargs: dict[str, object] = {
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.PIPE,
            "text": True,
        }
        if os.name == "posix":
            popen_kwargs["start_new_session"] = True
        elif sys.platform == "win32":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        proc = subprocess.Popen(tunnel_args, **popen_kwargs)
        try:
            ensure_background_process_started(proc)
        except LaunchError as exc:
            stderr = ""
            if proc.stderr is not None:
                try:
                    stderr = proc.stderr.read().strip()
                except Exception:
                    stderr = ""
            last_failure = f"localPort {candidate_port}: {exc}"
            if stderr:
                last_failure = f"{last_failure} {stderr}"
            _stop_pid(proc.pid)
            continue
        finally:
            if proc.poll() is None and proc.stderr is not None:
                try:
                    proc.stderr.close()
                except OSError:
                    pass

        try:
            pid_create_time = psutil.Process(proc.pid).create_time()
        except psutil.Error:
            _stop_pid(proc.pid)
            continue

        metadata = SshTunnelMetadata(
            keyHash=key_hash,
            remoteHost=remote_host,
            remotePort=remote_port,
            localPort=candidate_port,
            pid=proc.pid,
            pidCreateTime=pid_create_time,
            createdAt=now,
            lastUsedAt=now,
        )
        _write_tunnel_metadata(metadata_path, metadata)
        return metadata

    message = "Unable to start SSH tunnel (all candidate ports failed). Provide localPort to override."
    if last_failure:
        message = f"{message} Last failure: {last_failure}"
    raise LaunchError("TunnelStartFailed", message)
