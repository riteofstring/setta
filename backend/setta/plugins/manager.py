import asyncio
import base64
import hashlib
import importlib.metadata
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import tomllib
import zipfile
from collections import OrderedDict
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path, PurePosixPath, PureWindowsPath
from queue import Empty, Full, Queue
from typing import TYPE_CHECKING, Any, Literal, Optional
from urllib.parse import quote, unquote
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from jsonschema import ValidationError as JSONSchemaValidationError
from jsonschema import validate as jsonschema_validate
from packaging.requirements import InvalidRequirement, Requirement
from packaging.specifiers import InvalidSpecifier, SpecifierSet
from packaging.version import InvalidVersion, Version
from pydantic import ValidationError

from setta.lsp.registrations import RegisteredLanguageServer
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
    PluginEnablementSource,
    PluginErrorInfo,
    PluginFrontendDescriptor,
    PluginInstallerBackend,
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
    PluginRegisteredCodegenTarget,
    PluginRegisteredExternalAgentAdapter,
    PluginRegisteredLanguageServer,
    PluginRestartCapability,
    PluginRollbackResponse,
    PluginRuntimeResponse,
    PluginRuntimeState,
    PluginScope,
    PluginsGlobalStateFile,
    PluginsLockFile,
    PluginSourceManager,
    PluginSourceScheme,
    PluginSourceTrustStatus,
    PluginsRescanResponse,
    PluginsStateFile,
    PluginStatusEntry,
    PluginStatusResponse,
    PluginUninstallResponse,
    PluginUpdateResponse,
    normalize_installer_backend,
    normalize_scope,
    scope_label,
)
from setta.types.external_agents import ExternalAgentRunMode
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    convert_backend_to_single_config,
)
from setta.types.listener import DependencyEvent
from setta.types.project_config import ProjectCodegenLanguage
from setta.types.section_impls import (
    CodeLanguage,
    CodeLanguageKey,
    code_language_to_string,
    normalize_code_language,
)
from setta.utils.command_paths import is_path_like_command

if TYPE_CHECKING:
    from fastapi import APIRouter, FastAPI

_SCOPE_ORDER = {
    PluginScope.workspace: 0,
    PluginScope.setta_files: 1,
    PluginScope.global_scope: 2,
}

_SOURCE_MANAGER_ORDER = {
    PluginSourceManager.setta: 0,
    PluginSourceManager.package_manager: 1,
}

_PLUGIN_MOUNT_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._~-]+$")

_MODE_ALLOWED_CAPABILITIES = {
    "ide": PLUGIN_CAPABILITIES_SET,
    "share": frozenset(
        {
            "registerSectionKinds",
            "registerPane",
            "registerCommand",
            "registerTopNavBarItem",
            "registerContextMenu",
            "readProjectState",
            "subscribeProjectState",
            "emitListenerEvents",
        }
    ),
    "app": frozenset(
        {
            "registerSectionKinds",
            "registerPane",
            "registerCommand",
            "registerTopNavBarItem",
            "registerContextMenu",
            "readProjectState",
            "subscribeProjectState",
            "emitListenerEvents",
        }
    ),
}
_HOST_BLOCKED_CAPABILITIES = frozenset({"registerContextMenu"})

_BACKEND_WORKER_STDERR_MAX_LINES = 200

_BACKEND_PLUGIN_API_VERSION = 1
_UNVERIFIED_SOURCE_WARNING = "Source is unverified. Install only from trusted owners."
_PACKAGE_MANAGER_SOURCE_HINT = (
    "Managed by Python package manager in active environment. "
    "Use uv/pip/Poetry to install, update, or remove."
)
_REDACTED_SOURCE_PATH = "[redacted]"
_REDACTED_CANONICAL_SOURCE_KEY_PREFIX = "redacted:"
_REQUIRED_BACKEND_RPC_METHODS = frozenset(
    {
        "plugin.initialize",
        "plugin.register",
        "plugin.shutdown",
        "plugin.invoke_codegen_target",
        "host.register_router",
        "host.register_listener_endpoint",
        "host.register_static_dir",
        "host.register_mcp_tool",
        "host.register_language_server",
        "host.register_external_agent_adapter",
        "host.register_codegen_target",
        "host.read_project_state",
        "host.emit_listener_dependency_event",
    }
)
_DIRECTORY_DIGEST_CACHE_MAX_ENTRIES = 256
_PACKAGE_MANAGER_SOURCE_DIGEST_CACHE_MAX_ENTRIES = 256
_GITHUB_CLONE_TIMEOUT_SECONDS_ENV = "SETTA_PLUGIN_GITHUB_CLONE_TIMEOUT_SECONDS"
_GITHUB_CLONE_TIMEOUT_SECONDS_DEFAULT = 30.0
_GITHUB_CLONE_TIMEOUT_SECONDS_MIN = 1.0
_GITHUB_CLONE_TIMEOUT_SECONDS_MAX = 600.0
_BACKEND_RUNTIME_WORKER_DISTRIBUTIONS = ("pydantic", "starlette", "fastapi")


def _resolve_github_clone_timeout_seconds_from_env() -> float:
    raw_timeout = os.environ.get(_GITHUB_CLONE_TIMEOUT_SECONDS_ENV)
    if raw_timeout is None:
        return _GITHUB_CLONE_TIMEOUT_SECONDS_DEFAULT
    normalized_timeout = raw_timeout.strip()
    if normalized_timeout == "":
        return _GITHUB_CLONE_TIMEOUT_SECONDS_DEFAULT
    try:
        timeout_seconds = float(normalized_timeout)
    except ValueError:
        return _GITHUB_CLONE_TIMEOUT_SECONDS_DEFAULT
    if not math.isfinite(timeout_seconds):
        return _GITHUB_CLONE_TIMEOUT_SECONDS_DEFAULT
    if timeout_seconds < _GITHUB_CLONE_TIMEOUT_SECONDS_MIN:
        return _GITHUB_CLONE_TIMEOUT_SECONDS_MIN
    if timeout_seconds > _GITHUB_CLONE_TIMEOUT_SECONDS_MAX:
        return _GITHUB_CLONE_TIMEOUT_SECONDS_MAX
    return timeout_seconds


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
    source_manager: PluginSourceManager = PluginSourceManager.setta
    source_manager_hint: str | None = None
    errors: list[PluginErrorInfo] = field(default_factory=list)
    state: PluginRuntimeState = PluginRuntimeState.invalid
    shadowed_by_source_path: Path | None = None
    requested_capabilities: list[str] = field(default_factory=list)
    effective_capabilities: list[str] = field(default_factory=list)
    blocked_capabilities: list[PluginBlockedCapability] = field(default_factory=list)
    enablement_source: PluginEnablementSource | None = None
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


@dataclass(slots=True, frozen=True)
class PendingRestartRemovedBackendPlugin:
    plugin_id: str
    name: str
    version: str
    scope: PluginScope
    source_path: Path
    canonical_source_key: str
    source_digest_sha256: str | None
    requested_capabilities: list[str]
    effective_capabilities: list[str]
    blocked_capabilities: list[PluginBlockedCapability]


@dataclass(slots=True, frozen=True)
class RegisteredBackendCodegenTarget:
    target_id: str
    plugin_id: str
    language: str
    name: str
    default_file_name: str
    handler_id: str


@dataclass(slots=True)
class _BackendRegistrationSnapshot:
    app_routes: list[Any]
    backend_route_ids_by_plugin_id: dict[str, set[str]]
    backend_listener_endpoint_route_by_name: dict[str, tuple[str, str]]
    backend_registered_mcp_tools: dict[str, list[Callable[..., Any]]]
    backend_external_agent_adapters: dict[
        str, list[PluginRegisteredExternalAgentAdapter]
    ]
    backend_external_agent_adapter_by_id: dict[
        str, PluginRegisteredExternalAgentAdapter
    ]
    backend_language_servers: dict[str, list[RegisteredLanguageServer]]
    backend_language_server_by_language: dict[CodeLanguageKey, RegisteredLanguageServer]
    backend_codegen_targets: dict[str, list[PluginRegisteredCodegenTarget]]
    backend_codegen_target_by_id: dict[str, RegisteredBackendCodegenTarget]
    setta_mcp_tools: list[Callable[..., Any]]


@dataclass(slots=True, frozen=True)
class _StatusEntryRuntimeDigestCacheEntry:
    requested_capabilities: tuple[str, ...]
    effective_capabilities: tuple[str, ...]
    blocked_capabilities: tuple[tuple[str, str], ...]
    errors: tuple[tuple[str, str], ...]
    backend_registration_generation: int
    include_backend_registrations: bool
    digest: str


@dataclass(slots=True)
class _RuntimePathLockEntry:
    lock: threading.Lock
    waiter_count: int


