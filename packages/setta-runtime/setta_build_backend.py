"""Zero-dependency PEP 517 backend for platform-specific Setta wheels.

The backend deliberately accepts only a prevalidated staged runtime. It writes
the wheel directly so a release build has no hidden build-backend dependency or
universal-wheel fallback.
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
import stat
import sys
import tempfile
import tomllib
import zipfile
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from platform_contract import (
    PlatformContractError,
    release_platform_tag,
    validate_native_binary,
)

_PLATFORM_TAG_CONFIG_SETTING = "setta-platform-tag"


class BuildBackendError(RuntimeError):
    """The project cannot safely produce a distributable wheel."""


@dataclass(frozen=True)
class ProjectInfo:
    name: str
    version: str
    summary: str
    requires_python: str
    license_text: str
    dependencies: tuple[str, ...]
    scripts: tuple[tuple[str, str], ...]

    @property
    def normalized_name(self) -> str:
        return re.sub(r"[-_.]+", "_", self.name).lower()

    @property
    def dist_info_name(self) -> str:
        return f"{self.normalized_name}-{self.version}.dist-info"


@dataclass(frozen=True)
class WheelEntry:
    archive_path: str
    source: Path | None
    data: bytes | None
    mode: int


@dataclass(frozen=True)
class BuildContext:
    root: Path
    project: ProjectInfo
    platform_tag: str
    source_entries: tuple[WheelEntry, ...]
    runtime_entries: tuple[WheelEntry, ...]
    license_entries: tuple[WheelEntry, ...]

    @property
    def wheel_name(self) -> str:
        return f"{self.project.normalized_name}-{self.project.version}-py3-none-{self.platform_tag}.whl"


def get_requires_for_build_wheel(
    config_settings: Mapping[str, Any] | None = None,
) -> list[str]:
    del config_settings
    return []


def get_requires_for_build_sdist(
    config_settings: Mapping[str, Any] | None = None,
) -> list[str]:
    del config_settings
    return []


def prepare_metadata_for_build_wheel(
    metadata_directory: str,
    config_settings: Mapping[str, Any] | None = None,
) -> str:
    context = _build_context(config_settings)
    destination = Path(metadata_directory) / context.project.dist_info_name
    destination.mkdir(parents=True, exist_ok=False)
    metadata_entries = _metadata_entries(context)
    records: list[str] = []
    for entry in metadata_entries:
        path = destination / entry.archive_path.removeprefix(
            f"{context.project.dist_info_name}/"
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        data = _entry_data(entry)
        path.write_bytes(data)
        records.append(_record_line(entry.archive_path, data))
    (destination / "RECORD").write_text(
        "\n".join([*records, f"{context.project.dist_info_name}/RECORD,,"]) + "\n",
        encoding="utf-8",
    )
    return context.project.dist_info_name


def build_wheel(
    wheel_directory: str,
    config_settings: Mapping[str, Any] | None = None,
    metadata_directory: str | None = None,
) -> str:
    del metadata_directory
    context = _build_context(config_settings)
    destination_directory = Path(wheel_directory)
    destination_directory.mkdir(parents=True, exist_ok=True)
    destination = destination_directory / context.wheel_name
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{context.wheel_name}.", suffix=".tmp", dir=destination_directory
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    published = False
    try:
        _write_wheel(temporary, context)
        temporary.chmod(0o644)
        os.replace(temporary, destination)
        published = True
    finally:
        if not published:
            _unlink_if_exists(temporary)
    return context.wheel_name


def build_sdist(
    sdist_directory: str,
    config_settings: Mapping[str, Any] | None = None,
) -> str:
    del sdist_directory, config_settings
    raise BuildBackendError(
        "Setta does not publish source distributions; build a staged platform wheel."
    )


def _build_context(config_settings: Mapping[str, Any] | None = None) -> BuildContext:
    root = _repository_root()
    project = _read_project_info(root)
    platform_tag = _validated_runtime_platform(root, config_settings)
    source_entries = tuple(_source_entries(root))
    runtime_entries = tuple(_runtime_entries(root))
    license_entries = tuple(_license_entries(root, project))
    return BuildContext(
        root,
        project,
        platform_tag,
        source_entries,
        runtime_entries,
        license_entries,
    )


def _repository_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _read_project_info(root: Path) -> ProjectInfo:
    try:
        with (root / "pyproject.toml").open("rb") as stream:
            document = tomllib.load(stream)
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise BuildBackendError("Cannot read the Setta project metadata.") from error
    project = document.get("project")
    if not isinstance(project, dict):
        raise BuildBackendError("The Setta project metadata is invalid.")
    name = _required_string(project, "name")
    version = _required_string(project, "version")
    summary = _required_string(project, "description")
    requires_python = _required_string(project, "requires-python")
    dependencies = _string_sequence(project.get("dependencies"), "dependencies")
    license_data = project.get("license")
    if not isinstance(license_data, dict):
        raise BuildBackendError("The Setta project license metadata is invalid.")
    license_text = _required_string(license_data, "text")
    scripts_data = project.get("scripts")
    if not isinstance(scripts_data, dict) or not scripts_data:
        raise BuildBackendError("The Setta console-script metadata is invalid.")
    scripts = tuple(
        sorted((_string_pair(key, value) for key, value in scripts_data.items()))
    )
    return ProjectInfo(
        name=name,
        version=version,
        summary=summary,
        requires_python=requires_python,
        license_text=license_text,
        dependencies=dependencies,
        scripts=scripts,
    )


def _validated_runtime_platform(
    root: Path, config_settings: Mapping[str, Any] | None
) -> str:
    source_root = root / "packages" / "setta-runtime" / "src"
    stage = _stage_root(root)
    source_root_text = str(source_root)
    sys.path.insert(0, source_root_text)
    try:
        from setta.runtime import PackagedRuntime, RuntimeAssetError, current_target
    except ImportError as error:
        raise BuildBackendError(
            "The staged Setta runtime is missing or invalid."
        ) from error
    try:
        runtime = PackagedRuntime(stage, expected_target=current_target())
        manifest = runtime.manifest()
        target = manifest.target
    except (OSError, RuntimeAssetError, ValueError) as error:
        raise BuildBackendError(
            "The staged Setta runtime is missing or invalid."
        ) from error
    finally:
        try:
            sys.path.remove(source_root_text)
        except ValueError:
            pass
    try:
        tag = release_platform_tag(
            target.os, target.arch, _platform_tag_from_config(config_settings)
        )
        for app_id in manifest.apps:
            validate_native_binary(
                runtime.app(app_id).native_server,
                operating_system=target.os,
                architecture=target.arch,
                platform_tag=tag,
            )
    except PlatformContractError as error:
        raise BuildBackendError(str(error)) from error
    return tag


def _stage_root(root: Path) -> Path:
    return root / "build" / "setta-wheel" / "stage" / "setta" / "_runtime"


def _platform_tag_from_config(config_settings: Mapping[str, Any] | None) -> str | None:
    if config_settings is None or _PLATFORM_TAG_CONFIG_SETTING not in config_settings:
        return None
    value = config_settings[_PLATFORM_TAG_CONFIG_SETTING]
    if isinstance(value, str):
        return value
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], str):
        return value[0]
    raise BuildBackendError(
        f"The {_PLATFORM_TAG_CONFIG_SETTING} build setting must have one string value."
    )


def _source_entries(root: Path) -> Iterable[WheelEntry]:
    source_root = root / "packages" / "setta-runtime" / "src"
    for path in _regular_files(source_root, suffix=".py"):
        yield WheelEntry(path.relative_to(source_root).as_posix(), path, None, 0o644)


def _runtime_entries(root: Path) -> Iterable[WheelEntry]:
    runtime_root = _stage_root(root)
    for path in _regular_files(runtime_root):
        mode = 0o755 if path.stat().st_mode & stat.S_IXUSR else 0o644
        archive_path = "setta/_runtime/" + path.relative_to(runtime_root).as_posix()
        yield WheelEntry(archive_path, path, None, mode)


def _license_entries(root: Path, project: ProjectInfo) -> Iterable[WheelEntry]:
    license_root = root / "packages" / "setta-runtime" / "licenses"
    for path in _regular_files(license_root):
        yield WheelEntry(
            f"{project.dist_info_name}/licenses/"
            f"{path.relative_to(license_root).as_posix()}",
            path,
            None,
            0o644,
        )


def _regular_files(root: Path, *, suffix: str | None = None) -> Iterable[Path]:
    try:
        root_mode = root.lstat().st_mode
    except OSError as error:
        raise BuildBackendError(f"Required source tree is missing: {root}") from error
    if stat.S_ISLNK(root_mode) or not stat.S_ISDIR(root_mode):
        raise BuildBackendError(f"Required source tree is invalid: {root}")
    for directory, directory_names, file_names in os.walk(
        root, topdown=True, followlinks=False
    ):
        directory_path = Path(directory)
        for name in sorted(directory_names):
            _require_regular_directory(directory_path / name)
        for name in sorted(file_names):
            path = directory_path / name
            _require_regular_file(path)
            if suffix is None or path.suffix == suffix:
                yield path


def _require_regular_directory(path: Path) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise BuildBackendError(f"Cannot read required directory: {path}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise BuildBackendError(f"Required tree contains an invalid directory: {path}")


def _require_regular_file(path: Path) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise BuildBackendError(f"Cannot read required file: {path}") from error
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise BuildBackendError(f"Required tree contains an invalid file: {path}")


def _metadata_entries(context: BuildContext) -> tuple[WheelEntry, ...]:
    dist_info = context.project.dist_info_name
    tag = f"py3-none-{context.platform_tag}"
    metadata_lines = [
        "Metadata-Version: 2.3",
        f"Name: {context.project.name}",
        f"Version: {context.project.version}",
        f"Summary: {context.project.summary}",
        f"License: {context.project.license_text}",
        f"Requires-Python: {context.project.requires_python}",
        *(
            f"Requires-Dist: {dependency}"
            for dependency in context.project.dependencies
        ),
        "",
    ]
    wheel_lines = [
        "Wheel-Version: 1.0",
        "Generator: setta-build-backend",
        "Root-Is-Purelib: false",
        f"Tag: {tag}",
        "",
    ]
    entry_points = [
        "[console_scripts]",
        *(f"{name} = {target}" for name, target in context.project.scripts),
        "",
    ]
    return (
        WheelEntry(
            f"{dist_info}/METADATA",
            None,
            "\n".join(metadata_lines).encode("utf-8"),
            0o644,
        ),
        WheelEntry(
            f"{dist_info}/WHEEL", None, "\n".join(wheel_lines).encode("utf-8"), 0o644
        ),
        WheelEntry(
            f"{dist_info}/entry_points.txt",
            None,
            "\n".join(entry_points).encode("utf-8"),
            0o644,
        ),
        *context.license_entries,
    )


def _write_wheel(destination: Path, context: BuildContext) -> None:
    entries = sorted(
        [
            *context.source_entries,
            *context.runtime_entries,
            *_metadata_entries(context),
        ],
        key=lambda entry: entry.archive_path,
    )
    _reject_duplicate_archive_paths(entries)
    records: list[str] = []
    with zipfile.ZipFile(
        destination,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=True,
    ) as archive:
        for entry in entries:
            data = _entry_data(entry)
            _write_zip_entry(archive, entry, data)
            records.append(_record_line(entry.archive_path, data))
        record_path = f"{context.project.dist_info_name}/RECORD"
        record = "\n".join([*records, f"{record_path},,"]) + "\n"
        _write_zip_entry(
            archive,
            WheelEntry(record_path, None, record.encode("utf-8"), 0o644),
            record.encode("utf-8"),
        )


def _reject_duplicate_archive_paths(entries: Sequence[WheelEntry]) -> None:
    paths = [entry.archive_path for entry in entries]
    if len(paths) != len(set(paths)):
        raise BuildBackendError("Wheel contents contain duplicate archive paths.")


def _entry_data(entry: WheelEntry) -> bytes:
    if entry.data is not None:
        return entry.data
    if entry.source is None:
        raise BuildBackendError(
            f"Wheel entry has no content source: {entry.archive_path}"
        )
    try:
        return entry.source.read_bytes()
    except OSError as error:
        raise BuildBackendError(f"Cannot read wheel input: {entry.source}") from error


def _write_zip_entry(archive: zipfile.ZipFile, entry: WheelEntry, data: bytes) -> None:
    info = zipfile.ZipInfo(entry.archive_path, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | entry.mode) << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def _record_line(path: str, data: bytes) -> str:
    digest = (
        base64.urlsafe_b64encode(hashlib.sha256(data).digest())
        .decode("ascii")
        .rstrip("=")
    )
    return f"{path},sha256={digest},{len(data)}"


def _required_string(document: Mapping[str, Any], field: str) -> str:
    value = document.get(field)
    if not isinstance(value, str) or not value:
        raise BuildBackendError(f"The Setta project {field!r} metadata is invalid.")
    return value


def _string_sequence(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item for item in value
    ):
        raise BuildBackendError(f"The Setta project {field!r} metadata is invalid.")
    return tuple(value)


def _string_pair(name: object, target: object) -> tuple[str, str]:
    if (
        not isinstance(name, str)
        or not name
        or not isinstance(target, str)
        or not target
    ):
        raise BuildBackendError("The Setta console-script metadata is invalid.")
    return name, target


def _unlink_if_exists(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return
