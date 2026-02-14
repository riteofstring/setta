from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PLUGIN_MANIFEST_SCHEMA_VERSION = 1
PLUGIN_LIST_SCHEMA_VERSION = 1
PLUGIN_STATUS_SCHEMA_VERSION = 1
PLUGIN_LOCK_SCHEMA_VERSION = 1

PLUGIN_CAPABILITIES: tuple[str, ...] = (
    "registerSectionKinds",
    "registerPane",
    "registerCommand",
    "registerToolbarItem",
    "registerContextMenu",
    "registerSettingsPanel",
    "registerMcpTools",
    "registerLanguageServer",
    "registerExternalAgentAdapter",
    "registerCodegenTarget",
    "registerRouter",
    "registerStaticDir",
    "writeWorkspacePlugins",
)
PLUGIN_CAPABILITIES_SET = frozenset(PLUGIN_CAPABILITIES)


class PluginScope(str, Enum):
    workspace = "workspace"
    setta_files = "setta_files"
    global_scope = "global"


class PluginRuntimeState(str, Enum):
    active = "active"
    disabled = "disabled"
    invalid = "invalid"
    shadowed = "shadowed"
    pending_restart = "pending_restart"


class BlockedCapabilityReason(str, Enum):
    mode_policy = "mode_policy"
    host_policy = "host_policy"
    manifest_invalid = "manifest_invalid"


class PluginErrorInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class PluginBackendManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entrypoint: str


class PluginFrontendManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entrypoint: str
    style: str | None = None


class PluginContentManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    blueprintsDir: str | None = None
    projectTemplatesDir: str | None = None
    promptsDir: str | None = None


class PluginManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int
    id: str
    name: str
    version: str
    settaVersionRange: str = ">=0.0.0"
    enabledByDefault: bool = False
    backend: PluginBackendManifest | None = None
    frontend: PluginFrontendManifest | None = None
    content: PluginContentManifest | None = None
    configSchemaPath: str | None = None
    capabilities: list[str] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("plugin id must be non-empty")
        if not normalized[0].isalnum():
            raise ValueError("plugin id must start with an alphanumeric character")
        for char in normalized:
            if char.isalnum() or char in {"-", "_", "."}:
                continue
            raise ValueError(
                "plugin id may contain only alphanumeric characters, '-', '_', and '.'"
            )
        return normalized


class PluginsStateFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabledPluginIds: list[str] = Field(default_factory=list)
    disabledPluginIds: list[str] = Field(default_factory=list)
    pendingRestartBackendPluginIds: list[str] = Field(default_factory=list)
    pluginConfigById: dict[str, Any] = Field(default_factory=dict)


class PluginsGlobalStateFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    autoEnabledPluginIds: list[str] = Field(default_factory=list)


class PluginBlockedCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capability: str
    reason: BlockedCapabilityReason


class PluginRestartCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["programmatic", "manual"]
    command: str | None = None
    reason: str | None = None


class PluginFrontendDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entrypointUrl: str | None = None
    styleUrl: str | None = None


class PluginContentDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hasBlueprints: bool
    hasProjectTemplates: bool
    hasPrompts: bool


class PluginConfigDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hasSchema: bool
    schemaJson: dict[str, Any] | None = None


class PluginListEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    name: str
    version: str
    sourceScope: PluginScope
    sourceScopeLabel: Literal["workspace", "environment", "global"]
    canonicalSourceKey: str
    sourceDigestSha256: str | None = None
    frontend: PluginFrontendDescriptor
    content: PluginContentDescriptor
    config: PluginConfigDescriptor
    effectiveCapabilities: list[str]
    restartRequired: bool


class PluginListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = PLUGIN_LIST_SCHEMA_VERSION
    serverMode: Literal["ide", "share", "app"]
    restartCapability: PluginRestartCapability
    plugins: list[PluginListEntry]


class PluginStatusEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    name: str
    version: str
    state: PluginRuntimeState
    sourceScope: PluginScope
    sourceScopeLabel: Literal["workspace", "environment", "global"]
    sourcePath: str
    canonicalSourceKey: str
    sourceDigestSha256: str | None = None
    shadowedBySourcePath: str | None = None
    requestedCapabilities: list[str]
    effectiveCapabilities: list[str]
    blockedCapabilities: list[PluginBlockedCapability]
    restartRequired: bool
    errors: list[PluginErrorInfo]


class PluginStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = PLUGIN_STATUS_SCHEMA_VERSION
    serverMode: Literal["ide", "share", "app"]
    restartCapability: PluginRestartCapability
    plugins: list[PluginStatusEntry]


class PluginInstallResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    version: str
    sourceScope: PluginScope
    sourceScopeLabel: Literal["workspace", "environment", "global"]
    sourcePath: str
    canonicalSourceKey: str
    sourceDigestSha256: str | None = None
    components: list[str]
    state: PluginRuntimeState
    restartRequired: bool


class PluginUninstallResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    removedFromScope: PluginScope
    restartRequired: bool


class PluginEnableDisableResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    state: PluginRuntimeState
    restartRequired: bool


class PluginConfigWriteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    config: dict[str, Any]
    validation: dict[str, Any]


class PluginUpdateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    fromVersion: str
    toVersion: str
    sourceDigestSha256: str | None
    restartRequired: bool


class PluginRollbackResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    restoredVersion: str
    sourceDigestSha256: str | None
    restartRequired: bool


class PluginsRescanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = 1
    serverMode: Literal["ide", "share", "app"]
    installedPlugins: int
    activePlugins: int


class PluginLockEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    version: str
    canonicalSourceKey: str
    scope: PluginScope
    sourceDigestSha256: str | None = None
    sourceSpec: str | None = None


class PluginsLockFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = PLUGIN_LOCK_SCHEMA_VERSION
    plugins: list[PluginLockEntry] = Field(default_factory=list)


class PluginLockWriteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lockfilePath: str
    pluginCount: int


class PluginLockApplyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lockfilePath: str
    plannedChanges: list[str]
    applied: bool


class PluginInstallHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    sourceDigestSha256: str | None = None
    snapshotPath: str
    timestampIso: str


class PluginInstallMetadataEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str
    scope: PluginScope
    sourceSpec: str
    canonicalSourceKey: str
    sourceDigestSha256: str | None = None
    version: str
    history: list[PluginInstallHistoryEntry] = Field(default_factory=list)


class PluginInstallMetadataFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entries: dict[str, PluginInstallMetadataEntry] = Field(default_factory=dict)


class PluginSourceScheme(str, Enum):
    github = "github"
    pypi = "pypi"


def normalize_scope(
    raw_scope: str | PluginScope | None,
    *,
    default_scope: PluginScope = PluginScope.workspace,
) -> PluginScope:
    if raw_scope is None:
        return default_scope
    if isinstance(raw_scope, PluginScope):
        return raw_scope
    normalized = raw_scope.strip().lower()
    if normalized == "":
        return default_scope
    if normalized == "workspace":
        return PluginScope.workspace
    if normalized in {"setta_files", "environment"}:
        return PluginScope.setta_files
    if normalized == "global":
        return PluginScope.global_scope
    raise ValueError(f"Invalid plugin scope: {raw_scope!r}")


def scope_label(scope: PluginScope) -> Literal["workspace", "environment", "global"]:
    if scope == PluginScope.workspace:
        return "workspace"
    if scope == PluginScope.setta_files:
        return "environment"
    return "global"
