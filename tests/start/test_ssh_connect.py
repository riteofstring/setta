import subprocess
import sys
import time
from dataclasses import fields
from datetime import datetime, timezone

import psutil
import pytest

from setta import ssh_connect
from setta.launch import LaunchError
from setta.ssh_common import RemoteSessionSummary
from tests.utils.setta_paths import temporary_setta_paths


def _spawn_sleep_process() -> subprocess.Popen[str]:
    # Use Python so the test works consistently across platforms.
    return subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )


def _cleanup_process(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)


def test_pid_matches_create_time_detects_pid_reuse() -> None:
    proc = _spawn_sleep_process()
    try:
        create_time = psutil.Process(proc.pid).create_time()

        assert ssh_connect._pid_matches_create_time(proc.pid, create_time) is True
        assert ssh_connect._pid_matches_create_time(proc.pid, create_time + 10) is False
    finally:
        _cleanup_process(proc)


def test_stop_pid_skips_when_create_time_mismatch() -> None:
    proc = _spawn_sleep_process()
    try:
        create_time = psutil.Process(proc.pid).create_time()

        ssh_connect._stop_pid(proc.pid, expected_create_time=create_time + 10)
        time.sleep(0.2)

        assert proc.poll() is None
    finally:
        _cleanup_process(proc)


def test_stop_pid_terminates_when_create_time_matches() -> None:
    proc = _spawn_sleep_process()
    try:
        create_time = psutil.Process(proc.pid).create_time()

        ssh_connect._stop_pid(proc.pid, expected_create_time=create_time)
        proc.wait(timeout=5)

        assert proc.poll() is not None
    finally:
        _cleanup_process(proc)


def test_stop_pid_treats_no_such_process_races_as_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeProc:
        def __init__(self, pid: int) -> None:
            self._pid = pid

        def create_time(self) -> float:
            return 123.456

        def terminate(self) -> None:
            raise psutil.NoSuchProcess(pid=self._pid)

    monkeypatch.setattr(psutil, "Process", lambda pid: _FakeProc(pid))

    # Should not raise even if the process disappears between checks.
    ssh_connect._stop_pid(99, expected_create_time=123.456)


def test_remote_connect_result_contract_excludes_unused_launcher_origin_field() -> None:
    field_names = [field.name for field in fields(ssh_connect.RemoteConnectResult)]

    assert "launcher_origin" not in field_names
    assert "launcher_origin_proof" in field_names


def test_ensure_ssh_tunnel_reports_missing_ssh_binary(tmp_path) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    setta_files_root = workspace_root / "setta_files"
    setta_files_root.mkdir()

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
    ):
        with pytest.raises(LaunchError) as excinfo:
            ssh_connect._ensure_ssh_tunnel(
                ssh_target="user@host",
                ssh_prefix=["ssh-does-not-exist"],
                ssh_args=[],
                remote_host="127.0.0.1",
                remote_port=61234,
                requested_local_port=61000,
            )
    assert excinfo.value.code == "SshMissing"


def test_connect_remote_workspace_session_preserves_omitted_location_for_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str | None] = {"setta_files_location": "unexpected"}

    def fake_build_remote_setta_path_args(**kwargs) -> str:
        captured["setta_files_location"] = kwargs.get("setta_files_location")
        return ""

    session = RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/workspace",
        workspace_path_canonical="/tmp/workspace",
        host="127.0.0.1",
        port=61234,
        pid=123,
        started_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/workspace",
    )
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta"
    )
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", fake_build_remote_setta_path_args
    )
    monkeypatch.setattr(
        ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session]
    )
    monkeypatch.setattr(
        ssh_connect,
        "fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
            "settaFilesLocation": "local",
        },
    )
    monkeypatch.setattr(
        ssh_connect,
        "_ensure_ssh_tunnel",
        lambda **_kwargs: ssh_connect.SshTunnelMetadata(
            keyHash="k",
            remoteHost="127.0.0.1",
            remotePort=61234,
            localPort=62000,
            pid=999,
            pidCreateTime=1.0,
            createdAt="2025-01-01T00:00:00+00:00",
            lastUsedAt="2025-01-01T00:00:00+00:00",
        ),
    )

    result = ssh_connect.connect_remote_workspace_session(
        ssh_target="user@host",
        workspace="/tmp/workspace",
        profile="dev",
        setta_files_location=None,
    )

    assert result.bootstrap_url_fragment.startswith(
        "http://127.0.0.1:62000/__setta__/bootstrap#token="
    )
    assert captured["setta_files_location"] is None


