from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path

from platform_contract import (
    PlatformContractError,
    release_platform_tag,
    required_platform_tag,
    validate_native_binary,
)
from setta.runtime import (
    MANIFEST_FORMAT,
    PackagedRuntime,
    RuntimeAssetError,
    RuntimeTarget,
    _canonical_json_bytes,
)

ROOT = Path(__file__).resolve().parents[3]
_APP_ID = re.compile(r"^[a-z][a-z0-9-]*$")


class StageError(Exception):
    pass


@dataclass(frozen=True)
class StageAppInputs:
    app_id: str
    native_server: Path
    web_root: Path


@dataclass(frozen=True)
class StageInputs:
    apps: tuple[StageAppInputs, ...]
    output: Path
    target: RuntimeTarget
    wheel_platform_tag: str | None = None


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--app",
        action="append",
        nargs=3,
        required=True,
        metavar=("APP_ID", "NATIVE_SERVER", "WEB_ROOT"),
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--target", required=True, help="platform target, for example darwin-arm64"
    )
    parser.add_argument(
        "--wheel-platform-tag",
        help="exact release platform tag; required for Linux manylinux publication",
    )
    namespace = parser.parse_args(arguments)
    try:
        stage(
            StageInputs(
                apps=tuple(
                    StageAppInputs(app_id, Path(native_server), Path(web_root))
                    for app_id, native_server, web_root in namespace.app
                ),
                output=namespace.output,
                target=parse_target(namespace.target),
                wheel_platform_tag=namespace.wheel_platform_tag,
            )
        )
    except StageError as error:
        parser.exit(2, f"stage_setta_wheel: {error}\n")
    return 0


def parse_target(value: str) -> RuntimeTarget:
    operating_system, separator, architecture = value.partition("-")
    if not separator or not operating_system or not architecture:
        raise StageError("--target must name a supported Setta release target")
    try:
        required_platform_tag(operating_system, architecture)
    except PlatformContractError as error:
        raise StageError(str(error)) from error
    return RuntimeTarget(os=operating_system, arch=architecture)


