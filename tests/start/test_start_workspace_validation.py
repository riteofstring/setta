from pathlib import Path

from click.testing import CliRunner

from setta.start import cli


def test_start_rejects_invalid_workspace_without_traceback(tmp_path: Path) -> None:
    missing = tmp_path / "missing-workspace"

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["--workspace", str(missing), "--no-open"],
    )

    assert result.exit_code != 0
    assert "Workspace root does not exist" in result.output
    assert "Traceback" not in result.output

