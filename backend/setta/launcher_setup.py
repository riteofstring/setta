import json
import os
import secrets
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from setta import __version__
from setta.launcher_artifacts import (
    LauncherArtifactContext,
    LauncherArtifactError,
    current_platform_artifact_keys,
    install_current_platform_artifacts,
    normalize_artifact_options,
    plan_current_platform_artifact_paths,
)
from setta.launcher_metadata import (
    LAUNCHER_WORKSPACE_BEHAVIOR,
    LauncherInstallMetadata,
    LauncherInstallSource,
    LauncherMetadataError,
    LauncherOpenMode,
    LauncherWorkspaceBehavior,
    build_launcher_install_metadata,
    launcher_target_validation_error,
    load_launcher_install_metadata,
    remove_launcher_install_metadata,
    resolve_launcher_dir,
    resolve_launcher_metadata_path,
    write_launcher_install_metadata,
)

LauncherUpdateCapability = Literal["in_app", "installer_managed", "unsupported"]

_INSTALLER_MANAGED_CHANNELS = {
    "linux-script",
    "macos-script",
    "windows-script",
}
_ARTIFACT_OWNERSHIP_MARKER_BASENAME = ".setta-launcher-owned"


class LauncherSetupError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LauncherStatusSnapshot:
    setta_home: Path
    launcher_dir: Path
    metadata_path: Path
    installed: bool
    target_command: list[str] | None
    target_valid: bool | None
    target_error: str | None
    channel: str | None
    setta_version: str | None
    open_mode: LauncherOpenMode | None
    workspace_behavior: LauncherWorkspaceBehavior | None
    last_used_workspace: str | None
    artifact_options: dict[str, str]
    managed_artifacts: dict[str, str]
    existing_managed_artifacts: list[str]
    missing_managed_artifacts: list[str]
    update_capability: LauncherUpdateCapability
    update_guidance: str | None
    metadata: LauncherInstallMetadata | None

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "ok": True,
            "installed": self.installed,
            "settaHome": str(self.setta_home),
            "launcherDir": str(self.launcher_dir),
            "metadataPath": str(self.metadata_path),
            "artifactOptions": self.artifact_options,
            "managedArtifacts": self.managed_artifacts,
            "existingManagedArtifacts": self.existing_managed_artifacts,
            "missingManagedArtifacts": self.missing_managed_artifacts,
            "updateCapability": self.update_capability,
            "updateGuidance": self.update_guidance,
        }
        if self.target_command is not None:
            payload["targetCommand"] = self.target_command
        if self.target_valid is not None:
            payload["targetValid"] = self.target_valid
        if self.target_error is not None:
            payload["targetError"] = self.target_error
        if self.channel is not None:
            payload["channel"] = self.channel
        if self.setta_version is not None:
            payload["settaVersion"] = self.setta_version
        if self.open_mode is not None:
            payload["openMode"] = self.open_mode
        if self.workspace_behavior is not None:
            payload["workspaceBehavior"] = self.workspace_behavior
        if self.last_used_workspace is not None:
            payload["lastUsedWorkspace"] = self.last_used_workspace
        return payload


@dataclass(frozen=True)
class LauncherSetupResult:
    setta_home: Path
    metadata_path: Path
    launcher_dir: Path
    metadata: LauncherInstallMetadata

    def to_payload(self) -> dict[str, object]:
        return {
            "ok": True,
            "metadataPath": str(self.metadata_path),
            "launcherDir": str(self.launcher_dir),
            "targetCommand": self.metadata.targetCommand,
            "openMode": self.metadata.openMode,
            "workspaceBehavior": self.metadata.workspaceBehavior,
            "channel": self.metadata.channel,
            "settaVersion": self.metadata.settaVersion,
            "lastUsedWorkspace": self.metadata.lastUsedWorkspace,
            "artifactOptions": self.metadata.artifactOptions,
            "managedArtifacts": self.metadata.managedArtifacts,
            "settaHome": str(self.setta_home),
        }


@dataclass(frozen=True)
class LauncherRepairResult:
    setup: LauncherSetupResult
    status: LauncherStatusSnapshot

    def to_payload(self) -> dict[str, object]:
        payload = self.setup.to_payload()
        payload["status"] = self.status.to_payload()
        return payload


