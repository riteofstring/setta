from datetime import datetime

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

