import base64
import json
import os
import subprocess
import sys
import time
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from click.testing import CliRunner

from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.start import cli, status, stop
from setta.utils.constants import C
from setta.utils.paths import clear_setta_paths_cache, resolve_setta_paths
from tests.utils.setta_paths import temporary_setta_paths


def _decode_connect_info(output: str) -> dict:
    line = output.strip()
    assert line.startswith("__SETTA_JSON_B64__")
    encoded = line.removeprefix("__SETTA_JSON_B64__")
    decoded = base64.b64decode(encoded).decode("utf-8")
    return json.loads(decoded)


@pytest.fixture
def status_env(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_root = workspace / "setta_files"
    setta_root.mkdir(parents=True, exist_ok=True)
    stack = ExitStack()
    stack.enter_context(
        temporary_setta_paths(
            workspace_root=workspace,
            setta_files_location="local",
        )
    )
    sessions_root = C.RUNTIME_SESSIONS_FOLDER
    sessions_root.mkdir(parents=True, exist_ok=True)
    resolved_paths = resolve_setta_paths(
        workspace_root=workspace, setta_files_location="local"
    )

    process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            "setta.server:app",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Let the process fully initialize its argv/cmdline before stale checks.
    time.sleep(0.05)
    registry = SessionRegistry()

    def _create_session(
        port: int,
        started_at: datetime | None = None,
        setta_files_location: str | None = resolved_paths.setta_files_location,
        setta_files_root: str | None = str(resolved_paths.setta_files_root),
        runtime_root: str | None = str(resolved_paths.runtime_root),
        setta_home: str | None = str(resolved_paths.setta_home),
        profile: str | None = resolved_paths.profile_name,
        server_mode: str = "ide",
    ) -> SessionMetadata:
        return registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=port,
            pid=process.pid,
            started_at=started_at,
            setta_files_location=setta_files_location,
            setta_files_root=setta_files_root,
            runtime_root=runtime_root,
            setta_home=setta_home,
            profile=profile,
            server_mode=server_mode,
        )

    env = SimpleNamespace(
        sessions_root=sessions_root,
        workspace=workspace,
        process=process,
        registry=registry,
        create_session=_create_session,
        stack=stack,
    )
    try:
        yield env
    finally:
        if process.poll() is None:
            process.terminate()
        process.wait()
        stack.close()


@pytest.fixture
def status_workspace_env(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    stack = ExitStack()
    stack.enter_context(
        temporary_setta_paths(
            workspace_root=workspace,
            setta_files_location="local",
        )
    )
    sessions_root = C.RUNTIME_SESSIONS_FOLDER
    sessions_root.mkdir(parents=True, exist_ok=True)
    original_cwd = Path.cwd()

    process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            "setta.server:app",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Let the process fully initialize its argv/cmdline before stale checks.
    time.sleep(0.05)

    def _create_session(port: int) -> SessionMetadata:
        registry = SessionRegistry()
        return registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=port,
            pid=process.pid,
        )

    env = SimpleNamespace(
        workspace=workspace,
        outside=outside,
        process=process,
        create_session=_create_session,
        original_cwd=original_cwd,
        sessions_root=sessions_root,
        stack=stack,
    )
    try:
        yield env
    finally:
        os.chdir(original_cwd)
        if process.poll() is None:
            process.terminate()
        process.wait()
        stack.close()


def test_status_connect_info_json_emits_payload(status_env) -> None:
    status_env.create_session(port=61234)
    runner = CliRunner()

    result = runner.invoke(status, ["--connect-info", "--json"])

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)

    session = payload["session"]
    assert session["port"] == 61234
    assert session["serverMode"] == "ide"
    assert session["workspacePath"] == str(status_env.workspace.resolve())
    assert payload["bootstrapUrlPlain"] == "http://127.0.0.1:61234/__setta__/bootstrap"
    assert payload["bootstrapUrlFragment"].startswith(
        "http://127.0.0.1:61234/__setta__/bootstrap#token="
    )
    assert (
        payload["sshTunnelCommand"]
        == "ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 <user@host> -o ExitOnForwardFailure=yes"
    )
    assert payload["runtimeRoot"] == str(status_env.sessions_root.parent)
    assert payload["settaFilesLocation"] == "local"


