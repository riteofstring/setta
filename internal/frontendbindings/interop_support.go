package frontendbindings

import "setta/internal/mcpx"

const generatedAskUserQuestionToolName = "AskUserQuestion"

func interopSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		objectDeclaration(
			"GeneratedToolNameNormalization",
			TypeProperty{Name: "singlePrefix", TypeExpr: "string"},
			TypeProperty{Name: "doublePrefix", TypeExpr: "string"},
			TypeProperty{Name: "askUserQuestionToolName", TypeExpr: "string"},
		),
		constDeclaration(
			"GENERATED_TOOL_NAME_NORMALIZATION",
			true,
			buildGeneratedToolNameNormalizationExprTS(),
		),
	}
}

func buildGeneratedToolNameNormalizationExprTS() string {
	return "({\n" +
		"  singlePrefix: " + tsStringLiteralExpr(mcpx.DefaultServerID+"_") + ",\n" +
		"  doublePrefix: " + tsStringLiteralExpr(mcpx.DefaultServerID+mcpx.ToolNameSeparator) + ",\n" +
		"  askUserQuestionToolName: " + tsStringLiteralExpr(generatedAskUserQuestionToolName) + ",\n" +
		"}) as const satisfies GeneratedToolNameNormalization"
}
