package frontendbindings

import (
	"strings"

	"setta/internal/config"
	"setta/internal/httpapi"
)

func transportPolicySupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		aliasDeclaration(
			"GeneratedEndpointOriginPolicy",
			`"backend" | "launcher" | "backend-origin"`,
		),
		aliasDeclaration(
			"GeneratedWorkspaceLaunchRouteKind",
			`"ide" | "launcher" | "blocked"`,
		),
		objectDeclaration(
			"GeneratedServerModeCapabilities",
			TypeProperty{Name: "canManageDesktopLauncher", TypeExpr: "boolean"},
		),
		constDeclaration(
			"GENERATED_SERVER_MODE_BOUNDARY_POLICY",
			true,
			buildGeneratedServerModeBoundaryPolicyExprTS(),
		),
		constDeclaration(
			"GENERATED_ENDPOINT_ORIGIN_POLICY",
			true,
			buildGeneratedEndpointOriginPolicyExprTS(),
		),
		constDeclaration(
			"GENERATED_MODE_SCOPED_LAUNCHER_ROUTES",
			true,
			buildGeneratedModeScopedLauncherRoutesExprTS(),
		),
	}
}

func buildGeneratedServerModeBoundaryPolicyExprTS() string {
	modeEntries := []tsNamedLiteralObject{
		{
			Name: string(config.ModeIDE),
			Fields: []tsLiteralField{
				{Name: "capabilities", Value: "{ canManageDesktopLauncher: true }"},
				{Name: "workspaceLaunchRouteKind", Value: tsStringLiteralExpr("ide")},
			},
		},
		{
			Name: string(config.ModeShare),
			Fields: []tsLiteralField{
				{Name: "capabilities", Value: "{ canManageDesktopLauncher: false }"},
				{Name: "workspaceLaunchRouteKind", Value: tsStringLiteralExpr("blocked")},
			},
		},
		{
			Name: string(config.ModeApp),
			Fields: []tsLiteralField{
				{Name: "capabilities", Value: "{ canManageDesktopLauncher: false }"},
				{Name: "workspaceLaunchRouteKind", Value: tsStringLiteralExpr("blocked")},
			},
		},
		{
			Name: string(config.ModeLauncher),
			Fields: []tsLiteralField{
				{Name: "capabilities", Value: "{ canManageDesktopLauncher: false }"},
				{Name: "workspaceLaunchRouteKind", Value: tsStringLiteralExpr("launcher")},
			},
		},
	}

	var builder strings.Builder
	builder.WriteString("({\n")
	writeTSNamedObjectEntries(&builder, "  ", "    ", modeEntries)
	builder.WriteString("}) as Record<ServerModeResponse[\"mode\"], {\n")
	builder.WriteString("  capabilities: GeneratedServerModeCapabilities;\n")
	builder.WriteString("  workspaceLaunchRouteKind: GeneratedWorkspaceLaunchRouteKind;\n")
	builder.WriteString("}>")
	return builder.String()
}

func buildGeneratedEndpointOriginPolicyExprTS() string {
	fields := []tsLiteralField{
		{Name: tsStringLiteralExpr(httpapi.RouteLaunch), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteCreateWorkspaceLaunchIntent), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteGetSettaHomeInfo), Value: tsStringLiteralExpr("backend")},
		{Name: tsStringLiteralExpr(httpapi.RouteMCPToolCall), Value: tsStringLiteralExpr("backend-origin")},
		{Name: tsStringLiteralExpr(httpapi.RouteGetLauncherRecentWorkspaces), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteAddLauncherRecentWorkspace), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteRemoveLauncherRecentWorkspace), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RoutePinLauncherRecentWorkspace), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteGetLauncherFilesystemRoots), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteListLauncherDirectory), Value: tsStringLiteralExpr("launcher")},
		{Name: tsStringLiteralExpr(httpapi.RouteOpenLauncherWorkspace), Value: tsStringLiteralExpr("launcher")},
	}

	var builder strings.Builder
	builder.WriteString("({\n")
	writeTSObjectFields(&builder, "  ", fields)
	builder.WriteString("}) as Readonly<Record<string, GeneratedEndpointOriginPolicy>>")
	return builder.String()
}

func buildGeneratedModeScopedLauncherRoutesExprTS() string {
	routes := []string{
		tsStringLiteralExpr(httpapi.RouteLaunch),
		tsStringLiteralExpr(httpapi.RouteCreateWorkspaceLaunchIntent),
	}
	return "new Set<string>([" + strings.Join(routes, ", ") + "])"
}