def test_connect_remote_workspace_session_defaults_to_auto_without_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str | None] = {"setta_files_location": None}

    def fake_build_remote_setta_path_args(**kwargs) -> str:
        captured["setta_files_location"] = kwargs.get("setta_files_location")
        return ""

    session = RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/workspace",
        workspace_path_canonical="/tmp/workspace",
        host="127.0.0.1",
        port=61234,
        pid=123,
        started_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/workspace",
    )
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta"
    )
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", fake_build_remote_setta_path_args
    )
    monkeypatch.setattr(
        ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session]
    )
    monkeypatch.setattr(
        ssh_connect,
        "fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
            "settaFilesLocation": "local",
        },
    )
    monkeypatch.setattr(
        ssh_connect,
        "_ensure_ssh_tunnel",
        lambda **_kwargs: ssh_connect.SshTunnelMetadata(
            keyHash="k",
            remoteHost="127.0.0.1",
            remotePort=61234,
            localPort=62000,
            pid=999,
            pidCreateTime=1.0,
            createdAt="2025-01-01T00:00:00+00:00",
            lastUsedAt="2025-01-01T00:00:00+00:00",
        ),
    )

    result = ssh_connect.connect_remote_workspace_session(
        ssh_target="user@host",
        workspace="/tmp/workspace",
        profile=None,
        setta_files_location=None,
    )

    assert result.bootstrap_url_fragment.startswith(
        "http://127.0.0.1:62000/__setta__/bootstrap#token="
    )
    assert captured["setta_files_location"] == "auto"


def test_connect_remote_workspace_session_treats_whitespace_profile_as_omitted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str | None] = {
        "setta_files_location": None,
        "profile": None,
    }

    def fake_build_remote_setta_path_args(**kwargs) -> str:
        captured["setta_files_location"] = kwargs.get("setta_files_location")
        captured["profile"] = kwargs.get("profile")
        return ""

    session = RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/workspace",
        workspace_path_canonical="/tmp/workspace",
        host="127.0.0.1",
        port=61234,
        pid=123,
        started_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/workspace",
    )
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta"
    )
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", fake_build_remote_setta_path_args
    )
    monkeypatch.setattr(
        ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session]
    )
    monkeypatch.setattr(
        ssh_connect,
        "fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
            "settaFilesLocation": "local",
        },
    )
    monkeypatch.setattr(
        ssh_connect,
        "_ensure_ssh_tunnel",
        lambda **_kwargs: ssh_connect.SshTunnelMetadata(
            keyHash="k",
            remoteHost="127.0.0.1",
            remotePort=61234,
            localPort=62000,
            pid=999,
            pidCreateTime=1.0,
            createdAt="2025-01-01T00:00:00+00:00",
            lastUsedAt="2025-01-01T00:00:00+00:00",
        ),
    )

    result = ssh_connect.connect_remote_workspace_session(
        ssh_target="user@host",
        workspace="/tmp/workspace",
        profile="   ",
        setta_files_location=None,
    )

    assert result.bootstrap_url_fragment.startswith(
        "http://127.0.0.1:62000/__setta__/bootstrap#token="
    )
    assert captured["setta_files_location"] == "auto"
    assert captured["profile"] is None


