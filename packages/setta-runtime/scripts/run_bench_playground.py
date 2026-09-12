from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_ROOT = ROOT / "apps" / "bench" / "examples" / "product-thumbnails"
FIXTURE_ROOT = EXAMPLE_ROOT / "fixture"
CANDIDATE_SOURCE = EXAMPLE_ROOT / "candidate" / "main.go"
WORKSPACE_ROOT = ROOT / "tmp" / "bench-playground" / "product-thumbnails"
PROJECT_SOURCE = Path("project.json")
PROJECT_DESTINATION = Path(".local/bench/project.json")
REQUIRED_FIXTURE_FILES = (
    PROJECT_SOURCE,
    Path("cases.jsonl"),
    *(Path(f"inputs/product-{index:02d}.png") for index in range(1, 11)),
)
REQUIRED_WORKSPACE_FILES = (
    PROJECT_DESTINATION,
    Path("cases.jsonl"),
    *(Path(f"inputs/product-{index:02d}.png") for index in range(1, 11)),
)


class PlaygroundError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    supplied = tuple(sys.argv[1:] if arguments is None else arguments)
    if supplied:
        sys.stderr.write("Usage: run_bench_playground.py\n")
        return 2
    try:
        workspace = prepare_workspace()
        executable = build_candidate(workspace)
    except PlaygroundError as error:
        sys.stderr.write(f"run_bench_playground: {error}\n")
        return 1
    return open_workspace(workspace, executable.parent)


def prepare_workspace() -> Path:
    if _entry_exists(WORKSPACE_ROOT):
        _validate_project(WORKSPACE_ROOT, "playground workspace")
        return WORKSPACE_ROOT
    _validate_fixture()
    try:
        WORKSPACE_ROOT.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".product-thumbnails-", dir=WORKSPACE_ROOT.parent
        ) as temporary_directory:
            staging = Path(temporary_directory)
            shutil.copytree(FIXTURE_ROOT, staging, symlinks=True, dirs_exist_ok=True)
            destination = staging / PROJECT_DESTINATION
            destination.parent.mkdir(parents=True, exist_ok=True)
            (staging / PROJECT_SOURCE).replace(destination)
            _validate_project(staging, "staged playground fixture")
            if _entry_exists(WORKSPACE_ROOT):
                _validate_project(WORKSPACE_ROOT, "playground workspace")
                return WORKSPACE_ROOT
            staging.rename(WORKSPACE_ROOT)
    except OSError as error:
        raise PlaygroundError(f"cannot seed workspace: {error}") from error
    _validate_project(WORKSPACE_ROOT, "playground workspace")
    return WORKSPACE_ROOT


def build_candidate(workspace: Path) -> Path:
    _require_regular_file(CANDIDATE_SOURCE, "candidate source")
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts import run_local_setta

    try:
        go = run_local_setta._pinned_go()
    except run_local_setta.LocalRunError as error:
        raise PlaygroundError(str(error)) from error
    binary_directory = workspace / ".local" / "bench" / "bin"
    executable = binary_directory / (
        "thumbnail-candidate.exe" if os.name == "nt" else "thumbnail-candidate"
    )
    try:
        binary_directory.mkdir(parents=True, exist_ok=True)
        environment = os.environ.copy()
        environment["GO111MODULE"] = "off"
        subprocess.run(
            [
                str(go),
                "build",
                "-trimpath",
                "-buildvcs=false",
                "-o",
                str(executable),
                str(CANDIDATE_SOURCE),
            ],
            cwd=ROOT,
            check=True,
            env=environment,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise PlaygroundError("cannot build the thumbnail candidate") from error
    _require_regular_file(executable, "candidate executable")
    return executable


def open_workspace(workspace: Path, binary_directory: Path) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts import run_local_setta

    previous_path = os.environ.get("PATH")
    entries = [str(binary_directory)]
    if previous_path:
        entries.append(previous_path)
    os.environ["PATH"] = os.pathsep.join(entries)
    try:
        return run_local_setta.main(["bench", "open", "--project-root", str(workspace)])
    finally:
        if previous_path is None:
            os.environ.pop("PATH", None)
        else:
            os.environ["PATH"] = previous_path


def _validate_fixture() -> None:
    _require_directory(FIXTURE_ROOT, "playground fixture")
    for relative in REQUIRED_FIXTURE_FILES:
        _require_tree_file(FIXTURE_ROOT, relative, "playground fixture")
    _require_regular_file(CANDIDATE_SOURCE, "candidate source")


def _validate_project(root: Path, label: str) -> None:
    _require_directory(root, label)
    for relative in REQUIRED_WORKSPACE_FILES:
        _require_tree_file(root, relative, label)


def _require_tree_file(root: Path, relative: Path, label: str) -> None:
    current = root
    for part in relative.parts[:-1]:
        current /= part
        _require_directory(current, f"{label} directory {relative.parent}")
    _require_regular_file(root / relative, f"{label} file {relative}")


def _entry_exists(path: Path) -> bool:
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise PlaygroundError(f"cannot inspect {path}: {error}") from error
    return True


def _require_directory(path: Path, label: str) -> None:
    if not stat.S_ISDIR(_entry_mode(path, label)):
        raise PlaygroundError(f"{label} must be a non-symlink directory: {path}")


def _require_regular_file(path: Path, label: str) -> None:
    if not stat.S_ISREG(_entry_mode(path, label)):
        raise PlaygroundError(f"{label} must be a regular non-symlink file: {path}")


def _entry_mode(path: Path, label: str) -> int:
    try:
        return path.lstat().st_mode
    except OSError as error:
        raise PlaygroundError(f"{label} is unavailable: {path}: {error}") from error


if __name__ == "__main__":
    raise SystemExit(main())
