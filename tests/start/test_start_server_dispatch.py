from pathlib import Path

from click.testing import CliRunner

from setta.start import cli


def test_cli_default_start_dispatches_to_go(tmp_path: Path, monkeypatch) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    captured: dict[str, object] = {}

    def fake_run_go_dispatch(argv: list[str]) -> int:
        captured["argv"] = list(argv)
        return 0

    monkeypatch.setattr("setta.start.run_go_dispatch", fake_run_go_dispatch)

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["--workspace", str(workspace), "--port", "61234", "--no-open"],
    )

    assert result.exit_code == 0, result.output
    assert captured["argv"] == [
        "--host",
        "127.0.0.1",
        "--port",
        "61234",
        "--workspace",
        str(workspace),
        "--no-open",
    ]


def test_cli_share_command_dispatches_to_go(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run_go_dispatch(argv: list[str]) -> int:
        captured["argv"] = list(argv)
        return 0

    monkeypatch.setattr("setta.start.run_go_dispatch", fake_run_go_dispatch)

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["--no-open", "share", "--deployment-name", "demo-share", "--latest"],
    )

    assert result.exit_code == 0, result.output
    assert captured["argv"] == [
        "--host",
        "127.0.0.1",
        "--no-open",
        "share",
        "--deployment-name",
        "demo-share",
        "--latest",
    ]


def test_cli_app_command_dispatches_to_go(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run_go_dispatch(argv: list[str]) -> int:
        captured["argv"] = list(argv)
        return 0

    monkeypatch.setattr("setta.start.run_go_dispatch", fake_run_go_dispatch)

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["--host", "0.0.0.0", "app", "--deployment-root", "/tmp/demo-app"],
    )

    assert result.exit_code == 0, result.output
    assert captured["argv"] == [
        "--host",
        "0.0.0.0",
        "app",
        "--deployment-root",
        "/tmp/demo-app",
    ]
