from datetime import datetime

from click.testing import CliRunner

import setta.start as start


def test_connect_forwards_profile_without_local_profile_validation(monkeypatch) -> None:
    captured: dict[str, str | None] = {"profile": None}

    def fake_build_remote_setta_path_args(**kwargs) -> str:
        captured["profile"] = kwargs.get("profile")
        return "--profile missing"

    session = start.RemoteSessionSummary(
        id="session-1",
        workspace_path="/tmp/work",
        workspace_path_canonical="/tmp/work",
        host="127.0.0.1",
        port=61234,
        pid=111,
        started_at=datetime.fromisoformat("2025-01-01T00:00:00"),
        server_mode="ide",
    )

    monkeypatch.setattr(start, "_build_remote_setta_path_args", fake_build_remote_setta_path_args)
    monkeypatch.setattr(start, "_resolve_remote_shell", lambda *_args, **_kwargs: "bash")
    monkeypatch.setattr(
        start,
        "_resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/work",
    )
    monkeypatch.setattr(start, "_resolve_remote_setta_command", lambda *_args, **_kwargs: "setta")
    monkeypatch.setattr(start, "_fetch_remote_sessions", lambda *_args, **_kwargs: [session])
    monkeypatch.setattr(
        start,
        "_fetch_remote_connect_info",
        lambda *_args, **_kwargs: {
            "bootstrapUrlFragment": "http://127.0.0.1:61234/__setta__/bootstrap#token=abc"
        },
    )
    monkeypatch.setattr(start, "_select_free_port", lambda _host: 62000)

    runner = CliRunner()
    result = runner.invoke(
        start.cli,
        [
            "--profile",
            "missing",
            "connect",
            "user@host",
            "--workspace",
            "/tmp/work",
            "--latest",
            "--print-only",
        ],
    )

    assert result.exit_code == 0, result.output
    assert captured["profile"] == "missing"
    assert "Unknown Setta profile" not in result.output


def test_stop_forwards_profile_without_local_profile_validation(monkeypatch) -> None:
    captured: dict[str, str | None] = {
        "profile": None,
        "deleted_id": None,
        "server_mode": None,
    }

    def fake_build_remote_setta_path_args(**kwargs) -> str:
        captured["profile"] = kwargs.get("profile")
        return "--profile missing"

    session = start.RemoteSessionSummary(
        id="session-2",
        workspace_path="/tmp/work",
        workspace_path_canonical="/tmp/work",
        host="127.0.0.1",
        port=61234,
        pid=222,
        started_at=datetime.fromisoformat("2025-01-01T00:00:00"),
        server_mode="ide",
    )

    def fake_delete_remote_session(*args, **_kwargs) -> None:
        captured["deleted_id"] = args[-1]

    def fake_fetch_remote_sessions(*_args, **kwargs):
        captured["server_mode"] = kwargs.get("server_mode")
        return [session]

    monkeypatch.setattr(start, "_build_remote_setta_path_args", fake_build_remote_setta_path_args)
    monkeypatch.setattr(start, "_resolve_remote_shell", lambda *_args, **_kwargs: "bash")
    monkeypatch.setattr(
        start,
        "_resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/work",
    )
    monkeypatch.setattr(start, "_resolve_remote_setta_command", lambda *_args, **_kwargs: "setta")
    monkeypatch.setattr(start, "_fetch_remote_sessions", fake_fetch_remote_sessions)
    monkeypatch.setattr(start, "_delete_remote_session", fake_delete_remote_session)

    runner = CliRunner()
    result = runner.invoke(
        start.cli,
        [
            "--profile",
            "missing",
            "stop",
            "user@host",
            "--workspace",
            "/tmp/work",
            "--latest",
        ],
    )

    assert result.exit_code == 0, result.output
    assert captured["profile"] == "missing"
    assert captured["server_mode"] == "ide"
    assert captured["deleted_id"] == "session-2"
    assert "Unknown Setta profile" not in result.output


def test_stop_forwards_server_mode_override_for_remote(monkeypatch) -> None:
    captured: dict[str, str | None] = {"server_mode": None, "deleted_id": None}

    session = start.RemoteSessionSummary(
        id="session-launcher",
        workspace_path="/tmp/work",
        workspace_path_canonical="/tmp/work",
        host="127.0.0.1",
        port=61236,
        pid=223,
        started_at=datetime.fromisoformat("2025-01-01T00:00:00"),
        server_mode="launcher",
    )

    def fake_fetch_remote_sessions(*_args, **kwargs):
        captured["server_mode"] = kwargs.get("server_mode")
        return [session]

    def fake_delete_remote_session(*args, **_kwargs) -> None:
        captured["deleted_id"] = args[-1]

    monkeypatch.setattr(start, "_build_remote_setta_path_args", lambda **_kwargs: "")
    monkeypatch.setattr(start, "_resolve_remote_shell", lambda *_args, **_kwargs: "bash")
    monkeypatch.setattr(
        start,
        "_resolve_remote_workspace",
        lambda *_args, **_kwargs: "/tmp/work",
    )
    monkeypatch.setattr(start, "_resolve_remote_setta_command", lambda *_args, **_kwargs: "setta")
    monkeypatch.setattr(start, "_fetch_remote_sessions", fake_fetch_remote_sessions)
    monkeypatch.setattr(start, "_delete_remote_session", fake_delete_remote_session)

    runner = CliRunner()
    result = runner.invoke(
        start.cli,
        [
            "stop",
            "user@host",
            "--workspace",
            "/tmp/work",
            "--latest",
            "--server-mode",
            "launcher",
        ],
    )

    assert result.exit_code == 0, result.output
    assert captured["server_mode"] == "launcher"
    assert captured["deleted_id"] == "session-launcher"


def test_connect_surfaces_conflicting_path_flags_as_click_error() -> None:
    # Conflicting remote path flags should be rendered as a normal CLI usage error.
    runner = CliRunner()
    result = runner.invoke(
        start.cli,
        [
            "--setta-files-root",
            "/tmp/state",
            "--setta-files-location",
            "local",
            "connect",
            "user@host",
            "--workspace",
            "/tmp/work",
            "--latest",
            "--print-only",
        ],
    )

    assert result.exit_code != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location for remote commands."
        in result.output
    )
    assert "Traceback" not in result.output


def test_stop_surfaces_conflicting_path_flags_as_click_error() -> None:
    # stop uses the same remote path flag builder and should avoid traceback output.
    runner = CliRunner()
    result = runner.invoke(
        start.cli,
        [
            "--setta-files-root",
            "/tmp/state",
            "--setta-files-location",
            "local",
            "stop",
            "user@host",
            "--workspace",
            "/tmp/work",
            "--latest",
        ],
    )

    assert result.exit_code != 0
    assert (
        "Cannot pass both --setta-files-root and --setta-files-location for remote commands."
        in result.output
    )
    assert "Traceback" not in result.output