@dataclass(frozen=True)
class LauncherRemoveResult:
    setta_home: Path
    metadata_path: Path
    metadata_removed: bool
    removed_paths: list[str]
    missing_paths: list[str]

    def to_payload(self) -> dict[str, object]:
        return {
            "ok": True,
            "settaHome": str(self.setta_home),
            "metadataPath": str(self.metadata_path),
            "metadataRemoved": self.metadata_removed,
            "removedPaths": self.removed_paths,
            "missingPaths": self.missing_paths,
        }


@dataclass(frozen=True)
class LauncherUpdateResult:
    package_spec: str
    from_version: str | None
    to_version: str | None
    status: LauncherStatusSnapshot

    def to_payload(self) -> dict[str, object]:
        return {
            "ok": True,
            "packageSpec": self.package_spec,
            "fromVersion": self.from_version,
            "toVersion": self.to_version,
            "status": self.status.to_payload(),
        }


def resolve_launcher_target_command(*, executable: Path | None = None) -> list[str]:
    resolved_executable = executable or Path(sys.executable).resolve(strict=False)
    return [str(resolved_executable), "-m", "setta"]


def collect_launcher_status(*, setta_home: Path) -> LauncherStatusSnapshot:
    resolved_setta_home = setta_home.resolve(strict=False)
    launcher_dir = resolve_launcher_dir(setta_home=resolved_setta_home)
    metadata_path = resolve_launcher_metadata_path(setta_home=resolved_setta_home)

    try:
        metadata = load_launcher_install_metadata(setta_home=resolved_setta_home)
    except LauncherMetadataError as exc:
        raise LauncherSetupError("LauncherMetadata", str(exc)) from exc

    if metadata is None:
        return LauncherStatusSnapshot(
            setta_home=resolved_setta_home,
            launcher_dir=launcher_dir,
            metadata_path=metadata_path,
            installed=False,
            target_command=None,
            target_valid=None,
            target_error=None,
            channel=None,
            setta_version=None,
            open_mode=None,
            workspace_behavior=None,
            last_used_workspace=None,
            artifact_options={},
            managed_artifacts={},
            existing_managed_artifacts=[],
            missing_managed_artifacts=[],
            update_capability="unsupported",
            update_guidance=(
                "Launcher is not installed. Run `setta launcher setup` first."
            ),
            metadata=None,
        )

    normalized_managed_artifacts = _validate_managed_artifact_registry(
        managed_artifacts=metadata.managedArtifacts,
        setta_home=resolved_setta_home,
        error_code="LauncherMetadata",
    )

    target_error = launcher_target_validation_error(metadata)
    existing_artifacts: list[str] = []
    missing_artifacts: list[str] = []
    for path_string in normalized_managed_artifacts.values():
        resolved_path = str(Path(path_string).resolve(strict=False))
        if Path(resolved_path).exists():
            existing_artifacts.append(resolved_path)
        else:
            missing_artifacts.append(resolved_path)

    update_capability, update_guidance = _resolve_update_capability(
        metadata.installSource
    )

    return LauncherStatusSnapshot(
        setta_home=resolved_setta_home,
        launcher_dir=launcher_dir,
        metadata_path=metadata_path,
        installed=True,
        target_command=list(metadata.targetCommand),
        target_valid=target_error is None,
        target_error=target_error,
        channel=metadata.channel,
        setta_version=metadata.settaVersion,
        open_mode=metadata.openMode,
        workspace_behavior=metadata.workspaceBehavior,
        last_used_workspace=metadata.lastUsedWorkspace,
        artifact_options=dict(metadata.artifactOptions),
        managed_artifacts=dict(normalized_managed_artifacts),
        existing_managed_artifacts=existing_artifacts,
        missing_managed_artifacts=missing_artifacts,
        update_capability=update_capability,
        update_guidance=update_guidance,
        metadata=metadata,
    )


