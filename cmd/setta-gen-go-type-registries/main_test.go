package main

import (
	"io/fs"
	"os"
	"path/filepath"
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

func TestRenderFrontendContractReflectExprSupportsScalarAndInterfaceKinds(t *testing.T) {
	t.Parallel()

	if got := renderFrontendContractReflectExpr(reflect.TypeOf(""), nil); got != `reflect.TypeOf(string(""))` {
		t.Fatalf("unexpected string reflect expression %q", got)
	}
	if got := renderFrontendContractReflectExpr(reflect.TypeOf((*error)(nil)).Elem(), nil); got != `reflect.TypeOf((*error)(nil)).Elem()` {
		t.Fatalf("unexpected interface reflect expression %q", got)
	}
}

func TestRecordDefaultProviderEntryRejectsConflictingProviders(t *testing.T) {
	t.Parallel()

	providersByTarget := map[string]defaultProviderEntry{
		"ProjectConfig": {
			Target: registryEntry{
				Type: gotypediscovery.DiscoveredType{Name: "ProjectConfig"},
			},
			ProviderPackagePath: "setta/internal/projectview",
			ProviderFuncName:    "DefaultProjectConfig",
		},
	}
	err := recordDefaultProviderEntry(providersByTarget, defaultProviderEntry{
		Target: registryEntry{
			Type: gotypediscovery.DiscoveredType{Name: "ProjectConfig"},
		},
		ProviderPackagePath: "setta/internal/projectstate",
		ProviderFuncName:    "DefaultProjectConfig",
	})
	if err == nil {
		t.Fatal("expected conflicting default provider error")
	}
	if !strings.Contains(err.Error(), "multiple default providers discovered for ProjectConfig") {
		t.Fatalf("unexpected conflict error %v", err)
	}
}

func TestWalkInternalPackagePathsSkipsHiddenAndTestdata(t *testing.T) {
	t.Parallel()

	repoRoot := t.TempDir()
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "internal", "alpha"), "alpha.go")
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "internal", "alpha"), "alpha_test.go")
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "internal", ".hidden"), "hidden.go")
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "internal", "testdata"), "fixture.go")
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "internal", "onlytests"), "only_test.go")

	packages, err := walkInternalPackagePaths(repoRoot, filepath.Join(repoRoot, "internal"))
	if err != nil {
		t.Fatalf("walk internal package paths: %v", err)
	}
	if !reflect.DeepEqual(packages, []string{"setta/internal/alpha"}) {
		t.Fatalf("unexpected internal packages %#v", packages)
	}
}

func TestWalkPackagePathsIncludesPluginPackagesForFrontendValueDiscovery(t *testing.T) {
	t.Parallel()

	repoRoot := t.TempDir()
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "internal", "alpha"), "alpha.go")
	writeGeneratorPackageFile(t, filepath.Join(repoRoot, "plugins", "setta-json-render-app-gen", "backend"), "frontend_value_exports.go")

	packages, err := walkPackagePaths(
		repoRoot,
		filepath.Join(repoRoot, "internal"),
		filepath.Join(repoRoot, "plugins"),
	)
	if err != nil {
		t.Fatalf("walk package paths: %v", err)
	}
	if !reflect.DeepEqual(
		packages,
		[]string{
			"setta/internal/alpha",
			"setta/plugins/setta-json-render-app-gen/backend",
		},
	) {
		t.Fatalf("unexpected package paths %#v", packages)
	}
}

func TestPluginAppDefinitionPackagePathsDiscoversPluginProviders(t *testing.T) {
	t.Parallel()

	repoRoot := t.TempDir()
	writeGeneratorPackageFile(
		t,
		filepath.Join(repoRoot, "plugins", "acme-first-provider", "backend", "appdefinition"),
		"types.go",
	)
	writeGeneratorPackageFile(
		t,
		filepath.Join(repoRoot, "plugins", "acme-second-provider", "backend", "appdefinition"),
		"types.go",
	)
	writeGeneratorPackageFile(
		t,
		filepath.Join(repoRoot, "plugins", "acme-ignored-provider", "backend"),
		"provider.go",
	)

	packages, err := pluginAppDefinitionPackagePathsFromRepoRoot(repoRoot)
	if err != nil {
		t.Fatalf("discover plugin app definition packages: %v", err)
	}
	if !reflect.DeepEqual(
		packages,
		[]string{
			"setta/plugins/acme-first-provider/backend/appdefinition",
			"setta/plugins/acme-second-provider/backend/appdefinition",
		},
	) {
		t.Fatalf("unexpected plugin app definition packages %#v", packages)
	}
}

func writeGeneratorPackageFile(t *testing.T, dir string, name string) {
	t.Helper()

	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte("package fixture\n"), fs.FileMode(0o644)); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}
