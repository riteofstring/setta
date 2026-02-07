from pathlib import Path

from setta.utils.timestamps import get_now_timestamp, timestamp_to_filename
from setta.utils.utils import normalize_path


def create_timestamped_folder(base_dir: Path, prefix=""):
    # Format the current timestamp with subsecond precision
    timestamp = timestamp_to_filename(get_now_timestamp())
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"_{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = normalize_path(base_dir) / folder_name
    folder_path.mkdir(parents=True, exist_ok=True)
    return folder_path


def convert_path_to_module_path(path: Path):
    path_without_extension = path.with_suffix("")
    return path_without_extension.as_posix().replace("/", ".").replace("\\", ".")
