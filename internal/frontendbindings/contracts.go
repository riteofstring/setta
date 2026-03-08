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
