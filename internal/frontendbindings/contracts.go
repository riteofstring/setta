package frontendbindings

import (
	"setta/internal/appgenskills"
	"setta/internal/appspec"
	binarypayload "setta/internal/binary"
	"setta/internal/httpapi"
	"setta/internal/launcher"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

type GetLauncherRecentWorkspacesRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type GetLauncherStatusRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type SetupLauncherRequestInput struct {
	SettaHome         *string                             `json:"settaHome,omitempty"`
	Channel           *string                             `json:"channel,omitempty"`
	InstallSource     *launcher.LauncherInstallSource     `json:"installSource,omitempty"`
	OpenMode          *launcher.LauncherOpenMode          `json:"openMode,omitempty"`
	WorkspaceBehavior *launcher.LauncherWorkspaceBehavior `json:"workspaceBehavior,omitempty"`
	InstallArtifacts  *bool                               `json:"installArtifacts,omitempty"`
	ArtifactOptions   map[string]string                   `json:"artifactOptions,omitempty"`
}

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

type BinaryContentRef binarypayload.ContentRef

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

type PluginEnableDisableRequestInput httpapi.PluginEnableDisableRequest

type PluginInstallRequestInput httpapi.PluginInstallRequest

type PluginLinkRequestInput httpapi.PluginLinkRequest

type PluginInstallResponse plugins.PluginInstallResult

type PluginEnableDisableResponse plugins.PluginEnableDisableResult

type PluginUninstallRequestInput httpapi.PluginUninstallRequest

type PluginUninstallResponse plugins.PluginUninstallResult

type PluginUpdateRequestInput httpapi.PluginUpdateRequest

type PluginUpdateResponse plugins.PluginUpdateResult

type PluginRollbackRequestInput httpapi.PluginRollbackRequest

type PluginRollbackResponse plugins.PluginRollbackResult

type PluginConfigValidationResult plugins.PluginConfigValidationResult

type PluginConfigWriteRequestInput httpapi.PluginConfigWriteRequest

type PluginConfigWriteResponse plugins.PluginConfigWriteResult

type PluginLockWriteResponse plugins.PluginLockWriteResult

type PluginLockApplyRequestInput httpapi.PluginLockApplyRequest

type PluginLockApplyResponse plugins.PluginLockApplyResult

type PluginRestartResponse plugins.PluginRestartResult
