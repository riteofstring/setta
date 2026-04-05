from pathlib import Path

import pytest

from setta.database.backup import get_backup_files, maybe_create_backup
from setta.utils.constants import C


def test_get_backup_files_filters_and_sorts(tmp_path: Path) -> None:
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    valid_old = backup_dir / "backup_20260101_000000_000001.json"
    valid_new = backup_dir / "backup_20260101_000000_000002.json"
    invalid = backup_dir / "backup_latest.json"
    invalid_missing_token = backup_dir / "backup_20260101_000000.json"

    valid_old.write_text("OLD", encoding="utf-8")
    valid_new.write_text("NEW", encoding="utf-8")
    invalid.write_text("INVALID", encoding="utf-8")
    invalid_missing_token.write_text("INVALID2", encoding="utf-8")

    backups = get_backup_files(backup_dir)
    assert backups == [valid_new, valid_old]


def test_maybe_create_backup_noop_when_project_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(C, "DB_BACKUP_FOLDER", backup_dir)

    project_path = tmp_path / "project.json"
    assert project_path.exists() is False

    maybe_create_backup(
        project_path,
        autobackup=True,
        autobackupFreq=0,
        autobackupKeepLastN=10,
    )

    assert get_backup_files(backup_dir) == []


def test_maybe_create_backup_creates_backup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(C, "DB_BACKUP_FOLDER", backup_dir)

    project_path = tmp_path / "project.json"
    project_path.write_text("PAYLOAD", encoding="utf-8")

    maybe_create_backup(
        project_path,
        autobackup=True,
        autobackupFreq=0,
        autobackupKeepLastN=10,
    )

    backups = get_backup_files(backup_dir)
    assert len(backups) == 1
    assert backups[0].read_text(encoding="utf-8") == "PAYLOAD"

