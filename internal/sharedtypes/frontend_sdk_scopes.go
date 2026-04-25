package sharedtypes

import "setta/internal/frontendbindingmeta"

var appSubsystemFrontendSDKContractNames = map[string]struct{}{
	"AppGenerationMode":        {},
	"ArtifactType":             {},
	"CodeObjType":              {},
	"ConfigLanguage":           {},
	"DateCalendarWeekStart":    {},
	"DateControlMode":          {},
	"DateDisplayFormat":        {},
	"DateSelectionMode":        {},
	"DependencyKeyType":        {},
	"DependencyValueType":      {},
	"DropzoneMode":             {},
	"EndpointOrigin":           {},
	"SectionType":              {},
	"TextBlockFormat":          {},
	"TextParamInputUIType":     {},
	"TimeControlMode":          {},
	"TimeDisplayFont":          {},
	"TimeDisplayFormat":        {},
	"WorkspaceLaunchRouteKind": {},
}

var appSubsystemFrontendSDKExportedValueScopes = map[string]frontendbindingmeta.FrontendSDKExportedValueScope{
	"AppSpecPatchPolicyConfig": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"AppSubsystemChatUIConfig": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"BootstrapProtocol": {
		Scope: frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		ValuePaths: [][]string{
			{"launcherOriginStorageKey"},
		},
	},
	"C": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"DefaultAppPolicy": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"EndpointOriginPolicyByRoute": {
		Scope: frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		ValuePaths: [][]string{
			{"/__setta__/tools/call"},
		},
	},
	"LocalHostnamePolicyConfig": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"ModeScopedLauncherRoutesList": {
		Scope: frontendbindingmeta.FrontendSDKScopeAppSubsystem,
	},
	"RunSnapshotModeUIConfig": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"ServerModeBoundaryPolicyByMode": {
		Scope:            frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		IncludeFullValue: true,
	},
	"TransportRouteConstants": {
		Scope: frontendbindingmeta.FrontendSDKScopeAppSubsystem,
		ValuePaths: [][]string{
			{"apiPrefix"},
			{"binary", "download"},
			{"binary", "upload"},
			{"root", "bootstrapPage"},
			{"root", "toolsCall"},
			{"websocket", "frontend"},
			{"websocket", "listenerById"},
			{"websocket", "terminalBySection"},
		},
	},
}

func frontendSDKScopesForContract(name string) []string {
	if _, ok := appSubsystemFrontendSDKContractNames[name]; !ok {
		return nil
	}
	return []string{frontendbindingmeta.FrontendSDKScopeAppSubsystem}
}

func frontendSDKScopesForExportedValue(
	name string,
) []frontendbindingmeta.FrontendSDKExportedValueScope {
	scope, ok := appSubsystemFrontendSDKExportedValueScopes[name]
	if !ok {
		return nil
	}
	return []frontendbindingmeta.FrontendSDKExportedValueScope{cloneFrontendSDKExportedValueScope(scope)}
}

func cloneFrontendSDKExportedValueScope(
	scope frontendbindingmeta.FrontendSDKExportedValueScope,
) frontendbindingmeta.FrontendSDKExportedValueScope {
	cloned := scope
	if scope.ValuePaths != nil {
		cloned.ValuePaths = make([][]string, 0, len(scope.ValuePaths))
		for _, path := range scope.ValuePaths {
			cloned.ValuePaths = append(cloned.ValuePaths, append([]string(nil), path...))
		}
	}
	return cloned
}
