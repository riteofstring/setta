import json
import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Literal, cast

LauncherOpenMode = Literal["browser", "chrome-app"]
LauncherWorkspaceBehavior = Literal["last_used_or_prompt", "always_prompt"]
LauncherInstallSource = Literal["uv_tool", "installer_managed", "unsupported"]

LAUNCHER_METADATA_SCHEMA_VERSION = 2
LAUNCHER_WORKSPACE_BEHAVIOR: LauncherWorkspaceBehavior = "last_used_or_prompt"
LAUNCHER_METADATA_FILE_NAME = "launcher-install.json"


class LauncherMetadataError(ValueError):
    pass


@dataclass(frozen=True)
class LauncherInstallMetadata:
    schemaVersion: int
    targetCommand: list[str]
    channel: str
    installSource: LauncherInstallSource
    artifactOwnershipToken: str
    settaVersion: str
    openMode: LauncherOpenMode
    workspaceBehavior: LauncherWorkspaceBehavior
    lastUsedWorkspace: str | None
    managedArtifacts: dict[str, str]

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "schemaVersion": self.schemaVersion,
            "targetCommand": self.targetCommand,
            "channel": self.channel,
            "installSource": self.installSource,
            "artifactOwnershipToken": self.artifactOwnershipToken,
            "settaVersion": self.settaVersion,
            "openMode": self.openMode,
            "workspaceBehavior": self.workspaceBehavior,
            "managedArtifacts": self.managedArtifacts,
        }
        if self.lastUsedWorkspace is not None:
            payload["lastUsedWorkspace"] = self.lastUsedWorkspace
        return payload


def resolve_launcher_dir(*, setta_home: Path) -> Path:
    return (setta_home / "launcher").resolve(strict=False)


def resolve_launcher_runtime_workspace(*, setta_home: Path) -> Path:
    return (resolve_launcher_dir(setta_home=setta_home) / "workspace").resolve(
        strict=False
    )


def resolve_launcher_metadata_path(*, setta_home: Path) -> Path:
    return (
        resolve_launcher_dir(setta_home=setta_home) / LAUNCHER_METADATA_FILE_NAME
    ).resolve(strict=False)


def build_launcher_install_metadata(
    *,
    target_command: list[str],
    channel: str,
    install_source: LauncherInstallSource,
    artifact_ownership_token: str,
    setta_version: str,
    open_mode: LauncherOpenMode,
    workspace_behavior: LauncherWorkspaceBehavior = LAUNCHER_WORKSPACE_BEHAVIOR,
    last_used_workspace: str | Path | None = None,
    managed_artifacts: dict[str, str | Path] | None = None,
) -> LauncherInstallMetadata:
    normalized_command = _normalize_target_command(target_command)
    normalized_channel = _normalize_required_string(channel, label="channel")
    normalized_install_source = _normalize_install_source(install_source)
    normalized_artifact_ownership_token = _normalize_required_string(
        artifact_ownership_token,
        label="artifactOwnershipToken",
    )
    normalized_version = _normalize_required_string(setta_version, label="settaVersion")
    normalized_workspace_behavior = _normalize_workspace_behavior(workspace_behavior)
    normalized_last_used_workspace = _normalize_optional_workspace(last_used_workspace)
    normalized_artifacts = _normalize_managed_artifacts(managed_artifacts or {})

    return LauncherInstallMetadata(
        schemaVersion=LAUNCHER_METADATA_SCHEMA_VERSION,
        targetCommand=normalized_command,
        channel=normalized_channel,
        installSource=normalized_install_source,
        artifactOwnershipToken=normalized_artifact_ownership_token,
        settaVersion=normalized_version,
        openMode=open_mode,
        workspaceBehavior=normalized_workspace_behavior,
        lastUsedWorkspace=normalized_last_used_workspace,
        managedArtifacts=normalized_artifacts,
    )


