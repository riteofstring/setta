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
