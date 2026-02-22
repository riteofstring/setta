import json
import os
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
)
from setta.launcher_metadata import (
    LAUNCHER_WORKSPACE_BEHAVIOR,
    LauncherInstallMetadata,
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

_IN_APP_UPDATE_CHANNELS = {"manual", "uv-tool", "uv-tool-script"}
_INSTALLER_MANAGED_CHANNELS = {
    "linux-script",
    "macos-script",
    "windows-script",
}


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
            managed_artifacts={},
            existing_managed_artifacts=[],
            missing_managed_artifacts=[],
            update_capability="unsupported",
            update_guidance=(
                "Launcher is not installed. Run `setta launcher setup` first."
            ),
            metadata=None,
        )

    target_error = launcher_target_validation_error(metadata)
    existing_artifacts: list[str] = []
    missing_artifacts: list[str] = []
    for path_string in metadata.managedArtifacts.values():
        resolved_path = str(Path(path_string).resolve(strict=False))
        if Path(resolved_path).exists():
            existing_artifacts.append(resolved_path)
        else:
            missing_artifacts.append(resolved_path)

    update_capability, update_guidance = _resolve_update_capability(metadata.channel)

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
        managed_artifacts=dict(metadata.managedArtifacts),
        existing_managed_artifacts=existing_artifacts,
        missing_managed_artifacts=missing_artifacts,
        update_capability=update_capability,
        update_guidance=update_guidance,
        metadata=metadata,
    )


def setup_launcher_installation(
    *,
    setta_home: Path,
    channel: str,
    open_mode: LauncherOpenMode | None,
    workspace_behavior: LauncherWorkspaceBehavior | None,
    managed_artifacts: dict[str, str | Path] | None = None,
    target_command: list[str] | None = None,
    install_artifacts: bool = True,
    artifact_options: dict[str, str] | None = None,
) -> LauncherSetupResult:
    resolved_setta_home = setta_home.resolve(strict=False)

    try:
        existing_metadata = load_launcher_install_metadata(
            setta_home=resolved_setta_home
        )
    except LauncherMetadataError as exc:
        raise LauncherSetupError("LauncherMetadata", str(exc)) from exc

    merged_artifacts: dict[str, str | Path] = {}
    if existing_metadata is not None:
        merged_artifacts.update(existing_metadata.managedArtifacts)
    if managed_artifacts:
        merged_artifacts.update(managed_artifacts)

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

    normalized_artifact_options: dict[str, str] = {}
    if artifact_options:
        try:
            normalized_artifact_options = normalize_artifact_options(artifact_options)
        except LauncherArtifactError as exc:
            raise LauncherSetupError("BadRequest", str(exc)) from exc

    if install_artifacts:
        normalized_existing_artifacts = {
            name: str(Path(path).expanduser().resolve(strict=False))
            for name, path in merged_artifacts.items()
        }
        try:
            installed_artifacts = install_current_platform_artifacts(
                context=LauncherArtifactContext(
                    target_command=resolved_target_command,
                    channel=channel,
                    existing_managed_artifacts=normalized_existing_artifacts,
                    options=normalized_artifact_options,
                )
            )
        except LauncherArtifactError as exc:
            raise LauncherSetupError("ArtifactInstallFailed", str(exc)) from exc
        for key in current_platform_artifact_keys():
            merged_artifacts.pop(key, None)
        merged_artifacts.update(installed_artifacts)

    try:
        metadata = build_launcher_install_metadata(
            target_command=resolved_target_command,
            channel=channel,
            setta_version=__version__,
            open_mode=resolved_open_mode,
            workspace_behavior=resolved_workspace_behavior,
            last_used_workspace=existing_metadata.lastUsedWorkspace
            if existing_metadata is not None
            else None,
            managed_artifacts=merged_artifacts,
        )
        metadata_path = write_launcher_install_metadata(
            setta_home=resolved_setta_home,
            metadata=metadata,
        )
    except LauncherMetadataError as exc:
        raise LauncherSetupError("BadRequest", str(exc)) from exc

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
        managed_artifacts=_non_platform_managed_artifacts(metadata.managedArtifacts),
        install_artifacts=True,
        artifact_options=None,
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
    removal_errors: list[str] = []
    if metadata is not None:
        for path_string in metadata.managedArtifacts.values():
            path = Path(path_string).resolve(strict=False)
            if not path.exists():
                missing_paths.append(str(path))
                continue
            try:
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            except OSError as exc:
                removal_errors.append(f"{path}: {exc}")
                continue
            removed_paths.append(str(path))

    metadata_path = resolve_launcher_metadata_path(setta_home=resolved_setta_home)
    metadata_removed = remove_launcher_install_metadata(setta_home=resolved_setta_home)
    launcher_dir = resolve_launcher_dir(setta_home=resolved_setta_home)
    if launcher_dir.exists():
        try:
            launcher_dir.rmdir()
        except OSError:
            pass

    if removal_errors:
        raise LauncherSetupError("ArtifactRemovalFailed", "; ".join(removal_errors))

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
    for name, path in _non_platform_managed_artifacts(
        metadata.managedArtifacts
    ).items():
        setup_cmd.extend(["--managed-artifact", f"{name}={path}"])

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


def _resolve_update_capability(
    channel: str | None,
) -> tuple[LauncherUpdateCapability, str | None]:
    if channel is None:
        return (
            "unsupported",
            "Launcher channel is unknown. Re-run `setta launcher setup`.",
        )
    normalized = channel.strip().lower()
    if normalized in _IN_APP_UPDATE_CHANNELS:
        return ("in_app", None)
    if normalized.startswith("pip"):
        return (
            "installer_managed",
            "Upgrade Setta in the bound Python environment, then run `setta launcher setup`.",
        )
    if normalized in _INSTALLER_MANAGED_CHANNELS:
        return (
            "installer_managed",
            "This launcher is installer-managed. Re-run your platform installer to update.",
        )
    return (
        "unsupported",
        "In-app update is unavailable for this launcher channel.",
    )


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


def _non_platform_managed_artifacts(
    managed_artifacts: dict[str, str],
) -> dict[str, str]:
    platform_keys = current_platform_artifact_keys()
    return {
        name: value
        for name, value in managed_artifacts.items()
        if name not in platform_keys
    }