def write_launcher_install_metadata(
    *,
    setta_home: Path,
    metadata: LauncherInstallMetadata,
) -> Path:
    metadata_dir = resolve_launcher_dir(setta_home=setta_home)
    metadata_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    tmp_path = metadata_path.with_suffix(f"{metadata_path.suffix}.tmp")
    payload = metadata.to_payload()
    tmp_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp_path, metadata_path)
    return metadata_path


def load_launcher_install_metadata(
    *,
    setta_home: Path,
) -> LauncherInstallMetadata | None:
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    if not metadata_path.exists():
        return None
    if not metadata_path.is_file():
        raise LauncherMetadataError(
            f"Launcher metadata path is not a file: {metadata_path}"
        )
    try:
        raw_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LauncherMetadataError(
            f"Invalid launcher metadata JSON: {metadata_path}"
        ) from exc
    if not isinstance(raw_payload, dict):
        raise LauncherMetadataError(
            f"Launcher metadata must be a JSON object: {metadata_path}"
        )
    return _parse_launcher_metadata(raw_payload, metadata_path=metadata_path)


def remove_launcher_install_metadata(*, setta_home: Path) -> bool:
    metadata_path = resolve_launcher_metadata_path(setta_home=setta_home)
    if not metadata_path.exists():
        return False
    metadata_path.unlink()
    return True


def update_launcher_last_used_workspace_if_installed(
    *,
    setta_home: Path,
    workspace_root: str | Path,
) -> bool:
    metadata = load_launcher_install_metadata(setta_home=setta_home)
    if metadata is None:
        return False
    next_metadata = replace(
        metadata,
        lastUsedWorkspace=_normalize_optional_workspace(workspace_root),
    )
    write_launcher_install_metadata(setta_home=setta_home, metadata=next_metadata)
    return True


def launcher_target_validation_error(
    metadata: LauncherInstallMetadata,
) -> str | None:
    executable_path = Path(metadata.targetCommand[0]).resolve(strict=False)
    if not executable_path.exists():
        return (
            f"Configured launcher target is missing: {executable_path}. "
            "Re-run `setta launcher setup`."
        )
    if executable_path.is_dir():
        return (
            f"Configured launcher target is not an executable file: {executable_path}. "
            "Re-run `setta launcher setup`."
        )
    return None


def _parse_launcher_metadata(
    raw_payload: dict[str, object],
    *,
    metadata_path: Path,
) -> LauncherInstallMetadata:
    raw_schema = raw_payload.get("schemaVersion")
    if raw_schema != LAUNCHER_METADATA_SCHEMA_VERSION:
        raise LauncherMetadataError(
            "Unsupported launcher metadata schemaVersion "
            f"({raw_schema!r}) in {metadata_path}."
        )

    target_command = _normalize_target_command(raw_payload.get("targetCommand"))
    channel = _normalize_required_string(raw_payload.get("channel"), label="channel")
    install_source = _normalize_install_source(raw_payload.get("installSource"))
    artifact_ownership_token = _normalize_required_string(
        raw_payload.get("artifactOwnershipToken"),
        label="artifactOwnershipToken",
    )
    setta_version = _normalize_required_string(
        raw_payload.get("settaVersion"), label="settaVersion"
    )
    open_mode = _normalize_open_mode(raw_payload.get("openMode"))
    workspace_behavior = _normalize_workspace_behavior(
        raw_payload.get("workspaceBehavior")
    )
    last_used_workspace = _normalize_optional_workspace(
        raw_payload.get("lastUsedWorkspace")
    )
    managed_artifacts = _normalize_managed_artifacts(
        raw_payload.get("managedArtifacts")
    )

    return LauncherInstallMetadata(
        schemaVersion=LAUNCHER_METADATA_SCHEMA_VERSION,
        targetCommand=target_command,
        channel=channel,
        installSource=install_source,
        artifactOwnershipToken=artifact_ownership_token,
        settaVersion=setta_version,
        openMode=open_mode,
        workspaceBehavior=workspace_behavior,
        lastUsedWorkspace=last_used_workspace,
        managedArtifacts=managed_artifacts,
    )


