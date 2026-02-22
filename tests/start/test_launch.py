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


def test_launch_reports_invalid_runtime_root(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    runtime_root_file = tmp_path / "runtime-root-file"
    runtime_root_file.write_text("not a directory", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--setta-files-location",
            "local",
            "--runtime-root",
            str(runtime_root_file),
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidRuntimeRoot"
    assert "runtime root is not a directory" in payload["error"]["message"]


def test_launch_reports_invalid_setta_home(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    invalid_setta_home = tmp_path / "custom-home"

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--setta-home",
            str(invalid_setta_home),
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidSettaHome"
    assert "must end with one of" in payload["error"]["message"]


def test_launch_rejects_runtime_root_matching_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--setta-files-location",
            "local",
            "--runtime-root",
            str(workspace),
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidRuntimeRoot"
    assert "Runtime root cannot be the workspace root" in payload["error"]["message"]


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


def test_launch_workspace_session_clears_inherited_auth_cookie_name(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setenv("SETTA_AUTH_COOKIE_NAME", "stale_cookie")
    captured_env: dict[str, str] = {}

    def capture_spawn_env(*_args, **kwargs):
        env = kwargs.get("env")
        if isinstance(env, dict):
            captured_env.update(env)
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", capture_spawn_env)

    with pytest.raises(LaunchError):
        launch_workspace_session(
            workspace_root=workspace,
            setta_files_location="local",
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )

    assert "SETTA_AUTH_COOKIE_NAME" not in captured_env


def test_launch_workspace_session_sanitizes_inherited_path_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_home = tmp_path / ".setta-development"
    stale_root = tmp_path / "stale_state_root" / "setta_files_dev"
    stale_runtime = tmp_path / "stale_runtime"

    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(tmp_path / "stale_workspace"))
    monkeypatch.setenv("SETTA_PROFILE", "stale-profile")
    monkeypatch.setenv("SETTA_HOME", str(tmp_path / ".setta"))
    monkeypatch.setenv("SETTA_PROFILE_LOOKUP_HOME", str(tmp_path / ".setta"))
    monkeypatch.setenv("SETTA_FILES_ROOT", str(stale_root))
    monkeypatch.setenv("SETTA_FILES_LOCATION", "global")
    monkeypatch.setenv("SETTA_RUNTIME_ROOT", str(stale_runtime))

    captured_cmd: list[str] = []
    captured_env: dict[str, str] = {}

    def capture_spawn_env(*args, **kwargs):
        command = args[0] if args else None
        if isinstance(command, list):
            captured_cmd.extend(str(part) for part in command)
        env = kwargs.get("env")
        if isinstance(env, dict):
            captured_env.update({str(k): str(v) for k, v in env.items()})
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", capture_spawn_env)

    with pytest.raises(LaunchError):
        launch_workspace_session(
            workspace_root=workspace,
            setta_home=setta_home,
            setta_files_location="local",
            allow_env_files_overrides=False,
            allow_env_non_files_overrides=False,
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )

    expected_setta_home = str(setta_home.resolve(strict=False))
    expected_workspace = str(workspace.resolve(strict=False))
    assert "--workspace" in captured_cmd
    assert captured_cmd[captured_cmd.index("--workspace") + 1] == expected_workspace
    assert "--setta-home" in captured_cmd
    assert captured_cmd[captured_cmd.index("--setta-home") + 1] == expected_setta_home
    assert "--setta-files-location" in captured_cmd
    assert captured_cmd[captured_cmd.index("--setta-files-location") + 1] == "local"
    assert "--setta-files-root" not in captured_cmd
    assert "--runtime-root" not in captured_cmd
    assert "--profile" not in captured_cmd
    assert "SETTA_WORKSPACE_ROOT" not in captured_env
    assert "SETTA_HOME" not in captured_env
    assert "SETTA_PROFILE_LOOKUP_HOME" not in captured_env
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert "SETTA_RUNTIME_ROOT" not in captured_env
    assert "SETTA_PROFILE" not in captured_env
    assert "SETTA_FILES_ROOT" not in captured_env


def test_launch_workspace_session_spawns_profile_with_runtime_home_and_lookup_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    lookup_home = tmp_path / ".setta"
    runtime_home = tmp_path / ".setta-development"
    profile_path = lookup_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "settaHome": str(runtime_home),
                "settaFilesLocation": "local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    captured_cmd: list[str] = []
    captured_env: dict[str, str] = {}

    def capture_spawn_command(*args, **kwargs):
        command = args[0] if args else None
        if isinstance(command, list):
            captured_cmd.extend(str(part) for part in command)
        env = kwargs.get("env")
        if isinstance(env, dict):
            captured_env.update({str(k): str(v) for k, v in env.items()})
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", capture_spawn_command)
    monkeypatch.setenv("SETTA_PROFILE_LOOKUP_HOME", str(lookup_home))

    with pytest.raises(LaunchError):
        launch_workspace_session(
            workspace_root=workspace,
            profile="dev",
            setta_files_location=None,
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )

    assert captured_cmd
    assert "--profile" in captured_cmd
    assert captured_cmd[captured_cmd.index("--profile") + 1] == "dev"
    assert "--setta-home" not in captured_cmd
    assert captured_env.get("SETTA_PROFILE_LOOKUP_HOME") == str(
        lookup_home.resolve(strict=False)
    )
    assert captured_env.get("SETTA_HOME") == str(runtime_home.resolve(strict=False))
    assert "SETTA_WORKSPACE_ROOT" not in captured_env
    assert "SETTA_FILES_ROOT" not in captured_env
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert "SETTA_RUNTIME_ROOT" not in captured_env
    assert "SETTA_PROFILE" not in captured_env


def test_launch_workspace_session_profile_lookup_home_arg_keeps_runtime_home(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    lookup_home = tmp_path / ".setta"
    runtime_home = tmp_path / ".setta-development"
    profile_path = lookup_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "settaHome": str(runtime_home),
                "settaFilesLocation": "local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    captured_cmd: list[str] = []
    captured_env: dict[str, str] = {}

    def capture_spawn_command(*args, **kwargs):
        command = args[0] if args else None
        if isinstance(command, list):
            captured_cmd.extend(str(part) for part in command)
        env = kwargs.get("env")
        if isinstance(env, dict):
            captured_env.update({str(k): str(v) for k, v in env.items()})
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", capture_spawn_command)
    monkeypatch.delenv("SETTA_PROFILE_LOOKUP_HOME", raising=False)

    with pytest.raises(LaunchError):
        launch_workspace_session(
            workspace_root=workspace,
            profile="dev",
            profile_lookup_home=lookup_home,
            setta_files_location=None,
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )

    assert "--profile" in captured_cmd
    assert captured_cmd[captured_cmd.index("--profile") + 1] == "dev"
    assert "--setta-home" not in captured_cmd
    assert captured_env.get("SETTA_PROFILE_LOOKUP_HOME") == str(
        lookup_home.resolve(strict=False)
    )
    assert captured_env.get("SETTA_HOME") == str(runtime_home.resolve(strict=False))


def test_launch_workspace_session_non_profile_keeps_setta_home_cli_flag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_home = tmp_path / ".setta-development"

    captured_cmd: list[str] = []
    captured_env: dict[str, str] = {}

    def capture_spawn_command(*args, **kwargs):
        command = args[0] if args else None
        if isinstance(command, list):
            captured_cmd.extend(str(part) for part in command)
        env = kwargs.get("env")
        if isinstance(env, dict):
            captured_env.update({str(k): str(v) for k, v in env.items()})
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "Popen", capture_spawn_command)

    with pytest.raises(LaunchError):
        launch_workspace_session(
            workspace_root=workspace,
            setta_home=setta_home,
            setta_files_location="local",
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )

    assert "--setta-home" in captured_cmd
    assert captured_cmd[captured_cmd.index("--setta-home") + 1] == str(
        setta_home.resolve(strict=False)
    )
    assert "SETTA_HOME" not in captured_env
    assert "SETTA_PROFILE_LOOKUP_HOME" not in captured_env
    assert "SETTA_WORKSPACE_ROOT" not in captured_env
    assert "SETTA_FILES_ROOT" not in captured_env
    assert "SETTA_FILES_LOCATION" not in captured_env
    assert "SETTA_RUNTIME_ROOT" not in captured_env
    assert "SETTA_PROFILE" not in captured_env


def test_launch_workspace_session_reports_runtime_log_init_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    runtime_root = tmp_path / "runtime_root"
    runtime_root.mkdir(parents=True, exist_ok=True)

    original_mkdir = Path.mkdir

    # Simulate a filesystem failure when initializing runtime logs.
    def fail_logs_mkdir(path: Path, *args, **kwargs):
        if path == runtime_root / "logs":
            raise OSError("permission denied")
        return original_mkdir(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", fail_logs_mkdir)

    with pytest.raises(LaunchError) as excinfo:
        launch_workspace_session(
            workspace_root=workspace,
            setta_files_location="local",
            runtime_root=runtime_root,
            timeout_seconds=1.0,
            poll_interval_seconds=0.1,
        )

    assert excinfo.value.code == "InvalidRuntimeRoot"
    assert str(runtime_root / "logs") in str(excinfo.value)


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
    explicit_root = tmp_path / "explicit_state" / "setta_files_dev"

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

    explicit_root = tmp_path / "explicit_state" / "setta_files_dev"
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
