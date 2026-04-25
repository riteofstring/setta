from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from setuptools import build_meta as _build_meta

_PLUGIN_ROOT = Path(__file__).resolve().parent
_FRONTEND_ROOT = _PLUGIN_ROOT / "frontend"
_DIST_FILES = (
    _FRONTEND_ROOT / "dist" / "index.js",
    _FRONTEND_ROOT / "dist" / "index.css",
)


def _pnpm_command() -> str:
    return "pnpm.cmd" if os.name == "nt" else "pnpm"


def _run_pnpm(args: list[str]) -> None:
    result = subprocess.run(
        [_pnpm_command(), "--dir", str(_FRONTEND_ROOT), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return
    output = f"{result.stdout}\n{result.stderr}".strip()
    if output:
        raise RuntimeError(output)
    raise RuntimeError(
        f"pnpm {' '.join(args)} failed with exit code {result.returncode}"
    )


def _frontend_dependencies_present() -> bool:
    node_modules_root = _FRONTEND_ROOT / "node_modules"
    if not node_modules_root.is_dir():
        return False
    return any(node_modules_root.iterdir())


def _ensure_frontend_bundle() -> None:
    if not (_FRONTEND_ROOT / "package.json").is_file():
        raise RuntimeError(
            f"plugin frontend package metadata is missing: {_FRONTEND_ROOT / 'package.json'}"
        )
    if not _frontend_dependencies_present():
        _run_pnpm(["install", "--lockfile=false"])
    _run_pnpm(["run", "build"])
    missing_files = [str(path) for path in _DIST_FILES if not path.is_file()]
    if missing_files:
        raise RuntimeError(
            "plugin frontend build did not produce required bundle files: "
            + ", ".join(missing_files)
        )


def _build_with_frontend(
    builder: Any,
    *args: object,
    **kwargs: Any,
) -> str:
    _ensure_frontend_bundle()
    return builder(*args, **kwargs)


def build_wheel(
    wheel_directory: str,
    config_settings: dict[str, Any] | None = None,
    metadata_directory: str | None = None,
) -> str:
    return _build_with_frontend(
        _build_meta.build_wheel,
        wheel_directory,
        config_settings=config_settings,
        metadata_directory=metadata_directory,
    )


def build_editable(
    wheel_directory: str,
    config_settings: dict[str, Any] | None = None,
    metadata_directory: str | None = None,
) -> str:
    return _build_with_frontend(
        _build_meta.build_editable,
        wheel_directory,
        config_settings=config_settings,
        metadata_directory=metadata_directory,
    )


get_requires_for_build_wheel = _build_meta.get_requires_for_build_wheel
prepare_metadata_for_build_wheel = _build_meta.prepare_metadata_for_build_wheel
build_sdist = _build_meta.build_sdist
get_requires_for_build_sdist = _build_meta.get_requires_for_build_sdist
get_requires_for_build_editable = _build_meta.get_requires_for_build_editable
prepare_metadata_for_build_editable = _build_meta.prepare_metadata_for_build_editable
