import logging
import shutil
from datetime import datetime
from pathlib import Path

from setta.utils.constants import C
from setta.utils.timestamps import (
    filename_to_datetime,
    get_now_timestamp,
    timestamp_to_filename,
)
from setta.utils.utils import normalize_path

logger = logging.getLogger(__name__)

_BACKUP_FILE_GLOB = "backup_*.db"


def get_backup_files(backup_dir: Path) -> list[Path]:
    """Get a list of existing backup files, sorted by filename (which contains the timestamp)."""
    return sorted(
        [f for f in backup_dir.glob(_BACKUP_FILE_GLOB)],
        key=lambda x: x.name,
        reverse=True,
    )


def backup_filename_to_datetime(path: Path) -> datetime:
    """Parse a backup timestamp from the filename.

    Filenames are expected to include the UTC timestamp as the last 3 underscore
    delimited tokens, e.g. `backup_20260101_120000_123456.db`.
    """

    timestamp_str = "_".join(path.stem.split("_")[-3:])
    return filename_to_datetime(timestamp_str)


def get_last_backup_time(backup_dir: Path) -> datetime | None:
    """
    Get the timestamp of the last backup from the most recent backup filename.
    Returns None if no backups exist.
    """
    backup_files = get_backup_files(backup_dir)
    if not backup_files:
        return None

    latest_backup = backup_files[0]
    return backup_filename_to_datetime(latest_backup)


def cleanup_old_backups(autobackupKeepLastN: int, backup_dir: Path):
    backup_files = get_backup_files(backup_dir)
    for old_backup in backup_files[autobackupKeepLastN:]:
        old_backup.unlink()


def create_backup(db_path: Path, autobackupKeepLastN: int, backup_dir: Path):
    """Create a new backup of the database."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = get_now_timestamp()
    backup_filename = f"backup_{timestamp_to_filename(timestamp)}.db"
    backup_path = backup_dir / backup_filename
    logger.debug("creating backup: %s", backup_path)

    shutil.copy2(db_path, backup_path)
    cleanup_old_backups(autobackupKeepLastN, backup_dir)


def create_restore_stash(db_path: Path, backup_dir: Path) -> Path:
    """Create a stash copy before overwriting `db_path` during restore.

    This uses a distinct prefix so autobackup cleanup never deletes restore
    stashes (cleanup only considers `backup_*.db`).
    """

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = get_now_timestamp()
    stash_filename = f"restore_stash_{timestamp_to_filename(timestamp)}.db"
    stash_path = backup_dir / stash_filename
    logger.debug("creating restore stash: %s", stash_path)
    shutil.copy2(db_path, stash_path)
    return stash_path


def should_create_backup(
    autobackup: bool, autobackupFreq: int, backup_dir: Path
) -> bool:
    """Check if it's time to create a new backup."""
    if not autobackup:
        return False
    last_backup_time = get_last_backup_time(backup_dir)
    logger.debug("last_backup_time: %s", last_backup_time)
    if last_backup_time is None:
        return True

    current_time = get_now_timestamp()
    time_since_last_backup = current_time - last_backup_time
    return time_since_last_backup.total_seconds() >= autobackupFreq


def maybe_create_backup(
    db_path: Path, autobackup: bool, autobackupFreq: int, autobackupKeepLastN: int
):
    backup_dir = normalize_path(C.DB_BACKUP_FOLDER)
    if should_create_backup(autobackup, autobackupFreq, backup_dir):
        create_backup(db_path, autobackupKeepLastN, backup_dir)
