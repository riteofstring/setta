from datetime import datetime, timezone

import click
import pytest

from setta.launch import LaunchError

import setta.start as start


def test_start_remote_setta_threads_setta_files_location(monkeypatch) -> None:
    captured: dict[str, str | None] = {"setta_files_location": None}

    def fake_start_remote_setta(*_args, **kwargs) -> None:
        captured["setta_files_location"] = kwargs.get("setta_files_location")

    monkeypatch.setattr(start.ssh_common, "start_remote_setta", fake_start_remote_setta)

    timed_out = start._start_remote_setta(
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "setta",
        "",
        setta_files_location="global",
    )

    assert timed_out is False
    assert captured["setta_files_location"] == "global"


def test_wait_for_remote_session_uses_shared_wait_helper_and_selects_latest(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    older_session = start.RemoteSessionSummary(
        id="older",
        workspace_path="/tmp/work",
        workspace_path_canonical="/tmp/work",
        host="127.0.0.1",
        port=61234,
        pid=1,
        started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        server_mode="ide",
    )
    newer_session = start.RemoteSessionSummary(
        id="newer",
        workspace_path="/tmp/work",
        workspace_path_canonical="/tmp/work",
        host="127.0.0.1",
        port=61235,
        pid=2,
        started_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        server_mode="ide",
    )

    # Ensure start.py delegates polling to the shared ssh_common helper.
    def fake_wait_for_remote_sessions(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return [older_session, newer_session]

    monkeypatch.setattr(
        start.ssh_common,
        "wait_for_remote_sessions",
        fake_wait_for_remote_sessions,
    )

    selected = start._wait_for_remote_session(
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "setta",
        "",
        setta_files_location="global",
        setta_files_root="/tmp/state",
        runtime_root="/tmp/runtime",
        timeout_seconds=9.0,
    )

    assert selected.id == "newer"
    assert captured["args"] == (
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "setta",
        "",
    )
    kwargs = captured["kwargs"]
    assert isinstance(kwargs, dict)
    assert kwargs["timeout_seconds"] == 9.0
    assert kwargs["setta_files_location"] == "global"
    assert kwargs["setta_files_root"] == "/tmp/state"
    assert kwargs["runtime_root"] == "/tmp/runtime"


def test_wait_for_remote_session_maps_remote_timeout_error_to_click_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Keep timeout handling stable for callers that check this exact message.
    def fake_wait_for_remote_sessions(*_args, **_kwargs):
        raise LaunchError(
            "RemoteLaunchTimeout",
            "Timed out waiting for remote Setta session to start. Check logs under: /tmp/logs",
        )

    monkeypatch.setattr(
        start.ssh_common,
        "wait_for_remote_sessions",
        fake_wait_for_remote_sessions,
    )

    with pytest.raises(click.ClickException) as excinfo:
        start._wait_for_remote_session(
            "user@host",
            [],
            "bash",
            "/tmp/work",
            "setta",
            "",
            setta_files_location="auto",
        )

    assert str(excinfo.value) == "Timed out waiting for remote Setta session to start."
