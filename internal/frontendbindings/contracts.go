package frontendbindings

import (
	"time"

	"setta/internal/appgenskills"
	"setta/internal/appspec"
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

type LauncherHomeErrorPayload httpapi.LauncherHomeErrorPayload

type GetLauncherRecentWorkspacesRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type LauncherRecentWorkspacePayload launcher.RecentWorkspaceEntry

type LauncherRecentWorkspacesResponse httpapi.LauncherRecentWorkspacesResponse

type LauncherRecentWorkspaceRequestInput httpapi.LauncherRecentWorkspaceRequest

type PinLauncherRecentWorkspaceRequestInput httpapi.PinLauncherRecentWorkspaceRequest

type LauncherFilesystemRootsResponse httpapi.LauncherFilesystemRootsResponse

type LauncherDirectoryEntryPayload launcher.DirectoryEntry

type LauncherListDirectoryRequestInput httpapi.LauncherListDirectoryRequest

type LauncherListDirectoryResponse httpapi.LauncherListDirectoryResponse

type LauncherOpenWorkspaceRequestInput httpapi.LauncherOpenWorkspaceRequest

type LauncherOpenWorkspaceResponse httpapi.LauncherOpenWorkspaceResponse

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

type LauncherOperationErrorPayload httpapi.LauncherOperationErrorPayload

type GetLauncherStatusRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type LauncherStatusResponse httpapi.LauncherStatusResponse

type LauncherUpdateResponse httpapi.LauncherUpdateResponse

type LauncherRequestBaseInput httpapi.LauncherRequestBase

type SetupLauncherRequestInput struct {
	SettaHome         *string                         `json:"settaHome,omitempty"`
	Channel           *string                         `json:"channel,omitempty"`
	InstallSource     *LauncherInstallSource          `json:"installSource,omitempty"`
	OpenMode          *LauncherOpenMode               `json:"openMode,omitempty"`
	WorkspaceBehavior *SetupLauncherWorkspaceBehavior `json:"workspaceBehavior,omitempty"`
	InstallArtifacts  *bool                           `json:"installArtifacts,omitempty"`
	ArtifactOptions   map[string]string               `json:"artifactOptions,omitempty"`
}

type UpdateLauncherRequestInput httpapi.UpdateLauncherRequest

type AppCatalogPropType appspec.PropType

type AppCatalogProp httpapi.AppCatalogPropResponse

type AppCatalogComponent httpapi.AppCatalogComponentResponse

type AppCatalogAction httpapi.AppCatalogActionResponse

type AppCatalogResponse httpapi.AppCatalogResponse

type AppRoute projectstate.AppRoute

type AppDefinition projectstate.AppDefinition

type GetAppDefinitionRequestInput httpapi.GetAppDefinitionRequest

type AppDefinitionReadResponse projectstate.AppDefinitionReadResult

type SetAppDefinitionRequestInput httpapi.SetAppDefinitionRequest

type ValidateAppDefinitionRequestInput httpapi.ValidateAppDefinitionRequest

type AppValidationIssue appspec.AppValidationIssue

type AppCapabilities appspec.AppCapabilities

type AppDefinitionValidationResponse projectstate.AppDefinitionValidationResult

type AppDefinitionMutationResponse projectstate.AppDefinitionMutationResult

type SettaLspDiagnosticPosition projectstate.LSPDiagnosticPosition

type SettaLspDiagnosticRange projectstate.LSPDiagnosticRange

type SettaLspDiagnostic projectstate.LSPDiagnostic

type SettaSectionTypeErrors projectstate.SectionTypeErrors

type SettaProjectConfigDiagnostics projectstate.ProjectConfigDiagnostics

type SettaLspDiagnosticsPayload projectstate.LSPDiagnosticsPayload

type GetLatestLspDiagnosticsRequestInput httpapi.GetLatestLSPDiagnosticsRequest

type TypeCheckRequestInput httpapi.TypeCheckRequest

type SetTypeErrorIgnoreRequestInput httpapi.SetTypeErrorIgnoreRequest

type AppGenSkillEntry appgenskills.SkillEntry

type GetAppGenSkillsResponse appgenskills.GetSkillsResponse

type GetAppGenSkillContentRequestInput httpapi.GetAppGenSkillContentRequest

type AppGenSkillContent appgenskills.SkillContent

type UpsertAppGenCustomSkillRequestInput httpapi.UpsertAppGenCustomSkillRequest

type UpsertAppGenCustomSkillResponse appgenskills.UpsertCustomSkillResponse

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

type PluginRescanResponse httpapi.PluginsRescanResponse

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

type PluginLockWriteResponse plugins.PluginLockWriteResult

type PluginLockApplyRequestInput httpapi.PluginLockApplyRequest

type PluginLockApplyResponse plugins.PluginLockApplyResult

type PluginRestartResponse plugins.PluginRestartResult
