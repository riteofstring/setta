package httpapi

import (
	"setta/internal/config"
	"setta/internal/externalagents"
	"setta/internal/hostnames"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/scriptablechat"
	"setta/internal/wsapi"
)

type FrontendEndpointOrigin string

const (
	FrontendEndpointOriginBackend       FrontendEndpointOrigin = "backend"
	FrontendEndpointOriginLauncher      FrontendEndpointOrigin = "launcher"
	FrontendEndpointOriginBackendOrigin FrontendEndpointOrigin = "backend-origin"
)

type FrontendWorkspaceLaunchRouteKind string

const (
	FrontendWorkspaceLaunchRouteKindIDE      FrontendWorkspaceLaunchRouteKind = "ide"
	FrontendWorkspaceLaunchRouteKindLauncher FrontendWorkspaceLaunchRouteKind = "launcher"
	FrontendWorkspaceLaunchRouteKindBlocked  FrontendWorkspaceLaunchRouteKind = "blocked"
)

type FrontendServerModeCapabilities struct {
	CanManageDesktopLauncher bool `json:"canManageDesktopLauncher"`
}

type FrontendServerModeBoundary struct {
	Capabilities             FrontendServerModeCapabilities   `json:"capabilities"`
	WorkspaceLaunchRouteKind FrontendWorkspaceLaunchRouteKind `json:"workspaceLaunchRouteKind"`
}

type FrontendServerModeBoundaryPolicy map[config.Mode]FrontendServerModeBoundary

type FrontendEndpointOriginPolicy map[string]FrontendEndpointOrigin

type FrontendModeScopedLauncherRoutes []string

type FrontendToolNameNormalization struct {
	MCPPrefix                string `json:"mcpPrefix"`
	SinglePrefix             string `json:"singlePrefix"`
	DoublePrefix             string `json:"doublePrefix"`
	AskUserQuestionToolAlias string `json:"askUserQuestionToolAlias"`
	AskUserQuestionToolName  string `json:"askUserQuestionToolName"`
	ApprovalToolName         string `json:"approvalToolName"`
	TodoWriteToolName        string `json:"todoWriteToolName"`
}

type FrontendLocalHostnamePolicy struct {
	LoopbackHosts []string `json:"loopbackHosts"`
}

type FrontendSettaFilesLocation string

const (
	FrontendSettaFilesLocationAuto   FrontendSettaFilesLocation = FrontendSettaFilesLocation(config.FilesLocationAuto)
	FrontendSettaFilesLocationLocal  FrontendSettaFilesLocation = FrontendSettaFilesLocation(config.FilesLocationLocal)
	FrontendSettaFilesLocationGlobal FrontendSettaFilesLocation = FrontendSettaFilesLocation(config.FilesLocationGlobal)
)

type FrontendResolvedSettaFilesLocation string

const (
	FrontendResolvedSettaFilesLocationLocal  FrontendResolvedSettaFilesLocation = FrontendResolvedSettaFilesLocation(config.ResolvedFilesLocationLocal)
	FrontendResolvedSettaFilesLocationGlobal FrontendResolvedSettaFilesLocation = FrontendResolvedSettaFilesLocation(config.ResolvedFilesLocationGlobal)
)

type FrontendSettaFilesLocationPolicy struct {
	Requested []FrontendSettaFilesLocation         `json:"requested"`
	Resolved  []FrontendResolvedSettaFilesLocation `json:"resolved"`
}

type FrontendChatRunTypeSet map[string]bool

type FrontendRootTransportRoutes struct {
	BootstrapPage string `json:"bootstrapPage"`
	ToolsCall     string `json:"toolsCall"`
}

type FrontendBinaryTransportRoutes struct {
	Upload   string `json:"upload"`
	Download string `json:"download"`
}

type FrontendWebsocketTransportRoutes struct {
	Frontend          string `json:"frontend"`
	ListenerByID      string `json:"listenerById"`
	TerminalBySection string `json:"terminalBySection"`
}

type FrontendServerModeBoundaryRoutes struct {
	Launch                        string `json:"launch"`
	CreateWorkspaceLaunchIntent   string `json:"createWorkspaceLaunchIntent"`
	GetSettaHomeInfo              string `json:"getSettaHomeInfo"`
	GetLauncherRecentWorkspaces   string `json:"getLauncherRecentWorkspaces"`
	AddLauncherRecentWorkspace    string `json:"addLauncherRecentWorkspace"`
	RemoveLauncherRecentWorkspace string `json:"removeLauncherRecentWorkspace"`
	PinLauncherRecentWorkspace    string `json:"pinLauncherRecentWorkspace"`
	GetLauncherFilesystemRoots    string `json:"getLauncherFilesystemRoots"`
	ListLauncherDirectory         string `json:"listLauncherDirectory"`
	OpenLauncherWorkspace         string `json:"openLauncherWorkspace"`
}