def stage(inputs: StageInputs) -> Path:
    platform_tag = _release_platform_tag(inputs)
    apps = _validated_apps(inputs.apps, inputs.target, platform_tag)
    output = _prepare_output_path(inputs.output)
    temporary = Path(tempfile.mkdtemp(prefix=f".{output.name}.", dir=output.parent))
    published = False
    try:
        runtime_root = temporary / "setta" / "_runtime"
        (runtime_root / "bin").mkdir(parents=True, exist_ok=False)
        for app, native_server, web_files in apps:
            native_name = _native_name(app.app_id, inputs.target)
            _copy_regular_file(
                native_server, runtime_root / "bin" / native_name, executable=True
            )
            staged_web_root = runtime_root / app.app_id / "web"
            for source, relative in web_files:
                destination = staged_web_root.joinpath(*relative.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                _copy_regular_file(source, destination, executable=False)
        manifest = _manifest_for(runtime_root, inputs.target, apps)
        manifest_path = runtime_root / "manifest.json"
        manifest_path.write_bytes(_canonical_json_bytes(manifest))
        _fsync_tree(runtime_root)

        PackagedRuntime(runtime_root, expected_target=inputs.target).manifest()
        os.replace(temporary, output)
        published = True
        _fsync_directory(output.parent)
    except RuntimeAssetError as error:
        raise StageError(error.message) from error
    finally:
        if not published:
            shutil.rmtree(temporary, ignore_errors=True)
    return output / "setta" / "_runtime"


def _validated_apps(
    values: tuple[StageAppInputs, ...],
    target: RuntimeTarget,
    platform_tag: str,
) -> tuple[tuple[StageAppInputs, Path, list[tuple[Path, Path]]], ...]:
    if not values:
        raise StageError("at least one packaged app is required")
    app_ids: set[str] = set()
    validated: list[tuple[StageAppInputs, Path, list[tuple[Path, Path]]]] = []
    for app in values:
        if not _APP_ID.fullmatch(app.app_id) or app.app_id in app_ids:
            raise StageError(
                f"packaged app ID is invalid or duplicated: {app.app_id!r}"
            )
        app_ids.add(app.app_id)
        native_server = _require_regular_file(
            app.native_server, f"{app.app_id} native server"
        )
        _validate_native_binary(native_server, target, platform_tag)
        validated.append((app, native_server, _collect_web_files(app.web_root)))
    return tuple(sorted(validated, key=lambda value: value[0].app_id))


def _native_name(app_id: str, target: RuntimeTarget) -> str:
    return f"{app_id}.exe" if target.os == "windows" else app_id


def _prepare_output_path(value: Path) -> Path:
    output = value.expanduser()
    if output.exists() or output.is_symlink():
        raise StageError(f"staging output already exists: {output}")
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise StageError(f"cannot create staging parent: {output.parent}") from error
    if not output.parent.is_dir() or output.parent.is_symlink():
        raise StageError(f"staging parent is invalid: {output.parent}")
    return output


def _require_regular_file(value: Path, label: str) -> Path:
    path = value.expanduser()
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise StageError(f"{label} is missing: {path}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise StageError(f"{label} must be a regular non-symlink file: {path}")
    return path


def _collect_web_files(value: Path) -> list[tuple[Path, Path]]:
    root = value.expanduser()
    _require_web_root(root)
    files: list[tuple[Path, Path]] = []
    for directory, directory_names, file_names in os.walk(
        root, topdown=True, followlinks=False
    ):
        directory_path = Path(directory)
        for name in sorted(directory_names):
            _require_web_entry(directory_path / name, directory=True)
        for name in sorted(file_names):
            candidate = directory_path / name
            _require_web_entry(candidate, directory=False)
            files.append((candidate, candidate.relative_to(root)))
    if not files or not any(
        relative.as_posix() == "index.html" for _, relative in files
    ):
        raise StageError("production web root must contain index.html")
    return sorted(files, key=lambda item: item[1].as_posix())


def _require_web_root(root: Path) -> None:
    try:
        root_mode = root.lstat().st_mode
    except OSError as error:
        raise StageError(f"production web root is missing: {root}") from error
    if stat.S_ISLNK(root_mode) or not stat.S_ISDIR(root_mode):
        raise StageError("production web root must be a non-symlink directory")


def _require_web_entry(path: Path, *, directory: bool) -> None:
    kind = "directory" if directory else "asset"
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise StageError(f"production web {kind} is unreadable: {path}") from error
    if stat.S_ISLNK(mode):
        entry_kind = "directory" if directory else "file"
        raise StageError(f"production web tree contains a {entry_kind} symlink: {path}")
    valid = stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)
    if not valid:
        invalid_kind = "invalid directory" if directory else "non-regular asset"
        article = "an" if directory else "a"
        raise StageError(
            f"production web tree contains {article} {invalid_kind}: {path}"
        )


def _release_platform_tag(inputs: StageInputs) -> str:
    try:
        return release_platform_tag(
            inputs.target.os, inputs.target.arch, inputs.wheel_platform_tag
        )
    except PlatformContractError as error:
        raise StageError(str(error)) from error


def _validate_native_binary(
    path: Path, target: RuntimeTarget, platform_tag: str
) -> None:
    try:
        validate_native_binary(
            path,
            operating_system=target.os,
            architecture=target.arch,
            platform_tag=platform_tag,
        )
    except PlatformContractError as error:
        raise StageError(str(error)) from error


def _copy_regular_file(source: Path, destination: Path, *, executable: bool) -> None:
    _require_regular_file(source, "staging input")
    try:
        shutil.copyfile(source, destination)
        destination.chmod(0o755 if executable else 0o644)
    except OSError as error:
        raise StageError(f"cannot stage asset {source}") from error
    if _sha256(source) != _sha256(destination):
        raise StageError(f"staged asset changed while copying: {source}")


def _manifest_for(
    runtime_root: Path,
    target: RuntimeTarget,
    apps: tuple[tuple[StageAppInputs, Path, list[tuple[Path, Path]]], ...],
) -> dict[str, object]:
    native_paths = {f"bin/{_native_name(app.app_id, target)}" for app, _, _ in apps}
    assets: list[dict[str, object]] = []
    for source, relative in _all_staged_regular_files(runtime_root):
        assets.append(
            {
                "executable": relative.as_posix() in native_paths,
                "path": relative.as_posix(),
                "sha256": _sha256(source),
            }
        )
    assets.sort(key=lambda item: str(item["path"]))
    return {
        "apps": [
            {
                "id": app.app_id,
                "nativeServer": f"bin/{_native_name(app.app_id, target)}",
                "webRoot": f"{app.app_id}/web",
            }
            for app, _, _ in apps
        ],
        "assets": assets,
        "formatVersion": MANIFEST_FORMAT,
        "target": target.document(),
    }


def _all_staged_regular_files(root: Path) -> list[tuple[Path, Path]]:
    files: list[tuple[Path, Path]] = []
    for directory, _, file_names in os.walk(root, topdown=True, followlinks=False):
        directory_path = Path(directory)
        for name in sorted(file_names):
            path = directory_path / name
            _require_regular_file(path, "staged asset")
            files.append((path, path.relative_to(root)))
    return files


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _fsync_tree(root: Path) -> None:
    for directory, _, file_names in os.walk(root):
        directory_path = Path(directory)
        for name in file_names:
            path = directory_path / name
            try:
                with path.open("rb") as stream:
                    os.fsync(stream.fileno())
            except OSError:
                continue
        _fsync_directory(directory_path)


def _fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    try:
        descriptor = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    except OSError:
        return
    finally:
        os.close(descriptor)
