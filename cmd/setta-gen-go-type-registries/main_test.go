package main

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/agentprofiles"
	"setta/internal/gotypediscovery"
)

func TestRenderRegistryDoesNotEmitTypeOverrideFunction(t *testing.T) {
	t.Parallel()

	target := registryTarget{
		OutputPath: "internal/frontendbindings/discovered_type_roots_gen.go",
		Package:    "frontendbindings",
		FuncName:   "DiscoveredConvertibleTypes",
		Comment:    "test",
	}
	entries := []registryEntry{{
		PkgPath: "setta/internal/pythonsdkcontracts",
		Type: gotypediscovery.DiscoveredType{
			Name:              "ListenerRealtimeDelta",
			Kind:              gotypediscovery.TypeKindStruct,
			TargetPackagePath: "setta/internal/realtime",
			TargetTypeName:    "ListenerRealtimeDelta",
		},
	}}

	rendered := renderRegistry(target, entries)

	if strings.Contains(rendered, "DiscoveredTypeOverrides") {
		t.Fatalf("rendered registry unexpectedly included type override function:\n%s", rendered)
	}
	if strings.Contains(rendered, "\"setta/internal/realtime\"") {
		t.Fatalf("rendered registry unexpectedly imported target type package:\n%s", rendered)
	}
	if !strings.Contains(rendered, "func DiscoveredConvertibleTypes() []reflect.Type") {
		t.Fatalf("rendered registry missing root function:\n%s", rendered)
	}
}

func TestRenderSharedDefaultProviderRegistryProfilesProvidersByName(t *testing.T) {
	t.Parallel()

	rendered := renderSharedDefaultProviderRegistry(map[string][]defaultProviderEntry{
		"python_shared": {{
			Target: registryEntry{
				PkgPath: "setta/internal/projectview",
				Type: gotypediscovery.DiscoveredType{
					Name: "ProjectConfig",
					Kind: gotypediscovery.TypeKindStruct,
				},
			},
			ProviderPackagePath: "setta/internal/projectview",
			ProviderFuncName:    "PythonSharedDefaultProjectConfig",
		}},
	})

	if !strings.Contains(rendered, "package sharedtypes") {
		t.Fatalf("rendered shared default registry missing sharedtypes package:\n%s", rendered)
	}
	if !strings.Contains(rendered, "\"python_shared\": {") {
		t.Fatalf("rendered shared default registry missing python_shared profile bucket:\n%s", rendered)
	}
	if !strings.Contains(rendered, "PythonSharedDefaultProjectConfig()") {
		t.Fatalf("rendered shared default registry missing provider call:\n%s", rendered)
	}
}

func TestRenderFrontendContractNameRegistryEmitsReflectTypeMap(t *testing.T) {
	t.Parallel()

	rendered := renderFrontendContractNameRegistry([]gotypediscovery.FrontendContractNameEntry{{
		Type: reflect.TypeOf(agentprofiles.Profile{}),
		Name: "AgentProfile",
	}})

	if !strings.Contains(rendered, "package frontendbindings") {
		t.Fatalf("rendered frontend contract registry missing frontendbindings package:\n%s", rendered)
	}
	if !strings.Contains(rendered, "var frontendBindingGeneratedTypeNamesByType = map[reflect.Type]string{") {
		t.Fatalf("rendered frontend contract registry missing type-name map:\n%s", rendered)
	}
	if !strings.Contains(rendered, `reflect.TypeOf(agentprofiles.Profile{}): "AgentProfile"`) {
		t.Fatalf("rendered frontend contract registry missing agent profile entry:\n%s", rendered)
	}
}