type FrontendStatusTransportRoutes struct {
	GetSettaHomeInfo           string `json:"getSettaHomeInfo"`
	RevealPathInOSFileExplorer string `json:"revealPathInOsFileExplorer"`
}

type FrontendLauncherManagementTransportRoutes struct {
	GetLauncherStatus string `json:"getLauncherStatus"`
	RepairLauncher    string `json:"repairLauncher"`
	UpdateLauncher    string `json:"updateLauncher"`
	RemoveLauncher    string `json:"removeLauncher"`
}

type FrontendFileBrowserTransportRoutes struct {
	GetFileBrowserRoot      string `json:"getFileBrowserRoot"`
	GetFolderContents       string `json:"getFolderContents"`
	WriteFileBrowserContent string `json:"writeFileBrowserContent"`
}

type FrontendSettaAPIPresetRoutes struct {
	CreateTopLevelSection string `json:"createTopLevelSection"`
	GetLatestProjectState string `json:"getLatestProjectState"`
	SaveProject           string `json:"saveProject"`
}

type FrontendTransportRoutes struct {
	APIPrefix          string                                    `json:"apiPrefix"`
	Root               FrontendRootTransportRoutes               `json:"root"`
	Binary             FrontendBinaryTransportRoutes             `json:"binary"`
	Websocket          FrontendWebsocketTransportRoutes          `json:"websocket"`
	ServerModeBoundary FrontendServerModeBoundaryRoutes          `json:"serverModeBoundary"`
	Status             FrontendStatusTransportRoutes             `json:"status"`
	LauncherManagement FrontendLauncherManagementTransportRoutes `json:"launcherManagement"`
	FileBrowser        FrontendFileBrowserTransportRoutes        `json:"fileBrowser"`
	SettaAPIPresets    FrontendSettaAPIPresetRoutes              `json:"settaApiPresets"`
}

func FrontendValueBootstrapProtocol() FrontendBootstrapHandoffProtocol {
	return FrontendBootstrapProtocol()
}

func FrontendValueServerModeBoundaryPolicyByMode() FrontendServerModeBoundaryPolicy {
	return FrontendServerModeBoundaryPolicy{
		config.ModeIDE: {
			Capabilities: FrontendServerModeCapabilities{
				CanManageDesktopLauncher: true,
			},
			WorkspaceLaunchRouteKind: FrontendWorkspaceLaunchRouteKindIDE,
		},
		config.ModeShare: {
			Capabilities: FrontendServerModeCapabilities{
				CanManageDesktopLauncher: false,
			},
			WorkspaceLaunchRouteKind: FrontendWorkspaceLaunchRouteKindBlocked,
		},
		config.ModeApp: {
			Capabilities: FrontendServerModeCapabilities{
				CanManageDesktopLauncher: false,
			},
			WorkspaceLaunchRouteKind: FrontendWorkspaceLaunchRouteKindBlocked,
		},
		config.ModeLauncher: {
			Capabilities: FrontendServerModeCapabilities{
				CanManageDesktopLauncher: false,
			},
			WorkspaceLaunchRouteKind: FrontendWorkspaceLaunchRouteKindLauncher,
		},
	}
}

func FrontendValueEndpointOriginPolicyByRoute() FrontendEndpointOriginPolicy {
	return FrontendEndpointOriginPolicy{
		RouteLaunch:                        FrontendEndpointOriginLauncher,
		RouteCreateWorkspaceLaunchIntent:   FrontendEndpointOriginLauncher,
		RouteGetSettaHomeInfo:              FrontendEndpointOriginBackend,
		RouteMCPToolCall:                   FrontendEndpointOriginBackendOrigin,
		RouteGetLauncherRecentWorkspaces:   FrontendEndpointOriginLauncher,
		RouteAddLauncherRecentWorkspace:    FrontendEndpointOriginLauncher,
		RouteRemoveLauncherRecentWorkspace: FrontendEndpointOriginLauncher,
		RoutePinLauncherRecentWorkspace:    FrontendEndpointOriginLauncher,
		RouteGetLauncherFilesystemRoots:    FrontendEndpointOriginLauncher,
		RouteListLauncherDirectory:         FrontendEndpointOriginLauncher,
		RouteOpenLauncherWorkspace:         FrontendEndpointOriginLauncher,
	}
}

func FrontendValueModeScopedLauncherRoutesList() FrontendModeScopedLauncherRoutes {
	return FrontendModeScopedLauncherRoutes{
		RouteLaunch,
		RouteCreateWorkspaceLaunchIntent,
	}
}

