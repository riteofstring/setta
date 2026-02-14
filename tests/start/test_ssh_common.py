import os
import subprocess
import socket
from datetime import datetime

import pytest

from setta import ssh_common
from setta.auth.bootstrap import extract_token_from_bootstrap_url
from setta.launch import LaunchError


def test_split_tilde_path_allows_safe_prefixes() -> None:
    assert ssh_common._split_tilde_path("~") == ("~", "")
    assert ssh_common._split_tilde_path("~/repo") == ("~", "repo")
    assert ssh_common._split_tilde_path("~user/repo") == ("~user", "repo")
    assert ssh_common._split_tilde_path("/tmp/repo") is None


def test_split_tilde_path_rejects_shell_metacharacters() -> None:
    with pytest.raises(LaunchError) as excinfo:
        ssh_common._split_tilde_path("~;touch${IFS}/tmp/pwn")
    assert excinfo.value.code == "RemoteWorkspace"


def test_parse_session_list_validates_required_keys() -> None:
    with pytest.raises(LaunchError) as excinfo:
        ssh_common.parse_session_list({"sessions": [{"id": "session-1"}]})
    assert excinfo.value.code == "RemoteSessionList"


def test_parse_session_list_requires_workspace_paths() -> None:
    payload = {
        "sessions": [
            {
                "id": "session-1",
                "workspacePath": "/tmp/work",
                "host": "127.0.0.1",
                "port": 61234,
                "pid": 123,
                "startedAt": "2025-01-01T00:00:00",
            }
        ]
    }
    with pytest.raises(LaunchError) as excinfo:
        ssh_common.parse_session_list(payload)
    assert excinfo.value.code == "RemoteSessionList"


def test_parse_session_list_parses_valid_payload() -> None:
    payload = {
        "sessions": [
            {
                "id": "session-1",
                "workspacePath": "/tmp/work",
                "workspacePathCanonical": "/tmp/work",
                "host": "127.0.0.1",
                "port": "61234",
                "pid": 123,
                "startedAt": "2025-01-01T00:00:00",
            }
        ]
    }
    sessions = ssh_common.parse_session_list(payload)
    assert len(sessions) == 1
    session = sessions[0]
    assert session.id == "session-1"
    assert session.port == 61234
    assert session.pid == 123
    assert session.started_at == datetime.fromisoformat("2025-01-01T00:00:00")


def test_is_safe_remote_path_allows_spaces_and_rejects_control_chars() -> None:
    assert ssh_common._is_safe_remote_path("/tmp/has space") is True
    assert ssh_common._is_safe_remote_path("/tmp/has\ttab") is True
    assert ssh_common._is_safe_remote_path("relative/path") is False
    assert ssh_common._is_safe_remote_path("/tmp/has\nnewline") is False
    assert ssh_common._is_safe_remote_path("/tmp/has\rnewline") is False
    assert ssh_common._is_safe_remote_path("/tmp/has\x00null") is False


def test_resolve_remote_logs_dir_uses_workspace_local_when_local_location() -> None:
    workspace = "/tmp/My Work"
    resolved = ssh_common.resolve_remote_logs_dir(
        workspace=workspace,
        setta_files_location="local",
    )
    assert resolved == "/tmp/My Work/setta_files/runtime/logs"


def test_resolve_remote_logs_dir_uses_tmp_for_global_location() -> None:
    workspace = "/tmp/My Work"
    resolved = ssh_common.resolve_remote_logs_dir(
        workspace=workspace,
        setta_files_location="global",
    )
    assert resolved == "/tmp"


def test_resolve_remote_logs_dir_uses_explicit_runtime_root() -> None:
    resolved = ssh_common.resolve_remote_logs_dir(
        workspace="/tmp/work",
        setta_files_location=None,
        runtime_root="/tmp/custom_runtime",
    )
    assert resolved == "/tmp/custom_runtime/logs"


def test_resolve_remote_logs_dir_uses_explicit_setta_files_root() -> None:
    resolved = ssh_common.resolve_remote_logs_dir(
        workspace="/tmp/work",
        setta_files_location=None,
        setta_files_root="/tmp/custom_state",
    )
    assert resolved == "/tmp/custom_state/runtime/logs"


def test_resolve_remote_logs_dir_resolves_relative_runtime_root_from_workspace() -> None:
    resolved = ssh_common.resolve_remote_logs_dir(
        workspace="/tmp/workspace",
        setta_files_location=None,
        runtime_root="setta_files_dev/runtime_custom",
    )
    assert resolved == "/tmp/workspace/setta_files_dev/runtime_custom/logs"


def test_resolve_remote_logs_dir_resolves_relative_setta_files_root_from_workspace() -> None:
    resolved = ssh_common.resolve_remote_logs_dir(
        workspace="/tmp/workspace",
        setta_files_location=None,
        setta_files_root="setta_files_dev",
    )
    assert resolved == "/tmp/workspace/setta_files_dev/runtime/logs"


def test_build_remote_setta_path_args_rejects_conflicting_root_and_location() -> None:
    with pytest.raises(LaunchError) as excinfo:
        ssh_common.build_remote_setta_path_args(
            setta_files_root="/tmp/state",
            setta_files_location="global",
        )
    assert excinfo.value.code == "InvalidSettaFilesConfig"


