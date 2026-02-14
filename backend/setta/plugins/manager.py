import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from jsonschema import ValidationError as JSONSchemaValidationError
from jsonschema import validate as jsonschema_validate
from packaging.specifiers import InvalidSpecifier, SpecifierSet
from packaging.version import InvalidVersion, Version
from pydantic import ValidationError

from setta.plugins.errors import PluginManagerError
from setta.plugins.models import (
    PLUGIN_CAPABILITIES_SET,
    PLUGIN_MANIFEST_SCHEMA_VERSION,
    BlockedCapabilityReason,
    PluginBlockedCapability,
    PluginConfigDescriptor,
    PluginConfigWriteResponse,
    PluginContentDescriptor,
    PluginEnableDisableResponse,
    PluginErrorInfo,
    PluginFrontendDescriptor,
    PluginInstallHistoryEntry,
    PluginInstallMetadataEntry,
    PluginInstallMetadataFile,
    PluginInstallResponse,
    PluginListEntry,
    PluginListResponse,
    PluginLockApplyResponse,
    PluginLockEntry,
    PluginLockWriteResponse,
    PluginManifest,
    PluginRestartCapability,
    PluginRollbackResponse,
    PluginRuntimeState,
    PluginScope,
    PluginsGlobalStateFile,
    PluginsLockFile,
    PluginSourceScheme,
    PluginsRescanResponse,
    PluginsStateFile,
    PluginStatusEntry,
    PluginStatusResponse,
    PluginUninstallResponse,
    PluginUpdateResponse,
    normalize_scope,
    scope_label,
)

_SCOPE_ORDER = {
    PluginScope.workspace: 0,
    PluginScope.setta_files: 1,
    PluginScope.global_scope: 2,
}

_MODE_ALLOWED_CAPABILITIES = {
    "ide": PLUGIN_CAPABILITIES_SET,
    "share": frozenset(
        {
            "registerSectionKinds",
            "registerPane",
            "registerCommand",
            "registerToolbarItem",
            "registerContextMenu",
            "registerSettingsPanel",
        }
    ),
    "app": frozenset(
        {
            "registerSectionKinds",
            "registerPane",
            "registerCommand",
            "registerToolbarItem",
            "registerContextMenu",
            "registerSettingsPanel",
        }
    ),
}


@dataclass(slots=True, frozen=True)
class ParsedSourceSpec:
    scheme: PluginSourceScheme
    raw: str
    canonical_source_key: str
    owner: str | None = None
    repo: str | None = None
    ref: str | None = None
    package: str | None = None
    version: str | None = None


@dataclass(slots=True)
class CandidatePlugin:
    root: Path
    manifest: PluginManifest
    canonical_source_key: str
    source_spec: str
    source_digest_sha256: str

    @property
    def components(self) -> list[str]:
        components: list[str] = []
        if self.manifest.backend is not None:
            components.append("backend")
        if self.manifest.frontend is not None:
            components.append("frontend")
        if self.manifest.content is not None:
            components.append("content")
        return components


@dataclass(slots=True)
class DiscoveredPlugin:
    plugin_id: str
    name: str
    version: str
    scope: PluginScope
    source_path: Path
    manifest: PluginManifest | None
    canonical_source_key: str
    source_digest_sha256: str | None
    errors: list[PluginErrorInfo] = field(default_factory=list)
    state: PluginRuntimeState = PluginRuntimeState.invalid
    shadowed_by_source_path: Path | None = None
    requested_capabilities: list[str] = field(default_factory=list)
    effective_capabilities: list[str] = field(default_factory=list)
    blocked_capabilities: list[PluginBlockedCapability] = field(default_factory=list)
    restart_required: bool = False

    @property
    def has_backend(self) -> bool:
        return self.manifest is not None and self.manifest.backend is not None

    @property
    def has_frontend(self) -> bool:
        return self.manifest is not None and self.manifest.frontend is not None

    @property
    def has_content(self) -> bool:
        return self.manifest is not None and self.manifest.content is not None


