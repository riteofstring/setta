package frontendbindings

import "setta/internal/projectstate"

func nameValidationSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		objectDeclaration(
			"GeneratedNameValidationContract",
			TypeProperty{Name: "projectReservedNames", TypeExpr: "ReadonlyArray<string>"},
			TypeProperty{Name: "pythonKeywords", TypeExpr: "ReadonlyArray<string>"},
			TypeProperty{Name: "simpleNameAllowedChars", TypeExpr: "ReadonlyArray<string>"},
			TypeProperty{Name: "pythonIdentifierStartChars", TypeExpr: "ReadonlyArray<string>"},
			TypeProperty{Name: "pythonIdentifierContinueChars", TypeExpr: "ReadonlyArray<string>"},
			TypeProperty{Name: "slugReplacementChars", TypeExpr: "ReadonlyArray<string>"},
		),
		constDeclaration(
			"GENERATED_NAME_VALIDATION_CONTRACT",
			true,
			buildGeneratedNameValidationContractExprTS(),
		),
	}
}

func buildGeneratedNameValidationContractExprTS() string {
	contract := projectstate.FrontendNameValidationContractData()
	return renderTSObjectLiteralFromGoValue(
		"frontend name validation contract",
		contract,
		goJSONFieldOrder(contract),
	) + " as const satisfies GeneratedNameValidationContract"
}
