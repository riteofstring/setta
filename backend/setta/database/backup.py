import logging
import shutil
import time
from datetime import datetime
from pathlib import Path

from setta.utils.constants import DB_BACKUP_FOLDER

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


def get_last_backup_time() -> float | None:
    """
    Get the timestamp of the last backup from the most recent backup filename.
    Returns None if no backups exist.
    """
    backup_files = get_backup_files()
    if not backup_files:
        return None

    latest_backup = backup_files[0]
    timestamp_str = "_".join(latest_backup.stem.split("_")[-2:])

    # Convert the timestamp string to a datetime object
    backup_datetime = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")

    # Convert the datetime to a Unix timestamp (seconds since epoch)
    return backup_datetime.timestamp()


def cleanup_old_backups(autobackupKeepLastN: int):
    backup_files = get_backup_files()
    for old_backup in backup_files[autobackupKeepLastN:]:
        old_backup.unlink()


def create_backup(db_path: Path, autobackupKeepLastN: int):
    """Create a new backup of the database."""
    ensure_backup_dir_exists()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"backup_{timestamp}.db"
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

    current_time = time.time()
    time_since_last_backup = current_time - last_backup_time
    return time_since_last_backup >= autobackupFreq


def maybe_create_backup(
    db_path: Path, autobackup: bool, autobackupFreq: int, autobackupKeepLastN: int
):
    if should_create_backup(autobackup, autobackupFreq):
        create_backup(
            db_path,
            autobackupKeepLastN,
        )
