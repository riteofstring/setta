import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_RUN_ROOT = Path.home() / ".setta" / "run"
SESSION_DIR_MODE = 0o700
SESSION_FILE_MODE = 0o600


@dataclass(frozen=True)
class SessionLayout:
    session_id: str
    run_dir: Path
    session_file: Path
    pid_file: Path
    token_file: Path
    log_file: Path
    logs_dir: Path
    uds_path: Path | None


@dataclass(frozen=True)
class SessionMetadataBase:
    session_id: str
    version: str
    pid: int
    started_at: str
    token_file: Path
    log_file: Path


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_run_root(run_root: Path | None) -> Path:
    if run_root is None:
        return DEFAULT_RUN_ROOT
    return run_root.expanduser().resolve()


def ensure_dir(path: Path, mode: int) -> None:
    path.mkdir(parents=True, exist_ok=True)
    path.chmod(mode)


def prepare_session_layout(
    session_id: str,
    token_file: Path,
    uds_path: Path | None,
    run_root: Path | None = None,
) -> SessionLayout:
    if not session_id:
        raise ValueError("session_id is required")
    resolved_root = resolve_run_root(run_root)
    resolved_root.mkdir(parents=True, exist_ok=True)
    run_dir = resolved_root / session_id
    ensure_dir(run_dir, SESSION_DIR_MODE)
    logs_dir = run_dir / "logs"
    ensure_dir(logs_dir, SESSION_DIR_MODE)
    session_file = run_dir / "session.json"
    pid_file = run_dir / "agent.pid"
    log_file = logs_dir / "agent.log"
    return SessionLayout(
        session_id=session_id,
        run_dir=run_dir,
        session_file=session_file,
        pid_file=pid_file,
        token_file=token_file.expanduser().resolve(),
        log_file=log_file,
        logs_dir=logs_dir,
        uds_path=uds_path.expanduser().resolve() if uds_path else None,
    )


def ensure_token_permissions(token_file: Path) -> None:
    if not token_file.exists():
        raise FileNotFoundError(f"Missing token file: {token_file}")
    token_file.chmod(SESSION_FILE_MODE)


def ensure_log_file(log_file: Path) -> None:
    log_file.touch(exist_ok=True)
    log_file.chmod(SESSION_FILE_MODE)


def write_pid_file(pid_file: Path, pid: int) -> None:
    pid_file.write_text(f"{pid}\n")
    pid_file.chmod(SESSION_FILE_MODE)


def build_listen_info(
    host: str | None,
    port: int | None,
    uds_path: Path | None,
) -> dict[str, str | int]:
    if uds_path is not None:
        return {"uds": str(uds_path)}
    if host is None or port is None:
        raise ValueError("host and port are required when uds is not set")
    return {"host": host, "port": port}


def build_session_metadata(
    base: SessionMetadataBase,
    status: str,
    listen_info: dict[str, str | int] | None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "session_id": base.session_id,
        "version": base.version,
        "pid": base.pid,
        "started_at": base.started_at,
        "status": status,
        "token_file": str(base.token_file),
        "log_file": str(base.log_file),
    }
    if listen_info is not None:
        payload["listen"] = listen_info
    return payload


def write_session_metadata(session_file: Path, metadata: dict[str, object]) -> None:
    session_file.write_text(f"{json.dumps(metadata, indent=2)}\n")
    session_file.chmod(SESSION_FILE_MODE)


def resolve_listen_info_from_server(server: object) -> dict[str, str | int] | None:
    servers = getattr(server, "servers", None)
    if not servers:
        return None
    for bound_server in servers:
        sockets = getattr(bound_server, "sockets", None)
        if not sockets:
            continue
        for sock in sockets:
            addr = sock.getsockname()
            if isinstance(addr, tuple) and len(addr) >= 2:
                host_value = addr[0]
                if isinstance(host_value, bytes):
                    host_value = host_value.decode("utf-8")
                return {"host": str(host_value), "port": int(addr[1])}
            if isinstance(addr, bytes):
                return {"uds": addr.decode("utf-8")}
            if isinstance(addr, str):
                return {"uds": addr}
    return None
