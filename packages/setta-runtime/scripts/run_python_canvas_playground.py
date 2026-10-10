from __future__ import annotations

import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXAMPLES_ROOT = ROOT / "apps/python-canvas/examples"
WORKSPACE_ROOT = ROOT / "tmp/python-canvas-playground"
EXAMPLES = ("training-system", "rover-mission", "model-arena", "art-studio")
REQUIRED_FILES = (
    "project.json",
    "recipe.py",
    "pyproject.toml",
    "uv.lock",
    "uv.toml",
)


class PlaygroundError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(runtime_root), str(runtime_root / "src")]
    from scripts import playground_options, playground_server

    options = playground_options.parse_options(
        "python-canvas",
        WORKSPACE_ROOT / EXAMPLES[0],
        arguments,
        examples={example: WORKSPACE_ROOT / example for example in EXAMPLES},
    )
    if isinstance(options, int):
        return options
    example = options.example or EXAMPLES[0]
    return playground_server.run(
        "python-canvas", options, lambda workspace: _prepare_launch(workspace, example)
    )


def _prepare_launch(workspace: Path, example: str) -> Path:
    workspace = prepare_workspace(workspace, example)
    uv = shutil.which("uv")
    if uv is None:
        raise PlaygroundError(
            "uv is required to prepare the playground's Python environment"
        )
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
    return workspace


def prepare_workspace(
    workspace: Path | None = None, example: str = "training-system"
) -> Path:
    fixture = EXAMPLES_ROOT / example / "fixture"
    workspace = WORKSPACE_ROOT / example if workspace is None else workspace
    if workspace.resolve().is_relative_to(EXAMPLES_ROOT.resolve()):
        raise PlaygroundError(
            "choose a working directory outside the checked-in fixture"
        )
    try:
        if workspace.exists() or workspace.is_symlink():
            _validate_project(workspace, example)
            return workspace
        _validate_project(fixture, example)
        workspace.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=f".{example}-", dir=workspace.parent
        ) as staging:
            shutil.copytree(
                fixture,
                staging,
                dirs_exist_ok=True,
                symlinks=True,
                ignore=shutil.ignore_patterns(".venv", "__pycache__"),
            )
            _validate_project(Path(staging), example)
            Path(staging).rename(workspace)
    except OSError as error:
        raise PlaygroundError(f"cannot prepare the example: {error}") from error
    return workspace


def _validate_project(root: Path, example: str) -> None:
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise PlaygroundError(f"workspace must be a regular directory: {root}")
    for name in (*REQUIRED_FILES, f"{example.replace('-', '_')}.py"):
        path = root / name
        if not stat.S_ISREG(path.lstat().st_mode):
            raise PlaygroundError(f"example file must be a regular file: {path}")


if __name__ == "__main__":
    raise SystemExit(main())
