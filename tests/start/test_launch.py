import json
import os
import signal
import socket
import subprocess
import urllib.request
from contextlib import suppress
from pathlib import Path

import psutil
import pytest
from click.testing import CliRunner

from setta.launch import LaunchError, launch_workspace_session
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.start import cli, launch
from setta.utils.network import format_host_for_url
from setta.utils.paths import build_files_root_from_base


def _can_bind_localhost() -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
    except OSError:
        return False
    finally:
        sock.close()
    return True


def test_launch_reports_invalid_workspace(tmp_path: Path) -> None:
    runner = CliRunner()
    result = runner.invoke(
        launch,
        ["--json", "--workspace", str(tmp_path / "missing")],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidWorkspace"


def test_launch_reports_invalid_local_setta_files_root(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "setta_files").write_text("not a directory", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(
        launch,
        ["--json", "--workspace", str(workspace), "--setta-files-location", "local"],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidSettaFilesRoot"
    assert "Local setta_files path is not a directory" in payload["error"]["message"]


def test_launch_reports_invalid_user_config(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    config_path = setta_home / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text("{", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(
        launch,
        ["--json", "--workspace", str(workspace)],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidSettaUserConfig"
    assert str(config_path) in payload["error"]["message"]


def test_launch_reports_unknown_profile(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    runner = CliRunner()
    result = runner.invoke(
        launch,
        ["--json", "--workspace", str(workspace), "--profile", "missing"],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "UnknownSettaProfile"


def test_launch_reuses_existing_session(tmp_path: Path, monkeypatch) -> None:
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_files_root = workspace / "setta_files"
    sessions_root = setta_files_root / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(("127.0.0.1", 0))
    server_socket.listen(1)
    port = server_socket.getsockname()[1]

    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=port,
        pid=os.getpid(),
    )

    runner = CliRunner()
    try:
        result = runner.invoke(
            launch,
            [
                "--json",
                "--workspace",
                str(workspace),
                "--setta-files-location",
                "local",
            ],
        )
    finally:
        server_socket.close()

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is False
    assert payload["sessionId"] == session.id
    assert payload["workspaceRoot"] == str(workspace.resolve())
    assert payload["settaFilesLocation"] == "local"
    assert payload["session"]["workspacePathCanonical"] == str(workspace.resolve())


def test_launch_reuses_existing_session_with_global_state(
    tmp_path: Path, monkeypatch
) -> None:
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    global_base = (setta_home / "setta_files").resolve(strict=False)
    global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    sessions_root = global_root / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(("127.0.0.1", 0))
    server_socket.listen(1)
    port = server_socket.getsockname()[1]

    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=port,
        pid=os.getpid(),
    )

    runner = CliRunner()
    try:
        result = runner.invoke(
            launch,
            [
                "--json",
                "--workspace",
                str(workspace),
                "--setta-files-location",
                "global",
            ],
        )
    finally:
        server_socket.close()

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is False
    assert payload["sessionId"] == session.id
    assert payload["workspaceRoot"] == str(workspace.resolve())
    assert payload["settaFilesLocation"] == "global"


def test_launch_starts_new_session(tmp_path: Path, monkeypatch) -> None:
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    workspace = tmp_path / "workspace"
    workspace.mkdir()

    # Child Setta processes must run in dev mode during tests because the packaged
    # frontend bundle is not present in the repo checkout.
    monkeypatch.setenv("SETTA_DEV_MODE", "1")

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--setta-files-location",
            "local",
            "--timeout",
            "30",
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is True
    assert payload["workspaceRoot"] == str(workspace.resolve())
    assert payload["settaFilesLocation"] == "local"

    session_id = payload["sessionId"]
    pid = int(payload["session"]["pid"])
    host = format_host_for_url(str(payload["session"]["host"]))
    port = int(payload["session"]["port"])

    setta_files_root = workspace / "setta_files"
    session_root = setta_files_root / "runtime" / "sessions"
    registry = SessionRegistry(sessions_root=session_root)

    with urllib.request.urlopen(
        f"http://{host}:{port}/__setta__/bootstrap", timeout=5
    ) as resp:
        assert resp.status == 200

    process = psutil.Process(pid)
    children = process.children(recursive=True)

    with suppress(ProcessLookupError):
        os.kill(pid, signal.SIGTERM)

    gone, alive = psutil.wait_procs([process, *children], timeout=20)
    for entry in alive:
        with suppress(psutil.NoSuchProcess):
            entry.kill()
    psutil.wait_procs(alive, timeout=10)

    registry.delete_session(session_id)


def test_launch_workspace_session_reports_spawn_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    def fail_popen(*_args, **_kwargs):
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", fail_popen)

    with pytest.raises(LaunchError) as excinfo:
        launch_workspace_session(
            workspace_root=workspace,
            setta_files_location="local",
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )
    assert excinfo.value.code == "LaunchFailed"

    logs_dir = workspace / "setta_files" / "runtime" / "logs"
    log_files = sorted(logs_dir.iterdir())
    assert len(log_files) == 1
    log_path = log_files[0]
    assert str(log_path) in str(excinfo.value)

    content = log_path.read_text(encoding="utf-8")
    assert "failed to spawn setta process" in content


def test_launch_reuses_existing_session_with_global_location_options(
    tmp_path: Path, monkeypatch
) -> None:
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    global_base = (setta_home / "setta_files").resolve(strict=False)
    global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    sessions_root = global_root / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(("127.0.0.1", 0))
    server_socket.listen(1)
    port = server_socket.getsockname()[1]

    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=port,
        pid=os.getpid(),
    )

    runner = CliRunner()
    try:
        result = runner.invoke(
            cli,
            [
                "--workspace",
                str(workspace),
                "--setta-files-location",
                "global",
                "launch",
                "--json",
            ],
        )
    finally:
        server_socket.close()

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is False
    assert payload["sessionId"] == session.id
    assert payload["settaFilesLocation"] == "global"


def test_launch_rejects_conflicting_workspace_options(tmp_path: Path) -> None:
    workspace_a = tmp_path / "a"
    workspace_a.mkdir()
    workspace_b = tmp_path / "b"
    workspace_b.mkdir()

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--workspace",
            str(workspace_a),
            "launch",
            "--json",
            "--workspace",
            str(workspace_b),
        ],
    )

    assert result.exit_code != 0
    assert "Conflicting --workspace" in result.output


def test_launch_rejects_conflicting_setta_files_location_options(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--workspace",
            str(workspace),
            "--setta-files-location",
            "local",
            "launch",
            "--json",
            "--setta-files-location",
            "global",
        ],
    )

    assert result.exit_code != 0
    assert "Conflicting --setta-files-location" in result.output


def test_launch_rejects_conflicting_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    explicit_root = tmp_path / "explicit_state"

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--workspace",
            str(workspace),
            "--setta-files-root",
            str(explicit_root),
            "launch",
            "--json",
            "--setta-files-location",
            "local",
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidSettaFilesConfig"


def test_launch_reuses_existing_session_with_explicit_setta_files_root(
    tmp_path: Path, monkeypatch
) -> None:
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "setta_files").mkdir(parents=True, exist_ok=True)

    explicit_root = tmp_path / "explicit_state"
    sessions_root = explicit_root / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(("127.0.0.1", 0))
    server_socket.listen(1)
    port = server_socket.getsockname()[1]

    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=port,
        pid=os.getpid(),
    )

    runner = CliRunner()
    try:
        result = runner.invoke(
            launch,
            [
                "--json",
                "--workspace",
                str(workspace),
                "--setta-files-root",
                str(explicit_root),
            ],
        )
    finally:
        server_socket.close()

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is False
    assert payload["sessionId"] == session.id
    assert payload["settaFilesLocation"] is None
    assert payload["settaFilesRoot"] == str(explicit_root.resolve(strict=False))
