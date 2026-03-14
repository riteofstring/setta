package frontendbindings

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
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

func TestBuildMatchesCheckedInFrontendBindings(t *testing.T) {
	t.Helper()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	formattedBindings := formatGeneratedBindingsForFrontend(t, bindings)
	repoRoot := testRepoRoot(t)
	for _, fixture := range []struct {
		path     string
		contents string
	}{
		{
			path:     "frontend/src/utils/generatedRoutes.ts",
			contents: formattedBindings.RoutesTS,
		},
		{
			path:     "frontend/src/utils/generatedTypes.ts",
			contents: formattedBindings.TypesTS,
		},
		{
			path:     "frontend/src/utils/generatedEndpoints.ts",
			contents: formattedBindings.EndpointsTS,
		},
	} {
		actualContents, err := os.ReadFile(filepath.Join(repoRoot, fixture.path))
		if err != nil {
			t.Fatalf("read %s: %v", fixture.path, err)
		}
		if string(actualContents) != fixture.contents {
			t.Fatalf("%s does not match the canonical formatted generator output; run `pnpm -C frontend generate-go-frontend-bindings`", fixture.path)
		}
	}
}

func formatGeneratedBindingsForFrontend(t *testing.T, bindings GeneratedBindings) GeneratedBindings {
	t.Helper()

	tempDir := t.TempDir()
	routesPath := filepath.Join(tempDir, "generatedRoutes.ts")
	typesPath := filepath.Join(tempDir, "generatedTypes.ts")
	endpointsPath := filepath.Join(tempDir, "generatedEndpoints.ts")
	writeTestFile(t, routesPath, bindings.RoutesTS)
	writeTestFile(t, typesPath, bindings.TypesTS)
	writeTestFile(t, endpointsPath, bindings.EndpointsTS)

	cmd := exec.Command(
		"pnpm",
		"-C",
		"frontend",
		"exec",
		"prettier",
		routesPath,
		typesPath,
		endpointsPath,
		"--write",
	)
	cmd.Dir = testRepoRoot(t)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("prettier generated bindings: %v\n%s", err, string(output))
	}

	formattedRoutes, err := os.ReadFile(routesPath)
	if err != nil {
		t.Fatalf("read %s: %v", routesPath, err)
	}
	formattedTypes, err := os.ReadFile(typesPath)
	if err != nil {
		t.Fatalf("read %s: %v", typesPath, err)
	}
	formattedEndpoints, err := os.ReadFile(endpointsPath)
	if err != nil {
		t.Fatalf("read %s: %v", endpointsPath, err)
	}
	return GeneratedBindings{
		RoutesTS:    string(formattedRoutes),
		TypesTS:     string(formattedTypes),
		EndpointsTS: string(formattedEndpoints),
	}
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

func TestRenderTemplateRejectsMissingKeys(t *testing.T) {
	t.Helper()

	_, err := renderTemplate(`{{ .Missing }}`, map[string]any{
		"Present": "ok",
	})
	if err == nil {
		t.Fatalf("renderTemplate(...) unexpectedly succeeded")
	}
	if !strings.Contains(err.Error(), `map has no entry for key "Missing"`) {
		t.Fatalf("renderTemplate(...) error = %q, want missing-key failure", err.Error())
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

func TestBuildBindingsRendersPathParamAwareEndpoints(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:       "GoHTTPRoutes",
			HelperConstName: "GoHTTPRouteHelpers",
			Routes: []NamedRoute{
				{
					Name:     "getDeploymentThing",
					Path:     "/deployments/{deploymentName}/{version}",
					EnumName: "GET_DEPLOYMENT_THING",
				},
				{
					Name:     "saveDeploymentThing",
					Path:     "/deployments/{deploymentName}/{version}/save",
					EnumName: "SAVE_DEPLOYMENT_THING",
				},
			},
		},
	}, []EndpointSpec{
		{
			FunctionName:    "route_get_deployment_thing",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "getDeploymentThing",
			PathParamsType:  reflect.TypeOf(BuildTestRouteParams{}),
			ResponseType:    reflect.TypeOf(BuildTestResponse{}),
		},
		{
			FunctionName:    "route_save_deployment_thing",
			Method:          "POST",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "saveDeploymentThing",
			PathParamsType:  reflect.TypeOf(BuildTestRouteParams{}),
			RequestType:     reflect.TypeOf(BuildTestRequest{}),
			ResponseType:    reflect.TypeOf(BuildTestResponse{}),
		},
	}, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"export async function route_get_deployment_thing(deploymentName: string, version: string): Promise<ResponseDataAndStatus<gt.BuildTestResponse>> {",
		"return await get(GoHTTPRouteHelpers.getDeploymentThing(deploymentName, version));",
		"export async function route_save_deployment_thing(deploymentName: string, version: string, x: gt.BuildTestRequest): Promise<ResponseDataAndStatus<gt.BuildTestResponse>> {",
		"return await post(GoHTTPRouteHelpers.saveDeploymentThing(deploymentName, version), x);",
	} {
		if !strings.Contains(bindings.EndpointsTS, snippet) {
			t.Fatalf("generated endpoints output missing %q:\n%s", snippet, bindings.EndpointsTS)
		}
	}
}

