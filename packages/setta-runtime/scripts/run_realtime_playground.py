from __future__ import annotations

import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = ROOT / "apps" / "realtime" / "examples" / "neon-sketch" / "fixture"
WORKSPACE_ROOT = ROOT / "tmp" / "realtime-playground" / "neon-sketch"
REQUIRED_FILES = (
    Path(".local/realtime/project.json"),
    Path("app.py"),
    Path("pyproject.toml"),
    Path("uv.lock"),
    Path("uv.toml"),
)


class PlaygroundError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    supplied = tuple(sys.argv[1:] if arguments is None else arguments)
    if supplied:
        sys.stderr.write("Usage: run_realtime_playground.py\n")
        return 2
    try:
        workspace = prepare_workspace()
        _sync_environment(workspace)
    except PlaygroundError as error:
        sys.stderr.write(f"run_realtime_playground: {error}\n")
        return 1
    return _open_workspace(workspace)


def prepare_workspace() -> Path:
    if _entry_exists(WORKSPACE_ROOT):
        _validate_project(WORKSPACE_ROOT, "playground workspace")
        return WORKSPACE_ROOT
    _validate_project(FIXTURE_ROOT, "playground fixture")
    try:
        WORKSPACE_ROOT.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".neon-sketch-", dir=WORKSPACE_ROOT.parent
        ) as temporary_directory:
            staging = Path(temporary_directory)
            shutil.copytree(FIXTURE_ROOT, staging, symlinks=True, dirs_exist_ok=True)
            _validate_project(staging, "staged playground fixture")
            if _entry_exists(WORKSPACE_ROOT):
                _validate_project(WORKSPACE_ROOT, "playground workspace")
                return WORKSPACE_ROOT
            staging.rename(WORKSPACE_ROOT)
    except OSError as error:
        raise PlaygroundError(f"cannot seed workspace: {error}") from error
    _validate_project(WORKSPACE_ROOT, "playground workspace")
    return WORKSPACE_ROOT


def _entry_exists(path: Path) -> bool:
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise PlaygroundError(f"cannot inspect {path}: {error}") from error
    return True


def _open_workspace(workspace: Path) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts import run_local_setta

    return run_local_setta.main(["realtime", "open", "--project-root", str(workspace)])


def _sync_environment(workspace: Path) -> None:
    uv = shutil.which("uv")
    if uv is None:
        raise PlaygroundError("uv is required")
    try:
        subprocess.run(
            [
                uv,
                "sync",
                "--frozen",
                "--no-build",
                "--no-install-project",
                "--project",
                str(workspace),
            ],
            cwd=workspace,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise PlaygroundError(f"cannot sync project environment: {error}") from error


def _validate_project(root: Path, label: str) -> None:
    _require_directory(root, label)
    for relative in REQUIRED_FILES:
        current = root
        for part in relative.parts[:-1]:
            current /= part
            _require_directory(current, f"{label} directory {relative.parent}")
        _require_regular_file(root / relative, f"{label} file {relative}")


def _require_directory(path: Path, label: str) -> None:
    mode = _entry_mode(path, label)
    if not stat.S_ISDIR(mode):
        raise PlaygroundError(f"{label} must be a non-symlink directory: {path}")


def _require_regular_file(path: Path, label: str) -> None:
    mode = _entry_mode(path, label)
    if not stat.S_ISREG(mode):
        raise PlaygroundError(f"{label} must be a regular non-symlink file: {path}")


def _entry_mode(path: Path, label: str) -> int:
    try:
        return path.lstat().st_mode
    except OSError as error:
        raise PlaygroundError(f"{label} is unavailable: {path}: {error}") from error


if __name__ == "__main__":
    raise SystemExit(main())
