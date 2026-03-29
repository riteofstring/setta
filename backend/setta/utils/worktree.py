import subprocess
from functools import lru_cache
from pathlib import Path


def _try_get_git_toplevel(dir_path: Path) -> Path | None:
    try:
        raw = subprocess.check_output(
            ["git", "-C", str(dir_path), "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        return None
    raw = raw.strip()
    if not raw:
        return None
    return Path(raw)


def derive_dev_worktree_name(path: Path) -> str:
    dirname = path.name
    if dirname == "setta":
        return "main"
    prefix = "setta."
    if dirname.startswith(prefix) and len(dirname) > len(prefix):
        return dirname[len(prefix) :]
    return dirname


@lru_cache(maxsize=1)
def get_repo_root_dir() -> Path | None:
    # Prefer resolving from the source tree (works even if cwd is elsewhere, e.g. tests).
    candidates = [Path(__file__).resolve().parent, Path.cwd()]
    for candidate in candidates:
        git_root = _try_get_git_toplevel(candidate)
        if git_root is not None:
            return git_root
    return None


def get_active_dev_worktree_name() -> str | None:
    repo_root = get_repo_root_dir()
    if repo_root is None:
        return None
    return derive_dev_worktree_name(repo_root.resolve(strict=False))
