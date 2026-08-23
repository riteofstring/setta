"""Validated access to the packaged platform runtime assets."""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.resources
import json
import os
import platform
import stat
import sysconfig
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .errors import RuntimeAssetError

MANIFEST_FORMAT = "setta-runtime/v1"
MANIFEST_FILE_NAME = "manifest.json"


@dataclass(frozen=True)
class RuntimeTarget:
    os: str
    arch: str

    def document(self) -> dict[str, str]:
        return {"arch": self.arch, "os": self.os}


@dataclass(frozen=True)
class RuntimeAsset:
    path: str
    sha256: str
    executable: bool


@dataclass(frozen=True)
class RuntimeApp:
    app_id: str
    native_server: Path
    web_root: Path


@dataclass(frozen=True)
class RuntimeManifest:
    target: RuntimeTarget
    apps: dict[str, tuple[str, str]]
    assets: dict[str, RuntimeAsset]


def current_target() -> RuntimeTarget:
    system = platform.system().lower()
    system_map = {"darwin": "darwin", "linux": "linux", "windows": "windows"}
    machine = platform.machine().lower()
    machine_map = {
        "aarch64": "arm64",
        "amd64": "amd64",
        "arm64": "arm64",
        "x86_64": "amd64",
    }
    if system not in system_map or machine not in machine_map:
        raise RuntimeAssetError(
            "This platform is not supported by the packaged Setta runtime.",
            {"architecture": machine, "platform": system},
        )
    return RuntimeTarget(os=system_map[system], arch=machine_map[machine])


class PackagedRuntime:
    """Loads and validates the assets that one wheel owns."""

    def __init__(
        self, root: Path | None = None, *, expected_target: RuntimeTarget | None = None
    ):
        self._root: Path | None = root
        self._expected_target: RuntimeTarget | None = expected_target
        self._loaded: RuntimeManifest | None = None

    @property
    def root(self) -> Path:
        if self._root is None:
            self._root = packaged_runtime_root()
        return self._root

    def manifest(self) -> RuntimeManifest:
        if self._loaded is None:
            self._loaded = self._load_and_validate()
        return self._loaded

    def app(self, app_id: str) -> RuntimeApp:
        manifest = self.manifest()
        declaration = manifest.apps.get(app_id)
        if declaration is None:
            raise RuntimeAssetError(
                f"The packaged runtime does not contain the {app_id!r} app."
            )
        native_server, web_root = declaration
        return RuntimeApp(
            app_id=app_id,
            native_server=self._asset_path(native_server),
            web_root=self._directory_path(web_root),
        )

    def check(self) -> dict[str, object]:
        manifest = self.manifest()
        return {
            "assetCount": len(manifest.assets),
            "status": "ok",
            "target": manifest.target.document(),
        }

    def _load_and_validate(self) -> RuntimeManifest:
        root = self.root
        _validate_runtime_root(root)
        manifest = _load_canonical_manifest(root)
        self._validate_target(manifest)
        self._validate_declared_assets(manifest)
        self._validate_declared_apps(manifest)
        self._validate_closed_asset_inventory(manifest)
        return manifest

    def _validate_target(self, manifest: RuntimeManifest) -> None:
        target = self._expected_target or current_target()
        if manifest.target != target:
            raise RuntimeAssetError(
                "The packaged runtime target does not match this machine.",
                {"actual": target.document(), "packaged": manifest.target.document()},
            )

    def _validate_declared_assets(self, manifest: RuntimeManifest) -> None:
        for asset in manifest.assets.values():
            path = self._asset_path(asset.path)
            _validate_asset_hash(path, asset)
            _validate_asset_mode(path, asset)

    def _validate_declared_apps(self, manifest: RuntimeManifest) -> None:
        for app_id, (native_server, web_root) in manifest.apps.items():
            _validate_app_server(app_id, native_server, manifest.assets)
            directory = self._directory_path(web_root)
            if not _regular_non_symlink_file(directory / "index.html"):
                raise RuntimeAssetError(
                    f"The packaged app {app_id!r} has no production web index."
                )

    def _validate_closed_asset_inventory(self, manifest: RuntimeManifest) -> None:
        actual = _runtime_regular_files(self.root)
        declared = set(manifest.assets)
        if actual == declared:
            return
        details: dict[str, object] = {}
        unmanifested = sorted(actual - declared)
        missing = sorted(declared - actual)
        if unmanifested:
            details["unmanifestedAssets"] = unmanifested
        if missing:
            details["missingAssets"] = missing
        raise RuntimeAssetError(
            "The packaged runtime asset inventory is not closed.", details or None
        )

    def _asset_path(self, relative_path: str) -> Path:
        relative = _safe_relative_path(relative_path)
        path = self.root.joinpath(*relative.parts)
        if not _regular_non_symlink_file(path):
            raise RuntimeAssetError(
                f"The packaged runtime asset {relative_path!r} is missing or invalid."
            )
        _require_inside_root(path, self.root)
        return path

    def _directory_path(self, relative_path: str) -> Path:
        relative = _safe_relative_path(relative_path)
        path = self.root.joinpath(*relative.parts)
        if not path.is_dir() or path.is_symlink():
            raise RuntimeAssetError(
                f"The packaged runtime directory {relative_path!r} is missing or invalid."
            )
        _require_inside_root(path, self.root)
        return path


