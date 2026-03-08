package frontendbindings

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"
)

type BuildTestRequest struct {
	Name string `json:"name"`
}

type BuildTestResponse struct {
	Ok bool `json:"ok"`
}

type ConverterOptionalExample struct {
	Name   string          `json:"name"`
	Count  *int            `json:"count,omitempty"`
	Labels map[string]bool `json:"labels"`
	When   time.Time       `json:"when"`
}

type ConverterUnsupportedExample struct {
	Channel chan int `json:"channel"`
}

func TestBuildBindingsRejectsInvalidEndpointSpecs(t *testing.T) {
	routeGroups := []RouteGroup{
		{
			ConstName: "GoHTTPRoutes",
			Routes: []NamedRoute{
				{
					Name:     "saveThing",
					Path:     "/saveThing",
					EnumName: "SAVE_THING",
				},
			},
		},
	}

	tests := []struct {
		name string
		spec EndpointSpec
		want string
	}{
		{
			name: "unknown route reference",
			spec: EndpointSpec{
				FunctionName:    "route_save_thing",
				Method:          "POST",
				RouteCollection: "GoHTTPRoutes",
				RouteName:       "missingRoute",
				RequestType:     reflect.TypeOf(BuildTestRequest{}),
				ResponseType:    reflect.TypeOf(BuildTestResponse{}),
			},
			want: "route GoHTTPRoutes.missingRoute is not defined",
		},
		{
			name: "unnamed request type",
			spec: EndpointSpec{
				FunctionName:    "route_save_thing",
				Method:          "POST",
				RouteCollection: "GoHTTPRoutes",
				RouteName:       "saveThing",
				RequestType:     reflect.TypeOf(map[string]string{}),
				ResponseType:    reflect.TypeOf(BuildTestResponse{}),
			},
			want: "request type must be a named Go type",
		},
		{
			name: "unnamed response type",
			spec: EndpointSpec{
				FunctionName:    "route_save_thing",
				Method:          "POST",
				RouteCollection: "GoHTTPRoutes",
				RouteName:       "saveThing",
				RequestType:     reflect.TypeOf(BuildTestRequest{}),
				ResponseType: reflect.TypeOf(struct {
					Ok bool `json:"ok"`
				}{}),
			},
			want: "response type must be a named Go type",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := buildBindings(routeGroups, []EndpointSpec{tt.spec}, nil)
			if err == nil {
				t.Fatalf("buildBindings(...) unexpectedly succeeded")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("buildBindings(...) error = %q, want substring %q", err.Error(), tt.want)
			}
		})
	}
}

func TestCurrentEndpointsUseUniqueFunctionsAndRoutes(t *testing.T) {
	functionNames := make(map[string]EndpointSpec, len(CurrentEndpoints()))
	routeMethods := make(map[string]EndpointSpec, len(CurrentEndpoints()))

	for _, spec := range CurrentEndpoints() {
		if previous, exists := functionNames[spec.FunctionName]; exists {
			t.Fatalf(
				"duplicate endpoint function %q for %s %s.%s and %s %s.%s",
				spec.FunctionName,
				previous.Method,
				previous.RouteCollection,
				previous.RouteName,
				spec.Method,
				spec.RouteCollection,
				spec.RouteName,
			)
		}
		functionNames[spec.FunctionName] = spec

		routeMethodKey := spec.Method + " " + spec.RouteCollection + "." + spec.RouteName
		if previous, exists := routeMethods[routeMethodKey]; exists {
			t.Fatalf(
				"duplicate endpoint route binding %q for %s and %s",
				routeMethodKey,
				previous.FunctionName,
				spec.FunctionName,
			)
		}
		routeMethods[routeMethodKey] = spec
	}
}

func TestCurrentRouteGroupsClassifyEveryConvertedRoute(t *testing.T) {
	expectedRouteOnly := map[string]map[string]struct{}{
		"GoRoutePrefixes": {
			"api": {},
		},
		"GoRootRoutes": {
			"bootstrapPage":    {},
			"bootstrapConsume": {},
			"toolsCall":        {},
		},
		"GoHTTPRoutes": {},
		"GoWebsocketRoutes": {
			"frontend":          {},
			"listenerById":      {},
			"terminalBySection": {},
		},
	}

	endpointRoutes := make(map[string]map[string]struct{})
	for _, spec := range CurrentEndpoints() {
		if _, exists := endpointRoutes[spec.RouteCollection]; !exists {
			endpointRoutes[spec.RouteCollection] = map[string]struct{}{}
		}
		endpointRoutes[spec.RouteCollection][spec.RouteName] = struct{}{}
	}

	for _, group := range CurrentRouteGroups() {
		groupEndpointRoutes := endpointRoutes[group.ConstName]
		groupRouteOnly, exists := expectedRouteOnly[group.ConstName]
		if !exists {
			t.Fatalf("missing expected route classification bucket for %q", group.ConstName)
		}

		routeNames := make(map[string]struct{}, len(group.Routes))
		unclassified := make([]string, 0)
		for _, route := range group.Routes {
			routeNames[route.Name] = struct{}{}
			_, endpointBacked := groupEndpointRoutes[route.Name]
			_, routeOnly := groupRouteOnly[route.Name]
			if endpointBacked && routeOnly {
				t.Fatalf("route %s.%s is marked as both endpoint-backed and route-only", group.ConstName, route.Name)
			}
			if endpointBacked || routeOnly {
				continue
			}
			unclassified = append(unclassified, route.Name)
		}

		if len(unclassified) > 0 {
			t.Fatalf("route group %s has unclassified converted routes: %v", group.ConstName, unclassified)
		}

		for routeName := range groupRouteOnly {
			if _, exists := routeNames[routeName]; !exists {
				t.Fatalf("route group %s marks missing route-only entry %q", group.ConstName, routeName)
			}
		}
	}
}

