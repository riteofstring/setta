package httpapi

import (
	"setta/internal/config"
	"setta/internal/mcpx"
)

const frontendAskUserQuestionToolName = "AskUserQuestion"

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
	SinglePrefix            string `json:"singlePrefix"`
	DoublePrefix            string `json:"doublePrefix"`
	AskUserQuestionToolName string `json:"askUserQuestionToolName"`
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
		SinglePrefix:            mcpx.DefaultServerID + "_",
		DoublePrefix:            mcpx.DefaultServerID + mcpx.ToolNameSeparator,
		AskUserQuestionToolName: frontendAskUserQuestionToolName,
	}
}
