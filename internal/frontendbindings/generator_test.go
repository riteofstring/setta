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

func TestRenderTypesUsesStructuredCreateBody(t *testing.T) {
	t.Helper()

	typesTS, err := renderTemplate(typesTemplateText, map[string]any{
		"Declarations": []TypeDeclaration{
			objectDeclarationWithCreateBody(
				"BodyThing",
				`  const normalized = options.value ?? "";
  return {
    value: normalized.toUpperCase(),
  };`,
				TypeProperty{Name: "value", TypeExpr: "string"},
			),
		},
	})
	if err != nil {
		t.Fatalf("renderTemplate(...) error = %v", err)
	}

	if !strings.Contains(typesTS, "export function createBodyThing(options: Partial<BodyThing> = {}): BodyThing {") {
		t.Fatalf("types output missing structured create-body function:\n%s", typesTS)
	}
	if !strings.Contains(typesTS, "const normalized = options.value ?? \"\";") {
		t.Fatalf("types output missing structured create-body content:\n%s", typesTS)
	}
	if strings.Contains(typesTS, "return options as BodyThing;") {
		t.Fatalf("types output rendered default factory instead of structured create body:\n%s", typesTS)
	}
}

func TestBuildBindingsIncludesAdditionalDeclarations(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		constDeclaration("GeneratedSupport", true, `"ok"`),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, `export const GeneratedSupport = "ok";`) {
		t.Fatalf("types output missing additional declaration:\n%s", bindings.TypesTS)
	}
}

func TestBuildBindingsRendersStructuredHelperDeclarations(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		localAliasDeclaration("LocalThing", "<T>", "{ value: T }"),
		functionDeclaration(
			"computeThing",
			false,
			"string",
			"  return value.toUpperCase();",
			TypeProperty{Name: "value", TypeExpr: "string"},
		),
		constDeclaration(
			"ExampleSchema",
			true,
			`{
  ok: true,
}`,
		),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"type LocalThing<T> = { value: T };",
		"function computeThing(",
		"return value.toUpperCase();",
		"export const ExampleSchema = {",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("types output missing structured helper declaration %q:\n%s", snippet, bindings.TypesTS)
		}
	}
}

func TestBuildBindingsRendersFunctionParamDefaults(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings(nil, nil, nil, []TypeDeclaration{
		exportedFunctionDeclaration(
			"createThing",
			"Thing",
			`  return options;`,
			TypeProperty{Name: "options", TypeExpr: "Thing", DefaultValue: "{} as Thing"},
			TypeProperty{Name: "overrides", TypeExpr: "Partial<Thing>", Optional: true},
		),
	})
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, "options: Thing = {} as Thing,") {
		t.Fatalf("types output missing defaulted function param:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "overrides?: Partial<Thing>,") {
		t.Fatalf("types output missing optional function param:\n%s", bindings.TypesTS)
	}
}

