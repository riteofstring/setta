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
			_, err := buildBindings(routeGroups, []EndpointSpec{tt.spec}, nil, nil)
			if err == nil {
				t.Fatalf("buildBindings(...) unexpectedly succeeded")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("buildBindings(...) error = %q, want substring %q", err.Error(), tt.want)
			}
		})
	}
}

func TestBuildBindingsRejectsUnsupportedDeclarationKinds(t *testing.T) {
	tests := []struct {
		name        string
		declaration TypeDeclaration
		want        string
	}{
		{
			name:        "raw declaration",
			declaration: TypeDeclaration{Name: "LegacyThing", Kind: "raw"},
			want:        `declaration LegacyThing: unsupported kind "raw"`,
		},
		{
			name:        "unknown declaration kind",
			declaration: TypeDeclaration{Name: "MysteryThing", Kind: "mystery"},
			want:        `declaration MysteryThing: unsupported kind "mystery"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := buildBindings(nil, nil, nil, []TypeDeclaration{tt.declaration})
			if err == nil {
				t.Fatalf("buildBindings(...) unexpectedly succeeded")
			}
			if err.Error() != tt.want {
				t.Fatalf("buildBindings(...) error = %q, want %q", err.Error(), tt.want)
			}
		})
	}
}

func TestBuildBindingsRejectsInvalidDeclarationNames(t *testing.T) {
	tests := []struct {
		name         string
		declarations []TypeDeclaration
		want         string
	}{
		{
			name: "empty declaration name",
			declarations: []TypeDeclaration{
				{
					Name:  "",
					Kind:  "alias",
					Alias: "string",
				},
			},
			want: "declaration at index 0 has empty name",
		},
		{
			name: "duplicate declaration name",
			declarations: []TypeDeclaration{
				{
					Name:  "Thing",
					Kind:  "alias",
					Alias: "string",
				},
				{
					Name: "Thing",
					Kind: "object",
					Properties: []TypeProperty{
						{Name: "value", TypeExpr: "string"},
					},
				},
			},
			want: `duplicate declaration "Thing" for kinds "alias" and "object"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := buildBindings(nil, nil, nil, tt.declarations)
			if err == nil {
				t.Fatalf("buildBindings(...) unexpectedly succeeded")
			}
			if err.Error() != tt.want {
				t.Fatalf("buildBindings(...) error = %q, want %q", err.Error(), tt.want)
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

func TestChatSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "ChatPermissionMode",
			root: reflect.TypeOf(ChatPermissionMode("")),
			values: []EnumValue{
				{Name: "minimal", Value: "minimal"},
				{Name: "yolo", Value: "yolo"},
				{Name: "config_toml_custom", Value: "config_toml_custom"},
			},
		},
		{
			name: "ChatDictationMode",
			root: reflect.TypeOf(ChatDictationMode("")),
			values: []EnumValue{
				{Name: "auto", Value: "auto"},
				{Name: "browser", Value: "browser"},
				{Name: "provider", Value: "provider"},
			},
		},
		{
			name: "ChatRole",
			root: reflect.TypeOf(ChatRole("")),
			values: []EnumValue{
				{Name: "system", Value: "system"},
				{Name: "user", Value: "user"},
				{Name: "assistant", Value: "assistant"},
				{Name: "tool", Value: "tool"},
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

func TestBrowserSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "BrowserAreaViewMode",
			root: reflect.TypeOf(BrowserAreaViewMode("")),
			values: []EnumValue{
				{Name: "list", Value: "list"},
				{Name: "thumbnail", Value: "thumbnail"},
				{Name: "carousel", Value: "carousel"},
			},
		},
		{
			name: "BrowserSearchScope",
			root: reflect.TypeOf(BrowserSearchScope("")),
			values: []EnumValue{
				{Name: "recursive", Value: "recursive"},
				{Name: "local", Value: "local"},
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

func TestTaskBoardSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "TaskBoardViewMode",
			root: reflect.TypeOf(TaskBoardViewMode("")),
			values: []EnumValue{
				{Name: "task_list", Value: "task_list"},
				{Name: "kanban", Value: "kanban"},
			},
		},
		{
			name: "TaskBoardTaskRecurrence",
			root: reflect.TypeOf(TaskBoardTaskRecurrence("")),
			values: []EnumValue{
				{Name: "none", Value: "none"},
				{Name: "hourly", Value: "hourly"},
				{Name: "daily", Value: "daily"},
				{Name: "specified_days", Value: "specified_days"},
				{Name: "specified_months", Value: "specified_months"},
				{Name: "specified_years", Value: "specified_years"},
			},
		},
		{
			name: "TaskBoardRecurringWeekday",
			root: reflect.TypeOf(TaskBoardRecurringWeekday("")),
			values: []EnumValue{
				{Name: "monday", Value: "monday"},
				{Name: "tuesday", Value: "tuesday"},
				{Name: "wednesday", Value: "wednesday"},
				{Name: "thursday", Value: "thursday"},
				{Name: "friday", Value: "friday"},
				{Name: "saturday", Value: "saturday"},
				{Name: "sunday", Value: "sunday"},
			},
		},
		{
			name: "TaskBoardRecurringMonth",
			root: reflect.TypeOf(TaskBoardRecurringMonth("")),
			values: []EnumValue{
				{Name: "january", Value: "january"},
				{Name: "february", Value: "february"},
				{Name: "march", Value: "march"},
				{Name: "april", Value: "april"},
				{Name: "may", Value: "may"},
				{Name: "june", Value: "june"},
				{Name: "july", Value: "july"},
				{Name: "august", Value: "august"},
				{Name: "september", Value: "september"},
				{Name: "october", Value: "october"},
				{Name: "november", Value: "november"},
				{Name: "december", Value: "december"},
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

func TestChartSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "ChartType",
			root: reflect.TypeOf(ChartType("")),
			values: []EnumValue{
				{Name: "line", Value: "line"},
				{Name: "scatter", Value: "scatter"},
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

func TestSpreadsheetSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "SpreadsheetGridDensity",
			root: reflect.TypeOf(SpreadsheetGridDensity("")),
			values: []EnumValue{
				{Name: "compact", Value: "compact"},
				{Name: "comfortable", Value: "comfortable"},
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

func TestProjectStateSectionSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "SectionType",
			root: reflect.TypeOf(SectionType("")),
			values: []EnumValue{
				{Name: "Callable", Value: "Callable"},
				{Name: "Dict", Value: "Dict"},
				{Name: "ListRoot", Value: "ListRoot"},
				{Name: "Group", Value: "Group"},
				{Name: "Image", Value: "Image"},
				{Name: "Chart", Value: "Chart"},
				{Name: "Draw", Value: "Draw"},
				{Name: "TextBlock", Value: "TextBlock"},
				{Name: "Prompt", Value: "Prompt"},
				{Name: "MetaControl", Value: "MetaControl"},
				{Name: "Social", Value: "Social"},
				{Name: "GlobalVariables", Value: "GlobalVariables"},
				{Name: "Code", Value: "Code"},
				{Name: "GenPythonCode", Value: "GenPythonCode"},
				{Name: "GenPythonMetadata", Value: "GenPythonMetadata"},
				{Name: "Terminal", Value: "Terminal"},
				{Name: "IFrame", Value: "IFrame"},
				{Name: "Chat", Value: "Chat"},
				{Name: "Browser", Value: "Browser"},
				{Name: "Plugin", Value: "Plugin"},
				{Name: "TaskBoard", Value: "TaskBoard"},
				{Name: "Spreadsheet", Value: "Spreadsheet"},
			},
		},
		{
			name: "CodeObjType",
			root: reflect.TypeOf(CodeObjType("")),
			values: []EnumValue{
				{Name: "CodeCallable", Value: "CodeCallable"},
				{Name: "CodeParam", Value: "CodeParam"},
				{Name: "TextParam", Value: "TextParam"},
				{Name: "DateParam", Value: "DateParam"},
				{Name: "TimeParam", Value: "TimeParam"},
				{Name: "ButtonParam", Value: "ButtonParam"},
				{Name: "SliderParam", Value: "SliderParam"},
				{Name: "RotaryParam", Value: "RotaryParam"},
				{Name: "SwitchParam", Value: "SwitchParam"},
				{Name: "ColorPickerParam", Value: "ColorPickerParam"},
				{Name: "DropdownParam", Value: "DropdownParam"},
				{Name: "PasswordParam", Value: "PasswordParam"},
				{Name: "TextAreaParam", Value: "TextAreaParam"},
				{Name: "DropzoneParam", Value: "DropzoneParam"},
				{Name: "NestedParam", Value: "NestedParam"},
			},
		},
		{
			name: "CodeLanguage",
			root: reflect.TypeOf(CodeLanguage("")),
			values: []EnumValue{
				{Name: "python", Value: "python"},
				{Name: "bash", Value: "bash"},
				{Name: "javascript", Value: "javascript"},
				{Name: "typescript", Value: "typescript"},
				{Name: "json", Value: "json"},
				{Name: "yaml", Value: "yaml"},
				{Name: "toml", Value: "toml"},
				{Name: "markdown", Value: "markdown"},
				{Name: "plaintext", Value: "plaintext"},
			},
		},
		{
			name: "ConfigLanguage",
			root: reflect.TypeOf(ConfigLanguage("")),
			values: []EnumValue{
				{Name: "python", Value: "python"},
				{Name: "json", Value: "json"},
			},
		},
		{
			name: "ParameterPassingStyle",
			root: reflect.TypeOf(ParameterPassingStyle("")),
			values: []EnumValue{
				{Name: "DEFAULT", Value: "DEFAULT"},
				{Name: "ARGS", Value: "ARGS"},
				{Name: "KWARGS", Value: "KWARGS"},
				{Name: "POSITIONAL_ONLY", Value: "POSITIONAL_ONLY"},
				{Name: "KEYWORD_ONLY", Value: "KEYWORD_ONLY"},
			},
		},
		{
			name: "ParamNameType",
			root: reflect.TypeOf(ParamNameType("")),
			values: []EnumValue{
				{Name: "CODE", Value: "CODE"},
				{Name: "TEXT", Value: "TEXT"},
			},
		},
		{
			name: "ButtonActionMode",
			root: reflect.TypeOf(ButtonActionMode("")),
			values: []EnumValue{
				{Name: "WEBSOCKET_LISTENER", Value: "WEBSOCKET_LISTENER"},
				{Name: "HTTP_REQUEST", Value: "HTTP_REQUEST"},
				{Name: "SETTA_API", Value: "SETTA_API"},
			},
		},
		{
			name: "HttpRequestMethod",
			root: reflect.TypeOf(HttpRequestMethod("")),
			values: []EnumValue{
				{Name: "GET", Value: "GET"},
				{Name: "POST", Value: "POST"},
				{Name: "PUT", Value: "PUT"},
				{Name: "PATCH", Value: "PATCH"},
				{Name: "DELETE", Value: "DELETE"},
				{Name: "HEAD", Value: "HEAD"},
				{Name: "OPTIONS", Value: "OPTIONS"},
			},
		},
		{
			name: "DropzoneMode",
			root: reflect.TypeOf(DropzoneMode("")),
			values: []EnumValue{
				{Name: "STATEFUL", Value: "STATEFUL"},
				{Name: "STATELESS", Value: "STATELESS"},
			},
		},
		{
			name: "TextParamInputUIType",
			root: reflect.TypeOf(TextParamInputUIType("")),
			values: []EnumValue{
				{Name: "plain", Value: "plain"},
				{Name: "time", Value: "time"},
				{Name: "date", Value: "date"},
			},
		},
		{
			name: "TimeDisplayFormat",
			root: reflect.TypeOf(TimeDisplayFormat("")),
			values: []EnumValue{
				{Name: "twenty_four_hour", Value: "twenty_four_hour"},
				{Name: "twelve_hour", Value: "twelve_hour"},
			},
		},
		{
			name: "TimeControlMode",
			root: reflect.TypeOf(TimeControlMode("")),
			values: []EnumValue{
				{Name: "input", Value: "input"},
				{Name: "display", Value: "display"},
			},
		},
		{
			name: "TimeDisplayFont",
			root: reflect.TypeOf(TimeDisplayFont("")),
			values: []EnumValue{
				{Name: "clock", Value: "clock"},
				{Name: "monospace", Value: "monospace"},
				{Name: "system", Value: "system"},
			},
		},
		{
			name: "DateDisplayFormat",
			root: reflect.TypeOf(DateDisplayFormat("")),
			values: []EnumValue{
				{Name: "iso", Value: "iso"},
				{Name: "us", Value: "us"},
				{Name: "eu", Value: "eu"},
				{Name: "long", Value: "long"},
			},
		},
		{
			name: "DateControlMode",
			root: reflect.TypeOf(DateControlMode("")),
			values: []EnumValue{
				{Name: "input", Value: "input"},
				{Name: "calendar", Value: "calendar"},
			},
		},
		{
			name: "DateSelectionMode",
			root: reflect.TypeOf(DateSelectionMode("")),
			values: []EnumValue{
				{Name: "single", Value: "single"},
				{Name: "multiple", Value: "multiple"},
			},
		},
		{
			name: "DateCalendarWeekStart",
			root: reflect.TypeOf(DateCalendarWeekStart("")),
			values: []EnumValue{
				{Name: "sunday", Value: "sunday"},
				{Name: "monday", Value: "monday"},
			},
		},
		{
			name: "ListRootViewMode",
			root: reflect.TypeOf(ListRootViewMode("")),
			values: []EnumValue{
				{Name: "default", Value: "default"},
				{Name: "task_list", Value: "task_list"},
				{Name: "kanban", Value: "kanban"},
			},
		},
		{
			name: "TextBlockDisplayMode",
			root: reflect.TypeOf(TextBlockDisplayMode("")),
			values: []EnumValue{
				{Name: "Render", Value: "Render"},
				{Name: "Edit", Value: "Edit"},
			},
		},
		{
			name: "TextBlockFormat",
			root: reflect.TypeOf(TextBlockFormat("")),
			values: []EnumValue{
				{Name: "Plaintext", Value: "Plaintext"},
				{Name: "Markdown", Value: "Markdown"},
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

func TestProjectStateSectionSupportPrimitiveContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		kind       string
		alias      string
		properties []TypeProperty
	}{
		{
			name:  "BuiltinCodeLanguage",
			root:  reflect.TypeOf(BuiltinCodeLanguage{}),
			kind:  "alias",
			alias: "CodeLanguage",
		},
		{
			name: "EdgePort",
			root: reflect.TypeOf(EdgePort{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "accessor", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "TypeErrorIgnoreState",
			root: reflect.TypeOf(TypeErrorIgnoreState{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "callable", TypeExpr: "boolean", Optional: false},
				{Name: "params", TypeExpr: "Record<string, boolean>", Optional: false},
			},
		},
		{
			name:  "ChartData",
			root:  reflect.TypeOf(ChartData{}),
			kind:  "alias",
			alias: "ChartDataValue",
		},
		{
			name:  "ChartDataType",
			root:  reflect.TypeOf(ChartDataType{}),
			kind:  "alias",
			alias: "ChartDataValue",
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
			if declaration.CreateExpr != "" {
				t.Fatalf("%s CreateExpr should be empty, got %q", tt.name, declaration.CreateExpr)
			}
		})
	}
}

func TestChatSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name                string
		root                reflect.Type
		kind                string
		alias               string
		properties          []TypeProperty
		hasCreateExpr       bool
		factoryFunctionName string
	}{
		{
			name:  "JSONValue",
			root:  reflect.TypeOf(JSONValue{}),
			kind:  "alias",
			alias: "null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
		},
		{
			name: "ChatFileAttachment",
			root: reflect.TypeOf(ChatFileAttachment{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "mimeType", TypeExpr: "string | null", Optional: true},
				{Name: "size", TypeExpr: "number | null", Optional: true},
			},
		},
		{
			name: "MessageTextContent",
			root: reflect.TypeOf(MessageTextContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"text"`, Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "MessageImageUrl",
			root: reflect.TypeOf(MessageImageURL{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "url", TypeExpr: "string", Optional: false},
				{Name: "detail", TypeExpr: `"auto" | "low" | "high" | null`, Optional: true},
			},
		},
		{
			name: "MessageImageUrlContent",
			root: reflect.TypeOf(MessageImageURLContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"image_url"`, Optional: false},
				{Name: "image_url", TypeExpr: "MessageImageUrl", Optional: false},
			},
		},
		{
			name: "MessageThinkingContent",
			root: reflect.TypeOf(MessageThinkingContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"thinking"`, Optional: false},
				{Name: "thinking", TypeExpr: "string", Optional: false},
				{Name: "summary", TypeExpr: "string | null", Optional: true},
				{Name: "signature", TypeExpr: "string | null", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name:  "MessageContent",
			root:  reflect.TypeOf(MessageContent{}),
			kind:  "alias",
			alias: "MessageTextContent | MessageImageUrlContent | MessageThinkingContent",
		},
		{
			name: "ToolReferenceContent",
			root: reflect.TypeOf(ToolReferenceContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"tool_reference"`, Optional: false},
				{Name: "tool_name", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "ToolCallFunction",
			root: reflect.TypeOf(ToolCallFunction{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "arguments", TypeExpr: "{ [key: string]: JSONValue | undefined }", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ToolCall",
			root: reflect.TypeOf(ToolCall{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "type", TypeExpr: `"function"`, Optional: false},
				{Name: "function", TypeExpr: "ToolCallFunction", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SystemChatMessage",
			root: reflect.TypeOf(SystemChatMessage{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContent>", Optional: false},
				{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.system", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "AssistantChatMessage",
			root: reflect.TypeOf(AssistantChatMessage{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContent>", Optional: false},
				{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.assistant", Optional: false},
				{Name: "tool_calls", TypeExpr: "Array<ToolCall> | null", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name: "UserChatMessage",
			root: reflect.TypeOf(UserChatMessage{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContent>", Optional: false},
				{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.user", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ToolChatMessage",
			root: reflect.TypeOf(ToolChatMessage{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.tool", Optional: false},
				{Name: "tool_call_id", TypeExpr: "string", Optional: false},
				{Name: "tool_name", TypeExpr: "string | null", Optional: true},
				{Name: "arguments", TypeExpr: "JSONValue", Optional: false},
				{Name: "result", TypeExpr: "JSONValue", Optional: false},
				{Name: "content", TypeExpr: "Array<ToolReferenceContent | Record<string, unknown>>", Optional: false},
				{Name: "is_error", TypeExpr: "boolean", Optional: false},
				{Name: "started_at", TypeExpr: "string", Optional: false},
				{Name: "completed_at", TypeExpr: "string | null", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name:  "BaseChatMessageUnion",
			root:  reflect.TypeOf(BaseChatMessageUnion{}),
			kind:  "alias",
			alias: "SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage",
		},
		{
			name: "ChatSectionBranch",
			root: reflect.TypeOf(ChatSectionBranch{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "createdAt", TypeExpr: "number", Optional: false},
				{Name: "parentBranchId", TypeExpr: "string | null", Optional: true},
				{Name: "branchFromMessageId", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "UserDefaultChatSectionImpl",
			root: reflect.TypeOf(UserDefaultChatSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "managed", TypeExpr: "boolean", Optional: false},
				{Name: "engineConfigId", TypeExpr: "string | null", Optional: false},
				{Name: "transcriptionProfileId", TypeExpr: "string | null", Optional: false},
				{Name: "agentProfileId", TypeExpr: "string | null", Optional: false},
				{Name: "chatId", TypeExpr: "string | null", Optional: false},
				{Name: "thinking", TypeExpr: "boolean", Optional: false},
				{Name: "permissionMode", TypeExpr: "ChatPermissionMode", Optional: false},
				{Name: "searchEnabled", TypeExpr: "boolean", Optional: false},
				{Name: "dictationMode", TypeExpr: "ChatDictationMode", Optional: false},
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "inputText", TypeExpr: "string", Optional: false},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: false},
				{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "activeBranchId", TypeExpr: "string | null", Optional: false},
				{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ChatSectionImpl",
			root: reflect.TypeOf(ChatSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & ChatSectionState & {
  type: typeof SectionTypeEnum.Chat;
  managed: boolean;
  engineConfigId?: string | null;
  transcriptionProfileId?: string | null;
  agentProfileId?: string | null;
  chatId?: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
}`,
			factoryFunctionName: "createChatSectionImpl",
		},
		{
			name: "ChatSectionState",
			root: reflect.TypeOf(ChatSectionState{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "inputText", TypeExpr: "string", Optional: false},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: false},
				{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "activeBranchId", TypeExpr: "string | null", Optional: true},
				{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>", Optional: false},
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
			if tt.factoryFunctionName != "" {
				factoryDecl := requireDeclaration(t, converter.Declarations(), tt.factoryFunctionName)
				if factoryDecl.Kind != "function" {
					t.Fatalf("%s companion declaration kind = %q, want %q", tt.factoryFunctionName, factoryDecl.Kind, "function")
				}
				if factoryDecl.FunctionReturn != tt.name {
					t.Fatalf("%s return type = %q, want %q", tt.factoryFunctionName, factoryDecl.FunctionReturn, tt.name)
				}
			}
		})
	}
}

func TestBrowserSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name                string
		root                reflect.Type
		kind                string
		alias               string
		properties          []TypeProperty
		hasCreateExpr       bool
		hasCreateBody       bool
		factoryFunctionName string
	}{
		{
			name: "BrowserSavedSearchTypeFilters",
			root: reflect.TypeOf(BrowserSavedSearchTypeFilters{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "image", TypeExpr: "boolean", Optional: false},
				{Name: "video", TypeExpr: "boolean", Optional: false},
				{Name: "audio", TypeExpr: "boolean", Optional: false},
				{Name: "text", TypeExpr: "boolean", Optional: false},
				{Name: "data", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "BrowserSavedSearch",
			root: reflect.TypeOf(BrowserSavedSearch{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "query", TypeExpr: "string", Optional: false},
				{Name: "searchScope", TypeExpr: "BrowserSearchScope", Optional: false},
				{Name: "typeFilters", TypeExpr: "BrowserSavedSearchTypeFilters", Optional: false},
				{Name: "color", TypeExpr: "string", Optional: false},
				{Name: "quickInfo", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "UserDefaultBrowserSectionImpl",
			root: reflect.TypeOf(UserDefaultBrowserSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "folder", TypeExpr: "string", Optional: false},
				{Name: "hideColumn", TypeExpr: "boolean", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "typesColumnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "viewMode", TypeExpr: "BrowserAreaViewMode", Optional: false},
				{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "BrowserSectionImpl",
			root: reflect.TypeOf(BrowserSectionImpl{}),
			kind: "alias",
			alias: `Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.Browser;
  folder: string;
  hideColumn: boolean;
  columnWidth?: number | null;
  typesColumnWidth?: number | null;
  viewMode: BrowserAreaViewMode;
  savedSearches: Array<BrowserSavedSearch>;
}`,
			factoryFunctionName: "createBrowserSectionImpl",
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
			if tt.factoryFunctionName != "" {
				factoryDecl := requireDeclaration(t, converter.Declarations(), tt.factoryFunctionName)
				if factoryDecl.Kind != "function" {
					t.Fatalf("%s companion declaration kind = %q, want %q", tt.factoryFunctionName, factoryDecl.Kind, "function")
				}
				if factoryDecl.FunctionReturn != tt.name {
					t.Fatalf("%s return type = %q, want %q", tt.factoryFunctionName, factoryDecl.FunctionReturn, tt.name)
				}
			}
		})
	}
}

func TestTaskBoardSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name                string
		root                reflect.Type
		kind                string
		alias               string
		properties          []TypeProperty
		hasCreateExpr       bool
		hasCreateBody       bool
		factoryFunctionName string
	}{
		{
			name: "TaskBoardColumn",
			root: reflect.TypeOf(TaskBoardColumn{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "color", TypeExpr: "string", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "TaskBoardTask",
			root: reflect.TypeOf(TaskBoardTask{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "title", TypeExpr: "string", Optional: false},
				{Name: "description", TypeExpr: "string", Optional: false},
				{Name: "completed", TypeExpr: "boolean", Optional: false},
				{Name: "columnId", TypeExpr: "string | null", Optional: true},
				{Name: "dueDateIso", TypeExpr: "string", Optional: false},
				{Name: "recurrence", TypeExpr: "TaskBoardTaskRecurrence", Optional: false},
				{Name: "recurrenceDays", TypeExpr: "Array<TaskBoardRecurringWeekday>", Optional: false},
				{Name: "recurrenceMonths", TypeExpr: "Array<TaskBoardRecurringMonth>", Optional: false},
				{Name: "recurrenceYears", TypeExpr: "Array<number>", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "UserDefaultTaskBoardSectionImpl",
			root: reflect.TypeOf(UserDefaultTaskBoardSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "viewMode", TypeExpr: "TaskBoardViewMode", Optional: false},
				{Name: "columns", TypeExpr: "Array<TaskBoardColumn> | null", Optional: false},
				{Name: "tasks", TypeExpr: "Array<TaskBoardTask>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "TaskBoardSectionImpl",
			root: reflect.TypeOf(TaskBoardSectionImpl{}),
			kind: "alias",
			alias: `Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.TaskBoard;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
}`,
			factoryFunctionName: "createTaskBoardSectionImpl",
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
			if tt.factoryFunctionName != "" {
				factoryDecl := requireDeclaration(t, converter.Declarations(), tt.factoryFunctionName)
				if factoryDecl.Kind != "function" {
					t.Fatalf("%s companion declaration kind = %q, want %q", tt.factoryFunctionName, factoryDecl.Kind, "function")
				}
				if factoryDecl.FunctionReturn != tt.name {
					t.Fatalf("%s return type = %q, want %q", tt.factoryFunctionName, factoryDecl.FunctionReturn, tt.name)
				}
			}
		})
	}
}

func TestChartSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name                string
		root                reflect.Type
		kind                string
		alias               string
		properties          []TypeProperty
		hasCreateExpr       bool
		factoryFunctionName string
	}{
		{
			name: "LineChartSettings",
			root: reflect.TypeOf(LineChartSettings{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ChartTypeEnum.line", Optional: false},
				{Name: "xAxisColumn", TypeExpr: "string | null", Optional: true},
				{Name: "secondYAxisColumns", TypeExpr: "Array<string>", Optional: false},
				{Name: "xAxisLog", TypeExpr: "boolean", Optional: false},
				{Name: "y1AxisLog", TypeExpr: "boolean", Optional: false},
				{Name: "y2AxisLog", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ScatterChartSettings",
			root: reflect.TypeOf(ScatterChartSettings{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ChartTypeEnum.scatter", Optional: false},
				{Name: "xAxisColumn", TypeExpr: "string | null", Optional: true},
				{Name: "categoryColumn", TypeExpr: "string | null", Optional: true},
				{Name: "xAxisLog", TypeExpr: "boolean", Optional: false},
				{Name: "yAxisLog", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name:                "BaseChartSettingsUnion",
			root:                reflect.TypeOf(BaseChartSettingsUnion{}),
			kind:                "alias",
			alias:               "LineChartSettings | ScatterChartSettings",
			factoryFunctionName: "createBaseChartSettingsUnionWithDiscriminator",
		},
		{
			name: "UserDefaultChartSectionImpl",
			root: reflect.TypeOf(UserDefaultChartSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "dataPath", TypeExpr: "string", Optional: false},
				{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ChartSectionImpl",
			root: reflect.TypeOf(ChartSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Chart;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
}`,
			factoryFunctionName: "createChartSectionImpl",
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
			if tt.factoryFunctionName != "" {
				factoryDecl := requireDeclaration(t, converter.Declarations(), tt.factoryFunctionName)
				if factoryDecl.Kind != "function" {
					t.Fatalf("%s companion declaration kind = %q, want %q", tt.factoryFunctionName, factoryDecl.Kind, "function")
				}
				if factoryDecl.FunctionReturn != tt.name {
					t.Fatalf("%s return type = %q, want %q", tt.factoryFunctionName, factoryDecl.FunctionReturn, tt.name)
				}
			}
		})
	}
}

func TestSpreadsheetSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name                string
		root                reflect.Type
		kind                string
		alias               string
		properties          []TypeProperty
		hasCreateExpr       bool
		factoryFunctionName string
	}{
		{
			name: "UserDefaultSpreadsheetSectionImpl",
			root: reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "filePath", TypeExpr: "string", Optional: false},
				{Name: "activeSheet", TypeExpr: "string | null", Optional: false},
				{Name: "readOnly", TypeExpr: "boolean", Optional: false},
				{Name: "showRowNumbers", TypeExpr: "boolean", Optional: false},
				{Name: "density", TypeExpr: "SpreadsheetGridDensity", Optional: false},
				{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SpreadsheetSectionImpl",
			root: reflect.TypeOf(SpreadsheetSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Spreadsheet;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
}`,
			factoryFunctionName: "createSpreadsheetSectionImpl",
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
			if tt.factoryFunctionName != "" {
				factoryDecl := requireDeclaration(t, converter.Declarations(), tt.factoryFunctionName)
				if factoryDecl.Kind != "function" {
					t.Fatalf("%s companion declaration kind = %q, want %q", tt.factoryFunctionName, factoryDecl.Kind, "function")
				}
				if factoryDecl.FunctionReturn != tt.name {
					t.Fatalf("%s return type = %q, want %q", tt.factoryFunctionName, factoryDecl.FunctionReturn, tt.name)
				}
			}
		})
	}
}

func TestSettingsSizingEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "MetaControlSizeMode",
			root: reflect.TypeOf(MetaControlSizeMode("")),
			values: []EnumValue{
				{Name: "any", Value: "any"},
				{Name: "auto_only", Value: "auto_only"},
				{Name: "manual_only", Value: "manual_only"},
			},
		},
		{
			name: "SectionSizeMode",
			root: reflect.TypeOf(SectionSizeMode("")),
			values: []EnumValue{
				{Name: "auto", Value: "auto"},
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

func TestSettingsSizingContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
		hasCreateBody bool
	}{
		{
			name:  "SectionSizeValue",
			root:  reflect.TypeOf(SectionSizeValue{}),
			kind:  "alias",
			alias: "number | SectionSizeMode",
		},
		{
			name: "SectionSize",
			root: reflect.TypeOf(SectionSize{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "width", TypeExpr: "SectionSizeValue", Optional: false},
				{Name: "height", TypeExpr: "SectionSizeValue", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SectionSizingPolicyTypeEntry",
			root: reflect.TypeOf(SectionSizingPolicyTypeEntry{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "minHeight", TypeExpr: "number", Optional: false},
				{Name: "maxHeight", TypeExpr: "number", Optional: false},
				{Name: "minWidth", TypeExpr: "number", Optional: false},
				{Name: "maxWidth", TypeExpr: "number", Optional: false},
			},
		},
		{
			name:  "SectionSizingPolicyCallableTypeEntry",
			root:  reflect.TypeOf(SectionSizingPolicyCallableTypeEntry{}),
			kind:  "alias",
			alias: "SectionSizingPolicyTypeEntry & {\n  hideSearchMinHeight: number;\n  hideParamsMinHeight: number;\n}",
		},
		{
			name: "MetaControlSizingPolicyTypeEntry",
			root: reflect.TypeOf(MetaControlSizingPolicyTypeEntry{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "minHeight", TypeExpr: "number", Optional: false},
				{Name: "minWidth", TypeExpr: "number", Optional: false},
				{Name: "sizeModeHeight", TypeExpr: "MetaControlSizeMode", Optional: false},
				{Name: "sizeModeWidth", TypeExpr: "MetaControlSizeMode", Optional: false},
			},
		},
		{
			name: "MetaControlSizingPolicyByType",
			root: reflect.TypeOf(MetaControlSizingPolicyByType{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "CodeCallable", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "CodeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "TextParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "DateParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "TimeParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "ButtonParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "SliderParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "RotaryParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "SwitchParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "ColorPickerParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "DropdownParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "PasswordParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "TextAreaParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "DropzoneParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
				{Name: "NestedParam", TypeExpr: "MetaControlSizingPolicyTypeEntry", Optional: false},
			},
			hasCreateBody: true,
		},
		{
			name: "SectionSizingPolicyGlobals",
			root: reflect.TypeOf(SectionSizingPolicyGlobals{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "pinnedParamsAreaMinHeight", TypeExpr: "number", Optional: false},
				{Name: "unpinnedParamsAreaMinHeight", TypeExpr: "number", Optional: false},
				{Name: "minimizedHeight", TypeExpr: "number", Optional: false},
				{Name: "infiniteMaxHeight", TypeExpr: "number", Optional: false},
				{Name: "infiniteMaxWidth", TypeExpr: "number", Optional: false},
				{Name: "autoMaxHeight", TypeExpr: "number", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SectionSizingPolicyByType",
			root: reflect.TypeOf(SectionSizingPolicyByType{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "Callable", TypeExpr: "SectionSizingPolicyCallableTypeEntry", Optional: false},
				{Name: "Dict", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "ListRoot", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Group", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Image", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Chart", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Draw", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Prompt", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "TextBlock", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "MetaControl", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Social", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "GlobalVariables", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Code", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "GenPythonCode", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "GenPythonMetadata", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Terminal", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "IFrame", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Chat", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Browser", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Plugin", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "TaskBoard", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
				{Name: "Spreadsheet", TypeExpr: "SectionSizingPolicyTypeEntry", Optional: false},
			},
			hasCreateBody: true,
		},
		{
			name: "SectionSizingPolicy",
			root: reflect.TypeOf(SectionSizingPolicy{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "byType", TypeExpr: "SectionSizingPolicyByType", Optional: false},
				{Name: "metaControlByType", TypeExpr: "MetaControlSizingPolicyByType", Optional: false},
				{Name: "globals", TypeExpr: "SectionSizingPolicyGlobals", Optional: false},
			},
			hasCreateBody: true,
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
			if (declaration.CreateBody != "") != tt.hasCreateBody {
				t.Fatalf("%s CreateBody presence = %t, want %t", tt.name, declaration.CreateBody != "", tt.hasCreateBody)
			}
		})
	}
}

func TestSettingsSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "RunSnapshotMode",
			root: reflect.TypeOf(RunSnapshotMode("")),
			values: []EnumValue{
				{Name: "ephemeral", Value: "ephemeral"},
				{Name: "always", Value: "always"},
				{Name: "never", Value: "never"},
			},
		},
		{
			name: "RenameRefactorMode",
			root: reflect.TypeOf(RenameRefactorMode("")),
			values: []EnumValue{
				{Name: "ALWAYS_ASK", Value: "ALWAYS_ASK"},
				{Name: "ALWAYS_RENAME", Value: "ALWAYS_RENAME"},
				{Name: "NEVER_RENAME", Value: "NEVER_RENAME"},
			},
		},
		{
			name: "BackgroundVariant",
			root: reflect.TypeOf(BackgroundVariant("")),
			values: []EnumValue{
				{Name: "lines", Value: "lines"},
				{Name: "dots", Value: "dots"},
				{Name: "cross", Value: "cross"},
			},
		},
		{
			name: "SelectionMode",
			root: reflect.TypeOf(SelectionMode("")),
			values: []EnumValue{
				{Name: "partial", Value: "partial"},
				{Name: "full", Value: "full"},
			},
		},
		{
			name: "PanOnScrollMode",
			root: reflect.TypeOf(PanOnScrollMode("")),
			values: []EnumValue{
				{Name: "free", Value: "free"},
				{Name: "vertical", Value: "vertical"},
				{Name: "horizontal", Value: "horizontal"},
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

func TestSettingsSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
		hasCreateBody bool
	}{
		{
			name: "SharePolicy",
			root: reflect.TypeOf(SharePolicy{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "allowParamChanges", TypeExpr: "boolean", Optional: false},
				{Name: "allowVariantChanges", TypeExpr: "boolean", Optional: false},
				{Name: "allowLayoutChanges", TypeExpr: "boolean", Optional: false},
				{Name: "allowRun", TypeExpr: "boolean", Optional: false},
				{Name: "allowLLM", TypeExpr: "boolean", Optional: false},
				{Name: "allowExternalLinks", TypeExpr: "boolean", Optional: false},
				{Name: "allowFileDownloads", TypeExpr: "boolean", Optional: false},
				{Name: "allowMultipleRuns", TypeExpr: "boolean", Optional: false},
				{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SettingsShortcuts",
			root: reflect.TypeOf(SettingsShortcuts{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "newCardShortcut", TypeExpr: "string", Optional: false},
				{Name: "newGroupShortcut", TypeExpr: "string", Optional: false},
				{Name: "typeCheckShortcut", TypeExpr: "string", Optional: false},
				{Name: "newProjectConfigShortcut", TypeExpr: "string", Optional: false},
				{Name: "undoShortcut", TypeExpr: "string", Optional: false},
				{Name: "redoShortcut", TypeExpr: "string", Optional: false},
				{Name: "groupShortcut", TypeExpr: "string", Optional: false},
				{Name: "ungroupShortcut", TypeExpr: "string", Optional: false},
				{Name: "saveShortcut", TypeExpr: "string", Optional: false},
				{Name: "saveAsShortcut", TypeExpr: "string", Optional: false},
				{Name: "loadShortcut", TypeExpr: "string", Optional: false},
				{Name: "searchShortcut", TypeExpr: "string", Optional: false},
				{Name: "advancedSearchShortcut", TypeExpr: "string", Optional: false},
				{Name: "commandPaletteShortcut", TypeExpr: "string", Optional: false},
				{Name: "resetZoomShortcut", TypeExpr: "string", Optional: false},
				{Name: "copyShortcut", TypeExpr: "string", Optional: false},
				{Name: "pasteShortcut", TypeExpr: "string", Optional: false},
				{Name: "pasteAsRefShortcut", TypeExpr: "string", Optional: false},
				{Name: "sortingShortcut", TypeExpr: "string", Optional: false},
				{Name: "movingFreeShortcut", TypeExpr: "string", Optional: false},
				{Name: "showTooltipShortcut", TypeExpr: "string", Optional: false},
				{Name: "tooltipToPlaintextShortcut", TypeExpr: "string", Optional: false},
				{Name: "tooltipToMarkdownShortcut", TypeExpr: "string", Optional: false},
				{Name: "freezeTooltipShortcut", TypeExpr: "string", Optional: false},
				{Name: "frozenTooltipToPlaintextShortcut", TypeExpr: "string", Optional: false},
				{Name: "frozenTooltipToMarkdownShortcut", TypeExpr: "string", Optional: false},
				{Name: "incrementTooltipPageShortcut", TypeExpr: "string", Optional: false},
				{Name: "decrementTooltipPageShortcut", TypeExpr: "string", Optional: false},
				{Name: "copyTooltipTextShortcut", TypeExpr: "string", Optional: false},
				{Name: "frozenTooltipIncrementShortcut", TypeExpr: "string", Optional: false},
				{Name: "frozenTooltipDecrementShortcut", TypeExpr: "string", Optional: false},
				{Name: "frozenTooltipCopyShortcut", TypeExpr: "string", Optional: false},
				{Name: "newTerminalShortcut", TypeExpr: "string", Optional: false},
				{Name: "fitViewShortcut", TypeExpr: "string", Optional: false},
				{Name: "zoomToMouseShortcut", TypeExpr: "string", Optional: false},
				{Name: "deleteSectionShortcut", TypeExpr: "string", Optional: false},
				{Name: "selectAll", TypeExpr: "string", Optional: false},
				{Name: "selectTopLevelNonGroupSections", TypeExpr: "string", Optional: false},
				{Name: "showVersionsTabShortcut", TypeExpr: "string", Optional: false},
				{Name: "showParamUITypeTabShortcut", TypeExpr: "string", Optional: false},
				{Name: "showProjectOverviewTabShortcut", TypeExpr: "string", Optional: false},
				{Name: "focusHeaderShortcut", TypeExpr: "string", Optional: false},
				{Name: "focusOverviewShortcut", TypeExpr: "string", Optional: false},
				{Name: "focusCanvasShortcut", TypeExpr: "string", Optional: false},
				{Name: "focusUiEditorShortcut", TypeExpr: "string", Optional: false},
				{Name: "nextTopLevelSectionShortcut", TypeExpr: "string", Optional: false},
				{Name: "prevTopLevelSectionShortcut", TypeExpr: "string", Optional: false},
				{Name: "runCodeShortcut", TypeExpr: "string", Optional: false},
				{Name: "runEntryCodeBlockShortcut", TypeExpr: "string", Optional: false},
				{Name: "paramSelect", TypeExpr: "string", Optional: false},
				{Name: "paramIndentShortcut", TypeExpr: "string", Optional: false},
				{Name: "paramUnindentShortcut", TypeExpr: "string", Optional: false},
				{Name: "paramMoveUpShortcut", TypeExpr: "string", Optional: false},
				{Name: "paramMoveDownShortcut", TypeExpr: "string", Optional: false},
				{Name: "formatCode", TypeExpr: "string", Optional: false},
				{Name: "selectionKeyCode", TypeExpr: "string", Optional: false},
				{Name: "multiSelectionKeyCode", TypeExpr: "string", Optional: false},
				{Name: "panActivationKeyCode", TypeExpr: "string", Optional: false},
				{Name: "zoomActivationKeyCode", TypeExpr: "string", Optional: false},
				{Name: "zoomInShortcut", TypeExpr: "string", Optional: false},
				{Name: "zoomOutShortcut", TypeExpr: "string", Optional: false},
				{Name: "restartLanguageServerShortcut", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SettingsGUI",
			root: reflect.TypeOf(SettingsGUI{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "snapGrid", TypeExpr: "[number, number]", Optional: false},
				{Name: "showGridLines", TypeExpr: "boolean", Optional: false},
				{Name: "gridPattern", TypeExpr: "BackgroundVariant", Optional: false},
				{Name: "gridPatternSize", TypeExpr: "number", Optional: false},
				{Name: "gridColor", TypeExpr: "string", Optional: false},
				{Name: "gridColorDarkMode", TypeExpr: "string", Optional: false},
				{Name: "wireColor", TypeExpr: "string", Optional: false},
				{Name: "wireColorDarkMode", TypeExpr: "string", Optional: false},
				{Name: "defaultZoomLevel", TypeExpr: "number", Optional: false},
				{Name: "minZoom", TypeExpr: "number", Optional: false},
				{Name: "maxZoom", TypeExpr: "number", Optional: false},
				{Name: "panOnDrag", TypeExpr: "boolean", Optional: false},
				{Name: "panOnScroll", TypeExpr: "boolean", Optional: false},
				{Name: "panOnScrollSpeed", TypeExpr: "number", Optional: false},
				{Name: "panOnScrollMode", TypeExpr: "PanOnScrollMode", Optional: false},
				{Name: "zoomOnScroll", TypeExpr: "boolean", Optional: false},
				{Name: "zoomOnPinch", TypeExpr: "boolean", Optional: false},
				{Name: "zoomOnDoubleClick", TypeExpr: "boolean", Optional: false},
				{Name: "selectionMode", TypeExpr: "SelectionMode", Optional: false},
				{Name: "leftSidePaneShiftsMap", TypeExpr: "boolean", Optional: false},
				{Name: "transitionDuration", TypeExpr: "number", Optional: false},
				{Name: "sectionTagColorChoices", TypeExpr: "Array<{ color: string; description: string; }>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SettingsBackend",
			root: reflect.TypeOf(SettingsBackend{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "showDefaultConfigOnLoad", TypeExpr: "boolean", Optional: false},
				{Name: "autosave", TypeExpr: "boolean", Optional: false},
				{Name: "autobackup", TypeExpr: "boolean", Optional: false},
				{Name: "autobackupFreq", TypeExpr: "number", Optional: false},
				{Name: "autobackupKeepLastN", TypeExpr: "number", Optional: false},
				{Name: "clearTerminalBeforeMarkingAsReady", TypeExpr: "boolean", Optional: false},
				{Name: "defaultTerminalShell", TypeExpr: "string | null", Optional: true},
				{Name: "exportDbReadableOnSave", TypeExpr: "boolean", Optional: false},
				{Name: "exportDbReadableWithVariantsOnSave", TypeExpr: "boolean", Optional: false},
				{Name: "autoRefetchCallableParamsOnLspMismatch", TypeExpr: "boolean", Optional: false},
				{Name: "renameRefactorMode", TypeExpr: "RenameRefactorMode", Optional: false},
				{Name: "saveRenderedValues", TypeExpr: "boolean", Optional: false},
				{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode", Optional: false},
				{Name: "completionGuardEnabled", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SettingsState",
			root: reflect.TypeOf(SettingsState{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "shortcuts", TypeExpr: "SettingsShortcuts", Optional: false},
				{Name: "gui", TypeExpr: "SettingsGUI", Optional: false},
				{Name: "backend", TypeExpr: "SettingsBackend", Optional: false},
				{Name: "sectionSizingPolicy", TypeExpr: "SectionSizingPolicy", Optional: false},
				{Name: "languageServer", TypeExpr: "Record<string, unknown>", Optional: false},
			},
			hasCreateBody: true,
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
			if (declaration.CreateBody != "") != tt.hasCreateBody {
				t.Fatalf("%s CreateBody presence = %t, want %t", tt.name, declaration.CreateBody != "", tt.hasCreateBody)
			}
		})
	}
}

func TestProjectCodegenSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "ProjectCodegenLanguage",
			root: reflect.TypeOf(ProjectCodegenLanguage("")),
			values: []EnumValue{
				{Name: "python", Value: "python"},
			},
		},
		{
			name: "SectionCodegenMode",
			root: reflect.TypeOf(SectionCodegenMode("")),
			values: []EnumValue{
				{Name: "inherit", Value: "inherit"},
				{Name: "include", Value: "include"},
				{Name: "exclude", Value: "exclude"},
			},
		},
		{
			name: "SectionRepresentationMode",
			root: reflect.TypeOf(SectionRepresentationMode("")),
			values: []EnumValue{
				{Name: "expression", Value: "expression"},
				{Name: "file_path", Value: "file_path"},
				{Name: "file_read", Value: "file_read"},
			},
		},
		{
			name: "CodeObjValueRepresentationMode",
			root: reflect.TypeOf(CodeObjValueRepresentationMode("")),
			values: []EnumValue{
				{Name: "expression", Value: "expression"},
				{Name: "json_parsed", Value: "json_parsed"},
				{Name: "string", Value: "string"},
				{Name: "file_path", Value: "file_path"},
				{Name: "file_read", Value: "file_read"},
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

func TestProjectCodegenSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
		hasCreateBody bool
	}{
		{
			name: "SectionTypeCodegenPolicy",
			root: reflect.TypeOf(SectionTypeCodegenPolicy{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "mode", TypeExpr: "SectionCodegenMode", Optional: false},
				{Name: "representation", TypeExpr: "SectionRepresentationMode", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SectionCodegenOverride",
			root: reflect.TypeOf(SectionCodegenOverride{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "mode", TypeExpr: "SectionCodegenMode", Optional: false},
				{Name: "representation", TypeExpr: "SectionRepresentationMode", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SectionCodegenPolicy",
			root: reflect.TypeOf(SectionCodegenPolicy{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "allowlist", TypeExpr: "Array<SectionType> | null", Optional: true},
				{Name: "metaControlAllowlist", TypeExpr: "Array<CodeObjType> | null", Optional: true},
				{Name: "exclude", TypeExpr: "Array<string>", Optional: false},
				{Name: "typePolicies", TypeExpr: "Record<SectionType, SectionTypeCodegenPolicy>", Optional: false},
				{Name: "sectionOverrides", TypeExpr: "Record<string, SectionCodegenOverride>", Optional: false},
			},
			hasCreateBody: true,
		},
		{
			name: "CodeObjTypeValuePolicy",
			root: reflect.TypeOf(CodeObjTypeValuePolicy{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "representation", TypeExpr: "CodeObjValueRepresentationMode", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "CodeObjValueOverride",
			root: reflect.TypeOf(CodeObjValueOverride{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "representation", TypeExpr: "CodeObjValueRepresentationMode", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "CodeObjValuePolicy",
			root: reflect.TypeOf(CodeObjValuePolicy{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "typePolicies", TypeExpr: "Record<CodeObjType, CodeObjTypeValuePolicy>", Optional: false},
				{Name: "codeObjOverrides", TypeExpr: "Record<string, CodeObjValueOverride>", Optional: false},
			},
			hasCreateBody: true,
		},
		{
			name: "ProjectCodegenPythonTarget",
			root: reflect.TypeOf(ProjectCodegenPythonTarget{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "language", TypeExpr: "typeof ProjectCodegenLanguageEnum.python", Optional: false},
				{Name: "genCodePrefix", TypeExpr: "string", Optional: false},
				{Name: "genCodeSuffix", TypeExpr: "string", Optional: false},
				{Name: "generateMetadata", TypeExpr: "boolean", Optional: false},
				{Name: "sectionPolicy", TypeExpr: "SectionCodegenPolicy", Optional: false},
				{Name: "codeObjValuePolicy", TypeExpr: "CodeObjValuePolicy", Optional: false},
			},
			hasCreateBody: true,
		},
		{
			name: "ProjectCodegenPluginTarget",
			root: reflect.TypeOf(ProjectCodegenPluginTarget{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "language", TypeExpr: "string", Optional: false},
				{Name: "options", TypeExpr: "Record<string, unknown>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name:  "ProjectCodegenTarget",
			root:  reflect.TypeOf(ProjectCodegenTarget{}),
			kind:  "alias",
			alias: "ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
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
			if (declaration.CreateBody != "") != tt.hasCreateBody {
				t.Fatalf("%s CreateBody presence = %t, want %t", tt.name, declaration.CreateBody != "", tt.hasCreateBody)
			}
		})
	}
}

func TestProjectShellSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "AgenticEdgeKind",
			root: reflect.TypeOf(AgenticEdgeKind("")),
			values: []EnumValue{
				{Name: "chat_chat", Value: "chat_chat"},
				{Name: "section_chat", Value: "section_chat"},
				{Name: "chat_section", Value: "chat_section"},
			},
		},
		{
			name: "AgenticEdgeContextMode",
			root: reflect.TypeOf(AgenticEdgeContextMode("")),
			values: []EnumValue{
				{Name: "reference_only", Value: "reference_only"},
				{Name: "inline_text", Value: "inline_text"},
				{Name: "summary", Value: "summary"},
			},
		},
		{
			name: "CodeFileAccessMode",
			root: reflect.TypeOf(CodeFileAccessMode("")),
			values: []EnumValue{
				{Name: "read_write", Value: "read_write"},
				{Name: "read_only", Value: "read_only"},
				{Name: "write_only", Value: "write_only"},
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

func TestProjectShellSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
	}{
		{
			name: "Viewport",
			root: reflect.TypeOf(Viewport{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "x", TypeExpr: "number", Optional: false},
				{Name: "y", TypeExpr: "number", Optional: false},
				{Name: "zoom", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "TopLevelSectionLayout",
			root: reflect.TypeOf(TopLevelSectionLayout{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "x", TypeExpr: "number", Optional: false},
				{Name: "y", TypeExpr: "number", Optional: false},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "w", TypeExpr: "number | null", Optional: true},
				{Name: "h", TypeExpr: "number | null", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name: "ViewMode",
			root: reflect.TypeOf(ViewMode{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: true},
				{Name: "isUserFacing", TypeExpr: "boolean", Optional: true},
				{Name: "isTab", TypeExpr: "boolean", Optional: true},
				{Name: "visibilityBySectionId", TypeExpr: "Record<string, boolean>", Optional: true},
				{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				{Name: "viewportInitialized", TypeExpr: "boolean", Optional: true},
				{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name:          "ViewModeConfig",
			root:          reflect.TypeOf(ViewModeConfig{}),
			kind:          "alias",
			alias:         "ViewMode",
			hasCreateExpr: true,
		},
		{
			name: "Edge",
			root: reflect.TypeOf(Edge{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "sourceVariantId", TypeExpr: "string", Optional: false},
				{Name: "sourcePortId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetVariantId", TypeExpr: "string", Optional: false},
				{Name: "targetPortId", TypeExpr: "string", Optional: false},
				{Name: "type", TypeExpr: "string", Optional: true},
				{Name: "label", TypeExpr: "string | null", Optional: true},
				{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				{Name: "animated", TypeExpr: "boolean", Optional: true},
				{Name: "hidden", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
				{Name: "selected", TypeExpr: "boolean", Optional: true},
			},
		},
		{
			name: "AgenticEdge",
			root: reflect.TypeOf(AgenticEdge{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "kind", TypeExpr: "AgenticEdgeKind", Optional: false},
				{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				{Name: "hidden", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "selected", TypeExpr: "boolean", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name: "WatchCodeFolder",
			root: reflect.TypeOf(WatchCodeFolder{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "path", TypeExpr: "string", Optional: false},
				{Name: "recursive", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "WatchCodeRegistryEntry",
			root: reflect.TypeOf(WatchCodeRegistryEntry{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "callableName", TypeExpr: "string", Optional: false},
				{Name: "kind", TypeExpr: "string", Optional: false},
				{Name: "signatureHash", TypeExpr: "string", Optional: false},
				{Name: "bodyHash", TypeExpr: "string", Optional: false},
				{Name: "sourcePath", TypeExpr: "string", Optional: false},
				{Name: "sectionIds", TypeExpr: "Array<string>", Optional: true},
				{Name: "sectionsCount", TypeExpr: "number", Optional: true},
			},
		},
		{
			name: "CodeFileBinding",
			root: reflect.TypeOf(CodeFileBinding{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "canonical_path", TypeExpr: "string", Optional: false},
				{Name: "access_mode", TypeExpr: "CodeFileAccessMode", Optional: false},
				{Name: "autoBinding", TypeExpr: "boolean", Optional: false},
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

func TestProjectStateCoreSupportEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "ClipboardDataType",
			root: reflect.TypeOf(ClipboardDataType("")),
			values: []EnumValue{
				{Name: "Sections", Value: "Sections"},
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

func TestProjectStateCoreSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
	}{
		{
			name: "ClipboardProjectStateCore",
			root: reflect.TypeOf(ClipboardProjectStateCore{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "sections", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>", Optional: false},
				{Name: "sectionVariants", TypeExpr: "Record<string, Variant>", Optional: false},
				{Name: "codeObjs", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>", Optional: false},
				{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ClipboardProjectStateCoreWithSectionVariantMap",
			root: reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "core", TypeExpr: "ClipboardProjectStateCore", Optional: false},
				{Name: "sectionVariantMap", TypeExpr: "Record<string, string>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SectionsClipboardData",
			root: reflect.TypeOf(SectionsClipboardData{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ClipboardDataTypeEnum.Sections", Optional: false},
				{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name:  "BaseClipboardDataUnionWithDiscriminator",
			root:  reflect.TypeOf(BaseClipboardDataUnionWithDiscriminator{}),
			kind:  "alias",
			alias: "SectionsClipboardData",
		},
		{
			name: "Core",
			root: reflect.TypeOf(Core{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "displayName", TypeExpr: "string", Optional: false},
				{Name: "variants", TypeExpr: "Array<string>", Optional: false},
				{Name: "defaultVariant", TypeExpr: "string | null", Optional: false},
				{Name: "sharedModifier", TypeExpr: "Record<string, unknown>", Optional: false},
				{Name: "unsharedKeys", TypeExpr: "Array<string>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "Variant",
			root: reflect.TypeOf(Variant{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "impl", TypeExpr: "string", Optional: false},
				{Name: "nonPresetImpls", TypeExpr: "Array<string>", Optional: false},
				{Name: "modifier", TypeExpr: "Record<string, unknown>", Optional: false},
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "SingletonSections",
			root: reflect.TypeOf(SingletonSections{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "GlobalVariables", TypeExpr: "string | null", Optional: false},
				{Name: "GenPythonCode", TypeExpr: "string | null", Optional: false},
				{Name: "GenPythonMetadata", TypeExpr: "string | null", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ShownParamIdDetails",
			root: reflect.TypeOf(ShownParamIdDetails{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "requiredParamIdsToPaths", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "topLevelParamIds", TypeExpr: "Array<string>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ShownParamIds",
			root: reflect.TypeOf(ShownParamIds{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "pinned", TypeExpr: "ShownParamIdDetails", Optional: false},
				{Name: "unpinned", TypeExpr: "ShownParamIdDetails", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ProjectStateSingleConfig",
			root: reflect.TypeOf(ProjectStateSingleConfig{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "projectConfig", TypeExpr: "ProjectConfig", Optional: false},
				{Name: "sections", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>", Optional: false},
				{Name: "sectionVariants", TypeExpr: "Record<string, Variant>", Optional: false},
				{Name: "codeObjs", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>", Optional: false},
				{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>", Optional: false},
				{Name: "artifactGroups", TypeExpr: "Record<string, unknown>", Optional: true},
				{Name: "singletonSections", TypeExpr: "SingletonSections", Optional: false},
				{Name: "parentSectionMap", TypeExpr: "Record<string, string | null>", Optional: false},
				{Name: "shownParamIds", TypeExpr: "Record<string, ShownParamIds>", Optional: false},
				{Name: "requiredDecodedImages", TypeExpr: "Array<string>", Optional: false},
				{Name: "genCodeBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
			},
			hasCreateExpr: true,
		},
		{
			name: "ProjectStateSingleConfigWithCompletedOpIds",
			root: reflect.TypeOf(ProjectStateSingleConfigWithCompletedOpIds{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "projectState", TypeExpr: "ProjectStateSingleConfig", Optional: false},
				{Name: "completedOpIds", TypeExpr: "Array<string>", Optional: false},
				{Name: "pendingOpIds", TypeExpr: "Array<string>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name:  "SectionsClipboardDataResponse",
			root:  reflect.TypeOf(SectionsClipboardDataResponse{}),
			kind:  "alias",
			alias: "SectionsClipboardData",
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

func TestProjectConfigSupportContractsUseConverterDeclarations(t *testing.T) {
	converter := newTypeConverter()
	if err := converter.AddRootType(reflect.TypeOf(ProjectConfig{})); err != nil {
		t.Fatalf("AddRootType(%s) error = %v", reflect.TypeOf(ProjectConfig{}).String(), err)
	}

	declaration := requireDeclaration(t, converter.Declarations(), "ProjectConfig")
	if declaration.Kind != "object" {
		t.Fatalf("ProjectConfig declaration kind = %q, want %q", declaration.Kind, "object")
	}

	expected := []TypeProperty{
		{Name: "id", TypeExpr: "string", Optional: false},
		{Name: "name", TypeExpr: "string", Optional: false},
		{Name: "showParamDisplayNames", TypeExpr: "boolean", Optional: false},
		{Name: "allowJsonSourceKeyEdits", TypeExpr: "boolean", Optional: false},
		{Name: "previewImgColor", TypeExpr: "string", Optional: true},
		{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
		{Name: "viewportInitialized", TypeExpr: "boolean", Optional: false},
		{Name: "viewModes", TypeExpr: "Record<string, ViewMode>", Optional: false},
		{Name: "activeViewModeId", TypeExpr: "string | null", Optional: true},
		{Name: "isEditingViewMode", TypeExpr: "boolean", Optional: false},
		{Name: "codegenTargets", TypeExpr: "Array<ProjectCodegenTarget>", Optional: false},
		{Name: "watchCodeEnabled", TypeExpr: "boolean", Optional: false},
		{Name: "watchCodeFolders", TypeExpr: "Array<WatchCodeFolder>", Optional: false},
		{Name: "watchCodeFiles", TypeExpr: "Array<string>", Optional: false},
		{Name: "watchCodeRegistry", TypeExpr: "Record<string, WatchCodeRegistryEntry>", Optional: false},
		{Name: "watchCodeBaselineByPath", TypeExpr: "Record<string, Array<string>>", Optional: false},
		{Name: "entryCodeBlockId", TypeExpr: "string | null", Optional: true},
		{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: false},
		{Name: "sectionVariantMap", TypeExpr: "Record<string, string>", Optional: false},
		{Name: "activeIds", TypeExpr: "Array<string>", Optional: false},
		{Name: "edges", TypeExpr: "Array<Edge>", Optional: false},
		{Name: "agenticEdges", TypeExpr: "Array<AgenticEdge>", Optional: false},
	}
	if !reflect.DeepEqual(declaration.Properties, expected) {
		t.Fatalf("ProjectConfig properties = %#v, want %#v", declaration.Properties, expected)
	}
	if declaration.CreateExpr == "" {
		t.Fatalf("ProjectConfig CreateExpr should be present")
	}
}

func TestProjectStateSectionSupportContractsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name                string
		root                reflect.Type
		kind                string
		alias               string
		properties          []TypeProperty
		hasCreateExpr       bool
		factoryFunctionName string
	}{
		{
			name: "BaseSectionImpl",
			root: reflect.TypeOf(BaseSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "SectionType", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "isInOtherProjectConfigs", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "aspectRatioExtraHeight", TypeExpr: "number", Optional: false},
				{Name: "aspectRatioExtraWidth", TypeExpr: "number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "isPreset", TypeExpr: "boolean", Optional: false},
				{Name: "children", TypeExpr: "Array<string>", Optional: true},
				{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>", Optional: true},
				{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: true},
				{Name: "paramFilter", TypeExpr: "string", Optional: true},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
				{Name: "configLanguage", TypeExpr: "string", Optional: true},
				{Name: "pinnedParams", TypeExpr: "Array<string>", Optional: true},
				{Name: "selectedParams", TypeExpr: "Array<string>", Optional: true},
				{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState", Optional: true},
				{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: true},
				{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: true},
				{Name: "topLevelParamId", TypeExpr: "string | null", Optional: true},
				{Name: "isJsonSource", TypeExpr: "boolean", Optional: true},
				{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: true},
				{Name: "jsonSourceMissing", TypeExpr: "boolean", Optional: true},
				{Name: "metaControlParamId", TypeExpr: "string | null", Optional: true},
				{Name: "showSectionTitle", TypeExpr: "boolean", Optional: true},
				{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
				{Name: "code", TypeExpr: "string", Optional: true},
				{Name: "codeLanguage", TypeExpr: "string", Optional: true},
				{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: true},
				{Name: "inputText", TypeExpr: "string", Optional: true},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: true},
				{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: true},
				{Name: "pluginId", TypeExpr: "string", Optional: true},
				{Name: "kind", TypeExpr: "string", Optional: true},
				{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
				{Name: "schemaVersion", TypeExpr: "number | null", Optional: true},
				{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: true},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: true},
				{Name: "isHorizontalOrientation", TypeExpr: "boolean", Optional: true},
				{Name: "overflowMode", TypeExpr: "boolean", Optional: true},
				{Name: "hideColumn", TypeExpr: "boolean", Optional: true},
				{Name: "folder", TypeExpr: "string", Optional: true},
				{Name: "filePath", TypeExpr: "string", Optional: true},
				{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
				{Name: "readOnly", TypeExpr: "boolean", Optional: true},
				{Name: "showRowNumbers", TypeExpr: "boolean", Optional: true},
				{Name: "density", TypeExpr: "string", Optional: true},
				{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: true},
				{Name: "text", TypeExpr: "string", Optional: true},
				{Name: "metaControlStyle", TypeExpr: "boolean", Optional: true},
				{Name: "imagePath", TypeExpr: "string", Optional: true},
				{Name: "dataPath", TypeExpr: "string", Optional: true},
				{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: true},
			},
		},
		{
			name: "CallableSectionImpl",
			root: reflect.TypeOf(CallableSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Callable;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  callable?: string | null;
  hideParams: boolean;
}`,
			factoryFunctionName: "createCallableSectionImpl",
		},
		{
			name: "BaseParentSectionImplUnion",
			root: reflect.TypeOf(BaseParentSectionImplUnion{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  children: Array<string>;
}`,
		},
		{
			name: "BaseSectionWithParamsImplUnion",
			root: reflect.TypeOf(BaseSectionWithParamsImplUnion{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  codeObjVariantMap: Record<string, string>;
}`,
		},
		{
			name: "DictSectionImpl",
			root: reflect.TypeOf(DictSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
			factoryFunctionName: "createDictSectionImpl",
		},
		{
			name: "UserDefaultCallableSectionImpl",
			root: reflect.TypeOf(UserDefaultCallableSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: false},
				{Name: "paramFilter", TypeExpr: "string", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "configLanguage", TypeExpr: "ConfigLanguage", Optional: false},
				{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: false},
				{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: false},
				{Name: "hideParams", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "UserDefaultDictSectionImpl",
			root: reflect.TypeOf(UserDefaultDictSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: false},
				{Name: "paramFilter", TypeExpr: "string", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "configLanguage", TypeExpr: "string", Optional: false},
				{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: false},
				{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: false},
				{Name: "isJsonSource", TypeExpr: "boolean", Optional: false},
				{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "BaseDictSectionImplUnion",
			root: reflect.TypeOf(BaseDictSectionImplUnion{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
		},
		{
			name: "BaseCodeObjImpl",
			root: reflect.TypeOf(BaseCodeObjImpl{}),
			kind: "alias",
			alias: `{
  type: CodeObjType;
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  children?: Array<string>;
  coreNameType?: ParamNameType;
  coreNameEditable?: boolean;
  passingStyle?: ParameterPassingStyle;
  typeAnnotation?: string;
  defaultVal?: string;
  value?: string;
  [key: string]: unknown;
}`,
		},
		{
			name: "CodeParamCodeObjImpl",
			root: reflect.TypeOf(CodeParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
			factoryFunctionName: "createCodeParamCodeObjImpl",
		},
		{
			name: "CodeCallableCodeObjImpl",
			root: reflect.TypeOf(CodeCallableCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeCallable;
  children: Array<string>;
}`,
		},
		{
			name: "NestedParamCodeObjImpl",
			root: reflect.TypeOf(NestedParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.NestedParam;
  children: Array<string>;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
}`,
		},
		{
			name: "BaseCodeObjImplUnion",
			root: reflect.TypeOf(BaseCodeObjImplUnion{}),
			kind: "alias",
			alias: `BaseCodeObjImpl
  | CodeCallableCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
		},
		{
			name: "BaseChildlessCodeObjImplUnion",
			root: reflect.TypeOf(BaseChildlessCodeObjImplUnion{}),
			kind: "alias",
			alias: `BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl`,
		},
		{
			name: "BaseParamCodeObjImplUnion",
			root: reflect.TypeOf(BaseParamCodeObjImplUnion{}),
			kind: "alias",
			alias: `BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
		},
		{
			name: "BaseParentCodeObjImplUnion",
			root: reflect.TypeOf(BaseParentCodeObjImplUnion{}),
			kind: "alias",
			alias: `CodeCallableCodeObjImpl
  | NestedParamCodeObjImpl`,
		},
		{
			name: "UserDefaultCodeParamCodeObjImpl",
			root: reflect.TypeOf(UserDefaultCodeParamCodeObjImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "coreNameType", TypeExpr: "ParamNameType", Optional: false},
				{Name: "coreNameEditable", TypeExpr: "boolean", Optional: false},
				{Name: "typeAnnotation", TypeExpr: "string", Optional: false},
				{Name: "defaultVal", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ColorPickerChoice",
			root: reflect.TypeOf(ColorPickerChoice{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "color", TypeExpr: "string", Optional: false},
				{Name: "description", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "TextParamCodeObjImpl",
			root: reflect.TypeOf(TextParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  uiType: TextParamInputUIType;
}`,
		},
		{
			name: "DateParamCodeObjImpl",
			root: reflect.TypeOf(DateParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DateParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
}`,
		},
		{
			name: "TimeParamCodeObjImpl",
			root: reflect.TypeOf(TimeParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TimeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
}`,
		},
		{
			name: "ButtonParamCodeObjImpl",
			root: reflect.TypeOf(ButtonParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ButtonParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  label: string;
  actionMode: ButtonActionMode;
  requestMethod: HttpRequestMethod;
  requestUrl: string;
  requestHeaderKey: string;
  requestHeaderValue: string;
  requestBody: string;
}`,
		},
		{
			name: "SliderParamCodeObjImpl",
			root: reflect.TypeOf(SliderParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SliderParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
		},
		{
			name: "RotaryParamCodeObjImpl",
			root: reflect.TypeOf(RotaryParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.RotaryParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
		},
		{
			name: "SwitchParamCodeObjImpl",
			root: reflect.TypeOf(SwitchParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SwitchParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
		},
		{
			name: "ColorPickerParamCodeObjImpl",
			root: reflect.TypeOf(ColorPickerParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ColorPickerParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  colorChoices: Array<ColorPickerChoice>;
}`,
		},
		{
			name: "DropdownParamCodeObjImpl",
			root: reflect.TypeOf(DropdownParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropdownParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  choices: Array<string>;
}`,
		},
		{
			name: "PasswordParamCodeObjImpl",
			root: reflect.TypeOf(PasswordParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.PasswordParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  hasSecret: boolean;
}`,
		},
		{
			name: "TextAreaParamCodeObjImpl",
			root: reflect.TypeOf(TextAreaParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextAreaParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
		},
		{
			name: "DropzoneParamCodeObjImpl",
			root: reflect.TypeOf(DropzoneParamCodeObjImpl{}),
			kind: "alias",
			alias: `BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropzoneParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  mode: DropzoneMode;
  maxAttachments?: number | null;
  placeholder: string;
}`,
		},
		{
			name: "UserDefaultListRootSectionImpl",
			root: reflect.TypeOf(UserDefaultListRootSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: false},
				{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "ListRootSectionImpl",
			root: reflect.TypeOf(ListRootSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.ListRoot;
  children: Array<string>;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
}`,
			factoryFunctionName: "createListRootSectionImpl",
		},
		{
			name: "UserDefaultTextBlockSectionImpl",
			root: reflect.TypeOf(UserDefaultTextBlockSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "format", TypeExpr: "TextBlockFormat", Optional: false},
				{Name: "masterFontSizePx", TypeExpr: "number", Optional: false},
				{Name: "headingAsSectionName", TypeExpr: "boolean", Optional: false},
				{Name: "metaControlStyle", TypeExpr: "boolean", Optional: false},
				{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode", Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "TextBlockSectionImpl",
			root: reflect.TypeOf(TextBlockSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.TextBlock;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
}`,
			factoryFunctionName: "createTextBlockSectionImpl",
		},
		{
			name: "CodeSectionDiagnosticsIgnoreState",
			root: reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "muted", TypeExpr: "boolean", Optional: false},
				{Name: "suppressedCodes", TypeExpr: "Array<string | number>", Optional: false},
			},
		},
		{
			name: "UserDefaultCodeSectionImpl",
			root: reflect.TypeOf(UserDefaultCodeSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "code", TypeExpr: "string", Optional: false},
				{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: false},
				{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: false},
				{Name: "codeLanguage", TypeExpr: "string", Optional: false},
				{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "CodeSectionImpl",
			root: reflect.TypeOf(CodeSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Code;
  children: Array<string>;
  code: string;
  codeLanguage: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
}`,
			factoryFunctionName: "createCodeSectionImpl",
		},
		{
			name: "UserDefaultTerminalSectionImpl",
			root: reflect.TypeOf(UserDefaultTerminalSectionImpl{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "TerminalSectionImpl",
			root: reflect.TypeOf(TerminalSectionImpl{}),
			kind: "alias",
			alias: `BaseSectionImpl & {
  type: typeof SectionTypeEnum.Terminal;
}`,
			factoryFunctionName: "createTerminalSectionImpl",
		},
		{
			name: "BaseSectionImplUnion",
			root: reflect.TypeOf(BaseSectionImplUnion{}),
			kind: "alias",
			alias: `CallableSectionImpl
  | DictSectionImpl
  | ListRootSectionImpl
  | TextBlockSectionImpl
  | CodeSectionImpl
  | TerminalSectionImpl
  | ChatSectionImpl
  | BrowserSectionImpl
  | ChartSectionImpl
  | TaskBoardSectionImpl
  | SpreadsheetSectionImpl
  | BaseSectionImpl`,
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
			if tt.factoryFunctionName != "" {
				factoryDecl := requireDeclaration(t, converter.Declarations(), tt.factoryFunctionName)
				if factoryDecl.Kind != "function" {
					t.Fatalf("%s companion declaration kind = %q, want %q", tt.factoryFunctionName, factoryDecl.Kind, "function")
				}
				if factoryDecl.FunctionReturn != tt.name {
					t.Fatalf("%s return type = %q, want %q", tt.factoryFunctionName, factoryDecl.FunctionReturn, tt.name)
				}
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

func TestWebsocketEnumsUseConverterDeclarations(t *testing.T) {
	tests := []struct {
		name   string
		root   reflect.Type
		values []EnumValue
	}{
		{
			name: "WebsocketConnectionType",
			root: reflect.TypeOf(WebsocketConnectionType("")),
			values: []EnumValue{
				{Name: "CLI", Value: "CLI"},
				{Name: "SERVER", Value: "SERVER"},
				{Name: "PYTHON_LOGGER", Value: "PYTHON_LOGGER"},
				{Name: "PYTHON_SCRIPT", Value: "PYTHON_SCRIPT"},
				{Name: "FRONTEND", Value: "FRONTEND"},
			},
		},
		{
			name: "WebsocketMsgTypeForFrontend",
			root: reflect.TypeOf(WebsocketMsgTypeForFrontend("")),
			values: []EnumValue{
				{Name: "AllConnections", Value: "AllConnections"},
				{Name: "FrontendIdentity", Value: "FrontendIdentity"},
				{Name: "Notification", Value: "Notification"},
				{Name: "LLMStreamingResponse", Value: "LLMStreamingResponse"},
				{Name: "LSPDiagnostics", Value: "LSPDiagnostics"},
				{Name: "NameValidationErrors", Value: "NameValidationErrors"},
				{Name: "ReturnRenameRefactorResults", Value: "ReturnRenameRefactorResults"},
				{Name: "TerminalMetadata", Value: "TerminalMetadata"},
				{Name: "UpdateFrontendProjectState", Value: "UpdateFrontendProjectState"},
				{Name: "UpdateSettings", Value: "UpdateSettings"},
				{Name: "AllProjectMetadata", Value: "AllProjectMetadata"},
				{Name: "UpdateArtifacts", Value: "UpdateArtifacts"},
				{Name: "ListenerCoverageSnapshot", Value: "ListenerCoverageSnapshot"},
				{Name: "LLMConfigUpdated", Value: "LLMConfigUpdated"},
				{Name: "LLMApiKeysUpdated", Value: "LLMApiKeysUpdated"},
				{Name: "BackendLogEvent", Value: "BackendLogEvent"},
				{Name: "AIFollowToolArgumentsUpdate", Value: "AIFollowToolArgumentsUpdate"},
				{Name: "AIFollowToolResultUpdate", Value: "AIFollowToolResultUpdate"},
				{Name: "UISettingReveal", Value: "UISettingReveal"},
				{Name: "AgentProfilesUpdated", Value: "AgentProfilesUpdated"},
				{Name: "PromptTemplatesUpdated", Value: "PromptTemplatesUpdated"},
				{Name: "ExternalAgentConfigsUpdated", Value: "ExternalAgentConfigsUpdated"},
				{Name: "EngineConfigsUpdated", Value: "EngineConfigsUpdated"},
				{Name: "TranscriptionProfilesUpdated", Value: "TranscriptionProfilesUpdated"},
			},
		},
		{
			name: "WebsocketMsgTypeForBackend",
			root: reflect.TypeOf(WebsocketMsgTypeForBackend("")),
			values: []EnumValue{
				{Name: "CurrentAddressUpdate", Value: "CurrentAddressUpdate"},
				{Name: "UISettingRevealResult", Value: "UISettingRevealResult"},
				{Name: "RealtimeUIChange", Value: "RealtimeUIChange"},
				{Name: "RealtimeDependencyEvent", Value: "RealtimeDependencyEvent"},
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

func TestWebsocketSupportUsesConverterDeclarations(t *testing.T) {
	tests := []struct {
		name          string
		root          reflect.Type
		kind          string
		alias         string
		properties    []TypeProperty
		hasCreateExpr bool
	}{
		{
			name: "WebsocketConnectionInfo",
			root: reflect.TypeOf(WebsocketConnectionInfo{}),
			kind: "object",
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
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate", Optional: false},
				{Name: "content", TypeExpr: "string", Optional: false},
			},
			hasCreateExpr: true,
		},
		{
			name: "UISettingRevealActivationStep",
			root: reflect.TypeOf(UISettingRevealActivationStep{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "string", Optional: false},
				{Name: "itemValue", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "UISettingRevealTarget",
			root: reflect.TypeOf(UISettingRevealTarget{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "settingId", TypeExpr: "string", Optional: false},
				{Name: "side", TypeExpr: "string", Optional: false},
				{Name: "overviewTabKey", TypeExpr: "string | null", Optional: true},
				{Name: "uiEditorTabName", TypeExpr: "string | null", Optional: true},
				{Name: "pluginId", TypeExpr: "string | null", Optional: true},
				{Name: "paneId", TypeExpr: "string | null", Optional: true},
				{Name: "strategy", TypeExpr: "string", Optional: false},
				{Name: "anchorId", TypeExpr: "string | null", Optional: true},
				{Name: "pluginRevealKey", TypeExpr: "string | null", Optional: true},
				{Name: "revealActivationSteps", TypeExpr: "Array<UISettingRevealActivationStep>", Optional: false},
			},
		},
		{
			name: "UISettingRevealContent",
			root: reflect.TypeOf(UISettingRevealContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "chatId", TypeExpr: "string | null", Optional: true},
				{Name: "activeSectionId", TypeExpr: "string | null", Optional: true},
				{Name: "reveals", TypeExpr: "Array<UISettingRevealTarget>", Optional: false},
				{Name: "durationMs", TypeExpr: "number", Optional: false},
				{Name: "requestId", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "UISettingRevealResultStatus",
			root: reflect.TypeOf(UISettingRevealResultStatus{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "settingId", TypeExpr: "string", Optional: false},
				{Name: "status", TypeExpr: `"revealed" | "failed"`, Optional: false},
				{Name: "errorCode", TypeExpr: "string | null", Optional: true},
				{Name: "errorMessage", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "UISettingRevealResultContent",
			root: reflect.TypeOf(UISettingRevealResultContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "requestId", TypeExpr: "string", Optional: false},
				{Name: "statuses", TypeExpr: "Array<UISettingRevealResultStatus>", Optional: false},
			},
		},
		{
			name: "WebsocketMsgRealtimeUIChangeContent",
			root: reflect.TypeOf(WebsocketMsgRealtimeUIChangeContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "dependencyKey", TypeExpr: "BaseDependencyKeyUnion", Optional: false},
				{Name: "value", TypeExpr: "BaseDependencyValueUnion", Optional: false},
			},
		},
		{
			name: "WebsocketMsgRealtimeUIChange",
			root: reflect.TypeOf(WebsocketMsgRealtimeUIChange{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeUIChange", Optional: false},
				{Name: "content", TypeExpr: "WebsocketMsgRealtimeUIChangeContent", Optional: false},
			},
		},
		{
			name: "WebsocketMsgRealtimeDependencyEventContent",
			root: reflect.TypeOf(WebsocketMsgRealtimeDependencyEventContent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "dependencyEvent", TypeExpr: "DependencyEvent", Optional: false},
			},
		},
		{
			name: "WebsocketMsgRealtimeDependencyEvent",
			root: reflect.TypeOf(WebsocketMsgRealtimeDependencyEvent{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent", Optional: false},
				{Name: "content", TypeExpr: "WebsocketMsgRealtimeDependencyEventContent", Optional: false},
			},
		},
		{
			name: "WebsocketMsgUISettingRevealResult",
			root: reflect.TypeOf(WebsocketMsgUISettingRevealResult{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.UISettingRevealResult", Optional: false},
				{Name: "content", TypeExpr: "UISettingRevealResultContent", Optional: false},
			},
		},
		{
			name:  "WebsocketMsg",
			root:  reflect.TypeOf(WebsocketMsg{}),
			kind:  "alias",
			alias: "WebsocketMsgCurrentAddressUpdate | WebsocketMsgRealtimeUIChange | WebsocketMsgRealtimeDependencyEvent | WebsocketMsgUISettingRevealResult",
		},
		{
			name: "FrontendWebsocketMsgUnion",
			root: reflect.TypeOf(FrontendWebsocketMsgUnion{}),
			kind: "object",
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string | null", Optional: true},
				{Name: "messageType", TypeExpr: "WebsocketMsgTypeForFrontend", Optional: false},
				{Name: "content", TypeExpr: "any", Optional: false},
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