def setup_launcher_installation(
    *,
    setta_home: Path,
    channel: str | None,
    open_mode: LauncherOpenMode | None,
    workspace_behavior: LauncherWorkspaceBehavior | None,
    target_command: list[str] | None = None,
    install_artifacts: bool | None = True,
    artifact_options: dict[str, str] | None = None,
) -> LauncherSetupResult:
    resolved_setta_home = setta_home.resolve(strict=False)

    try:
        existing_metadata = load_launcher_install_metadata(
            setta_home=resolved_setta_home
        )
    except LauncherMetadataError as exc:
        raise LauncherSetupError("LauncherMetadata", str(exc)) from exc

    resolved_channel: str
    if channel is not None:
        resolved_channel = channel.strip()
        if not resolved_channel:
            raise LauncherSetupError("BadRequest", "channel must be non-empty.")
    elif existing_metadata is not None:
        resolved_channel = existing_metadata.channel
    else:
        resolved_channel = "manual"

    resolved_open_mode: LauncherOpenMode
    if open_mode is not None:
        resolved_open_mode = open_mode
    elif existing_metadata is not None:
        resolved_open_mode = existing_metadata.openMode
    else:
        resolved_open_mode = "chrome-app"

    resolved_workspace_behavior: LauncherWorkspaceBehavior
    if workspace_behavior is not None:
        resolved_workspace_behavior = workspace_behavior
    elif existing_metadata is not None:
        resolved_workspace_behavior = existing_metadata.workspaceBehavior
    else:
        resolved_workspace_behavior = LAUNCHER_WORKSPACE_BEHAVIOR

    if target_command is None:
        resolved_target_command = resolve_launcher_target_command()
    else:
        resolved_target_command = target_command

    install_source = _derive_install_source(resolved_channel)
    resolved_install_artifacts: bool
    if install_artifacts is None:
        if existing_metadata is None:
            resolved_install_artifacts = True
        else:
            resolved_install_artifacts = bool(existing_metadata.managedArtifacts)
    else:
        resolved_install_artifacts = install_artifacts

    normalized_artifact_options: dict[str, str]
    if artifact_options is not None:
        try:
            normalized_artifact_options = normalize_artifact_options(artifact_options)
        except LauncherArtifactError as exc:
            raise LauncherSetupError("BadRequest", str(exc)) from exc
    elif existing_metadata is not None:
        normalized_artifact_options = dict(existing_metadata.artifactOptions)
    else:
        normalized_artifact_options = {}
    _validate_artifact_option_paths(
        options=normalized_artifact_options,
        setta_home=resolved_setta_home,
    )

    merged_artifacts: dict[str, str] = {}
    previous_managed_artifacts: dict[str, str] = {}
    removal_candidates: dict[str, str] = {}
    metadata_cleanup_candidates: dict[str, str] = {}
    ownership_token = (
        existing_metadata.artifactOwnershipToken
        if existing_metadata is not None
        else secrets.token_hex(16)
    )
    if existing_metadata is not None:
        previous_managed_artifacts = _validate_managed_artifact_registry(
            managed_artifacts=existing_metadata.managedArtifacts,
            setta_home=resolved_setta_home,
            error_code="LauncherMetadata",
        )
        merged_artifacts.update(previous_managed_artifacts)

    if resolved_install_artifacts:
        artifact_context = LauncherArtifactContext(
            target_command=resolved_target_command,
            channel=resolved_channel,
            existing_managed_artifacts=merged_artifacts,
            options=normalized_artifact_options,
        )
        try:
            planned_artifact_paths = plan_current_platform_artifact_paths(
                context=artifact_context
            )
        except LauncherArtifactError as exc:
            raise LauncherSetupError("BadRequest", str(exc)) from exc
        _validate_planned_artifact_paths(
            artifact_paths=planned_artifact_paths,
            setta_home=resolved_setta_home,
        )
        desired_artifacts = {
            key: str(path.resolve(strict=False))
            for key, path in planned_artifact_paths.items()
        }
        removal_candidates = _compute_replaced_or_removed_artifacts(
            existing_managed_artifacts=previous_managed_artifacts,
            desired_managed_artifacts=desired_artifacts,
        )
        removal_validation_errors = _validate_owned_artifacts_before_removal(
            managed_artifacts=removal_candidates,
            ownership_token=ownership_token,
        )
        if removal_validation_errors:
            raise LauncherSetupError(
                "ArtifactRemovalFailed",
                "; ".join(removal_validation_errors),
            )
        try:
            installed_artifacts = install_current_platform_artifacts(
                context=artifact_context
            )
        except (LauncherArtifactError, OSError, shutil.Error) as exc:
            raise LauncherSetupError("ArtifactInstallFailed", str(exc)) from exc
        merged_artifacts = _validate_managed_artifact_registry(
            managed_artifacts=installed_artifacts,
            setta_home=resolved_setta_home,
            error_code="ArtifactInstallFailed",
        )
        metadata_cleanup_candidates = _compute_new_or_replaced_artifacts(
            existing_managed_artifacts=previous_managed_artifacts,
            next_managed_artifacts=merged_artifacts,
        )
        try:
            _write_artifact_ownership_markers(
                managed_artifacts=merged_artifacts,
                ownership_token=ownership_token,
            )
        except LauncherSetupError:
            _cleanup_artifacts_after_failed_metadata_write(
                managed_artifacts=metadata_cleanup_candidates
            )
            raise

    try:
        metadata = build_launcher_install_metadata(
            target_command=resolved_target_command,
            channel=resolved_channel,
            install_source=install_source,
            artifact_ownership_token=ownership_token,
            setta_version=__version__,
            open_mode=resolved_open_mode,
            workspace_behavior=resolved_workspace_behavior,
            last_used_workspace=existing_metadata.lastUsedWorkspace
            if existing_metadata is not None
            else None,
            artifact_options=normalized_artifact_options,
            managed_artifacts=merged_artifacts,
        )
        metadata_path = write_launcher_install_metadata(
            setta_home=resolved_setta_home,
            metadata=metadata,
        )
    except LauncherMetadataError as exc:
        _cleanup_artifacts_after_failed_metadata_write(
            managed_artifacts=metadata_cleanup_candidates
        )
        raise LauncherSetupError("BadRequest", str(exc)) from exc
    except OSError as exc:
        _cleanup_artifacts_after_failed_metadata_write(
            managed_artifacts=metadata_cleanup_candidates
        )
        raise LauncherSetupError(
            "LauncherMetadata",
            f"Failed to write launcher metadata: {exc}",
        ) from exc

    if removal_candidates:
        removal_result = _remove_owned_artifacts(
            managed_artifacts=removal_candidates,
            ownership_token=ownership_token,
        )
        if removal_result.errors:
            raise LauncherSetupError(
                "ArtifactRemovalFailed",
                "; ".join(removal_result.errors),
            )

    return LauncherSetupResult(
        setta_home=resolved_setta_home,
        metadata_path=metadata_path,
        launcher_dir=resolve_launcher_dir(setta_home=resolved_setta_home),
        metadata=metadata,
    )