func TestBuildBindingsIncludesSharedFactoryHelpers(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	if !strings.Contains(bindings.TypesTS, "function mergeGeneratedOptions<T extends object>(") {
		t.Fatalf("types output missing shared merge helper:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "function resolveGeneratedFactoryInputs<") {
		t.Fatalf("types output missing shared factory-resolution helper:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "function createGeneratedBaseSectionDefaults(): {") {
		t.Fatalf("types output missing shared project-state base defaults helper:\n%s", bindings.TypesTS)
	}
	if !strings.Contains(bindings.TypesTS, "export type ImplArgsBundleMap = {") {
		t.Fatalf("types output missing project-state impl args alias:\n%s", bindings.TypesTS)
	}
	if strings.Contains(bindings.TypesTS, "type ImplArgsBundleWithUpdaters<") {
		t.Fatalf("types output still emits raw impl args helper alias:\n%s", bindings.TypesTS)
	}
}

func TestBuildBindingsIncludesProjectStateTypeGuardSupport(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	for _, snippet := range []string{
		"export const BaseChildlessCodeObjImplTypeSet = new Set<CodeObjType>([",
		"const BaseParentSectionImplTypeSet = new Set<SectionType>([",
		"export function isBaseParentSectionImpl(",
		"export function isBaseSectionWithParamsImpl(",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("types output missing project-state guard support %q:\n%s", snippet, bindings.TypesTS)
		}
	}
}

func TestProjectStateTypeGuardSupportUsesStructuredDeclarations(t *testing.T) {
	t.Helper()

	declarations := projectStateSupportDeclarations()
	seenSets := 0
	seenGuards := 0
	for _, declaration := range declarations {
		switch declaration.Kind {
		case "set":
			seenSets++
		case "type_guard":
			seenGuards++
		case "raw":
			if declaration.Name == "ProjectStateTypeGuardSupport" {
				t.Fatalf("project-state guard support still uses raw declaration")
			}
		}
	}

	if seenSets != len(projectStateTypeGuardTypeSets) {
		t.Fatalf("project-state set declaration count = %d, want %d", seenSets, len(projectStateTypeGuardTypeSets))
	}
	if seenGuards != len(projectStateTypeGuards) {
		t.Fatalf("project-state type-guard declaration count = %d, want %d", seenGuards, len(projectStateTypeGuards))
	}
}

func TestBuildBindingsIncludesWebsocketSchemaSupport(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	for _, snippet := range []string{
		"type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;",
		"function websocketSupportReadRevealTargets(",
		"export const UISettingRevealContentSchema = {",
		"export const DependencyEventSchema = {",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("types output missing websocket schema support %q:\n%s", snippet, bindings.TypesTS)
		}
	}
}

func TestWebsocketSchemaSupportUsesStructuredDeclarations(t *testing.T) {
	t.Helper()

	declarations := websocketSupportDeclarations()
	seenLocalAliases := 0
	seenFunctions := 0
	seenConsts := 0
	for _, declaration := range declarations {
		switch declaration.Kind {
		case "local_alias":
			seenLocalAliases++
		case "function":
			seenFunctions++
		case "const":
			seenConsts++
		case "raw":
			t.Fatalf("websocket schema support still uses raw declaration %q", declaration.Name)
		}
	}

	if seenLocalAliases != 3 {
		t.Fatalf("websocket local alias declaration count = %d, want 3", seenLocalAliases)
	}
	if seenFunctions != 6 {
		t.Fatalf("websocket function declaration count = %d, want 6", seenFunctions)
	}
	if seenConsts != 2 {
		t.Fatalf("websocket const declaration count = %d, want 2", seenConsts)
	}
}

func TestCurrentBuildInputsContainNoRawDeclarations(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, extraType := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(extraType); err != nil {
			t.Fatalf("AddRootType(%s) error = %v", extraType.String(), err)
		}
	}
	for _, spec := range CurrentEndpoints() {
		if err := converter.AddRootType(spec.RequestType); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", spec.RequestType, err)
		}
		if err := converter.AddRootType(spec.ResponseType); err != nil {
			t.Fatalf("AddRootType(%v) error = %v", spec.ResponseType, err)
		}
	}
	for _, declaration := range append(converter.Declarations(), CurrentAdditionalDeclarations()...) {
		if declaration.Kind == "raw" {
			t.Fatalf("build input still contains raw declaration %q", declaration.Name)
		}
	}
}

func TestCurrentBuildInputsUseUniqueDeclarationNames(t *testing.T) {
	t.Helper()

	converter := newTypeConverter()
	for _, extraType := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(extraType); err != nil {
			t.Fatalf("AddRootType(%s) error = %v", extraType.String(), err)
		}
	}
	for _, spec := range CurrentEndpoints() {
		if err := converter.AddRootType(spec.RequestType); err != nil {
			t.Fatalf("AddRootType(request %s) error = %v", spec.FunctionName, err)
		}
		if err := converter.AddRootType(spec.ResponseType); err != nil {
			t.Fatalf("AddRootType(response %s) error = %v", spec.FunctionName, err)
		}
	}

	declarations := append(converter.Declarations(), CurrentAdditionalDeclarations()...)
	if err := validateTypeDeclarations(declarations); err != nil {
		t.Fatalf("validateTypeDeclarations(...) error = %v", err)
	}
}

func TestBuildUsesStructuredDeclarationsForCurrentInputs(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	for _, marker := range []string{
		"ProjectStateFrontendSupport",
		"WebsocketFrontendSupport",
	} {
		if strings.Contains(bindings.TypesTS, marker) {
			t.Fatalf("types output still emits legacy marker %q:\n%s", marker, bindings.TypesTS)
		}
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