def test_resolve_remote_setta_command_ignores_whitespace_remote_cmd(
    monkeypatch,
) -> None:
    def fake_run_ssh_command(_ssh_target, _ssh_args, _remote_command, **_kwargs):
        return subprocess.CompletedProcess([], 0, stdout="setta\n", stderr="")

    monkeypatch.setattr(ssh_common, "run_ssh_command", fake_run_ssh_command)

    resolved = ssh_common.resolve_remote_setta_command(
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "   ",
        ssh_prefix=["ssh"],
    )
    assert resolved == "setta"


def test_start_remote_setta_uses_unique_nohup_log_file(monkeypatch) -> None:
    captured: dict[str, str | None] = {"remote_command": None}

    monkeypatch.setattr(
        ssh_common, "_remote_command_exists", lambda *_args, **_kwargs: True
    )

    def fake_run_ssh_command(_ssh_target, _ssh_args, remote_command, **_kwargs):
        captured["remote_command"] = remote_command
        return subprocess.CompletedProcess([], 0, stdout="", stderr="")

    monkeypatch.setattr(ssh_common, "run_ssh_command", fake_run_ssh_command)

    ssh_common.start_remote_setta(
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "setta",
        "",
        ssh_prefix=["ssh"],
        setta_files_location="local",
    )
    assert captured["remote_command"] is not None
    assert "/nohup-" in captured["remote_command"]
    assert "/nohup.out" not in captured["remote_command"]
    assert "/tmp/work/setta_files/runtime/logs/nohup-" in captured["remote_command"]
    assert ".out" in captured["remote_command"]


def test_start_remote_setta_surfaces_ssh_timeout(monkeypatch) -> None:
    monkeypatch.setattr(
        ssh_common, "_remote_command_exists", lambda *_args, **_kwargs: True
    )

    def fake_run_ssh_command(*_args, **_kwargs):
        raise LaunchError("SshTimeout", "timed out")

    monkeypatch.setattr(ssh_common, "run_ssh_command", fake_run_ssh_command)

    with pytest.raises(LaunchError) as excinfo:
        ssh_common.start_remote_setta(
            "user@host",
            [],
            "bash",
            "/tmp/work",
            "setta",
            "",
            ssh_prefix=["ssh"],
            setta_files_location="local",
        )
    assert excinfo.value.code == "SshTimeout"


def test_start_remote_setta_raises_real_ssh_errors(monkeypatch) -> None:
    monkeypatch.setattr(
        ssh_common, "_remote_command_exists", lambda *_args, **_kwargs: True
    )

    def fake_run_ssh_command(*_args, **_kwargs):
        raise LaunchError("SshMissing", "missing ssh")

    monkeypatch.setattr(ssh_common, "run_ssh_command", fake_run_ssh_command)

    with pytest.raises(LaunchError) as excinfo:
        ssh_common.start_remote_setta(
            "user@host",
            [],
            "bash",
            "/tmp/work",
            "setta",
            "",
            ssh_prefix=["ssh"],
            setta_files_location="local",
        )
    assert excinfo.value.code == "SshMissing"


def test_run_ssh_command_reports_missing_ssh_binary() -> None:
    with pytest.raises(LaunchError) as excinfo:
        ssh_common.run_ssh_command(
            "user@host",
            [],
            "echo hi",
            ssh_prefix=["ssh-does-not-exist"],
            timeout=0.1,
        )
    assert excinfo.value.code == "SshMissing"


def test_apply_control_socket_args_uses_hashed_control_path() -> None:
    if os.name != "posix":
        pytest.skip("Control socket defaults only apply on POSIX.")
    args = ssh_common.apply_control_socket_args([])
    assert "ControlPath=/tmp/setta-ctl-%C" in args


def test_extract_token_from_bootstrap_url_ignores_extra_fragment_params() -> None:
    url = (
        "http://127.0.0.1:8000/__setta__/bootstrap"
        "#token=abc123&wh=payload&lo=http%3A%2F%2Fexample.com"
    )
    assert extract_token_from_bootstrap_url(url) == "abc123"


def test_wait_for_local_port_returns_true_when_listening() -> None:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        server.bind(("127.0.0.1", 0))
    except OSError:
        pytest.skip("Socket binds are not permitted in this test environment.")
    server.listen(1)
    port = server.getsockname()[1]
    try:
        assert ssh_common.wait_for_local_port(
            "127.0.0.1",
            port,
            timeout_seconds=0.5,
            poll_interval_seconds=0.01,
            connect_timeout_seconds=0.05,
        )
    finally:
        server.close()


def test_wait_for_local_port_returns_false_when_not_listening() -> None:
    held = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        held.bind(("127.0.0.1", 0))
    except OSError:
        pytest.skip("Socket binds are not permitted in this test environment.")
    port = held.getsockname()[1]
    try:
        assert (
            ssh_common.wait_for_local_port(
                "127.0.0.1",
                port,
                timeout_seconds=0.2,
                poll_interval_seconds=0.02,
                connect_timeout_seconds=0.05,
            )
            is False
        )
    finally:
        held.close()
