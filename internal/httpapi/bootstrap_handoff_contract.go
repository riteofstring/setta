package httpapi

type FrontendBootstrapHandoffProtocol struct {
	WorkspaceHistoryStorageKey      string `json:"workspaceHistoryStorageKey"`
	WorkspaceHistoryQueryParam      string `json:"workspaceHistoryQueryParam"`
	WorkspaceHistoryHashParam       string `json:"workspaceHistoryHashParam"`
	LauncherOriginStorageKey        string `json:"launcherOriginStorageKey"`
	LauncherOriginHashParam         string `json:"launcherOriginHashParam"`
	LauncherOriginProofHashParam    string `json:"launcherOriginProofHashParam"`
	OpenWorkspaceSwitcherQueryParam string `json:"openWorkspaceSwitcherQueryParam"`
	OpenWorkspaceSwitcherHashParam  string `json:"openWorkspaceSwitcherHashParam"`
	BackendOriginOverrideQueryParam string `json:"backendOriginOverrideQueryParam"`
	MaxValueLength                  int    `json:"maxValueLength"`
}

const (
	WorkspaceHistoryHandoffStorageKey = "setta.workspaceHistoryHandoff"
	WorkspaceHistoryHandoffQueryParam = "__setta_workspace_history"
	WorkspaceHistoryHandoffHashParam  = "wh"
	LauncherOriginStorageKey          = "setta.launcherOrigin"
	LauncherOriginHashParam           = "lo"
	LauncherOriginProofHashParam      = "lop"
	OpenWorkspaceSwitcherQueryParam   = "__setta_open_workspace_switcher"
	OpenWorkspaceSwitcherHashParam    = "osw"
	BackendOriginOverrideQueryParam   = "__setta_backend_origin"
	BootstrapHandoffMaxValueLength    = 8192
)

func FrontendBootstrapProtocol() FrontendBootstrapHandoffProtocol {
	return FrontendBootstrapHandoffProtocol{
		WorkspaceHistoryStorageKey:      WorkspaceHistoryHandoffStorageKey,
		WorkspaceHistoryQueryParam:      WorkspaceHistoryHandoffQueryParam,
		WorkspaceHistoryHashParam:       WorkspaceHistoryHandoffHashParam,
		LauncherOriginStorageKey:        LauncherOriginStorageKey,
		LauncherOriginHashParam:         LauncherOriginHashParam,
		LauncherOriginProofHashParam:    LauncherOriginProofHashParam,
		OpenWorkspaceSwitcherQueryParam: OpenWorkspaceSwitcherQueryParam,
		OpenWorkspaceSwitcherHashParam:  OpenWorkspaceSwitcherHashParam,
		BackendOriginOverrideQueryParam: BackendOriginOverrideQueryParam,
		MaxValueLength:                  BootstrapHandoffMaxValueLength,
	}
}
