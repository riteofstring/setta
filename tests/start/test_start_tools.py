from click.testing import CliRunner

from setta.start import tools


def test_tools_dispatches_to_go(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def _fake_run_go_dispatch(argv: list[str]) -> int:
        captured["argv"] = argv
        return 0

    monkeypatch.setattr("setta.start.run_go_dispatch", _fake_run_go_dispatch)
    runner = CliRunner()

    result = runner.invoke(tools, [])

    assert result.exit_code == 0, result.output
    assert captured["argv"] == ["tools"]


def test_tools_propagates_go_exit_code(monkeypatch) -> None:
    monkeypatch.setattr("setta.start.run_go_dispatch", lambda argv: 7)
    runner = CliRunner()

    result = runner.invoke(tools, [])

    assert result.exit_code == 7, result.output
