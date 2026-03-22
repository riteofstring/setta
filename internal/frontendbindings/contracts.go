package frontendbindings

import (
	"time"

	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/launcher"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

type BackendInitEvent struct {
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type BackendInitStatusResponse struct {
	Events                         []BackendInitEvent `json:"events"`
	IsReady                        bool               `json:"isReady"`
	Error                          *string            `json:"error"`
	AuthCookieRefreshWindowSeconds int                `json:"authCookieRefreshWindowSeconds"`
	WorktreeName                   *string            `json:"worktreeName"`
}

type AuthRefreshStatusResponse struct {
	AuthCookieRefreshWindowSeconds int `json:"authCookieRefreshWindowSeconds"`
}

type ServerMode config.Mode

const (
	ServerModeIDE      ServerMode = ServerMode(config.ModeIDE)
	ServerModeShare    ServerMode = ServerMode(config.ModeShare)
	ServerModeApp      ServerMode = ServerMode(config.ModeApp)
	ServerModeLauncher ServerMode = ServerMode(config.ModeLauncher)
)

type ServerModeResponse struct {
	Mode ServerMode `json:"mode"`
}

type SettaHomeInfoResponse struct {
	SettaHome                string  `json:"settaHome"`
	GlobalSettaFilesBase     string  `json:"globalSettaFilesBase"`
	ActiveSettaFilesLocation *string `json:"activeSettaFilesLocation"`
	LLMConfigPath            string  `json:"llmConfigPath"`
}

type LaunchSettaFilesLocation config.FilesLocation

const (
	LaunchSettaFilesLocationAuto   LaunchSettaFilesLocation = LaunchSettaFilesLocation(config.FilesLocationAuto)
	LaunchSettaFilesLocationLocal  LaunchSettaFilesLocation = LaunchSettaFilesLocation(config.FilesLocationLocal)
	LaunchSettaFilesLocationGlobal LaunchSettaFilesLocation = LaunchSettaFilesLocation(config.FilesLocationGlobal)
)

type LaunchResolvedSettaFilesLocation config.ResolvedFilesLocation

const (
	LaunchResolvedSettaFilesLocationLocal  LaunchResolvedSettaFilesLocation = LaunchResolvedSettaFilesLocation(config.ResolvedFilesLocationLocal)
	LaunchResolvedSettaFilesLocationGlobal LaunchResolvedSettaFilesLocation = LaunchResolvedSettaFilesLocation(config.ResolvedFilesLocationGlobal)
)

type LaunchRequestInput struct {
	LaunchIntentToken  *string                   `json:"launchIntentToken,omitempty"`
	WorkspaceRoot      *string                   `json:"workspaceRoot,omitempty"`
	Profile            *string                   `json:"profile,omitempty"`
	SettaHome          *string                   `json:"settaHome,omitempty"`
	SettaFilesRoot     *string                   `json:"settaFilesRoot,omitempty"`
	SettaFilesLocation *LaunchSettaFilesLocation `json:"settaFilesLocation,omitempty"`
	RuntimeRoot        *string                   `json:"runtimeRoot,omitempty"`
	SSHTarget          *string                   `json:"sshTarget,omitempty"`
	SSHArgs            *string                   `json:"sshArgs,omitempty"`
	RemoteCmd          *string                   `json:"remoteCmd,omitempty"`
	LocalPort          *int                      `json:"localPort,omitempty"`
}

type CreateWorkspaceLaunchIntentRequestInput struct {
	LaunchRequest LaunchRequestInput `json:"launchRequest"`
	ReturnURL     string             `json:"returnUrl"`
}

type LaunchErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type CreateWorkspaceLaunchIntentResponse struct {
	Ok                bool                `json:"ok"`
	LaunchIntentToken *string             `json:"launchIntentToken"`
	RequestedAt       *int64              `json:"requestedAt"`
	Error             *LaunchErrorPayload `json:"error"`
}

type LaunchSessionInfo struct {
	ID                     string `json:"id"`
	WorkspacePath          string `json:"workspacePath"`
	WorkspacePathCanonical string `json:"workspacePathCanonical"`
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	PID                    int    `json:"pid"`
	StartedAt              string `json:"startedAt"`
}

type LaunchResponse struct {
	Ok                   bool                              `json:"ok"`
	BootstrapURLFragment *string                           `json:"bootstrapUrlFragment"`
	ReturnURL            *string                           `json:"returnUrl"`
	WorkspaceRoot        *string                           `json:"workspaceRoot"`
	SettaFilesLocation   *LaunchResolvedSettaFilesLocation `json:"settaFilesLocation"`
	SettaFilesRoot       *string                           `json:"settaFilesRoot"`
	RuntimeRoot          *string                           `json:"runtimeRoot"`
	SettaHome            *string                           `json:"settaHome"`
	Profile              *string                           `json:"profile"`
	SessionID            *string                           `json:"sessionId"`
	StartedNew           *bool                             `json:"startedNew"`
	Session              *LaunchSessionInfo                `json:"session"`
	RemoteCmdResolved    *string                           `json:"remoteCmdResolved"`
	Error                *LaunchErrorPayload               `json:"error"`
}

type LauncherHomeErrorPayload launcher.HomeError

type GetLauncherRecentWorkspacesRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type LauncherRecentWorkspacePayload launcher.RecentWorkspaceEntry

type LauncherRecentWorkspacesResponse struct {
	Ok         bool                             `json:"ok"`
	Workspaces []LauncherRecentWorkspacePayload `json:"workspaces"`
	Error      *LauncherHomeErrorPayload        `json:"error"`
}

type LauncherRecentWorkspaceRequestInput struct {
	SettaHome     *string `json:"settaHome,omitempty"`
	WorkspaceRoot string  `json:"workspaceRoot"`
	Pinned        *bool   `json:"pinned,omitempty"`
}

type PinLauncherRecentWorkspaceRequestInput struct {
	SettaHome     *string `json:"settaHome,omitempty"`
	WorkspaceRoot string  `json:"workspaceRoot"`
	Pinned        bool    `json:"pinned"`
}

type LauncherFilesystemRootsResponse struct {
	Ok    bool     `json:"ok"`
	Roots []string `json:"roots"`
}

type LauncherDirectoryEntryPayload launcher.DirectoryEntry

type LauncherListDirectoryRequestInput struct {
	Path     *string `json:"path,omitempty"`
	Cursor   *string `json:"cursor,omitempty"`
	PageSize *int    `json:"pageSize,omitempty"`
}

type LauncherListDirectoryResponse struct {
	Ok          bool                            `json:"ok"`
	CurrentPath *string                         `json:"currentPath"`
	ParentPath  *string                         `json:"parentPath"`
	Entries     []LauncherDirectoryEntryPayload `json:"entries"`
	NextCursor  *string                         `json:"nextCursor"`
	HasMore     bool                            `json:"hasMore"`
	Truncated   bool                            `json:"truncated"`
	Error       *LauncherHomeErrorPayload       `json:"error"`
}

type LauncherOpenWorkspaceRequestInput struct {
	WorkspaceRoot      string                    `json:"workspaceRoot"`
	SettaHome          *string                   `json:"settaHome,omitempty"`
	Profile            *string                   `json:"profile,omitempty"`
	SettaFilesRoot     *string                   `json:"settaFilesRoot,omitempty"`
	SettaFilesLocation *LaunchSettaFilesLocation `json:"settaFilesLocation,omitempty"`
	RuntimeRoot        *string                   `json:"runtimeRoot,omitempty"`
	CreateIfMissing    *bool                     `json:"createIfMissing,omitempty"`
}

type LauncherOpenWorkspaceResponse struct {
	Ok                   bool                              `json:"ok"`
	BootstrapURLFragment *string                           `json:"bootstrapUrlFragment"`
	WorkspaceRoot        *string                           `json:"workspaceRoot"`
	SettaFilesLocation   *LaunchResolvedSettaFilesLocation `json:"settaFilesLocation"`
	SettaFilesRoot       *string                           `json:"settaFilesRoot"`
	RuntimeRoot          *string                           `json:"runtimeRoot"`
	SettaHome            *string                           `json:"settaHome"`
	Profile              *string                           `json:"profile"`
	SessionID            *string                           `json:"sessionId"`
	StartedNew           *bool                             `json:"startedNew"`
	Error                *LauncherHomeErrorPayload         `json:"error"`
}

type LauncherOpenMode launcher.LauncherOpenMode

const (
	LauncherOpenModeBrowser   LauncherOpenMode = LauncherOpenMode(launcher.LauncherOpenModeBrowser)
	LauncherOpenModeChromeApp LauncherOpenMode = LauncherOpenMode(launcher.LauncherOpenModeChromeApp)
)

type LauncherWorkspaceBehavior launcher.LauncherWorkspaceBehavior

const (
	LauncherWorkspaceBehaviorLastUsedOrPrompt LauncherWorkspaceBehavior = LauncherWorkspaceBehavior(launcher.LauncherWorkspaceBehaviorLastUsedOrPrompt)
	LauncherWorkspaceBehaviorAlwaysPrompt     LauncherWorkspaceBehavior = LauncherWorkspaceBehavior(launcher.LauncherWorkspaceBehaviorAlwaysPrompt)
)

type SetupLauncherWorkspaceBehavior string

const (
	SetupLauncherWorkspaceBehaviorLastUsedOrPrompt SetupLauncherWorkspaceBehavior = "last-used-or-prompt"
	SetupLauncherWorkspaceBehaviorAlwaysPrompt     SetupLauncherWorkspaceBehavior = "always-prompt"
)

type LauncherInstallSource string

const (
	LauncherInstallSourceUVTool           LauncherInstallSource = "uv-tool"
	LauncherInstallSourceInstallerManaged LauncherInstallSource = "installer-managed"
	LauncherInstallSourceUnsupported      LauncherInstallSource = "unsupported"
)

type LauncherUpdateCapability launcher.LauncherUpdateCapability

const (
	LauncherUpdateCapabilityInApp            LauncherUpdateCapability = LauncherUpdateCapability(launcher.LauncherUpdateCapabilityInApp)
	LauncherUpdateCapabilityInstallerManaged LauncherUpdateCapability = LauncherUpdateCapability(launcher.LauncherUpdateCapabilityInstallerManaged)
	LauncherUpdateCapabilityUnsupported      LauncherUpdateCapability = LauncherUpdateCapability(launcher.LauncherUpdateCapabilityUnsupported)
)

type LauncherOperationErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type GetLauncherStatusRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type LauncherStatusResponse struct {
	Ok                       bool                           `json:"ok"`
	Installed                *bool                          `json:"installed,omitempty"`
	SettaHome                *string                        `json:"settaHome,omitempty"`
	LauncherDir              *string                        `json:"launcherDir,omitempty"`
	MetadataPath             *string                        `json:"metadataPath,omitempty"`
	TargetCommand            []string                       `json:"targetCommand,omitempty"`
	TargetValid              *bool                          `json:"targetValid,omitempty"`
	TargetError              *string                        `json:"targetError,omitempty"`
	Channel                  *string                        `json:"channel,omitempty"`
	SettaVersion             *string                        `json:"settaVersion,omitempty"`
	OpenMode                 *LauncherOpenMode              `json:"openMode,omitempty"`
	WorkspaceBehavior        *LauncherWorkspaceBehavior     `json:"workspaceBehavior,omitempty"`
	LastUsedWorkspace        *string                        `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions          map[string]string              `json:"artifactOptions,omitempty"`
	ManagedArtifacts         map[string]string              `json:"managedArtifacts,omitempty"`
	ExistingManagedArtifacts []string                       `json:"existingManagedArtifacts,omitempty"`
	MissingManagedArtifacts  []string                       `json:"missingManagedArtifacts,omitempty"`
	UpdateCapability         *LauncherUpdateCapability      `json:"updateCapability,omitempty"`
	UpdateGuidance           *string                        `json:"updateGuidance,omitempty"`
	Error                    *LauncherOperationErrorPayload `json:"error,omitempty"`
}

type LauncherUpdateResponse struct {
	Ok                       bool                           `json:"ok"`
	Installed                *bool                          `json:"installed,omitempty"`
	SettaHome                *string                        `json:"settaHome,omitempty"`
	LauncherDir              *string                        `json:"launcherDir,omitempty"`
	MetadataPath             *string                        `json:"metadataPath,omitempty"`
	TargetCommand            []string                       `json:"targetCommand,omitempty"`
	TargetValid              *bool                          `json:"targetValid,omitempty"`
	TargetError              *string                        `json:"targetError,omitempty"`
	Channel                  *string                        `json:"channel,omitempty"`
	SettaVersion             *string                        `json:"settaVersion,omitempty"`
	OpenMode                 *LauncherOpenMode              `json:"openMode,omitempty"`
	WorkspaceBehavior        *LauncherWorkspaceBehavior     `json:"workspaceBehavior,omitempty"`
	LastUsedWorkspace        *string                        `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions          map[string]string              `json:"artifactOptions,omitempty"`
	ManagedArtifacts         map[string]string              `json:"managedArtifacts,omitempty"`
	ExistingManagedArtifacts []string                       `json:"existingManagedArtifacts,omitempty"`
	MissingManagedArtifacts  []string                       `json:"missingManagedArtifacts,omitempty"`
	UpdateCapability         *LauncherUpdateCapability      `json:"updateCapability,omitempty"`
	UpdateGuidance           *string                        `json:"updateGuidance,omitempty"`
	Error                    *LauncherOperationErrorPayload `json:"error,omitempty"`
	PackageSpec              *string                        `json:"packageSpec,omitempty"`
	FromVersion              *string                        `json:"fromVersion,omitempty"`
	ToVersion                *string                        `json:"toVersion,omitempty"`
}

type LauncherRequestBaseInput struct {
	SettaHome *string `json:"settaHome,omitempty"`
}

type SetupLauncherRequestInput struct {
	SettaHome         *string                         `json:"settaHome,omitempty"`
	Channel           *string                         `json:"channel,omitempty"`
	InstallSource     *LauncherInstallSource          `json:"installSource,omitempty"`
	OpenMode          *LauncherOpenMode               `json:"openMode,omitempty"`
	WorkspaceBehavior *SetupLauncherWorkspaceBehavior `json:"workspaceBehavior,omitempty"`
	InstallArtifacts  *bool                           `json:"installArtifacts,omitempty"`
	ArtifactOptions   map[string]string               `json:"artifactOptions,omitempty"`
}

type UpdateLauncherRequestInput struct {
	SettaHome   *string `json:"settaHome,omitempty"`
	PackageSpec *string `json:"packageSpec,omitempty"`
}

type AppCatalogPropType string

const (
	AppCatalogPropTypeString    AppCatalogPropType = "string"
	AppCatalogPropTypeNumber    AppCatalogPropType = "number"
	AppCatalogPropTypeDimension AppCatalogPropType = "dimension"
	AppCatalogPropTypeBoolean   AppCatalogPropType = "boolean"
)

type AppCatalogProp struct {
	Type       AppCatalogPropType `json:"type"`
	Responsive bool               `json:"responsive,omitempty"`
	Required   bool               `json:"required,omitempty"`
	Min        *float64           `json:"min,omitempty"`
	Max        *float64           `json:"max,omitempty"`
	Enum       []any              `json:"enum,omitempty"`
	Default    any                `json:"default,omitempty"`
}

type AppCatalogComponent struct {
	Type     string                    `json:"type"`
	Children bool                      `json:"children"`
	Props    map[string]AppCatalogProp `json:"props,omitempty"`
}

type AppCatalogAction struct {
	Name string `json:"name"`
}

type AppCatalogResponse struct {
	ID         string                `json:"id"`
	Version    string                `json:"version"`
	Components []AppCatalogComponent `json:"components"`
	Actions    []AppCatalogAction    `json:"actions"`
}

type AppRoute struct {
	Path    string  `json:"path"`
	Name    *string `json:"name,omitempty"`
	RootKey *string `json:"rootKey,omitempty"`
}

type AppDefinition struct {
	AppSpecVersion string         `json:"appSpecVersion,omitempty"`
	CatalogID      string         `json:"catalogId,omitempty"`
	AppSpecPath    *string        `json:"appSpecPath,omitempty"`
	Routes         []AppRoute     `json:"routes,omitempty"`
	DataBindings   map[string]any `json:"dataBindings,omitempty"`
	Actions        map[string]any `json:"actions,omitempty"`
	Theme          map[string]any `json:"theme,omitempty"`
	Assets         []any          `json:"assets,omitempty"`
}

type GetAppDefinitionRequestInput struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
}

type AppDefinitionReadResponse struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

type SetAppDefinitionRequestInput struct {
	FrontendOpID   *string         `json:"frontendOpId,omitempty"`
	AppSpec        any             `json:"appSpec"`
	AppSpecPath    *string         `json:"appSpecPath,omitempty"`
	AppSpecVersion *string         `json:"appSpecVersion,omitempty"`
	CatalogID      *string         `json:"catalogId,omitempty"`
	Routes         *[]AppRoute     `json:"routes,omitempty"`
	DataBindings   *map[string]any `json:"dataBindings,omitempty"`
	Actions        *map[string]any `json:"actions,omitempty"`
	Theme          *map[string]any `json:"theme,omitempty"`
	Assets         *[]any          `json:"assets,omitempty"`
}

type ValidateAppDefinitionRequestInput struct {
	FrontendOpID   *string         `json:"frontendOpId,omitempty"`
	AppSpec        any             `json:"appSpec"`
	AppSpecVersion *string         `json:"appSpecVersion,omitempty"`
	CatalogID      *string         `json:"catalogId,omitempty"`
	Routes         *[]AppRoute     `json:"routes,omitempty"`
	DataBindings   *map[string]any `json:"dataBindings,omitempty"`
	Actions        *map[string]any `json:"actions,omitempty"`
	Theme          *map[string]any `json:"theme,omitempty"`
	Assets         *[]any          `json:"assets,omitempty"`
}

type AppValidationIssue struct {
	Message     string  `json:"message"`
	ElementKey  *string `json:"elementKey,omitempty"`
	ElementType *string `json:"elementType,omitempty"`
}

type AppCapabilities struct {
	CatalogID          string          `json:"catalogId"`
	CatalogVersion     string          `json:"catalogVersion"`
	AppSpecVersion     string          `json:"appSpecVersion"`
	ThemeSchemaVersion string          `json:"themeSchemaVersion"`
	Features           map[string]bool `json:"features"`
}

type AppDefinitionValidationResponse struct {
	Errors       []AppValidationIssue `json:"errors"`
	Warnings     []AppValidationIssue `json:"warnings"`
	Capabilities AppCapabilities      `json:"capabilities"`
}

type AppDefinitionMutationResponse struct {
	AppSpec       any            `json:"appSpec"`
	AppDefinition *AppDefinition `json:"appDefinition,omitempty"`
}

type SettaLspDiagnosticPosition projectstate.LSPDiagnosticPosition

type SettaLspDiagnosticRange projectstate.LSPDiagnosticRange

type SettaLspDiagnostic projectstate.LSPDiagnostic

type SettaSectionTypeErrors projectstate.SectionTypeErrors

type SettaProjectConfigDiagnostics projectstate.ProjectConfigDiagnostics

type SettaLspDiagnosticsPayload projectstate.LSPDiagnosticsPayload

type GetLatestLspDiagnosticsRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type TypeCheckRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type SetTypeErrorIgnoreRequestInput struct {
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	ParamInfoID      *string `json:"paramInfoId"`
	IgnoreTypeErrors bool    `json:"ignoreTypeErrors"`
}

type AppGenSkillEntry struct {
	SkillID           string  `json:"skillId"`
	Name              string  `json:"name"`
	RootLabel         string  `json:"rootLabel"`
	RootPath          string  `json:"rootPath"`
	RelativePath      string  `json:"relativePath"`
	IsEditable        bool    `json:"isEditable"`
	EditabilityReason *string `json:"editabilityReason"`
	Description       string  `json:"description"`
}

type GetAppGenSkillsResponse struct {
	Skills                          []AppGenSkillEntry `json:"skills"`
	CustomSkillCreateRootPath       *string            `json:"customSkillCreateRootPath"`
	CustomSkillCreateRootActionable bool               `json:"customSkillCreateRootActionable"`
}

type GetAppGenSkillContentRequestInput struct {
	SkillID string `json:"skillId"`
}

type AppGenSkillContent struct {
	SkillID           string `json:"skillId"`
	Content           string `json:"content"`
	Truncated         bool   `json:"truncated"`
	OriginalSizeBytes int64  `json:"originalSizeBytes"`
}

type UpsertAppGenCustomSkillRequestInput struct {
	SkillID      *string `json:"skillId"`
	RelativePath *string `json:"relativePath"`
	Content      string  `json:"content"`
}

type UpsertAppGenCustomSkillResponse struct {
	SkillID      string             `json:"skillId"`
	Created      bool               `json:"created"`
	RootPath     string             `json:"rootPath"`
	SkillDocPath string             `json:"skillDocPath"`
	Skill        AppGenSkillEntry   `json:"skill"`
	SkillContent AppGenSkillContent `json:"skillContent"`
}

type MCPTransport mcpx.Transport

const (
	MCPTransportSSE            MCPTransport = MCPTransport(mcpx.TransportSSE)
	MCPTransportStreamableHTTP MCPTransport = MCPTransport(mcpx.TransportStreamableHTTP)
	MCPTransportStdio          MCPTransport = MCPTransport(mcpx.TransportStdio)
)

type MCPRuntimeState mcpx.RuntimeState

const (
	MCPRuntimeStateConnected  MCPRuntimeState = MCPRuntimeState(mcpx.RuntimeStateConnected)
	MCPRuntimeStateConnecting MCPRuntimeState = MCPRuntimeState(mcpx.RuntimeStateConnecting)
	MCPRuntimeStateRetrying   MCPRuntimeState = MCPRuntimeState(mcpx.RuntimeStateRetrying)
	MCPRuntimeStateError      MCPRuntimeState = MCPRuntimeState(mcpx.RuntimeStateError)
	MCPRuntimeStateDisabled   MCPRuntimeState = MCPRuntimeState(mcpx.RuntimeStateDisabled)
	MCPRuntimeStateUnknown    MCPRuntimeState = MCPRuntimeState(mcpx.RuntimeStateUnknown)
)

type MCPServerRuntimeStatus mcpx.ServerRuntimeStatus

type MCPRuntimeStatusRequestInput httpapi.MCPRuntimeStatusRequest

type MCPRuntimeStatusResponse httpapi.MCPRuntimeStatusResponse

type GetPasswordParamValueRequestInput httpapi.GetPasswordParamValueRequest

type GetPasswordParamValueResponse httpapi.GetPasswordParamValueResponse

type GetAttachmentDownloadURLRequestInput httpapi.GetAttachmentDownloadURLRequest

type GetAttachmentDownloadURLResponse httpapi.GetAttachmentDownloadURLResponse

type GetAttachmentDownloadURLsRequestInput httpapi.GetAttachmentDownloadURLsRequest

type AttachmentDownloadURLEntry httpapi.AttachmentDownloadURLEntry

type GetAttachmentDownloadURLsResponse []AttachmentDownloadURLEntry

type ForceRefreshListenerRequestInput httpapi.ForceRefreshProjectRequest

type ListenerCoverageRequestInput httpapi.ListenerCoverageRequest

type DependencyKeyType = realtime.DependencyKeyType

const (
	DependencyKeyTypeSection      = realtime.DependencyKeyTypeSection
	DependencyKeyTypeSectionParam = realtime.DependencyKeyTypeSectionParam
)

type SectionDependencyKey = realtime.SectionDependencyKey

type SectionParamDependencyKey = realtime.SectionParamDependencyKey

type BaseDependencyKeyUnion struct{}

type DependencyValueType = realtime.DependencyValueType

const (
	DependencyValueTypeLiteral  = realtime.DependencyValueTypeLiteral
	DependencyValueTypeBinary   = realtime.DependencyValueTypeBinary
	DependencyValueTypeFileRead = realtime.DependencyValueTypeFileRead
)

type BinaryContentRef binarypayload.ContentRef

type LiteralDependencyValue = realtime.LiteralDependencyValue

type FileReadDependencyValue = realtime.FileReadDependencyValue

type BinaryDependencyValue = realtime.BinaryDependencyValue

type BaseDependencyValueUnion struct{}

type DependencyEvent struct {
	DependencyKey BaseDependencyKeyUnion    `json:"dependencyKey"`
	Payload       *BaseDependencyValueUnion `json:"payload"`
	TimestampMs   int64                     `json:"timestampMs"`
}

type ListenerCoverageSnapshot struct {
	ProjectConfigID     string                   `json:"projectConfigId"`
	Dependencies        []BaseDependencyKeyUnion `json:"dependencies"`
	HasRealtimeWildcard bool                     `json:"hasRealtimeWildcard"`
}

type PluginScope plugins.PluginScope

const (
	PluginScopeWorkspace  PluginScope = PluginScope(plugins.PluginScopeWorkspace)
	PluginScopeSettaFiles PluginScope = PluginScope(plugins.PluginScopeSettaFiles)
	PluginScopeGlobal     PluginScope = PluginScope(plugins.PluginScopeGlobal)
)

type PluginRuntimeState plugins.PluginRuntimeState

const (
	PluginRuntimeStateActive         PluginRuntimeState = PluginRuntimeState(plugins.PluginRuntimeStateActive)
	PluginRuntimeStateDisabled       PluginRuntimeState = PluginRuntimeState(plugins.PluginRuntimeStateDisabled)
	PluginRuntimeStateInvalid        PluginRuntimeState = PluginRuntimeState(plugins.PluginRuntimeStateInvalid)
	PluginRuntimeStateShadowed       PluginRuntimeState = PluginRuntimeState(plugins.PluginRuntimeStateShadowed)
	PluginRuntimeStatePendingRestart PluginRuntimeState = PluginRuntimeState(plugins.PluginRuntimeStatePendingRestart)
)

type PluginEnablementSource plugins.PluginEnablementSource

const (
	PluginEnablementSourceWorkspaceDisabled PluginEnablementSource = PluginEnablementSource(plugins.PluginEnablementSourceWorkspaceDisabled)
	PluginEnablementSourceWorkspaceEnabled  PluginEnablementSource = PluginEnablementSource(plugins.PluginEnablementSourceWorkspaceEnabled)
	PluginEnablementSourceGlobalAutoEnabled PluginEnablementSource = PluginEnablementSource(plugins.PluginEnablementSourceGlobalAutoEnabled)
	PluginEnablementSourceManifestDefault   PluginEnablementSource = PluginEnablementSource(plugins.PluginEnablementSourceManifestDefault)
)

type PluginSourceManager plugins.PluginSourceManager

const (
	PluginSourceManagerSetta          PluginSourceManager = PluginSourceManager(plugins.PluginSourceManagerSetta)
	PluginSourceManagerPackageManager PluginSourceManager = PluginSourceManager(plugins.PluginSourceManagerPackageManager)
)

type PluginInstallerBackend plugins.PluginInstallerBackend

const (
	PluginInstallerBackendAuto PluginInstallerBackend = PluginInstallerBackend(plugins.PluginInstallerBackendAuto)
	PluginInstallerBackendPip  PluginInstallerBackend = PluginInstallerBackend(plugins.PluginInstallerBackendPip)
	PluginInstallerBackendUV   PluginInstallerBackend = PluginInstallerBackend(plugins.PluginInstallerBackendUV)
)

type PluginSourceTrustStatus plugins.PluginSourceTrustStatus

const (
	PluginSourceTrustStatusUnverified PluginSourceTrustStatus = PluginSourceTrustStatus(plugins.PluginSourceTrustStatusUnverified)
)

type PluginBlockedCapabilityReason plugins.PluginBlockedCapabilityReason

const (
	PluginBlockedCapabilityReasonModePolicy      PluginBlockedCapabilityReason = PluginBlockedCapabilityReason(plugins.PluginBlockedCapabilityReasonModePolicy)
	PluginBlockedCapabilityReasonHostPolicy      PluginBlockedCapabilityReason = PluginBlockedCapabilityReason(plugins.PluginBlockedCapabilityReasonHostPolicy)
	PluginBlockedCapabilityReasonManifestInvalid PluginBlockedCapabilityReason = PluginBlockedCapabilityReason(plugins.PluginBlockedCapabilityReasonManifestInvalid)
)

type PluginRestartCapabilityMode plugins.RestartCapabilityMode

const (
	PluginRestartCapabilityModeManual       PluginRestartCapabilityMode = PluginRestartCapabilityMode(plugins.RestartCapabilityModeManual)
	PluginRestartCapabilityModeProgrammatic PluginRestartCapabilityMode = PluginRestartCapabilityMode(plugins.RestartCapabilityModeProgrammatic)
)

type PluginErrorInfo plugins.PluginErrorInfo

type PluginBlockedCapability plugins.PluginBlockedCapability

type PluginFrontendDescriptor plugins.FrontendDescriptor

type PluginContentDescriptor plugins.ContentDescriptor

type PluginConfigDescriptor plugins.ConfigDescriptor

type PluginRegisteredCodegenTarget plugins.PluginRegisteredCodegenTarget

type PluginRegisteredBackendRoute plugins.PluginRegisteredBackendRoute

type PluginRegisteredStaticDir plugins.PluginRegisteredStaticDir

type PluginRegisteredListenerEndpoint plugins.PluginRegisteredListenerEndpoint

type PluginRestartCapability plugins.RestartCapability

type PluginListEntry plugins.ListEntry

type PluginListResponse plugins.ListResponse

type PluginStatusEntry plugins.StatusEntry

type PluginStatusResponse plugins.StatusResponse

type PluginRuntimeResponse plugins.RuntimeResponse

type PluginRescanResponse struct {
	SchemaVersion    int        `json:"schemaVersion"`
	ServerMode       ServerMode `json:"serverMode"`
	InstalledPlugins int        `json:"installedPlugins"`
	ActivePlugins    int        `json:"activePlugins"`
}

type PluginEnableDisableRequestInput struct {
	PluginID string `json:"pluginId"`
}

type PluginInstallRequestInput struct {
	SourceSpec string                  `json:"sourceSpec"`
	Scope      *PluginScope            `json:"scope"`
	Installer  *PluginInstallerBackend `json:"installer"`
	Enable     *bool                   `json:"enable"`
	Force      *bool                   `json:"force"`
}

type PluginLinkRequestInput struct {
	LocalPluginRoot string       `json:"localPluginRoot"`
	Scope           *PluginScope `json:"scope"`
	Enable          *bool        `json:"enable"`
	Force           *bool        `json:"force"`
}

type PluginInstallResponse plugins.PluginInstallResult

type PluginEnableDisableResponse plugins.PluginEnableDisableResult

type PluginUninstallRequestInput struct {
	PluginID string       `json:"pluginId"`
	Scope    *PluginScope `json:"scope"`
}

type PluginUninstallResponse plugins.PluginUninstallResult

type PluginUpdateRequestInput struct {
	PluginID string       `json:"pluginId"`
	Scope    *PluginScope `json:"scope"`
	To       *string      `json:"to"`
}

type PluginUpdateResponse plugins.PluginUpdateResult

type PluginRollbackRequestInput struct {
	PluginID string       `json:"pluginId"`
	Scope    *PluginScope `json:"scope"`
}

type PluginRollbackResponse plugins.PluginRollbackResult

type PluginConfigValidationResult plugins.PluginConfigValidationResult

type PluginConfigWriteRequestInput struct {
	PluginID string         `json:"pluginId"`
	Config   map[string]any `json:"config"`
}

type PluginConfigWriteResponse plugins.PluginConfigWriteResult

type PluginLockWriteResponse struct {
	LockfilePath string `json:"lockfilePath"`
	PluginCount  int    `json:"pluginCount"`
}

type PluginLockApplyRequestInput struct {
	Check bool `json:"check"`
}

type PluginLockApplyResponse struct {
	LockfilePath   string   `json:"lockfilePath"`
	PlannedChanges []string `json:"plannedChanges"`
	Applied        bool     `json:"applied"`
}

type PluginRestartResponse plugins.PluginRestartResult