func FrontendValueToolNameNormalizationConfig() FrontendToolNameNormalization {
	return FrontendToolNameNormalization{
		MCPPrefix:                mcpx.ToolNameMCPPrefix,
		SinglePrefix:             mcpx.DefaultServerSingleTool,
		DoublePrefix:             mcpx.DefaultServerDoubleTool,
		AskUserQuestionToolAlias: mcpx.AskUserQuestionAlias,
		AskUserQuestionToolName:  mcpx.AskUserQuestionToolName,
		ApprovalToolName:         externalagents.ApprovalToolName,
		TodoWriteToolName:        externalagents.TodoWriteToolName,
	}
}

func FrontendValueLocalHostnamePolicyConfig() FrontendLocalHostnamePolicy {
	return FrontendLocalHostnamePolicy{
		LoopbackHosts: hostnames.LoopbackHosts(),
	}
}

func FrontendValueSettaFilesLocationPolicyConfig() FrontendSettaFilesLocationPolicy {
	requested := make([]FrontendSettaFilesLocation, 0, len(config.RequestedFilesLocations()))
	for _, value := range config.RequestedFilesLocations() {
		requested = append(requested, FrontendSettaFilesLocation(value))
	}
	resolved := make([]FrontendResolvedSettaFilesLocation, 0, len(config.ResolvedFilesLocations()))
	for _, value := range config.ResolvedFilesLocations() {
		resolved = append(resolved, FrontendResolvedSettaFilesLocation(value))
	}
	return FrontendSettaFilesLocationPolicy{
		Requested: requested,
		Resolved:  resolved,
	}
}

func FrontendValueChatRunTypesByName() FrontendChatRunTypeSet {
	return FrontendChatRunTypeSet{
		managedchat.RunTypeManagedChat:       true,
		externalagents.RunTypeExternalAgent:  true,
		scriptablechat.RunTypeScriptableChat: true,
	}
}

func FrontendValueTransportRouteConstants() FrontendTransportRoutes {
	return FrontendTransportRoutes{
		APIPrefix: RouteAPIPrefix,
		Root: FrontendRootTransportRoutes{
			BootstrapPage: RouteBootstrapPage,
			ToolsCall:     RouteMCPToolCall,
		},
		Binary: FrontendBinaryTransportRoutes{
			Upload:   RouteBinaryUpload,
			Download: RouteBinaryDownload,
		},
		Websocket: FrontendWebsocketTransportRoutes{
			Frontend:          wsapi.RouteFrontend,
			ListenerByID:      wsapi.RouteListenerByID,
			TerminalBySection: wsapi.RouteTerminalBySection,
		},
		ServerModeBoundary: FrontendServerModeBoundaryRoutes{
			Launch:                        RouteLaunch,
			CreateWorkspaceLaunchIntent:   RouteCreateWorkspaceLaunchIntent,
			GetSettaHomeInfo:              RouteGetSettaHomeInfo,
			GetLauncherRecentWorkspaces:   RouteGetLauncherRecentWorkspaces,
			AddLauncherRecentWorkspace:    RouteAddLauncherRecentWorkspace,
			RemoveLauncherRecentWorkspace: RouteRemoveLauncherRecentWorkspace,
			PinLauncherRecentWorkspace:    RoutePinLauncherRecentWorkspace,
			GetLauncherFilesystemRoots:    RouteGetLauncherFilesystemRoots,
			ListLauncherDirectory:         RouteListLauncherDirectory,
			OpenLauncherWorkspace:         RouteOpenLauncherWorkspace,
		},
		Status: FrontendStatusTransportRoutes{
			GetSettaHomeInfo:           RouteGetSettaHomeInfo,
			RevealPathInOSFileExplorer: RouteRevealPathInOSFileExplorer,
		},
		LauncherManagement: FrontendLauncherManagementTransportRoutes{
			GetLauncherStatus: RouteGetLauncherStatus,
			RepairLauncher:    RouteRepairLauncher,
			UpdateLauncher:    RouteUpdateLauncher,
			RemoveLauncher:    RouteRemoveLauncher,
		},
		FileBrowser: FrontendFileBrowserTransportRoutes{
			GetFileBrowserRoot:      RouteGetFileBrowserRoot,
			GetFolderContents:       RouteGetFolderContents,
			WriteFileBrowserContent: RouteWriteFileBrowserContent,
		},
		SettaAPIPresets: FrontendSettaAPIPresetRoutes{
			CreateTopLevelSection: RouteCreateTopLevelSection,
			GetLatestProjectState: RouteGetLatestProjectState,
			SaveProject:           RouteSaveProject,
		},
	}
}
