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
			false,
			buildGeneratedServerModeBoundaryPolicyExprTS(),
		),
		constDeclaration(
			"GENERATED_ENDPOINT_ORIGIN_POLICY",
			true,
			buildGeneratedEndpointOriginPolicyExprTS(),
		),
		constDeclaration(
			"GENERATED_MODE_SCOPED_LAUNCHER_ROUTES",
			false,
			buildGeneratedModeScopedLauncherRoutesExprTS(),
		),
		functionDeclaration(
			"stripGeneratedTransportAddressQueryAndHash",
			false,
			"string",
			`const hashIndex = address.indexOf("#");
let withoutHash = address;
if (hashIndex >= 0) {
  withoutHash = address.slice(0, hashIndex);
}
const queryIndex = withoutHash.indexOf("?");
if (queryIndex >= 0) {
  return withoutHash.slice(0, queryIndex);
}
return withoutHash;`,
			TypeProperty{Name: "address", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"resolveGeneratedServerModeCapabilities",
			"GeneratedServerModeCapabilities",
			`if (mode === null) {
  return { canManageDesktopLauncher: false };
}
return GENERATED_SERVER_MODE_BOUNDARY_POLICY[mode].capabilities;`,
			TypeProperty{Name: "mode", TypeExpr: `ServerModeResponse["mode"] | null`},
		),
		exportedFunctionDeclaration(
			"resolveGeneratedWorkspaceLaunchRouteKind",
			"GeneratedWorkspaceLaunchRouteKind",
			`if (mode === null) {
  return "blocked";
}
return GENERATED_SERVER_MODE_BOUNDARY_POLICY[mode].workspaceLaunchRouteKind;`,
			TypeProperty{Name: "mode", TypeExpr: `ServerModeResponse["mode"] | null`},
		),
		exportedFunctionDeclaration(
			"resolveGeneratedEndpointOriginForMode",
			"GeneratedEndpointOriginPolicy",
			`const normalizedAddress = stripGeneratedTransportAddressQueryAndHash(address);
if (normalizedAddress.startsWith(`+tsStringLiteralExpr(httpapi.RouteBootstrapPage)+`)) {
  return "backend-origin";
}
const routePolicy = GENERATED_ENDPOINT_ORIGIN_POLICY[normalizedAddress];
if (routePolicy === "backend-origin") {
  return "backend-origin";
}
if (routePolicy === "launcher") {
  if (
    GENERATED_MODE_SCOPED_LAUNCHER_ROUTES.has(normalizedAddress) &&
    serverMode !== `+tsStringLiteralExpr(string(config.ModeLauncher))+`
  ) {
    return "backend";
  }
  return "launcher";
}
return "backend";`,
			TypeProperty{Name: "address", TypeExpr: "string"},
			TypeProperty{Name: "serverMode", TypeExpr: `ServerModeResponse["mode"] | null`},
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