func TestCurrentEndpointContractManifest(t *testing.T) {
	t.Helper()

	assertGoldenFile(t, "endpoint_contract_manifest.txt", renderEndpointContractManifest(CurrentEndpoints()))
}

func TestBuildGeneratedBindingsTypeScriptCompile(t *testing.T) {
	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	tempDir := t.TempDir()
	writeTestFile(t, filepath.Join(tempDir, "generatedRoutes.ts"), bindings.RoutesTS)
	writeTestFile(t, filepath.Join(tempDir, "generatedTypes.ts"), bindings.TypesTS)
	writeTestFile(t, filepath.Join(tempDir, "generatedEndpoints.ts"), bindings.EndpointsTS)
	writeTestFile(t, filepath.Join(tempDir, "endpointUtils.ts"), `
export type ResponseDataAndStatus<T> = {
  data: T | undefined;
  status: number | undefined;
  hasResponse: boolean;
};

async function emptyResponse<T>(): Promise<ResponseDataAndStatus<T>> {
  return { data: undefined, status: undefined, hasResponse: false };
}

export async function get<T>(
  _address: string,
  _params?: unknown,
): Promise<ResponseDataAndStatus<T>> {
  return await emptyResponse<T>();
}

export async function getBinary<T>(
  _address: string,
  _params?: unknown,
): Promise<ResponseDataAndStatus<T>> {
  return await emptyResponse<T>();
}

export async function post<T>(
  _address: string,
  _payload: unknown,
): Promise<ResponseDataAndStatus<T>> {
  return await emptyResponse<T>();
}
`)
	writeTestFile(t, filepath.Join(tempDir, "idNameCreation.ts"), `
export function createRandomName(): string {
  return "name";
}

export function createJsonArtifactId(): string {
  return "artifacts/test.json";
}

export function createCsvArtifactId(): string {
  return "artifacts/test.csv";
}

export function createPngArtifactId(): string {
  return "artifacts/test.png";
}

export function createFileArtifactId(_extension?: string): string {
  return "artifacts/test.bin";
}
`)
	writeTestFile(t, filepath.Join(tempDir, "tsconfig.json"), `{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "lib": ["dom", "esnext"],
    "strict": true,
    "moduleResolution": "node",
    "skipLibCheck": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true
  },
  "include": ["*.ts"]
}`)

	repoRoot := testRepoRoot(t)
	cmd := exec.Command(
		"pnpm",
		"-C",
		"frontend",
		"exec",
		"tsc",
		"--pretty",
		"false",
		"--project",
		filepath.Join(tempDir, "tsconfig.json"),
	)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("generated TypeScript failed to compile: %v\n%s", err, string(output))
	}
}

func TestTypeConverterRendersStringEnums(t *testing.T) {
	converter := newTypeConverter()
	if err := converter.AddRootType(reflect.TypeOf(ServerMode(""))); err != nil {
		t.Fatalf("AddRootType(ServerMode) error = %v", err)
	}

	declaration := requireDeclaration(t, converter.Declarations(), "ServerMode")
	if declaration.Kind != "enum" {
		t.Fatalf("ServerMode declaration kind = %q, want %q", declaration.Kind, "enum")
	}

	expected := []EnumValue{
		{Name: "IDE", Value: "ide"},
		{Name: "Share", Value: "share"},
		{Name: "App", Value: "app"},
		{Name: "Launcher", Value: "launcher"},
	}
	if !reflect.DeepEqual(declaration.EnumValues, expected) {
		t.Fatalf("ServerMode enum values = %#v, want %#v", declaration.EnumValues, expected)
	}
}

func TestTypeConverterRendersOptionalFieldsMapsAndTime(t *testing.T) {
	converter := newTypeConverter()
	if err := converter.AddRootType(reflect.TypeOf(ConverterOptionalExample{})); err != nil {
		t.Fatalf("AddRootType(ConverterOptionalExample) error = %v", err)
	}

	declaration := requireDeclaration(t, converter.Declarations(), "ConverterOptionalExample")
	if declaration.Kind != "object" {
		t.Fatalf("ConverterOptionalExample declaration kind = %q, want %q", declaration.Kind, "object")
	}

	expected := []TypeProperty{
		{Name: "name", TypeExpr: "string", Optional: false},
		{Name: "count", TypeExpr: "number | null", Optional: true},
		{Name: "labels", TypeExpr: "Record<string, boolean>", Optional: false},
		{Name: "when", TypeExpr: "string", Optional: false},
	}
	if !reflect.DeepEqual(declaration.Properties, expected) {
		t.Fatalf("ConverterOptionalExample properties = %#v, want %#v", declaration.Properties, expected)
	}
}

