package pythonsharedtypes

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/sharedtypes"
)

func TestPythonSharedEnumContractNameNormalizesOwnerFrontendNames(t *testing.T) {
	name, ok, err := pythonSharedEnumContractName(reflect.TypeOf(projectstate.FrontendSectionType("")))
	if err != nil {
		t.Fatalf("pythonSharedEnumContractName() error = %v", err)
	}
	if !ok {
		t.Fatalf("expected owner frontend enum to be convertible")
	}
	if name != "SectionType" {
		t.Fatalf("name = %q, want %q", name, "SectionType")
	}
}

func TestBuildModelSpecUsesGoValueDefaultsForProjectConfig(t *testing.T) {
	ownerType := reflect.TypeOf(projectview.ProjectConfig{})

	codegenTargetsDefault := defaultExprForTypeField(t, ownerType, "codegenTargets")
	if !strings.Contains(
		codegenTargetsDefault,
		`TypeAdapter(list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget]).validate_json("`,
	) {
		t.Fatalf("expected TypeAdapter-backed codegenTargets default, got %q", codegenTargetsDefault)
	}
	if !strings.Contains(codegenTargetsDefault, `\"language\":\"python\"`) {
		t.Fatalf("expected codegenTargets default to include canonical language JSON, got %q", codegenTargetsDefault)
	}
	if !strings.Contains(codegenTargetsDefault, `\"representation\":\"file_read\"`) {
		t.Fatalf("expected codegenTargets default to include canonical section policy JSON, got %q", codegenTargetsDefault)
	}
	if !strings.Contains(codegenTargetsDefault, `\"representation\":\"file_path\"`) {
		t.Fatalf("expected codegenTargets default to include canonical code object policy JSON, got %q", codegenTargetsDefault)
	}

	if got := defaultExprForTypeField(t, ownerType, "allowJsonSourceKeyEdits"); got != "True" {
		t.Fatalf("allowJsonSourceKeyEdits default = %q, want %q", got, "True")
	}
	if got := defaultExprForTypeField(t, ownerType, "hasPythonCodegenTarget"); got != "False" {
		t.Fatalf("hasPythonCodegenTarget default = %q, want %q", got, "False")
	}
	if got := defaultExprForTypeField(t, ownerType, "previewImgColor"); got != `"bg-blue-500/60 dark:bg-blue-600/30"` {
		t.Fatalf("previewImgColor default = %q, want canonical preview color", got)
	}
	if got := defaultExprForTypeField(t, ownerType, "viewport"); !strings.Contains(
		got,
		`TypeAdapter(Viewport | None).validate_json("{\"x\":0,\"y\":0,\"zoom\":1}")`,
	) {
		t.Fatalf("viewport default = %q, want canonical TypeAdapter-backed viewport", got)
	}
	if got := defaultExprForTypeField(t, ownerType, "runCapabilities"); !strings.Contains(
		got,
		`TypeAdapter(ProjectRunCapabilities).validate_json("{\"canRunFromMain\":false,\"mainRunDisabledReason\":null,\"effectiveEntrySectionId\":null}")`,
	) {
		t.Fatalf("runCapabilities default = %q, want canonical TypeAdapter-backed run capabilities", got)
	}
	for _, fieldName := range []string{
		"sectionPathSlugsById",
		"sectionIdsByPathSlug",
		"windowSpaceSlugsById",
		"windowSpaceIdsBySlug",
	} {
		if got := defaultExprForTypeField(t, ownerType, fieldName); got != "Field(default_factory=dict)" {
			t.Fatalf("%s default = %q, want %q", fieldName, got, "Field(default_factory=dict)")
		}
	}
}