def _normalize_required_string(raw_value: object, *, label: str) -> str:
    if not isinstance(raw_value, str):
        raise LauncherMetadataError(f"{label} must be a string.")
    trimmed = raw_value.strip()
    if not trimmed:
        raise LauncherMetadataError(f"{label} must be non-empty.")
    return trimmed


def _normalize_target_command(raw_value: object) -> list[str]:
    if not isinstance(raw_value, list):
        raise LauncherMetadataError("targetCommand must be a list of strings.")
    if not raw_value:
        raise LauncherMetadataError("targetCommand must include at least one value.")

    normalized: list[str] = []
    for idx, entry in enumerate(raw_value):
        if not isinstance(entry, str):
            raise LauncherMetadataError("targetCommand entries must be strings.")
        trimmed = entry.strip()
        if not trimmed:
            raise LauncherMetadataError("targetCommand entries must be non-empty.")
        if idx == 0:
            executable = Path(trimmed).expanduser()
            if not executable.is_absolute():
                raise LauncherMetadataError(
                    "targetCommand[0] must be an absolute executable path."
                )
            normalized.append(str(executable.resolve(strict=False)))
            continue
        normalized.append(trimmed)
    return normalized


def _normalize_open_mode(raw_value: object) -> LauncherOpenMode:
    if not isinstance(raw_value, str):
        raise LauncherMetadataError("openMode must be a string.")
    trimmed = raw_value.strip().lower()
    if trimmed not in {"browser", "chrome-app"}:
        raise LauncherMetadataError(
            "openMode must be either 'browser' or 'chrome-app'."
        )
    return cast("LauncherOpenMode", trimmed)


def _normalize_install_source(raw_value: object) -> LauncherInstallSource:
    if not isinstance(raw_value, str):
        raise LauncherMetadataError("installSource must be a string.")
    trimmed = raw_value.strip().lower()
    if trimmed not in {"uv_tool", "installer_managed", "unsupported"}:
        raise LauncherMetadataError(
            "installSource must be one of 'uv_tool', 'installer_managed', or 'unsupported'."
        )
    return cast("LauncherInstallSource", trimmed)


def _normalize_workspace_behavior(raw_value: object) -> LauncherWorkspaceBehavior:
    if not isinstance(raw_value, str):
        raise LauncherMetadataError("workspaceBehavior must be a string.")
    trimmed = raw_value.strip().lower().replace("-", "_")
    if trimmed not in {"last_used_or_prompt", "always_prompt"}:
        raise LauncherMetadataError(
            "workspaceBehavior must be either 'last_used_or_prompt' or 'always_prompt'."
        )
    return cast("LauncherWorkspaceBehavior", trimmed)


def _normalize_optional_workspace(raw_value: object) -> str | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, Path):
        return str(raw_value.expanduser().resolve(strict=False))
    if not isinstance(raw_value, str):
        raise LauncherMetadataError("lastUsedWorkspace must be a string when provided.")
    trimmed = raw_value.strip()
    if not trimmed:
        return None
    return str(Path(trimmed).expanduser().resolve(strict=False))


def _normalize_managed_artifacts(raw_value: object) -> dict[str, str]:
    if not isinstance(raw_value, dict):
        raise LauncherMetadataError("managedArtifacts must be an object.")
    normalized: dict[str, str] = {}
    for raw_name, raw_path in raw_value.items():
        if not isinstance(raw_name, str):
            raise LauncherMetadataError("managedArtifacts keys must be strings.")
        name = raw_name.strip()
        if not name:
            raise LauncherMetadataError("managedArtifacts keys must be non-empty.")
        if isinstance(raw_path, Path):
            path_value = raw_path
        elif isinstance(raw_path, str):
            trimmed = raw_path.strip()
            if not trimmed:
                raise LauncherMetadataError(
                    "managedArtifacts values must be non-empty paths."
                )
            path_value = Path(trimmed).expanduser()
        else:
            raise LauncherMetadataError("managedArtifacts values must be string paths.")
        normalized[name] = str(path_value.resolve(strict=False))
    return normalized
