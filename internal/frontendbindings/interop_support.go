package frontendbindings

import (
	"strings"

	"setta/internal/mcpx"
)

const generatedAskUserQuestionToolName = "AskUserQuestion"

func interopSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		exportedFunctionDeclaration(
			"normalizeGeneratedOrigin",
			"string | null",
			buildNormalizeGeneratedOriginBody(),
			TypeProperty{Name: "rawOrigin", TypeExpr: "string | null | undefined"},
		),
		exportedFunctionDeclaration(
			"normalizeGeneratedToolName",
			"string | null",
			buildNormalizeGeneratedToolNameBody(),
			TypeProperty{Name: "rawToolName", TypeExpr: "string | null | undefined"},
		),
	}
}

func buildNormalizeGeneratedOriginBody() string {
	return "  return generatedBindingRuntime.normalizeGeneratedOrigin(rawOrigin);"
}

func buildNormalizeGeneratedToolNameBody() string {
	return strings.Join([]string{
		"  return generatedBindingRuntime.normalizeGeneratedToolName(",
		"    rawToolName,",
		"    " + tsStringLiteralExpr(mcpx.DefaultServerID+"_") + ",",
		"    " + tsStringLiteralExpr(mcpx.DefaultServerID+mcpx.ToolNameSeparator) + ",",
		"    " + tsStringLiteralExpr(generatedAskUserQuestionToolName) + ",",
		"  );",
	}, "\n")
}
