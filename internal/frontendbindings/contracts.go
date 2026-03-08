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
