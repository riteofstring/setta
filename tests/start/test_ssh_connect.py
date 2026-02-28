import subprocess
import sys
import time
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
    )

    monkeypatch.setattr(ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash")
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_workspace", lambda *_args, **_kwargs: "/tmp/workspace"
    )
    monkeypatch.setattr(ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta")
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", fake_build_remote_setta_path_args
    )
    monkeypatch.setattr(ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session])
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
    )

    monkeypatch.setattr(ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash")
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_workspace", lambda *_args, **_kwargs: "/tmp/workspace"
    )
    monkeypatch.setattr(ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta")
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", fake_build_remote_setta_path_args
    )
    monkeypatch.setattr(ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session])
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
    )

    monkeypatch.setattr(ssh_connect, "resolve_remote_shell", lambda *_args, **_kwargs: "bash")
    monkeypatch.setattr(
        ssh_connect, "resolve_remote_workspace", lambda *_args, **_kwargs: "/tmp/workspace"
    )
    monkeypatch.setattr(ssh_connect, "resolve_remote_setta_command", lambda *_args, **_kwargs: "setta")
    monkeypatch.setattr(
        ssh_connect, "build_remote_setta_path_args", fake_build_remote_setta_path_args
    )
    monkeypatch.setattr(ssh_connect, "fetch_remote_sessions", lambda *_args, **_kwargs: [session])
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
