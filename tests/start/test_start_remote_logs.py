from pathlib import Path

import setta.start as start


def test_start_remote_setta_threads_files_root_args(monkeypatch) -> None:
    captured: dict[str, str | None] = {"files_root": None, "files_root_base": None}

    def fake_start_remote_setta(*_args, **kwargs) -> None:
        captured["files_root"] = kwargs.get("files_root")
        captured["files_root_base"] = kwargs.get("files_root_base")

    monkeypatch.setattr(start.ssh_common, "start_remote_setta", fake_start_remote_setta)

    timed_out = start._start_remote_setta(
        "user@host",
        [],
        "bash",
        "/tmp/work",
        "setta",
        "",
        files_root=Path("/tmp/state"),
        files_root_base=Path("/tmp/base"),
    )

    assert timed_out is False
    assert captured["files_root"] == "/tmp/state"
    assert captured["files_root_base"] == "/tmp/base"
