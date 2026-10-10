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
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(runtime_root), str(runtime_root / "src")]
    from scripts import playground_options, playground_server

    options = playground_options.parse_options("realtime", WORKSPACE_ROOT, arguments)
    if isinstance(options, int):
        return options
    return playground_server.run("realtime", options, _prepare_launch)


def _prepare_launch(workspace: Path) -> Path:
    workspace = prepare_workspace(workspace)
    _sync_environment(workspace)
    return workspace


def prepare_workspace(workspace: Path | None = None) -> Path:
    workspace = WORKSPACE_ROOT if workspace is None else workspace
    if workspace.resolve().is_relative_to(FIXTURE_ROOT.resolve()):
        raise PlaygroundError(
            "choose a working directory outside the checked-in fixture"
        )
    if _entry_exists(workspace):
        _validate_project(workspace, "playground workspace")
        return workspace
    _validate_project(FIXTURE_ROOT, "playground fixture")
    try:
        workspace.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".neon-sketch-", dir=workspace.parent
        ) as temporary_directory:
            staging = Path(temporary_directory)
            shutil.copytree(FIXTURE_ROOT, staging, symlinks=True, dirs_exist_ok=True)
            _validate_project(staging, "staged playground fixture")
            if _entry_exists(workspace):
                _validate_project(workspace, "playground workspace")
                return workspace
            staging.rename(workspace)
    except OSError as error:
        raise PlaygroundError(f"cannot seed workspace: {error}") from error
    _validate_project(workspace, "playground workspace")
    return workspace


def _entry_exists(path: Path) -> bool:
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise PlaygroundError(f"cannot inspect {path}: {error}") from error
    return True


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