def _mutation_locked(method: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(method)
    def wrapped(self: "PluginManager", *args: Any, **kwargs: Any) -> Any:
        with self._mutation_lock:
            return method(self, *args, **kwargs)

    return wrapped


class _BackendWorkerPipeReader:
    def __init__(
        self,
        stream: Any,
        *,
        max_buffered_lines: int | None = None,
    ) -> None:
        self._stream = stream
        if max_buffered_lines is None:
            queue_max_size = 0
        else:
            queue_max_size = max(1, max_buffered_lines)
        self._queue: Queue[str | BaseException] = Queue(maxsize=queue_max_size)
        self._max_buffered_lines = max_buffered_lines
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def _enqueue(self, value: str | BaseException) -> None:
        if self._max_buffered_lines is None:
            self._queue.put(value)
            return
        while True:
            try:
                self._queue.put_nowait(value)
                return
            except Full:
                try:
                    self._queue.get_nowait()
                except Empty:
                    continue

    def _read_loop(self) -> None:
        while True:
            try:
                line = self._stream.readline()
            except BaseException as exc:
                self._enqueue(exc)
                return
            self._enqueue(line)
            if line == "":
                return

    def read_line(self, *, timeout_seconds: float) -> str | None:
        try:
            if timeout_seconds <= 0:
                value = self._queue.get_nowait()
            else:
                value = self._queue.get(timeout=timeout_seconds)
        except Empty:
            return None
        if isinstance(value, BaseException):
            raise value
        return value

    def join(self, *, timeout_seconds: float) -> None:
        self._thread.join(timeout=timeout_seconds)


class PluginManager:
    def __init__(
        self,
        *,
        workspace_root: Path,
        setta_files_root: Path,
        setta_home: Path,
        server_mode: Literal["ide", "share", "app"],
        setta_version: str,
        github_base_url: str | None = None,
        restart_command: str | None = None,
        restart_callback: Callable[[], bool] | None = None,
        backend_startup_timeout_seconds: float = 10.0,
        backend_register_timeout_seconds: float = 10.0,
        backend_operation_timeout_seconds: float = 120.0,
        package_manager_search_paths: list[Path] | None = None,
        auto_rescan: bool = True,
    ) -> None:
        self.workspace_root = workspace_root
        self.setta_files_root = setta_files_root
        self.setta_home = setta_home
        self.server_mode = server_mode
        self.setta_version = setta_version
        if github_base_url is None:
            github_base_url = os.environ.get(
                "SETTA_PLUGIN_GITHUB_BASE_URL", "https://github.com"
            )
        self._github_base_url = github_base_url.rstrip("/")
        self._github_clone_timeout_seconds = (
            _resolve_github_clone_timeout_seconds_from_env()
        )
        self._restart_command = restart_command or "setta"
        self._restart_callback = restart_callback
        self._backend_startup_timeout_seconds = backend_startup_timeout_seconds
        self._backend_register_timeout_seconds = backend_register_timeout_seconds
        self._backend_operation_timeout_seconds = backend_operation_timeout_seconds
        self._package_manager_search_paths = package_manager_search_paths
        self._mutation_lock = threading.RLock()
        self._runtime_path_locks: dict[Path, _RuntimePathLockEntry] = {}
        self._runtime_path_locks_guard = threading.Lock()

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
        self._lockfile_path = (
            self.workspace_root / ".setta_plugins" / "plugins.lock.json"
        )
        self._runtime_root = self.setta_files_root / "plugins_runtime"
        self._plugins_state_cache: tuple[int, int, PluginsStateFile] | None = None
        self._directory_digest_cache: OrderedDict[str, tuple[str, str]] = OrderedDict()
        self._package_manager_source_digest_cache: OrderedDict[str, str] = OrderedDict()
        self._content_descriptor_cache: dict[
            tuple[str, PluginScope, str | None], PluginContentDescriptor
        ] = {}
        self._config_schema_descriptor_cache: dict[
            tuple[str, PluginScope, str | None], tuple[bool, dict[str, Any] | None]
        ] = {}
        self._backend_registration_generation = 0
        self._status_runtime_payload_digest_cache: dict[
            tuple[str, PluginScope, str],
            _StatusEntryRuntimeDigestCacheEntry,
        ] = {}

        initial_plugins_state = self._load_plugins_state()
        self._pending_restart_backend_ids: set[str] = set(
            initial_plugins_state.pendingRestartBackendPluginIds
        )
        self._pending_restart_removed_backend_plugins: dict[
            str, PendingRestartRemovedBackendPlugin
        ] = {}
        self._backend_runtime_errors: dict[str, PluginErrorInfo] = {}
        self._backend_loaded_plugin_ids: set[str] = set()
        self._backend_worker_processes: dict[str, subprocess.Popen[str]] = {}
        self._backend_worker_request_locks: dict[str, threading.Lock] = {}
        self._backend_worker_next_request_ids: dict[str, int] = {}
        self._backend_worker_request_state_lock = threading.Lock()
        self._backend_worker_pipe_readers: dict[int, _BackendWorkerPipeReader] = {}
        self._backend_worker_pipe_readers_lock = threading.Lock()
        self._backend_app: Optional["FastAPI"] = None
        self._backend_route_ids_by_plugin_id: dict[str, set[str]] = {}
        self._backend_listener_endpoint_route_by_name: dict[str, tuple[str, str]] = {}
        self._backend_registered_mcp_tools: dict[str, list[Callable[..., Any]]] = {}
        self._backend_external_agent_adapters: dict[
            str, list[PluginRegisteredExternalAgentAdapter]
        ] = {}
        self._backend_external_agent_adapter_by_id: dict[
            str, PluginRegisteredExternalAgentAdapter
        ] = {}
        self._backend_language_servers: dict[str, list[RegisteredLanguageServer]] = {}
        self._backend_language_server_by_language: dict[
            CodeLanguageKey, RegisteredLanguageServer
        ] = {}
        self._backend_codegen_targets: dict[
            str, list[PluginRegisteredCodegenTarget]
        ] = {}
        self._backend_codegen_target_by_id: dict[
            str, RegisteredBackendCodegenTarget
        ] = {}
        self._install_target_reservations: set[Path] = set()
        self._discovered_plugins: list[DiscoveredPlugin] = []
        self._active_plugin_by_id: dict[str, DiscoveredPlugin] = {}

        if auto_rescan:
            self.rescan()

    def __del__(self) -> None:
        if sys.is_finalizing():
            return
        try:
            self.shutdown_backend_plugins()
        except Exception:
            return

    @_mutation_locked
    def load_backend_plugins(self, *, app: "FastAPI") -> None:
        self._clear_pending_restart_backend_ids()
        self._pending_restart_removed_backend_plugins = {}
        self.shutdown_backend_plugins()
        self._backend_app = app

        # Refresh discovery after clearing pending-restart ids so eligible backend
        # plugins transition from pending_restart to active before load selection.
        self.rescan()
        backend_entries = self._backend_entries_for_load()
        for entry in backend_entries:
            try:
                self._load_backend_plugin_entry(app=app, entry=entry)
            except PluginManagerError as exc:
                self._backend_runtime_errors[entry.plugin_id] = PluginErrorInfo(
                    code=exc.code,
                    message=exc.message,
                )
                continue
            except Exception as exc:
                self._backend_runtime_errors[entry.plugin_id] = PluginErrorInfo(
                    code="PLUGIN_BACKEND_IMPORT_FAILED",
                    message=f"Backend plugin load failed for {entry.plugin_id}: {exc}",
                )
                continue
            self._backend_loaded_plugin_ids.add(entry.plugin_id)
        self._refresh_discovery_after_backend_load()

    def _refresh_discovery_after_backend_load(self) -> None:
        for entry in self._discovered_plugins:
            if entry.shadowed_by_source_path is not None:
                continue
            if not entry.has_backend:
                continue
            runtime_error = self._backend_runtime_errors.get(entry.plugin_id)
            if runtime_error is None:
                continue
            entry.state = PluginRuntimeState.invalid
            entry.restart_required = False
            if not any(
                error.code == runtime_error.code
                and error.message == runtime_error.message
                for error in entry.errors
            ):
                entry.errors.append(
                    PluginErrorInfo(
                        code=runtime_error.code,
                        message=runtime_error.message,
                    )
                )
        self._active_plugin_by_id = {
            entry.plugin_id: entry
            for entry in self._discovered_plugins
            if entry.state
            in {PluginRuntimeState.active, PluginRuntimeState.pending_restart}
        }

    @_mutation_locked
    def shutdown_backend_plugins(self) -> None:
        for plugin_id, process in list(self._backend_worker_processes.items()):
            self._shutdown_backend_worker(plugin_id=plugin_id, process=process)
        self._reset_backend_runtime_state()

    @_mutation_locked
    def rescan(
        self, *, include_package_manager_plugins: bool = True
    ) -> PluginsRescanResponse:
        discovered = self._discover_plugins(
            include_package_manager_plugins=include_package_manager_plugins
        )
        self._content_descriptor_cache = {}
        self._config_schema_descriptor_cache = {}
        self._status_runtime_payload_digest_cache = {}
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

    def _reset_backend_runtime_state(self) -> None:
        self._backend_worker_processes = {}
        self._backend_worker_request_locks = {}
        self._backend_worker_next_request_ids = {}
        self._backend_worker_pipe_readers = {}
        self._backend_app = None
        self._backend_runtime_errors = {}
        self._backend_loaded_plugin_ids = set()
        self._backend_route_ids_by_plugin_id = {}
        self._backend_listener_endpoint_route_by_name = {}
        self._remove_backend_registered_mcp_tools()
        self._backend_external_agent_adapters = {}
        self._backend_external_agent_adapter_by_id = {}
        self._backend_language_servers = {}
        self._backend_language_server_by_language = {}
        self._backend_codegen_targets = {}
        self._backend_codegen_target_by_id = {}
        self._mark_backend_registration_state_changed()

    def _mark_backend_registration_state_changed(self) -> None:
        self._backend_registration_generation += 1
        self._status_runtime_payload_digest_cache = {}

    def _build_list_entries(
        self,
        *,
        entries: list[DiscoveredPlugin],
        plugins_state: PluginsStateFile | None,
        redact_source_details: bool,
        redact_config_details: bool,
    ) -> list[PluginListEntry]:
        list_entries: list[PluginListEntry] = []
        for entry in entries:
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
                if entry.manifest.frontend is not None and entry.manifest.frontend.style
                else None,
            )
            content = self._build_content_descriptor(entry)
            if redact_config_details:
                config = self._build_redacted_config_descriptor(entry)
            else:
                if plugins_state is None:
                    raise PluginManagerError(
                        "PLUGIN_RUNTIME_STATE_INVALID",
                        "Plugin runtime list requires plugins state for config details.",
                    )
                config = self._build_config_descriptor(
                    entry, plugins_state=plugins_state
                )
            list_entries.append(
                PluginListEntry(
                    pluginId=entry.plugin_id,
                    name=entry.name,
                    version=entry.version,
                    sourceScope=entry.scope,
                    sourceScopeLabel=scope_label(entry.scope),
                    sourceManager=entry.source_manager,
                    sourceManagerHint=entry.source_manager_hint,
                    canonicalSourceKey=(
                        self._redacted_canonical_source_key(
                            entry.plugin_id,
                            entry.scope,
                            entry.source_manager,
                            entry.source_path,
                        )
                        if redact_source_details
                        else entry.canonical_source_key
                    ),
                    sourceDigestSha256=entry.source_digest_sha256,
                    frontend=frontend,
                    content=content,
                    config=config,
                    effectiveCapabilities=entry.effective_capabilities,
                    enablementSource=entry.enablement_source,
                    restartRequired=entry.restart_required,
                )
            )
        return list_entries

    def _sorted_active_entries(self) -> list[DiscoveredPlugin]:
        return sorted(
            self._active_plugin_by_id.values(), key=lambda item: item.plugin_id
        )

    def _sorted_discovered_entries(self) -> list[DiscoveredPlugin]:
        return sorted(
            self._discovered_plugins,
            key=lambda entry: (
                entry.plugin_id,
                _SCOPE_ORDER[entry.scope],
                _SOURCE_MANAGER_ORDER[entry.source_manager],
                str(entry.source_path),
            ),
        )

    def _build_plugin_list_response(
        self,
        *,
        entries: list[DiscoveredPlugin],
        plugins_state: PluginsStateFile | None,
        restart_capability: PluginRestartCapability,
        redact_source_details: bool,
        redact_config_details: bool,
    ) -> PluginListResponse:
        plugins = self._build_list_entries(
            entries=entries,
            plugins_state=plugins_state,
            redact_source_details=redact_source_details,
            redact_config_details=redact_config_details,
        )
        return PluginListResponse(
            serverMode=self.server_mode,
            restartCapability=restart_capability,
            plugins=plugins,
        )

    def _build_plugin_status_response(
        self,
        *,
        entries: list[DiscoveredPlugin],
        restart_capability: PluginRestartCapability,
        redact_source_details: bool,
        redacted_source_path_by_path: dict[Path, str],
    ) -> PluginStatusResponse:
        return PluginStatusResponse(
            serverMode=self.server_mode,
            restartCapability=restart_capability,
            plugins=[
                self._build_status_entry(
                    entry=entry,
                    redact_source_details=redact_source_details,
                    redacted_source_path_by_path=redacted_source_path_by_path,
                )
                for entry in entries
            ],
        )

    @_mutation_locked
    def get_status_response(self) -> PluginStatusResponse:
        ordered_entries = self._sorted_discovered_entries()
        redact_source_details = self._should_redact_source_details()
        redacted_source_path_by_path: dict[Path, str] = {}
        if redact_source_details:
            redacted_source_path_by_path = self._build_redacted_source_path_map(
                ordered_entries
            )
        return self._build_plugin_status_response(
            entries=ordered_entries,
            restart_capability=self.get_restart_capability(),
            redact_source_details=redact_source_details,
            redacted_source_path_by_path=redacted_source_path_by_path,
        )

    @_mutation_locked
    def get_runtime_response(self) -> PluginRuntimeResponse:
        restart_capability = self.get_restart_capability()
        redact_source_details = self._should_redact_source_details()
        redact_config_details = self._should_redact_config_details()
        active_entries = self._sorted_active_entries()
        ordered_entries = self._sorted_discovered_entries()
        redacted_source_path_by_path: dict[Path, str] = {}
        if redact_source_details:
            redacted_source_path_by_path = self._build_redacted_source_path_map(
                ordered_entries
            )
        plugins_state: PluginsStateFile | None = None
        if not redact_config_details:
            plugins_state = self._load_plugins_state()
        return PluginRuntimeResponse(
            list=self._build_plugin_list_response(
                entries=active_entries,
                plugins_state=plugins_state,
                restart_capability=restart_capability,
                redact_source_details=redact_source_details,
                redact_config_details=redact_config_details,
            ),
            status=self._build_plugin_status_response(
                entries=ordered_entries,
                restart_capability=restart_capability,
                redact_source_details=redact_source_details,
                redacted_source_path_by_path=redacted_source_path_by_path,
            ),
        )

    def _build_status_entry(
        self,
        *,
        entry: DiscoveredPlugin,
        redact_source_details: bool,
        redacted_source_path_by_path: dict[Path, str],
    ) -> PluginStatusEntry:
        include_backend_registrations = (
            self._status_entry_should_include_backend_registrations(entry)
        )
        registered_language_servers = (
            self._serialize_registered_language_servers(entry.plugin_id)
            if include_backend_registrations
            else []
        )
        registered_external_adapters = (
            self._serialize_registered_external_agent_adapters(entry.plugin_id)
            if include_backend_registrations
            else []
        )
        registered_codegen_targets = (
            self._serialize_registered_codegen_targets(entry.plugin_id)
            if include_backend_registrations
            else []
        )
        runtime_payload_digest = self._resolve_status_entry_runtime_payload_digest(
            entry=entry,
            include_backend_registrations=include_backend_registrations,
            registered_language_servers=registered_language_servers,
            registered_external_adapters=registered_external_adapters,
            registered_codegen_targets=registered_codegen_targets,
        )
        return PluginStatusEntry(
            pluginId=entry.plugin_id,
            name=entry.name,
            version=entry.version,
            state=entry.state,
            sourceScope=entry.scope,
            sourceScopeLabel=scope_label(entry.scope),
            sourceManager=entry.source_manager,
            sourceManagerHint=entry.source_manager_hint,
            sourcePath=(
                redacted_source_path_by_path[entry.source_path]
                if redact_source_details
                else str(entry.source_path)
            ),
            canonicalSourceKey=(
                self._redacted_canonical_source_key(
                    entry.plugin_id,
                    entry.scope,
                    entry.source_manager,
                    entry.source_path,
                )
                if redact_source_details
                else entry.canonical_source_key
            ),
            sourceDigestSha256=entry.source_digest_sha256,
            shadowedBySourcePath=(
                (
                    redacted_source_path_by_path[entry.shadowed_by_source_path]
                    if redact_source_details
                    else str(entry.shadowed_by_source_path)
                )
                if entry.shadowed_by_source_path is not None
                else None
            ),
            requestedCapabilities=entry.requested_capabilities,
            effectiveCapabilities=entry.effective_capabilities,
            blockedCapabilities=entry.blocked_capabilities,
            registeredLanguageServers=registered_language_servers,
            registeredExternalAgentAdapters=registered_external_adapters,
            registeredCodegenTargets=registered_codegen_targets,
            enablementSource=entry.enablement_source,
            restartRequired=entry.restart_required,
            runtimePayloadDigestSha256=runtime_payload_digest,
            errors=entry.errors,
        )

    def _resolve_status_entry_runtime_payload_digest(
        self,
        *,
        entry: DiscoveredPlugin,
        include_backend_registrations: bool,
        registered_language_servers: list[PluginRegisteredLanguageServer],
        registered_external_adapters: list[PluginRegisteredExternalAgentAdapter],
        registered_codegen_targets: list[PluginRegisteredCodegenTarget],
    ) -> str:
        cache_key = (entry.plugin_id, entry.scope, str(entry.source_path))
        blocked_capabilities = tuple(
            (
                blocked.capability,
                blocked.reason.value
                if hasattr(blocked.reason, "value")
                else str(blocked.reason),
            )
            for blocked in entry.blocked_capabilities
        )
        errors = tuple((error.code, error.message) for error in entry.errors)
        requested_capabilities = tuple(entry.requested_capabilities)
        effective_capabilities = tuple(entry.effective_capabilities)
        cached = self._status_runtime_payload_digest_cache.get(cache_key)
        if (
            cached is not None
            and cached.requested_capabilities == requested_capabilities
            and cached.effective_capabilities == effective_capabilities
            and cached.blocked_capabilities == blocked_capabilities
            and cached.errors == errors
            and cached.backend_registration_generation
            == self._backend_registration_generation
            and cached.include_backend_registrations == include_backend_registrations
        ):
            return cached.digest

        digest = self._compute_json_payload_digest(
            {
                "requestedCapabilities": entry.requested_capabilities,
                "effectiveCapabilities": entry.effective_capabilities,
                "blockedCapabilities": entry.blocked_capabilities,
                "registeredLanguageServers": registered_language_servers,
                "registeredExternalAgentAdapters": registered_external_adapters,
                "registeredCodegenTargets": registered_codegen_targets,
                "errors": entry.errors,
            }
        )
        self._status_runtime_payload_digest_cache[cache_key] = (
            _StatusEntryRuntimeDigestCacheEntry(
                requested_capabilities=requested_capabilities,
                effective_capabilities=effective_capabilities,
                blocked_capabilities=blocked_capabilities,
                errors=errors,
                backend_registration_generation=self._backend_registration_generation,
                include_backend_registrations=include_backend_registrations,
                digest=digest,
            )
        )
        return digest

    def _status_entry_should_include_backend_registrations(
        self, entry: DiscoveredPlugin
    ) -> bool:
        if entry.shadowed_by_source_path is not None:
            return False
        return entry.plugin_id in self._backend_loaded_plugin_ids

    def _should_redact_source_details(self) -> bool:
        return self.server_mode != "ide"

    def _should_redact_config_details(self) -> bool:
        return self.server_mode != "ide"

    def _build_redacted_config_descriptor(
        self, entry: DiscoveredPlugin
    ) -> PluginConfigDescriptor:
        has_schema, _schema_json = self._build_config_schema_descriptor(entry)
        return PluginConfigDescriptor(hasSchema=has_schema)

    def _compute_json_payload_digest(self, value: Any) -> str:
        encoded_value = jsonable_encoder(value)
        serialized = json.dumps(
            encoded_value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def _build_redacted_source_path_map(
        self,
        entries: list[DiscoveredPlugin],
    ) -> dict[Path, str]:
        source_entry_by_path = {entry.source_path: entry for entry in entries}
        paths_to_redact = {entry.source_path for entry in entries} | {
            entry.shadowed_by_source_path
            for entry in entries
            if entry.shadowed_by_source_path is not None
        }
        redacted: dict[Path, str] = {}
        for source_path in paths_to_redact:
            entry = source_entry_by_path.get(source_path)
            if entry is None:
                redacted[source_path] = self._redact_unknown_source_path(source_path)
                continue
            redacted[source_path] = self._redact_source_path(
                entry.plugin_id,
                entry.scope,
                entry.source_manager,
                entry.source_path,
            )
        return redacted

    def _redacted_source_token(self, source_path: Path) -> str:
        digest = hashlib.sha256(str(source_path).encode("utf-8")).hexdigest()
        return digest[:12]

    def _redacted_canonical_source_key(
        self,
        plugin_id: str,
        scope: PluginScope,
        source_manager: PluginSourceManager,
        source_path: Path,
    ) -> str:
        token = self._redacted_source_token(source_path)
        return (
            f"{_REDACTED_CANONICAL_SOURCE_KEY_PREFIX}"
            f"{scope.value}:{source_manager.value}:{plugin_id}:{token}"
        )

    def _redact_source_path(
        self,
        plugin_id: str,
        scope: PluginScope,
        source_manager: PluginSourceManager,
        source_path: Path,
    ) -> str:
        token = self._redacted_source_token(source_path)
        return (
            f"{_REDACTED_SOURCE_PATH}:{scope.value}:{source_manager.value}:"
            f"{plugin_id}:{token}"
        )

    def _redact_unknown_source_path(self, source_path: Path) -> str:
        token = self._redacted_source_token(source_path)
        return f"{_REDACTED_SOURCE_PATH}:unknown:{token}"

    def get_pending_restart_backend_plugin_ids(self) -> list[str]:
        return sorted(self._pending_restart_backend_ids)

    def _serialize_registered_language_servers(
        self,
        plugin_id: str,
    ) -> list[PluginRegisteredLanguageServer]:
        registrations = self._backend_language_servers.get(plugin_id, [])
        return [
            PluginRegisteredLanguageServer(
                name=registration.name,
                language=code_language_to_string(registration.language),
                command=registration.command,
                args=list(registration.args),
                settingsKey=registration.settings_key,
            )
            for registration in sorted(
                registrations,
                key=lambda registration: (
                    code_language_to_string(registration.language),
                    registration.name,
                ),
            )
        ]

    def get_backend_language_servers(self) -> list[RegisteredLanguageServer]:
        return sorted(
            self._backend_language_server_by_language.values(),
            key=lambda registration: (
                code_language_to_string(registration.language),
                registration.plugin_id or "",
                registration.name,
            ),
        )

    def _serialize_registered_external_agent_adapters(
        self,
        plugin_id: str,
    ) -> list[PluginRegisteredExternalAgentAdapter]:
        registrations = self._backend_external_agent_adapters.get(plugin_id, [])
        return sorted(
            registrations,
            key=lambda registration: registration.adapterId,
        )

    def get_backend_external_agent_adapters(
        self,
    ) -> list[PluginRegisteredExternalAgentAdapter]:
        return sorted(
            self._backend_external_agent_adapter_by_id.values(),
            key=lambda registration: registration.adapterId,
        )

    def _serialize_registered_codegen_targets(
        self,
        plugin_id: str,
    ) -> list[PluginRegisteredCodegenTarget]:
        registrations = self._backend_codegen_targets.get(plugin_id, [])
        return sorted(
            registrations,
            key=lambda registration: registration.targetId,
        )

    def get_backend_codegen_targets(self) -> list[PluginRegisteredCodegenTarget]:
        registrations: list[PluginRegisteredCodegenTarget] = []
        for registration in self._backend_codegen_target_by_id.values():
            registrations.append(
                PluginRegisteredCodegenTarget(
                    targetId=registration.target_id,
                    pluginId=registration.plugin_id,
                    language=registration.language,
                    name=registration.name,
                    defaultFileName=registration.default_file_name,
                )
            )
        return sorted(registrations, key=lambda registration: registration.targetId)

    def has_backend_codegen_target(self, target_id: str) -> bool:
        normalized_target_id = target_id.strip()
        if normalized_target_id == "":
            return False
        return normalized_target_id in self._backend_codegen_target_by_id

    def get_backend_codegen_target_implementation_key(self, target_id: str) -> str:
        normalized_target_id = target_id.strip()
        if normalized_target_id == "":
            raise KeyError("Plugin codegen target id is required.")
        registration = self._backend_codegen_target_by_id.get(normalized_target_id)
        if registration is None:
            raise KeyError(
                f"Plugin codegen target is not registered: {normalized_target_id}"
            )
        entry = self._find_highest_precedence_entry(registration.plugin_id)
        if entry is None:
            raise KeyError(
                (
                    "Plugin codegen target plugin is not currently discovered: "
                    f"{registration.plugin_id}"
                )
            )
        source_digest = entry.source_digest_sha256 or "none"
        return (
            f"{registration.target_id}:{registration.plugin_id}:"
            f"{entry.version}:{source_digest}:{registration.handler_id}"
        )

    @_mutation_locked
    def generate_backend_codegen_target(
        self,
        *,
        target_id: str,
        project_state: dict[str, Any],
        target_options: dict[str, Any],
    ) -> list[tuple[str, str]]:
        if not isinstance(project_state, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                "Plugin codegen project_state payload must be an object.",
            )
        if not isinstance(target_options, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                "Plugin codegen target_options payload must be an object.",
            )
        normalized_target_id = target_id.strip()
        if normalized_target_id == "":
            raise PluginManagerError(
                "PLUGIN_CODEGEN_TARGET_NOT_FOUND",
                "Plugin codegen target id is required.",
            )
        registration = self._backend_codegen_target_by_id.get(normalized_target_id)
        if registration is None:
            raise PluginManagerError(
                "PLUGIN_CODEGEN_TARGET_NOT_FOUND",
                f"Plugin codegen target is not registered: {normalized_target_id}",
            )
        process = self._backend_worker_processes.get(registration.plugin_id)
        if process is None or process.poll() is not None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    "Backend worker unavailable for plugin "
                    f"{registration.plugin_id} while generating code."
                ),
            )
        entry = self._active_plugin_by_id.get(registration.plugin_id)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    "Backend worker context missing plugin entry for "
                    f"{registration.plugin_id} while generating code."
                ),
            )
        generation_payload = self._call_backend_worker_method(
            process=process,
            plugin_id=registration.plugin_id,
            request_id=self._next_backend_worker_request_id(registration.plugin_id),
            method="plugin.invoke_codegen_target",
            timeout_seconds=self._backend_operation_timeout_seconds,
            timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            entry=entry,
            app=self._backend_app,
            params={
                "handlerId": registration.handler_id,
                "projectState": project_state,
                "targetOptions": target_options,
            },
        )
        return self._normalize_codegen_generation_payload(
            plugin_id=registration.plugin_id,
            target_id=registration.target_id,
            payload=generation_payload,
            default_file_name=registration.default_file_name,
        )

    @_mutation_locked
    def invoke_listener_endpoint(
        self,
        *,
        endpoint_name: str,
        payload: dict[str, object],
    ) -> object:
        registration = self._backend_listener_endpoint_route_by_name.get(endpoint_name)
        if registration is None:
            raise KeyError(f"unknown listener endpoint: {endpoint_name}")
        plugin_id, route_id = registration
        process = self._backend_worker_processes.get(plugin_id)
        if process is None or process.poll() is not None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Backend worker unavailable for plugin listener endpoint {endpoint_name}.",
            )
        entry = self._active_plugin_by_id.get(plugin_id)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    "Backend worker context missing plugin entry while invoking "
                    f"listener endpoint {endpoint_name}."
                ),
            )
        route_response = self._call_backend_worker_method(
            process=process,
            plugin_id=plugin_id,
            request_id=self._next_backend_worker_request_id(plugin_id),
            method="plugin.invoke_route",
            timeout_seconds=self._backend_operation_timeout_seconds,
            timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            entry=entry,
            app=self._backend_app,
            params={
                "routeId": route_id,
                "pathParams": {},
                "queryParams": {},
                "jsonBody": payload,
            },
        )
        if not isinstance(route_response, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Plugin listener endpoint {endpoint_name} returned "
                    "a non-object response payload."
                ),
            )
        status_code = self._normalize_worker_route_status_code(
            route_response=route_response,
            route_label=f"listener endpoint {endpoint_name}",
        )
        if status_code < 200 or status_code > 299:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Plugin listener endpoint {endpoint_name} returned "
                    f"status {status_code}."
                ),
            )
        return route_response.get("body")

    def get_restart_capability(self) -> PluginRestartCapability:
        if self.server_mode != "ide":
            return PluginRestartCapability(
                mode="manual",
                command=self._restart_command,
                reason="Plugin runtime restart is available only in IDE mode.",
            )
        if self._restart_callback is not None:
            return PluginRestartCapability(mode="programmatic")
        return PluginRestartCapability(
            mode="manual",
            command=self._restart_command,
            reason="Programmatic restart is not available in this runtime.",
        )

    @_mutation_locked
    def restart_backend(self) -> dict[str, Any]:
        capability = self.get_restart_capability()
        if capability.mode == "programmatic":
            assert self._restart_callback is not None
            try:
                accepted = bool(self._restart_callback())
            except Exception as exc:
                raise PluginManagerError(
                    "PLUGIN_RESTART_FAILED",
                    f"Programmatic restart callback failed: {exc}",
                    status_code=503,
                ) from exc
            if accepted:
                return {
                    "accepted": True,
                    "mode": capability.mode,
                    "command": None,
                    "reason": None,
                }
            return {
                "accepted": False,
                "mode": capability.mode,
                "command": self._restart_command,
                "reason": "Programmatic restart request was rejected.",
            }
        return {
            "accepted": False,
            "mode": capability.mode,
            "command": capability.command,
            "reason": capability.reason,
        }

    def _backend_entries_for_load(self) -> list[DiscoveredPlugin]:
        candidates = [
            entry
            for entry in self._discovered_plugins
            if entry.shadowed_by_source_path is None
            and entry.has_backend
            and entry.state == PluginRuntimeState.active
        ]
        return sorted(
            candidates,
            key=lambda entry: (
                entry.plugin_id,
                _SCOPE_ORDER[entry.scope],
                str(entry.source_path),
            ),
        )

    def _load_backend_plugin_entry(
        self,
        *,
        app: "FastAPI",
        entry: DiscoveredPlugin,
    ) -> None:
        if entry.manifest is None or entry.manifest.backend is None:
            return
        entrypoint_path = self._resolve_relative_path(
            entry.source_path,
            entry.manifest.backend.entrypoint,
            code="PLUGIN_BACKEND_IMPORT_FAILED",
            message_prefix="Invalid backend entrypoint path",
        )
        self._ensure_backend_runtime_for_entry(entry)
        worker_process = self._start_backend_worker_process(
            entry=entry,
            entrypoint_path=entrypoint_path,
        )
        self._backend_worker_request_locks[entry.plugin_id] = threading.Lock()
        with self._backend_worker_request_state_lock:
            self._backend_worker_next_request_ids[entry.plugin_id] = 1_000
        request_id = 1
        registration_snapshot: _BackendRegistrationSnapshot | None = None
        try:
            handshake_payload = self._call_backend_worker_method(
                process=worker_process,
                plugin_id=entry.plugin_id,
                request_id=request_id,
                method="plugin.initialize",
                timeout_seconds=self._backend_startup_timeout_seconds,
                timeout_code="PLUGIN_BACKEND_STARTUP_TIMEOUT",
                entry=entry,
                app=app,
            )
            request_id += 1
            if not isinstance(handshake_payload, dict):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                    (
                        f"Backend plugin {entry.plugin_id} returned an invalid "
                        "handshake payload."
                    ),
                )
            self._validate_backend_worker_handshake(entry, handshake_payload)
            registration_snapshot = self._capture_backend_registration_snapshot(app=app)
            self._call_backend_worker_method(
                process=worker_process,
                plugin_id=entry.plugin_id,
                request_id=request_id,
                method="plugin.register",
                timeout_seconds=self._backend_register_timeout_seconds,
                timeout_code="PLUGIN_BACKEND_REGISTER_TIMEOUT",
                entry=entry,
                app=app,
            )
        except Exception:
            try:
                if registration_snapshot is not None:
                    self._restore_backend_registration_snapshot(
                        app=app,
                        snapshot=registration_snapshot,
                    )
            finally:
                self._stop_backend_worker_process(worker_process)
                self._backend_worker_request_locks.pop(entry.plugin_id, None)
                with self._backend_worker_request_state_lock:
                    self._backend_worker_next_request_ids.pop(entry.plugin_id, None)
            raise
        self._backend_worker_processes[entry.plugin_id] = worker_process

    def _start_backend_worker_process(
        self,
        *,
        entry: DiscoveredPlugin,
        entrypoint_path: Path,
    ) -> subprocess.Popen[str]:
        worker_python = self._resolve_backend_worker_python(entry)
        command = self._build_backend_worker_command(
            worker_python=worker_python,
            plugin_id=entry.plugin_id,
            plugin_version=entry.version,
            plugin_root=entry.source_path,
            entrypoint_path=entrypoint_path,
            requested_capabilities=entry.requested_capabilities,
            effective_capabilities=entry.effective_capabilities,
        )
        worker_env = self._build_backend_worker_env()
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=worker_env,
            )
        except OSError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Failed to start backend worker for {entry.plugin_id}: {exc}",
            ) from exc
        if process.stdin is None or process.stdout is None or process.stderr is None:
            self._stop_backend_worker_process(process)
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Backend worker stdio pipes unavailable for {entry.plugin_id}.",
            )
        self._register_worker_pipe_reader(process.stdout)
        self._register_worker_pipe_reader(
            process.stderr,
            max_buffered_lines=_BACKEND_WORKER_STDERR_MAX_LINES,
        )
        return process

    def _register_worker_pipe_reader(
        self,
        stream: Any,
        *,
        max_buffered_lines: int | None = None,
    ) -> _BackendWorkerPipeReader:
        stream_id = id(stream)
        with self._backend_worker_pipe_readers_lock:
            reader = self._backend_worker_pipe_readers.get(stream_id)
            if reader is not None:
                return reader
            created_reader = _BackendWorkerPipeReader(
                stream,
                max_buffered_lines=max_buffered_lines,
            )
            self._backend_worker_pipe_readers[stream_id] = created_reader
        return created_reader

    def _discard_worker_pipe_reader(
        self, stream: Any
    ) -> _BackendWorkerPipeReader | None:
        stream_id = id(stream)
        with self._backend_worker_pipe_readers_lock:
            return self._backend_worker_pipe_readers.pop(stream_id, None)

    def _build_backend_worker_command(
        self,
        *,
        worker_python: str,
        plugin_id: str,
        plugin_version: str,
        plugin_root: Path,
        entrypoint_path: Path,
        requested_capabilities: list[str],
        effective_capabilities: list[str],
    ) -> list[str]:
        command = [
            worker_python,
            "-m",
            "setta.plugins.worker",
            "--plugin-id",
            plugin_id,
            "--plugin-version",
            plugin_version,
            "--plugin-root",
            str(plugin_root),
            "--entrypoint",
            str(entrypoint_path),
            "--server-mode",
            self.server_mode,
        ]
        for capability in requested_capabilities:
            command.extend(["--requested-capability", capability])
        for capability in effective_capabilities:
            command.extend(["--effective-capability", capability])
        return command

    def _resolve_backend_worker_python(self, entry: DiscoveredPlugin) -> str:
        if entry.source_digest_sha256 is None:
            return sys.executable
        runtime_path = self._runtime_path(
            plugin_id=entry.plugin_id,
            version=entry.version,
            source_digest_sha256=entry.source_digest_sha256,
        )
        venv_python = (
            runtime_path / ".venv" / "Scripts" / "python.exe"
            if os.name == "nt"
            else runtime_path / ".venv" / "bin" / "python"
        )
        if venv_python.exists() and venv_python.is_file():
            return str(venv_python)
        return sys.executable

    def _build_backend_worker_env(self) -> dict[str, str]:
        env = dict(os.environ)
        backend_source_root = str(Path(__file__).resolve().parents[2])
        existing_pythonpath = env.get("PYTHONPATH")
        if existing_pythonpath is None or existing_pythonpath.strip() == "":
            env["PYTHONPATH"] = backend_source_root
        else:
            env["PYTHONPATH"] = (
                f"{backend_source_root}{os.pathsep}{existing_pythonpath}"
            )
        return env

    def _call_backend_worker_method(
        self,
        *,
        process: subprocess.Popen[str],
        plugin_id: str,
        request_id: int,
        method: str,
        timeout_seconds: float,
        timeout_code: str,
        params: dict[str, Any] | None = None,
        entry: DiscoveredPlugin | None = None,
        app: Optional["FastAPI"] = None,
    ) -> Any:
        worker_lock = self._backend_worker_request_locks.get(plugin_id)
        if worker_lock is None:
            worker_lock = threading.Lock()
            self._backend_worker_request_locks[plugin_id] = worker_lock

        with worker_lock:
            request_payload = {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params or {},
            }
            self._write_backend_worker_payload(
                process=process,
                plugin_id=plugin_id,
                payload=request_payload,
                phase=method,
            )
            deadline = time.monotonic() + timeout_seconds
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PluginManagerError(
                        timeout_code,
                        (
                            f"Backend plugin {plugin_id} {method} request timed out "
                            f"after {timeout_seconds:.2f}s."
                        ),
                    )
                message_payload = self._read_backend_worker_message(
                    process=process,
                    plugin_id=plugin_id,
                    method=method,
                    timeout_seconds=remaining,
                    timeout_code=timeout_code,
                )
                nested_method = message_payload.get("method")
                if isinstance(nested_method, str):
                    nested_request_id = message_payload.get("id")
                    nested_params = message_payload.get("params")
                    try:
                        nested_result = self._dispatch_backend_worker_host_request(
                            plugin_id=plugin_id,
                            method=nested_method,
                            params=nested_params,
                            entry=entry,
                            app=app,
                        )
                        nested_response = {
                            "jsonrpc": "2.0",
                            "id": nested_request_id,
                            "result": nested_result,
                        }
                    except PluginManagerError as exc:
                        nested_response = {
                            "jsonrpc": "2.0",
                            "id": nested_request_id,
                            "error": {
                                "code": exc.code,
                                "message": exc.message,
                            },
                        }
                    except Exception as exc:
                        nested_response = {
                            "jsonrpc": "2.0",
                            "id": nested_request_id,
                            "error": {
                                "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                                "message": (
                                    f"Host method {nested_method} failed: {exc}"
                                ),
                            },
                        }
                    self._write_backend_worker_payload(
                        process=process,
                        plugin_id=plugin_id,
                        payload=nested_response,
                        phase=nested_method,
                    )
                    continue
                response_id = message_payload.get("id")
                if response_id != request_id:
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        (
                            f"Backend worker response id mismatch for {plugin_id}: "
                            f"expected {request_id}, received {response_id!r}."
                        ),
                    )
                error_payload = message_payload.get("error")
                if isinstance(error_payload, dict):
                    raw_code = error_payload.get("code")
                    raw_message = error_payload.get("message")
                    code = (
                        raw_code
                        if isinstance(raw_code, str)
                        else "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR"
                    )
                    message = (
                        raw_message
                        if isinstance(raw_message, str)
                        else (
                            "Backend worker returned an invalid error payload for "
                            f"{plugin_id}."
                        )
                    )
                    raise PluginManagerError(code, message)
                if "result" not in message_payload:
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        (
                            f"Backend worker result missing for {plugin_id} during "
                            f"{method}."
                        ),
                    )
                return message_payload["result"]

    def _dispatch_backend_worker_host_request(
        self,
        *,
        plugin_id: str,
        method: str,
        params: Any,
        entry: DiscoveredPlugin | None,
        app: Optional["FastAPI"],
    ) -> dict[str, Any]:
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Backend worker {plugin_id} sent {method} without a matching "
                    "plugin entry context."
                ),
            )
        params_payload = params if isinstance(params, dict) else {}
        if method == "host.register_router":
            if app is None:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Backend worker {plugin_id} sent host.register_router "
                        "without an app context."
                    ),
                )
            return self._register_backend_router_from_worker_request(
                app=app,
                entry=entry,
                params=params_payload,
            )
        if method == "host.register_listener_endpoint":
            return self._register_backend_listener_endpoint_from_worker_request(
                entry=entry,
                params=params_payload,
            )
        if method == "host.register_static_dir":
            if app is None:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Backend worker {plugin_id} sent host.register_static_dir "
                        "without an app context."
                    ),
                )
            return self._register_backend_static_dir_from_worker_request(
                app=app,
                entry=entry,
                params=params_payload,
            )
        if method == "host.register_mcp_tool":
            return self._register_backend_mcp_tool_from_worker_request(
                entry=entry,
                params=params_payload,
            )
        if method == "host.register_external_agent_adapter":
            return self._register_backend_external_agent_adapter_from_worker_request(
                entry=entry,
                params=params_payload,
            )
        if method == "host.register_language_server":
            return self._register_backend_language_server_from_worker_request(
                entry=entry,
                params=params_payload,
            )
        if method == "host.register_codegen_target":
            return self._register_backend_codegen_target_from_worker_request(
                entry=entry,
                params=params_payload,
            )
        if method == "host.read_project_state":
            if app is None:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Backend worker {plugin_id} sent host.read_project_state "
                        "without an app context."
                    ),
                )
            return self._read_project_state_from_worker_request(
                entry=entry,
                app=app,
                params=params_payload,
            )
        if method == "host.emit_listener_dependency_event":
            if app is None:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Backend worker {plugin_id} sent "
                        "host.emit_listener_dependency_event without an app context."
                    ),
                )
            return self._emit_listener_dependency_event_from_worker_request(
                entry=entry,
                app=app,
                params=params_payload,
            )
        raise PluginManagerError(
            "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
            f"Unsupported worker host method: {method}",
        )

    def _next_backend_worker_request_id(self, plugin_id: str) -> int:
        with self._backend_worker_request_state_lock:
            next_id = self._backend_worker_next_request_ids.get(plugin_id, 1_000)
            self._backend_worker_next_request_ids[plugin_id] = next_id + 1
        return next_id

    def _write_backend_worker_payload(
        self,
        *,
        process: subprocess.Popen[str],
        plugin_id: str,
        payload: dict[str, Any],
        phase: str,
    ) -> None:
        if process.stdin is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Backend worker stdin unavailable for {plugin_id}.",
            )
        try:
            serialized = json.dumps(payload)
        except TypeError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Backend worker payload is not JSON-serializable for {plugin_id} "
                    f"during {phase}: {exc}"
                ),
            ) from exc
        try:
            process.stdin.write(serialized + "\n")
            process.stdin.flush()
        except OSError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Backend worker transport write failed for {plugin_id} "
                    f"during {phase}: {exc}"
                ),
            ) from exc

    def _read_backend_worker_message(
        self,
        *,
        process: subprocess.Popen[str],
        plugin_id: str,
        method: str,
        timeout_seconds: float,
        timeout_code: str,
    ) -> dict[str, Any]:
        if process.stdout is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Backend worker stdout unavailable for {plugin_id}.",
            )
        line = self._read_stream_line_with_timeout(
            process.stdout,
            timeout_seconds=timeout_seconds,
        )
        if line is None:
            raise PluginManagerError(
                timeout_code,
                (
                    f"Backend plugin {plugin_id} {method} request timed out "
                    f"after {timeout_seconds:.2f}s."
                ),
            )
        if line == "":
            stderr_output = self._read_available_pipe_text(process.stderr)
            detail = f" Stderr: {stderr_output}" if len(stderr_output) > 0 else ""
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Backend worker exited before responding for {plugin_id} "
                    f"during {method}.{detail}"
                ),
            )
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Backend worker returned invalid JSON for {plugin_id} "
                    f"during {method}: {line.strip()}"
                ),
            ) from exc
        if not isinstance(payload, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Backend worker response type invalid for {plugin_id} during "
                    f"{method}."
                ),
            )
        return payload

    def _read_stream_line_with_timeout(
        self,
        stream: Any,
        *,
        timeout_seconds: float,
    ) -> str | None:
        reader = self._register_worker_pipe_reader(stream)
        try:
            result = reader.read_line(timeout_seconds=timeout_seconds)
        except BaseException as exc:
            self._discard_worker_pipe_reader(stream)
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                f"Backend worker stream read failed: {exc}",
            ) from exc
        if result is None:
            return None
        if result == "":
            self._discard_worker_pipe_reader(stream)
        return result

    def _read_available_pipe_text(self, stream: Any) -> str:
        if stream is None:
            return ""
        lines: list[str] = []
        try:
            line = self._read_stream_line_with_timeout(
                stream,
                timeout_seconds=0.05,
            )
        except PluginManagerError:
            return ""
        if line is None or line == "":
            return ""
        lines.append(line)
        while True:
            try:
                next_line = self._read_stream_line_with_timeout(
                    stream,
                    timeout_seconds=0.0,
                )
            except PluginManagerError:
                break
            if next_line is None or next_line == "":
                break
            lines.append(next_line)
        return "".join(lines).strip()

    def _stop_backend_worker_process(self, process: subprocess.Popen[str]) -> None:
        readers_to_join: list[_BackendWorkerPipeReader] = []
        for stream in (process.stdout, process.stderr):
            if stream is None:
                continue
            reader = self._discard_worker_pipe_reader(stream)
            if reader is not None:
                readers_to_join.append(reader)
        if process.stdin is not None:
            process.stdin.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                process.kill()
                try:
                    process.wait(timeout=1.0)
                except subprocess.TimeoutExpired:
                    pass
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                stream.close()
        for reader in readers_to_join:
            reader.join(timeout_seconds=0.2)

    def _shutdown_backend_worker(
        self,
        *,
        plugin_id: str,
        process: subprocess.Popen[str],
    ) -> None:
        if process.poll() is None:
            try:
                self._call_backend_worker_method(
                    process=process,
                    plugin_id=plugin_id,
                    request_id=self._next_backend_worker_request_id(plugin_id),
                    method="plugin.shutdown",
                    timeout_seconds=self._backend_register_timeout_seconds,
                    timeout_code="PLUGIN_BACKEND_REGISTER_TIMEOUT",
                )
            except PluginManagerError:
                pass
        self._stop_backend_worker_process(process)
        self._backend_worker_request_locks.pop(plugin_id, None)
        with self._backend_worker_request_state_lock:
            self._backend_worker_next_request_ids.pop(plugin_id, None)

    def _remove_backend_registered_mcp_tools(self) -> None:
        from setta.mcp.tool_setup import SETTA_MCP_TOOLS

        if len(self._backend_registered_mcp_tools) == 0:
            return
        registered_tool_ids: set[int] = set()
        for tool_fns in self._backend_registered_mcp_tools.values():
            for tool_fn in tool_fns:
                registered_tool_ids.add(id(tool_fn))
        SETTA_MCP_TOOLS[:] = [
            tool_fn
            for tool_fn in SETTA_MCP_TOOLS
            if id(tool_fn) not in registered_tool_ids
        ]
        self._backend_registered_mcp_tools = {}

    def _capture_backend_registration_snapshot(
        self, *, app: "FastAPI"
    ) -> _BackendRegistrationSnapshot:
        from setta.mcp.tool_setup import SETTA_MCP_TOOLS

        return _BackendRegistrationSnapshot(
            app_routes=list(app.router.routes),
            backend_route_ids_by_plugin_id={
                plugin_id: set(route_ids)
                for plugin_id, route_ids in self._backend_route_ids_by_plugin_id.items()
            },
            backend_listener_endpoint_route_by_name=dict(
                self._backend_listener_endpoint_route_by_name
            ),
            backend_registered_mcp_tools={
                plugin_id: list(tool_fns)
                for plugin_id, tool_fns in self._backend_registered_mcp_tools.items()
            },
            backend_external_agent_adapters={
                plugin_id: list(registrations)
                for plugin_id, registrations in self._backend_external_agent_adapters.items()
            },
            backend_external_agent_adapter_by_id=dict(
                self._backend_external_agent_adapter_by_id
            ),
            backend_language_servers={
                plugin_id: list(registrations)
                for plugin_id, registrations in self._backend_language_servers.items()
            },
            backend_language_server_by_language=dict(
                self._backend_language_server_by_language
            ),
            backend_codegen_targets={
                plugin_id: list(registrations)
                for plugin_id, registrations in self._backend_codegen_targets.items()
            },
            backend_codegen_target_by_id=dict(self._backend_codegen_target_by_id),
            setta_mcp_tools=list(SETTA_MCP_TOOLS),
        )

    def _restore_backend_registration_snapshot(
        self,
        *,
        app: "FastAPI",
        snapshot: _BackendRegistrationSnapshot,
    ) -> None:
        from setta.mcp.tool_setup import SETTA_MCP_TOOLS

        app.router.routes = list(snapshot.app_routes)
        self._backend_route_ids_by_plugin_id = {
            plugin_id: set(route_ids)
            for plugin_id, route_ids in snapshot.backend_route_ids_by_plugin_id.items()
        }
        self._backend_listener_endpoint_route_by_name = dict(
            snapshot.backend_listener_endpoint_route_by_name
        )
        self._backend_registered_mcp_tools = {
            plugin_id: list(tool_fns)
            for plugin_id, tool_fns in snapshot.backend_registered_mcp_tools.items()
        }
        self._backend_external_agent_adapters = {
            plugin_id: list(registrations)
            for plugin_id, registrations in snapshot.backend_external_agent_adapters.items()
        }
        self._backend_external_agent_adapter_by_id = dict(
            snapshot.backend_external_agent_adapter_by_id
        )
        self._backend_language_servers = {
            plugin_id: list(registrations)
            for plugin_id, registrations in snapshot.backend_language_servers.items()
        }
        self._backend_language_server_by_language = dict(
            snapshot.backend_language_server_by_language
        )
        self._backend_codegen_targets = {
            plugin_id: list(registrations)
            for plugin_id, registrations in snapshot.backend_codegen_targets.items()
        }
        self._backend_codegen_target_by_id = dict(snapshot.backend_codegen_target_by_id)
        SETTA_MCP_TOOLS[:] = list(snapshot.setta_mcp_tools)
        self._mark_backend_registration_state_changed()

    def _validate_backend_worker_handshake(
        self,
        entry: DiscoveredPlugin,
        payload: dict[str, Any],
    ) -> None:
        plugin_id = payload.get("pluginId")
        plugin_version = payload.get("pluginVersion")
        backend_api_version = payload.get("backendPluginApiVersion")
        methods_payload = payload.get("supportedRpcMethods")
        if plugin_id != entry.plugin_id:
            raise PluginManagerError(
                "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                (
                    f"Backend handshake plugin id mismatch for {entry.plugin_id}: "
                    f"{plugin_id!r}"
                ),
            )
        if plugin_version != entry.version:
            raise PluginManagerError(
                "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                (
                    f"Backend handshake plugin version mismatch for {entry.plugin_id}: "
                    f"{plugin_version!r}"
                ),
            )
        if backend_api_version != _BACKEND_PLUGIN_API_VERSION:
            raise PluginManagerError(
                "PLUGIN_BACKEND_API_VERSION_MISMATCH",
                (
                    f"Backend API version mismatch for {entry.plugin_id}: "
                    f"{backend_api_version!r}"
                ),
            )
        if not isinstance(methods_payload, list):
            raise PluginManagerError(
                "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                (
                    f"Backend handshake methods payload is invalid for "
                    f"{entry.plugin_id}."
                ),
            )
        methods: set[str] = set()
        for raw_method in methods_payload:
            if isinstance(raw_method, str):
                methods.add(raw_method)
        missing_methods = sorted(_REQUIRED_BACKEND_RPC_METHODS.difference(methods))
        if len(missing_methods) > 0:
            raise PluginManagerError(
                "PLUGIN_BACKEND_HANDSHAKE_INVALID",
                (
                    f"Backend handshake missing required methods for "
                    f"{entry.plugin_id}: {', '.join(missing_methods)}"
                ),
            )

    def _ensure_backend_runtime_for_entry(self, entry: DiscoveredPlugin) -> None:
        if entry.manifest is None or entry.manifest.backend is None:
            return
        if entry.source_digest_sha256 is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                (f"Backend runtime identity is missing for plugin {entry.plugin_id}."),
            )
        dependencies = self._read_backend_dependencies(entry.source_path)
        worker_dependencies = self._build_backend_worker_runtime_dependencies()
        if self._runtime_marker_matches_expected(
            plugin_id=entry.plugin_id,
            version=entry.version,
            source_digest_sha256=entry.source_digest_sha256,
            dependencies=dependencies,
            worker_dependencies=worker_dependencies,
        ):
            return
        self._prepare_backend_runtime(
            plugin_id=entry.plugin_id,
            version=entry.version,
            source_digest_sha256=entry.source_digest_sha256,
            plugin_root=entry.source_path,
            dependencies=dependencies,
            worker_dependencies=worker_dependencies,
        )

    def _prepare_backend_runtime(
        self,
        *,
        plugin_id: str,
        version: str,
        source_digest_sha256: str | None,
        plugin_root: Path,
        dependencies: list[str] | None = None,
        worker_dependencies: list[str] | None = None,
    ) -> None:
        if source_digest_sha256 is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                f"Missing source digest for backend plugin runtime: {plugin_id}",
            )
        resolved_dependencies = (
            dependencies
            if dependencies is not None
            else self._read_backend_dependencies(plugin_root)
        )
        resolved_worker_dependencies = (
            worker_dependencies
            if worker_dependencies is not None
            else self._build_backend_worker_runtime_dependencies()
        )
        install_requirements = self._dedupe_backend_runtime_requirements(
            [*resolved_worker_dependencies, *resolved_dependencies]
        )
        runtime_path = self._runtime_path(
            plugin_id=plugin_id,
            version=version,
            source_digest_sha256=source_digest_sha256,
        )
        with self._acquire_runtime_path_lock(runtime_path):
            if self._runtime_marker_matches_expected(
                plugin_id=plugin_id,
                version=version,
                source_digest_sha256=source_digest_sha256,
                dependencies=resolved_dependencies,
                worker_dependencies=resolved_worker_dependencies,
            ):
                return
            runtime_path.mkdir(parents=True, exist_ok=True)
            if len(resolved_dependencies) > 0:
                venv_path = runtime_path / ".venv"
                if not venv_path.exists():
                    create_venv = subprocess.run(
                        [sys.executable, "-m", "venv", str(venv_path)],
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    if create_venv.returncode != 0:
                        raise PluginManagerError(
                            "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                            (
                                f"Failed to create backend runtime for plugin {plugin_id}: "
                                f"{create_venv.stderr.strip() or create_venv.stdout.strip()}"
                            ),
                        )
                python_binary = (
                    venv_path / "Scripts" / "python.exe"
                    if os.name == "nt"
                    else venv_path / "bin" / "python"
                )
                install_result = subprocess.run(
                    [str(python_binary), "-m", "pip", "install", *install_requirements],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if install_result.returncode != 0:
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                        (
                            f"Failed to install backend dependencies for plugin {plugin_id}: "
                            f"{install_result.stderr.strip() or install_result.stdout.strip()}"
                        ),
                    )
            self._write_runtime_marker(
                plugin_id=plugin_id,
                version=version,
                source_digest_sha256=source_digest_sha256,
                dependencies=resolved_dependencies,
                worker_dependencies=resolved_worker_dependencies,
            )

    def _build_backend_worker_runtime_dependencies(self) -> list[str]:
        dependencies: list[str] = []
        for distribution_name in _BACKEND_RUNTIME_WORKER_DISTRIBUTIONS:
            dependencies.append(
                self._resolve_host_distribution_requirement(distribution_name)
            )
        return dependencies

    def _resolve_host_distribution_requirement(self, distribution_name: str) -> str:
        try:
            installed_version = importlib.metadata.version(distribution_name)
        except importlib.metadata.PackageNotFoundError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                (
                    "Missing host dependency required for backend plugin worker "
                    f"runtime: {distribution_name}"
                ),
            ) from exc
        return f"{distribution_name}=={installed_version}"

    def _dedupe_backend_runtime_requirements(
        self, requirements: list[str]
    ) -> list[str]:
        deduped_requirements: list[str] = []
        seen_requirements: set[str] = set()
        for requirement in requirements:
            if requirement in seen_requirements:
                continue
            deduped_requirements.append(requirement)
            seen_requirements.add(requirement)
        return deduped_requirements

    def _runtime_marker_matches_expected(
        self,
        *,
        plugin_id: str,
        version: str,
        source_digest_sha256: str,
        dependencies: list[str],
        worker_dependencies: list[str],
    ) -> bool:
        marker_path = self._runtime_marker_path(
            plugin_id=plugin_id,
            version=version,
            source_digest_sha256=source_digest_sha256,
        )
        if not marker_path.exists():
            return False
        try:
            marker_payload = json.loads(marker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        if not isinstance(marker_payload, dict):
            return False
        marker_dependencies = marker_payload.get("dependencies")
        if marker_dependencies != dependencies:
            return False
        marker_worker_dependencies = marker_payload.get("workerDependencies")
        if marker_worker_dependencies != worker_dependencies:
            return False
        return True

    def _runtime_path(
        self,
        *,
        plugin_id: str,
        version: str,
        source_digest_sha256: str,
    ) -> Path:
        version_token = self._sanitize_runtime_token(version)
        digest_token = self._sanitize_runtime_token(source_digest_sha256)
        return self._runtime_root / plugin_id / version_token / digest_token

    @contextmanager
    def _acquire_runtime_path_lock(self, runtime_path: Path) -> Iterator[None]:
        with self._runtime_path_locks_guard:
            existing_lock_entry = self._runtime_path_locks.get(runtime_path)
            if existing_lock_entry is None:
                existing_lock_entry = _RuntimePathLockEntry(
                    lock=threading.Lock(),
                    waiter_count=0,
                )
                self._runtime_path_locks[runtime_path] = existing_lock_entry
            existing_lock_entry.waiter_count += 1
        try:
            existing_lock_entry.lock.acquire()
            yield
        finally:
            existing_lock_entry.lock.release()
            with self._runtime_path_locks_guard:
                existing_lock_entry.waiter_count -= 1
                if existing_lock_entry.waiter_count == 0:
                    self._runtime_path_locks.pop(runtime_path, None)

    def _runtime_marker_path(
        self,
        *,
        plugin_id: str,
        version: str,
        source_digest_sha256: str,
    ) -> Path:
        return (
            self._runtime_path(
                plugin_id=plugin_id,
                version=version,
                source_digest_sha256=source_digest_sha256,
            )
            / "runtime.json"
        )

    def _write_runtime_marker(
        self,
        *,
        plugin_id: str,
        version: str,
        source_digest_sha256: str,
        dependencies: list[str],
        worker_dependencies: list[str],
    ) -> None:
        marker_path = self._runtime_marker_path(
            plugin_id=plugin_id,
            version=version,
            source_digest_sha256=source_digest_sha256,
        )
        marker_path.parent.mkdir(parents=True, exist_ok=True)
        marker_payload = {
            "pluginId": plugin_id,
            "version": version,
            "sourceDigestSha256": source_digest_sha256,
            "dependencies": dependencies,
            "workerDependencies": worker_dependencies,
            "createdAtIso": datetime.now(UTC).isoformat(),
        }
        marker_path.write_text(
            json.dumps(marker_payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _read_backend_dependencies(self, plugin_root: Path) -> list[str]:
        pyproject_path = plugin_root / "pyproject.toml"
        if not pyproject_path.exists() or not pyproject_path.is_file():
            return []
        try:
            parsed = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                f"Invalid pyproject.toml for backend plugin runtime: {pyproject_path}",
            ) from exc
        if not isinstance(parsed, dict):
            return []
        project_payload = parsed.get("project")
        if not isinstance(project_payload, dict):
            return []
        dependencies_payload = project_payload.get("dependencies")
        if not isinstance(dependencies_payload, list):
            return []
        dependencies: list[str] = []
        for raw_dependency in dependencies_payload:
            if not isinstance(raw_dependency, str):
                continue
            normalized = raw_dependency.strip()
            if normalized:
                try:
                    Requirement(normalized)
                except InvalidRequirement as exc:
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED",
                        (
                            f"Invalid backend dependency requirement for plugin "
                            f"runtime: {normalized!r}"
                        ),
                    ) from exc
                dependencies.append(normalized)
        return dependencies

    def _sanitize_runtime_token(self, value: str) -> str:
        normalized_chars: list[str] = []
        for char in value:
            if char.isalnum() or char in {"-", "_", "."}:
                normalized_chars.append(char)
            else:
                normalized_chars.append("_")
        normalized = "".join(normalized_chars)
        if normalized:
            return normalized
        return "_"

    def _register_backend_router_from_worker_request(
        self,
        *,
        app: "FastAPI",
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        from fastapi import APIRouter, Request
        from fastapi.responses import JSONResponse

        raw_prefix = params.get("prefix")
        if raw_prefix is not None and not isinstance(raw_prefix, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin worker register_router payload contains an invalid "
                    "prefix value."
                ),
            )
        raw_routes = params.get("routes")
        if not isinstance(raw_routes, list):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                ("Plugin worker register_router payload must provide a routes array."),
            )

        known_route_ids = self._backend_route_ids_by_plugin_id.setdefault(
            entry.plugin_id, set()
        )
        proxy_router = APIRouter()
        for raw_route in raw_routes:
            if not isinstance(raw_route, dict):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin worker route descriptor must be an object.",
                )
            raw_route_id = raw_route.get("routeId")
            raw_path = raw_route.get("path")
            raw_methods = raw_route.get("methods")
            raw_needs_raw_body = raw_route.get("needsRawBody")
            if not isinstance(raw_route_id, str) or raw_route_id.strip() == "":
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin worker route descriptor missing routeId.",
                )
            if not isinstance(raw_path, str) or raw_path.strip() == "":
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin worker route descriptor missing path.",
                )
            route_id = raw_route_id.strip()
            route_path = raw_path.strip()
            if not route_path.startswith("/"):
                route_path = f"/{route_path}"
            route_methods = self._normalize_worker_route_methods(
                plugin_id=entry.plugin_id,
                route_id=route_id,
                raw_methods=raw_methods,
            )
            needs_raw_body = True
            if raw_needs_raw_body is not None:
                if not isinstance(raw_needs_raw_body, bool):
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_REGISTER_FAILED",
                        (
                            "Plugin worker route descriptor needsRawBody must be "
                            f"a boolean for route {route_id}."
                        ),
                    )
                needs_raw_body = raw_needs_raw_body
            known_route_ids.add(route_id)

            async def route_proxy(
                request: Request,
                *,
                _plugin_id: str = entry.plugin_id,
                _route_id: str = route_id,
                _needs_raw_body: bool = needs_raw_body,
            ):
                process = self._backend_worker_processes.get(_plugin_id)
                if process is None or process.poll() is not None:
                    return JSONResponse(
                        status_code=503,
                        content={
                            "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                            "message": (
                                f"Backend worker unavailable for plugin {_plugin_id}."
                            ),
                        },
                    )
                query_params = self._normalize_worker_route_query_params(request)
                path_params = dict(request.path_params)
                json_body: Any = None
                raw_body_base64: str | None = None
                if request.method not in {"GET", "HEAD", "OPTIONS"}:
                    raw_body = await request.body()
                    if len(raw_body) > 0:
                        if _needs_raw_body:
                            raw_body_base64 = base64.b64encode(raw_body).decode("ascii")
                        content_type = request.headers.get("content-type")
                        if self._worker_route_content_type_is_json(content_type):
                            try:
                                json_body = json.loads(raw_body.decode("utf-8"))
                            except (UnicodeDecodeError, json.JSONDecodeError):
                                json_body = None
                        elif self._worker_route_content_type_is_text(content_type):
                            try:
                                json_body = raw_body.decode("utf-8")
                            except UnicodeDecodeError:
                                json_body = None
                request_context = {
                    "method": request.method,
                    "path": request.url.path,
                    "queryString": request.url.query,
                    "headers": list(request.headers.items()),
                }
                worker_params: dict[str, Any] = {
                    "routeId": _route_id,
                    "pathParams": path_params,
                    "queryParams": query_params,
                    "jsonBody": json_body,
                    "requestContext": request_context,
                }
                if raw_body_base64 is not None:
                    worker_params["rawBodyBase64"] = raw_body_base64
                try:
                    route_response = self._call_backend_worker_method(
                        process=process,
                        plugin_id=_plugin_id,
                        request_id=self._next_backend_worker_request_id(_plugin_id),
                        method="plugin.invoke_route",
                        timeout_seconds=self._backend_operation_timeout_seconds,
                        timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                        entry=entry,
                        app=app,
                        params=worker_params,
                    )
                except PluginManagerError as exc:
                    return JSONResponse(
                        status_code=502,
                        content={
                            "code": exc.code,
                            "message": exc.message,
                        },
                    )
                if not isinstance(route_response, dict):
                    return JSONResponse(
                        status_code=502,
                        content={
                            "code": "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                            "message": (
                                "Plugin worker route response must be an object."
                            ),
                        },
                    )
                try:
                    return self._build_worker_route_proxy_response(
                        route_response=route_response,
                        route_label=(
                            f"plugin route {_route_id} for plugin {_plugin_id}"
                        ),
                    )
                except PluginManagerError as exc:
                    return JSONResponse(
                        status_code=502,
                        content={
                            "code": exc.code,
                            "message": exc.message,
                        },
                    )

            proxy_router.add_api_route(
                route_path,
                route_proxy,
                methods=route_methods,
            )
        self._register_backend_router(
            app=app,
            entry=entry,
            router=proxy_router,
            prefix=raw_prefix,
        )
        return {"ok": True}

    def _build_worker_route_proxy_response(
        self,
        *,
        route_response: dict[str, Any],
        route_label: str,
    ) -> Any:
        from fastapi.responses import JSONResponse, Response

        status_code = self._normalize_worker_route_status_code(
            route_response=route_response,
            route_label=route_label,
        )
        headers = self._normalize_worker_route_headers(
            route_response=route_response,
            route_label=route_label,
        )
        raw_media_type = route_response.get("mediaType")
        if raw_media_type is not None and not isinstance(raw_media_type, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Plugin worker response for {route_label} returned "
                    "a non-string mediaType value."
                ),
            )
        media_type = (
            raw_media_type.strip()
            if isinstance(raw_media_type, str) and raw_media_type.strip() != ""
            else None
        )
        if not self._worker_route_status_allows_body(status_code):
            response = Response(
                status_code=status_code,
                content=b"",
                media_type=media_type,
            )
            self._apply_worker_route_headers(response=response, headers=headers)
            return response
        body_encoding = route_response.get("bodyEncoding")
        if body_encoding is not None and body_encoding != "base64":
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Plugin worker response for {route_label} returned an "
                    "unsupported bodyEncoding value."
                ),
            )
        body_present = "body" in route_response
        raw_body = route_response.get("body") if body_present else None
        if body_encoding == "base64":
            if not isinstance(raw_body, str):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Plugin worker response for {route_label} returned "
                        "a non-string base64 body."
                    ),
                )
            try:
                decoded_body = base64.b64decode(raw_body, validate=True)
            except Exception as exc:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Plugin worker response for {route_label} returned "
                        "an invalid base64 body."
                    ),
                ) from exc
            response = Response(
                status_code=status_code,
                content=decoded_body,
                media_type=media_type,
            )
            self._apply_worker_route_headers(response=response, headers=headers)
            return response
        if media_type is not None and not self._worker_route_content_type_is_json(
            media_type
        ):
            content: Any = raw_body if body_present else ""
            if isinstance(content, (dict, list)):
                content = json.dumps(jsonable_encoder(content))
            elif content is None:
                content = ""
            elif not isinstance(content, (str, bytes, bytearray, memoryview)):
                content = str(content)
            if isinstance(content, (bytearray, memoryview)):
                content = bytes(content)
            response = Response(
                status_code=status_code,
                content=content,
                media_type=media_type,
            )
            self._apply_worker_route_headers(response=response, headers=headers)
            return response
        if not body_present:
            response = Response(
                status_code=status_code,
                content=b"",
                media_type=media_type,
            )
            self._apply_worker_route_headers(response=response, headers=headers)
            return response
        response = JSONResponse(
            status_code=status_code,
            content=jsonable_encoder(raw_body),
            media_type=media_type,
        )
        self._apply_worker_route_headers(response=response, headers=headers)
        return response

    def _normalize_worker_route_status_code(
        self,
        *,
        route_response: dict[str, Any],
        route_label: str,
    ) -> int:
        if "statusCode" not in route_response:
            return 200
        raw_status_code = route_response.get("statusCode")
        if (
            not isinstance(raw_status_code, int)
            or isinstance(raw_status_code, bool)
            or raw_status_code < 100
            or raw_status_code > 599
        ):
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Plugin worker response for {route_label} returned "
                    f"an invalid statusCode value: {raw_status_code!r}"
                ),
            )
        return raw_status_code

    def _normalize_worker_route_headers(
        self,
        *,
        route_response: dict[str, Any],
        route_label: str,
    ) -> list[tuple[str, str]]:
        raw_headers = route_response.get("headers")
        if raw_headers is None:
            return []
        if not isinstance(raw_headers, list):
            raise PluginManagerError(
                "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                (
                    f"Plugin worker response for {route_label} returned "
                    "a non-array headers payload."
                ),
            )
        headers: list[tuple[str, str]] = []
        for item in raw_headers:
            if (
                not isinstance(item, (list, tuple))
                or len(item) != 2
                or not isinstance(item[0], str)
                or not isinstance(item[1], str)
            ):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Plugin worker response for {route_label} returned "
                        "an invalid header entry."
                    ),
                )
            header_name = item[0].strip()
            if header_name == "":
                continue
            if header_name.lower() in {"content-length", "transfer-encoding"}:
                continue
            header_value = item[1]
            if (
                "\n" in header_name
                or "\r" in header_name
                or "\n" in header_value
                or "\r" in header_value
            ):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Plugin worker response for {route_label} returned "
                        "headers containing newline characters."
                    ),
                )
            try:
                header_name.encode("latin-1")
                header_value.encode("latin-1")
            except UnicodeEncodeError as exc:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                    (
                        f"Plugin worker response for {route_label} returned "
                        "a non-latin-1 header name or value."
                    ),
                ) from exc
            headers.append((header_name, header_value))
        return headers

    def _apply_worker_route_headers(
        self,
        *,
        response: Any,
        headers: list[tuple[str, str]],
    ) -> None:
        for header_name, header_value in headers:
            response.raw_headers.append(
                (
                    header_name.encode("latin-1"),
                    header_value.encode("latin-1"),
                )
            )

    def _worker_route_status_allows_body(self, status_code: int) -> bool:
        return status_code not in {204, 205, 304}

    def _worker_route_content_type_is_json(self, raw_content_type: str | None) -> bool:
        if not isinstance(raw_content_type, str):
            return False
        media_type = raw_content_type.split(";", 1)[0].strip().lower()
        return media_type == "application/json" or media_type.endswith("+json")

    def _worker_route_content_type_is_text(self, raw_content_type: str | None) -> bool:
        if not isinstance(raw_content_type, str):
            return False
        media_type = raw_content_type.split(";", 1)[0].strip().lower()
        return media_type.startswith("text/")

    def _register_backend_listener_endpoint_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_effective_capability(
            entry,
            "registerListenerEndpoint",
            api_name="register_listener_endpoint",
        )
        raw_endpoint_name = params.get("endpointName")
        if not isinstance(raw_endpoint_name, str) or raw_endpoint_name.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin worker listener endpoint registration missing endpointName.",
            )
        endpoint_name = raw_endpoint_name.strip()
        raw_route_id = params.get("routeId")
        if not isinstance(raw_route_id, str) or raw_route_id.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin worker listener endpoint registration missing routeId.",
            )
        route_id = raw_route_id.strip()

        known_route_ids = self._backend_route_ids_by_plugin_id.get(entry.plugin_id)
        if known_route_ids is None or route_id not in known_route_ids:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin worker listener endpoint registration references an "
                    f"unknown routeId {route_id!r} for plugin {entry.plugin_id}."
                ),
            )

        from setta.listeners.listener_router_endpoint_registry import (
            get_listener_router_endpoint_specs,
        )

        core_specs = get_listener_router_endpoint_specs()
        if endpoint_name in core_specs:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin listener endpoint {endpoint_name!r} conflicts with "
                    "a built-in listener endpoint name."
                ),
            )

        existing = self._backend_listener_endpoint_route_by_name.get(endpoint_name)
        if existing is not None:
            existing_plugin_id, existing_route_id = existing
            if existing_plugin_id == entry.plugin_id and existing_route_id == route_id:
                return {"ok": True}
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin listener endpoint {endpoint_name!r} is already "
                    f"registered by plugin {existing_plugin_id}."
                ),
            )

        self._backend_listener_endpoint_route_by_name[endpoint_name] = (
            entry.plugin_id,
            route_id,
        )
        return {"ok": True}

    def _read_project_state_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        app: "FastAPI",
        params: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_effective_capability(
            entry,
            "readProjectState",
            api_name="read_project_state",
        )
        raw_project_config_id = params.get("projectConfigId")
        if (
            not isinstance(raw_project_config_id, str)
            or raw_project_config_id.strip() == ""
        ):
            raise PluginManagerError(
                "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                "host.read_project_state requires a non-empty projectConfigId.",
            )
        project_config_id = raw_project_config_id.strip()

        raw_view = params.get("view", "summary")
        if not isinstance(raw_view, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                "host.read_project_state view must be a string.",
            )
        view = raw_view.strip()
        if view not in {"summary", "full"}:
            raise PluginManagerError(
                "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                (
                    "host.read_project_state view must be either "
                    f"'summary' or 'full', received {view!r}."
                ),
            )

        raw_share_session_id = params.get("shareSessionId")
        share_session_id: str | None = None
        if raw_share_session_id is not None:
            if (
                not isinstance(raw_share_session_id, str)
                or raw_share_session_id.strip() == ""
            ):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                    (
                        "host.read_project_state shareSessionId must be a non-empty "
                        "string when provided."
                    ),
                )
            share_session_id = raw_share_session_id.strip()

        setta_state = getattr(app.state, "setta", None)
        if setta_state is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                "FastAPI app state is missing Setta runtime state.",
            )

        try:
            if setta_state.deployment_mode:
                if share_session_id is None:
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                        (
                            "host.read_project_state requires shareSessionId in "
                            "deployment mode."
                        ),
                    )
                if not setta_state.share_session_store.has_session(share_session_id):
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                        f"Unknown share session id: {share_session_id}",
                    )
                setta_state.share_session_store.touch_session(share_session_id)
                manager = setta_state.project_manager_switcher.get(
                    project_config_id,
                    share_session_id=share_session_id,
                )
            else:
                manager = setta_state.project_manager_switcher.get(project_config_id)
        except RuntimeError as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_PROJECT_STATE_READ_FAILED",
                f"host.read_project_state unavailable before startup completes: {exc}",
            ) from exc

        project_state = convert_backend_to_single_config(
            manager.project_state_backend,
            project_config_id,
        )
        if view == "summary":
            serialized = jsonable_encoder(build_project_state_summary(project_state))
        else:
            serialized = project_state.model_dump(mode="json")
        return {
            "projectState": serialized,
            "view": view,
        }

    def _emit_listener_dependency_event_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        app: "FastAPI",
        params: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_effective_capability(
            entry,
            "emitListenerEvents",
            api_name="emit_listener_dependency_event",
        )
        raw_project_config_id = params.get("projectConfigId")
        if (
            not isinstance(raw_project_config_id, str)
            or raw_project_config_id.strip() == ""
        ):
            raise PluginManagerError(
                "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                (
                    "host.emit_listener_dependency_event requires a non-empty "
                    "projectConfigId."
                ),
            )
        project_config_id = raw_project_config_id.strip()

        raw_dependency_events = params.get("dependencyEvents")
        if (
            not isinstance(raw_dependency_events, list)
            or len(raw_dependency_events) == 0
        ):
            raise PluginManagerError(
                "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                (
                    "host.emit_listener_dependency_event requires a non-empty "
                    "dependencyEvents array."
                ),
            )

        dependency_events: list[DependencyEvent] = []
        for raw_event in raw_dependency_events:
            try:
                dependency_events.append(DependencyEvent.model_validate(raw_event))
            except ValidationError as exc:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                    (
                        "host.emit_listener_dependency_event received an invalid "
                        f"dependency event payload: {exc}"
                    ),
                ) from exc

        raw_share_session_id = params.get("shareSessionId")
        share_session_id: str | None = None
        if raw_share_session_id is not None:
            if (
                not isinstance(raw_share_session_id, str)
                or raw_share_session_id.strip() == ""
            ):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                    (
                        "host.emit_listener_dependency_event shareSessionId must be a "
                        "non-empty string when provided."
                    ),
                )
            share_session_id = raw_share_session_id.strip()

        setta_state = getattr(app.state, "setta", None)
        if setta_state is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                "FastAPI app state is missing Setta runtime state.",
            )

        if setta_state.deployment_mode:
            if share_session_id is None:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                    (
                        "host.emit_listener_dependency_event requires shareSessionId "
                        "in deployment mode."
                    ),
                )
            if not setta_state.share_session_store.has_session(share_session_id):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_LISTENER_EMIT_FAILED",
                    f"Unknown share session id: {share_session_id}",
                )
            setta_state.share_session_store.touch_session(share_session_id)

        coroutine = setta_state.realtime_event_hub.emit_dependency_event(
            project_config_id=project_config_id,
            dependency_events=dependency_events,
            share_session_id=share_session_id,
        )
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coroutine)
        else:
            running_loop.create_task(coroutine)
        return {"ok": True}

    def _normalize_worker_route_query_params(self, request: Any) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for key, value in request.query_params.multi_items():
            existing = normalized.get(key)
            if existing is None:
                normalized[key] = value
                continue
            if isinstance(existing, list):
                existing.append(value)
                continue
            normalized[key] = [existing, value]
        return normalized

    def _normalize_worker_route_methods(
        self,
        *,
        plugin_id: str,
        route_id: str,
        raw_methods: Any,
    ) -> list[str]:
        if not isinstance(raw_methods, list):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin worker route methods must be an array for {plugin_id} "
                    f"route {route_id}."
                ),
            )
        allowed_methods = {"GET", "POST", "PUT", "PATCH", "DELETE"}
        normalized: list[str] = []
        for raw_method in raw_methods:
            if not isinstance(raw_method, str):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin worker route methods must be strings for {plugin_id} "
                        f"route {route_id}."
                    ),
                )
            method = raw_method.strip().upper()
            if method not in allowed_methods:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin worker route method {method!r} is not supported for "
                        f"{plugin_id} route {route_id}."
                    ),
                )
            if method not in normalized:
                normalized.append(method)
        if len(normalized) == 0:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin worker route methods are empty for {plugin_id} route {route_id}.",
            )
        return normalized

    def _register_backend_static_dir_from_worker_request(
        self,
        *,
        app: "FastAPI",
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        raw_url_prefix = params.get("urlPrefix")
        raw_path = params.get("path")
        if not isinstance(raw_url_prefix, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin worker static dir registration missing urlPrefix.",
            )
        if not isinstance(raw_path, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin worker static dir registration missing path.",
            )
        self._register_backend_static_dir(
            app=app,
            entry=entry,
            url_prefix=raw_url_prefix,
            path=raw_path,
        )
        return {"ok": True}

    def _register_backend_mcp_tool_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        raw_tool_name = params.get("toolName")
        raw_annotations = params.get("annotations")
        if not isinstance(raw_tool_name, str) or raw_tool_name.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin worker MCP tool registration missing toolName.",
            )
        if raw_annotations is not None and not isinstance(raw_annotations, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin worker MCP tool annotations must be an object.",
            )
        tool_name = raw_tool_name.strip()
        annotations = raw_annotations if isinstance(raw_annotations, dict) else None

        def worker_tool_proxy(*args: Any, **kwargs: Any) -> Any:
            process = self._backend_worker_processes.get(entry.plugin_id)
            if process is None or process.poll() is not None:
                raise RuntimeError(
                    f"Backend worker unavailable for plugin {entry.plugin_id}."
                )
            tool_payload = self._call_backend_worker_method(
                process=process,
                plugin_id=entry.plugin_id,
                request_id=self._next_backend_worker_request_id(entry.plugin_id),
                method="plugin.invoke_mcp_tool",
                timeout_seconds=self._backend_operation_timeout_seconds,
                timeout_code="PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR",
                entry=entry,
                app=self._backend_app,
                params={
                    "toolName": tool_name,
                    "args": list(args),
                    "kwargs": kwargs,
                },
            )
            if not isinstance(tool_payload, dict) or "result" not in tool_payload:
                raise RuntimeError(
                    (
                        "Plugin worker MCP response is invalid for "
                        f"{entry.plugin_id}:{tool_name}."
                    )
                )
            return tool_payload["result"]

        self._register_backend_mcp_tool(
            entry=entry,
            func=worker_tool_proxy,
            name=tool_name,
            annotations=annotations,
        )
        return {"ok": True}

    def _register_backend_external_agent_adapter_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        self._register_backend_external_agent_adapter(
            entry=entry,
            adapter=params.get("adapter"),
        )
        return {"ok": True}

    def _register_backend_language_server_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        self._register_backend_language_server(
            entry=entry,
            provider=params.get("provider"),
        )
        return {"ok": True}

    def _register_backend_codegen_target_from_worker_request(
        self,
        *,
        entry: DiscoveredPlugin,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        self._register_backend_codegen_target(
            entry=entry,
            target=params.get("target"),
        )
        return {"ok": True}

    def _require_effective_capability(
        self,
        entry: DiscoveredPlugin,
        capability: str,
        *,
        api_name: str,
    ) -> None:
        if capability in entry.effective_capabilities:
            return
        raise PluginManagerError(
            "PLUGIN_CAPABILITY_DENIED",
            (
                f"Plugin {entry.plugin_id} cannot call {api_name}; "
                f"capability {capability} is not effective in mode {self.server_mode}."
            ),
        )

    def _register_backend_router(
        self,
        *,
        app: "FastAPI",
        entry: DiscoveredPlugin,
        router: "APIRouter",
        prefix: str | None,
    ) -> None:
        from fastapi import APIRouter

        self._require_effective_capability(
            entry,
            "registerRouter",
            api_name="register_router",
        )
        if not isinstance(router, APIRouter):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {entry.plugin_id} passed an invalid router to "
                    "register_router (expected fastapi.APIRouter)."
                ),
            )
        route_prefix = self._build_plugin_route_prefix(entry.plugin_id, prefix)
        app.include_router(router, prefix=route_prefix)

    def _build_plugin_route_prefix(self, plugin_id: str, prefix: str | None) -> str:
        base = f"/api/plugins/{plugin_id}"
        if prefix is None:
            return base
        normalized_subpath = self._normalize_plugin_mount_subpath(
            plugin_id=plugin_id,
            raw_subpath=prefix,
            context_label="route prefix",
        )
        if normalized_subpath == "":
            return base
        return f"{base}/{normalized_subpath}"

    def _register_backend_static_dir(
        self,
        *,
        app: "FastAPI",
        entry: DiscoveredPlugin,
        url_prefix: str,
        path: str | Path,
    ) -> None:
        from fastapi.staticfiles import StaticFiles

        self._require_effective_capability(
            entry,
            "registerStaticDir",
            api_name="register_static_dir",
        )
        if isinstance(path, Path):
            source_path = path
        else:
            source_path = self._resolve_relative_path(
                entry.source_path,
                path,
                code="PLUGIN_BACKEND_REGISTER_FAILED",
                message_prefix="Invalid static directory path",
            )
        if not source_path.exists() or not source_path.is_dir():
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {entry.plugin_id} static directory does not exist: "
                    f"{source_path}"
                ),
            )
        normalized_prefix = self._normalize_plugin_mount_subpath(
            plugin_id=entry.plugin_id,
            raw_subpath=url_prefix,
            context_label="static url prefix",
        )
        mount_path = f"/plugin-static/{entry.plugin_id}"
        if normalized_prefix:
            mount_path = f"{mount_path}/{normalized_prefix}"
        mount_name = f"plugin-static-{entry.plugin_id}-{normalized_prefix or 'root'}"
        app.mount(
            mount_path,
            StaticFiles(directory=str(source_path), html=False),
            name=mount_name,
        )

    def _normalize_plugin_mount_subpath(
        self,
        *,
        plugin_id: str,
        raw_subpath: str,
        context_label: str,
    ) -> str:
        trimmed = raw_subpath.strip()
        if trimmed == "" or trimmed == "/":
            return ""
        normalized = trimmed.strip("/")
        if normalized == "":
            return ""
        raw_segments = normalized.split("/")
        normalized_segments: list[str] = []
        for raw_segment in raw_segments:
            if raw_segment == "":
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {plugin_id} {context_label} contains empty path "
                        f"segments ({raw_subpath})"
                    ),
                )
            decoded_segment = unquote(raw_segment)
            if decoded_segment in {".", ".."}:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {plugin_id} {context_label} contains dot-segments "
                        f"({raw_subpath})"
                    ),
                )
            if decoded_segment.strip() != decoded_segment:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {plugin_id} {context_label} contains leading/trailing "
                        f"whitespace in a path segment ({raw_subpath})"
                    ),
                )
            if "/" in decoded_segment or "\\" in decoded_segment:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {plugin_id} {context_label} contains invalid path "
                        f"separator characters ({raw_subpath})"
                    ),
                )
            if not _PLUGIN_MOUNT_SEGMENT_PATTERN.fullmatch(decoded_segment):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {plugin_id} {context_label} contains invalid "
                        f"characters ({raw_subpath})"
                    ),
                )
            normalized_segments.append(decoded_segment)
        return "/".join(normalized_segments)

    def _register_backend_mcp_tool(
        self,
        *,
        entry: DiscoveredPlugin,
        func: Callable[..., Any],
        name: str | None,
        annotations: dict[str, Any] | None,
    ) -> None:
        from setta.mcp.tool_metadata import ToolAccessMetadata, attach_tool_access
        from setta.mcp.tool_setup import SETTA_MCP_TOOLS

        self._require_effective_capability(
            entry,
            "registerMcpTools",
            api_name="register_mcp_tool",
        )
        if not callable(func):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                f"Plugin {entry.plugin_id} passed a non-callable MCP tool.",
            )
        tool_fn = self._wrap_mcp_tool_with_name(func, name)
        if annotations is not None:
            access_type = annotations.get("accessType")
            if access_type in {"read", "write", "structural"}:
                attach_tool_access(
                    tool_fn,
                    ToolAccessMetadata(accessType=access_type),
                )
        SETTA_MCP_TOOLS.append(tool_fn)
        if entry.plugin_id not in self._backend_registered_mcp_tools:
            self._backend_registered_mcp_tools[entry.plugin_id] = []
        self._backend_registered_mcp_tools[entry.plugin_id].append(tool_fn)

    def _wrap_mcp_tool_with_name(
        self,
        func: Callable[..., Any],
        name: str | None,
    ) -> Callable[..., Any]:
        if name is None or name == func.__name__:
            return func

        @wraps(func)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            return func(*args, **kwargs)

        wrapped.__name__ = name
        wrapped.__qualname__ = name
        return wrapped

    def _register_backend_external_agent_adapter(
        self,
        *,
        entry: DiscoveredPlugin,
        adapter: Any,
    ) -> None:
        self._require_effective_capability(
            entry,
            "registerExternalAgentAdapter",
            api_name="register_external_agent_adapter",
        )
        registration = self._build_backend_external_agent_adapter_registration(
            entry=entry,
            adapter=adapter,
        )
        existing = self._backend_external_agent_adapter_by_id.get(
            registration.adapterId
        )
        if existing is not None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Duplicate external agent adapter registration for "
                    f"{registration.adapterId}. Existing plugin: "
                    f"{existing.pluginId}, new plugin: {registration.pluginId}."
                ),
            )
        if entry.plugin_id not in self._backend_external_agent_adapters:
            self._backend_external_agent_adapters[entry.plugin_id] = []
        self._backend_external_agent_adapters[entry.plugin_id].append(registration)
        self._backend_external_agent_adapter_by_id[registration.adapterId] = (
            registration
        )
        self._mark_backend_registration_state_changed()

    def _build_backend_external_agent_adapter_registration(
        self,
        *,
        entry: DiscoveredPlugin,
        adapter: Any,
    ) -> PluginRegisteredExternalAgentAdapter:
        if not isinstance(adapter, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin external agent adapter registration must be an object "
                    "with id/name/runModes/command fields."
                ),
            )
        allowed_keys = {
            "id",
            "name",
            "runModes",
            "command",
            "args",
            "envVarWhitelist",
            "defaultModel",
        }
        unknown_keys = sorted(set(adapter.keys()) - allowed_keys)
        if unknown_keys:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin external agent adapter registration has unsupported keys: "
                    f"{', '.join(unknown_keys)}"
                ),
            )
        raw_local_id = adapter.get("id")
        if not isinstance(raw_local_id, str) or raw_local_id.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin external agent adapter registration missing id.",
            )
        local_id = raw_local_id.strip()
        adapter_id = f"{entry.plugin_id}:{local_id}"

        raw_name = adapter.get("name")
        if not isinstance(raw_name, str) or raw_name.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin external agent adapter registration missing name.",
            )
        name = raw_name.strip()

        raw_run_modes = adapter.get("runModes")
        if not isinstance(raw_run_modes, list) or len(raw_run_modes) == 0:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin external agent adapter registration must include a non-empty "
                    "runModes array."
                ),
            )
        run_modes: list[str] = []
        seen_run_modes: set[str] = set()
        for raw_run_mode in raw_run_modes:
            if not isinstance(raw_run_mode, str):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin external agent adapter runModes entries must be strings.",
                )
            normalized_run_mode = raw_run_mode.strip()
            if normalized_run_mode == "":
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin external agent adapter runModes cannot contain empty values.",
                )
            try:
                ExternalAgentRunMode(normalized_run_mode)
            except ValueError as exc:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        "Plugin external agent adapter runMode is not supported: "
                        f"{normalized_run_mode!r}."
                    ),
                ) from exc
            if normalized_run_mode in seen_run_modes:
                continue
            seen_run_modes.add(normalized_run_mode)
            run_modes.append(normalized_run_mode)

        raw_command = adapter.get("command")
        if not isinstance(raw_command, str) or raw_command.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin external agent adapter registration missing command.",
            )
        command = self._normalize_and_validate_launch_command(
            entry=entry,
            command=raw_command.strip(),
            registration_kind="external agent adapter",
        )

        raw_args = adapter.get("args")
        args: list[str] = []
        if raw_args is not None:
            if not isinstance(raw_args, list):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin external agent adapter args must be an array of strings.",
                )
            for index, raw_arg in enumerate(raw_args):
                if not isinstance(raw_arg, str):
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_REGISTER_FAILED",
                        (
                            "Plugin external agent adapter args must be strings. "
                            f"Invalid entry index={index}."
                        ),
                    )
                args.append(raw_arg)

        raw_env_whitelist = adapter.get("envVarWhitelist")
        env_var_whitelist: list[str] = []
        if raw_env_whitelist is not None:
            if not isinstance(raw_env_whitelist, list):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        "Plugin external agent adapter envVarWhitelist must be an "
                        "array of strings."
                    ),
                )
            for index, raw_env_name in enumerate(raw_env_whitelist):
                if not isinstance(raw_env_name, str):
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_REGISTER_FAILED",
                        (
                            "Plugin external agent adapter envVarWhitelist entries must "
                            f"be strings (index={index})."
                        ),
                    )
                normalized_env_name = raw_env_name.strip()
                if normalized_env_name == "":
                    continue
                env_var_whitelist.append(normalized_env_name)

        raw_default_model = adapter.get("defaultModel")
        default_model: str | None
        if raw_default_model is None:
            default_model = None
        elif isinstance(raw_default_model, str) and raw_default_model.strip() != "":
            default_model = raw_default_model.strip()
        else:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin external agent adapter defaultModel must be a non-empty string.",
            )

        return PluginRegisteredExternalAgentAdapter(
            adapterId=adapter_id,
            pluginId=entry.plugin_id,
            name=name,
            runModes=sorted(run_modes),
            command=command,
            args=args,
            envVarWhitelist=sorted(set(env_var_whitelist)),
            defaultModel=default_model,
        )

    def _register_backend_language_server(
        self,
        *,
        entry: DiscoveredPlugin,
        provider: Any,
    ) -> None:
        self._require_effective_capability(
            entry,
            "registerLanguageServer",
            api_name="register_language_server",
        )
        registration = self._build_backend_language_server_registration(
            entry=entry,
            provider=provider,
        )
        existing_for_language = self._backend_language_server_by_language.get(
            registration.language
        )
        if existing_for_language is not None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Duplicate backend language server registration for "
                    f"{code_language_to_string(registration.language)}. Existing plugin: "
                    f"{existing_for_language.plugin_id}, new plugin: "
                    f"{registration.plugin_id}."
                ),
            )
        if entry.plugin_id not in self._backend_language_servers:
            self._backend_language_servers[entry.plugin_id] = []
        self._backend_language_servers[entry.plugin_id].append(registration)
        self._backend_language_server_by_language[registration.language] = registration
        self._mark_backend_registration_state_changed()

    def _build_backend_language_server_registration(
        self,
        *,
        entry: DiscoveredPlugin,
        provider: Any,
    ) -> RegisteredLanguageServer:
        if not isinstance(provider, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin language server registration must be an object with "
                    "language/command fields."
                ),
            )
        allowed_keys = {"language", "command", "args", "settingsKey"}
        unknown_keys = sorted(set(provider.keys()) - allowed_keys)
        if unknown_keys:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin language server registration has unsupported keys: "
                    f"{', '.join(unknown_keys)}"
                ),
            )
        raw_language = provider.get("language")
        if not isinstance(raw_language, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin language server registration missing string language.",
            )
        try:
            language = normalize_code_language(raw_language)
        except (TypeError, ValueError) as exc:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin language server language must be a non-empty string. "
                    f"Received: {raw_language!r}."
                ),
            ) from exc
        if language == CodeLanguage.python:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin language servers cannot target python. "
                    "Python is handled by the built-in basedpyright server."
                ),
            )
        raw_command = provider.get("command")
        if not isinstance(raw_command, str) or raw_command.strip() == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin language server registration missing command.",
            )
        command = raw_command.strip()
        raw_args = provider.get("args")
        args: tuple[str, ...] = ()
        if raw_args is not None:
            if not isinstance(raw_args, list):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    "Plugin language server args must be an array of strings.",
                )
            normalized_args: list[str] = []
            for index, raw_arg in enumerate(raw_args):
                if not isinstance(raw_arg, str):
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_REGISTER_FAILED",
                        (
                            "Plugin language server args must be strings. "
                            f"Invalid entry index={index}."
                        ),
                    )
                normalized_args.append(raw_arg)
            args = tuple(normalized_args)
        raw_settings_key = provider.get("settingsKey")
        settings_key: str | None
        if raw_settings_key is None:
            settings_key = None
        elif isinstance(raw_settings_key, str) and raw_settings_key.strip() != "":
            settings_key = raw_settings_key.strip()
        else:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin language server settingsKey must be a non-empty string.",
            )
        command = self._normalize_and_validate_launch_command(
            entry=entry,
            command=command,
            registration_kind="language server",
        )
        return RegisteredLanguageServer(
            plugin_id=entry.plugin_id,
            name=f"{entry.plugin_id}:{code_language_to_string(language)}",
            language=language,
            command=command,
            args=args,
            settings_key=settings_key,
        )

    def _normalize_and_validate_launch_command(
        self,
        *,
        entry: DiscoveredPlugin,
        command: str,
        registration_kind: str,
    ) -> str:
        command_path = Path(command).expanduser()
        if command_path.is_absolute() or is_path_like_command(command):
            resolved_path = command_path
            if not resolved_path.is_absolute():
                resolved_path = (
                    (entry.source_path / command_path)
                    .expanduser()
                    .resolve(strict=False)
                )
            if not resolved_path.exists():
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {registration_kind} command path does not exist: "
                        f"{resolved_path}"
                    ),
                )
            if not resolved_path.is_file():
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {registration_kind} command path is not a file: "
                        f"{resolved_path}"
                    ),
                )
            if not os.access(resolved_path, os.X_OK):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        f"Plugin {registration_kind} command path is not executable: "
                        f"{resolved_path}"
                    ),
                )
            return str(resolved_path)
        if shutil.which(command) is None:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    f"Plugin {registration_kind} command is not available on PATH: "
                    f"{command}"
                ),
            )
        return command

    def _register_backend_codegen_target(
        self,
        *,
        entry: DiscoveredPlugin,
        target: Any,
    ) -> None:
        self._require_effective_capability(
            entry,
            "registerCodegenTarget",
            api_name="register_codegen_target",
        )
        registration = self._build_backend_codegen_target_registration(
            entry=entry,
            target=target,
        )
        if registration.target_id in self._backend_codegen_target_by_id:
            existing = self._backend_codegen_target_by_id[registration.target_id]
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Duplicate backend codegen target registration for "
                    f"{registration.target_id}. Existing plugin: "
                    f"{existing.plugin_id}, new plugin: {registration.plugin_id}."
                ),
            )
        if entry.plugin_id not in self._backend_codegen_targets:
            self._backend_codegen_targets[entry.plugin_id] = []
        self._backend_codegen_targets[entry.plugin_id].append(
            PluginRegisteredCodegenTarget(
                targetId=registration.target_id,
                pluginId=registration.plugin_id,
                language=registration.language,
                name=registration.name,
                defaultFileName=registration.default_file_name,
            )
        )
        self._backend_codegen_target_by_id[registration.target_id] = registration
        self._mark_backend_registration_state_changed()

    def _build_backend_codegen_target_registration(
        self,
        *,
        entry: DiscoveredPlugin,
        target: Any,
    ) -> RegisteredBackendCodegenTarget:
        if not isinstance(target, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin codegen target registration must be an object with "
                    "id/name/language/handlerId."
                ),
            )
        allowed_keys = {"id", "name", "language", "handlerId", "defaultFileName"}
        unknown_keys = sorted(set(target.keys()) - allowed_keys)
        if unknown_keys:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin codegen target registration has unsupported keys: "
                    f"{', '.join(unknown_keys)}"
                ),
            )
        raw_local_id = target.get("id")
        if not isinstance(raw_local_id, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration missing string id.",
            )
        local_id = raw_local_id.strip()
        if local_id == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration id cannot be empty.",
            )
        if ":" in local_id:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration id cannot contain ':'.",
            )
        raw_name = target.get("name")
        if not isinstance(raw_name, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration missing string name.",
            )
        name = raw_name.strip()
        if name == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration name cannot be empty.",
            )
        raw_language = target.get("language")
        if not isinstance(raw_language, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration missing string language.",
            )
        language = raw_language.strip()
        if language == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration language cannot be empty.",
            )
        if language == ProjectCodegenLanguage.python.value:
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                (
                    "Plugin codegen targets cannot reuse python language id. "
                    "Python codegen is built in."
                ),
            )
        raw_handler_id = target.get("handlerId")
        if not isinstance(raw_handler_id, str):
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration missing string handlerId.",
            )
        handler_id = raw_handler_id.strip()
        if handler_id == "":
            raise PluginManagerError(
                "PLUGIN_BACKEND_REGISTER_FAILED",
                "Plugin codegen target registration handlerId cannot be empty.",
            )
        raw_default_file_name = target.get("defaultFileName")
        default_file_name = "setta_gen.txt"
        if raw_default_file_name is not None:
            if not isinstance(raw_default_file_name, str):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_REGISTER_FAILED",
                    (
                        "Plugin codegen target registration defaultFileName must "
                        "be a string when provided."
                    ),
                )
            normalized_default_file_name = raw_default_file_name.strip()
            if normalized_default_file_name != "":
                default_file_name = normalized_default_file_name
        target_id = f"{entry.plugin_id}:{local_id}"
        return RegisteredBackendCodegenTarget(
            target_id=target_id,
            plugin_id=entry.plugin_id,
            language=language,
            name=name,
            default_file_name=default_file_name,
            handler_id=handler_id,
        )

    def _normalize_codegen_generation_payload(
        self,
        *,
        plugin_id: str,
        target_id: str,
        payload: Any,
        default_file_name: str,
    ) -> list[tuple[str, str]]:
        if not isinstance(payload, dict):
            raise PluginManagerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                (
                    "Plugin codegen target returned a non-object payload for "
                    f"{target_id}."
                ),
            )
        raw_files = payload.get("files")
        if not isinstance(raw_files, list):
            raise PluginManagerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                (
                    "Plugin codegen target result must include files array for "
                    f"{target_id}."
                ),
            )
        normalized_files: list[tuple[str, str]] = []
        seen_relative_paths: set[str] = set()
        for index, raw_file in enumerate(raw_files):
            if not isinstance(raw_file, dict):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_CODEGEN_FAILED",
                    (
                        "Plugin codegen file entry must be an object for "
                        f"{target_id} (index={index})."
                    ),
                )
            raw_relative_path = raw_file.get("relativePath")
            relative_path = default_file_name
            if raw_relative_path is not None:
                if not isinstance(raw_relative_path, str):
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_CODEGEN_FAILED",
                        (
                            "Plugin codegen file relativePath must be a string for "
                            f"{target_id} (index={index})."
                        ),
                    )
                normalized_relative_path = raw_relative_path.strip().replace("\\", "/")
                if normalized_relative_path != "":
                    relative_path = normalized_relative_path
            pure_posix_path = PurePosixPath(relative_path)
            pure_windows_path = PureWindowsPath(relative_path)
            if (
                pure_posix_path.is_absolute()
                or pure_windows_path.is_absolute()
                or pure_windows_path.drive != ""
            ):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_CODEGEN_FAILED",
                    (
                        "Plugin codegen file relativePath cannot be absolute for "
                        f"{target_id} (path={relative_path})."
                    ),
                )
            canonical_parts: list[str] = []
            for part in relative_path.split("/"):
                if part in {"", "."}:
                    continue
                if part == "..":
                    raise PluginManagerError(
                        "PLUGIN_BACKEND_CODEGEN_FAILED",
                        (
                            "Plugin codegen file relativePath cannot escape target "
                            f"root for {target_id} (path={relative_path})."
                        ),
                    )
                canonical_parts.append(part)
            if len(canonical_parts) == 0:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_CODEGEN_FAILED",
                    (
                        "Plugin codegen file relativePath cannot be empty for "
                        f"{target_id}."
                    ),
                )
            canonical_relative_path = "/".join(canonical_parts)
            if canonical_relative_path in seen_relative_paths:
                raise PluginManagerError(
                    "PLUGIN_BACKEND_CODEGEN_FAILED",
                    (
                        "Plugin codegen file relativePath is duplicated for "
                        f"{target_id} (path={canonical_relative_path})."
                    ),
                )
            seen_relative_paths.add(canonical_relative_path)
            raw_content = raw_file.get("content")
            if not isinstance(raw_content, str):
                raise PluginManagerError(
                    "PLUGIN_BACKEND_CODEGEN_FAILED",
                    (
                        "Plugin codegen file content must be a string for "
                        f"{target_id} (index={index})."
                    ),
                )
            normalized_files.append((canonical_relative_path, raw_content))
        if len(normalized_files) == 0:
            raise PluginManagerError(
                "PLUGIN_BACKEND_CODEGEN_FAILED",
                (
                    "Plugin codegen target must generate at least one file for "
                    f"{plugin_id}:{target_id}."
                ),
            )
        return normalized_files

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
        allowed_roots = self._plugin_frontend_asset_roots(entry)
        if not any(resolved.is_relative_to(root) for root in allowed_roots):
            raise PluginManagerError(
                "PLUGIN_ASSET_NOT_FOUND",
                f"Plugin asset not found: {asset_path}",
                status_code=404,
            )
        if not resolved.exists() or not resolved.is_file():
            raise PluginManagerError(
                "PLUGIN_ASSET_NOT_FOUND",
                f"Plugin asset not found: {asset_path}",
                status_code=404,
            )
        return resolved

    def _plugin_frontend_asset_roots(self, entry: DiscoveredPlugin) -> tuple[Path, ...]:
        if entry.manifest is None or entry.manifest.frontend is None:
            raise PluginManagerError(
                "PLUGIN_ASSET_NOT_FOUND",
                f"Plugin frontend assets are unavailable: {entry.plugin_id}",
                status_code=404,
            )
        frontend = entry.manifest.frontend
        resolved_entrypoint = self._resolve_relative_path(
            entry.source_path,
            frontend.entrypoint,
            code="PLUGIN_ASSET_INVALID_PATH",
            message_prefix="Invalid plugin frontend entrypoint path",
        )
        roots: set[Path] = {resolved_entrypoint.parent}
        if frontend.style is not None:
            resolved_style = self._resolve_relative_path(
                entry.source_path,
                frontend.style,
                code="PLUGIN_ASSET_INVALID_PATH",
                message_prefix="Invalid plugin frontend style path",
            )
            roots.add(resolved_style.parent)
        return tuple(sorted(roots, key=lambda path: str(path)))

    def _manifest_components(self, manifest: PluginManifest) -> list[str]:
        components: list[str] = []
        if manifest.backend is not None:
            components.append("backend")
        if manifest.frontend is not None:
            components.append("frontend")
        if manifest.content is not None:
            components.append("content")
        return components

    def install_plugin(
        self,
        *,
        source_spec: str,
        scope: str | PluginScope | None = None,
        installer: str | PluginInstallerBackend | None = None,
        enable: bool = True,
        force: bool = False,
        rescan: bool = True,
    ) -> PluginInstallResponse:
        resolved_scope = normalize_scope(scope)
        resolved_installer = normalize_installer_backend(installer)
        parsed_spec = self._parse_source_spec(source_spec)
        had_backend_before = False
        with tempfile.TemporaryDirectory(
            prefix="setta-plugin-install-"
        ) as tmp_dir_name:
            tmp_dir = Path(tmp_dir_name)
            if parsed_spec.scheme == PluginSourceScheme.github:
                candidate = self._candidate_from_github(parsed_spec, tmp_dir)
            elif parsed_spec.scheme == PluginSourceScheme.pypi:
                candidate = self._candidate_from_pypi(
                    parsed_spec,
                    tmp_dir,
                    installer_backend=resolved_installer,
                )
            else:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_SCHEME_UNSUPPORTED",
                    f"Unsupported plugin source: {source_spec}",
                )

            target_path = self._target_plugin_path(
                resolved_scope, candidate.manifest.id
            )
            reservation_acquired = False
            try:
                with self._mutation_lock:
                    self._reserve_install_target_path(
                        target_path=target_path,
                        force=force,
                    )
                    reservation_acquired = True

                if candidate.manifest.backend is not None:
                    self._prepare_backend_runtime(
                        plugin_id=candidate.manifest.id,
                        version=candidate.manifest.version,
                        source_digest_sha256=candidate.source_digest_sha256,
                        plugin_root=candidate.root,
                    )
                with self._mutation_lock:
                    had_backend_before = self._existing_scope_plugin_has_backend(
                        plugin_id=candidate.manifest.id,
                        scope=resolved_scope,
                    )
                    self._ensure_target_path_available(
                        target_path=target_path, force=force
                    )

                    self._install_candidate(
                        candidate,
                        target_path,
                        scope=resolved_scope,
                        force=force,
                        source_spec=source_spec,
                        installer_backend=resolved_installer,
                    )
                    self._apply_enablement_after_install(
                        plugin_id=candidate.manifest.id,
                        scope=resolved_scope,
                        enable=enable,
                    )
                    self._pending_restart_removed_backend_plugins.pop(
                        candidate.manifest.id, None
                    )
                    if candidate.manifest.backend is not None or had_backend_before:
                        self._add_pending_restart_backend_id(candidate.manifest.id)
            finally:
                if reservation_acquired:
                    with self._mutation_lock:
                        self._release_install_target_path_reservation(
                            target_path=target_path
                        )

        if rescan:
            self.rescan()
        restart_required = candidate.manifest.backend is not None or had_backend_before
        active_entry: DiscoveredPlugin | None = None
        if rescan:
            active_entry = self._find_entry(
                candidate.manifest.id,
                resolved_scope,
                include_shadowed=True,
            )
            if active_entry is None:
                active_entry = self._active_plugin_by_id.get(candidate.manifest.id)
            if active_entry is None:
                raise PluginManagerError(
                    "PLUGIN_INSTALL_FAILED",
                    f"Installed plugin was not discovered: {candidate.manifest.id}",
                )
        else:
            state = PluginRuntimeState.active if enable else PluginRuntimeState.disabled
            active_entry = DiscoveredPlugin(
                plugin_id=candidate.manifest.id,
                name=candidate.manifest.name,
                version=candidate.manifest.version,
                scope=resolved_scope,
                source_path=target_path,
                manifest=candidate.manifest,
                canonical_source_key=candidate.canonical_source_key,
                source_digest_sha256=candidate.source_digest_sha256,
                requested_capabilities=list(candidate.manifest.capabilities),
                effective_capabilities=[],
                blocked_capabilities=[],
                state=state,
            )
        return PluginInstallResponse(
            pluginId=active_entry.plugin_id,
            version=active_entry.version,
            sourceScope=resolved_scope,
            sourceScopeLabel=scope_label(resolved_scope),
            sourcePath=str(active_entry.source_path),
            canonicalSourceKey=active_entry.canonical_source_key,
            sourceDigestSha256=active_entry.source_digest_sha256,
            requestedCapabilities=list(active_entry.requested_capabilities),
            trustStatus=PluginSourceTrustStatus.unverified,
            trustWarning=_UNVERIFIED_SOURCE_WARNING,
            components=self._manifest_components(candidate.manifest),
            state=active_entry.state,
            restartRequired=restart_required,
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
        self._validate_setta_version_range(manifest)
        self._validate_plugin_config_schema_file(source_root, manifest)
        source_digest = self._compute_directory_digest(source_root)
        resolved_scope = normalize_scope(scope)
        target = self._target_plugin_path(resolved_scope, manifest.id)
        reservation_acquired = False
        had_backend_before = False
        try:
            with self._mutation_lock:
                existing_entry = self._find_entry(
                    manifest.id,
                    resolved_scope,
                    include_shadowed=True,
                )
                had_backend_before = (
                    existing_entry.has_backend if existing_entry is not None else False
                )
                self._reserve_install_target_path(
                    target_path=target,
                    force=force,
                )
                reservation_acquired = True

            if manifest.backend is not None:
                self._prepare_backend_runtime(
                    plugin_id=manifest.id,
                    version=manifest.version,
                    source_digest_sha256=source_digest,
                    plugin_root=source_root,
                )

            with self._mutation_lock:
                self._ensure_target_path_available(target_path=target, force=force)
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists() or target.is_symlink():
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
                    installer_backend=None,
                    canonical_source_key=f"local:{source_root}",
                    version=manifest.version,
                    source_digest_sha256=source_digest,
                )
                self._apply_enablement_after_install(
                    plugin_id=manifest.id,
                    scope=resolved_scope,
                    enable=enable,
                )
                self._pending_restart_removed_backend_plugins.pop(manifest.id, None)
                restart_required = manifest.backend is not None or had_backend_before
                if restart_required:
                    self._add_pending_restart_backend_id(manifest.id)
            self.rescan()
            with self._mutation_lock:
                entry = self._find_entry(
                    manifest.id,
                    resolved_scope,
                    include_shadowed=True,
                )
        finally:
            if reservation_acquired:
                with self._mutation_lock:
                    self._release_install_target_path_reservation(target_path=target)
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
            requestedCapabilities=list(entry.requested_capabilities),
            trustStatus=PluginSourceTrustStatus.unverified,
            trustWarning=_UNVERIFIED_SOURCE_WARNING,
            components=self._manifest_components(manifest),
            state=entry.state,
            restartRequired=restart_required,
        )

    @_mutation_locked
    def uninstall_plugin(
        self,
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
        rescan: bool = True,
    ) -> PluginUninstallResponse:
        resolved_scope = self._resolve_uninstall_scope(plugin_id, scope)
        entry = self._find_entry(
            plugin_id,
            resolved_scope,
            include_shadowed=True,
        )
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found for uninstall: {plugin_id}",
                status_code=404,
            )
        self._ensure_setta_managed_for_write(
            entry=entry,
            operation="uninstall",
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
            self._add_pending_restart_backend_id(plugin_id)
            self._pending_restart_removed_backend_plugins[plugin_id] = (
                PendingRestartRemovedBackendPlugin(
                    plugin_id=entry.plugin_id,
                    name=entry.name,
                    version=entry.version,
                    scope=entry.scope,
                    source_path=entry.source_path,
                    canonical_source_key=entry.canonical_source_key,
                    source_digest_sha256=entry.source_digest_sha256,
                    requested_capabilities=list(entry.requested_capabilities),
                    effective_capabilities=list(entry.effective_capabilities),
                    blocked_capabilities=list(entry.blocked_capabilities),
                )
            )
        else:
            self._discard_pending_restart_backend_id(plugin_id)
            self._pending_restart_removed_backend_plugins.pop(plugin_id, None)
        if rescan:
            self.rescan()
        return PluginUninstallResponse(
            pluginId=plugin_id,
            removedFromScope=resolved_scope,
            restartRequired=restart_required,
        )

    @_mutation_locked
    def enable_plugin(
        self, *, plugin_id: str, rescan: bool = True
    ) -> PluginEnableDisableResponse:
        entry = self._find_highest_precedence_entry(plugin_id)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        state_file = self._load_plugins_state()
        plugins_global_state = self._load_plugins_global_state()
        if entry.manifest is None:
            was_enabled = (
                plugin_id in state_file.enabledPluginIds
                and plugin_id not in state_file.disabledPluginIds
            )
        else:
            was_enabled, _ = self._resolve_enabled(
                plugin_id=entry.plugin_id,
                scope=entry.scope,
                manifest_enabled_by_default=entry.manifest.enabledByDefault,
                plugins_state=state_file,
                plugins_global_state=plugins_global_state,
            )

        state_file_changed = False
        if plugin_id not in state_file.enabledPluginIds:
            state_file.enabledPluginIds.append(plugin_id)
            state_file_changed = True
        if plugin_id in state_file.disabledPluginIds:
            state_file.disabledPluginIds = [
                value for value in state_file.disabledPluginIds if value != plugin_id
            ]
            state_file_changed = True
        if state_file_changed:
            self._save_plugins_state(state_file)

        enablement_changed = not was_enabled
        if entry.has_backend and enablement_changed:
            self._add_pending_restart_backend_id(plugin_id)
            self._pending_restart_removed_backend_plugins.pop(plugin_id, None)

        restart_required = (
            entry.has_backend and plugin_id in self._pending_restart_backend_ids
        )
        if rescan:
            self.rescan()
            latest = self._find_highest_precedence_entry(plugin_id)
            if latest is None:
                raise PluginManagerError(
                    "PLUGIN_NOT_FOUND",
                    f"Plugin not found: {plugin_id}",
                    status_code=404,
                )
            state = latest.state
        elif restart_required:
            state = PluginRuntimeState.pending_restart
        else:
            state = PluginRuntimeState.active
        return PluginEnableDisableResponse(
            pluginId=plugin_id,
            state=state,
            restartRequired=restart_required,
        )

    @_mutation_locked
    def disable_plugin(
        self, *, plugin_id: str, rescan: bool = True
    ) -> PluginEnableDisableResponse:
        entry = self._find_highest_precedence_entry(plugin_id)
        if entry is None:
            raise PluginManagerError(
                "PLUGIN_NOT_FOUND",
                f"Plugin not found: {plugin_id}",
                status_code=404,
            )
        state_file = self._load_plugins_state()
        plugins_global_state = self._load_plugins_global_state()
        if entry.manifest is None:
            was_enabled = (
                plugin_id in state_file.enabledPluginIds
                and plugin_id not in state_file.disabledPluginIds
            )
        else:
            was_enabled, _ = self._resolve_enabled(
                plugin_id=entry.plugin_id,
                scope=entry.scope,
                manifest_enabled_by_default=entry.manifest.enabledByDefault,
                plugins_state=state_file,
                plugins_global_state=plugins_global_state,
            )

        state_file_changed = False
        if plugin_id not in state_file.disabledPluginIds:
            state_file.disabledPluginIds.append(plugin_id)
            state_file_changed = True
        if plugin_id in state_file.enabledPluginIds:
            state_file.enabledPluginIds = [
                value for value in state_file.enabledPluginIds if value != plugin_id
            ]
            state_file_changed = True
        if state_file_changed:
            self._save_plugins_state(state_file)

        enablement_changed = was_enabled
        if entry.has_backend and enablement_changed:
            self._add_pending_restart_backend_id(plugin_id)
            self._pending_restart_removed_backend_plugins.pop(plugin_id, None)

        restart_required = (
            entry.has_backend and plugin_id in self._pending_restart_backend_ids
        )
        if rescan:
            self.rescan()
            latest = self._find_highest_precedence_entry(plugin_id)
            if latest is None:
                raise PluginManagerError(
                    "PLUGIN_NOT_FOUND",
                    f"Plugin not found: {plugin_id}",
                    status_code=404,
                )
            state = latest.state
        elif restart_required:
            state = PluginRuntimeState.pending_restart
        else:
            state = PluginRuntimeState.disabled
        return PluginEnableDisableResponse(
            pluginId=plugin_id,
            state=state,
            restartRequired=restart_required,
        )

    @_mutation_locked
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
        state_file.pluginConfigById[
            self._plugin_config_key(plugin_id=entry.plugin_id, scope=entry.scope)
        ] = config
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
        rescan: bool = True,
    ) -> PluginUpdateResponse:
        with self._mutation_lock:
            resolved_scope = self._resolve_uninstall_scope(plugin_id, scope)
            existing_entry = self._find_entry(
                plugin_id,
                resolved_scope,
                include_shadowed=True,
            )
            if existing_entry is None:
                raise PluginManagerError(
                    "PLUGIN_NOT_FOUND",
                    f"Plugin not found: {plugin_id}",
                    status_code=404,
                )
            self._ensure_setta_managed_for_write(
                entry=existing_entry,
                operation="update",
            )
            metadata_entry = self._get_install_metadata(plugin_id, resolved_scope)
            if metadata_entry is None:
                raise PluginManagerError(
                    "PLUGIN_UPDATE_UNAVAILABLE",
                    f"No source metadata stored for plugin: {plugin_id}",
                )
            if self._source_spec_is_local(metadata_entry.sourceSpec):
                raise PluginManagerError(
                    "PLUGIN_UPDATE_UNAVAILABLE",
                    (
                        "Update is unavailable for linked local plugins. "
                        f"Unlink and relink the desired local source for {plugin_id}."
                    ),
                )
            source_spec = metadata_entry.sourceSpec
            if to is not None:
                source_spec = self._retarget_source_spec(source_spec, to)
            plugins_state = self._load_plugins_state()
            plugins_global_state = self._load_plugins_global_state()
            if existing_entry.manifest is None:
                enable_after_update = (
                    existing_entry.state != PluginRuntimeState.disabled
                )
            else:
                enable_after_update, _ = self._resolve_enabled(
                    plugin_id=existing_entry.plugin_id,
                    scope=existing_entry.scope,
                    manifest_enabled_by_default=existing_entry.manifest.enabledByDefault,
                    plugins_state=plugins_state,
                    plugins_global_state=plugins_global_state,
                )
            existing_version = existing_entry.version
            existing_has_backend = existing_entry.has_backend
            installer_backend = metadata_entry.installerBackend
        install_result = self.install_plugin(
            source_spec=source_spec,
            scope=resolved_scope,
            installer=installer_backend,
            enable=enable_after_update,
            force=True,
            rescan=rescan,
        )
        restart_required = existing_has_backend or install_result.restartRequired
        if restart_required:
            with self._mutation_lock:
                self._add_pending_restart_backend_id(plugin_id)
                self._pending_restart_removed_backend_plugins.pop(plugin_id, None)
        return PluginUpdateResponse(
            pluginId=plugin_id,
            fromVersion=existing_version,
            toVersion=install_result.version,
            sourceDigestSha256=install_result.sourceDigestSha256,
            restartRequired=restart_required,
        )

    def rollback_plugin(
        self,
        *,
        plugin_id: str,
        scope: str | PluginScope | None = None,
        rescan: bool = True,
    ) -> PluginRollbackResponse:
        resolved_scope: PluginScope | None = None
        target: Path | None = None
        snapshot_path: Path | None = None
        snapshot_manifest: PluginManifest | None = None
        current_entry_had_backend = False
        reservation_acquired = False
        try:
            with self._mutation_lock:
                resolved_scope = self._resolve_uninstall_scope(plugin_id, scope)
                current_entry = self._find_entry(
                    plugin_id,
                    resolved_scope,
                    include_shadowed=True,
                )
                current_entry_had_backend = (
                    current_entry.has_backend if current_entry is not None else False
                )
                metadata = self._load_install_metadata()
                metadata_key = self._metadata_key(plugin_id, resolved_scope)
                metadata_entry = metadata.entries.get(metadata_key)
                if metadata_entry is not None and self._source_spec_is_local(
                    metadata_entry.sourceSpec
                ):
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        (
                            "Rollback is unavailable for linked local plugins. "
                            f"Unlink and relink the desired local source for {plugin_id}."
                        ),
                    )
                if metadata_entry is None or len(metadata_entry.history) == 0:
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        f"No rollback history exists for plugin: {plugin_id}",
                    )
                if current_entry is not None:
                    self._ensure_setta_managed_for_write(
                        entry=current_entry,
                        operation="rollback",
                    )
                previous = metadata_entry.history[-1]
                snapshot_path = Path(previous.snapshotPath)
                if not snapshot_path.exists():
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        f"Rollback snapshot missing for plugin: {plugin_id}",
                    )
                snapshot_manifest = self._load_and_validate_manifest(
                    snapshot_path / "setta.plugin.json"
                )
                target = self._target_plugin_path(resolved_scope, plugin_id)
                self._reserve_install_target_path(target_path=target, force=True)
                reservation_acquired = True

            if snapshot_path is None or snapshot_manifest is None:
                raise PluginManagerError(
                    "PLUGIN_ROLLBACK_UNAVAILABLE",
                    f"Rollback snapshot metadata is missing for plugin: {plugin_id}",
                )
            snapshot_digest = self._compute_directory_digest(snapshot_path)
            if snapshot_manifest.backend is not None:
                self._prepare_backend_runtime(
                    plugin_id=plugin_id,
                    version=snapshot_manifest.version,
                    source_digest_sha256=snapshot_digest,
                    plugin_root=snapshot_path,
                )

            with self._mutation_lock:
                if resolved_scope is None or target is None:
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        f"Rollback target state is missing for plugin: {plugin_id}",
                    )
                metadata_key = self._metadata_key(plugin_id, resolved_scope)
                metadata = self._load_install_metadata()
                metadata_entry = metadata.entries.get(metadata_key)
                if metadata_entry is not None and self._source_spec_is_local(
                    metadata_entry.sourceSpec
                ):
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        (
                            "Rollback is unavailable for linked local plugins. "
                            f"Unlink and relink the desired local source for {plugin_id}."
                        ),
                    )
                if metadata_entry is None or len(metadata_entry.history) == 0:
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        f"No rollback history exists for plugin: {plugin_id}",
                    )
                latest_history = metadata_entry.history[-1]
                if latest_history.snapshotPath != str(snapshot_path):
                    raise PluginManagerError(
                        "PLUGIN_ROLLBACK_UNAVAILABLE",
                        (
                            "Rollback history changed while preparing rollback for "
                            f"plugin: {plugin_id}"
                        ),
                    )
                metadata_entry.history.pop()
                if target.exists() and target.is_dir() and not target.is_symlink():
                    shutil.rmtree(target)
                elif target.exists() or target.is_symlink():
                    target.unlink()
                shutil.copytree(snapshot_path, target)

                metadata_entry.version = snapshot_manifest.version
                metadata_entry.sourceDigestSha256 = snapshot_digest
                metadata.entries[metadata_key] = metadata_entry
                self._save_install_metadata(metadata)
                restart_required = (
                    snapshot_manifest.backend is not None or current_entry_had_backend
                )
                if restart_required:
                    self._add_pending_restart_backend_id(plugin_id)
                    self._pending_restart_removed_backend_plugins.pop(plugin_id, None)
            if rescan:
                self.rescan()
            return PluginRollbackResponse(
                pluginId=plugin_id,
                restoredVersion=snapshot_manifest.version,
                sourceDigestSha256=snapshot_digest,
                restartRequired=restart_required,
            )
        finally:
            if reservation_acquired and target is not None:
                with self._mutation_lock:
                    self._release_install_target_path_reservation(target_path=target)

    def _source_spec_is_local(self, source_spec: str) -> bool:
        return source_spec.strip().lower().startswith("local:")

    @_mutation_locked
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
            if entry.source_manager == PluginSourceManager.package_manager:
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
                    installerBackend=(
                        metadata_entry.installerBackend if metadata_entry else None
                    ),
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

    @_mutation_locked
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
        duplicate_keys: set[tuple[PluginScope, str]] = set()
        for plugin in lockfile.plugins:
            key = (plugin.scope, plugin.pluginId)
            if key in desired_by_scope_plugin:
                duplicate_keys.add(key)
            desired_by_scope_plugin[key] = plugin
        if len(duplicate_keys) > 0:
            duplicate_labels = ", ".join(
                f"{scope.value}:{plugin_id}"
                for scope, plugin_id in sorted(
                    duplicate_keys,
                    key=lambda value: (_SCOPE_ORDER[value[0]], value[1]),
                )
            )
            raise PluginManagerError(
                "PLUGIN_LOCKFILE_INVALID",
                (
                    "Lockfile contains duplicate scope/plugin entries: "
                    f"{duplicate_labels}"
                ),
            )

        install_metadata = self._load_install_metadata()
        current_primary_entries = [
            entry
            for entry in self._discovered_plugins
            if entry.shadowed_by_source_path is None
        ]
        current_external_by_scope_plugin = {
            (entry.scope, entry.plugin_id): entry
            for entry in current_primary_entries
            if entry.source_manager == PluginSourceManager.package_manager
        }
        current_by_scope_plugin = {
            (entry.scope, entry.plugin_id): entry
            for entry in current_primary_entries
            if entry.source_manager != PluginSourceManager.package_manager
        }

        def _lock_entry_is_external_managed(entry: PluginLockEntry) -> bool:
            if entry.scope != PluginScope.setta_files:
                return False
            if entry.sourceSpec is not None:
                return False
            if entry.installerBackend is not None:
                return False
            return entry.canonicalSourceKey.startswith(
                "pypi:"
            ) or entry.canonicalSourceKey.startswith("python-env:")

        def _source_reconcile_required(
            *,
            desired: PluginLockEntry,
            current: DiscoveredPlugin,
        ) -> bool:
            if current.canonical_source_key != desired.canonicalSourceKey:
                return True
            if desired.sourceSpec is None:
                return False
            metadata_entry = install_metadata.entries.get(
                self._metadata_key(current.plugin_id, current.scope)
            )
            if metadata_entry is None:
                return True
            return metadata_entry.sourceSpec != desired.sourceSpec

        planned_changes: list[str] = []
        for key, desired in desired_by_scope_plugin.items():
            if (
                key in current_external_by_scope_plugin
                or _lock_entry_is_external_managed(desired)
            ):
                continue
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
            if _source_reconcile_required(desired=desired, current=current):
                planned_changes.append(
                    f"reconcile source for {desired.pluginId} in {desired.scope.value}"
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
            if (
                key in current_external_by_scope_plugin
                or _lock_entry_is_external_managed(desired)
            ):
                continue
            current = current_by_scope_plugin.get(key)
            if current is not None:
                source_reconcile_required = _source_reconcile_required(
                    desired=desired,
                    current=current,
                )
                if current.version == desired.version and (
                    not source_reconcile_required
                    and (
                        desired.sourceDigestSha256 is None
                        or current.source_digest_sha256 == desired.sourceDigestSha256
                    )
                ):
                    continue
            if desired.sourceSpec is None:
                raise PluginManagerError(
                    "PLUGIN_LOCKFILE_ENTRY_MISSING_SOURCE",
                    f"Lockfile entry missing source spec for plugin: {desired.pluginId}",
                )
            enable_for_install = True
            if current is not None:
                enable_for_install = current.state != PluginRuntimeState.disabled
            installer_backend = desired.installerBackend
            if installer_backend is None and current is not None:
                metadata_entry = install_metadata.entries.get(
                    self._metadata_key(current.plugin_id, current.scope)
                )
                if metadata_entry is not None:
                    installer_backend = metadata_entry.installerBackend
            self.install_plugin(
                source_spec=desired.sourceSpec,
                scope=desired.scope,
                installer=installer_backend,
                enable=enable_for_install,
                force=True,
                rescan=False,
            )

        for key, current in current_by_scope_plugin.items():
            if key in desired_by_scope_plugin:
                continue
            self.uninstall_plugin(
                plugin_id=current.plugin_id,
                scope=current.scope,
                rescan=False,
            )

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
        normalized_id = self._normalize_and_validate_init_plugin_id(plugin_id)
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
                "export const apiVersion = 1;\n\n"
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
            blueprints_dir = content_dir / "blueprints"
            templates_dir = content_dir / "project_templates"
            prompts_dir = content_dir / "prompts"
            blueprints_dir.mkdir(parents=True, exist_ok=True)
            templates_dir.mkdir(parents=True, exist_ok=True)
            prompts_dir.mkdir(parents=True, exist_ok=True)
            (blueprints_dir / "starter-blueprint.json").write_text(
                '{\n  "schemaVersion": 1,\n  "name": "Starter Blueprint",\n  "description": "Replace with your blueprint payload.",\n  "data": {\n    "project": {},\n    "sectionVariantMap": {}\n  }\n}\n',
                encoding="utf-8",
            )
            (templates_dir / "starter-template.json").write_text(
                '{\n  "schemaVersion": 1,\n  "name": "Starter Template",\n  "description": "Replace with your project template payload.",\n  "project": {}\n}\n',
                encoding="utf-8",
            )
            (prompts_dir / "starter-prompt.md").write_text(
                "Replace this prompt template with your own content.\n",
                encoding="utf-8",
            )
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
            "[tool.setuptools]\n"
            "py-modules = []\n\n"
            "[tool.setuptools.data-files]\n"
            '"." = ["setta.plugin.json", "README.md"]\n'
            '"backend" = ["backend/*.py"]\n'
            '"frontend/dist" = ["frontend/dist/*"]\n'
            '"content/blueprints" = ["content/blueprints/*"]\n'
            '"content/project_templates" = ["content/project_templates/*"]\n'
            '"content/prompts" = ["content/prompts/*"]\n'
        )
        (root / "pyproject.toml").write_text(pyproject_content, encoding="utf-8")
        workflow_dir = root / ".github" / "workflows"
        workflow_dir.mkdir(parents=True, exist_ok=True)
        (workflow_dir / "release.yml").write_text(
            "name: publish-plugin\n\n"
            "on:\n"
            "  workflow_dispatch:\n"
            "  push:\n"
            "    tags:\n"
            '      - "v*"\n\n'
            "jobs:\n"
            "  build-and-publish:\n"
            "    runs-on: ubuntu-latest\n"
            "    steps:\n"
            "      - uses: actions/checkout@v4\n"
            "      - uses: actions/setup-python@v5\n"
            "        with:\n"
            '          python-version: "3.12"\n'
            "      - run: python -m pip install --upgrade build twine setta\n"
            "      - run: setta plugins validate .\n"
            "      - run: python -m build\n"
            "      - run: python -m twine check dist/*\n"
            "      # Configure publish credentials/secrets for your registry.\n",
            encoding="utf-8",
        )
        (root / "README.md").write_text(
            "# Setta Plugin\n\n"
            "## Validate\n\n"
            "```bash\n"
            "setta plugins validate .\n"
            "```\n\n"
            "## Build\n\n"
            "```bash\n"
            "python -m build\n"
            "```\n\n"
            "## Publish\n\n"
            "1. Push a git tag (for example `v0.1.0`) to trigger `.github/workflows/release.yml`.\n"
            "2. Or run manual publish using your package registry credentials.\n\n"
            "## Install\n\n"
            "```bash\n"
            "setta plugins install github:OWNER/REPO#v0.1.0\n"
            "setta plugins install pypi:" + normalized_id + "==0.1.0\n"
            "```\n",
            encoding="utf-8",
        )
        return root

    def _normalize_and_validate_init_plugin_id(self, plugin_id: str) -> str:
        normalized_id = plugin_id.strip().lower()
        if not normalized_id:
            raise PluginManagerError("PLUGIN_INIT_INVALID_ID", "Missing plugin id.")
        try:
            return PluginManifest.validate_id(normalized_id)
        except ValueError as exc:
            raise PluginManagerError(
                "PLUGIN_INIT_INVALID_ID",
                f"Invalid plugin id: {exc}",
            ) from exc

    def _discover_plugins(
        self, *, include_package_manager_plugins: bool
    ) -> list[DiscoveredPlugin]:
        install_metadata = self._load_install_metadata()
        entries: list[DiscoveredPlugin] = self._discover_filesystem_plugins(
            install_metadata
        )
        if include_package_manager_plugins:
            entries.extend(self._discover_package_manager_plugins())

        grouped: dict[str, list[DiscoveredPlugin]] = {}
        for entry in entries:
            grouped.setdefault(entry.plugin_id, []).append(entry)

        resolved_entries: list[DiscoveredPlugin] = []
        plugins_state = self._load_plugins_state()
        plugins_global_state = self._load_plugins_global_state()

        for plugin_id, grouped_entries in grouped.items():
            ordered_group = sorted(
                grouped_entries,
                key=lambda entry: (
                    _SCOPE_ORDER[entry.scope],
                    _SOURCE_MANAGER_ORDER[entry.source_manager],
                    str(entry.source_path),
                ),
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

        discovered_plugin_ids = {entry.plugin_id for entry in entries}
        stale_pending_removed_ids = [
            plugin_id
            for plugin_id in self._pending_restart_removed_backend_plugins
            if plugin_id in discovered_plugin_ids
        ]
        for plugin_id in stale_pending_removed_ids:
            self._pending_restart_removed_backend_plugins.pop(plugin_id, None)

        for (
            plugin_id,
            pending_removed,
        ) in self._pending_restart_removed_backend_plugins.items():
            if plugin_id in discovered_plugin_ids:
                continue
            resolved_entries.append(
                DiscoveredPlugin(
                    plugin_id=pending_removed.plugin_id,
                    name=pending_removed.name,
                    version=pending_removed.version,
                    scope=pending_removed.scope,
                    source_path=pending_removed.source_path,
                    manifest=None,
                    canonical_source_key=pending_removed.canonical_source_key,
                    source_digest_sha256=pending_removed.source_digest_sha256,
                    errors=[],
                    state=PluginRuntimeState.pending_restart,
                    shadowed_by_source_path=None,
                    requested_capabilities=list(pending_removed.requested_capabilities),
                    effective_capabilities=list(pending_removed.effective_capabilities),
                    blocked_capabilities=list(pending_removed.blocked_capabilities),
                    restart_required=True,
                )
            )

        return resolved_entries

    def _discover_filesystem_plugins(
        self,
        install_metadata: PluginInstallMetadataFile,
    ) -> list[DiscoveredPlugin]:
        entries: list[DiscoveredPlugin] = []
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
        return entries

    def _discover_package_manager_plugins(self) -> list[DiscoveredPlugin]:
        entries: list[DiscoveredPlugin] = []
        seen_roots: set[str] = set()
        search_paths = (
            None
            if self._package_manager_search_paths is None
            else [str(path) for path in self._package_manager_search_paths]
        )
        distributions = (
            importlib.metadata.distributions()
            if search_paths is None
            else importlib.metadata.distributions(path=search_paths)
        )
        for distribution in distributions:
            manifest_paths = self._distribution_manifest_paths(distribution)
            if len(manifest_paths) == 0:
                continue
            distribution_name = self._distribution_name(distribution)
            normalized_name = self._normalize_distribution_name(distribution_name)
            canonical_source_key = (
                f"pypi:{normalized_name}"
                if normalized_name is not None
                else f"python-env:{distribution_name or 'unknown'}"
            )
            if len(manifest_paths) > 1:
                plugin_id = normalized_name or "unknown"
                plugin_name = distribution_name or plugin_id
                entries.append(
                    DiscoveredPlugin(
                        plugin_id=plugin_id,
                        name=plugin_name,
                        version=self._distribution_version(distribution),
                        scope=PluginScope.setta_files,
                        source_path=manifest_paths[0].parent,
                        manifest=None,
                        canonical_source_key=canonical_source_key,
                        source_digest_sha256=None,
                        source_manager=PluginSourceManager.package_manager,
                        source_manager_hint=_PACKAGE_MANAGER_SOURCE_HINT,
                        errors=[
                            PluginErrorInfo(
                                code="PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT",
                                message=(
                                    "Environment distribution contained multiple "
                                    f"setta.plugin.json files: {distribution_name}"
                                ),
                            )
                        ],
                        state=PluginRuntimeState.invalid,
                    )
                )
                continue
            manifest_path = manifest_paths[0]
            plugin_root = manifest_path.parent
            source_key = str(plugin_root.resolve(strict=False))
            if source_key in seen_roots:
                continue
            seen_roots.add(source_key)
            try:
                manifest = self._load_and_validate_manifest(manifest_path)
                self._validate_manifest_paths(plugin_root, manifest)
                self._validate_setta_version_range(manifest)
                self._validate_plugin_config_schema_file(plugin_root, manifest)
            except PluginManagerError as exc:
                plugin_id = normalized_name or (distribution_name or "unknown")
                plugin_name = distribution_name or plugin_id
                entries.append(
                    DiscoveredPlugin(
                        plugin_id=plugin_id,
                        name=plugin_name,
                        version=self._distribution_version(distribution),
                        scope=PluginScope.setta_files,
                        source_path=plugin_root,
                        manifest=None,
                        canonical_source_key=canonical_source_key,
                        source_digest_sha256=None,
                        source_manager=PluginSourceManager.package_manager,
                        source_manager_hint=_PACKAGE_MANAGER_SOURCE_HINT,
                        errors=[PluginErrorInfo(code=exc.code, message=exc.message)],
                        state=PluginRuntimeState.invalid,
                    )
                )
                continue
            digest = self._compute_package_manager_source_digest(
                distribution=distribution,
                plugin_root=plugin_root,
                manifest=manifest,
            )
            entries.append(
                DiscoveredPlugin(
                    plugin_id=manifest.id,
                    name=manifest.name,
                    version=manifest.version,
                    scope=PluginScope.setta_files,
                    source_path=plugin_root,
                    manifest=manifest,
                    canonical_source_key=canonical_source_key,
                    source_digest_sha256=digest,
                    source_manager=PluginSourceManager.package_manager,
                    source_manager_hint=_PACKAGE_MANAGER_SOURCE_HINT,
                )
            )
        return entries

    def _distribution_manifest_paths(
        self,
        distribution: importlib.metadata.Distribution,
    ) -> list[Path]:
        files = distribution.files
        if files is None:
            return []
        manifests: list[Path] = []
        for file in files:
            if Path(str(file)).name != "setta.plugin.json":
                continue
            manifests.append(Path(distribution.locate_file(file)).resolve(strict=False))
        return sorted(manifests, key=lambda path: str(path))

    def _distribution_name(
        self,
        distribution: importlib.metadata.Distribution,
    ) -> str | None:
        raw_name = distribution.metadata.get("Name")
        if not isinstance(raw_name, str):
            return None
        name = raw_name.strip()
        return name or None

    def _distribution_version(
        self,
        distribution: importlib.metadata.Distribution,
    ) -> str:
        raw_version = distribution.version
        if isinstance(raw_version, str) and raw_version.strip():
            return raw_version.strip()
        return "unknown"

    def _compute_package_manager_source_digest(
        self,
        *,
        distribution: importlib.metadata.Distribution,
        plugin_root: Path,
        manifest: PluginManifest | None = None,
    ) -> str:
        distribution_name = self._distribution_name(distribution) or "unknown"
        distribution_version = self._distribution_version(distribution)
        plugin_root_resolved = plugin_root.resolve(strict=False)
        record_path = self._distribution_record_path(distribution)
        record_fingerprint = "missing"
        if record_path is not None and record_path.exists() and record_path.is_file():
            record_stat = record_path.stat()
            record_fingerprint = (
                f"{record_path}:{record_stat.st_mtime_ns}:{record_stat.st_size}"
            )
        include_plugin_root_change_stamp = not self._distribution_record_has_hashes(
            record_path
        )
        plugin_root_change_stamp_digest = "none"
        if include_plugin_root_change_stamp:
            plugin_root_change_stamp_digest = (
                self._package_manager_plugin_root_change_stamp_digest(
                    plugin_root=plugin_root,
                    manifest=manifest,
                )
            )
        cache_key = (
            f"{distribution_name}|{distribution_version}|"
            f"{plugin_root_resolved}|{record_fingerprint}|"
            f"{plugin_root_change_stamp_digest}"
        )
        cached_digest = self._package_manager_source_digest_cache.get(cache_key)
        if cached_digest is not None:
            self._package_manager_source_digest_cache.move_to_end(cache_key)
            return cached_digest

        hasher = hashlib.sha256()
        hasher.update(distribution_name.encode("utf-8"))
        hasher.update(distribution_version.encode("utf-8"))
        hasher.update(str(plugin_root_resolved).encode("utf-8"))
        if record_path is not None and record_path.exists() and record_path.is_file():
            hasher.update(str(record_path).encode("utf-8"))
            with record_path.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    hasher.update(chunk)
        if include_plugin_root_change_stamp:
            hasher.update(plugin_root_change_stamp_digest.encode("utf-8"))
        digest = hasher.hexdigest()
        self._package_manager_source_digest_cache[cache_key] = digest
        self._package_manager_source_digest_cache.move_to_end(cache_key)
        while (
            len(self._package_manager_source_digest_cache)
            > _PACKAGE_MANAGER_SOURCE_DIGEST_CACHE_MAX_ENTRIES
        ):
            self._package_manager_source_digest_cache.popitem(last=False)
        return digest

    def _distribution_record_has_hashes(self, record_path: Path | None) -> bool:
        if record_path is None or not record_path.exists() or not record_path.is_file():
            return False
        has_non_record_entries = False
        try:
            for line in record_path.read_text(encoding="utf-8").splitlines():
                if line.strip() == "":
                    continue
                row = line.split(",", 2)
                if len(row) < 2:
                    continue
                relative_path = row[0].strip()
                if relative_path.endswith(".dist-info/RECORD"):
                    continue
                has_non_record_entries = True
                if row[1].strip() == "":
                    return False
        except OSError:
            return False
        return has_non_record_entries

    def _package_manager_plugin_root_change_stamp_digest(
        self,
        *,
        plugin_root: Path,
        manifest: PluginManifest | None,
    ) -> str:
        plugin_root_resolved = plugin_root.resolve(strict=False)
        resolved_manifest = manifest
        if resolved_manifest is None:
            manifest_path = plugin_root_resolved / "setta.plugin.json"
            if manifest_path.exists() and manifest_path.is_file():
                try:
                    resolved_manifest = self._load_and_validate_manifest(manifest_path)
                except PluginManagerError:
                    resolved_manifest = None
        tracked_paths: set[Path] = {plugin_root_resolved / "setta.plugin.json"}
        if resolved_manifest is not None:
            tracked_paths.update(
                self._package_manager_manifest_tracked_paths(
                    plugin_root=plugin_root_resolved,
                    manifest=resolved_manifest,
                )
            )

        change_stamp: list[tuple[str, int, int]] = []
        for tracked_path in sorted(tracked_paths, key=lambda item: str(item)):
            tracked_path_resolved = tracked_path.resolve(strict=False)
            if tracked_path_resolved.is_dir():
                directory_change_stamp = self._directory_change_stamp(
                    tracked_path_resolved
                )
                if tracked_path_resolved.is_relative_to(plugin_root_resolved):
                    tracked_path_label = tracked_path_resolved.relative_to(
                        plugin_root_resolved
                    ).as_posix()
                else:
                    tracked_path_label = str(tracked_path_resolved)
                for relative_path, modified_ns, size_bytes in directory_change_stamp:
                    change_stamp.append(
                        (
                            f"{tracked_path_label}/{relative_path}",
                            modified_ns,
                            size_bytes,
                        )
                    )
                continue
            if (
                not tracked_path_resolved.exists()
                or not tracked_path_resolved.is_file()
            ):
                continue
            file_stat = tracked_path_resolved.stat()
            if tracked_path_resolved.is_relative_to(plugin_root_resolved):
                relative_path = tracked_path_resolved.relative_to(
                    plugin_root_resolved
                ).as_posix()
            else:
                relative_path = str(tracked_path_resolved)
            change_stamp.append(
                (relative_path, file_stat.st_mtime_ns, file_stat.st_size)
            )
        change_stamp.sort(key=lambda item: item[0])
        return self._digest_change_stamp(tuple(change_stamp))

    def _package_manager_manifest_tracked_paths(
        self,
        *,
        plugin_root: Path,
        manifest: PluginManifest,
    ) -> set[Path]:
        tracked_paths: set[Path] = set()

        def _append_manifest_path(path_value: str | None, message_prefix: str) -> None:
            if path_value is None:
                return
            try:
                tracked_paths.add(
                    self._resolve_relative_path(
                        plugin_root,
                        path_value,
                        code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
                        message_prefix=message_prefix,
                    )
                )
            except PluginManagerError:
                return

        _append_manifest_path(
            manifest.configSchemaPath,
            "Invalid configSchemaPath",
        )
        if manifest.backend is not None:
            _append_manifest_path(
                manifest.backend.entrypoint,
                "Invalid plugin backend entrypoint path",
            )
        if manifest.frontend is not None:
            _append_manifest_path(
                manifest.frontend.entrypoint,
                "Invalid plugin frontend entrypoint path",
            )
            _append_manifest_path(
                manifest.frontend.style,
                "Invalid plugin frontend style path",
            )
        if manifest.content is not None:
            _append_manifest_path(
                manifest.content.blueprintsDir,
                "Invalid plugin content blueprintsDir path",
            )
            _append_manifest_path(
                manifest.content.projectTemplatesDir,
                "Invalid plugin content projectTemplatesDir path",
            )
            _append_manifest_path(
                manifest.content.promptsDir,
                "Invalid plugin content promptsDir path",
            )
        return tracked_paths

    def _existing_scope_plugin_has_backend(
        self, *, plugin_id: str, scope: PluginScope
    ) -> bool:
        plugin_root = self._target_plugin_path(scope, plugin_id)
        manifest_path = plugin_root / "setta.plugin.json"
        if not manifest_path.exists() or not manifest_path.is_file():
            return False
        try:
            manifest = self._load_and_validate_manifest(manifest_path)
        except PluginManagerError:
            return False
        return manifest.backend is not None

    def _distribution_record_path(
        self,
        distribution: importlib.metadata.Distribution,
    ) -> Path | None:
        files = distribution.files
        if files is None:
            return None
        for file in files:
            if Path(str(file)).name != "RECORD":
                continue
            return Path(distribution.locate_file(file)).resolve(strict=False)
        return None

    def _normalize_distribution_name(self, raw_name: str | None) -> str | None:
        if raw_name is None:
            return None
        try:
            return self._normalize_package_name(raw_name)
        except PluginManagerError:
            return None

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

        if entry.plugin_id in self._pending_restart_backend_ids:
            entry.state = PluginRuntimeState.pending_restart
            entry.restart_required = True
            return

        enabled, enablement_source = self._resolve_enabled(
            plugin_id=entry.plugin_id,
            scope=entry.scope,
            manifest_enabled_by_default=entry.manifest.enabledByDefault,
            plugins_state=plugins_state,
            plugins_global_state=plugins_global_state,
        )
        entry.enablement_source = enablement_source
        if not enabled:
            entry.state = PluginRuntimeState.disabled
            entry.restart_required = False
            return

        config = self._read_plugin_config(
            plugins_state=plugins_state,
            plugin_id=entry.plugin_id,
            scope=entry.scope,
        )
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

        runtime_error = self._backend_runtime_errors.get(entry.plugin_id)
        if entry.has_backend and runtime_error is not None:
            entry.state = PluginRuntimeState.invalid
            entry.errors.append(
                PluginErrorInfo(
                    code=runtime_error.code,
                    message=runtime_error.message,
                )
            )
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
    ) -> tuple[bool, PluginEnablementSource]:
        if plugin_id in plugins_state.disabledPluginIds:
            return False, PluginEnablementSource.workspace_disabled
        if plugin_id in plugins_state.enabledPluginIds:
            return True, PluginEnablementSource.workspace_enabled
        if scope == PluginScope.global_scope:
            if plugin_id in plugins_global_state.autoEnabledPluginIds:
                return True, PluginEnablementSource.global_auto_enabled
        return manifest_enabled_by_default, PluginEnablementSource.manifest_default

    def _resolve_effective_capabilities(
        self, requested: list[str]
    ) -> tuple[list[str], list[PluginBlockedCapability]]:
        allowed = _MODE_ALLOWED_CAPABILITIES[self.server_mode]
        effective: list[str] = []
        blocked: list[PluginBlockedCapability] = []
        for capability in requested:
            if capability in _HOST_BLOCKED_CAPABILITIES:
                blocked.append(
                    PluginBlockedCapability(
                        capability=capability,
                        reason=BlockedCapabilityReason.host_policy,
                    )
                )
                continue
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
        cache_key = (entry.plugin_id, entry.scope, entry.source_digest_sha256)
        cached = self._content_descriptor_cache.get(cache_key)
        if cached is not None:
            return cached
        manifest = entry.manifest
        if manifest is None or manifest.content is None:
            descriptor = PluginContentDescriptor(
                hasBlueprints=False,
                hasProjectTemplates=False,
                hasPrompts=False,
            )
            self._content_descriptor_cache[cache_key] = descriptor
            return descriptor

        descriptor = PluginContentDescriptor(
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
        self._content_descriptor_cache[cache_key] = descriptor
        return descriptor

    def _build_config_schema_descriptor(
        self,
        entry: DiscoveredPlugin,
    ) -> tuple[bool, dict[str, Any] | None]:
        cache_key = (entry.plugin_id, entry.scope, entry.source_digest_sha256)
        cached = self._config_schema_descriptor_cache.get(cache_key)
        if cached is not None:
            return cached
        manifest = entry.manifest
        if manifest is None or manifest.configSchemaPath is None:
            self._config_schema_descriptor_cache[cache_key] = (False, None)
            return (False, None)
        schema_path = self._resolve_relative_path(
            entry.source_path,
            manifest.configSchemaPath,
            code="PLUGIN_MANIFEST_PATH_NOT_FOUND",
            message_prefix="Invalid configSchemaPath",
        )
        if not schema_path.exists() or not schema_path.is_file():
            self._config_schema_descriptor_cache[cache_key] = (False, None)
            return (False, None)
        try:
            schema_json = json.loads(schema_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            schema_json = None
        if isinstance(schema_json, dict):
            descriptor = (True, schema_json)
            self._config_schema_descriptor_cache[cache_key] = descriptor
            return descriptor
        self._config_schema_descriptor_cache[cache_key] = (True, None)
        return (True, None)

    def _build_config_descriptor(
        self,
        entry: DiscoveredPlugin,
        *,
        plugins_state: PluginsStateFile,
    ) -> PluginConfigDescriptor:
        current_config = self._read_plugin_config(
            plugins_state=plugins_state,
            plugin_id=entry.plugin_id,
            scope=entry.scope,
        )
        if not isinstance(current_config, dict):
            current_config = {}
        has_schema, schema_json = self._build_config_schema_descriptor(entry)
        current_config_digest = self._compute_json_payload_digest(current_config)
        if not has_schema:
            return PluginConfigDescriptor(
                hasSchema=False,
                currentConfig=current_config,
                currentConfigDigestSha256=current_config_digest,
            )
        if isinstance(schema_json, dict):
            return PluginConfigDescriptor(
                hasSchema=True,
                schemaJson=schema_json,
                schemaJsonDigestSha256=self._compute_json_payload_digest(schema_json),
                currentConfig=current_config,
                currentConfigDigestSha256=current_config_digest,
            )
        return PluginConfigDescriptor(
            hasSchema=True,
            currentConfig=current_config,
            currentConfigDigestSha256=current_config_digest,
        )

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

        raw_schema_version = (
            raw_json.get("schemaVersion") if isinstance(raw_json, dict) else None
        )
        if (
            isinstance(raw_schema_version, int)
            and raw_schema_version != PLUGIN_MANIFEST_SCHEMA_VERSION
        ):
            raise PluginManagerError(
                "PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA",
                f"Unsupported plugin manifest schema version: {raw_schema_version}",
            )

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
        clone_url = (
            f"{self._github_base_url}/{source_spec.owner}/{source_spec.repo}.git"
        )
        clone_cmd = ["git", "clone", "--depth", "1"]
        if source_spec.ref:
            clone_cmd.extend(["--branch", source_spec.ref])
        clone_cmd.extend([clone_url, str(clone_root)])
        clone_env = dict(os.environ)
        clone_env["GIT_TERMINAL_PROMPT"] = "0"
        try:
            result = subprocess.run(
                clone_cmd,
                capture_output=True,
                text=True,
                check=False,
                timeout=self._github_clone_timeout_seconds,
                env=clone_env,
            )
        except subprocess.TimeoutExpired as exc:
            raise PluginManagerError(
                "PLUGIN_SOURCE_FETCH_FAILED",
                (
                    "Failed to fetch GitHub plugin source: "
                    f"{source_spec.raw}\nTimed out waiting for git clone."
                ),
            ) from exc
        except OSError as exc:
            error_message = str(exc)
            if exc.filename == "git":
                error_message = "git is not installed or not available on PATH."
            raise PluginManagerError(
                "PLUGIN_SOURCE_FETCH_FAILED",
                (
                    "Failed to fetch GitHub plugin source: "
                    f"{source_spec.raw}\n{error_message}"
                ),
            ) from exc
        if result.returncode != 0:
            raise PluginManagerError(
                "PLUGIN_SOURCE_FETCH_FAILED",
                (
                    "Failed to fetch GitHub plugin source: "
                    f"{source_spec.raw}\n{result.stderr.strip() or result.stdout.strip()}"
                ),
            )
        self._strip_git_metadata(clone_root)

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

    def _strip_git_metadata(self, root: Path) -> None:
        git_path = root / ".git"
        if not git_path.exists() and not git_path.is_symlink():
            return
        if git_path.is_dir() and not git_path.is_symlink():
            shutil.rmtree(git_path)
            return
        git_path.unlink(missing_ok=True)

    def _candidate_from_pypi(
        self,
        source_spec: ParsedSourceSpec,
        tmp_dir: Path,
        *,
        installer_backend: PluginInstallerBackend,
    ) -> CandidatePlugin:
        assert source_spec.package is not None
        package_spec = source_spec.package
        if source_spec.version:
            package_spec = f"{package_spec}=={source_spec.version}"

        resolved_backend = self._resolve_installer_backend(installer_backend)
        extract_root = tmp_dir / "extract"

        def _download_with_pip_and_extract() -> None:
            self._download_pypi_with_pip(
                package_spec=package_spec,
                tmp_dir=tmp_dir,
                source_spec=source_spec.raw,
            )
            artifacts = sorted(tmp_dir.iterdir(), key=lambda path: path.name)
            if len(artifacts) == 0:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_FETCH_FAILED",
                    f"No artifacts were downloaded for source: {source_spec.raw}",
                )
            artifact_path = artifacts[0]
            extract_root.mkdir(parents=True, exist_ok=True)
            self._extract_artifact(artifact_path, extract_root)

        if resolved_backend == PluginInstallerBackend.pip:
            _download_with_pip_and_extract()
        else:
            try:
                self._install_pypi_with_uv(
                    package_spec=package_spec,
                    extract_root=extract_root,
                    source_spec=source_spec.raw,
                )
            except PluginManagerError:
                if installer_backend != PluginInstallerBackend.auto:
                    raise
                if extract_root.exists():
                    shutil.rmtree(extract_root)
                _download_with_pip_and_extract()

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

    def _resolve_installer_backend(
        self,
        installer_backend: PluginInstallerBackend,
    ) -> PluginInstallerBackend:
        if installer_backend == PluginInstallerBackend.pip:
            return PluginInstallerBackend.pip
        if installer_backend == PluginInstallerBackend.uv:
            uv_binary = shutil.which("uv")
            if uv_binary is None:
                raise PluginManagerError(
                    "PLUGIN_INSTALLER_BACKEND_UNAVAILABLE",
                    "Requested installer backend is unavailable: uv",
                )
            return PluginInstallerBackend.uv
        uv_binary = shutil.which("uv")
        if uv_binary is not None:
            return PluginInstallerBackend.uv
        return PluginInstallerBackend.pip

    def _download_pypi_with_pip(
        self,
        *,
        package_spec: str,
        tmp_dir: Path,
        source_spec: str,
    ) -> None:
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
        if result.returncode == 0:
            return
        raise PluginManagerError(
            "PLUGIN_SOURCE_FETCH_FAILED",
            (
                "Failed to download PyPI plugin source: "
                f"{source_spec}\n{result.stderr.strip() or result.stdout.strip()}"
            ),
        )

    def _install_pypi_with_uv(
        self,
        *,
        package_spec: str,
        extract_root: Path,
        source_spec: str,
    ) -> None:
        uv_binary = shutil.which("uv")
        if uv_binary is None:
            raise PluginManagerError(
                "PLUGIN_INSTALLER_BACKEND_UNAVAILABLE",
                "Requested installer backend is unavailable: uv",
            )
        extract_root.mkdir(parents=True, exist_ok=True)
        install_cmd = [
            uv_binary,
            "pip",
            "install",
            "--no-deps",
            "--target",
            str(extract_root),
            package_spec,
        ]
        result = subprocess.run(
            install_cmd,
            capture_output=True,
            text=True,
            check=False,
            env=self._build_uv_install_env(),
        )
        if result.returncode == 0:
            return
        raise PluginManagerError(
            "PLUGIN_SOURCE_FETCH_FAILED",
            (
                "Failed to install PyPI plugin source with uv: "
                f"{source_spec}\n{result.stderr.strip() or result.stdout.strip()}"
            ),
        )

    def _build_uv_install_env(self) -> dict[str, str]:
        env = dict(os.environ)
        if "UV_CACHE_DIR" not in env:
            cache_dir = self.setta_files_root / ".cache" / "uv"
            cache_dir.mkdir(parents=True, exist_ok=True)
            env["UV_CACHE_DIR"] = str(cache_dir)
        pip_no_index = env.get("PIP_NO_INDEX")
        if pip_no_index is not None and "UV_NO_INDEX" not in env:
            env["UV_NO_INDEX"] = pip_no_index
        pip_find_links = env.get("PIP_FIND_LINKS")
        if pip_find_links is not None and "UV_FIND_LINKS" not in env:
            env["UV_FIND_LINKS"] = pip_find_links
        return env

    def _install_candidate(
        self,
        candidate: CandidatePlugin,
        target_path: Path,
        *,
        scope: PluginScope,
        force: bool,
        source_spec: str,
        installer_backend: PluginInstallerBackend,
    ) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_target_path_available(target_path=target_path, force=force)
        if target_path.exists() or target_path.is_symlink():
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
            installer_backend=installer_backend,
            canonical_source_key=candidate.canonical_source_key,
            version=candidate.manifest.version,
            source_digest_sha256=candidate.source_digest_sha256,
        )

    def _ensure_target_path_available(self, *, target_path: Path, force: bool) -> None:
        if force:
            return
        if target_path.exists() or target_path.is_symlink():
            raise PluginManagerError(
                "PLUGIN_TARGET_EXISTS",
                f"Plugin already exists at {target_path}. Use force to overwrite.",
            )

    def _install_target_path_key(self, target_path: Path) -> Path:
        # Keep reservation keys stable before/after symlink creation by avoiding
        # symlink-following path resolution.
        return Path(os.path.abspath(os.path.normpath(str(target_path.expanduser()))))

    def _reserve_install_target_path(self, *, target_path: Path, force: bool) -> None:
        self._ensure_target_path_available(target_path=target_path, force=force)
        target_key = self._install_target_path_key(target_path)
        if target_key in self._install_target_reservations:
            raise PluginManagerError(
                "PLUGIN_TARGET_EXISTS",
                f"Plugin install already in progress for {target_path}.",
            )
        self._install_target_reservations.add(target_key)

    def _release_install_target_path_reservation(self, *, target_path: Path) -> None:
        target_key = self._install_target_path_key(target_path)
        self._install_target_reservations.discard(target_key)

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
        history_stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
        history_dir_parent = self._history_root / scope.value / plugin_id
        history_dir_parent.mkdir(parents=True, exist_ok=True)
        history_dir = history_dir_parent / f"{history_stamp}-{uuid4().hex[:8]}"
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
        if scope == PluginScope.global_scope:
            # Global installs use global auto-enable defaults, not workspace overrides.
            state_file.enabledPluginIds = [
                value for value in state_file.enabledPluginIds if value != plugin_id
            ]
            state_file.disabledPluginIds = [
                value for value in state_file.disabledPluginIds if value != plugin_id
            ]
        elif enable:
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
        state_file.pluginConfigById.pop(
            self._plugin_config_key(plugin_id=plugin_id, scope=scope),
            None,
        )
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
        installer_backend: PluginInstallerBackend | None,
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
            installerBackend=installer_backend,
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

    def _plugin_config_key(self, *, plugin_id: str, scope: PluginScope) -> str:
        return f"{scope.value}:{plugin_id}"

    def _read_plugin_config(
        self,
        *,
        plugins_state: PluginsStateFile,
        plugin_id: str,
        scope: PluginScope,
    ) -> dict[str, Any]:
        config = plugins_state.pluginConfigById.get(
            self._plugin_config_key(plugin_id=plugin_id, scope=scope),
            {},
        )
        if not isinstance(config, dict):
            return {}
        return config

    def _metadata_key(self, plugin_id: str, scope: PluginScope) -> str:
        return f"{scope.value}:{plugin_id}"

    def _add_pending_restart_backend_id(self, plugin_id: str) -> None:
        if plugin_id in self._pending_restart_backend_ids:
            return
        self._pending_restart_backend_ids.add(plugin_id)
        self._persist_pending_restart_backend_ids()

    def _discard_pending_restart_backend_id(self, plugin_id: str) -> None:
        if plugin_id not in self._pending_restart_backend_ids:
            return
        self._pending_restart_backend_ids.remove(plugin_id)
        self._persist_pending_restart_backend_ids()

    def _clear_pending_restart_backend_ids(self) -> None:
        if len(self._pending_restart_backend_ids) == 0:
            return
        self._pending_restart_backend_ids = set()
        self._persist_pending_restart_backend_ids()

    def _persist_pending_restart_backend_ids(self) -> None:
        state_file = self._load_plugins_state()
        state_file.pendingRestartBackendPluginIds = sorted(
            set(self._pending_restart_backend_ids)
        )
        self._save_plugins_state(state_file)

    def _load_plugins_state(self) -> PluginsStateFile:
        if not self._plugins_state_path.exists():
            self._plugins_state_cache = None
            return PluginsStateFile()
        stat = self._plugins_state_path.stat()
        cached = self._plugins_state_cache
        if cached is not None:
            cached_mtime_ns, cached_size, cached_state = cached
            if cached_mtime_ns == stat.st_mtime_ns and cached_size == stat.st_size:
                return cached_state.model_copy(deep=True)
        try:
            payload = json.loads(self._plugins_state_path.read_text(encoding="utf-8"))
            state = PluginsStateFile.model_validate(payload)
            self._plugins_state_cache = (stat.st_mtime_ns, stat.st_size, state)
            return state.model_copy(deep=True)
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
        payload["pendingRestartBackendPluginIds"] = sorted(
            set(payload["pendingRestartBackendPluginIds"])
        )
        serialized_payload = json.dumps(payload, indent=2, sort_keys=True)
        self._plugins_state_path.write_text(serialized_payload, encoding="utf-8")
        stat = self._plugins_state_path.stat()
        normalized_state = PluginsStateFile.model_validate(payload)
        self._plugins_state_cache = (stat.st_mtime_ns, stat.st_size, normalized_state)

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
        if (
            plugin_id.strip() == ""
            or "/" in plugin_id
            or "\\" in plugin_id
            or plugin_id in {".", ".."}
        ):
            raise PluginManagerError(
                "PLUGIN_TARGET_PATH_TRAVERSAL",
                f"Invalid plugin id for filesystem target: {plugin_id!r}",
            )
        target = root / plugin_id
        return target

    def _plugins_root_for_scope(self, scope: PluginScope) -> Path:
        if scope == PluginScope.workspace:
            return (self.workspace_root / ".setta_plugins").resolve(strict=False)
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
                    (
                        "GitHub source must be github:<owner>/<repo>[#ref] "
                        "or github:<owner>/<repo>@ref."
                    ),
                )
            repo_spec = rest
            ref: str | None = None
            hash_index = rest.find("#")
            at_index = rest.find("@")
            if hash_index != -1 and (at_index == -1 or hash_index < at_index):
                repo_spec = rest[:hash_index]
                ref_fragment = rest[hash_index + 1 :].strip()
                ref = ref_fragment or None
            elif at_index != -1:
                repo_spec = rest[:at_index]
                ref_fragment = rest[at_index + 1 :].strip()
                ref = ref_fragment or None
            owner, _, repo = repo_spec.partition("/")
            if not owner or not repo:
                raise PluginManagerError(
                    "PLUGIN_SOURCE_INVALID",
                    (
                        "GitHub source must be github:<owner>/<repo>[#ref] "
                        "or github:<owner>/<repo>@ref."
                    ),
                )
            return ParsedSourceSpec(
                scheme=PluginSourceScheme.github,
                raw=raw,
                canonical_source_key=f"github:{owner}/{repo}",
                owner=owner,
                repo=repo,
                ref=ref,
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
                for member in archive.infolist():
                    self._validate_archive_member_path(
                        extract_root=extract_root,
                        member_path=member.filename,
                        source_name=artifact_path.name,
                    )
                archive.extractall(extract_root)
            return
        if name.endswith(".tar.gz") or name.endswith(".tgz"):
            with tarfile.open(artifact_path, "r:gz") as archive:
                for member in archive.getmembers():
                    if member.issym() or member.islnk():
                        raise PluginManagerError(
                            "PLUGIN_SOURCE_ARCHIVE_TRAVERSAL",
                            (
                                "Plugin archive contains symbolic/hard link entries "
                                f"which are not allowed: {member.name!r}"
                            ),
                        )
                    self._validate_archive_member_path(
                        extract_root=extract_root,
                        member_path=member.name,
                        source_name=artifact_path.name,
                    )
                archive.extractall(extract_root)
            return
        raise PluginManagerError(
            "PLUGIN_SOURCE_FETCH_FAILED",
            f"Unsupported artifact type for plugin source: {artifact_path.name}",
        )

    def _validate_archive_member_path(
        self,
        *,
        extract_root: Path,
        member_path: str,
        source_name: str,
    ) -> None:
        normalized_member_path = member_path.strip()
        if normalized_member_path == "":
            return
        if normalized_member_path.startswith("/") or normalized_member_path.startswith(
            "\\"
        ):
            raise PluginManagerError(
                "PLUGIN_SOURCE_ARCHIVE_TRAVERSAL",
                (
                    "Plugin archive extraction refused absolute member path "
                    f"{member_path!r} in {source_name}."
                ),
            )
        extract_root_resolved = extract_root.resolve(strict=False)
        candidate = (extract_root / normalized_member_path).resolve(strict=False)
        if not candidate.is_relative_to(extract_root_resolved):
            raise PluginManagerError(
                "PLUGIN_SOURCE_ARCHIVE_TRAVERSAL",
                (
                    "Plugin archive extraction refused out-of-root member path "
                    f"{member_path!r} in {source_name}."
                ),
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
        root_resolved = root.resolve(strict=False)
        root_key = str(root_resolved)
        change_stamp = self._directory_change_stamp(root_resolved)
        change_stamp_digest = self._digest_change_stamp(change_stamp)
        self._prune_directory_digest_cache()
        cached = self._directory_digest_cache.get(root_key)
        if cached is not None and cached[0] == change_stamp_digest:
            self._directory_digest_cache.move_to_end(root_key)
            return cached[1]

        hasher = hashlib.sha256()
        for relative_path, _, _ in change_stamp:
            path = root_resolved / relative_path
            hasher.update(relative_path.encode("utf-8"))
            with path.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    hasher.update(chunk)
        digest = hasher.hexdigest()
        self._directory_digest_cache[root_key] = (change_stamp_digest, digest)
        self._directory_digest_cache.move_to_end(root_key)
        while len(self._directory_digest_cache) > _DIRECTORY_DIGEST_CACHE_MAX_ENTRIES:
            self._directory_digest_cache.popitem(last=False)
        return digest

    def _directory_change_stamp(self, root: Path) -> tuple[tuple[str, int, int], ...]:
        if not root.exists() or not root.is_dir():
            return ()
        stamp: list[tuple[str, int, int]] = []
        for path in sorted(root.rglob("*"), key=lambda item: str(item)):
            if path.is_dir():
                continue
            file_stat = path.stat()
            relative_path = path.relative_to(root).as_posix()
            stamp.append((relative_path, file_stat.st_mtime_ns, file_stat.st_size))
        return tuple(stamp)

    def _digest_change_stamp(
        self, change_stamp: tuple[tuple[str, int, int], ...]
    ) -> str:
        hasher = hashlib.sha256()
        for relative_path, modified_ns, size_bytes in change_stamp:
            hasher.update(relative_path.encode("utf-8"))
            hasher.update(b"\0")
            hasher.update(str(modified_ns).encode("utf-8"))
            hasher.update(b"\0")
            hasher.update(str(size_bytes).encode("utf-8"))
            hasher.update(b"\0")
        return hasher.hexdigest()

    def _prune_directory_digest_cache(self) -> None:
        stale_keys: list[str] = []
        for root_key in self._directory_digest_cache:
            if not Path(root_key).exists():
                stale_keys.append(root_key)
        for root_key in stale_keys:
            self._directory_digest_cache.pop(root_key, None)

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
        for _root, _dirs, files in os.walk(path, topdown=True, followlinks=False):
            if len(files) > 0:
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
        source_root_resolved = entry.source_path.resolve(strict=False)
        normalized_relative_path = resolved.relative_to(source_root_resolved).as_posix()
        encoded_relative_path = "/".join(
            quote(segment, safe="")
            for segment in normalized_relative_path.split("/")
            if segment != ""
        )
        encoded_plugin_id = quote(entry.plugin_id, safe="")
        base_url = f"/plugins/{encoded_plugin_id}/{encoded_relative_path}"
        if entry.source_digest_sha256:
            return f"{base_url}?v={entry.source_digest_sha256}"
        return base_url

    def _find_entry(
        self,
        plugin_id: str,
        scope: PluginScope,
        *,
        include_shadowed: bool = False,
    ) -> DiscoveredPlugin | None:
        for entry in self._discovered_plugins:
            if entry.plugin_id == plugin_id and entry.scope == scope:
                if include_shadowed or entry.shadowed_by_source_path is None:
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
                _SOURCE_MANAGER_ORDER[entry.source_manager],
                str(entry.source_path),
            ),
        )
        return ordered[0]

    def _ensure_setta_managed_for_write(
        self,
        *,
        entry: DiscoveredPlugin,
        operation: str,
    ) -> None:
        if entry.source_manager != PluginSourceManager.package_manager:
            return
        raise PluginManagerError(
            "PLUGIN_MANAGED_EXTERNALLY",
            (
                f"Plugin {entry.plugin_id} is managed by a Python package manager. "
                f"Use uv/pip/Poetry to {operation} it."
            ),
        )

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
            github_spec = source_spec[len("github:") :]
            hash_index = github_spec.find("#")
            at_index = github_spec.find("@")
            split_index = -1
            if hash_index != -1 and at_index != -1:
                split_index = min(hash_index, at_index)
            elif hash_index != -1:
                split_index = hash_index
            elif at_index != -1:
                split_index = at_index
            repo_spec = github_spec if split_index == -1 else github_spec[:split_index]
            return f"github:{repo_spec}#{trimmed_to}"
        if source_spec.startswith("pypi:"):
            package_spec = source_spec[len("pypi:") :]
            package_name, _ = self._split_pypi_spec(package_spec)
            if trimmed_to.startswith("pypi:"):
                return trimmed_to
            if "==" in trimmed_to:
                return f"pypi:{trimmed_to}"
            return f"pypi:{package_name}=={trimmed_to}"
        return source_spec
