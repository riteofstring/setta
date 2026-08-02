from pathlib import Path

from setta.utils.paths import get_setta_paths


def clear_setta_paths_cache() -> None:
    get_setta_paths.cache_clear()


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