class PluginManager:
    def __init__(
        self,
        *,
        workspace_root: Path,
        setta_files_root: Path,
        setta_home: Path,
        server_mode: Literal["ide", "share", "app"],
        setta_version: str,
        restart_command: str | None = None,
    ) -> None:
        self.workspace_root = workspace_root
        self.setta_files_root = setta_files_root
        self.setta_home = setta_home
        self.server_mode = server_mode
        self.setta_version = setta_version
        self._restart_command = restart_command or "setta"

        self._manifest_schema_path = (
            Path(__file__).resolve().parent / "schemas" / "setta.plugin.schema.json"
        )
        self._manifest_schema = self._load_manifest_schema()

        self._plugins_state_path = self.setta_files_root / "plugins_state.json"
        self._plugins_global_state_path = self.setta_home / "plugins_global_state.json"
        self._install_metadata_path = (
            self.setta_files_root / "plugins_install_metadata.json"
        )
        self._history_root = self.setta_files_root / "plugins_history"
        self._lockfile_path = self.workspace_root / "plugins" / "plugins.lock.json"

        self._pending_restart_backend_ids: set[str] = set()
        self._discovered_plugins: list[DiscoveredPlugin] = []
        self._active_plugin_by_id: dict[str, DiscoveredPlugin] = {}

        self.rescan()

    def rescan(self) -> PluginsRescanResponse:
        discovered = self._discover_plugins()
        self._discovered_plugins = discovered
        self._active_plugin_by_id = {
            entry.plugin_id: entry
            for entry in discovered
            if entry.state
            in {PluginRuntimeState.active, PluginRuntimeState.pending_restart}
        }
        installed_count = len(
            [
                entry
                for entry in discovered
                if entry.state
                in {
                    PluginRuntimeState.active,
                    PluginRuntimeState.pending_restart,
                    PluginRuntimeState.disabled,
                    PluginRuntimeState.invalid,
                }
                and entry.shadowed_by_source_path is None
            ]
        )
        active_count = len(
            [
                entry
                for entry in discovered
                if entry.state
                in {PluginRuntimeState.active, PluginRuntimeState.pending_restart}
            ]
        )
        return PluginsRescanResponse(
            serverMode=self.server_mode,
            installedPlugins=installed_count,
            activePlugins=active_count,
        )

    def get_list_response(self) -> PluginListResponse:
        plugins: list[PluginListEntry] = []
        for entry in sorted(
            self._active_plugin_by_id.values(), key=lambda item: item.plugin_id
        ):
            if entry.manifest is None:
                continue
            frontend = PluginFrontendDescriptor(
                entrypointUrl=self._build_plugin_asset_url(
                    entry,
                    entry.manifest.frontend.entrypoint,
                )
                if entry.manifest.frontend is not None
                else None,
                styleUrl=self._build_plugin_asset_url(
                    entry,
                    entry.manifest.frontend.style,
                )
                if entry.manifest is not None
                and entry.manifest.frontend is not None
                and entry.manifest.frontend.style
                else None,
            )
            content = self._build_content_descriptor(entry)
            config = self._build_config_descriptor(entry)
            plugins.append(
                PluginListEntry(
                    pluginId=entry.plugin_id,
                    name=entry.name,
                    version=entry.version,
                    sourceScope=entry.scope,
                    sourceScopeLabel=scope_label(entry.scope),
                    canonicalSourceKey=entry.canonical_source_key,
                    sourceDigestSha256=entry.source_digest_sha256,
                    frontend=frontend,
                    content=content,
                    config=config,
                    effectiveCapabilities=entry.effective_capabilities,
                    restartRequired=entry.restart_required,
                )
            )
        return PluginListResponse(
            serverMode=self.server_mode,
            restartCapability=self.get_restart_capability(),
            plugins=plugins,
        )

    def get_status_response(self) -> PluginStatusResponse:
        ordered = sorted(
            self._discovered_plugins,
            key=lambda entry: (
                entry.plugin_id,
                _SCOPE_ORDER[entry.scope],
                str(entry.source_path),
            ),
        )
        return PluginStatusResponse(
            serverMode=self.server_mode,
            restartCapability=self.get_restart_capability(),
            plugins=[
                PluginStatusEntry(
                    pluginId=entry.plugin_id,
                    name=entry.name,
                    version=entry.version,
                    state=entry.state,
                    sourceScope=entry.scope,
                    sourceScopeLabel=scope_label(entry.scope),
                    sourcePath=str(entry.source_path),
                    canonicalSourceKey=entry.canonical_source_key,
                    sourceDigestSha256=entry.source_digest_sha256,
                    shadowedBySourcePath=(
                        str(entry.shadowed_by_source_path)
                        if entry.shadowed_by_source_path is not None
                        else None
                    ),
                    requestedCapabilities=entry.requested_capabilities,
                    effectiveCapabilities=entry.effective_capabilities,
                    blockedCapabilities=entry.blocked_capabilities,
                    restartRequired=entry.restart_required,
                    errors=entry.errors,
                )
                for entry in ordered
            ],
        )

    def get_restart_capability(self) -> PluginRestartCapability:
        return PluginRestartCapability(
            mode="manual",
            command=self._restart_command,
            reason="Programmatic restart is not available in this runtime.",
        )

    def restart_backend(self) -> dict[str, Any]:
        capability = self.get_restart_capability()
        return {
            "accepted": False,
            "mode": capability.mode,
            "command": capability.command,
            "reason": capability.reason,
        }

    def resolve_plugin_asset_path(self, plugin_id: str, asset_path: str) -> Path:
        entry = self._active_plugin_by_id.get(plugin_id)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not active: {plugin_id}",
                status_code=404,
            )
        resolved = self._resolve_relative_path(
            entry.source_path,
            asset_path,
            code="PLUGIN_ASSET_INVALID_PATH",
            message_prefix="Invalid plugin asset path",
        )
        if not resolved.exists() or not resolved.is_file():
            raise PluginManagerError(
                "PLUGIN_ASSET_NOT_FOUND",
                f"Plugin asset not found: {asset_path}",
                status_code=404,
            )
        return resolved

    def install_plugin(
        self,
        *,
        source_spec: str,
        scope: str | PluginScope | None = None,
        enable: bool = True,
        force: bool = False,
    ) -> PluginInstallResponse:
        resolved_scope = normalize_scope(scope)
        parsed_spec = self._parse_source_spec(source_spec)
        with tempfile.TemporaryDirectory(
            prefix="setta-plugin-install-"
        ) as tmp_dir_name:
            tmp_dir = Path(tmp_dir_name)
            if parsed_spec.scheme == PluginSourceScheme.github:
                candidate = self._candidate_from_github(parsed_spec, tmp_dir)
            elif parsed_spec.scheme == PluginSourceScheme.pypi:
                candidate = self._candidate_from_pypi(parsed_spec, tmp_dir)
            else:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_SCHEME_UNSUPPORTED",
                    f"Unsupported plugin source: {source_spec}",
                )

            target_path = self._target_plugin_path(
                resolved_scope, candidate.manifest.id
            )
            old_entry = self._find_entry(candidate.manifest.id, resolved_scope)
            had_backend_before = (
                old_entry.has_backend if old_entry is not None else False
            )

            self._install_candidate(
                candidate,
                target_path,
                scope=resolved_scope,
                force=force,
                source_spec=source_spec,
            )
            self._apply_enablement_after_install(
                plugin_id=candidate.manifest.id,
                scope=resolved_scope,
                enable=enable,
            )
            if candidate.manifest.backend is not None or had_backend_before:
                self._pending_restart_backend_ids.add(candidate.manifest.id)

        self.rescan()
        active_entry = self._active_plugin_by_id.get(candidate.manifest.id)
        if active_entry is None:
            active_entry = self._find_entry(candidate.manifest.id, resolved_scope)
        if active_entry is None:
            raise PluginManagerError(
                "PLUGIN_INSTALL_FAILED",
                f"Installed plugin was not discovered: {candidate.manifest.id}",
            )
        return PluginInstallResponse(
            pluginId=active_entry.plugin_id,
            version=active_entry.version,
            sourceScope=resolved_scope,
            sourceScopeLabel=scope_label(resolved_scope),
            sourcePath=str(active_entry.source_path),
            canonicalSourceKey=active_entry.canonical_source_key,
            sourceDigestSha256=active_entry.source_digest_sha256,
            components=candidate.components,
            state=active_entry.state,
            restartRequired=active_entry.has_backend,
        )

    def link_plugin(
        self,
        *,
        local_plugin_root: str,
        scope: str | PluginScope | None = None,
        enable: bool = True,
        force: bool = False,
    ) -> PluginInstallResponse:
        source_root = Path(local_plugin_root).expanduser().resolve(strict=False)
        if not source_root.exists() or not source_root.is_dir():
            raise PluginManagerError(
                "PLUGIN_SOURCE_NOT_FOUND",
                f"Local plugin root not found: {source_root}",
            )
        manifest = self._load_and_validate_manifest(source_root / "setta.plugin.json")
        self._validate_manifest_paths(source_root, manifest)
        source_digest = self._compute_directory_digest(source_root)
        resolved_scope = normalize_scope(scope)
        target = self._target_plugin_path(resolved_scope, manifest.id)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() or target.is_symlink():
            if not force:
                raise PluginManagerError(
                    "PLUGIN_TARGET_EXISTS",
                    f"Plugin already exists at {target}. Use force to overwrite.",
                )
            self._backup_existing_plugin(manifest.id, resolved_scope, target)
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            else:
                target.unlink()
        os.symlink(source_root, target, target_is_directory=True)

        self._set_install_metadata(
            plugin_id=manifest.id,
            scope=resolved_scope,
            source_spec=f"local:{source_root}",
            canonical_source_key=f"local:{source_root}",
            version=manifest.version,
            source_digest_sha256=source_digest,
        )
        self._apply_enablement_after_install(
            plugin_id=manifest.id,
            scope=resolved_scope,
            enable=enable,
        )
        if manifest.backend is not None:
            self._pending_restart_backend_ids.add(manifest.id)
        self.rescan()
        entry = self._find_entry(manifest.id, resolved_scope)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_LINK_FAILED",
                f"Linked plugin was not discovered: {manifest.id}",
            )
        return PluginInstallResponse(
            pluginId=entry.plugin_id,
            version=entry.version,
            sourceScope=resolved_scope,
            sourceScopeLabel=scope_label(resolved_scope),
            sourcePath=str(entry.source_path),
            canonicalSourceKey=entry.canonical_source_key,
            sourceDigestSha256=entry.source_digest_sha256,
            components=[
                component
                for component in (
                    "backend" if manifest.backend is not None else None,
                    "frontend" if manifest.frontend is not None else None,
                    "content" if manifest.content is not None else None,
                )
                if component is not None
            ],
            state=entry.state,
            restartRequired=entry.has_backend,
        )

    def uninstall_plugin(
        self,
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
    ) -> PluginUninstallResponse:
        resolved_scope = self._resolve_uninstall_scope(plugin_id, scope)
        entry = self._find_entry(plugin_id, resolved_scope)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found for uninstall: {plugin_id}",
                status_code=404,
            )
        target = self._target_plugin_path(resolved_scope, plugin_id)
        restart_required = entry.has_backend
        if target.exists() and target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        elif target.exists() or target.is_symlink():
            target.unlink()

        self._remove_install_metadata(plugin_id, resolved_scope)
        self._remove_plugin_from_enablement(plugin_id, resolved_scope)
        if restart_required:
            self._pending_restart_backend_ids.add(plugin_id)
        self.rescan()
        return PluginUninstallResponse(
            pluginId=plugin_id,
            removedFromScope=resolved_scope,
            restartRequired=restart_required,
        )

    def unlink_plugin(
        self,
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
    ) -> PluginUninstallResponse:
        return self.uninstall_plugin(plugin_id=plugin_id, scope=scope)

    def enable_plugin(self, *, plugin_id: str) -> PluginEnableDisableResponse:
        state_file = self._load_plugins_state()
        if plugin_id not in state_file.enabledPluginIds:
            state_file.enabledPluginIds.append(plugin_id)
        if plugin_id in state_file.disabledPluginIds:
            state_file.disabledPluginIds = [
                value for value in state_file.disabledPluginIds if value != plugin_id
            ]
        self._save_plugins_state(state_file)
        entry = self._find_highest_precedence_entry(plugin_id)
        if entry is not None and entry.has_backend:
            self._pending_restart_backend_ids.add(plugin_id)
        self.rescan()
        latest = self._find_highest_precedence_entry(plugin_id)
        if latest is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        return PluginEnableDisableResponse(
            pluginId=plugin_id,
            state=latest.state,
            restartRequired=latest.has_backend,
        )

    def disable_plugin(self, *, plugin_id: str) -> PluginEnableDisableResponse:
        state_file = self._load_plugins_state()
        if plugin_id not in state_file.disabledPluginIds:
            state_file.disabledPluginIds.append(plugin_id)
        if plugin_id in state_file.enabledPluginIds:
            state_file.enabledPluginIds = [
                value for value in state_file.enabledPluginIds if value != plugin_id
            ]
        self._save_plugins_state(state_file)
        entry = self._find_highest_precedence_entry(plugin_id)
        if entry is not None and entry.has_backend:
            self._pending_restart_backend_ids.add(plugin_id)
        self.rescan()
        latest = self._find_highest_precedence_entry(plugin_id)
        if latest is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        return PluginEnableDisableResponse(
            pluginId=plugin_id,
            state=latest.state,
            restartRequired=latest.has_backend,
        )

    def write_plugin_config(
        self, *, plugin_id: str, config: dict[str, Any]
    ) -> PluginConfigWriteResponse:
        entry = self._find_highest_precedence_entry(plugin_id)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        if entry.manifest is None:
            raise PluginManagerError(
                "PLUGIN_CONFIG_INVALID",
                f"Plugin manifest missing for plugin: {plugin_id}",
            )
        self._validate_plugin_config(entry, config)
        state_file = self._load_plugins_state()
        state_file.pluginConfigById[plugin_id] = config
        self._save_plugins_state(state_file)
        self.rescan()
        return PluginConfigWriteResponse(
            pluginId=plugin_id,
            config=config,
            validation={"ok": True},
        )

    def update_plugin(
        self,
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
        to: str | None = None,
    ) -> PluginUpdateResponse:
        resolved_scope = self._resolve_uninstall_scope(plugin_id, scope)
        metadata_entry = self._get_install_metadata(plugin_id, resolved_scope)
        if metadata_entry is None:
            raise PluginManagerError(
                "PLUGIN_UPDATE_UNAVAILABLE",
                f"No source metadata stored for plugin: {plugin_id}",
            )
        source_spec = metadata_entry.sourceSpec
        if to is not None:
            source_spec = self._retarget_source_spec(source_spec, to)
        existing_entry = self._find_entry(plugin_id, resolved_scope)
        if existing_entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        install_result = self.install_plugin(
            source_spec=source_spec,
            scope=resolved_scope,
            enable=True,
            force=True,
        )
        self._pending_restart_backend_ids.add(plugin_id)
        return PluginUpdateResponse(
            pluginId=plugin_id,
            fromVersion=existing_entry.version,
            toVersion=install_result.version,
            sourceDigestSha256=install_result.sourceDigestSha256,
            restartRequired=install_result.restartRequired,
        )

    def rollback_plugin(
        self,
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
    ) -> PluginRollbackResponse:
        resolved_scope = self._resolve_uninstall_scope(plugin_id, scope)
        metadata = self._load_install_metadata()
        metadata_key = self._metadata_key(plugin_id, resolved_scope)
        entry = metadata.entries.get(metadata_key)
        if entry is None or len(entry.history) == 0:
            raise PluginManagerError(
                "PLUGIN_ROLLBACK_UNAVAILABLE",
                f"No rollback history exists for plugin: {plugin_id}",
            )
        previous = entry.history.pop()
        snapshot_path = Path(previous.snapshotPath)
        if not snapshot_path.exists():
            raise PluginManagerError(
                "PLUGIN_ROLLBACK_UNAVAILABLE",
                f"Rollback snapshot missing for plugin: {plugin_id}",
            )

        target = self._target_plugin_path(resolved_scope, plugin_id)
        if target.exists() and target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        elif target.exists() or target.is_symlink():
            target.unlink()
        shutil.copytree(snapshot_path, target)

        manifest = self._load_and_validate_manifest(target / "setta.plugin.json")
        digest = self._compute_directory_digest(target)
        entry.version = manifest.version
        entry.sourceDigestSha256 = digest
        metadata.entries[metadata_key] = entry
        self._save_install_metadata(metadata)
        if manifest.backend is not None:
            self._pending_restart_backend_ids.add(plugin_id)
        self.rescan()
        return PluginRollbackResponse(
            pluginId=plugin_id,
            restoredVersion=manifest.version,
            sourceDigestSha256=digest,
            restartRequired=manifest.backend is not None,
        )

    def write_lockfile(self) -> PluginLockWriteResponse:
        lock_entries: list[PluginLockEntry] = []
        install_metadata = self._load_install_metadata()
        for entry in sorted(
            self._discovered_plugins,
            key=lambda item: (
                item.plugin_id,
                _SCOPE_ORDER[item.scope],
                str(item.source_path),
            ),
        ):
            if entry.shadowed_by_source_path is not None:
                continue
            if entry.manifest is None:
                continue
            metadata_entry = install_metadata.entries.get(
                self._metadata_key(entry.plugin_id, entry.scope)
            )
            lock_entries.append(
                PluginLockEntry(
                    pluginId=entry.plugin_id,
                    version=entry.version,
                    canonicalSourceKey=entry.canonical_source_key,
                    scope=entry.scope,
                    sourceDigestSha256=entry.source_digest_sha256,
                    sourceSpec=metadata_entry.sourceSpec if metadata_entry else None,
                )
            )
        lockfile = PluginsLockFile(plugins=lock_entries)
        self._lockfile_path.parent.mkdir(parents=True, exist_ok=True)
        self._lockfile_path.write_text(
            json.dumps(lockfile.model_dump(mode="json"), indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return PluginLockWriteResponse(
            lockfilePath=str(self._lockfile_path),
            pluginCount=len(lock_entries),
        )

    def apply_lockfile(self, *, check: bool) -> PluginLockApplyResponse:
        if not self._lockfile_path.exists():
            raise PluginManagerError(
                "PLUGIN_LOCKFILE_NOT_FOUND",
                f"Plugin lockfile not found: {self._lockfile_path}",
                status_code=404,
            )
        raw = self._lockfile_path.read_text(encoding="utf-8")
        try:
            lockfile = PluginsLockFile.model_validate(json.loads(raw))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise PluginManagerError(
                "PLUGIN_LOCKFILE_INVALID",
                f"Invalid plugin lockfile: {exc}",
            ) from exc

        desired_by_scope_plugin: dict[tuple[PluginScope, str], PluginLockEntry] = {}
        for plugin in lockfile.plugins:
            desired_by_scope_plugin[(plugin.scope, plugin.pluginId)] = plugin

        current_primary_entries = [
            entry
            for entry in self._discovered_plugins
            if entry.shadowed_by_source_path is None and entry.manifest is not None
        ]
        current_by_scope_plugin = {
            (entry.scope, entry.plugin_id): entry for entry in current_primary_entries
        }

        planned_changes: list[str] = []
        for key, desired in desired_by_scope_plugin.items():
            current = current_by_scope_plugin.get(key)
            if current is None:
                planned_changes.append(
                    f"install {desired.pluginId} in {desired.scope.value}"
                )
                continue
            if current.version != desired.version:
                planned_changes.append(
                    f"update {desired.pluginId} in {desired.scope.value} from {current.version} to {desired.version}"
                )
                continue
            if desired.sourceDigestSha256 and (
                current.source_digest_sha256 != desired.sourceDigestSha256
            ):
                planned_changes.append(
                    f"reconcile digest for {desired.pluginId} in {desired.scope.value}"
                )

        for key, current in current_by_scope_plugin.items():
            if key not in desired_by_scope_plugin:
                planned_changes.append(
                    f"uninstall {current.plugin_id} from {current.scope.value}"
                )

        if check:
            return PluginLockApplyResponse(
                lockfilePath=str(self._lockfile_path),
                plannedChanges=planned_changes,
                applied=False,
            )

        for key, desired in desired_by_scope_plugin.items():
            current = current_by_scope_plugin.get(key)
            if current is not None:
                if current.version == desired.version and (
                    desired.sourceDigestSha256 is None
                    or current.source_digest_sha256 == desired.sourceDigestSha256
                ):
                    continue
            if desired.sourceSpec is None:
                raise PluginManagerError(
                    "PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE",
                    f"Lockfile entry missing source spec for plugin: {desired.pluginId}",
                )
            self.install_plugin(
                source_spec=desired.sourceSpec,
                scope=desired.scope,
                enable=True,
                force=True,
            )

        for key, current in current_by_scope_plugin.items():
            if key in desired_by_scope_plugin:
                continue
            self.uninstall_plugin(plugin_id=current.plugin_id, scope=current.scope)

        self.rescan()
        return PluginLockApplyResponse(
            lockfilePath=str(self._lockfile_path),
            plannedChanges=planned_changes,
            applied=True,
        )

    def validate_plugin_folder(self, plugin_root: str | Path) -> None:
        root = Path(plugin_root).expanduser().resolve(strict=False)
        if not root.exists() or not root.is_dir():
            raise PluginManagerError(
                "PLUGIN_SOURCE_NOT_FOUND",
                f"Plugin folder not found: {root}",
            )
        manifest = self._load_and_validate_manifest(root / "setta.plugin.json")
        self._validate_manifest_paths(root, manifest)
        self._validate_setta_version_range(manifest)
        self._validate_metadata_identity(
            root=root,
            manifest=manifest,
            package_name=None,
            package_version=None,
        )
        self._validate_plugin_config_schema_file(root, manifest)

    def init_plugin_template(
        self,
        *,
        plugin_id: str,
        template: Literal["backend", "frontend", "full", "content"],
        out_dir: str | None,
    ) -> Path:
        normalized_id = plugin_id.strip().lower()
        if not normalized_id:
            raise PluginManagerError("PLUGIN_INIT_INVALID_ID", "Missing plugin id.")
        if out_dir is None:
            root = self.workspace_root / normalized_id
        else:
            root = Path(out_dir).expanduser().resolve(strict=False) / normalized_id
        if root.exists():
            raise PluginManagerError(
                "PLUGIN_INIT_TARGET_EXISTS",
                f"Plugin folder already exists: {root}",
            )
        root.mkdir(parents=True, exist_ok=False)

        manifest: dict[str, Any] = {
            "schemaVersion": 1,
            "id": normalized_id,
            "name": normalized_id,
            "version": "0.1.0",
            "settaVersionRange": ">=0.0.0",
            "enabledByDefault": False,
            "capabilities": [],
        }

        if template in {"backend", "full"}:
            backend_dir = root / "backend"
            backend_dir.mkdir(parents=True, exist_ok=True)
            (backend_dir / "entrypoint.py").write_text(
                "def register(plugin):\n    return None\n",
                encoding="utf-8",
            )
            manifest["backend"] = {"entrypoint": "backend/entrypoint.py"}

        if template in {"frontend", "full"}:
            frontend_dist_dir = root / "frontend" / "dist"
            frontend_dist_dir.mkdir(parents=True, exist_ok=True)
            (frontend_dist_dir / "index.js").write_text(
                "export function register(host) {\n  void host;\n}\n",
                encoding="utf-8",
            )
            (frontend_dist_dir / "index.css").write_text(
                "/* plugin styles */\n",
                encoding="utf-8",
            )
            manifest["frontend"] = {
                "entrypoint": "frontend/dist/index.js",
                "style": "frontend/dist/index.css",
            }

        if template in {"content", "full"}:
            content_dir = root / "content"
            (content_dir / "blueprints").mkdir(parents=True, exist_ok=True)
            (content_dir / "project_templates").mkdir(parents=True, exist_ok=True)
            (content_dir / "prompts").mkdir(parents=True, exist_ok=True)
            manifest["content"] = {
                "blueprintsDir": "content/blueprints",
                "projectTemplatesDir": "content/project_templates",
                "promptsDir": "content/prompts",
            }

        (root / "setta.plugin.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True),
            encoding="utf-8",
        )

        pyproject_content = (
            "[build-system]\n"
            'requires = ["setuptools>=68", "wheel"]\n'
            'build-backend = "setuptools.build_meta"\n\n'
            "[project]\n"
            f'name = "{normalized_id}"\n'
            'version = "0.1.0"\n'
            'description = "Setta plugin"\n'
            'requires-python = ">=3.12"\n'
            "dependencies = []\n\n"
            "[tool.setuptools.package-data]\n"
            '"*" = ["setta.plugin.json", "frontend/dist/*", "content/**/*"]\n'
        )
        (root / "pyproject.toml").write_text(pyproject_content, encoding="utf-8")
        (root / "README.md").write_text(
            "# Setta Plugin\n\n"
            "## Validate\n\n"
            "```bash\n"
            "setta plugins validate .\n"
            "```\n\n"
            "## Build\n\n"
            "```bash\n"
            "python -m build\n"
            "```\n",
            encoding="utf-8",
        )
        return root

    def _discover_plugins(self) -> list[DiscoveredPlugin]:
        entries: list[DiscoveredPlugin] = []
        install_metadata = self._load_install_metadata()
        for scope in (
            PluginScope.workspace,
            PluginScope.setta_files,
            PluginScope.global_scope,
        ):
            root = self._plugins_root_for_scope(scope)
            if not root.exists():
                continue
            for child in sorted(root.iterdir(), key=lambda path: path.name):
                if not child.exists():
                    continue
                if not child.is_dir() and not child.is_symlink():
                    continue
                manifest_path = child / "setta.plugin.json"
                plugin_id = child.name
                metadata_entry = install_metadata.entries.get(
                    self._metadata_key(plugin_id, scope)
                )
                canonical_source_key = (
                    metadata_entry.canonicalSourceKey
                    if metadata_entry is not None
                    else f"local:{child}"
                )
                if not manifest_path.exists():
                    entries.append(
                        DiscoveredPlugin(
                            plugin_id=plugin_id,
                            name=plugin_id,
                            version="unknown",
                            scope=scope,
                            source_path=child,
                            manifest=None,
                            canonical_source_key=canonical_source_key,
                            source_digest_sha256=None,
                            errors=[
                                PluginErrorInfo(
                                    code="PLUGIN_SOURCE_MANIFEST_NOT_FOUND",
                                    message=f"Manifest not found: {manifest_path}",
                                )
                            ],
                            state=PluginRuntimeState.invalid,
                        )
                    )
                    continue

                try:
                    manifest = self._load_and_validate_manifest(manifest_path)
                    self._validate_manifest_paths(child, manifest)
                    self._validate_setta_version_range(manifest)
                    self._validate_plugin_config_schema_file(child, manifest)
                except PluginManagerError as exc:
                    entries.append(
                        DiscoveredPlugin(
                            plugin_id=plugin_id,
                            name=plugin_id,
                            version="unknown",
                            scope=scope,
                            source_path=child,
                            manifest=None,
                            canonical_source_key=canonical_source_key,
                            source_digest_sha256=None,
                            errors=[
                                PluginErrorInfo(code=exc.code, message=exc.message)
                            ],
                            state=PluginRuntimeState.invalid,
                        )
                    )
                    continue

                plugin_id = manifest.id
                metadata_entry = install_metadata.entries.get(
                    self._metadata_key(plugin_id, scope)
                )
                canonical_source_key = (
                    metadata_entry.canonicalSourceKey
                    if metadata_entry is not None
                    else canonical_source_key
                )
                digest = self._compute_directory_digest(child)
                entries.append(
                    DiscoveredPlugin(
                        plugin_id=plugin_id,
                        name=manifest.name,
                        version=manifest.version,
                        scope=scope,
                        source_path=child,
                        manifest=manifest,
                        canonical_source_key=canonical_source_key,
                        source_digest_sha256=digest,
                    )
                )

        grouped: dict[str, list[DiscoveredPlugin]] = {}
        for entry in entries:
            grouped.setdefault(entry.plugin_id, []).append(entry)

        resolved_entries: list[DiscoveredPlugin] = []
        plugins_state = self._load_plugins_state()
        plugins_global_state = self._load_plugins_global_state()

        for plugin_id, grouped_entries in grouped.items():
            ordered_group = sorted(
                grouped_entries,
                key=lambda entry: (_SCOPE_ORDER[entry.scope], str(entry.source_path)),
            )
            primary = ordered_group[0]
            for shadowed in ordered_group[1:]:
                shadowed.state = PluginRuntimeState.shadowed
                shadowed.shadowed_by_source_path = primary.source_path
                shadowed.restart_required = False

            self._resolve_primary_entry_state(
                primary,
                plugins_state=plugins_state,
                plugins_global_state=plugins_global_state,
            )
            resolved_entries.extend(ordered_group)

        return resolved_entries

    def _resolve_primary_entry_state(
        self,
        entry: DiscoveredPlugin,
        *,
        plugins_state: PluginsStateFile,
        plugins_global_state: PluginsGlobalStateFile,
    ) -> None:
        if entry.manifest is None:
            entry.state = PluginRuntimeState.invalid
            return
        if entry.errors:
            entry.state = PluginRuntimeState.invalid
            return

        requested = list(entry.manifest.capabilities)
        effective, blocked = self._resolve_effective_capabilities(requested)
        entry.requested_capabilities = requested
        entry.effective_capabilities = effective
        entry.blocked_capabilities = blocked

        if entry.has_backend and entry.plugin_id in self._pending_restart_backend_ids:
            entry.state = PluginRuntimeState.pending_restart
            entry.restart_required = True
            return

        enabled = self._resolve_enabled(
            plugin_id=entry.plugin_id,
            scope=entry.scope,
            manifest_enabled_by_default=entry.manifest.enabledByDefault,
            plugins_state=plugins_state,
            plugins_global_state=plugins_global_state,
        )
        if not enabled:
            entry.state = PluginRuntimeState.disabled
            entry.restart_required = False
            return

        config = plugins_state.pluginConfigById.get(entry.plugin_id, {})
        if not isinstance(config, dict):
            config = {}
        try:
            self._validate_plugin_config(entry, config)
        except PluginManagerError as exc:
            entry.state = PluginRuntimeState.invalid
            entry.errors.append(PluginErrorInfo(code=exc.code, message=exc.message))
            entry.blocked_capabilities = [
                PluginBlockedCapability(
                    capability=capability,
                    reason=BlockedCapabilityReason.manifest_invalid,
                )
                for capability in requested
            ]
            entry.effective_capabilities = []
            entry.restart_required = False
            return

        entry.state = PluginRuntimeState.active
        entry.restart_required = False

    def _resolve_enabled(
        self,
        *,
        plugin_id: str,
        scope: PluginScope,
        manifest_enabled_by_default: bool,
        plugins_state: PluginsStateFile,
        plugins_global_state: PluginsGlobalStateFile,
    ) -> bool:
        if plugin_id in plugins_state.disabledPluginIds:
            return False
        if plugin_id in plugins_state.enabledPluginIds:
            return True
        if scope == PluginScope.global_scope:
            if plugin_id in plugins_global_state.autoEnabledPluginIds:
                return True
        return manifest_enabled_by_default

    def _resolve_effective_capabilities(
        self, requested: list[str]
    ) -> tuple[list[str], list[PluginBlockedCapability]]:
        allowed = _MODE_ALLOWED_CAPABILITIES[self.server_mode]
        effective: list[str] = []
        blocked: list[PluginBlockedCapability] = []
        for capability in requested:
            if capability in allowed:
                effective.append(capability)
            else:
                blocked.append(
                    PluginBlockedCapability(
                        capability=capability,
                        reason=BlockedCapabilityReason.mode_policy,
                    )
                )
        return effective, blocked

    def _build_content_descriptor(
        self, entry: DiscoveredPlugin
    ) -> PluginContentDescriptor:
        manifest = entry.manifest
        if manifest is None or manifest.content is None:
            return PluginContentDescriptor(
                hasBlueprints=False,
                hasProjectTemplates=False,
                hasPrompts=False,
            )

        return PluginContentDescriptor(
            hasBlueprints=self._directory_has_files(
                self._resolve_optional_relative_directory(
                    entry.source_path,
                    manifest.content.blueprintsDir,
                )
            ),
            hasProjectTemplates=self._directory_has_files(
                self._resolve_optional_relative_directory(
                    entry.source_path,
                    manifest.content.projectTemplatesDir,
                )
            ),
            hasPrompts=self._directory_has_files(
                self._resolve_optional_relative_directory(
                    entry.source_path,
                    manifest.content.promptsDir,
                )
            ),
        )

    def _build_config_descriptor(
        self, entry: DiscoveredPlugin
    ) -> PluginConfigDescriptor:
        manifest = entry.manifest
        if manifest is None or manifest.configSchemaPath is None:
            return PluginConfigDescriptor(hasSchema=False)
        schema_path = self._resolve_relative_path(
            entry.source_path,
            manifest.configSchemaPath,
            code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
            message_prefix="Invalid configSchemaPath",
        )
        if not schema_path.exists() or not schema_path.is_file():
            return PluginConfigDescriptor(hasSchema=False)
        try:
            schema_json = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            schema_json = None
        if isinstance(schema_json, dict):
            return PluginConfigDescriptor(hasSchema=True, schemaJson=schema_json)
        return PluginConfigDescriptor(hasSchema=True)

    def _validate_plugin_config(
        self, entry: DiscoveredPlugin, config: dict[str, Any]
    ) -> None:
        manifest = entry.manifest
        if manifest is None or manifest.configSchemaPath is None:
            return
        schema_path = self._resolve_relative_path(
            entry.source_path,
            manifest.configSchemaPath,
            code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
            message_prefix="Invalid config schema path",
        )
        try:
            schema_json = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PluginManagerError(
                "PLUGIN_CONFIG_SCHEMA_INVALID",
                f"Invalid plugin config schema JSON: {schema_path}",
            ) from exc
        try:
            jsonschema_validate(config, schema_json)
        except JSONSchemaValidationError as exc:
            raise PluginManagerError(
                "PLUGIN_CONFIG_INVALID",
                f"Invalid plugin config for {entry.plugin_id}: {exc.message}",
            ) from exc

    def _load_manifest_schema(self) -> dict[str, Any]:
        if not self._manifest_schema_path.exists():
            raise PluginManagerError(
                "PLUGIN_MANIFEST_SCHEMA_NOT_FOUND",
                f"Plugin manifest schema file not found: {self._manifest_schema_path}",
            )
        raw = self._manifest_schema_path.read_text(encoding="utf-8")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise PluginManagerError(
                "PLUGIN_MANIFEST_SCHEMA_INVALID",
                f"Invalid plugin manifest schema JSON: {self._manifest_schema_path}",
            ) from exc
        if not isinstance(payload, dict):
            raise PluginManagerError(
                "PLUGIN_MANIFEST_SCHEMA_INVALID",
                "Plugin manifest schema root must be an object.",
            )
        return payload

    def _load_and_validate_manifest(self, manifest_path: Path) -> PluginManifest:
        if not manifest_path.exists():
            raise PluginManagerError(
                "PLUGIN_SOURCE_MANIFEST_NOT_FOUND",
                f"Manifest not found: {manifest_path}",
            )
        try:
            raw_json = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PluginManagerError(
                "PLUGIN_MANIFEST_INVALID",
                f"Invalid JSON in plugin manifest: {manifest_path}",
            ) from exc

        self._validate_manifest_capabilities(raw_json)

        try:
            jsonschema_validate(raw_json, self._manifest_schema)
        except JSONSchemaValidationError as exc:
            if "schemaVersion" in exc.message:
                raise PluginManagerError(
                    "PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA",
                    f"Unsupported plugin manifest schema in {manifest_path}: {exc.message}",
                ) from exc
            raise PluginManagerError(
                "PLUGIN_MANIFEST_INVALID",
                f"Plugin manifest failed schema validation in {manifest_path}: {exc.message}",
            ) from exc

        try:
            manifest = PluginManifest.model_validate(raw_json)
        except ValidationError as exc:
            raise PluginManagerError(
                "PLUGIN_MANIFEST_INVALID",
                f"Plugin manifest validation failed in {manifest_path}: {exc}",
            ) from exc

        if manifest.schemaVersion != PLUGIN_MANIFEST_SCHEMA_VERSION:
            raise PluginManagerError(
                "PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA",
                f"Unsupported plugin manifest schema version: {manifest.schemaVersion}",
            )
        return manifest

    def _validate_manifest_capabilities(self, payload: Any) -> None:
        if not isinstance(payload, dict):
            return
        capabilities = payload.get("capabilities")
        if capabilities is None:
            return
        if not isinstance(capabilities, list):
            raise PluginManagerError(
                "PLUGIN_MANIFEST_INVALID",
                "Manifest capabilities must be an array.",
            )
        seen: set[str] = set()
        for capability in capabilities:
            if capability not in PLUGIN_CAPABILITIES_SET:
                raise PluginManagerError(
                    "PLUGIN_MANIFEST_INVALID_CAPABILITY",
                    f"Unknown capability in manifest: {capability!r}",
                )
            if capability in seen:
                raise PluginManagerError(
                    "PLUGIN_MANIFEST_DUPLICATE_CAPABILITY",
                    f"Duplicate capability in manifest: {capability!r}",
                )
            seen.add(capability)

    def _validate_manifest_paths(
        self, plugin_root: Path, manifest: PluginManifest
    ) -> None:
        if manifest.backend is not None:
            path = self._resolve_relative_path(
                plugin_root,
                manifest.backend.entrypoint,
                code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
                message_prefix="Invalid backend entrypoint",
            )
            if not path.exists() or not path.is_file():
                raise PluginManagerError(
                    "PLUGIN_MANIFEST_PATH_NOT_FOUND",
                    f"Plugin backend entrypoint not found: {path}",
                )

        if manifest.frontend is not None:
            path = self._resolve_relative_path(
                plugin_root,
                manifest.frontend.entrypoint,
                code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
                message_prefix="Invalid frontend entrypoint",
            )
            if not path.exists() or not path.is_file():
                raise PluginManagerError(
                    "PLUGIN_MANIFEST_PATH_NOT_FOUND",
                    f"Plugin frontend entrypoint not found: {path}",
                )
            if manifest.frontend.style:
                style = self._resolve_relative_path(
                    plugin_root,
                    manifest.frontend.style,
                    code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
                    message_prefix="Invalid frontend style path",
                )
                if not style.exists() or not style.is_file():
                    raise PluginManagerError(
                        "PLUGIN_MANIFEST_PATH_NOT_FOUND",
                        f"Plugin frontend style not found: {style}",
                    )

        if manifest.content is not None:
            for label, raw_dir in (
                ("blueprints", manifest.content.blueprintsDir),
                ("project templates", manifest.content.projectTemplatesDir),
                ("prompts", manifest.content.promptsDir),
            ):
                if raw_dir is None:
                    continue
                path = self._resolve_relative_path(
                    plugin_root,
                    raw_dir,
                    code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
                    message_prefix=f"Invalid content {label} directory",
                )
                if not path.exists() or not path.is_dir():
                    raise PluginManagerError(
                        "PLUGIN_MANIFEST_PATH_NOT_FOUND",
                        f"Plugin content {label} directory not found: {path}",
                    )

        if manifest.configSchemaPath is not None:
            schema_path = self._resolve_relative_path(
                plugin_root,
                manifest.configSchemaPath,
                code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
                message_prefix="Invalid configSchemaPath",
            )
            if not schema_path.exists() or not schema_path.is_file():
                raise PluginManagerError(
                    "PLUGIN_MANIFEST_PATH_NOT_FOUND",
                    f"Plugin configSchemaPath not found: {schema_path}",
                )

    def _validate_plugin_config_schema_file(
        self, plugin_root: Path, manifest: PluginManifest
    ) -> None:
        if manifest.configSchemaPath is None:
            return
        schema_path = self._resolve_relative_path(
            plugin_root,
            manifest.configSchemaPath,
            code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
            message_prefix="Invalid configSchemaPath",
        )
        try:
            parsed_schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PluginManagerError(
                "PLUGIN_CONFIG_SCHEMA_INVALID",
                f"Invalid config schema JSON at: {schema_path}",
            ) from exc
        if not isinstance(parsed_schema, dict):
            raise PluginManagerError(
                "PLUGIN_CONFIG_SCHEMA_INVALID",
                f"Config schema must be a JSON object: {schema_path}",
            )

    def _validate_setta_version_range(self, manifest: PluginManifest) -> None:
        try:
            specifier = SpecifierSet(manifest.settaVersionRange)
        except InvalidSpecifier as exc:
            raise PluginManagerError(
                "PLUGIN_MANIFEST_INVALID",
                f"Invalid settaVersionRange for plugin {manifest.id}: {manifest.settaVersionRange}",
            ) from exc
        try:
            current_version = Version(self.setta_version)
        except InvalidVersion as exc:
            raise PluginManagerError(
                "PLUGIN_HOST_VERSION_INVALID",
                f"Host Setta version is invalid: {self.setta_version}",
            ) from exc
        if current_version not in specifier:
            raise PluginManagerError(
                "PLUGIN_MANIFEST_VERSION_INCOMPATIBLE",
                f"Plugin {manifest.id} requires Setta version {manifest.settaVersionRange}, current version is {self.setta_version}",
            )

    def _candidate_from_github(
        self, source_spec: ParsedSourceSpec, tmp_dir: Path
    ) -> CandidatePlugin:
        assert source_spec.owner is not None
        assert source_spec.repo is not None

        clone_root = tmp_dir / "repo"
        clone_url = f"https://github.com/{source_spec.owner}/{source_spec.repo}.git"
        clone_cmd = ["git", "clone", "--depth", "1"]
        if source_spec.ref:
            clone_cmd.extend(["--branch", source_spec.ref])
        clone_cmd.extend([clone_url, str(clone_root)])
        result = subprocess.run(
            clone_cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise PluginManagerError(
                "PLUGIN_SOURCE_FETCH_FAILED",
                (
                    "Failed to fetch GitHub plugin source: "
                    f"{source_spec.raw}\n{result.stderr.strip() or result.stdout.strip()}"
                ),
            )

        manifest_path = clone_root / "setta.plugin.json"
        if not manifest_path.exists():
            raise PluginManagerError(
                "PLUGIN_SOURCE_MANIFEST_NOT_FOUND",
                "GitHub source root must contain setta.plugin.json.",
            )

        manifest = self._load_and_validate_manifest(manifest_path)
        self._validate_manifest_paths(clone_root, manifest)
        self._validate_setta_version_range(manifest)
        package_name, package_version = self._read_pyproject_metadata_optional(
            clone_root
        )
        self._validate_metadata_identity(
            root=clone_root,
            manifest=manifest,
            package_name=package_name,
            package_version=package_version,
        )

        return CandidatePlugin(
            root=clone_root,
            manifest=manifest,
            canonical_source_key=source_spec.canonical_source_key,
            source_spec=source_spec.raw,
            source_digest_sha256=self._compute_directory_digest(clone_root),
        )

    def _candidate_from_pypi(
        self, source_spec: ParsedSourceSpec, tmp_dir: Path
    ) -> CandidatePlugin:
        assert source_spec.package is not None
        package_spec = source_spec.package
        if source_spec.version:
            package_spec = f"{package_spec}=={source_spec.version}"

        download_cmd = [
            sys.executable,
            "-m",
            "pip",
            "download",
            "--no-deps",
            "--dest",
            str(tmp_dir),
            package_spec,
        ]
        result = subprocess.run(
            download_cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise PluginManagerError(
                "PLUGIN_SOURCE_FETCH_FAILED",
                (
                    "Failed to download PyPI plugin source: "
                    f"{source_spec.raw}\n{result.stderr.strip() or result.stdout.strip()}"
                ),
            )

        artifacts = sorted(tmp_dir.iterdir(), key=lambda path: path.name)
        if len(artifacts) == 0:
            raise PluginManagerError(
                "PLUGIN_SOURCE_FETCH_FAILED",
                f"No artifacts were downloaded for source: {source_spec.raw}",
            )

        artifact_path = artifacts[0]
        extract_root = tmp_dir / "extract"
        extract_root.mkdir(parents=True, exist_ok=True)
        self._extract_artifact(artifact_path, extract_root)

        manifest_candidates = sorted(
            extract_root.rglob("setta.plugin.json"), key=lambda path: str(path)
        )
        if len(manifest_candidates) == 0:
            raise PluginManagerError(
                "PLUGIN_SOURCE_MANIFEST_NOT_FOUND",
                "PyPI artifact did not contain setta.plugin.json.",
            )
        if len(manifest_candidates) > 1:
            raise PluginManagerError(
                "PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT",
                "PyPI artifact contained multiple setta.plugin.json files.",
            )
        manifest_path = manifest_candidates[0]
        plugin_root = manifest_path.parent

        manifest = self._load_and_validate_manifest(manifest_path)
        self._validate_manifest_paths(plugin_root, manifest)
        self._validate_setta_version_range(manifest)
        package_name, package_version = self._read_package_metadata_optional(
            extract_root
        )
        if package_name is None or package_version is None:
            fallback_name, fallback_version = self._read_pyproject_metadata_optional(
                plugin_root
            )
            package_name = package_name or fallback_name
            package_version = package_version or fallback_version

        self._validate_metadata_identity(
            root=plugin_root,
            manifest=manifest,
            package_name=package_name,
            package_version=package_version,
        )

        return CandidatePlugin(
            root=plugin_root,
            manifest=manifest,
            canonical_source_key=source_spec.canonical_source_key,
            source_spec=source_spec.raw,
            source_digest_sha256=self._compute_directory_digest(plugin_root),
        )

    def _install_candidate(
        self,
        candidate: CandidatePlugin,
        target_path: Path,
        *,
        scope: PluginScope,
        force: bool,
        source_spec: str,
    ) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if target_path.exists() or target_path.is_symlink():
            if not force:
                raise PluginManagerError(
                    "PLUGIN_TARGET_EXISTS",
                    f"Plugin already exists at {target_path}. Use force to overwrite.",
                )
            self._backup_existing_plugin(candidate.manifest.id, scope, target_path)
            if target_path.is_dir() and not target_path.is_symlink():
                shutil.rmtree(target_path)
            else:
                target_path.unlink()

        staged_path = (
            target_path.parent
            / f".{candidate.manifest.id}.tmp-{os.getpid()}-{datetime.now(UTC).timestamp()}"
        )
        shutil.copytree(candidate.root, staged_path)
        staged_path.replace(target_path)

        self._set_install_metadata(
            plugin_id=candidate.manifest.id,
            scope=scope,
            source_spec=source_spec,
            canonical_source_key=candidate.canonical_source_key,
            version=candidate.manifest.version,
            source_digest_sha256=candidate.source_digest_sha256,
        )

    def _backup_existing_plugin(
        self,
        plugin_id: str,
        scope: PluginScope,
        target_path: Path,
    ) -> None:
        if (
            not target_path.exists()
            or not target_path.is_dir()
            or target_path.is_symlink()
        ):
            return
        history_stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        history_dir = self._history_root / scope.value / plugin_id / history_stamp
        history_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(target_path, history_dir)

        metadata = self._load_install_metadata()
        key = self._metadata_key(plugin_id, scope)
        entry = metadata.entries.get(key)
        if entry is None:
            manifest = self._load_and_validate_manifest(
                target_path / "setta.plugin.json"
            )
            entry = PluginInstallMetadataEntry(
                pluginId=plugin_id,
                scope=scope,
                sourceSpec=f"local:{target_path}",
                canonicalSourceKey=f"local:{target_path}",
                sourceDigestSha256=self._compute_directory_digest(target_path),
                version=manifest.version,
                history=[],
            )
        entry.history.append(
            PluginInstallHistoryEntry(
                version=entry.version,
                sourceDigestSha256=entry.sourceDigestSha256,
                snapshotPath=str(history_dir),
                timestampIso=datetime.now(UTC).isoformat(),
            )
        )
        metadata.entries[key] = entry
        self._save_install_metadata(metadata)

    def _apply_enablement_after_install(
        self, *, plugin_id: str, scope: PluginScope, enable: bool
    ) -> None:
        state_file = self._load_plugins_state()
        if enable:
            if plugin_id not in state_file.enabledPluginIds:
                state_file.enabledPluginIds.append(plugin_id)
            state_file.disabledPluginIds = [
                value for value in state_file.disabledPluginIds if value != plugin_id
            ]
        else:
            if plugin_id not in state_file.disabledPluginIds:
                state_file.disabledPluginIds.append(plugin_id)
            state_file.enabledPluginIds = [
                value for value in state_file.enabledPluginIds if value != plugin_id
            ]
        self._save_plugins_state(state_file)

        if scope == PluginScope.global_scope:
            global_state = self._load_plugins_global_state()
            if enable:
                if plugin_id not in global_state.autoEnabledPluginIds:
                    global_state.autoEnabledPluginIds.append(plugin_id)
            else:
                global_state.autoEnabledPluginIds = [
                    value
                    for value in global_state.autoEnabledPluginIds
                    if value != plugin_id
                ]
            self._save_plugins_global_state(global_state)

    def _remove_plugin_from_enablement(
        self, plugin_id: str, scope: PluginScope
    ) -> None:
        state_file = self._load_plugins_state()
        state_file.enabledPluginIds = [
            value for value in state_file.enabledPluginIds if value != plugin_id
        ]
        state_file.disabledPluginIds = [
            value for value in state_file.disabledPluginIds if value != plugin_id
        ]
        state_file.pluginConfigById.pop(plugin_id, None)
        self._save_plugins_state(state_file)

        if scope == PluginScope.global_scope:
            global_state = self._load_plugins_global_state()
            global_state.autoEnabledPluginIds = [
                value
                for value in global_state.autoEnabledPluginIds
                if value != plugin_id
            ]
            self._save_plugins_global_state(global_state)

    def _set_install_metadata(
        self,
        *,
        plugin_id: str,
        scope: PluginScope,
        source_spec: str,
        canonical_source_key: str,
        version: str,
        source_digest_sha256: str,
    ) -> None:
        metadata = self._load_install_metadata()
        key = self._metadata_key(plugin_id, scope)
        existing = metadata.entries.get(key)
        history = existing.history if existing is not None else []
        metadata.entries[key] = PluginInstallMetadataEntry(
            pluginId=plugin_id,
            scope=scope,
            sourceSpec=source_spec,
            canonicalSourceKey=canonical_source_key,
            sourceDigestSha256=source_digest_sha256,
            version=version,
            history=history,
        )
        self._save_install_metadata(metadata)

    def _get_install_metadata(
        self, plugin_id: str, scope: PluginScope
    ) -> PluginInstallMetadataEntry | None:
        metadata = self._load_install_metadata()
        return metadata.entries.get(self._metadata_key(plugin_id, scope))

    def _remove_install_metadata(self, plugin_id: str, scope: PluginScope) -> None:
        metadata = self._load_install_metadata()
        metadata.entries.pop(self._metadata_key(plugin_id, scope), None)
        self._save_install_metadata(metadata)

    def _metadata_key(self, plugin_id: str, scope: PluginScope) -> str:
        return f"{scope.value}:{plugin_id}"

    def _load_plugins_state(self) -> PluginsStateFile:
        if not self._plugins_state_path.exists():
            return PluginsStateFile()
        try:
            payload = json.loads(self._plugins_state_path.read_text(encoding="utf-8"))
            return PluginsStateFile.model_validate(payload)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise PluginManagerError(
                "PLUGIN_STATE_INVALID",
                f"Invalid plugins state file: {self._plugins_state_path}",
            ) from exc

    def _save_plugins_state(self, state_file: PluginsStateFile) -> None:
        self._plugins_state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = state_file.model_dump(mode="json")
        payload["enabledPluginIds"] = sorted(set(payload["enabledPluginIds"]))
        payload["disabledPluginIds"] = sorted(set(payload["disabledPluginIds"]))
        self._plugins_state_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
        )

    def _load_plugins_global_state(self) -> PluginsGlobalStateFile:
        if not self._plugins_global_state_path.exists():
            return PluginsGlobalStateFile()
        try:
            payload = json.loads(
                self._plugins_global_state_path.read_text(encoding="utf-8")
            )
            return PluginsGlobalStateFile.model_validate(payload)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise PluginManagerError(
                "PLUGIN_GLOBAL_STATE_INVALID",
                f"Invalid plugins global state file: {self._plugins_global_state_path}",
            ) from exc

    def _save_plugins_global_state(self, global_state: PluginsGlobalStateFile) -> None:
        self._plugins_global_state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = global_state.model_dump(mode="json")
        payload["autoEnabledPluginIds"] = sorted(set(payload["autoEnabledPluginIds"]))
        self._plugins_global_state_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
        )

    def _load_install_metadata(self) -> PluginInstallMetadataFile:
        if not self._install_metadata_path.exists():
            return PluginInstallMetadataFile()
        try:
            payload = json.loads(
                self._install_metadata_path.read_text(encoding="utf-8")
            )
            return PluginInstallMetadataFile.model_validate(payload)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise PluginManagerError(
                "PLUGIN_INSTALL_METADATA_INVALID",
                f"Invalid plugin install metadata file: {self._install_metadata_path}",
            ) from exc

    def _save_install_metadata(self, metadata: PluginInstallMetadataFile) -> None:
        self._install_metadata_path.parent.mkdir(parents=True, exist_ok=True)
        self._install_metadata_path.write_text(
            json.dumps(metadata.model_dump(mode="json"), indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _target_plugin_path(self, scope: PluginScope, plugin_id: str) -> Path:
        root = self._plugins_root_for_scope(scope)
        root.mkdir(parents=True, exist_ok=True)
        target = (root / plugin_id).resolve(strict=False)
        if not target.is_relative_to(root.resolve(strict=False)):
            raise PluginManagerError(
                "PLUGIN_TARGET_PATH_TRAVERSAL",
                f"Resolved plugin target escapes plugin root: {target}",
            )
        return target

    def _plugins_root_for_scope(self, scope: PluginScope) -> Path:
        if scope == PluginScope.workspace:
            return (self.workspace_root / "plugins").resolve(strict=False)
        if scope == PluginScope.setta_files:
            return (self.setta_files_root / "plugins").resolve(strict=False)
        return (self.setta_home / "plugins").resolve(strict=False)

    def _parse_source_spec(self, source_spec: str) -> ParsedSourceSpec:
        raw = source_spec.strip()
        if ":" not in raw:
            raise PluginManagerError(
                "PLUGIN_SOURCE_SCHEME_UNSUPPORTED",
                f"Unsupported plugin source spec: {source_spec}",
            )
        scheme_raw, rest = raw.split(":", 1)
        scheme = scheme_raw.strip().lower()
        if scheme == PluginSourceScheme.github.value:
            if not rest:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_INVALID",
                    "GitHub source must be github:<owner>/<repo>[#ref].",
                )
            repo_spec, _, ref = rest.partition("#")
            owner, _, repo = repo_spec.partition("/")
            if not owner or not repo:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_INVALID",
                    "GitHub source must be github:<owner>/<repo>[#ref].",
                )
            return ParsedSourceSpec(
                scheme=PluginSourceScheme.github,
                raw=raw,
                canonical_source_key=f"github:{owner}/{repo}",
                owner=owner,
                repo=repo,
                ref=ref or None,
            )
        if scheme == PluginSourceScheme.pypi.value:
            package_spec = rest.strip()
            if not package_spec:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_INVALID",
                    "PyPI source must be pypi:<package>[==version].",
                )
            package_name, version = self._split_pypi_spec(package_spec)
            return ParsedSourceSpec(
                scheme=PluginSourceScheme.pypi,
                raw=raw,
                canonical_source_key=f"pypi:{package_name}",
                package=package_name,
                version=version,
            )
        raise PluginManagerError(
            "PLUGIN_SOURCE_SCHEME_UNSUPPORTED",
            f"Unsupported plugin source scheme: {scheme}",
        )

    def _split_pypi_spec(self, package_spec: str) -> tuple[str, str | None]:
        if "==" not in package_spec:
            normalized_name = self._normalize_package_name(package_spec)
            return normalized_name, None
        package_name, version = package_spec.split("==", 1)
        normalized_name = self._normalize_package_name(package_name)
        version_trimmed = version.strip()
        if not version_trimmed:
            raise PluginManagerError(
                "PLUGIN_SOURCE_INVALID",
                f"Invalid PyPI source spec: {package_spec}",
            )
        return normalized_name, version_trimmed

    def _normalize_package_name(self, package_name: str) -> str:
        trimmed = package_name.strip().lower()
        if not trimmed:
            raise PluginManagerError(
                "PLUGIN_SOURCE_INVALID",
                f"Invalid package name: {package_name!r}",
            )
        normalized_chars: list[str] = []
        for char in trimmed:
            if char.isalnum() or char in {"-", "_", "."}:
                normalized_chars.append(char)
            else:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_INVALID",
                    f"Invalid package name: {package_name!r}",
                )
        normalized = "".join(normalized_chars)
        return normalized

    def _extract_artifact(self, artifact_path: Path, extract_root: Path) -> None:
        name = artifact_path.name.lower()
        if name.endswith(".whl") or name.endswith(".zip"):
            with zipfile.ZipFile(artifact_path, "r") as archive:
                archive.extractall(extract_root)
            return
        if name.endswith(".tar.gz") or name.endswith(".tgz"):
            with tarfile.open(artifact_path, "r:gz") as archive:
                archive.extractall(extract_root)
            return
        raise PluginManagerError(
            "PLUGIN_SOURCE_FETCH_FAILED",
            f"Unsupported artifact type for plugin source: {artifact_path.name}",
        )

    def _read_pyproject_metadata_optional(
        self, root: Path
    ) -> tuple[str | None, str | None]:
        pyproject_path = root / "pyproject.toml"
        if not pyproject_path.exists() or not pyproject_path.is_file():
            return None, None
        try:
            import tomllib

            payload = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None, None
        project = payload.get("project")
        if not isinstance(project, dict):
            return None, None
        raw_name = project.get("name")
        raw_version = project.get("version")
        name = raw_name.strip() if isinstance(raw_name, str) else None
        version = raw_version.strip() if isinstance(raw_version, str) else None
        return name or None, version or None

    def _read_package_metadata_optional(
        self, root: Path
    ) -> tuple[str | None, str | None]:
        metadata_files = sorted(
            root.rglob("*.dist-info/METADATA"), key=lambda path: str(path)
        )
        if len(metadata_files) == 0:
            return None, None
        metadata_path = metadata_files[0]
        raw_name: str | None = None
        raw_version: str | None = None
        for line in metadata_path.read_text(
            encoding="utf-8", errors="ignore"
        ).splitlines():
            if line.startswith("Name:") and raw_name is None:
                raw_name = line.split(":", 1)[1].strip()
            elif line.startswith("Version:") and raw_version is None:
                raw_version = line.split(":", 1)[1].strip()
            if raw_name and raw_version:
                break
        return raw_name, raw_version

    def _validate_metadata_identity(
        self,
        *,
        root: Path,
        manifest: PluginManifest,
        package_name: str | None,
        package_version: str | None,
    ) -> None:
        if package_name is None and package_version is None:
            return
        if package_name is not None:
            normalized_metadata_name = self._normalize_identity_value(package_name)
            normalized_manifest_id = self._normalize_identity_value(manifest.id)
            if normalized_metadata_name != normalized_manifest_id:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_IDENTITY_MISMATCH",
                    (
                        f"Package name {package_name!r} does not match manifest id "
                        f"{manifest.id!r} in {root}"
                    ),
                )
        if package_version is not None and package_version != manifest.version:
            raise PluginManagerError(
                "PLUGIN_SOURCE_VERSION_MISMATCH",
                (
                    f"Package version {package_version!r} does not match manifest version "
                    f"{manifest.version!r} in {root}"
                ),
            )

    def _normalize_identity_value(self, raw: str) -> str:
        value = raw.strip().lower()
        normalized_chars: list[str] = []
        for char in value:
            if char.isalnum():
                normalized_chars.append(char)
            elif char in {"-", "_", "."}:
                normalized_chars.append("-")
            else:
                normalized_chars.append("-")
        normalized = "".join(normalized_chars)
        while "--" in normalized:
            normalized = normalized.replace("--", "-")
        return normalized.strip("-")

    def _compute_directory_digest(self, root: Path) -> str:
        hasher = hashlib.sha256()
        for path in sorted(root.rglob("*"), key=lambda item: str(item)):
            if path.is_dir():
                continue
            if path.is_symlink():
                continue
            relative_path = path.relative_to(root).as_posix()
            hasher.update(relative_path.encode("utf-8"))
            with path.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    hasher.update(chunk)
        return hasher.hexdigest()

    def _resolve_relative_path(
        self,
        root: Path,
        relative_path: str,
        *,
        code: str,
        message_prefix: str,
    ) -> Path:
        raw = relative_path.strip()
        if not raw:
            raise PluginManagerError(code, f"{message_prefix}: empty path")
        candidate = (root / raw).resolve(strict=False)
        root_resolved = root.resolve(strict=False)
        if not candidate.is_relative_to(root_resolved):
            raise PluginManagerError(
                code,
                f"{message_prefix}: path escapes plugin root ({relative_path})",
            )
        return candidate

    def _resolve_optional_relative_directory(
        self, root: Path, relative_path: str | None
    ) -> Path | None:
        if relative_path is None:
            return None
        return self._resolve_relative_path(
            root,
            relative_path,
            code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
            message_prefix="Invalid directory path",
        )

    def _directory_has_files(self, path: Path | None) -> bool:
        if path is None:
            return False
        if not path.exists() or not path.is_dir():
            return False
        for child in path.iterdir():
            if child.is_file():
                return True
            if child.is_dir() and self._directory_has_files(child):
                return True
        return False

    def _build_plugin_asset_url(
        self, entry: DiscoveredPlugin, relative_path: str | None
    ) -> str | None:
        if relative_path is None:
            return None
        if entry.manifest is None:
            return None
        resolved = self._resolve_relative_path(
            entry.source_path,
            relative_path,
            code="PLUGIN_ASSET_INVALID_PATH",
            message_prefix="Invalid plugin asset path",
        )
        if not resolved.exists() or not resolved.is_file():
            return None
        base_url = f"/plugins/{entry.plugin_id}/{relative_path}"
        if entry.source_digest_sha256:
            return f"{base_url}?v={entry.source_digest_sha256}"
        return base_url

    def _find_entry(
        self, plugin_id: str, scope: PluginScope
    ) -> DiscoveredPlugin | None:
        for entry in self._discovered_plugins:
            if entry.plugin_id == plugin_id and entry.scope == scope:
                if entry.shadowed_by_source_path is None:
                    return entry
        return None

    def _find_highest_precedence_entry(self, plugin_id: str) -> DiscoveredPlugin | None:
        entries = [
            entry for entry in self._discovered_plugins if entry.plugin_id == plugin_id
        ]
        if len(entries) == 0:
            return None
        ordered = sorted(
            entries,
            key=lambda entry: (
                _SCOPE_ORDER[entry.scope],
                str(entry.source_path),
            ),
        )
        return ordered[0]

    def _resolve_uninstall_scope(
        self, plugin_id: str, scope: str | PluginScope | None
    ) -> PluginScope:
        if scope is not None:
            return normalize_scope(scope)
        matches = [
            entry for entry in self._discovered_plugins if entry.plugin_id == plugin_id
        ]
        unique_scopes = sorted(
            {entry.scope for entry in matches}, key=lambda value: _SCOPE_ORDER[value]
        )
        if len(unique_scopes) == 0:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        if len(unique_scopes) > 1:
            raise PluginManagerError(
                "PLUGIN_UNINSTALL_SCOPE_REQUIRED",
                f"Plugin exists in multiple scopes; scope is required: {plugin_id}",
            )
        return unique_scopes[0]

    def _retarget_source_spec(self, source_spec: str, to: str) -> str:
        trimmed_to = to.strip()
        if not trimmed_to:
            return source_spec
        if ":" in trimmed_to:
            return trimmed_to
        if source_spec.startswith("github:"):
            repo_spec, _, _ = source_spec.partition("#")
            return f"{repo_spec}#{trimmed_to}"
        if source_spec.startswith("pypi:"):
            package_spec = source_spec[len("pypi:") :]
            package_name, _ = self._split_pypi_spec(package_spec)
            if trimmed_to.startswith("pypi:"):
                return trimmed_to
            if "==" in trimmed_to:
                return f"pypi:{trimmed_to}"
            return f"pypi:{package_name}=={trimmed_to}"
        return source_spec