def packaged_runtime_root() -> Path:
    resource = importlib.resources.files("setta").joinpath("_runtime")
    if isinstance(resource, Path):
        return resource
    raise RuntimeAssetError(
        "Setta must be installed from a wheel so its native runtime assets are files."
    )


def resolve_basedpyright_entrypoint() -> Path:
    """Resolve only the direct runtime dependency's installed console entrypoint."""

    try:
        distribution = importlib.metadata.distribution("basedpyright")
    except importlib.metadata.PackageNotFoundError as error:
        raise RuntimeAssetError(
            "The required basedpyright runtime dependency is not installed."
        ) from error
    entrypoints = {
        entrypoint.name
        for entrypoint in distribution.entry_points
        if entrypoint.group == "console_scripts"
    }
    if "basedpyright-langserver" not in entrypoints:
        raise RuntimeAssetError(
            "The installed basedpyright distribution has no language-server entrypoint."
        )
    scripts = sysconfig.get_path("scripts")
    if not scripts:
        raise RuntimeAssetError("The Python launcher has no scripts directory.")
    script_root = Path(scripts)
    candidates = [script_root / "basedpyright-langserver"]
    if os.name == "nt":
        candidates = [
            script_root / "basedpyright-langserver.exe",
            script_root / "basedpyright-langserver.cmd",
            script_root / "basedpyright-langserver",
        ]
    for candidate in candidates:
        if not candidate.is_file():
            continue
        if os.name != "nt" and not os.access(candidate, os.X_OK):
            continue
        return candidate.resolve()
    raise RuntimeAssetError(
        "The installed basedpyright language-server entrypoint is missing."
    )


def _parse_manifest(raw: object) -> RuntimeManifest:
    document = _object_mapping(raw)
    if document is None or set(document) != {
        "apps",
        "assets",
        "formatVersion",
        "target",
    }:
        raise RuntimeAssetError("The packaged runtime manifest has an invalid shape.")
    if document["formatVersion"] != MANIFEST_FORMAT:
        raise RuntimeAssetError("The packaged runtime manifest format is unsupported.")
    target = _parse_target(document["target"])
    assets = _parse_assets(document["assets"])
    apps = _parse_apps(document["apps"], assets)
    return RuntimeManifest(target=target, apps=apps, assets=assets)


def _parse_target(raw: object) -> RuntimeTarget:
    document = _object_mapping(raw)
    if document is None or set(document) != {"arch", "os"}:
        raise RuntimeAssetError("The packaged runtime target is invalid.")
    os_value = document["os"]
    arch = document["arch"]
    if not isinstance(os_value, str) or not isinstance(arch, str):
        raise RuntimeAssetError("The packaged runtime target is invalid.")
    if os_value not in {"darwin", "linux", "windows"} or arch not in {"amd64", "arm64"}:
        raise RuntimeAssetError("The packaged runtime target is unsupported.")
    return RuntimeTarget(os=os_value, arch=arch)


