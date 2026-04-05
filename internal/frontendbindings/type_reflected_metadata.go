package frontendbindings

import (
	"reflect"

	"setta/internal/artifacts"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
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
	reflect.TypeOf(projectstate.SectionSize{}): {
		DefaultValue:  projectstate.FrontendDefaultSectionSize(),
		HasCreateExpr: true,
		CreateExprOverrides: map[string]string{
			"width":  "SectionSizeModeEnum.auto",
			"height": "SectionSizeModeEnum.auto",
		},
	},
	reflect.TypeOf(projectview.SectionCodegenPolicy{}): {
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(projectview.CodeObjValuePolicy{}): {
		UseGenericCreateBody: true,
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
