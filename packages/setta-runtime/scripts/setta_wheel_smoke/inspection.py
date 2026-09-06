from __future__ import annotations

import base64
import hashlib
import re
import stat
import zipfile
from collections.abc import Sequence
from pathlib import Path, PurePosixPath

from .models import (
    APP_IDS,
    FORBIDDEN_ARCHIVE_ROOTS,
    FORBIDDEN_ARCHIVE_SEGMENTS,
    InspectedRuntimeApp,
    MAX_WHEEL_ENTRIES,
    MAX_WHEEL_TEXT_BYTES,
    MAX_WHEEL_UNCOMPRESSED_BYTES,
    RUNTIME_MANIFEST_PATH,
    RUNTIME_PREFIX,
    SmokeError,
    WheelInspection,
    metadata_field,
    parse_json_document,
    read_bounded,
    require_list,
    require_object,
    safe_archive_path,
    safe_runtime_relative_path,
    target_for_platform_tag,
    zip_info_is_executable,
)


def inspect_wheel(
    value: Path, *, expected_platform_tag: str | None = None
) -> WheelInspection:

    wheel = require_regular_wheel(value)
    try:
        with zipfile.ZipFile(wheel) as archive:
            archive_infos = tuple(archive.infolist())
            infos = wheel_file_infos(archive_infos)
            names = {info.filename for info in infos}
            validate_archive_layout(archive_infos, names)
            dist_info = single_dist_info_root(names)
            version, tag = validate_wheel_metadata(archive, infos, names, dist_info)
            if expected_platform_tag is not None and tag != expected_platform_tag:
                raise SmokeError(
                    f"wheel platform tag {tag!r} does not match expected "
                    f"{expected_platform_tag!r}"
                )
            validate_record(archive, infos, dist_info)
            target, apps = validate_runtime_manifest(archive, infos, names, tag)
    except (OSError, UnicodeDecodeError, ValueError, zipfile.BadZipFile) as error:
        if isinstance(error, SmokeError):
            raise
        raise SmokeError(f"cannot inspect wheel {wheel}: {error}") from error
    return WheelInspection(
        path=wheel,
        version=version,
        platform_tag=tag,
        target=target,
        apps=apps,
    )