func TestDefaultSourcesFromSidecarPrefersPythonSharedProfile(t *testing.T) {
	t.Parallel()

	sidecar, err := sharedtypes.BuildSemanticSidecar()
	if err != nil {
		t.Fatalf("BuildSemanticSidecar() error = %v", err)
	}

	defaultSources, err := defaultSourcesFromSidecar(
		sidecar,
		sharedtypes.DefaultProfilePythonShared,
		sharedtypes.DefaultProfileFrontend,
	)
	if err != nil {
		t.Fatalf("defaultSourcesFromSidecar() error = %v", err)
	}

	source := defaultSources[reflect.TypeOf(projectview.ProjectConfig{})]
	if !source.IsValid() {
		t.Fatalf("expected ProjectConfig default source")
	}
	config, ok := source.Interface().(projectview.ProjectConfig)
	if !ok {
		t.Fatalf("ProjectConfig default source type = %T", source.Interface())
	}
	if config.PreviewImgColor != projectview.PythonSharedDefaultProjectConfig().PreviewImgColor {
		t.Fatalf("ProjectConfig preview color = %q, want %q", config.PreviewImgColor, projectview.PythonSharedDefaultProjectConfig().PreviewImgColor)
	}
}

func TestBuildModelSpecUsesGoValueDefaultsForOwnerTypes(t *testing.T) {
	typeErrorType := reflect.TypeOf(projectstate.TypeErrorIgnoreState{})
	if got := defaultExprForTypeField(t, typeErrorType, "callable"); got != "False" {
		t.Fatalf("callable default = %q, want %q", got, "False")
	}
	if got := defaultExprForTypeField(t, typeErrorType, "params"); got != "Field(default_factory=dict)" {
		t.Fatalf("params default = %q, want %q", got, "Field(default_factory=dict)")
	}

	searchFiltersType := reflect.TypeOf(projectstate.BrowserSavedSearchTypeFilters{})
	for _, fieldName := range []string{"image", "video", "audio", "text", "data"} {
		if got := defaultExprForTypeField(t, searchFiltersType, fieldName); got != "True" {
			t.Fatalf("%s default = %q, want %q", fieldName, got, "True")
		}
	}

	if got := defaultExprForTypeField(t, reflect.TypeOf(llmconfig.Config{}), "temporary"); got != "False" {
		t.Fatalf("temporary default = %q, want %q", got, "False")
	}
}

func TestBuildUsesAuthoritativeSharedRouteInventory(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}

	if !strings.Contains(generated.PythonModule, `API_PREFIX = "/api"`) {
		t.Fatalf("expected generated routes to include API prefix route")
	}
	if !strings.Contains(generated.PythonModule, `LISTENER_BY_ID = "/ws/listeners/{listenerID}"`) {
		t.Fatalf("expected generated routes to include listener route")
	}
	if !strings.Contains(generated.PythonModule, `from pydantic import TypeAdapter`) {
		t.Fatalf("expected generated module to import TypeAdapter for structured go_value defaults")
	}
}

func defaultExprForTypeField(t *testing.T, ownerType reflect.Type, fieldName string) string {
	t.Helper()
	field := fieldSpecForTypeField(t, ownerType, fieldName)
	return field.DefaultExpr
}

func fieldSpecForTypeField(t *testing.T, ownerType reflect.Type, fieldName string) fieldSpec {
	t.Helper()
	ctx, err := buildGenerationContext()
	if err != nil {
		t.Fatalf("buildGenerationContext() error = %v", err)
	}
	module, err := pythonSharedSchemaModule()
	if err != nil {
		t.Fatalf("pythonSharedSchemaModule() error = %v", err)
	}
	knownContractNames := map[string]struct{}{}
	for _, declaration := range module.Declarations {
		name := strings.TrimSpace(declaration.Name)
		if name == "" {
			continue
		}
		knownContractNames[name] = struct{}{}
	}
	for _, candidate := range visibleFields(ownerType) {
		jsonName, err := fieldJSONName(candidate)
		if err != nil {
			t.Fatalf("fieldJSONName(%s.%s) error = %v", ownerType, candidate.Name, err)
		}
		if jsonName != fieldName {
			continue
		}
		resolvedField, _, err := buildModelFieldSpec(
			pythonSharedContractNameForType(ownerType),
			ownerType,
			candidate,
			knownContractNames,
			ctx.DefaultSourcesByType,
		)
		if err != nil {
			t.Fatalf("buildModelFieldSpec(%s.%s) error = %v", ownerType, candidate.Name, err)
		}
		return resolvedField
	}
	t.Fatalf("field %q not found on %s", fieldName, ownerType)
	return fieldSpec{}
}