def _parse_assets(raw: object) -> dict[str, RuntimeAsset]:
    values = _object_list(raw)
    if not values:
        raise RuntimeAssetError("The packaged runtime asset inventory is invalid.")
    assets: dict[str, RuntimeAsset] = {}
    for value in values:
        asset = _parse_asset(value)
        if asset.path in assets:
            raise RuntimeAssetError(
                "The packaged runtime asset inventory has duplicates."
            )
        assets[asset.path] = asset
    if list(assets) != sorted(assets):
        raise RuntimeAssetError(
            "The packaged runtime asset inventory is not canonical."
        )
    return assets


def _parse_asset(value: object) -> RuntimeAsset:
    document = _object_mapping(value)
    if document is None or set(document) != {"executable", "path", "sha256"}:
        raise RuntimeAssetError("The packaged runtime asset inventory is invalid.")
    fields = _asset_fields(document)
    if fields is None:
        raise RuntimeAssetError("The packaged runtime asset inventory is invalid.")
    path, digest, executable = fields
    _safe_relative_path(path)
    return RuntimeAsset(path=path, sha256=digest, executable=executable)


def _asset_fields(document: Mapping[str, object]) -> tuple[str, str, bool] | None:
    path = document["path"]
    digest = document["sha256"]
    executable = document["executable"]
    if (
        not isinstance(path, str)
        or not isinstance(digest, str)
        or not isinstance(executable, bool)
    ):
        return None
    if len(digest) != 64 or not all(
        character in "0123456789abcdef" for character in digest
    ):
        return None
    return path, digest, executable


def _parse_apps(
    raw: object, assets: dict[str, RuntimeAsset]
) -> dict[str, tuple[str, str]]:
    values = _object_list(raw)
    if not values:
        raise RuntimeAssetError("The packaged runtime app inventory is invalid.")
    apps: dict[str, tuple[str, str]] = {}
    for value in values:
        app_id, native_server, web_root = _parse_app(value)
        if app_id in apps:
            raise RuntimeAssetError("The packaged runtime app inventory is invalid.")
        if native_server not in assets:
            raise RuntimeAssetError(
                "The packaged app server is absent from the asset inventory."
            )
        apps[app_id] = (native_server, web_root)
    if list(apps) != sorted(apps):
        raise RuntimeAssetError("The packaged runtime app inventory is not canonical.")
    return apps


def _parse_app(value: object) -> tuple[str, str, str]:
    document = _object_mapping(value)
    if document is None or set(document) != {"id", "nativeServer", "webRoot"}:
        raise RuntimeAssetError("The packaged runtime app inventory is invalid.")
    fields = _app_fields(document)
    if fields is None:
        raise RuntimeAssetError("The packaged runtime app inventory is invalid.")
    app_id, native_server, web_root = fields
    _safe_relative_path(native_server)
    _safe_relative_path(web_root)
    return app_id, native_server, web_root


def _app_fields(document: Mapping[str, object]) -> tuple[str, str, str] | None:
    app_id = document["id"]
    native_server = document["nativeServer"]
    web_root = document["webRoot"]
    if not isinstance(app_id, str) or not app_id:
        return None
    if not isinstance(native_server, str) or not isinstance(web_root, str):
        return None
    return app_id, native_server, web_root


def _safe_relative_path(value: str) -> PurePosixPath:
    if not value or "\\" in value:
        raise RuntimeAssetError("A packaged runtime path is invalid.")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise RuntimeAssetError("A packaged runtime path is invalid.")
    return path


def _regular_non_symlink_file(path: Path) -> bool:
    try:
        return path.is_file() and not path.is_symlink()
    except OSError:
        return False


