import os
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI

from .db_path import get_default_db_path

app = FastAPI()

# Configuration
DB_PATH = get_default_db_path()
BACKUP_DIR = ".setta_backups"
BACKUP_INTERVAL_SECONDS = 60
MAX_BACKUPS = 5


def ensure_backup_dir_exists():
    """Create the backup directory if it doesn't exist."""
    Path(BACKUP_DIR).mkdir(parents=True, exist_ok=True)


def get_backup_files() -> List[Path]:
    """Get a list of existing backup files, sorted by filename (which contains the timestamp)."""
    backup_dir = Path(BACKUP_DIR)
    return sorted(
        [f for f in backup_dir.glob("backup_*.db")], key=lambda x: x.name, reverse=True
    )


def get_last_backup_time() -> Optional[float]:
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


def cleanup_old_backups():
    """Remove old backups, keeping only the most recent MAX_BACKUPS."""
    backup_files = get_backup_files()
    for old_backup in backup_files[MAX_BACKUPS:]:
        old_backup.unlink()


def create_backup():
    """Create a new backup of the database."""
    ensure_backup_dir_exists()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    print("creating backup", backup_path)

    shutil.copy2(DB_PATH, backup_path)
    cleanup_old_backups()


def should_create_backup() -> bool:
    """Check if it's time to create a new backup."""
    last_backup_time = get_last_backup_time()
    print("last_backup_time", last_backup_time)
    if last_backup_time is None:
        return True

    current_time = time.time()
    print("current_time", current_time)
    time_since_last_backup = current_time - last_backup_time
    return time_since_last_backup >= BACKUP_INTERVAL_SECONDS


def maybe_create_backup():
    if should_create_backup():
        create_backup()
