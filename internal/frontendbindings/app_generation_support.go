package frontendbindings

import (
	"strings"

	"setta/internal/agentruns"
)

func appGenerationSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		aliasDeclaration(
			"GeneratedAppGenerationMode",
			buildGeneratedAppGenerationModeAliasExprTS(),
		),
		constDeclaration(
			"GeneratedAppGenerationModeEnum",
			true,
			buildGeneratedAppGenerationModeEnumExprTS(),
		),
		constDeclaration(
			"GENERATED_PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE",
			true,
			tsStringLiteralExpr(agentruns.ChatAppGenerationMessageModePlainChat),
		),
		exportedFunctionDeclaration(
			"parseGeneratedAppGenerationMode",
			"GeneratedAppGenerationMode | null",
			buildParseGeneratedAppGenerationModeBody(),
			TypeProperty{Name: "value", TypeExpr: "unknown"},
		),
	}
}

func buildGeneratedAppGenerationModeAliasExprTS() string {
	modes := agentruns.AppGenerationModes()
	unionMembers := make([]string, 0, len(modes))
	for _, mode := range modes {
		unionMembers = append(unionMembers, tsStringLiteralExpr(mode))
	}
	return strings.Join(unionMembers, " | ")
}

func buildGeneratedAppGenerationModeEnumExprTS() string {
	fields := []tsLiteralField{
		{Name: "JSONRender", Value: tsStringLiteralExpr(agentruns.AppGenerationModeJSONRender)},
		{Name: "JSONRenderWithImage", Value: tsStringLiteralExpr(agentruns.AppGenerationModeJSONRenderWithImage)},
		{Name: "PromptBuilder", Value: tsStringLiteralExpr(agentruns.AppGenerationModePromptBuilder)},
		{Name: "MCPServer", Value: tsStringLiteralExpr(agentruns.AppGenerationModeMCPServer)},
	}

	var builder strings.Builder
	builder.WriteString("({\n")
	writeTSObjectFields(&builder, "  ", fields)
	builder.WriteString("}) as const satisfies Record<string, GeneratedAppGenerationMode>")
	return builder.String()
}

func buildParseGeneratedAppGenerationModeBody() string {
	var builder strings.Builder
	builder.WriteString(`if (typeof value !== "string") {
  return null;
}
const trimmed = value.trim();
if (!trimmed) {
  return null;
}
switch (trimmed) {
`)
	for _, mode := range agentruns.AppGenerationModes() {
		builder.WriteString("  case ")
		builder.WriteString(tsStringLiteralExpr(mode))
		builder.WriteString(":\n")
	}
	builder.WriteString(`    return trimmed;
  default:
    return null;
}`)
	return builder.String()
}
