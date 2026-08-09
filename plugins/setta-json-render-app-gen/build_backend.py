from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from setuptools import build_meta as _build_meta

_PLUGIN_ROOT = Path(__file__).resolve().parent
_FRONTEND_ROOT = _PLUGIN_ROOT / "frontend"
_VENDORED_SDK_ROOT = _FRONTEND_ROOT / "vendor" / "app-subsystem-frontend-sdk"
_VENDORED_SDK_FILES = (
    _VENDORED_SDK_ROOT / "dist" / "index.js",
    _VENDORED_SDK_ROOT / "types" / "index.d.ts",
)
_DIST_FILES = (
    _FRONTEND_ROOT / "dist" / "index.js",
    _FRONTEND_ROOT / "dist" / "index.css",
)


def _pnpm_command() -> str:
    return "pnpm.cmd" if os.name == "nt" else "pnpm"


def _repo_sdk_source_root() -> Path | None:
    repo_candidate = (
        _PLUGIN_ROOT.parent.parent / "frontend" / "plugin-sdk" / "app-subsystem"
    )
    if (repo_candidate / "package.json").is_file() and (
        repo_candidate / "src" / "index.ts"
    ).is_file():
        return repo_candidate
    return None


def _pnpm_env() -> dict[str, str]:
    env = os.environ.copy()
    sdk_source_root = _repo_sdk_source_root()
    if sdk_source_root is not None:
        env.setdefault(
            "SETTA_APP_SUBSYSTEM_FRONTEND_SDK_SOURCE_ROOT",
            str(sdk_source_root),
        )
    return env


def _run_pnpm(args: list[str]) -> None:
    result = subprocess.run(
        [_pnpm_command(), "--dir", str(_FRONTEND_ROOT), *args],
        check=False,
        capture_output=True,
        text=True,
        env=_pnpm_env(),
    )
    if result.returncode == 0:
        return
    output = f"{result.stdout}\n{result.stderr}".strip()
    if output:
        raise RuntimeError(output)
    raise RuntimeError(
        f"pnpm {' '.join(args)} failed with exit code {result.returncode}"
    )


def _ensure_vendored_frontend_sdk() -> None:
    if all(path.is_file() for path in _VENDORED_SDK_FILES):
        return
    _run_pnpm(["run", "prepare-sdk"])
    missing_files = [str(path) for path in _VENDORED_SDK_FILES if not path.is_file()]
    if missing_files:
        raise RuntimeError(
            "vendored app-subsystem frontend SDK materialization did not produce "
            "required files: " + ", ".join(missing_files)
        )


def _ensure_frontend_bundle() -> None:
    if not (_FRONTEND_ROOT / "package.json").is_file():
        raise RuntimeError(
            f"plugin frontend package metadata is missing: {_FRONTEND_ROOT / 'package.json'}"
        )
    _ensure_vendored_frontend_sdk()
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


def build_sdist(
    sdist_directory: str,
    config_settings: dict[str, Any] | None = None,
) -> str:
    _ensure_vendored_frontend_sdk()
    return _build_meta.build_sdist(
        sdist_directory,
        config_settings=config_settings,
    )


get_requires_for_build_wheel = _build_meta.get_requires_for_build_wheel
prepare_metadata_for_build_wheel = _build_meta.prepare_metadata_for_build_wheel
get_requires_for_build_sdist = _build_meta.get_requires_for_build_sdist
get_requires_for_build_editable = _build_meta.get_requires_for_build_editable
prepare_metadata_for_build_editable = _build_meta.prepare_metadata_for_build_editable
