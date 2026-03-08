package frontendbindings

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestBuild(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	assertGoldenFile(t, "generated_go_routes.ts", bindings.RoutesTS)
	assertGoldenFile(t, "generated_go_types.ts", bindings.TypesTS)
	assertGoldenFile(t, "generated_go_endpoints.ts", bindings.EndpointsTS)
	assertEndpointTypeReferencesResolve(t, bindings.TypesTS, bindings.EndpointsTS)
}

func TestRenderTypesUsesCustomFactoryBody(t *testing.T) {
	t.Helper()

	typesTS, err := renderTemplate(typesTemplateText, map[string]any{
		"Declarations": []TypeDeclaration{
			aliasDeclarationWithFactory(
				"CustomThing",
				"{ value: string }",
				`export function createCustomThing(options: Partial<CustomThing> = {}): CustomThing {
  return mergeGeneratedOptions(
    {
      value: "",
    },
    options,
  );
}`,
			),
		},
	})
	if err != nil {
		t.Fatalf("renderTemplate(...) error = %v", err)
	}

	if !strings.Contains(typesTS, "export function createCustomThing(options: Partial<CustomThing> = {}): CustomThing {") {
		t.Fatalf("types output missing custom factory:\n%s", typesTS)
	}
	if strings.Contains(typesTS, "return options as CustomThing;") {
		t.Fatalf("types output rendered default factory instead of custom factory:\n%s", typesTS)
	}
}

func TestBuildBindingsIncludesAdditionalDeclarations(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		rawDeclaration("GeneratedSupport", `export const generatedSupport = "ok";`),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, `export const generatedSupport = "ok";`) {
		t.Fatalf("types output missing additional declaration:\n%s", bindings.TypesTS)
	}
}

func TestBuildDoesNotEmitProjectStateFrontendSupportMarker(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	if strings.Contains(bindings.TypesTS, "ProjectStateFrontendSupport") {
		t.Fatalf("types output still emits legacy project-state support marker:\n%s", bindings.TypesTS)
	}
}

func TestBuildDoesNotEmitWebsocketFrontendSupportMarker(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	if strings.Contains(bindings.TypesTS, "WebsocketFrontendSupport") {
		t.Fatalf("types output still emits legacy websocket support marker:\n%s", bindings.TypesTS)
	}
}

func assertGoldenFile(t *testing.T, name string, actual string) {
	t.Helper()

	path := filepath.Join("testdata", name)
	if os.Getenv("SETTA_UPDATE_FRONTENDBINDING_GOLDENS") == "1" {
		if err := os.WriteFile(path, []byte(strings.TrimSpace(actual)+"\n"), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
		return
	}
	expectedBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	expected := strings.TrimSpace(string(expectedBytes))
	if strings.TrimSpace(actual) != expected {
		t.Fatalf("unexpected generated output for %s:\n%s", name, actual)
	}
}

func assertEndpointTypeReferencesResolve(t *testing.T, typesTS string, endpointsTS string) {
	t.Helper()

	typeDeclPattern := regexp.MustCompile(`(?m)^export type ([A-Za-z0-9_]+) = `)
	endpointRefPattern := regexp.MustCompile(`gt\.([A-Za-z0-9_]+)`)

	declared := map[string]struct{}{}
	for _, match := range typeDeclPattern.FindAllStringSubmatch(typesTS, -1) {
		declared[match[1]] = struct{}{}
	}

	missing := []string{}
	for _, match := range endpointRefPattern.FindAllStringSubmatch(endpointsTS, -1) {
		name := match[1]
		if _, ok := declared[name]; ok {
			continue
		}
		missing = append(missing, name)
	}

	if len(missing) > 0 {
		t.Fatalf("generated endpoint references missing type declarations: %v", missing)
	}
}