def require_regular_wheel(value: Path) -> Path:
    path = value.expanduser().resolve(strict=False)
    try:
        info = path.lstat()
    except OSError as error:
        raise SmokeError(f"wheel is missing: {path}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise SmokeError(f"wheel must be a regular non-symlink file: {path}")
    if path.suffix != ".whl":
        raise SmokeError(f"wheel must have the .whl suffix: {path}")
    if info.st_size < 1:
        raise SmokeError(f"wheel is empty: {path}")
    return path


def wheel_file_infos(
    archive_infos: Sequence[zipfile.ZipInfo],
) -> tuple[zipfile.ZipInfo, ...]:
    if not archive_infos or len(archive_infos) > MAX_WHEEL_ENTRIES:
        raise SmokeError("wheel has an invalid number of archive entries")
    archive_names = [info.filename for info in archive_infos]
    if len(archive_names) != len(set(archive_names)):
        raise SmokeError("wheel contains duplicate archive paths")
    infos = tuple(info for info in archive_infos if not info.is_dir())
    if not infos:
        raise SmokeError("wheel contains no file entries")
    if sum(info.file_size for info in infos) > MAX_WHEEL_UNCOMPRESSED_BYTES:
        raise SmokeError("wheel exceeds the configured uncompressed inspection limit")
    return infos


def validate_archive_layout(infos: Sequence[zipfile.ZipInfo], names: set[str]) -> None:
    del names
    for info in infos:
        safe_archive_path(info.filename)
        mode = (info.external_attr >> 16) & 0xFFFF
        if info.create_system == 3 and stat.S_ISLNK(mode):
            raise SmokeError(f"wheel contains a forbidden symlink: {info.filename}")
        parts = PurePosixPath(info.filename).parts
        if parts[0] in FORBIDDEN_ARCHIVE_ROOTS:
            raise SmokeError(
                f"wheel contains a source or package-manager path: {info.filename}"
            )
        if any(part in FORBIDDEN_ARCHIVE_SEGMENTS for part in parts):
            raise SmokeError(
                f"wheel contains a source or package-manager path: {info.filename}"
            )
        if not (
            info.filename.startswith("setta/")
            or re.fullmatch(r"setta-[^/]+\.dist-info/.+", info.filename)
        ):
            raise SmokeError(
                f"wheel contains an unexpected top-level path: {info.filename}"
            )


def single_dist_info_root(names: set[str]) -> str:
    roots = {
        name.split("/", 1)[0]
        for name in names
        if re.fullmatch(r"setta-[^/]+\.dist-info/.+", name)
    }
    if len(roots) != 1:
        raise SmokeError("wheel must contain exactly one setta dist-info root")
    return next(iter(roots))


def validate_wheel_metadata(
    archive: zipfile.ZipFile,
    infos: Sequence[zipfile.ZipInfo],
    names: set[str],
    dist_info: str,
) -> tuple[str, str]:
    del infos
    required = {
        f"{dist_info}/METADATA",
        f"{dist_info}/WHEEL",
        f"{dist_info}/entry_points.txt",
        f"{dist_info}/RECORD",
        "setta/__init__.py",
        "setta/__main__.py",
        "setta/cli.py",
        RUNTIME_MANIFEST_PATH,
    }
    missing = sorted(required - names)
    if missing:
        raise SmokeError(f"wheel is missing required entries: {', '.join(missing)}")
    metadata = read_archive_text(archive, f"{dist_info}/METADATA")
    version = metadata_field(metadata, "Version")
    if metadata_field(metadata, "Name").lower() != "setta":
        raise SmokeError("wheel metadata does not name the setta distribution")
    wheel_text = read_archive_text(archive, f"{dist_info}/WHEEL")
    tags = [
        line.removeprefix("Tag: ")
        for line in wheel_text.splitlines()
        if line.startswith("Tag: ")
    ]
    if len(tags) != 1 or not re.fullmatch(r"py3-none-[A-Za-z0-9_.]+", tags[0]):
        raise SmokeError("wheel must have exactly one platform-specific py3-none tag")
    if "Root-Is-Purelib: false" not in wheel_text.splitlines():
        raise SmokeError("wheel must declare Root-Is-Purelib: false")
    filename_suffix = f"-py3-none-{tags[0].removeprefix('py3-none-')}.whl"
    if not archive.filename or not Path(archive.filename).name.endswith(
        filename_suffix
    ):
        raise SmokeError("wheel filename and WHEEL platform tag do not agree")
    entry_points = read_archive_text(archive, f"{dist_info}/entry_points.txt")
    if "setta = setta.cli:main" not in entry_points.splitlines():
        raise SmokeError("wheel does not expose the setta console command")
    if any(
        line.strip().startswith("python-canvas") for line in entry_points.splitlines()
    ):
        raise SmokeError(
            "wheel must not expose the retired python-canvas console alias"
        )
    return version, tags[0].removeprefix("py3-none-")


def validate_record(
    archive: zipfile.ZipFile, infos: Sequence[zipfile.ZipInfo], dist_info: str
) -> None:
    record_name = f"{dist_info}/RECORD"
    records: dict[str, tuple[str, str]] = {}
    for line in read_archive_text(archive, record_name).splitlines():
        fields = line.split(",")
        if len(fields) != 3 or not fields[0] or fields[0] in records:
            raise SmokeError("wheel RECORD has an invalid or duplicate entry")
        records[fields[0]] = (fields[1], fields[2])
    names = {info.filename for info in infos}
    if set(records) != names:
        raise SmokeError("wheel RECORD does not exactly cover archive files")
    if records.get(record_name) != ("", ""):
        raise SmokeError("wheel RECORD entry must omit its own digest and size")
    for info in infos:
        if info.filename == record_name:
            continue
        digest, size = records[info.filename]
        content = read_archive_bytes(
            archive, info.filename, MAX_WHEEL_UNCOMPRESSED_BYTES
        )
        expected_digest = (
            base64.urlsafe_b64encode(hashlib.sha256(content).digest())
            .decode("ascii")
            .rstrip("=")
        )
        if digest != f"sha256={expected_digest}" or size != str(len(content)):
            raise SmokeError(f"wheel RECORD does not match {info.filename}")


def validate_runtime_manifest(
    archive: zipfile.ZipFile,
    infos: Sequence[zipfile.ZipInfo],
    names: set[str],
    platform_tag: str,
) -> tuple[tuple[str, str], tuple[InspectedRuntimeApp, ...]]:
    raw_manifest = parse_json_document(
        read_archive_bytes(archive, RUNTIME_MANIFEST_PATH, MAX_WHEEL_TEXT_BYTES),
        "runtime manifest",
    )
    manifest = require_object(raw_manifest, "runtime manifest")
    if set(manifest) != {"apps", "assets", "formatVersion", "target"}:
        raise SmokeError("runtime manifest has an invalid shape")
    if manifest["formatVersion"] != "setta-runtime/v1":
        raise SmokeError("runtime manifest has an unsupported format version")
    manifest_target = _runtime_manifest_target(manifest["target"], platform_tag)
    asset_paths = _runtime_manifest_assets(archive, names, manifest["assets"])
    apps = _runtime_manifest_apps(infos, names, manifest["apps"], asset_paths)
    return manifest_target, apps


def _runtime_manifest_target(value: object, platform_tag: str) -> tuple[str, str]:
    target = require_object(value, "runtime target")
    if (
        set(target) != {"arch", "os"}
        or target.get("os") not in {"darwin", "linux", "windows"}
        or target.get("arch") not in {"amd64", "arm64"}
    ):
        raise SmokeError("runtime manifest has an invalid target")
    manifest_target = (str(target["os"]), str(target["arch"]))
    wheel_target = target_for_platform_tag(platform_tag)
    if manifest_target != wheel_target:
        raise SmokeError(
            "runtime manifest target does not match the wheel platform tag "
            f"{platform_tag!r}"
        )
    return manifest_target


def _runtime_manifest_assets(
    archive: zipfile.ZipFile, names: set[str], value: object
) -> dict[str, bool]:
    assets = require_list(value, "runtime assets")
    if not assets:
        raise SmokeError("runtime manifest has no assets")
    asset_paths: dict[str, bool] = {}
    for asset in assets:
        path, digest, executable = _runtime_asset_fields(asset)
        safe_runtime_relative_path(path)
        if path in asset_paths or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise SmokeError("runtime manifest has duplicate or invalid assets")
        archive_path = RUNTIME_PREFIX + path
        if archive_path not in names:
            raise SmokeError(
                f"runtime manifest asset is missing from the wheel: {path}"
            )
        content = read_archive_bytes(
            archive, archive_path, MAX_WHEEL_UNCOMPRESSED_BYTES
        )
        if hashlib.sha256(content).hexdigest() != digest:
            raise SmokeError(f"runtime manifest hash does not match {path}")
        asset_paths[path] = executable
    if list(asset_paths) != sorted(asset_paths):
        raise SmokeError("runtime manifest assets are not canonical")
    actual_assets = {
        name.removeprefix(RUNTIME_PREFIX)
        for name in names
        if name.startswith(RUNTIME_PREFIX) and name != RUNTIME_MANIFEST_PATH
    }
    if actual_assets != set(asset_paths):
        raise SmokeError("runtime manifest asset inventory is not closed")
    return asset_paths


def _runtime_asset_fields(value: object) -> tuple[str, str, bool]:
    document = require_object(value, "runtime asset")
    if set(document) != {"executable", "path", "sha256"}:
        raise SmokeError("runtime manifest has an invalid asset shape")
    path = document.get("path")
    digest = document.get("sha256")
    executable = document.get("executable")
    if (
        not isinstance(path, str)
        or not isinstance(digest, str)
        or not isinstance(executable, bool)
    ):
        raise SmokeError("runtime manifest has an invalid asset value")
    return path, digest, executable


def _runtime_manifest_apps(
    infos: Sequence[zipfile.ZipInfo],
    names: set[str],
    value: object,
    asset_paths: dict[str, bool],
) -> tuple[InspectedRuntimeApp, ...]:
    apps = require_list(value, "runtime apps")
    app_ids = [app.get("id") if isinstance(app, dict) else None for app in apps]
    if tuple(app_ids) != APP_IDS:
        raise SmokeError(
            "runtime manifest does not contain the canonical app inventory"
        )
    return tuple(_runtime_manifest_app(infos, names, app, asset_paths) for app in apps)


def _runtime_manifest_app(
    infos: Sequence[zipfile.ZipInfo],
    names: set[str],
    value: object,
    asset_paths: dict[str, bool],
) -> InspectedRuntimeApp:
    app = require_object(value, "runtime app")
    if set(app) != {"id", "nativeServer", "webRoot"}:
        raise SmokeError("runtime manifest has an invalid app")
    app_id = app.get("id")
    native_relative = app.get("nativeServer")
    web_root = app.get("webRoot")
    if (
        not isinstance(app_id, str)
        or not isinstance(native_relative, str)
        or not isinstance(web_root, str)
    ):
        raise SmokeError("runtime manifest app paths are invalid")
    safe_runtime_relative_path(native_relative)
    safe_runtime_relative_path(web_root)
    if not asset_paths.get(native_relative, False):
        raise SmokeError("runtime manifest native server is absent or not executable")
    native_member = RUNTIME_PREFIX + native_relative
    native_info = next((info for info in infos if info.filename == native_member), None)
    if native_info is None or not zip_info_is_executable(native_info):
        raise SmokeError("wheel native server does not retain executable mode")
    web_prefix = RUNTIME_PREFIX + web_root.rstrip("/") + "/"
    index = web_prefix + "index.html"
    web_members = tuple(sorted(name for name in names if name.startswith(web_prefix)))
    if index not in web_members:
        raise SmokeError(f"wheel has no packaged {app_id} index.html")
    if not any(name.startswith(web_prefix + "assets/") for name in web_members):
        raise SmokeError(f"wheel has no packaged {app_id} hashed asset")
    return InspectedRuntimeApp(app_id, native_member, web_members)


def read_archive_text(archive: zipfile.ZipFile, name: str) -> str:
    try:
        return read_archive_bytes(archive, name, MAX_WHEEL_TEXT_BYTES).decode("utf-8")
    except UnicodeDecodeError as error:
        raise SmokeError(f"wheel entry is not valid UTF-8: {name}") from error


def read_archive_bytes(archive: zipfile.ZipFile, name: str, limit: int) -> bytes:
    try:
        with archive.open(name, "r") as source:
            return read_bounded(source, limit, f"wheel entry {name}")
    except KeyError as error:
        raise SmokeError(f"wheel entry is missing: {name}") from error
