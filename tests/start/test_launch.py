import json
from pathlib import Path

from click.testing import CliRunner

from setta.sessions.registry import SessionRegistry
from setta.start import launch


def test_launch_reports_invalid_workspace(tmp_path: Path) -> None:
    runner = CliRunner()
    result = runner.invoke(
        launch,
        ["--json", "--workspace", str(tmp_path / "missing")],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidWorkspace"


def test_launch_reports_invalid_files_root(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    files_root = tmp_path / "not-a-dir.txt"
    files_root.write_text("nope", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--files-root",
            str(files_root),
        ],
    )

    assert result.exit_code != 0
    payload = json.loads(result.output)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "InvalidFilesRoot"


def test_launch_reuses_existing_session(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_files_root = tmp_path / "setta_files"
    sessions_root = setta_files_root / "runtime" / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)

    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=workspace,
        host="127.0.0.1",
        port=61234,
        pid=12345,
    )

    runner = CliRunner()
    result = runner.invoke(
        launch,
        [
            "--json",
            "--workspace",
            str(workspace),
            "--files-root",
            str(setta_files_root),
        ],
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["startedNew"] is False
    assert payload["sessionId"] == session.id
    assert payload["workspaceRoot"] == str(workspace.resolve())
    assert payload["filesRoot"] == str(setta_files_root.resolve())
    assert payload["session"]["workspacePathCanonical"] == str(workspace.resolve())