def repair_launcher_installation(
    *,
    setta_home: Path,
) -> LauncherRepairResult:
    status = collect_launcher_status(setta_home=setta_home)
    if not status.installed or status.metadata is None:
        raise LauncherSetupError(
            "LauncherNotInstalled",
            "Launcher is not installed. Run `setta launcher setup` first.",
        )

    metadata = status.metadata
    setup_result = setup_launcher_installation(
        setta_home=setta_home,
        channel=metadata.channel,
        open_mode=metadata.openMode,
        workspace_behavior=metadata.workspaceBehavior,
        install_artifacts=bool(metadata.managedArtifacts),
        artifact_options=dict(metadata.artifactOptions),
    )
    repaired_status = collect_launcher_status(setta_home=setta_home)
    return LauncherRepairResult(setup=setup_result, status=repaired_status)


def remove_launcher_installation(
    *,
    setta_home: Path,
) -> LauncherRemoveResult:
    resolved_setta_home = setta_home.resolve(strict=False)
    try:
        metadata = load_launcher_install_metadata(setta_home=resolved_setta_home)
    except LauncherMetadataError as exc:
        raise LauncherSetupError("LauncherMetadata", str(exc)) from exc

    removed_paths: list[str] = []
    missing_paths: list[str] = []
    normalized_artifacts: dict[str, str] = {}
    if metadata is not None:
        normalized_artifacts = _validate_managed_artifact_registry(
            managed_artifacts=metadata.managedArtifacts,
            setta_home=resolved_setta_home,
            error_code="LauncherMetadata",
        )
        removal_result = _remove_owned_artifacts(
            managed_artifacts=normalized_artifacts,
            ownership_token=metadata.artifactOwnershipToken,
        )
        removed_paths.extend(removal_result.removed_paths)
        missing_paths.extend(removal_result.missing_paths)
        if removal_result.errors:
            raise LauncherSetupError(
                "ArtifactRemovalFailed",
                "; ".join(removal_result.errors),
            )

    metadata_path = resolve_launcher_metadata_path(setta_home=resolved_setta_home)
    metadata_removed = remove_launcher_install_metadata(setta_home=resolved_setta_home)
    launcher_dir = resolve_launcher_dir(setta_home=resolved_setta_home)
    if launcher_dir.exists():
        try:
            launcher_dir.rmdir()
        except OSError:
            pass

    return LauncherRemoveResult(
        setta_home=resolved_setta_home,
        metadata_path=metadata_path,
        metadata_removed=metadata_removed,
        removed_paths=removed_paths,
        missing_paths=missing_paths,
    )


