import os
from datetime import datetime
from pathlib import PurePosixPath
import subprocess

import pytest

from setta import ssh_common
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


def test_resolve_remote_logs_dir_allows_spaces_in_workspace_and_roots() -> None:
    workspace = "/tmp/My Work"
    files_root_base = "/tmp/state base"
    resolved = ssh_common._resolve_remote_logs_dir(
        workspace=workspace,
        files_root=None,
        files_root_base=files_root_base,
    )
    computed = ssh_common.build_files_root_from_base(
        PurePosixPath(files_root_base.strip()),
        PurePosixPath(workspace),
    )
    assert resolved == f"{computed.as_posix().rstrip('/')}/runtime/logs"


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
        files_root="/tmp/state",
        files_root_base=None,
    )
    assert captured["remote_command"] is not None
    assert "/nohup-" in captured["remote_command"]
    assert "/nohup.out" not in captured["remote_command"]


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
    assert ssh_common.extract_token_from_bootstrap_url(url) == "abc123"