def test_connect_remote_workspace_session_requests_ide_server_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str | None] = {"server_mode": None}
    session = RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/workspace",
        workspace_path_canonical="/tmp/workspace",
        host="127.0.0.1",
        port=61234,
        pid=123,
        started_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )

    def fake_fetch_remote_sessions(*_args, **kwargs):
        captured["server_mode"] = kwargs.get("server_mode")
        return [session]

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/workspace",
    )
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta"
    )
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", lambda **_kwargs: ""
    )
    monkeypatch.setattr(
        ssh_connect, "fetch_remote_sessions", fake_fetch_remote_sessions
    )
    monkeypatch.setattr(
        ssh_connect,
        "fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
            "settaFilesLocation": "local",
        },
    )
    monkeypatch.setattr(
        ssh_connect,
        "_ensure_ssh_tunnel",
        lambda **_kwargs: ssh_connect.SshTunnelMetadata(
            keyHash="k",
            remoteHost="127.0.0.1",
            remotePort=61234,
            localPort=62000,
            pid=999,
            pidCreateTime=1.0,
            createdAt="2025-01-01T00:00:00+00:00",
            lastUsedAt="2025-01-01T00:00:00+00:00",
        ),
    )

    result = ssh_connect.connect_remote_workspace_session(
        ssh_target="user@host",
        workspace="/tmp/workspace",
    )

    assert result.bootstrap_url_fragment.startswith(
        "http://127.0.0.1:62000/__setta__/bootstrap#token="
    )
    assert captured["server_mode"] == "ide"


def test_connect_remote_workspace_session_rejects_mismatched_launcher_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/workspace",
        workspace_path_canonical="/tmp/workspace",
        host="127.0.0.1",
        port=61234,
        pid=123,
        started_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/workspace",
    )
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta"
    )
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", lambda **_kwargs: ""
    )
    monkeypatch.setattr(
        ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session]
    )
    monkeypatch.setattr(
        ssh_connect,
        "fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
            "settaFilesLocation": "local",
            "launcherOrigin": "https://evil.example",
            "launcherOriginProof": "proof",
        },
    )

    with pytest.raises(LaunchError) as excinfo:
        ssh_connect.connect_remote_workspace_session(
            ssh_target="user@host",
            workspace="/tmp/workspace",
            launcher_origin="http://launcher.example:7999",
        )

    assert excinfo.value.code == "RemoteConnectInfo"
    assert "did not match requested launcher origin" in str(excinfo.value)


def test_connect_remote_workspace_session_requires_launcher_origin_proof(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    launcher_origin = "http://launcher.example:7999"
    session = RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/workspace",
        workspace_path_canonical="/tmp/workspace",
        host="127.0.0.1",
        port=61234,
        pid=123,
        started_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/workspace",
    )
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta"
    )
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", lambda **_kwargs: ""
    )
    monkeypatch.setattr(
        ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session]
    )
    monkeypatch.setattr(
        ssh_connect,
        "fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc",
            "settaFilesLocation": "local",
            "launcherOrigin": launcher_origin,
        },
    )

    with pytest.raises(LaunchError) as excinfo:
        ssh_connect.connect_remote_workspace_session(
            ssh_target="user@host",
            workspace="/tmp/workspace",
            launcher_origin=launcher_origin,
        )

    assert excinfo.value.code == "RemoteConnectInfo"
    assert "did not include launcherOriginProof" in str(excinfo.value)