def test_status_connect_info_json_uses_session_authored_path_metadata(
    status_env,
) -> None:
    custom_setta_files_root = str(
        (status_env.workspace / "custom_state" / "setta_files_dev").resolve(
            strict=False
        )
    )
    custom_runtime_root = str(
        (status_env.workspace / "custom_runtime").resolve(strict=False)
    )
    custom_setta_home = str(
        (status_env.workspace / ".setta-development").resolve(strict=False)
    )
    session = status_env.create_session(
        port=61234,
        setta_files_location="global",
        setta_files_root=custom_setta_files_root,
        runtime_root=custom_runtime_root,
        setta_home=custom_setta_home,
        profile="dev",
    )
    runner = CliRunner()

    result = runner.invoke(
        status,
        ["--connect-info", "--json", "--session", session.id],
    )

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    assert payload["settaFilesLocation"] == "global"
    assert payload["settaFilesRoot"] == custom_setta_files_root
    assert payload["runtimeRoot"] == custom_runtime_root
    assert payload["settaHome"] == custom_setta_home
    assert payload["profile"] == "dev"


def test_status_connect_info_json_omits_paths_when_not_in_session_metadata(
    status_env,
) -> None:
    session = status_env.registry.create_session(
        workspace_path=status_env.workspace,
        host="127.0.0.1",
        port=61234,
        pid=status_env.process.pid,
    )
    runner = CliRunner()

    result = runner.invoke(
        status,
        ["--connect-info", "--json", "--session", session.id],
    )

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    assert "settaFilesLocation" not in payload
    assert "settaFilesRoot" not in payload
    assert "runtimeRoot" not in payload
    assert "settaHome" not in payload
    assert "profile" not in payload


def test_status_requires_session_or_latest_for_multiple_sessions_json(
    status_env,
) -> None:
    status_env.create_session(port=61234)
    status_env.create_session(port=61235)
    runner = CliRunner()

    result = runner.invoke(status, ["--connect-info", "--json"])

    assert result.exit_code != 0
    assert "Multiple sessions found" in result.output


def test_status_ignores_stale_sessions_for_workspace(status_env) -> None:
    active_session = status_env.create_session(port=61234)
    stale_process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            "unit-test",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        status_env.registry.create_session(
            workspace_path=status_env.workspace,
            host="127.0.0.1",
            port=61235,
            pid=stale_process.pid,
        )
        runner = CliRunner()

        result = runner.invoke(
            status,
            [
                "--connect-info",
                "--json",
                "--workspace",
                str(status_env.workspace),
            ],
        )

        assert result.exit_code == 0, result.output
        payload = _decode_connect_info(result.output)
        assert payload["session"]["port"] == active_session.port
    finally:
        if stale_process.poll() is None:
            stale_process.terminate()
        stale_process.wait()


def test_status_rejects_missing_session(status_env) -> None:
    status_env.create_session(port=61234)
    runner = CliRunner()

    result = runner.invoke(status, ["--connect-info", "--json", "--session", "missing"])

    assert result.exit_code != 0
    assert "Session missing not found" in result.output


def test_status_latest_selects_newest(status_env) -> None:
    now = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    later = now + timedelta(minutes=5)
    status_env.create_session(port=61234, started_at=now)
    status_env.create_session(port=61235, started_at=later)
    runner = CliRunner()

    result = runner.invoke(status, ["--connect-info", "--json", "--latest"])

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    session = payload["session"]
    assert session["port"] == 61235
    assert session["startedAt"] == later.isoformat()


def test_status_list_sessions_json_emits_payload(status_env) -> None:
    first = status_env.create_session(port=61234)
    second = status_env.create_session(port=61235)
    runner = CliRunner()

    result = runner.invoke(status, ["--list-sessions", "--json"])

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    sessions = payload["sessions"]
    assert len(sessions) == 2
    ports = {session["port"] for session in sessions}
    assert ports == {first.port, second.port}
    for session in sessions:
        assert session["workspacePath"] == str(status_env.workspace.resolve())
        assert session["serverMode"] == "ide"


def test_status_list_sessions_json_filters_by_server_mode(status_env) -> None:
    status_env.create_session(port=61234, server_mode="ide")
    status_env.create_session(port=61235, server_mode="launcher")
    runner = CliRunner()

    result = runner.invoke(
        status,
        ["--list-sessions", "--json", "--server-mode", "ide"],
    )

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    sessions = payload["sessions"]
    assert len(sessions) == 1
    assert sessions[0]["port"] == 61234
    assert sessions[0]["serverMode"] == "ide"


