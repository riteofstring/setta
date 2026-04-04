package frontendbindings

import (
	_ "embed"
	"strings"

	"setta/internal/agentruns"
)

//go:embed templates/app_generation_parse_generated_app_generation_mode.ts.tmpl
var parseGeneratedAppGenerationModeTemplate string

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
	modeLiterals := make([]string, 0, len(agentruns.AppGenerationModes()))
	for _, mode := range agentruns.AppGenerationModes() {
		modeLiterals = append(modeLiterals, tsStringLiteralExpr(mode))
	}
	return mustRenderFrontendBindingTemplate(
		"parseGeneratedAppGenerationMode",
		parseGeneratedAppGenerationModeTemplate,
		struct {
			ModeLiterals []string
		}{
			ModeLiterals: modeLiterals,
		},
	)
}
