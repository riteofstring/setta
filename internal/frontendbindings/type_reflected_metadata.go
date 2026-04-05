package frontendbindings

import (
	"reflect"

	"setta/internal/agentruns"
	"setta/internal/artifacts"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

type reflectedObjectDeclarationSpec struct {
	DeclarationName           string
	DefaultValue              any
	HasCreateExpr             bool
	UseGenericCreateBody      bool
	CreateBody                string
	CreateExprOverrides       map[string]string
	PropertyTypeExprOverrides map[string]string
	PropertyOptionalOverrides map[string]bool
	IgnoredProperties         map[string]struct{}
	ExtraProperties           []TypeProperty
}

func reflectedIgnoredProperties(names ...string) map[string]struct{} {
	ignored := make(map[string]struct{}, len(names))
	for _, name := range names {
		ignored[name] = struct{}{}
	}
	return ignored
}

var discoveredFrontendDefaultValueProviderRegistry = discoveredFrontendDefaultValueProviders()

func reflectedSpecWithDiscoveredDefault(
	t reflect.Type,
	spec reflectedObjectDeclarationSpec,
) reflectedObjectDeclarationSpec {
	if spec.DefaultValue != nil {
		return spec
	}
	provider, ok := discoveredFrontendDefaultValueProviderRegistry[t]
	if !ok || provider == nil {
		return spec
	}
	spec.DefaultValue = provider()
	spec.HasCreateExpr = true
	return spec
}

var artifactAliasDeclarations = map[reflect.Type]TypeDeclaration{
	reflect.TypeOf(artifacts.ChartDataValue{}): aliasDeclaration(
		"ChartDataValue",
		"Record<string, Array<string | number>>",
	),
}

func artifactTypeDeclaration(
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if declaration, ok := artifactAliasDeclarations[t]; ok {
		return declaration, true, nil
	}
	return TypeDeclaration{}, false, nil
}

var ownerBackedReflectedObjectDeclarationSpecs = map[reflect.Type]reflectedObjectDeclarationSpec{
	reflect.TypeOf(realtime.ListenerCoverageSnapshot{}): {
		PropertyTypeExprOverrides: map[string]string{
			"dependencies": "Array<BaseDependencyKeyUnion>",
		},
	},
	reflect.TypeOf(agentruns.EngineConfig{}): {
		DefaultValue:         agentruns.EngineConfig{EngineType: agentruns.EngineTypeSettaLLM},
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyOptionalOverrides: map[string]bool{
			"defaults":              false,
			"externalAgentConfigId": true,
			"runtimeSupport":        true,
			"settaLlmConfigId":      true,
		},
	},
	reflect.TypeOf(projectstate.FrontendMetaControlSizingPolicyByType{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(projectstate.FrontendSectionSizingPolicyByType{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(projectstate.FrontendSectionSizingPolicy{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(settingsstate.FrontendSettingsState{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(deployments.Policy{}): {
		DefaultValue:  deployments.DefaultPolicy(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(projectstate.SectionSize{}): {
		CreateExprOverrides: map[string]string{
			"width":  "SectionSizeModeEnum.auto",
			"height": "SectionSizeModeEnum.auto",
		},
	},
	reflect.TypeOf(projectview.SectionCodegenPolicy{}): {
		DefaultValue:         projectview.FrontendDefaultPythonSectionCodegenPolicy(),
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"allowlist":            "Array<SectionType> | null",
			"metaControlAllowlist": "Array<CodeObjType> | null",
			"typePolicies":         "Record<SectionType, SectionTypeCodegenPolicy>",
			"sectionOverrides":     "Record<string, SectionCodegenOverride>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"allowlist":            true,
			"metaControlAllowlist": true,
		},
	},
	reflect.TypeOf(projectview.CodeObjValuePolicy{}): {
		DefaultValue:         projectview.FrontendDefaultPythonCodeObjValuePolicy(),
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"typePolicies":     "Record<CodeObjType, CodeObjTypeValuePolicy>",
			"codeObjOverrides": "Record<string, CodeObjValueOverride>",
		},
	},
	reflect.TypeOf(projectview.ProjectCodegenPythonTarget{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"language":           "typeof ProjectCodegenLanguageEnum.python",
			"sectionPolicy":      "SectionCodegenPolicy",
			"codeObjValuePolicy": "CodeObjValuePolicy",
		},
	},
}

func ownerBackedReflectedObjectDeclarationSpec(t reflect.Type) (reflectedObjectDeclarationSpec, bool) {
	if spec, ok := ownerBackedReflectedObjectDeclarationSpecs[t]; ok {
		return reflectedSpecWithDiscoveredDefault(t, spec), true
	}
	if spec := reflectedSpecWithDiscoveredDefault(t, reflectedObjectDeclarationSpec{}); spec.HasCreateExpr {
		return spec, true
	}
	return reflectedObjectDeclarationSpec{}, false
}
