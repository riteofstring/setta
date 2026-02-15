import subprocess
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


class DevWorktreeOption(BaseModel):
    name: str
    path: str
    isActive: bool


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


def _parse_git_worktree_list_porcelain(
    raw: str, *, active_path: Path
) -> list[DevWorktreeOption]:
    options: list[DevWorktreeOption] = []
    active_resolved = active_path.resolve(strict=False)
    for line in raw.splitlines():
        if not line.startswith("worktree "):
            continue
        maybe_path = line[len("worktree ") :].strip()
        if not maybe_path:
            continue
        path = Path(maybe_path).resolve(strict=False)
        options.append(
            DevWorktreeOption(
                name=derive_dev_worktree_name(path),
                path=str(path),
                isActive=path == active_resolved,
            )
        )
    options.sort(key=lambda option: (0 if option.isActive else 1, option.name.lower()))
    return options


@lru_cache(maxsize=1)
def get_repo_root_dir() -> Path | None:
    # Prefer resolving from the source tree (works even if cwd is elsewhere, e.g. tests).
    candidates = [Path(__file__).resolve().parent, Path.cwd()]
    for candidate in candidates:
        git_root = _try_get_git_toplevel(candidate)
        if git_root is not None:
            return git_root
    return None


def list_dev_worktree_options() -> list[DevWorktreeOption]:
    repo_root = get_repo_root_dir()
    if repo_root is None:
        return []
    try:
        raw = subprocess.check_output(
            ["git", "-C", str(repo_root), "worktree", "list", "--porcelain"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        resolved = repo_root.resolve(strict=False)
        return [
            DevWorktreeOption(
                name=derive_dev_worktree_name(resolved),
                path=str(resolved),
                isActive=True,
            )
        ]
    options = _parse_git_worktree_list_porcelain(raw, active_path=repo_root)
    if options:
        return options
    resolved = repo_root.resolve(strict=False)
    return [
        DevWorktreeOption(
            name=derive_dev_worktree_name(resolved),
            path=str(resolved),
            isActive=True,
        )
    ]
