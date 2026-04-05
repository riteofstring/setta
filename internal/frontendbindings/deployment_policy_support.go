package frontendbindings

import (
	"reflect"

	"setta/internal/deployments"
)

func deploymentPolicySupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		constDeclaration(
			"GENERATED_DEFAULT_APP_POLICY",
			true,
			buildGeneratedDefaultAppPolicyExprTS(),
		),
	}
}

func buildGeneratedDefaultAppPolicyExprTS() string {
	return renderTSObjectLiteralFromGoValue(
		"frontend default app policy",
		deployments.DefaultAppPolicy(),
		goJSONFieldOrder(deployments.Policy{}),
	) + " as const satisfies " + BindingTypeName(reflect.TypeOf(deployments.Policy{}))
}