func TestProjectStateRequestContractsUseConverterObjects(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
		{
			name: "SetSectionParamFilterRequestInput",
			root: reflect.TypeOf(SetSectionParamFilterRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "CreateChildSectionsRequestInput",
			root: reflect.TypeOf(CreateChildSectionsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "parentId", TypeExpr: "string", Optional: false},
				{Name: "implType", TypeExpr: "SectionType", Optional: false},
				{Name: "numChildren", TypeExpr: "number", Optional: false},
				{Name: "startIdx", TypeExpr: "number | null", Optional: true},
			},
		},
		{
			name: "CreateChildSectionsViaIncrementerRequestInput",
			root: reflect.TypeOf(CreateChildSectionsViaIncrementerRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "calledBy", TypeExpr: "string", Optional: false},
				{Name: "implType", TypeExpr: "SectionType", Optional: false},
				{Name: "numChildren", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "DeleteChildSectionsViaDecrementerRequestInput",
			root: reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "calledBy", TypeExpr: "string", Optional: false},
				{Name: "numChildren", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "CreateEdgeRequestInput",
			root: reflect.TypeOf(CreateEdgeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "sourceVariantId", TypeExpr: "string", Optional: false},
				{Name: "sourcePortId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetVariantId", TypeExpr: "string", Optional: false},
				{Name: "targetPortId", TypeExpr: "string", Optional: false},
				{Name: "type", TypeExpr: "string", Optional: true},
				{Name: "label", TypeExpr: "string | null", Optional: true},
				{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				{Name: "animated", TypeExpr: "boolean", Optional: true},
				{Name: "hidden", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "data", TypeExpr: "Record<string, unknown> | null", Optional: true},
			},
		},
		{
			name: "UpdateEdgeRequestInput",
			root: reflect.TypeOf(UpdateEdgeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edge", TypeExpr: "Edge", Optional: false},
			},
		},
		{
			name: "DeleteEdgesRequestInput",
			root: reflect.TypeOf(DeleteEdgesRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edgeIds", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "ReconnectEdgeRequestInput",
			root: reflect.TypeOf(ReconnectEdgeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edgeId", TypeExpr: "string", Optional: false},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "sourceVariantId", TypeExpr: "string", Optional: false},
				{Name: "sourcePortId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetVariantId", TypeExpr: "string", Optional: false},
				{Name: "targetPortId", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "SetEdgesRequestInput",
			root: reflect.TypeOf(SetEdgesRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edges", TypeExpr: "Array<Edge>", Optional: false},
			},
		},
		{
			name: "CreateAgenticEdgeRequestInput",
			root: reflect.TypeOf(CreateAgenticEdgeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "kind", TypeExpr: "AgenticEdgeKind", Optional: false},
				{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				{Name: "hidden", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
			},
		},
		{
			name: "UpdateAgenticEdgeRequestInput",
			root: reflect.TypeOf(UpdateAgenticEdgeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edge", TypeExpr: "AgenticEdge", Optional: false},
			},
		},
		{
			name: "DeleteAgenticEdgesRequestInput",
			root: reflect.TypeOf(DeleteAgenticEdgesRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edgeIds", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "SetAgenticEdgesRequestInput",
			root: reflect.TypeOf(SetAgenticEdgesRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "edges", TypeExpr: "Array<AgenticEdge>", Optional: false},
			},
		},
		{
			name: "PrepareSectionsForCopyRequestInput",
			root: reflect.TypeOf(PrepareSectionsForCopyRequestInput{}),
			properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionIds", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "PasteSectionsRequestInput",
			root: reflect.TypeOf(PasteSectionsRequestInput{}),
			properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap", Optional: false},
				{Name: "position", TypeExpr: "Position", Optional: false},
				{Name: "asRef", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "MoveSectionsRequestInput",
			root: reflect.TypeOf(MoveSectionsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionIds", TypeExpr: "Array<string>", Optional: false},
				{Name: "newParentId", TypeExpr: "string | null", Optional: false},
				{Name: "newIndex", TypeExpr: "number | null", Optional: false},
				{Name: "positionsById", TypeExpr: "Record<string, Position> | null", Optional: false},
			},
		},
		{
			name: "SetSectionSizesRequestInput",
			root: reflect.TypeOf(SetSectionSizesRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionSizes", TypeExpr: "Record<string, SectionSize>", Optional: false},
			},
		},
		{
			name: "SetMetaControlShowSectionTitleRequestInput",
			root: reflect.TypeOf(SetMetaControlShowSectionTitleRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "showSectionTitle", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SetSectionColumnWidthRequestInput",
			root: reflect.TypeOf(SetSectionColumnWidthRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
			},
		},
		{
			name: "SetSectionEdgeInputsRequestInput",
			root: reflect.TypeOf(SetSectionEdgeInputsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "ToggleGroupOrientationRequestInput",
			root: reflect.TypeOf(ToggleGroupOrientationRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "SetGroupOverflowModeRequestInput",
			root: reflect.TypeOf(SetGroupOverflowModeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "overflowMode", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SetBrowserColumnWidthsRequestInput",
			root: reflect.TypeOf(SetBrowserColumnWidthsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "typesColumnWidth", TypeExpr: "number | null", Optional: false},
			},
		},
		{
			name: "SetBrowserHideColumnRequestInput",
			root: reflect.TypeOf(SetBrowserHideColumnRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "hideColumn", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SetSectionEdgeOutputsRequestInput",
			root: reflect.TypeOf(SetSectionEdgeOutputsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: false},
			},
		},
		{
			name: "SetParentDefaultChildSectionTypeRequestInput",
			root: reflect.TypeOf(SetParentDefaultChildSectionTypeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: false},
			},
		},
		{
			name: "SetListRootViewModeRequestInput",
			root: reflect.TypeOf(SetListRootViewModeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: false},
			},
		},
		{
			name: "SetBrowserAreaViewModeRequestInput",
			root: reflect.TypeOf(SetBrowserAreaViewModeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "viewMode", TypeExpr: "BrowserAreaViewMode", Optional: false},
			},
		},
		{
			name: "SetBrowserSavedSearchesRequestInput",
			root: reflect.TypeOf(SetBrowserSavedSearchesRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>", Optional: false},
			},
		},
		{
			name: "SetSpreadsheetFilePathRequestInput",
			root: reflect.TypeOf(SetSpreadsheetFilePathRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "filePath", TypeExpr: "string", Optional: false},
				{Name: "activeSheet", TypeExpr: "string | null", Optional: false},
			},
		},
		{
			name: "SetSpreadsheetSectionSettingsRequestInput",
			root: reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "readOnly", TypeExpr: "boolean", Optional: false},
				{Name: "showRowNumbers", TypeExpr: "boolean", Optional: false},
				{Name: "density", TypeExpr: "SpreadsheetGridDensity", Optional: false},
				{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SetTaskBoardSectionStateRequestInput",
			root: reflect.TypeOf(SetTaskBoardSectionStateRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "viewMode", TypeExpr: "TaskBoardViewMode", Optional: false},
				{Name: "columns", TypeExpr: "Array<TaskBoardColumn>", Optional: false},
				{Name: "tasks", TypeExpr: "Array<TaskBoardTask>", Optional: false},
			},
		},
		{
			name: "SetImageAreaImagePathRequestInput",
			root: reflect.TypeOf(SetImageAreaImagePathRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "imagePath", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "SetSocialURLRequestInput",
			root: reflect.TypeOf(SetSocialURLRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "url", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "AppendDrawAreaLayerItemRequestInput",
			root: reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "layerIdx", TypeExpr: "number", Optional: false},
				{Name: "element", TypeExpr: "DrawAreaLayerItem", Optional: false},
			},
		},
		{
			name: "SetChartAreaDataPathRequestInput",
			root: reflect.TypeOf(SetChartAreaDataPathRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "dataPath", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "SetChartTypeRequestInput",
			root: reflect.TypeOf(SetChartTypeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "chartType", TypeExpr: "ChartType", Optional: false},
			},
		},
		{
			name: "SetChartSettingsRequestInput",
			root: reflect.TypeOf(SetChartSettingsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: false},
				{Name: "changedSettings", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "SetTextBlockTextRequestInput",
			root: reflect.TypeOf(SetTextBlockTextRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "SetTextBlockDisplayModeRequestInput",
			root: reflect.TypeOf(SetTextBlockDisplayModeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode", Optional: false},
			},
		},
		{
			name: "SetTextBlockFormatRequestInput",
			root: reflect.TypeOf(SetTextBlockFormatRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "format", TypeExpr: "TextBlockFormat", Optional: false},
			},
		},
		{
			name: "SetTextBlockHeadingAsSectionNameRequestInput",
			root: reflect.TypeOf(SetTextBlockHeadingAsSectionNameRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "headingAsSectionName", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SetTextBlockMetaControlStyleRequestInput",
			root: reflect.TypeOf(SetTextBlockMetaControlStyleRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "metaControlStyle", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SetTextBlockMasterFontSizeRequestInput",
			root: reflect.TypeOf(SetTextBlockMasterFontSizeRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "masterFontSizePx", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "SetCodeFileBindingRequestInput",
			root: reflect.TypeOf(SetCodeFileBindingRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "binding", TypeExpr: "CodeFileBindingUpdate", Optional: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "object")
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
		})
	}
}

func TestAIRequestContractsUseConverterObjects(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
		{
			name: "UpdateAgentProfileRequestInput",
			root: reflect.TypeOf(UpdateAgentProfileRequestInput{}),
			properties: []TypeProperty{
				{Name: "profile", TypeExpr: "AgentProfile", Optional: false},
			},
		},
		{
			name: "UpdateEngineConfigRequestInput",
			root: reflect.TypeOf(UpdateEngineConfigRequestInput{}),
			properties: []TypeProperty{
				{Name: "config", TypeExpr: "EngineConfig", Optional: false},
			},
		},
		{
			name: "CreateTranscriptionProfileRequestInput",
			root: reflect.TypeOf(CreateTranscriptionProfileRequestInput{}),
			properties: []TypeProperty{
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "transcriptionLlmConfigId", TypeExpr: "string", Optional: false},
				{Name: "transportMode", TypeExpr: "TranscriptionTransportMode", Optional: false},
				{Name: "chunkMs", TypeExpr: "number", Optional: false},
				{Name: "language", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "UpdateTranscriptionProfileRequestInput",
			root: reflect.TypeOf(UpdateTranscriptionProfileRequestInput{}),
			properties: []TypeProperty{
				{Name: "profile", TypeExpr: "TranscriptionProfile", Optional: false},
			},
		},
		{
			name: "SetChatSectionStateRequestInput",
			root: reflect.TypeOf(SetChatSectionStateRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "state", TypeExpr: "ChatSectionState", Optional: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "object")
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
		})
	}
}

func TestAIResponseContractsUseConverterObjects(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
		{
			name: "GetLLMChatResponse",
			root: reflect.TypeOf(GetLLMChatResponse{}),
			properties: []TypeProperty{
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: false},
				{Name: "llmConfig", TypeExpr: "LLMConfig | null", Optional: true},
				{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
			},
		},
		{
			name: "ExternalAgentChatResponse",
			root: reflect.TypeOf(ExternalAgentChatResponse{}),
			properties: []TypeProperty{
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: false},
				{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "object")
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
		})
	}
}

func TestPluginRuntimeContractsUseConverterObjects(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
		{
			name: "PluginListEntry",
			root: reflect.TypeOf(PluginListEntry{}),
			properties: []TypeProperty{
				{Name: "pluginId", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "version", TypeExpr: "string", Optional: false},
				{Name: "sourceScope", TypeExpr: "PluginScope", Optional: false},
				{Name: "sourceScopeLabel", TypeExpr: "string", Optional: false},
				{Name: "sourceManager", TypeExpr: "PluginSourceManager", Optional: false},
				{Name: "sourceManagerHint", TypeExpr: "string | null", Optional: false},
				{Name: "canonicalSourceKey", TypeExpr: "string", Optional: false},
				{Name: "sourceDigestSha256", TypeExpr: "string | null", Optional: false},
				{Name: "frontend", TypeExpr: "PluginFrontendDescriptor", Optional: false},
				{Name: "content", TypeExpr: "PluginContentDescriptor", Optional: false},
				{Name: "config", TypeExpr: "PluginConfigDescriptor", Optional: false},
				{Name: "effectiveCapabilities", TypeExpr: "Array<string>", Optional: false},
				{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null", Optional: false},
				{Name: "restartRequired", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "PluginStatusEntry",
			root: reflect.TypeOf(PluginStatusEntry{}),
			properties: []TypeProperty{
				{Name: "pluginId", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "version", TypeExpr: "string", Optional: false},
				{Name: "state", TypeExpr: "PluginRuntimeState", Optional: false},
				{Name: "sourceScope", TypeExpr: "PluginScope", Optional: false},
				{Name: "sourceScopeLabel", TypeExpr: "string", Optional: false},
				{Name: "sourceManager", TypeExpr: "PluginSourceManager", Optional: false},
				{Name: "sourceManagerHint", TypeExpr: "string | null", Optional: false},
				{Name: "sourcePath", TypeExpr: "string", Optional: false},
				{Name: "canonicalSourceKey", TypeExpr: "string", Optional: false},
				{Name: "sourceDigestSha256", TypeExpr: "string | null", Optional: false},
				{Name: "shadowedBySourcePath", TypeExpr: "string | null", Optional: false},
				{Name: "requestedCapabilities", TypeExpr: "Array<string>", Optional: false},
				{Name: "effectiveCapabilities", TypeExpr: "Array<string>", Optional: false},
				{Name: "blockedCapabilities", TypeExpr: "Array<PluginBlockedCapability>", Optional: false},
				{Name: "registeredLanguageServers", TypeExpr: "Array<PluginRegisteredLanguageServer>", Optional: false},
				{Name: "registeredExternalAgentAdapters", TypeExpr: "Array<PluginRegisteredExternalAgentAdapter>", Optional: false},
				{Name: "registeredCodegenTargets", TypeExpr: "Array<PluginRegisteredCodegenTarget>", Optional: false},
				{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null", Optional: false},
				{Name: "restartRequired", TypeExpr: "boolean", Optional: false},
				{Name: "runtimePayloadDigestSha256", TypeExpr: "string", Optional: false},
				{Name: "errors", TypeExpr: "Array<PluginErrorInfo>", Optional: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "object")
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
		})
	}
}

func TestArtifactSupportUsesConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
	}{
		{
			name:  "CanvasPoint",
			root:  reflect.TypeOf(CanvasPoint{}),
			kind:  "alias",
			alias: "[number, number]",
		},
		{
			name:  "DrawAreaTransform",
			root:  reflect.TypeOf(DrawAreaTransform{}),
			kind:  "alias",
			alias: "[number, number, number, number, number, number]",
		},
		{
			name: "BrushStroke",
			root: reflect.TypeOf(BrushStroke{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "strokeStyle", TypeExpr: "string", Optional: false},
				{Name: "lineWidth", TypeExpr: "number", Optional: false},
				{Name: "lineCap", TypeExpr: "DrawAreaBrushShape", Optional: false},
				{Name: "points", TypeExpr: `Array<CanvasPoint | "BREAK">`, Optional: false},
				{Name: "globalCompositeOperation", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "DrawAreaLayerItemTransform",
			root: reflect.TypeOf(DrawAreaLayerItemTransform{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "transform", TypeExpr: "DrawAreaTransform", Optional: false},
				{Name: "eraserStrokes", TypeExpr: "Array<BrushStrokeWithTransform>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "DrawAreaLayerItem",
			root: reflect.TypeOf(DrawAreaLayerItem{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke", Optional: false},
				{Name: "dataPath", TypeExpr: "string", Optional: false},
				{Name: "transformId", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "DrawAreaLayer",
			root: reflect.TypeOf(DrawAreaLayer{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "elements", TypeExpr: "Array<DrawAreaLayerItem>", Optional: false},
				{Name: "visible", TypeExpr: "boolean", Optional: false},
				{Name: "layerOpacity", TypeExpr: "number", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ImageArtifact",
			root: reflect.TypeOf(ImageArtifact{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.Image", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "BinaryContentRef", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "BrushStrokeArtifact",
			root: reflect.TypeOf(BrushStrokeArtifact{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.BrushStroke", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "BrushStroke", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "DrawAreaLayerItemTransformArtifact",
			root: reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.DrawAreaLayerItemTransform", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "DrawAreaLayerItemTransform", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name:  "ChartDataValue",
			root:  reflect.TypeOf(ChartDataValue{}),
			kind:  "alias",
			alias: "Record<string, Array<string | number>>",
		},
		{
			name: "ChartDataArtifact",
			root: reflect.TypeOf(ChartDataArtifact{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.ChartData", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "ChartDataValue", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "FileArtifact",
			root: reflect.TypeOf(FileArtifact{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ArtifactTypeEnum.File", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "BinaryContentRef", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name:  "ArtifactUnion",
			root:  reflect.TypeOf(ArtifactUnion{}),
			kind:  "alias",
			alias: "ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact",
		},
		{
			name: "UpdateArtifactMsgContent",
			root: reflect.TypeOf(UpdateArtifactMsgContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "artifacts", TypeExpr: "Array<ArtifactUnion>", Optional: false},
				{Name: "updateType", TypeExpr: `"update" | "delete"`, Optional: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != tt.kind {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, tt.kind)
			}
			if declaration.Alias != tt.alias {
				t.Fatalf("%s alias = %q, want %q", tt.name, declaration.Alias, tt.alias)
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
			if (declaration.CreateExpr != "") != tt.hasCreateExpr {
				t.Fatalf("%s CreateExpr presence = %t, want %t", tt.name, declaration.CreateExpr != "", tt.hasCreateExpr)
			}
		})
	}
}

func TestWebsocketSupportUsesConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		properties    []TypeProperty
		hasCreateExpr bool
	}{
		{
			name: "WebsocketConnectionInfo",
			root: reflect.TypeOf(WebsocketConnectionInfo{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "connectionType", TypeExpr: "WebsocketConnectionType", Optional: false},
				{Name: "currentAddress", TypeExpr: "string | null", Optional: false},
				{Name: "shareSessionId", TypeExpr: "string | null", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "WebsocketMsgCurrentAddressUpdate",
			root: reflect.TypeOf(WebsocketMsgCurrentAddressUpdate{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate", Optional: false},
				{Name: "content", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "object")
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
			if (declaration.CreateExpr != "") != tt.hasCreateExpr {
				t.Fatalf("%s CreateExpr presence = %t, want %t", tt.name, declaration.CreateExpr != "", tt.hasCreateExpr)
			}
		})
	}
}

func TestAIRuntimeSupportUsesConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		properties    []TypeProperty
		hasCreateExpr bool
	}{
		{
			name: "EngineConfigDefaults",
			root: reflect.TypeOf(EngineConfigDefaults{}),
			properties: []TypeProperty{
				{Name: "thinking", TypeExpr: "boolean | null", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name: "EngineConfig",
			root: reflect.TypeOf(EngineConfig{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "engineType", TypeExpr: "EngineType", Optional: false},
				{Name: "settaLlmConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "externalAgentConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "defaults", TypeExpr: "EngineConfigDefaults", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "AgentProfile",
			root: reflect.TypeOf(AgentProfile{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "description", TypeExpr: "string", Optional: false},
				{Name: "systemPrompt", TypeExpr: "string", Optional: false},
				{Name: "enableBackgroundSummaryFill", TypeExpr: "boolean", Optional: false},
				{Name: "enableLlmChatTitles", TypeExpr: "boolean", Optional: false},
				{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "toolAllowlist", TypeExpr: "Array<string>", Optional: false},
				{Name: "memoryScope", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "TranscriptionProfile",
			root: reflect.TypeOf(TranscriptionProfile{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "transcriptionLlmConfigId", TypeExpr: "string", Optional: false},
				{Name: "transportMode", TypeExpr: "TranscriptionTransportMode", Optional: false},
				{Name: "chunkMs", TypeExpr: "number", Optional: false},
				{Name: "supportsRealtimeTranscription", TypeExpr: "boolean", Optional: false},
				{Name: "language", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "RunEvent",
			root: reflect.TypeOf(RunEvent{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "timestamp", TypeExpr: "string", Optional: false},
				{Name: "type", TypeExpr: "string", Optional: false},
				{Name: "payload", TypeExpr: "Record<string, unknown>", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name: "AgentRun",
			root: reflect.TypeOf(AgentRun{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "profileId", TypeExpr: "string | null", Optional: true},
				{Name: "status", TypeExpr: "AgentRunStatus", Optional: false},
				{Name: "startedAt", TypeExpr: "string | null", Optional: true},
				{Name: "finishedAt", TypeExpr: "string | null", Optional: true},
				{Name: "inputs", TypeExpr: "Record<string, unknown> | null", Optional: true},
				{Name: "outputs", TypeExpr: "Record<string, unknown> | null", Optional: true},
				{Name: "toolCalls", TypeExpr: "Array<Record<string, unknown>>", Optional: false},
				{Name: "cost", TypeExpr: "number | null", Optional: true},
				{Name: "events", TypeExpr: "Array<RunEvent>", Optional: false},
			},
			hasCreateExpr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "object")
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
			if (declaration.CreateExpr != "") != tt.hasCreateExpr {
				t.Fatalf("%s CreateExpr presence = %t, want %t", tt.name, declaration.CreateExpr != "", tt.hasCreateExpr)
			}
		})
	}
}

func TestAIRuntimeStreamingEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "EngineType",
			root: reflect.TypeOf(EngineType("")),
			values: []EnumValue{
				{Name: "setta_llm", Value: "setta_llm"},
				{Name: "external_agent", Value: "external_agent"},
			},
		},
		{
			name: "TranscriptionTransportMode",
			root: reflect.TypeOf(TranscriptionTransportMode("")),
			values: []EnumValue{
				{Name: "auto", Value: "auto"},
				{Name: "file", Value: "file"},
				{Name: "realtime", Value: "realtime"},
			},
		},
		{
			name: "AgentRunStatus",
			root: reflect.TypeOf(AgentRunStatus("")),
			values: []EnumValue{
				{Name: "queued", Value: "queued"},
				{Name: "running", Value: "running"},
				{Name: "completed", Value: "completed"},
				{Name: "failed", Value: "failed"},
				{Name: "cancelled", Value: "cancelled"},
			},
		},
		{
			name: "StreamingEventType",
			root: reflect.TypeOf(StreamingEventType("")),
			values: []EnumValue{
				{Name: "MESSAGE_START", Value: "message_start"},
				{Name: "DELTA", Value: "delta"},
				{Name: "TOOL_CALL_DELTA", Value: "tool_call_delta"},
				{Name: "TOOL_ARGUMENT_PREVIEW_DELTA", Value: "tool_argument_preview_delta"},
				{Name: "TOOL_RESULT", Value: "tool_result"},
				{Name: "MESSAGE_STOP", Value: "message_stop"},
				{Name: "MESSAGE_FINALIZED", Value: "message_finalized"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "enum" {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, "enum")
			}
			if !reflect.DeepEqual(declaration.EnumValues, tt.values) {
				t.Fatalf("%s enum values = %#v, want %#v", tt.name, declaration.EnumValues, tt.values)
			}
		})
	}
}

func TestAIRuntimeStreamingContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		kind       string
		alias      string
		properties []TypeProperty
	}{
		{
			name:  "AgentRunList",
			root:  reflect.TypeOf(AgentRunList{}),
			kind:  "alias",
			alias: "Array<AgentRun>",
		},
		{
			name: "MessageTextDelta",
			root: reflect.TypeOf(MessageTextDelta{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"text_delta"`, Optional: false},
				{Name: "index", TypeExpr: "number", Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "MessageThinkingDelta",
			root: reflect.TypeOf(MessageThinkingDelta{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"thinking_delta"`, Optional: false},
				{Name: "index", TypeExpr: "number", Optional: false},
				{Name: "thinking", TypeExpr: "string", Optional: false},
				{Name: "summary", TypeExpr: "string | null", Optional: true},
				{Name: "signature", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name:  "MessageContentDelta",
			root:  reflect.TypeOf((*MessageContentDelta)(nil)).Elem(),
			kind:  "alias",
			alias: "MessageTextDelta | MessageThinkingDelta",
		},
		{
			name: "MessageStartEvent",
			root: reflect.TypeOf(MessageStartEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_START", Optional: false},
				{Name: "message", TypeExpr: "BaseChatMessageUnion", Optional: false},
			},
		},
		{
			name: "MessageDeltaEvent",
			root: reflect.TypeOf(MessageDeltaEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.DELTA", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContentDelta> | null", Optional: true},
			},
		},
		{
			name: "ToolCallDeltaEvent",
			root: reflect.TypeOf(ToolCallDeltaEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_CALL_DELTA", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
				{Name: "tool_call_id", TypeExpr: "string", Optional: false},
				{Name: "arguments_delta", TypeExpr: "string", Optional: false},
				{Name: "tool_name", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "ToolResultEvent",
			root: reflect.TypeOf(ToolResultEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_RESULT", Optional: false},
				{Name: "result", TypeExpr: "ToolChatMessage", Optional: false},
			},
		},
		{
			name: "ToolArgumentPreviewDeltaEvent",
			root: reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
				{Name: "tool_call_id", TypeExpr: "string", Optional: false},
				{Name: "tool_name", TypeExpr: "string", Optional: false},
				{Name: "arguments_delta", TypeExpr: "string", Optional: false},
				{Name: "preview_kind", TypeExpr: "string", Optional: false},
				{Name: "target_ids_by_type", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "preview_value_delta", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "MessageStopEvent",
			root: reflect.TypeOf(MessageStopEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_STOP", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "MessageFinalizedEvent",
			root: reflect.TypeOf(MessageFinalizedEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_FINALIZED", Optional: false},
				{Name: "message", TypeExpr: "BaseChatMessageUnion", Optional: false},
			},
		},
		{
			name:  "LLMStreamingResponseChunk",
			root:  reflect.TypeOf((*LLMStreamingResponseChunk)(nil)).Elem(),
			kind:  "alias",
			alias: "MessageStartEvent | MessageDeltaEvent | ToolCallDeltaEvent | ToolResultEvent | ToolArgumentPreviewDeltaEvent | MessageStopEvent | MessageFinalizedEvent",
		},
		{
			name: "LLMStreamingResponse",
			root: reflect.TypeOf(LLMStreamingResponse{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "chatId", TypeExpr: "string", Optional: false},
				{Name: "chunk", TypeExpr: "LLMStreamingResponseChunk", Optional: false},
				{Name: "sectionId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string | null", Optional: true},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != tt.kind {
				t.Fatalf("%s declaration kind = %q, want %q", tt.name, declaration.Kind, tt.kind)
			}
			if declaration.Alias != tt.alias {
				t.Fatalf("%s alias = %q, want %q", tt.name, declaration.Alias, tt.alias)
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
		})
	}
}

func TestProjectStateValueObjectContractsUseConverterObjects(t *testing.T) {
	converter := newTypeConverter()
	if err := converter.AddRootType(reflect.TypeOf(CodeFileBindingUpdate{})); err != nil {
		t.Fatalf("AddRootType(CodeFileBindingUpdate) error = %v", err)
	}

	declaration := requireDeclaration(t, converter.Declarations(), "CodeFileBindingUpdate")
	if declaration.Kind != "object" {
		t.Fatalf("CodeFileBindingUpdate declaration kind = %q, want %q", declaration.Kind, "object")
	}

	expected := []TypeProperty{
		{Name: "canonical_path", TypeExpr: "string", Optional: false},
		{Name: "access_mode", TypeExpr: "CodeFileAccessMode", Optional: false},
	}
	if !reflect.DeepEqual(declaration.Properties, expected) {
		t.Fatalf("CodeFileBindingUpdate properties = %#v, want %#v", declaration.Properties, expected)
	}
}

func TestTypeConverterUsesManualDiscriminatedUnionDeclarations(t *testing.T) {
	converter := newTypeConverter()
	roots := []reflect.Type{
		reflect.TypeOf(DependencyKeyType("")),
		reflect.TypeOf(SectionDependencyKey{}),
		reflect.TypeOf(SectionParamDependencyKey{}),
		reflect.TypeOf(BaseDependencyKeyUnion{}),
	}
	for _, root := range roots {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%s) error = %v", root.String(), err)
		}
	}

	unionDecl := requireDeclaration(t, converter.Declarations(), "BaseDependencyKeyUnion")
	if unionDecl.Kind != "alias" {
		t.Fatalf("BaseDependencyKeyUnion declaration kind = %q, want %q", unionDecl.Kind, "alias")
	}
	if unionDecl.Alias != "SectionDependencyKey | SectionParamDependencyKey" {
		t.Fatalf("BaseDependencyKeyUnion alias = %q", unionDecl.Alias)
	}

	sectionDecl := requireDeclaration(t, converter.Declarations(), "SectionDependencyKey")
	if got := requireProperty(t, sectionDecl.Properties, "type").TypeExpr; got != "typeof DependencyKeyTypeEnum.Section" {
		t.Fatalf("SectionDependencyKey.type TypeExpr = %q, want %q", got, "typeof DependencyKeyTypeEnum.Section")
	}
}

func TestTypeConverterRejectsUnsupportedShapes(t *testing.T) {
	converter := newTypeConverter()
	err := converter.AddRootType(reflect.TypeOf(ConverterUnsupportedExample{}))
	if err == nil {
		t.Fatalf("AddRootType(ConverterUnsupportedExample) unexpectedly succeeded")
	}
	if !strings.Contains(err.Error(), "ConverterUnsupportedExample.Channel") {
		t.Fatalf("unsupported-shape error = %q, want field context", err.Error())
	}
	if !strings.Contains(err.Error(), "unsupported Go type for TS conversion: chan int") {
		t.Fatalf("unsupported-shape error = %q, want unsupported-type detail", err.Error())
	}
}

func renderEndpointContractManifest(specs []EndpointSpec) string {
	lines := make([]string, 0, len(specs))
	for _, spec := range specs {
		lines = append(lines, strings.Join([]string{
			spec.FunctionName,
			spec.Method,
			spec.RouteCollection + "." + spec.RouteName,
			"request=" + endpointContractTypeName(spec.RequestType),
			"response=" + endpointContractTypeName(spec.ResponseType),
			"binary=" + strconv.FormatBool(spec.BinaryResponse),
		}, " "))
	}
	slices.Sort(lines)
	return strings.Join(lines, "\n")
}

func endpointContractTypeName(t reflect.Type) string {
	name := frontendTypeName(t)
	if name == "" {
		return "-"
	}
	return name
}

func requireDeclaration(t *testing.T, declarations []TypeDeclaration, name string) TypeDeclaration {
	t.Helper()

	for _, declaration := range declarations {
		if declaration.Name == name {
			return declaration
		}
	}
	t.Fatalf("missing declaration %q", name)
	return TypeDeclaration{}
}

func requireProperty(t *testing.T, properties []TypeProperty, name string) TypeProperty {
	t.Helper()

	for _, property := range properties {
		if property.Name == name {
			return property
		}
	}
	t.Fatalf("missing property %q", name)
	return TypeProperty{}
}

func writeTestFile(t *testing.T, path string, contents string) {
	t.Helper()

	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func testRepoRoot(t *testing.T) string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatalf("runtime.Caller(0) failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}
