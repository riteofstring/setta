import subprocess

import setta.start as start


def test_delete_remote_session_uses_finite_timeout(monkeypatch) -> None:
    captured: dict[str, float | None] = {"timeout": None}

    def fake_run_remote_setta_command(*_args, timeout: float | None = 30.0, **_kwargs):
        captured["timeout"] = timeout
        return subprocess.CompletedProcess([], 0, stdout="", stderr="")

    monkeypatch.setattr(
        start.ssh_common, "run_remote_setta_command", fake_run_remote_setta_command
    )

    start._delete_remote_session(
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "setta",
        "",
        session_id="session-1",
    )

    assert captured["timeout"] is not None
