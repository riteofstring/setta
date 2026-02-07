import json
import os
import signal
from contextlib import suppress
from pathlib import Path
import socket

import psutil
import pytest
from click.testing import CliRunner

from setta.sessions.registry import SessionRegistry
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.start import launch


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


def test_launch_reports_invalid_files_root(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    files_root = tmp_path / "not-a-dir.txt"
    files_root.write_text("nope", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--files-root",
            str(files_root),
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidFilesRoot"


def test_launch_reuses_existing_session(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_files_root = tmp_path / "setta_files"
    sessions_root = setta_files_root / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--files-root",
            str(setta_files_root),
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is False
    assert payload["sessionId"] == session.id
    assert payload["workspaceRoot"] == str(workspace.resolve())
    assert payload["filesRoot"] == str(setta_files_root.resolve())
    assert payload["session"]["workspacePathCanonical"] == str(workspace.resolve())


def test_launch_starts_new_session(tmp_path: Path, monkeypatch) -> None:
    if not _can_bind_localhost():
        pytest.skip("Socket binds are not permitted in this test environment.")

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    files_root = tmp_path / "state"
    files_root.mkdir()

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
            "--files-root",
            str(files_root),
            "--timeout",
            "30",
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is True
    assert payload["workspaceRoot"] == str(workspace.resolve())
    assert payload["filesRoot"] == str(files_root.resolve())

    session_id = payload["sessionId"]
    pid = int(payload["session"]["pid"])
    session_root = files_root / "runtime" / "sessions"
    registry = SessionRegistry(sessions_root=session_root)

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
