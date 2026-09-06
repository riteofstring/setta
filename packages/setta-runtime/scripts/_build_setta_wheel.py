from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from platform_contract import (
    PlatformContractError,
    native_build_environment,
    release_platform_tag,
)
from scripts._stage_setta_wheel import StageError, StageInputs, parse_target, stage
from setta.runtime import (
    PackagedRuntime,
    RuntimeAssetError,
    RuntimeTarget,
    current_target,
)

ROOT = Path(__file__).resolve().parents[3]
_REQUIRED_UV_VERSION = "0.8.19"
_DEFAULT_STAGE_DIR = ROOT / "build" / "setta-wheel" / "stage"


class BuildError(Exception):
    pass


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", help="current build target; defaults to this machine"
    )
    parser.add_argument(
        "--native-server", type=Path, help="use an already-built native server"
    )
    parser.add_argument(
        "--web-root", type=Path, help="use an already-built production web tree"
    )
    parser.add_argument(
        "--stage-dir",
        type=Path,
        help=(
            "custom empty staging directory; the default owned stage is replaced safely"
        ),
    )
    parser.add_argument("--wheel-dir", type=Path, default=ROOT / "dist")
    parser.add_argument(
        "--go", type=Path, help="explicit Go executable for native compilation"
    )
    parser.add_argument(
        "--pnpm", type=Path, help="explicit pnpm executable for frontend compilation"
    )
    parser.add_argument(
        "--wheel-platform-tag",
        help="exact release platform tag; required for Linux manylinux publication",
    )
    parser.add_argument("--skip-frontend-build", action="store_true")
    parser.add_argument("--stage-only", action="store_true")
    namespace = parser.parse_args(arguments)
    try:
        build(namespace)
    except (BuildError, StageError) as error:
        parser.exit(2, f"build_setta_wheel: {error}\n")
    return 0


def build(namespace: argparse.Namespace) -> Path:
    target = parse_target(namespace.target) if namespace.target else current_target()
    if target != current_target():
        raise BuildError("cross-target native builds require their matching CI runner")
    try:
        platform_tag = release_platform_tag(
            target.os, target.arch, namespace.wheel_platform_tag
        )
    except PlatformContractError as error:
        raise BuildError(str(error)) from error
    web_root = namespace.web_root or ROOT / "apps" / "python-canvas" / "dist"
    if not namespace.skip_frontend_build and namespace.web_root is None:
        _run_frontend_build(namespace.pnpm)
    if namespace.native_server is not None:
        native_server = namespace.native_server
        return _stage_and_maybe_wheel(
            native_server, web_root, namespace, target, platform_tag
        )
    with tempfile.TemporaryDirectory(
        prefix="setta-native-build-"
    ) as temporary_directory:
        suffix = ".exe" if target.os == "windows" else ""
        native_server = Path(temporary_directory) / f"python-canvas{suffix}"
        _run_native_build(native_server, namespace.go, target)
        return _stage_and_maybe_wheel(
            native_server, web_root, namespace, target, platform_tag
        )


def _stage_and_maybe_wheel(
    native_server: Path,
    web_root: Path,
    namespace: argparse.Namespace,
    target: RuntimeTarget,
    platform_tag: str,
) -> Path:
    stage_directory = _stage_directory_for(namespace, target)
    stage(
        StageInputs(
            native_server=native_server,
            web_root=web_root,
            output=stage_directory,
            target=target,
            wheel_platform_tag=platform_tag,
        )
    )
    if namespace.stage_only:
        return stage_directory
    _run_uv_build(namespace.wheel_dir, platform_tag)
    return namespace.wheel_dir


def _stage_directory_for(namespace: argparse.Namespace, target: RuntimeTarget) -> Path:
    requested = namespace.stage_dir
    if requested is not None:
        return requested
    _clear_owned_default_stage(target)
    return _DEFAULT_STAGE_DIR