func TestBuildBindingsRendersRequestBackedGETPathParams(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:       "GoHTTPRoutes",
			HelperConstName: "GoHTTPRouteHelpers",
			Routes: []NamedRoute{
				{
					Name:     "binaryDownload",
					Path:     "/binary/{contentId}",
					EnumName: "BINARY_DOWNLOAD",
				},
			},
		},
	}, []EndpointSpec{
		{
			FunctionName:    "route_binary_download",
			Method:          "GET",
			RouteCollection: "GoHTTPRoutes",
			RouteName:       "binaryDownload",
			RequestType:     reflect.TypeOf(BuildTestDownloadRequest{}),
			ResponseType:    reflect.TypeOf(BuildTestResponse{}),
			BinaryResponse:  true,
		},
	}, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"function omitGeneratedRouteParams<T extends object>(",
		"export async function route_binary_download(x: gt.BuildTestDownloadRequest): Promise<ResponseDataAndStatus<gt.BuildTestResponse>> {",
		`return await getBinary(GoHTTPRouteHelpers.binaryDownload(x.contentId), omitGeneratedRouteParams(x, ["contentId"]));`,
	} {
		if !strings.Contains(bindings.EndpointsTS, snippet) {
			t.Fatalf("generated endpoints output missing %q:\n%s", snippet, bindings.EndpointsTS)
		}
	}
}

func TestBuildBindingsRendersRouteHelperCollections(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:       "GoWebsocketRoutes",
			HelperConstName: "GoWebsocketRouteHelpers",
			Routes: []NamedRoute{
				{
					Name:     "frontend",
					Path:     "/ws/frontend",
					EnumName: "WEBSOCKET_FRONTEND",
				},
				{
					Name:     "listenerById",
					Path:     "/ws/listeners/{listenerID}",
					EnumName: "WEBSOCKET_LISTENER_BY_ID",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		"export const GoWebsocketRouteHelpers = {",
		"frontend(): string {",
		"return GoWebsocketRoutes.frontend;",
		"listenerById(listenerID: string): string {",
		"return replaceGeneratedRoutePathParams(GoWebsocketRoutes.listenerById, { listenerID });",
	} {
		if !strings.Contains(bindings.RoutesTS, snippet) {
			t.Fatalf("generated routes output missing %q:\n%s", snippet, bindings.RoutesTS)
		}
	}
}

func TestBuildBindingsCanLimitRouteHelpersToPathParamRoutes(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:            "GoHTTPRoutes",
			HelperConstName:      "GoHTTPRouteHelpers",
			HelperOnlyPathParams: true,
			Routes: []NamedRoute{
				{
					Name:     "loadThing",
					Path:     "/things",
					EnumName: "LOAD_THING",
				},
				{
					Name:     "loadThingByID",
					Path:     "/things/{thingId}",
					EnumName: "LOAD_THING_BY_ID",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(bindings.RoutesTS, "export const GoHTTPRouteHelpers = {") {
		t.Fatalf("generated routes output missing GoHTTPRouteHelpers:\n%s", bindings.RoutesTS)
	}
	if strings.Contains(bindings.RoutesTS, "loadThing(): string") {
		t.Fatalf("generated routes output unexpectedly rendered helper for non-path route:\n%s", bindings.RoutesTS)
	}
	if !strings.Contains(bindings.RoutesTS, "loadThingByID(thingId: string): string {") {
		t.Fatalf("generated routes output missing path-param helper:\n%s", bindings.RoutesTS)
	}
}

func TestBuildBindingsRendersTailPathRouteHelpers(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName:            "GoHTTPRoutes",
			HelperConstName:      "GoHTTPRouteHelpers",
			HelperOnlyPathParams: true,
			Routes: []NamedRoute{
				{
					Name:     "pluginsBackendRoute",
					Path:     "/plugins/{pluginId}{routePath}",
					EnumName: "PLUGINS_BACKEND_ROUTE",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	if !strings.Contains(
		bindings.RoutesTS,
		"pluginsBackendRoute(pluginId: string, routePath: string): string {",
	) {
		t.Fatalf("generated routes output missing tail-path helper:\n%s", bindings.RoutesTS)
	}
	if !strings.Contains(bindings.RoutesTS, "GoHTTPRoutes.pluginsBackendRoute") {
		t.Fatalf("generated routes output missing pluginsBackendRoute constant usage:\n%s", bindings.RoutesTS)
	}
}

func TestBuildBindingsEscapesRoutePathsInGeneratedRoutes(t *testing.T) {
	t.Helper()

	bindings, err := buildBindings([]RouteGroup{
		{
			ConstName: "GoHTTPRoutes",
			Routes: []NamedRoute{
				{
					Name:     "saveThing",
					Path:     "/status/\"quoted\"\nnext\\slash",
					EnumName: "SAVE_THING",
				},
			},
		},
	}, nil, nil, nil)
	if err != nil {
		t.Fatalf("buildBindings(...) error = %v", err)
	}

	for _, snippet := range []string{
		`saveThing: "/status/\"quoted\"\nnext\\slash",`,
		`SAVE_THING: "/status/\"quoted\"\nnext\\slash",`,
	} {
		if !strings.Contains(bindings.RoutesTS, snippet) {
			t.Fatalf("routes output missing escaped route path %q:\n%s", snippet, bindings.RoutesTS)
		}
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

func TestCurrentBuildInputsPassDeclarationValidation(t *testing.T) {
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
