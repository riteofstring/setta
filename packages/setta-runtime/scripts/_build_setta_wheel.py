from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from platform_contract import (
    PlatformContractError,
    native_build_environment,
    release_platform_tag,
)
from scripts._stage_setta_wheel import (
    StageAppInputs,
    StageError,
    StageInputs,
    parse_target,
    stage,
)
from setta.runtime import (
    PackagedRuntime,
    RuntimeAssetError,
    RuntimeTarget,
    current_target,
)

ROOT = Path(__file__).resolve().parents[3]
_REQUIRED_UV_VERSION = "0.8.19"
_DEFAULT_STAGE_DIR = ROOT / "build" / "setta-wheel" / "stage"


@dataclass(frozen=True)
class BuildApp:
    app_id: str
    frontend_package: str
    frontend_root: Path
    backend_root: Path
    native_command: str


_APPS = (
    BuildApp(
        "experiment-lens",
        "@setta/experiment-lens",
        ROOT / "apps" / "experiment-lens" / "dist",
        ROOT / "apps" / "experiment-lens" / "backend",
        "./cmd/experiment-lens",
    ),
    BuildApp(
        "python-canvas",
        "@setta/python-canvas",
        ROOT / "apps" / "python-canvas" / "dist",
        ROOT / "apps" / "python-canvas" / "backend",
        "./cmd/python-canvas",
    ),
    BuildApp(
        "realtime",
        "@setta/realtime",
        ROOT / "apps" / "realtime" / "dist",
        ROOT / "apps" / "realtime" / "backend",
        "./cmd/realtime",
    ),
    BuildApp(
        "review",
        "@setta/review",
        ROOT / "apps" / "review" / "dist",
        ROOT / "apps" / "review" / "backend",
        "./cmd/review",
    ),
)


class BuildError(Exception):
    pass


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", help="current build target; defaults to this machine"
    )
    parser.add_argument(
        "--native-server",
        action="append",
        metavar="APP_ID=PATH",
        help="use an already-built native server for one registered app",
    )
    parser.add_argument(
        "--web-root",
        action="append",
        metavar="APP_ID=PATH",
        help="use an already-built production web tree for one registered app",
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
        help=(
            "exact wheel platform tag; Linux accepts a local linux_* "
            "or verified manylinux_2_28_* tag"
        ),
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
    web_overrides = _path_overrides(getattr(namespace, "web_root", None), "--web-root")
    native_overrides = _path_overrides(
        getattr(namespace, "native_server", None), "--native-server"
    )
    if not getattr(namespace, "skip_frontend_build", False):
        _run_frontend_build(
            getattr(namespace, "pnpm", None),
            web_overrides,
            getattr(namespace, "go", None),
        )
    with tempfile.TemporaryDirectory(
        prefix="setta-native-build-"
    ) as temporary_directory:
        suffix = ".exe" if target.os == "windows" else ""
        temporary = Path(temporary_directory)
        staged_apps: list[StageAppInputs] = []
        for app in _APPS:
            native_server = native_overrides.get(app.app_id)
            if native_server is None:
                native_server = temporary / f"{app.app_id}{suffix}"
                _run_native_build(
                    app, native_server, getattr(namespace, "go", None), target
                )
            staged_apps.append(
                StageAppInputs(
                    app_id=app.app_id,
                    native_server=native_server,
                    web_root=web_overrides.get(app.app_id, app.frontend_root),
                )
            )
        return _stage_and_maybe_wheel(
            tuple(staged_apps), namespace, target, platform_tag
        )


def _stage_and_maybe_wheel(
    apps: tuple[StageAppInputs, ...],
    namespace: argparse.Namespace,
    target: RuntimeTarget,
    platform_tag: str,
) -> Path:
    stage_directory = _stage_directory_for(namespace, target)
    stage(
        StageInputs(
            apps=apps,
            output=stage_directory,
            target=target,
            wheel_platform_tag=platform_tag,
        )
    )
    if getattr(namespace, "stage_only", False):
        return stage_directory
    wheel_dir = getattr(namespace, "wheel_dir", ROOT / "dist")
    _run_uv_build(wheel_dir, platform_tag)
    return wheel_dir


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


def _run_frontend_build(
    explicit_pnpm: Path | None,
    web_overrides: dict[str, Path],
    explicit_go: Path | None = None,
) -> None:
    pnpm = str(explicit_pnpm) if explicit_pnpm is not None else shutil.which("pnpm")
    if pnpm is None:
        raise BuildError("pnpm is required to build the production web application")
    environment = _frontend_build_environment(explicit_go)
    _run_frontend_command(
        [pnpm, "--filter", "@setta/workspace", "run", "build"], environment
    )
    for app in _APPS:
        if app.app_id not in web_overrides:
            _run_frontend_command(
                [pnpm, "--filter", app.frontend_package, "run", "build"],
                environment,
            )


def _frontend_build_environment(explicit_go: Path | None) -> dict[str, str] | None:
    if explicit_go is None:
        return None
    environment = os.environ.copy()
    inherited = environment.get("PATH")
    path_entries = [str(explicit_go.parent)]
    if inherited:
        path_entries.append(inherited)
    environment["PATH"] = os.pathsep.join(path_entries)
    return environment


def _run_frontend_command(
    command: list[str], environment: dict[str, str] | None
) -> None:
    if environment is None:
        _run(command, ROOT)
        return
    _run(command, ROOT, environment=environment)


def _run_native_build(
    app: BuildApp,
    output: Path,
    explicit_go: Path | None,
    target: RuntimeTarget,
) -> None:
    go = str(explicit_go) if explicit_go is not None else shutil.which("go")
    if go is None:
        raise BuildError("Go is required to build the packaged native server")
    _run(
        [
            go,
            "-C",
            str(app.backend_root),
            "build",
            "-mod=readonly",
            "-trimpath",
            "-buildvcs=false",
            "-o",
            str(output),
            app.native_command,
        ],
        ROOT,
        environment=native_build_environment(os.environ, target.os),
    )


def _path_overrides(values: list[str] | None, flag: str) -> dict[str, Path]:
    overrides: dict[str, Path] = {}
    known = {app.app_id for app in _APPS}
    for value in values or []:
        app_id, separator, raw_path = value.partition("=")
        if not separator or app_id not in known or not raw_path or app_id in overrides:
            raise BuildError(f"{flag} requires one unique registered APP_ID=PATH value")
        overrides[app_id] = Path(raw_path)
    return overrides


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