def _clear_owned_default_stage(target: RuntimeTarget) -> None:
    if not _DEFAULT_STAGE_DIR.exists() and not _DEFAULT_STAGE_DIR.is_symlink():
        return
    if _DEFAULT_STAGE_DIR.is_symlink() or not _DEFAULT_STAGE_DIR.is_dir():
        raise BuildError(
            f"default staging path is not a directory: {_DEFAULT_STAGE_DIR}"
        )
    package_root = _DEFAULT_STAGE_DIR / "setta"
    runtime_root = package_root / "_runtime"
    if not _is_exact_owned_stage(package_root, runtime_root):
        raise BuildError(
            "default staging path contains unexpected content; choose an empty "
            "custom --stage-dir"
        )
    try:
        PackagedRuntime(runtime_root, expected_target=target).manifest()
    except RuntimeAssetError as error:
        raise BuildError(
            "default staging path is not a valid prior Setta stage; choose an empty "
            "custom --stage-dir"
        ) from error
    try:
        shutil.rmtree(_DEFAULT_STAGE_DIR)
    except OSError as error:
        raise BuildError(
            f"cannot replace default staging path: {_DEFAULT_STAGE_DIR}"
        ) from error


def _is_exact_owned_stage(package_root: Path, runtime_root: Path) -> bool:
    return (
        _has_exact_non_symlink_children(_DEFAULT_STAGE_DIR, {"setta"})
        and _has_exact_non_symlink_children(package_root, {"_runtime"})
        and runtime_root.is_dir()
        and not runtime_root.is_symlink()
    )


def _has_exact_non_symlink_children(directory: Path, expected: set[str]) -> bool:
    try:
        children = list(directory.iterdir())
    except OSError:
        return False
    return {child.name for child in children} == expected and all(
        not child.is_symlink() for child in children
    )


def _run_frontend_build(explicit_pnpm: Path | None) -> None:
    pnpm = str(explicit_pnpm) if explicit_pnpm is not None else shutil.which("pnpm")
    if pnpm is None:
        raise BuildError("pnpm is required to build the production web application")
    _run([pnpm, "--filter", "@setta/workspace", "run", "build"], ROOT)
    _run([pnpm, "--filter", "@setta/python-canvas", "run", "build"], ROOT)


def _run_native_build(
    output: Path, explicit_go: Path | None, target: RuntimeTarget
) -> None:
    go = str(explicit_go) if explicit_go is not None else shutil.which("go")
    if go is None:
        raise BuildError("Go is required to build the packaged native server")
    _run(
        [
            go,
            "-C",
            str(ROOT / "apps" / "python-canvas" / "backend"),
            "build",
            "-trimpath",
            "-buildvcs=false",
            "-o",
            str(output),
            "./cmd/python-canvas",
        ],
        ROOT,
        environment=native_build_environment(os.environ, target.os),
    )


def _run_uv_build(wheel_dir: Path, platform_tag: str) -> None:
    uv = shutil.which("uv")
    if uv is None:
        raise BuildError("uv is required to build the Python wheel")
    completed = subprocess.run(
        [uv, "--version"], check=False, capture_output=True, text=True
    )
    version_banner = completed.stdout.strip()
    required_banner = f"uv {_REQUIRED_UV_VERSION}"
    if completed.returncode != 0 or not (
        version_banner == required_banner
        or version_banner.startswith(required_banner + " ")
    ):
        raise BuildError(f"this build requires uv {_REQUIRED_UV_VERSION}")
    wheel_dir.mkdir(parents=True, exist_ok=True)
    _run(
        [
            uv,
            "build",
            "--wheel",
            "--no-build-isolation",
            "--config-setting",
            f"setta-platform-tag={platform_tag}",
            "--out-dir",
            str(wheel_dir),
        ],
        ROOT,
    )


def _run(
    command: list[str], cwd: Path, *, environment: dict[str, str] | None = None
) -> None:
    try:
        subprocess.run(command, cwd=cwd, check=True, env=environment)
    except OSError as error:
        raise BuildError(f"cannot execute build command: {command[0]}") from error
    except subprocess.CalledProcessError as error:
        raise BuildError(f"build command failed: {command[0]}") from error
