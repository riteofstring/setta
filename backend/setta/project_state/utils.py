from datetime import datetime
from pathlib import Path


def create_timestamped_folder(base_dir: Path, prefix=""):
    # Format the current timestamp with subsecond precision
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"_{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = base_dir / folder_name
    folder_path.mkdir(parents=True, exist_ok=True)
    return folder_path


def convert_path_to_module_path(path: Path):
    path_without_extension = path.with_suffix("")
    return path_without_extension.as_posix().replace("/", ".").replace("\\", ".")
