from __future__ import annotations

import os
import shutil
import stat
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = (
    ROOT / "apps" / "experiment-lens" / "examples" / "battery-playground" / "fixture"
)
WORKSPACE_ROOT = ROOT / "tmp" / "experiment-lens-playground" / "experiment-project"
REQUIRED_FILES = (
    Path("experiment.json"),
    Path("data/observations.json"),
)
REQUIRED_ARTIFACT_PATTERNS = (
    "artifacts/series/*.json",
    "artifacts/thermal/*.svg",
)


class PlaygroundError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    supplied = tuple(sys.argv[1:] if arguments is None else arguments)
    if supplied not in ((), ("--no-open",)):
        sys.stderr.write("Usage: run_experiment_lens_playground.py [--no-open]\n")
        return 2
    try:
        workspace = prepare_workspace()
    except PlaygroundError as error:
        sys.stderr.write(f"run_experiment_lens_playground: {error}\n")
        return 1
    return _open_workspace(workspace, no_open=supplied == ("--no-open",))


def prepare_workspace() -> Path:
    if _entry_exists(WORKSPACE_ROOT):
        _validate_project(WORKSPACE_ROOT, "playground workspace")
        return WORKSPACE_ROOT
    _validate_fixture(FIXTURE_ROOT)
    try:
        WORKSPACE_ROOT.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".experiment-project-", dir=WORKSPACE_ROOT.parent
        ) as temporary_directory:
            staging = Path(temporary_directory)
            shutil.copytree(FIXTURE_ROOT, staging, symlinks=True, dirs_exist_ok=True)
            _validate_project(staging, "staged playground project")
            if _entry_exists(WORKSPACE_ROOT):
                _validate_project(WORKSPACE_ROOT, "playground workspace")
                return WORKSPACE_ROOT
            staging.rename(WORKSPACE_ROOT)
    except PlaygroundError:
        raise
    except OSError as error:
        raise PlaygroundError(f"cannot seed workspace: {error}") from error
    _validate_project(WORKSPACE_ROOT, "playground workspace")
    return WORKSPACE_ROOT


def _open_workspace(workspace: Path, *, no_open: bool = False) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts import run_local_setta

    arguments = ["experiment-lens", "open", "--project-root", str(workspace)]
    if no_open:
        arguments.append("--no-open")
    return run_local_setta.main(arguments)


def _validate_fixture(root: Path) -> None:
    _validate_project(root, "playground fixture")
    if _entry_exists(root / ".local"):
        raise PlaygroundError("playground fixture must not contain mutable local state")


def _validate_project(root: Path, label: str) -> None:
    _require_directory(root, label)
    for relative in REQUIRED_FILES:
        _require_regular_file(root / relative, f"{label} file {relative}")
    try:
        for directory, directory_names, file_names in os.walk(
            root, topdown=True, followlinks=False
        ):
            directory_path = Path(directory)
            for name in directory_names:
                _require_directory(directory_path / name, f"{label} directory")
            for name in file_names:
                _require_regular_file(directory_path / name, f"{label} file")
        for pattern in REQUIRED_ARTIFACT_PATTERNS:
            matches = tuple(root.glob(pattern))
            if not matches:
                raise PlaygroundError(
                    f"{label} must contain an artifact matching {pattern}"
                )
    except PlaygroundError:
        raise
    except OSError as error:
        raise PlaygroundError(f"cannot inspect {label}: {error}") from error


def _entry_exists(path: Path) -> bool:
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise PlaygroundError(f"cannot inspect {path}: {error}") from error
    return True


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
