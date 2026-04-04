package frontendbindings

import (
	"strconv"
	"strings"

	"setta/internal/httpapi"
)

func bootstrapHandoffSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		objectDeclaration(
			"GeneratedBootstrapProtocol",
			TypeProperty{Name: "workspaceHistoryStorageKey", TypeExpr: "string"},
			TypeProperty{Name: "workspaceHistoryQueryParam", TypeExpr: "string"},
			TypeProperty{Name: "workspaceHistoryHashParam", TypeExpr: "string"},
			TypeProperty{Name: "launcherOriginStorageKey", TypeExpr: "string"},
			TypeProperty{Name: "launcherOriginHashParam", TypeExpr: "string"},
			TypeProperty{Name: "launcherOriginProofHashParam", TypeExpr: "string"},
			TypeProperty{Name: "openWorkspaceSwitcherQueryParam", TypeExpr: "string"},
			TypeProperty{Name: "openWorkspaceSwitcherHashParam", TypeExpr: "string"},
			TypeProperty{Name: "backendOriginOverrideQueryParam", TypeExpr: "string"},
			TypeProperty{Name: "maxValueLength", TypeExpr: "number"},
		),
		constDeclaration(
			"GENERATED_BOOTSTRAP_PROTOCOL",
			true,
			buildGeneratedBootstrapProtocolExprTS(),
		),
	}
}

func buildGeneratedBootstrapProtocolExprTS() string {
	protocol := httpapi.FrontendBootstrapProtocol()
	fields := []tsLiteralField{
		{Name: "workspaceHistoryStorageKey", Value: tsStringLiteralExpr(protocol.WorkspaceHistoryStorageKey)},
		{Name: "workspaceHistoryQueryParam", Value: tsStringLiteralExpr(protocol.WorkspaceHistoryQueryParam)},
		{Name: "workspaceHistoryHashParam", Value: tsStringLiteralExpr(protocol.WorkspaceHistoryHashParam)},
		{Name: "launcherOriginStorageKey", Value: tsStringLiteralExpr(protocol.LauncherOriginStorageKey)},
		{Name: "launcherOriginHashParam", Value: tsStringLiteralExpr(protocol.LauncherOriginHashParam)},
		{Name: "launcherOriginProofHashParam", Value: tsStringLiteralExpr(protocol.LauncherOriginProofHashParam)},
		{Name: "openWorkspaceSwitcherQueryParam", Value: tsStringLiteralExpr(protocol.OpenWorkspaceSwitcherQueryParam)},
		{Name: "openWorkspaceSwitcherHashParam", Value: tsStringLiteralExpr(protocol.OpenWorkspaceSwitcherHashParam)},
		{Name: "backendOriginOverrideQueryParam", Value: tsStringLiteralExpr(protocol.BackendOriginOverrideQueryParam)},
		{Name: "maxValueLength", Value: strconv.Itoa(protocol.MaxValueLength)},
	}

	var builder strings.Builder
	builder.WriteString("({\n")
	writeTSObjectFields(&builder, "  ", fields)
	builder.WriteString("}) as const satisfies GeneratedBootstrapProtocol")
	return builder.String()
}