def update_launcher_installation(
    *,
    setta_home: Path,
    package_spec: str = "setta",
) -> LauncherUpdateResult:
    status = collect_launcher_status(setta_home=setta_home)
    if not status.installed or status.metadata is None:
        raise LauncherSetupError(
            "LauncherNotInstalled",
            "Launcher is not installed. Run `setta launcher setup` first.",
        )
    if status.update_capability != "in_app":
        guidance = status.update_guidance or "In-app launcher update is unavailable."
        raise LauncherSetupError("UpdateUnavailable", guidance)

    normalized_package_spec = package_spec.strip()
    if not normalized_package_spec:
        raise LauncherSetupError("BadRequest", "package spec must be non-empty.")

    uv_bin = shutil.which("uv")
    if uv_bin is None:
        raise LauncherSetupError(
            "MissingDependency",
            "uv is required for in-app update but was not found on PATH.",
        )

    install_result = subprocess.run(
        [uv_bin, "tool", "install", "--upgrade", normalized_package_spec],
        check=False,
        capture_output=True,
        text=True,
    )
    if install_result.returncode != 0:
        raise LauncherSetupError(
            "UpdateFailed",
            f"uv tool install --upgrade failed: {_format_subprocess_error(install_result)}",
        )

    dir_result = subprocess.run(
        [uv_bin, "tool", "dir", "--bin"],
        check=False,
        capture_output=True,
        text=True,
    )
    if dir_result.returncode != 0:
        raise LauncherSetupError(
            "UpdateFailed",
            f"uv tool dir --bin failed: {_format_subprocess_error(dir_result)}",
        )
    uv_tool_bin_dir = Path(dir_result.stdout.strip()).expanduser().resolve(strict=False)
    setta_executable = _resolve_setta_executable(uv_tool_bin_dir)
    if setta_executable is None:
        raise LauncherSetupError(
            "UpdateFailed",
            f"Could not find Setta executable under {uv_tool_bin_dir}.",
        )

    metadata = status.metadata
    workspace_behavior_cli = metadata.workspaceBehavior.replace("_", "-")
    setup_cmd = [
        str(setta_executable),
        "--setta-home",
        str(Path(setta_home).resolve(strict=False)),
        "launcher",
        "setup",
        "--json",
        "--channel",
        metadata.channel,
        "--open-mode",
        metadata.openMode,
        "--workspace-behavior",
        workspace_behavior_cli,
    ]
    if not metadata.managedArtifacts:
        setup_cmd.append("--no-install-artifacts")
    for option_key in sorted(metadata.artifactOptions):
        option_value = metadata.artifactOptions[option_key]
        setup_cmd.extend(["--artifact-option", f"{option_key}={option_value}"])

    setup_result = subprocess.run(
        setup_cmd,
        check=False,
        capture_output=True,
        text=True,
    )
    if setup_result.returncode != 0:
        raise LauncherSetupError(
            "UpdateFailed",
            f"launcher setup failed after update: {_format_subprocess_error(setup_result)}",
        )
    try:
        setup_payload = json.loads(setup_result.stdout)
    except json.JSONDecodeError as exc:
        raise LauncherSetupError(
            "UpdateFailed",
            "launcher setup returned invalid JSON after update.",
        ) from exc
    if not isinstance(setup_payload, dict) or setup_payload.get("ok") is not True:
        message = "launcher setup returned a failed payload after update."
        raw_error = (
            setup_payload.get("error") if isinstance(setup_payload, dict) else None
        )
        if isinstance(raw_error, dict) and isinstance(raw_error.get("message"), str):
            message = raw_error["message"]
        raise LauncherSetupError("UpdateFailed", message)

    next_status = collect_launcher_status(setta_home=setta_home)
    return LauncherUpdateResult(
        package_spec=normalized_package_spec,
        from_version=metadata.settaVersion,
        to_version=next_status.setta_version or metadata.settaVersion,
        status=next_status,
    )