def test_rollback_remote_workspace_session_deletes_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/remote/workspace",
    )
    monkeypatch.setattr(
        ssh_connect,
        "build_remote_setta_path_args",
        lambda **_kwargs: "--profile dev",
    )

    def fake_run_remote_setta_command(
        ssh_target: str,
        ssh_args: list[str],
        shell: str,
        workspace: str,
        setta_command: str,
        setta_args: str,
        **_kwargs,
    ) -> subprocess.CompletedProcess[str]:
        captured["ssh_target"] = ssh_target
        captured["ssh_args"] = ssh_args
        captured["shell"] = shell
        captured["workspace"] = workspace
        captured["setta_command"] = setta_command
        captured["setta_args"] = setta_args
        return subprocess.CompletedProcess(
            args=["ssh"], returncode=0, stdout="", stderr=""
        )

    monkeypatch.setattr(
        ssh_connect, "run_remote_setta_command", fake_run_remote_setta_command
    )

    ssh_connect.rollback_remote_workspace_session(
        ssh_target="user@host",
        ssh_args="-i ~/.ssh/id_ed25519",
        workspace="/requested/workspace",
        session_id="session-123",
        remote_cmd="setta",
        profile="dev",
    )

    assert captured["ssh_target"] == "user@host"
    assert captured["shell"] == "bash"
    assert captured["workspace"] == "/remote/workspace"
    assert captured["setta_command"] == "setta"
    assert captured["setta_args"] == "--profile dev status --delete-session session-123"
    assert isinstance(captured["ssh_args"], list)
    assert captured["ssh_args"]


def test_rollback_remote_workspace_session_raises_when_delete_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash"
    )
    monkeypatch.setattr(
        ssh_connect,
        "resolve_remote_workspace",
        lambda *_args, **_kwargs: "/remote/workspace",
    )
    monkeypatch.setattr(
        ssh_connect,
        "build_remote_setta_path_args",
        lambda **_kwargs: "",
    )
    monkeypatch.setattr(
        ssh_connect,
        "run_remote_setta_command",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            args=["ssh"], returncode=1, stdout="", stderr="permission denied"
        ),
    )

    with pytest.raises(LaunchError) as excinfo:
        ssh_connect.rollback_remote_workspace_session(
            ssh_target="user@host",
            workspace="/requested/workspace",
            session_id="session-123",
            remote_cmd="setta",
        )

    assert excinfo.value.code == "RemoteRollback"
    assert "session-123" in str(excinfo.value)


def test_rollback_local_ssh_tunnel_stops_process_and_deletes_metadata(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    runtime_root = tmp_path / "runtime"
    runtime_root.mkdir(parents=True, exist_ok=True)

    ssh_target = "user@host"
    ssh_args = "-i ~/.ssh/id_ed25519"
    remote_host = "127.0.0.1"
    remote_port = 61234
    ssh_args_list = ssh_connect.apply_control_socket_args(
        ssh_connect.parse_ssh_args(ssh_args)
    )
    key_hash = ssh_connect._compute_tunnel_key_hash(
        ssh_target=ssh_target,
        ssh_args=ssh_args_list,
        remote_host=remote_host,
        remote_port=remote_port,
    )
    tunnel_id = ssh_connect._tunnel_id_for_key_hash(key_hash)
    metadata_path = runtime_root / "ssh_tunnels" / f"{tunnel_id}.json"
    metadata = ssh_connect.SshTunnelMetadata(
        keyHash=key_hash,
        remoteHost=remote_host,
        remotePort=remote_port,
        localPort=62000,
        pid=999,
        pidCreateTime=123.456,
        createdAt="2025-01-01T00:00:00+00:00",
        lastUsedAt="2025-01-01T00:00:00+00:00",
    )
    ssh_connect._write_tunnel_metadata(metadata_path, metadata)

    stop_calls: list[tuple[int, float | None]] = []
    monkeypatch.setattr(
        ssh_connect,
        "_stop_pid",
        lambda pid, *, expected_create_time=None: stop_calls.append(
            (pid, expected_create_time)
        ),
    )

    with temporary_setta_paths(
        workspace_root=workspace_root,
        runtime_root=runtime_root,
        setta_files_location="local",
    ):
        ssh_connect.rollback_local_ssh_tunnel(
            ssh_target=ssh_target,
            ssh_args=ssh_args,
            remote_host=remote_host,
            remote_port=remote_port,
        )

    assert stop_calls == [(999, 123.456)]
    assert metadata_path.exists() is False