def _require_inside_root(path: Path, root: Path) -> None:
    try:
        path.resolve(strict=True).relative_to(root.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise RuntimeAssetError(
            "A packaged runtime path escapes its runtime root."
        ) from error


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json_bytes(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        + b"\n"
    )


def _validate_runtime_root(root: Path) -> None:
    if not root.is_dir():
        raise RuntimeAssetError("The packaged Setta runtime directory is missing.")
    if root.is_symlink():
        raise RuntimeAssetError(
            "The packaged Setta runtime directory must not be a symlink."
        )


def _load_canonical_manifest(root: Path) -> RuntimeManifest:
    manifest_path = root / MANIFEST_FILE_NAME
    if not _regular_non_symlink_file(manifest_path):
        raise RuntimeAssetError("The packaged runtime manifest is missing or invalid.")
    try:
        manifest_bytes = manifest_path.read_bytes()
        raw: object = json.loads(manifest_bytes.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeAssetError(
            "The packaged runtime manifest is not valid JSON."
        ) from error
    if manifest_bytes != _canonical_json_bytes(raw):
        raise RuntimeAssetError("The packaged runtime manifest is not canonical.")
    return _parse_manifest(raw)


def _validate_asset_hash(path: Path, asset: RuntimeAsset) -> None:
    if _sha256(path) != asset.sha256:
        raise RuntimeAssetError(
            f"The packaged runtime asset {asset.path!r} does not match its manifest hash."
        )


def _validate_asset_mode(path: Path, asset: RuntimeAsset) -> None:
    if (
        asset.executable
        and os.name != "nt"
        and not (path.stat().st_mode & stat.S_IXUSR)
    ):
        raise RuntimeAssetError(
            f"The packaged runtime asset {asset.path!r} is not executable."
        )


def _validate_app_server(
    app_id: str, native_server: str, assets: dict[str, RuntimeAsset]
) -> None:
    asset = assets.get(native_server)
    if asset is None or not asset.executable:
        raise RuntimeAssetError(
            f"The packaged app {app_id!r} has no executable native server asset."
        )


def _runtime_regular_files(root: Path) -> set[str]:
    """Return every regular runtime file while rejecting symlinked tree entries."""

    _require_directory(root, "The packaged Setta runtime directory is invalid.")
    files: set[str] = set()
    for directory, directory_names, file_names in os.walk(
        root, topdown=True, followlinks=False
    ):
        directory_path = Path(directory)
        _require_directory(
            directory_path, "The packaged runtime contains an invalid directory."
        )
        _validate_child_directories(directory_path, directory_names)
        files.update(_regular_files_in_directory(root, directory_path, file_names))
    return files


def _require_directory(path: Path, invalid_message: str) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as error:
        raise RuntimeAssetError(
            "The packaged runtime contains an unreadable directory."
        ) from error
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise RuntimeAssetError(invalid_message)


def _validate_child_directories(directory: Path, names: list[str]) -> None:
    for name in sorted(names):
        mode = _entry_mode(
            directory / name, "The packaged runtime contains an unreadable directory."
        )
        if stat.S_ISLNK(mode):
            raise RuntimeAssetError(
                "The packaged runtime must not contain directory symlinks."
            )
        if not stat.S_ISDIR(mode):
            raise RuntimeAssetError(
                "The packaged runtime contains an invalid directory entry."
            )


def _regular_files_in_directory(
    root: Path, directory: Path, names: list[str]
) -> set[str]:
    files: set[str] = set()
    for name in sorted(names):
        child = directory / name
        mode = _entry_mode(child, "The packaged runtime contains an unreadable asset.")
        if stat.S_ISLNK(mode):
            raise RuntimeAssetError(
                "The packaged runtime must not contain file symlinks."
            )
        if not stat.S_ISREG(mode):
            raise RuntimeAssetError(
                "The packaged runtime contains a non-regular asset."
            )
        relative = child.relative_to(root).as_posix()
        if relative != MANIFEST_FILE_NAME:
            files.add(relative)
    return files


def _entry_mode(path: Path, message: str) -> int:
    try:
        return path.lstat().st_mode
    except OSError as error:
        raise RuntimeAssetError(message) from error


def _object_mapping(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    result: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            return None
        result[key] = item
    return result


def _object_list(value: object) -> list[object] | None:
    if not isinstance(value, list):
        return None
    result: list[object] = []
    result.extend(value)
    return result