def _derive_install_source(channel: str) -> LauncherInstallSource:
    normalized = channel.strip().lower()
    if normalized in {"uv-tool", "uv-tool-script"}:
        return "uv_tool"
    if normalized.startswith("pip") or normalized in _INSTALLER_MANAGED_CHANNELS:
        return "installer_managed"
    return "unsupported"


def _resolve_update_capability(
    install_source: LauncherInstallSource,
) -> tuple[LauncherUpdateCapability, str | None]:
    if install_source == "uv_tool":
        return ("in_app", None)
    if install_source == "installer_managed":
        return (
            "installer_managed",
            "This launcher is installer-managed. Upgrade via installer/environment, then run `setta launcher setup`.",
        )
    return (
        "unsupported",
        "In-app update is unavailable for this launcher installation source.",
    )


def _validate_managed_artifact_registry(
    *,
    managed_artifacts: dict[str, str],
    setta_home: Path,
    error_code: str,
) -> dict[str, str]:
    allowed_keys = current_platform_artifact_keys()
    normalized: dict[str, str] = {}
    for name, raw_path in managed_artifacts.items():
        if name not in allowed_keys:
            raise LauncherSetupError(
                error_code,
                f"Unsupported managed artifact key for this platform: {name}",
            )
        resolved_path = Path(raw_path).expanduser().resolve(strict=False)
        _validate_path_within_trusted_roots(
            path=resolved_path,
            setta_home=setta_home,
            error_code=error_code,
            allow_root_match=False,
        )
        normalized[name] = str(resolved_path)
    _validate_unique_artifact_paths(
        artifact_paths=normalized,
        error_code=error_code,
    )
    return normalized


def _validate_artifact_option_paths(
    *, options: dict[str, str], setta_home: Path
) -> None:
    for option_key in _artifact_write_path_option_keys():
        raw_path = options.get(option_key)
        if raw_path is None:
            continue
        allow_root_match = option_key == "applications_dir"
        resolved_path = Path(raw_path).expanduser().resolve(strict=False)
        _validate_path_within_trusted_roots(
            path=resolved_path,
            setta_home=setta_home,
            error_code="BadRequest",
            allow_root_match=allow_root_match,
        )


def _validate_planned_artifact_paths(
    *,
    artifact_paths: dict[str, Path],
    setta_home: Path,
) -> None:
    normalized_paths = {
        key: path.resolve(strict=False) for key, path in artifact_paths.items()
    }
    _validate_unique_artifact_paths(
        artifact_paths=normalized_paths,
        error_code="BadRequest",
    )
    for path in normalized_paths.values():
        _validate_path_within_trusted_roots(
            path=path,
            setta_home=setta_home,
            error_code="BadRequest",
            allow_root_match=False,
        )


@dataclass(frozen=True)
class _ArtifactRemovalResult:
    removed_paths: list[str]
    missing_paths: list[str]
    errors: list[str]


def _compute_replaced_or_removed_artifacts(
    *,
    existing_managed_artifacts: dict[str, str],
    desired_managed_artifacts: dict[str, str],
) -> dict[str, str]:
    removed_or_replaced: dict[str, str] = {}
    for key, existing_path in existing_managed_artifacts.items():
        resolved_existing = str(Path(existing_path).resolve(strict=False))
        desired_path = desired_managed_artifacts.get(key)
        if desired_path is None:
            removed_or_replaced[key] = resolved_existing
            continue
        resolved_desired = Path(desired_path).resolve(strict=False)
        if Path(resolved_existing) != resolved_desired:
            removed_or_replaced[key] = resolved_existing
    return removed_or_replaced


def _compute_new_or_replaced_artifacts(
    *,
    existing_managed_artifacts: dict[str, str],
    next_managed_artifacts: dict[str, str],
) -> dict[str, str]:
    cleanup_targets: dict[str, str] = {}
    for key, next_path in next_managed_artifacts.items():
        resolved_next = Path(next_path).resolve(strict=False)
        existing_path = existing_managed_artifacts.get(key)
        if existing_path is None:
            cleanup_targets[key] = str(resolved_next)
            continue
        resolved_existing = Path(existing_path).resolve(strict=False)
        if resolved_existing != resolved_next:
            cleanup_targets[key] = str(resolved_next)
    return cleanup_targets


