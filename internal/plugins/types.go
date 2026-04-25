package plugins

import "errors"

var (
	ErrWorkspaceRootRequired     = errors.New("plugins: workspace root is required")
	ErrSettaFilesRootRequired    = errors.New("plugins: setta files root is required")
	ErrSettaHomeRequired         = errors.New("plugins: setta home is required")
	ErrPluginIDInvalid           = errors.New("plugins: plugin id is invalid")
	ErrPluginRootInvalid         = errors.New("plugins: plugin root must be a directory")
	ErrPluginManifestNotFound    = errors.New("plugins: plugin manifest was not found")
	ErrPluginManifestInvalid     = errors.New("plugins: plugin manifest is invalid")
	ErrPluginManifestUnsupported = errors.New("plugins: plugin manifest schema version is unsupported")
)

type PluginScope string

const (
	PluginScopeWorkspace  PluginScope = "workspace"
	PluginScopeSettaFiles PluginScope = "setta_files"
	PluginScopeGlobal     PluginScope = "global"
)

type PluginRuntimeState string

const (
	PluginRuntimeStateActive         PluginRuntimeState = "active"
	PluginRuntimeStateDisabled       PluginRuntimeState = "disabled"
	PluginRuntimeStateInvalid        PluginRuntimeState = "invalid"
	PluginRuntimeStateShadowed       PluginRuntimeState = "shadowed"
	PluginRuntimeStatePendingRestart PluginRuntimeState = "pending_restart"
)

type PluginEnablementSource string

const (
	PluginEnablementSourceWorkspaceDisabled PluginEnablementSource = "workspace_disabled"
	PluginEnablementSourceWorkspaceEnabled  PluginEnablementSource = "workspace_enabled"
	PluginEnablementSourceGlobalAutoEnabled PluginEnablementSource = "global_auto_enabled"
	PluginEnablementSourceManifestDefault   PluginEnablementSource = "manifest_default"
)

type PluginSourceManager string

const (
	PluginSourceManagerSetta          PluginSourceManager = "setta"
	PluginSourceManagerPackageManager PluginSourceManager = "package_manager"
)

type PluginInstallerBackend string

const (
	PluginInstallerBackendAuto PluginInstallerBackend = "auto"
	PluginInstallerBackendPip  PluginInstallerBackend = "pip"
	PluginInstallerBackendUV   PluginInstallerBackend = "uv"
)

type PluginSourceTrustStatus string

const (
	PluginSourceTrustStatusUnverified PluginSourceTrustStatus = "unverified"
)

type PluginBlockedCapabilityReason string

const (
	PluginBlockedCapabilityReasonModePolicy      PluginBlockedCapabilityReason = "mode_policy"
	PluginBlockedCapabilityReasonHostPolicy      PluginBlockedCapabilityReason = "host_policy"
	PluginBlockedCapabilityReasonManifestInvalid PluginBlockedCapabilityReason = "manifest_invalid"
)

type PluginErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type PluginBlockedCapability struct {
	Capability string                        `json:"capability"`
	Reason     PluginBlockedCapabilityReason `json:"reason"`
}

type PluginRegisteredCodegenTarget struct {
	TargetID        string `json:"targetId"`
	PluginID        string `json:"pluginId"`
	Language        string `json:"language"`
	Name            string `json:"name"`
	DefaultFileName string `json:"defaultFileName"`
}

type PluginRegisteredLanguageServer struct {
	PluginID              string   `json:"pluginId"`
	Name                  string   `json:"name"`
	Language              string   `json:"language"`
	Command               string   `json:"command"`
	Args                  []string `json:"args"`
	SettingsKey           *string  `json:"settingsKey,omitempty"`
	RuntimeSearchPathsKey *string  `json:"runtimeSearchPathsKey,omitempty" ts_skip:"true"`
}

type PluginRegisteredUISetting struct {
	LocalSettingID string         `json:"localSettingId"`
	PluginID       string         `json:"pluginId"`
	Title          string         `json:"title"`
	Description    string         `json:"description"`
	Synonyms       []string       `json:"synonyms"`
	PaneID         string         `json:"paneId"`
	RevealKey      string         `json:"revealKey"`
	Mutability     string         `json:"mutability"`
	ValueSchema    map[string]any `json:"valueSchema"`
	ReadHandlerID  string         `json:"readHandlerId"`
	WriteHandlerID *string        `json:"writeHandlerId,omitempty"`
}

type PluginRegisteredBackendRoute struct {
	Path    string   `json:"path"`
	Methods []string `json:"methods"`
}

type PluginRegisteredStaticDir struct {
	RoutePrefix string `json:"routePrefix"`
	Dir         string `json:"dir"`
}

type PluginRegisteredListenerEndpoint struct {
	Name string `json:"name"`
}

type PluginBackendManifest struct {
	Entrypoint string `json:"entrypoint"`
}

type PluginFrontendManifest struct {
	Entrypoint string                       `json:"entrypoint"`
	Style      string                       `json:"style,omitempty"`
	Build      *PluginFrontendBuildManifest `json:"build,omitempty"`
}

