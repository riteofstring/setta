import json
import subprocess
import sys
from pathlib import Path

from click.testing import CliRunner
import pytest

from setta.sessions import SessionRegistry
from setta.start import backups
from setta.types.settings_state import SettingsBackend
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths


def _patch_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> tuple[Path, Path]:
    setta_root = tmp_path / "setta_files"
    backup_dir = setta_root / "backups"
    sessions_root = tmp_path / "sessions"
    setta_root.mkdir(parents=True, exist_ok=True)
    backup_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(C, "SETTA_FILES_FOLDER", setta_root)
    monkeypatch.setattr(C, "DB_BACKUP_FOLDER", backup_dir)
    monkeypatch.setattr(C, "RUNTIME_SESSIONS_FOLDER", sessions_root)

    return setta_root, backup_dir


def test_settings_backend_autobackup_default_true() -> None:
    assert SettingsBackend().autobackup is True


def test_backups_list_json_sorted(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _, backup_dir = _patch_paths(monkeypatch, tmp_path)
    p0 = backup_dir / "backup_20251231_235959_999999.json"
    p1 = backup_dir / "backup_20260101_000000_000001.json"
    p2 = backup_dir / "backup_20260101_000000_000002.json"
    p0.write_text("0", encoding="utf-8")
    p2.write_text("2", encoding="utf-8")
    p1.write_text("1", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(backups, ["list", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert [entry["path"] for entry in payload] == [str(p2), str(p1), str(p0)]
    assert [entry["index"] for entry in payload] == [1, 2, 3]


def test_backups_list_json_skips_invalid_filenames(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, backup_dir = _patch_paths(monkeypatch, tmp_path)
    valid = backup_dir / "backup_20260101_000000_000000.json"
    invalid = backup_dir / "backup_latest.json"
    valid.write_text("VALID", encoding="utf-8")
    invalid.write_text("INVALID", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(backups, ["list", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert [entry["path"] for entry in payload] == [str(valid)]
    assert [entry["index"] for entry in payload] == [1]


def test_backups_restore_latest_overwrites_project_and_stashes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    setta_root, backup_dir = _patch_paths(monkeypatch, tmp_path)
    project_path = setta_root / "project.json"
    project_path.write_text("OLD", encoding="utf-8")

    backup_path = backup_dir / "backup_20260101_000000_000000.json"
    backup_path.write_text("NEW", encoding="utf-8")

    runner = CliRunner()
    result = runner.invoke(backups, ["restore", "--latest", "--yes"])

    assert result.exit_code == 0, result.output
    assert project_path.read_text(encoding="utf-8") == "NEW"
    stashes = sorted(backup_dir.glob("restore_stash_*.json"))
    assert len(stashes) == 1
    assert stashes[0].read_text(encoding="utf-8") == "OLD"

    backups_result = runner.invoke(backups, ["list", "--json"])
    assert backups_result.exit_code == 0, backups_result.output
    backups_payload = json.loads(backups_result.output)
    assert [entry["path"] for entry in backups_payload] == [str(backup_path)]


def test_backups_restore_refuses_when_session_running_unless_forced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    setta_root, backup_dir = _patch_paths(monkeypatch, tmp_path)
    project_path = setta_root / "project.json"
    project_path.write_text("OLD", encoding="utf-8")

    backup_path = backup_dir / "backup_20260101_000000_000000.json"
    backup_path.write_text("NEW", encoding="utf-8")

    process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            "setta.server:app",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    registry = SessionRegistry(sessions_root=C.RUNTIME_SESSIONS_FOLDER)
    session = registry.create_session(
        workspace_path=get_setta_paths().workspace_root,
        host="127.0.0.1",
        port=61234,
        pid=process.pid,
    )
    try:
        runner = CliRunner()
        result = runner.invoke(backups, ["restore", "--latest", "--yes"])
        assert result.exit_code != 0
        assert "Refusing to restore" in result.output

        forced = runner.invoke(backups, ["restore", "--latest", "--yes", "--force"])
        assert forced.exit_code == 0, forced.output
        assert project_path.read_text(encoding="utf-8") == "NEW"
    finally:
        registry.delete_session(session.id)
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