def _validate_owned_artifacts_before_removal(
    *,
    managed_artifacts: dict[str, str],
    ownership_token: str,
) -> list[str]:
    marker_errors: list[str] = []
    for name, path_string in managed_artifacts.items():
        artifact_path = Path(path_string).resolve(strict=False)
        if not artifact_path.exists():
            continue
        marker_error = _artifact_ownership_marker_error(
            artifact_name=name,
            artifact_path=artifact_path,
            ownership_token=ownership_token,
        )
        if marker_error is not None:
            marker_errors.append(marker_error)
    return marker_errors


def _remove_owned_artifacts(
    *,
    managed_artifacts: dict[str, str],
    ownership_token: str,
) -> _ArtifactRemovalResult:
    removed_paths: list[str] = []
    missing_paths: list[str] = []
    removal_errors: list[str] = []
    for name, path_string in managed_artifacts.items():
        artifact_path = Path(path_string).resolve(strict=False)
        if not artifact_path.exists():
            missing_paths.append(str(artifact_path))
            continue
        marker_error = _artifact_ownership_marker_error(
            artifact_name=name,
            artifact_path=artifact_path,
            ownership_token=ownership_token,
        )
        if marker_error is not None:
            removal_errors.append(marker_error)
            continue
        try:
            _remove_artifact_and_marker(artifact_path)
        except OSError as exc:
            removal_errors.append(f"{artifact_path}: {exc}")
            continue
        removed_paths.append(str(artifact_path))
    return _ArtifactRemovalResult(
        removed_paths=removed_paths,
        missing_paths=missing_paths,
        errors=removal_errors,
    )


def _cleanup_artifacts_after_failed_metadata_write(
    *,
    managed_artifacts: dict[str, str],
) -> None:
    for path_string in managed_artifacts.values():
        artifact_path = Path(path_string).resolve(strict=False)
        if not artifact_path.exists():
            marker_path = _artifact_ownership_marker_path(artifact_path)
            try:
                if marker_path.exists():
                    marker_path.unlink()
            except OSError:
                pass
            continue
        try:
            _remove_artifact_and_marker(artifact_path)
        except OSError:
            continue