type PluginFrontendBuildManifest struct {
	PackageManager string `json:"packageManager"`
}

type PluginContentManifest struct {
	BlueprintsDir       string `json:"blueprintsDir,omitempty"`
	ProjectTemplatesDir string `json:"projectTemplatesDir,omitempty"`
	PromptsDir          string `json:"promptsDir,omitempty"`
}

type PluginAppSubsystemFeatureManifest struct {
	AppAuthoringUI         bool `json:"appAuthoringUi"`
	AppPreviewUI           bool `json:"appPreviewUi"`
	AppGenerationChatModes bool `json:"appGenerationChatModes"`
	AppDeploymentRuntime   bool `json:"appDeploymentRuntime"`
}

type PluginWatchCodeFeatureManifest struct {
	Python                 bool `json:"python"`
	RequiresLanguageServer bool `json:"requiresLanguageServer"`
	CanvasControlsUI       bool `json:"canvasControlsUi"`
}

type PluginFeatureCapabilitiesManifest struct {
	AppSubsystem *PluginAppSubsystemFeatureManifest `json:"appSubsystem,omitempty"`
	WatchCode    *PluginWatchCodeFeatureManifest    `json:"watchCode,omitempty"`
}

type PluginManifest struct {
	SchemaVersion       int                                `json:"schemaVersion"`
	ID                  string                             `json:"id"`
	Name                string                             `json:"name"`
	Version             string                             `json:"version"`
	SettaVersionRange   string                             `json:"settaVersionRange"`
	EnabledByDefault    bool                               `json:"enabledByDefault"`
	Backend             *PluginBackendManifest             `json:"backend,omitempty"`
	Frontend            *PluginFrontendManifest            `json:"frontend,omitempty"`
	Content             *PluginContentManifest             `json:"content,omitempty"`
	ConfigSchemaPath    string                             `json:"configSchemaPath,omitempty"`
	FeatureCapabilities *PluginFeatureCapabilitiesManifest `json:"featureCapabilities,omitempty"`
	Capabilities        []string                           `json:"capabilities"`
}

type PluginsStateFile struct {
	EnabledPluginIDs                          []string       `json:"enabledPluginIds"`
	DisabledPluginIDs                         []string       `json:"disabledPluginIds"`
	PendingRestartBackendPluginIDs            []string       `json:"pendingRestartBackendPluginIds"`
	PendingRestartLanguageServerOnlyPluginIDs []string       `json:"pendingRestartLanguageServerOnlyPluginIds"`
	PluginConfigByID                          map[string]any `json:"pluginConfigById"`
}

type PluginsGlobalStateFile struct {
	AutoEnabledPluginIDs []string `json:"autoEnabledPluginIds"`
}

type PluginInstallHistoryEntry struct {
	Version            string  `json:"version"`
	SourceDigestSHA256 *string `json:"sourceDigestSha256"`
	SnapshotPath       string  `json:"snapshotPath"`
	TimestampISO       string  `json:"timestampIso"`
}

type PluginInstallMetadataEntry struct {
	PluginID           string                      `json:"pluginId"`
	Scope              PluginScope                 `json:"scope"`
	SourceSpec         string                      `json:"sourceSpec"`
	InstallerBackend   *PluginInstallerBackend     `json:"installerBackend"`
	CanonicalSourceKey string                      `json:"canonicalSourceKey"`
	SourceDigestSHA256 *string                     `json:"sourceDigestSha256"`
	Version            string                      `json:"version"`
	History            []PluginInstallHistoryEntry `json:"history"`
}

type PluginInstallMetadataFile struct {
	Entries map[string]PluginInstallMetadataEntry `json:"entries"`
}

type DiscoveredPlugin struct {
	PluginID                      string
	Name                          string
	Version                       string
	Scope                         PluginScope
	SourcePath                    string
	Manifest                      *PluginManifest
	CanonicalSourceKey            string
	SourceDigestSHA256            *string
	SourceManager                 PluginSourceManager
	SourceManagerHint             string
	Errors                        []PluginErrorInfo
	State                         PluginRuntimeState
	ShadowedBySourcePath          string
	RequestedCapabilities         []string
	EffectiveCapabilities         []string
	BlockedCapabilities           []PluginBlockedCapability
	EnablementSource              *PluginEnablementSource
	RestartRequired               bool
	RegisteredCodegenTargets      []PluginRegisteredCodegenTarget
	RegisteredLanguageServers     []PluginRegisteredLanguageServer
	RegisteredUISettings          []PluginRegisteredUISetting
	RegisteredBackendRoutes       []PluginRegisteredBackendRoute
	RegisteredStaticDirs          []PluginRegisteredStaticDir
	RegisteredListenerEndpoints   []PluginRegisteredListenerEndpoint
	appSubsystemBackend           *backendProbeAppSubsystemBackendRegistration
	appSubsystemListenerEndpoints []PluginRegisteredListenerEndpoint
	watchCodeBackend              *backendProbeWatchCodeBackendRegistration
}

func (p DiscoveredPlugin) HasBackend() bool {
	return p.Manifest != nil && p.Manifest.Backend != nil
}
