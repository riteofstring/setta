package frontendbindings

import (
	"reflect"

	"setta/internal/httpapi"
)

func bootstrapHandoffSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		constDeclaration(
			"GENERATED_BOOTSTRAP_PROTOCOL",
			true,
			buildGeneratedBootstrapProtocolExprTS(),
		),
	}
}

func buildGeneratedBootstrapProtocolExprTS() string {
	protocol := httpapi.FrontendBootstrapProtocol()
	return renderTSObjectLiteralFromGoValue(
		"frontend bootstrap handoff protocol",
		protocol,
		goJSONFieldOrder(httpapi.FrontendBootstrapHandoffProtocol{}),
	) + " satisfies " + BindingTypeName(reflect.TypeOf(httpapi.FrontendBootstrapHandoffProtocol{}))
}
