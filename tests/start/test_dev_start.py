import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from setta.dev_start import main
from setta.utils.paths import clear_setta_paths_cache


def test_dev_start_main_runs_reload_backend_and_prints_startup_message(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_home = tmp_path / ".setta-development"
    captured: dict[str, object] = {}

    class RecordingConfig:
        def __init__(self, app: str, **kwargs: object) -> None:
            captured["app"] = app
            captured["kwargs"] = kwargs

    class RecordingServer:
        def __init__(self, config: RecordingConfig) -> None:
            self.config = config

        def run(self) -> None:
            return

    monkeypatch.setitem(
        sys.modules,
        "uvicorn",
        SimpleNamespace(Config=RecordingConfig, Server=RecordingServer),
    )

    env_keys = (
        "SETTA_WORKSPACE_ROOT",
        "SETTA_HOME",
        "SETTA_PROFILE_LOOKUP_HOME",
        "SETTA_FILES_ROOT",
        "SETTA_FILES_LOCATION",
        "SETTA_RUNTIME_ROOT",
        "SETTA_PROFILE",
        "SETTA_AUTH_COOKIE_NAME",
        "SETTA_SESSION_ID",
        "SETTA_SESSIONS_ROOT",
    )
    for key in env_keys:
        monkeypatch.delenv(key, raising=False)
    clear_setta_paths_cache()

    try:
        # The dev reload owner should preserve the current startup/session contract.
        exit_code = main(
            [
                "--reload",
                "--workspace",
                str(workspace),
                "--setta-home",
                str(setta_home),
                "--port",
                "61234",
                "--no-open",
            ]
        )
    finally:
        clear_setta_paths_cache()

    assert exit_code == 0
    output = capsys.readouterr().out
    assert "Setta running (session " in output
    assert "Bind: 127.0.0.1:61234 (remote only)" in output
    assert captured["app"] == "setta.server:app"
    kwargs = captured["kwargs"]
    assert isinstance(kwargs, dict)
    assert kwargs["reload"] is True
    assert kwargs["host"] == "127.0.0.1"
    assert kwargs["port"] == 61234


def test_dev_start_main_rejects_invalid_workspace_without_traceback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    missing_workspace = tmp_path / "missing-workspace"
    monkeypatch.delenv("SETTA_WORKSPACE_ROOT", raising=False)
    clear_setta_paths_cache()

    try:
        # Validation failures should stay user-facing and skip traceback noise.
        exit_code = main(
            [
                "--workspace",
                str(missing_workspace),
                "--setta-home",
                str(tmp_path / ".setta-development"),
                "--no-open",
            ]
        )
    finally:
        clear_setta_paths_cache()

    assert exit_code == 1
    error_output = capsys.readouterr().err
    assert "Workspace root does not exist" in error_output
    assert "Traceback" not in error_output


def test_dev_start_main_keyboard_interrupt_exits_cleanly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_home = tmp_path / ".setta-development"

    class InterruptingConfig:
        def __init__(self, app: str, **kwargs: object) -> None:
            self.app = app
            self.kwargs = kwargs

    class InterruptingServer:
        def __init__(self, config: InterruptingConfig) -> None:
            self.config = config

        def run(self) -> None:
            raise KeyboardInterrupt()

    monkeypatch.setitem(
        sys.modules,
        "uvicorn",
        SimpleNamespace(Config=InterruptingConfig, Server=InterruptingServer),
    )
    clear_setta_paths_cache()

    try:
        exit_code = main(
            [
                "--reload",
                "--workspace",
                str(workspace),
                "--setta-home",
                str(setta_home),
                "--port",
                "61234",
                "--no-open",
            ]
        )
    finally:
        clear_setta_paths_cache()

    # Ctrl+C should still be a clean stop for the dev reload owner.
    assert exit_code == 0
