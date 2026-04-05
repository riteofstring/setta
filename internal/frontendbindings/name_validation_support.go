package frontendbindings

import (
	"reflect"

	"setta/internal/projectstate"
)

func nameValidationSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
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
	) + " satisfies " + BindingTypeName(reflect.TypeOf(projectstate.FrontendNameValidationContract{}))
}
