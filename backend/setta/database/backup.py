import logging
import shutil
from datetime import datetime
from pathlib import Path

from setta.utils.constants import DB_BACKUP_FOLDER
from setta.utils.timestamps import (
    filename_to_datetime,
    get_now_timestamp,
    timestamp_to_filename,
)

logger = logging.getLogger(__name__)


def ensure_backup_dir_exists():
    """Create the backup directory if it doesn't exist."""
    Path(DB_BACKUP_FOLDER).mkdir(parents=True, exist_ok=True)


def get_backup_files() -> list[Path]:
    """Get a list of existing backup files, sorted by filename (which contains the timestamp)."""
    backup_dir = Path(DB_BACKUP_FOLDER)
    return sorted(
        [f for f in backup_dir.glob("backup_*.db")], key=lambda x: x.name, reverse=True
    )


def get_last_backup_time() -> datetime | None:
    """
    Get the timestamp of the last backup from the most recent backup filename.
    Returns None if no backups exist.
    """
    backup_files = get_backup_files()
    if not backup_files:
        return None

    latest_backup = backup_files[0]
    timestamp_str = "_".join(latest_backup.stem.split("_")[-3:])
    return filename_to_datetime(timestamp_str)


def cleanup_old_backups(autobackupKeepLastN: int):
    backup_files = get_backup_files()
    for old_backup in backup_files[autobackupKeepLastN:]:
        old_backup.unlink()


def create_backup(db_path: Path, autobackupKeepLastN: int):
    """Create a new backup of the database."""
    ensure_backup_dir_exists()
    timestamp = get_now_timestamp()
    backup_filename = f"backup_{timestamp_to_filename(timestamp)}.db"
    backup_path = DB_BACKUP_FOLDER / backup_filename
    logger.debug(f"creating backup: {backup_path}")

    shutil.copy2(db_path, backup_path)
    cleanup_old_backups(autobackupKeepLastN)


def should_create_backup(autobackup: bool, autobackupFreq: int) -> bool:
    """Check if it's time to create a new backup."""
    if not autobackup:
        return False
    last_backup_time = get_last_backup_time()
    logger.debug(f"last_backup_time: {last_backup_time}")
    if last_backup_time is None:
        return True

    current_time = get_now_timestamp()
    time_since_last_backup = current_time - last_backup_time
    return time_since_last_backup.total_seconds() >= autobackupFreq


def maybe_create_backup(
    db_path: Path, autobackup: bool, autobackupFreq: int, autobackupKeepLastN: int
):
    if should_create_backup(autobackup, autobackupFreq):
        create_backup(
            db_path,
            autobackupKeepLastN,
        )
