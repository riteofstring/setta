package frontendbindings

import "time"

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

type ServerMode string

const (
	ServerModeIDE      ServerMode = "ide"
	ServerModeShare    ServerMode = "share"
	ServerModeApp      ServerMode = "app"
	ServerModeLauncher ServerMode = "launcher"
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

type LaunchSettaFilesLocation string

const (
	LaunchSettaFilesLocationAuto   LaunchSettaFilesLocation = "auto"
	LaunchSettaFilesLocationLocal  LaunchSettaFilesLocation = "local"
	LaunchSettaFilesLocationGlobal LaunchSettaFilesLocation = "global"
)

type LaunchResolvedSettaFilesLocation string

const (
	LaunchResolvedSettaFilesLocationLocal  LaunchResolvedSettaFilesLocation = "local"
	LaunchResolvedSettaFilesLocationGlobal LaunchResolvedSettaFilesLocation = "global"
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

type LauncherHomeErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type GetLauncherRecentWorkspacesRequestInput struct {
	SettaHome *string `json:"setta_home,omitempty"`
}

type LauncherRecentWorkspacePayload struct {
	WorkspaceRoot string `json:"workspaceRoot"`
	Pinned        bool   `json:"pinned"`
	LastUsedAt    int64  `json:"lastUsedAt"`
}

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

type LauncherDirectoryEntryPayload struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
	IsSymlink   bool   `json:"isSymlink"`
}

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

type LauncherOpenMode string

const (
	LauncherOpenModeBrowser   LauncherOpenMode = "browser"
	LauncherOpenModeChromeApp LauncherOpenMode = "chrome-app"
)

type LauncherWorkspaceBehavior string

const (
	LauncherWorkspaceBehaviorLastUsedOrPrompt LauncherWorkspaceBehavior = "last_used_or_prompt"
	LauncherWorkspaceBehaviorAlwaysPrompt     LauncherWorkspaceBehavior = "always_prompt"
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

type LauncherUpdateCapability string

const (
	LauncherUpdateCapabilityInApp            LauncherUpdateCapability = "in_app"
	LauncherUpdateCapabilityInstallerManaged LauncherUpdateCapability = "installer_managed"
	LauncherUpdateCapabilityUnsupported      LauncherUpdateCapability = "unsupported"
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

type SettaLspDiagnosticPosition struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type SettaLspDiagnosticRange struct {
	Start SettaLspDiagnosticPosition `json:"start"`
	End   SettaLspDiagnosticPosition `json:"end"`
}

type SettaLspDiagnostic struct {
	Message  string                  `json:"message"`
	Severity *int                    `json:"severity"`
	Code     any                     `json:"code"`
	Source   *string                 `json:"source"`
	Range    SettaLspDiagnosticRange `json:"range"`
	URI      *string                 `json:"uri"`
}

type SettaSectionTypeErrors struct {
	Callable []string            `json:"callable"`
	Params   map[string][]string `json:"params"`
}

type SettaProjectConfigDiagnostics struct {
	ProjectConfigID string                            `json:"projectConfigId"`
	Errors          map[string]SettaSectionTypeErrors `json:"errors"`
	IsGenCode       bool                              `json:"isGenCode"`
}

type SettaLspDiagnosticsPayload struct {
	ProjectConfigID string                          `json:"projectConfigId"`
	GenCode         SettaProjectConfigDiagnostics   `json:"genCode"`
	CodeSections    map[string][]SettaLspDiagnostic `json:"codeSections"`
	UnmappedGenCode []SettaLspDiagnostic            `json:"unmappedGenCode"`
}

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

type MCPTransport string

const (
	MCPTransportSSE            MCPTransport = "sse"
	MCPTransportStreamableHTTP MCPTransport = "streamable_http"
	MCPTransportStdio          MCPTransport = "stdio"
)

type MCPRuntimeState string

const (
	MCPRuntimeStateConnected  MCPRuntimeState = "connected"
	MCPRuntimeStateConnecting MCPRuntimeState = "connecting"
	MCPRuntimeStateRetrying   MCPRuntimeState = "retrying"
	MCPRuntimeStateError      MCPRuntimeState = "error"
	MCPRuntimeStateDisabled   MCPRuntimeState = "disabled"
	MCPRuntimeStateUnknown    MCPRuntimeState = "unknown"
)

type MCPServerRuntimeStatus struct {
	ServerID            string          `json:"serverId"`
	Source              string          `json:"source"`
	Transport           MCPTransport    `json:"transport"`
	Endpoint            string          `json:"endpoint"`
	State               MCPRuntimeState `json:"state"`
	LastAttemptAt       *time.Time      `json:"lastAttemptAt"`
	LastConnectedAt     *time.Time      `json:"lastConnectedAt"`
	LastFailureAt       *time.Time      `json:"lastFailureAt"`
	ConsecutiveFailures int             `json:"consecutiveFailures"`
	LastError           *string         `json:"lastError"`
	MissingEnvVar       *string         `json:"missingEnvVar"`
	ToolCount           int             `json:"toolCount"`
}

type MCPRuntimeStatusRequestInput struct {
	ChatID         *string `json:"chatId"`
	EngineConfigID *string `json:"engineConfigId"`
}

type MCPRuntimeStatusResponse struct {
	LLMConfigPath            string                   `json:"llmConfigPath"`
	ActiveSettaFilesLocation string                   `json:"activeSettaFilesLocation"`
	Servers                  []MCPServerRuntimeStatus `json:"servers"`
	ExternalServers          []MCPServerRuntimeStatus `json:"externalServers"`
}

type GetPasswordParamValueRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	SectionID       string `json:"sectionId"`
	ParamInfoID     string `json:"paramInfoId"`
}

type GetPasswordParamValueResponse struct {
	Value string `json:"value"`
}

type GetAttachmentDownloadURLRequestInput struct {
	ArtifactID      string  `json:"artifactId"`
	ProjectConfigID *string `json:"projectConfigId"`
}

type GetAttachmentDownloadURLResponse struct {
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expiresAt"`
}

type GetAttachmentDownloadURLsRequestInput struct {
	ArtifactIDs     []string `json:"artifactIds"`
	ProjectConfigID *string  `json:"projectConfigId"`
}

type AttachmentDownloadURLEntry struct {
	ArtifactID string `json:"artifactId"`
	URL        string `json:"url"`
	ExpiresAt  int64  `json:"expiresAt"`
}

type GetAttachmentDownloadURLsResponse []AttachmentDownloadURLEntry

type ForceRefreshListenerRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
}
