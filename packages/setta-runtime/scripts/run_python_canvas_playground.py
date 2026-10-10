from __future__ import annotations

import shutil
import stat
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = ROOT / "apps/python-canvas/examples/rocket-lab/fixture"
WORKSPACE_ROOT = ROOT / "tmp/python-canvas-playground/rocket-lab"
REQUIRED_FILES = ("project.json", "rocket_lab.py")


class PlaygroundError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts import playground_options, run_local_setta

    options = playground_options.parse_options(
        "python-canvas", WORKSPACE_ROOT, arguments
    )
    if isinstance(options, int):
        return options
    try:
        workspace = prepare_workspace(options.workspace)
    except PlaygroundError as error:
        playground_options.report_error("python-canvas", error)
        return 1
    playground_options.announce("python-canvas", workspace)
    forwarded = ["python-canvas", "open", "--project", str(workspace / "project.json")]
    if options.no_open:
        forwarded.append("--no-open")
    return run_local_setta.main(forwarded)


def prepare_workspace(workspace: Path | None = None) -> Path:
    workspace = WORKSPACE_ROOT if workspace is None else workspace
    if workspace.resolve().is_relative_to(FIXTURE_ROOT.resolve()):
        raise PlaygroundError(
            "choose a working directory outside the checked-in fixture"
        )
    try:
        if workspace.exists() or workspace.is_symlink():
            _validate_project(workspace)
            return workspace
        _validate_project(FIXTURE_ROOT)
        workspace.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".rocket-lab-", dir=workspace.parent
        ) as staging:
            shutil.copytree(FIXTURE_ROOT, staging, dirs_exist_ok=True, symlinks=True)
            _validate_project(Path(staging))
            Path(staging).rename(workspace)
    except OSError as error:
        raise PlaygroundError(f"cannot prepare the example: {error}") from error
    return workspace


def _validate_project(root: Path) -> None:
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise PlaygroundError(f"workspace must be a regular directory: {root}")
    for name in REQUIRED_FILES:
        path = root / name
        if not stat.S_ISREG(path.lstat().st_mode):
            raise PlaygroundError(f"example file must be a regular file: {path}")


if __name__ == "__main__":
    raise SystemExit(main())
