package frontendbindings

import (
	_ "embed"

	"setta/internal/mcpx"
)

const generatedAskUserQuestionToolName = "AskUserQuestion"

//go:embed templates/interop_normalize_generated_origin.ts.tmpl
var normalizeGeneratedOriginTemplate string

//go:embed templates/interop_format_generated_origin_host.ts.tmpl
var formatGeneratedOriginHostTemplate string

//go:embed templates/interop_normalize_generated_tool_name.ts.tmpl
var normalizeGeneratedToolNameTemplate string

func interopSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		exportedFunctionDeclaration(
			"normalizeGeneratedOrigin",
			"string | null",
			mustRenderFrontendBindingTemplate("normalizeGeneratedOrigin", normalizeGeneratedOriginTemplate, nil),
			TypeProperty{Name: "rawOrigin", TypeExpr: "string | null | undefined"},
		),
		functionDeclaration(
			"formatGeneratedOriginHost",
			false,
			"string",
			mustRenderFrontendBindingTemplate("formatGeneratedOriginHost", formatGeneratedOriginHostTemplate, nil),
			TypeProperty{Name: "hostname", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"normalizeGeneratedToolName",
			"string | null",
			buildNormalizeGeneratedToolNameBody(),
			TypeProperty{Name: "rawToolName", TypeExpr: "string | null | undefined"},
		),
	}
}

func buildNormalizeGeneratedToolNameBody() string {
	return mustRenderFrontendBindingTemplate("normalizeGeneratedToolName", normalizeGeneratedToolNameTemplate, struct {
		SinglePrefixLiteral            string
		DoublePrefixLiteral            string
		AskUserQuestionToolNameLiteral string
	}{
		SinglePrefixLiteral:            tsStringLiteralExpr(mcpx.DefaultServerID + "_"),
		DoublePrefixLiteral:            tsStringLiteralExpr(mcpx.DefaultServerID + mcpx.ToolNameSeparator),
		AskUserQuestionToolNameLiteral: tsStringLiteralExpr(generatedAskUserQuestionToolName),
	})
}
