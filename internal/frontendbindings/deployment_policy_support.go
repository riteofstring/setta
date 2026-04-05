package frontendbindings

import "setta/internal/deployments"

func defaultAppPolicyDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createDefaultAppPolicy",
		"SharePolicy",
		buildDefaultAppPolicyFunctionBodyTS(),
		TypeProperty{Name: "options", TypeExpr: "Partial<SharePolicy>", DefaultValue: "{}"},
	)
}

func buildDefaultAppPolicyFunctionBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyFromGoValueTS(
		"frontend default app policy",
		deployments.DefaultAppPolicy(),
		goJSONFieldOrder(deployments.Policy{}),
		"options",
		"SharePolicy",
	)
}

func deploymentPolicySupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		defaultAppPolicyDeclaration(),
	}
}
