package main

import (
	"strings"
	"testing"

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
