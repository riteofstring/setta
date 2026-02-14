import sys
from pathlib import Path
from types import SimpleNamespace

from click.testing import CliRunner

from setta.start import cli


def test_cli_keyboard_interrupt_exits_cleanly(
    tmp_path: Path, monkeypatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    class FakeConfig:
        def __init__(self, *args, **kwargs) -> None:
            self.args = args
            self.kwargs = kwargs

    class FakeServer:
        def __init__(self, config: FakeConfig) -> None:
            self.config = config

        def run(self) -> None:
            raise KeyboardInterrupt()

    monkeypatch.setitem(
        sys.modules,
        "uvicorn",
        SimpleNamespace(Config=FakeConfig, Server=FakeServer),
    )

    runner = CliRunner()
    result = runner.invoke(cli, ["--workspace", str(workspace), "--no-open"])

    # Ctrl+C during server execution should be a clean shutdown, not a click abort.
    assert result.exit_code == 0
    assert "Aborted!" not in result.output
