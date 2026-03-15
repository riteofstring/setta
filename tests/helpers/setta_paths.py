from pathlib import Path

from setta.utils.paths import get_setta_paths
from setta.utils.profile_config import clear_setta_profile_config_cache
from setta.utils.user_config import clear_setta_user_config_cache


def clear_setta_paths_cache() -> None:
    get_setta_paths.cache_clear()
    clear_setta_user_config_cache()
    clear_setta_profile_config_cache()


def normalize_workspace_path(
    path: Path | str, workspace_root: Path | None = None
) -> Path:
    root = workspace_root or get_setta_paths().workspace_root
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate.expanduser().resolve(strict=False)
    return (root / candidate).resolve(strict=False)


def validate_workspace_root(path: Path) -> None:
    if not path.exists():
        raise ValueError(f"Workspace root does not exist: {path}")
    if not path.is_dir():
        raise ValueError(f"Workspace root is not a directory: {path}")