def test_status_connect_info_latest_filters_by_server_mode(status_env) -> None:
    now = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    status_env.create_session(port=61234, started_at=now, server_mode="ide")
    status_env.create_session(
        port=61235,
        started_at=now + timedelta(minutes=1),
        server_mode="launcher",
    )
    runner = CliRunner()

    result = runner.invoke(
        status,
        ["--connect-info", "--json", "--latest", "--server-mode", "ide"],
    )

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    assert payload["session"]["port"] == 61234
    assert payload["session"]["serverMode"] == "ide"


def test_status_list_sessions_requires_json(status_env) -> None:
    status_env.create_session(port=61234)
    runner = CliRunner()

    result = runner.invoke(status, ["--list-sessions"])

    assert result.exit_code != 0
    assert "Use --json with --list-sessions" in result.output


def test_status_delete_session_removes_metadata_and_stops_process(status_env) -> None:
    session = status_env.create_session(port=61234)
    runner = CliRunner()

    result = runner.invoke(status, ["--delete-session", session.id])

    assert result.exit_code == 0, result.output
    assert f"Deleted session {session.id}." in result.output
    session_dir = status_env.sessions_root / session.id
    assert not session_dir.exists()
    deadline = time.monotonic() + 2.0
    while status_env.process.poll() is None and time.monotonic() < deadline:
        time.sleep(0.05)
    assert status_env.process.poll() is not None


def test_status_delete_session_does_not_kill_non_setta_process(status_env) -> None:
    other_process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            "unit-test",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        session = status_env.registry.create_session(
            workspace_path=status_env.workspace,
            host="127.0.0.1",
            port=61236,
            pid=other_process.pid,
        )
        runner = CliRunner()

        result = runner.invoke(status, ["--delete-session", session.id])

        assert result.exit_code == 0, result.output
        assert f"Deleted session {session.id}." in result.output
        session_dir = status_env.sessions_root / session.id
        assert not session_dir.exists()
        assert other_process.poll() is None
    finally:
        if other_process.poll() is None:
            other_process.terminate()
        other_process.wait()


def test_status_delete_session_missing_reports_error() -> None:
    runner = CliRunner()

    result = runner.invoke(status, ["--delete-session", "missing"])

    assert result.exit_code != 0
    assert "Session missing not found" in result.output


def test_status_connect_info_uses_workspace_from_other_cwd(
    status_workspace_env,
) -> None:
    os.chdir(status_workspace_env.workspace)
    status_workspace_env.create_session(port=61234)
    os.chdir(status_workspace_env.outside)

    runner = CliRunner()
    result = runner.invoke(
        status,
        [
            "--connect-info",
            "--json",
            "--workspace",
            str(status_workspace_env.workspace),
        ],
    )

    assert result.exit_code == 0, result.output
    payload = _decode_connect_info(result.output)
    assert payload["session"]["port"] == 61234


def test_stop_uses_workspace_from_other_cwd(status_workspace_env) -> None:
    os.chdir(status_workspace_env.workspace)
    session = status_workspace_env.create_session(port=61235)
    session_dir = status_workspace_env.sessions_root / session.id
    assert session_dir.exists()
    os.chdir(status_workspace_env.outside)

    runner = CliRunner()
    result = runner.invoke(stop, ["--workspace", str(status_workspace_env.workspace)])

    assert result.exit_code == 0, result.output
    assert f"Stopped session {session.id}." in result.output
    assert not session_dir.exists()


def test_stop_local_profile_uses_profile_runtime_sessions_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)

    default_sessions_root = workspace / "setta_files" / "runtime" / "sessions"
    default_sessions_root.mkdir(parents=True, exist_ok=True)
    default_registry = SessionRegistry(sessions_root=default_sessions_root)
    default_session = default_registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61230,
        pid=os.getpid(),
    )

    lookup_home = tmp_path / ".setta"
    profile_root = tmp_path / "profiles" / "dev" / "setta_files_dev"
    profile_sessions_root = profile_root / "runtime" / "sessions"
    profile_sessions_root.mkdir(parents=True, exist_ok=True)
    profile_registry = SessionRegistry(sessions_root=profile_sessions_root)
    profile_session = profile_registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61231,
        pid=os.getpid(),
    )

    profile_path = lookup_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "settaFilesRoot": str(profile_root),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setenv("SETTA_HOME", str(lookup_home))
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
    clear_setta_paths_cache()

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "--profile",
            "dev",
            "stop",
            "--workspace",
            str(workspace),
        ],
    )

    assert result.exit_code == 0, result.output
    assert f"Stopped session {profile_session.id}." in result.output
    assert (profile_sessions_root / profile_session.id).exists() is False
    assert (default_sessions_root / default_session.id).exists() is True
