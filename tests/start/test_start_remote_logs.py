from pathlib import Path

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