def _remove_artifact_and_marker(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
        return
    path.unlink()
    marker_path = _artifact_ownership_marker_path(path)
    if marker_path.exists():
        marker_path.unlink()


def _validate_unique_artifact_paths(
    *,
    artifact_paths: dict[str, str] | dict[str, Path],
    error_code: str,
) -> None:
    path_to_keys: dict[Path, list[str]] = {}
    for key, raw_path in artifact_paths.items():
        if isinstance(raw_path, Path):
            resolved_path = raw_path.resolve(strict=False)
        else:
            resolved_path = Path(raw_path).expanduser().resolve(strict=False)
        if resolved_path not in path_to_keys:
            path_to_keys[resolved_path] = []
        path_to_keys[resolved_path].append(key)

    collisions = {path: keys for path, keys in path_to_keys.items() if len(keys) > 1}
    if not collisions:
        return

    conflict_details = "; ".join(
        f"{path}: {', '.join(sorted(keys))}"
        for path, keys in sorted(collisions.items(), key=lambda item: str(item[0]))
    )
    raise LauncherSetupError(
        error_code,
        "Launcher artifact paths must be unique per artifact key. "
        f"Conflicts: {conflict_details}",
    )


def _artifact_write_path_option_keys() -> set[str]:
    if sys.platform == "darwin":
        return {"app_path"}
    if os.name == "nt":
        return {
            "wrapper_path",
            "start_menu_shortcut_path",
            "desktop_shortcut_path",
        }
    return {
        "applications_dir",
        "wrapper_path",
        "desktop_shortcut_path",
    }


def _validate_path_within_trusted_roots(
    *,
    path: Path,
    setta_home: Path,
    error_code: str,
    allow_root_match: bool,
) -> None:
    trusted_roots = _trusted_artifact_roots(setta_home=setta_home)
    if not any(path == root or path.is_relative_to(root) for root in trusted_roots):
        raise LauncherSetupError(
            error_code,
            f"Launcher artifact path is outside trusted roots: {path}",
        )

    if allow_root_match:
        return

    dangerous_paths = {
        Path(path.anchor).resolve(strict=False),
        Path.home().resolve(strict=False),
        setta_home.resolve(strict=False),
    }
    dangerous_paths.update(trusted_roots)
    if path in dangerous_paths:
        raise LauncherSetupError(
            error_code,
            f"Launcher artifact path resolves to a protected root: {path}",
        )


def _trusted_artifact_roots(*, setta_home: Path) -> set[Path]:
    home = Path.home().resolve(strict=False)
    roots: set[Path] = {resolve_launcher_dir(setta_home=setta_home)}
    if sys.platform == "darwin":
        roots.add((home / "Applications").resolve(strict=False))
        return roots
    if os.name == "nt":
        local_app_data_root = _resolve_windows_env_path(
            env_var_name="LOCALAPPDATA",
            fallback=home / "AppData" / "Local",
        )
        app_data_root = _resolve_windows_env_path(
            env_var_name="APPDATA",
            fallback=home / "AppData" / "Roaming",
        )
        user_profile_root = _resolve_windows_env_path(
            env_var_name="USERPROFILE",
            fallback=home,
        )
        roots.add((local_app_data_root / "Setta").resolve(strict=False))
        roots.add(
            (
                app_data_root / "Microsoft" / "Windows" / "Start Menu" / "Programs"
            ).resolve(strict=False)
        )
        roots.add((user_profile_root / "Desktop").resolve(strict=False))
        return roots
    roots.add((home / ".local" / "share" / "applications").resolve(strict=False))
    roots.add((home / ".local" / "share" / "setta").resolve(strict=False))
    roots.add((home / "Desktop").resolve(strict=False))
    return roots


def _resolve_windows_env_path(*, env_var_name: str, fallback: Path) -> Path:
    raw_value = os.environ.get(env_var_name)
    if raw_value is not None:
        trimmed_value = raw_value.strip()
        if trimmed_value:
            return Path(trimmed_value).expanduser().resolve(strict=False)
    return fallback.resolve(strict=False)


def _write_artifact_ownership_markers(
    *,
    managed_artifacts: dict[str, str],
    ownership_token: str,
) -> None:
    for name, path_string in managed_artifacts.items():
        path = Path(path_string)
        if not path.exists():
            raise LauncherSetupError(
                "ArtifactInstallFailed",
                f"Managed artifact does not exist after setup: {path}",
            )
        marker_path = _artifact_ownership_marker_path(path)
        marker_payload = _artifact_ownership_marker_contents(
            artifact_name=name,
            ownership_token=ownership_token,
        )
        try:
            marker_path.parent.mkdir(parents=True, exist_ok=True)
            marker_path.write_text(marker_payload, encoding="utf-8")
        except OSError as exc:
            raise LauncherSetupError(
                "ArtifactInstallFailed",
                f"Failed to write launcher ownership marker for {path}: {exc}",
            ) from exc


def _artifact_ownership_marker_contents(
    *,
    artifact_name: str,
    ownership_token: str,
) -> str:
    return f"{artifact_name}:{ownership_token}\n"


def _artifact_ownership_marker_path(artifact_path: Path) -> Path:
    if artifact_path.is_dir() and not artifact_path.is_symlink():
        return artifact_path / _ARTIFACT_OWNERSHIP_MARKER_BASENAME
    return (
        artifact_path.parent
        / f".{artifact_path.name}{_ARTIFACT_OWNERSHIP_MARKER_BASENAME}"
    )


def _artifact_ownership_marker_error(
    *,
    artifact_name: str,
    artifact_path: Path,
    ownership_token: str,
) -> str | None:
    marker_path = _artifact_ownership_marker_path(artifact_path)
    if not marker_path.exists():
        return f"{artifact_path}: missing launcher ownership marker"
    try:
        marker_payload = marker_path.read_text(encoding="utf-8")
    except OSError as exc:
        return f"{artifact_path}: failed to read launcher ownership marker ({exc})"
    expected_payload = _artifact_ownership_marker_contents(
        artifact_name=artifact_name,
        ownership_token=ownership_token,
    )
    if marker_payload != expected_payload:
        return f"{artifact_path}: launcher ownership marker did not match expected identity"
    return None


def _format_subprocess_error(result: subprocess.CompletedProcess[str]) -> str:
    stderr = (result.stderr or "").strip()
    if stderr:
        return stderr
    stdout = (result.stdout or "").strip()
    if stdout:
        return stdout
    return f"process exited with status {result.returncode}"


def _resolve_setta_executable(uv_tool_bin_dir: Path) -> Path | None:
    candidates = [uv_tool_bin_dir / "setta"]
    if os.name == "nt":
        candidates.insert(0, uv_tool_bin_dir / "setta.exe")

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate.resolve(strict=False)
    return None
