package pythonsharedtypes

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/llmconfig"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func TestEnumContractSpecIfConvertibleNormalizesOwnerFrontendNames(t *testing.T) {
	spec, ok, err := enumContractSpecIfConvertible(reflect.TypeOf(projectstate.FrontendSectionType("")))
	if err != nil {
		t.Fatalf("enumContractSpecIfConvertible() error = %v", err)
	}
	if !ok {
		t.Fatalf("expected owner frontend enum to be convertible")
	}
	if spec.Name != "SectionType" {
		t.Fatalf("spec.Name = %q, want %q", spec.Name, "SectionType")
	}
	if len(spec.EnumValues) == 0 {
		t.Fatalf("expected owner enum values to be populated")
	}
	if spec.EnumValues[0].Value != "Callable" {
		t.Fatalf("first enum value = %q, want %q", spec.EnumValues[0].Value, "Callable")
	}
	textBlockIndex := pythonEnumValueIndex(spec.EnumValues, "TextBlock")
	promptIndex := pythonEnumValueIndex(spec.EnumValues, "Prompt")
	if textBlockIndex == -1 || promptIndex == -1 {
		t.Fatalf("expected TextBlock and Prompt enum values, got %#v", spec.EnumValues)
	}
	if textBlockIndex > promptIndex {
		t.Fatalf("expected TextBlock before Prompt, got %#v", spec.EnumValues)
	}
}

func TestPythonValueExprFromGoValueNormalizesOwnerFrontendNames(t *testing.T) {
	expr, err := pythonValueExprFromGoValue(projectstate.FrontendSectionTypeChat)
	if err != nil {
		t.Fatalf("pythonValueExprFromGoValue() error = %v", err)
	}
	if expr != "SectionType.Chat" {
		t.Fatalf("expr = %q, want %q", expr, "SectionType.Chat")
	}
}

func TestPythonValueExprFromGoValueRendersDefaultProjectCodegenTarget(t *testing.T) {
	expr, err := pythonValueExprFromGoValue(
		[]projectview.ProjectCodegenPythonTarget{
			projectview.FrontendDefaultProjectCodegenPythonTarget(),
		},
	)
	if err != nil {
		t.Fatalf("pythonValueExprFromGoValue() error = %v", err)
	}
	if !strings.HasPrefix(expr, "[ProjectCodegenPythonTarget(") {
		t.Fatalf("expected project codegen target constructor, got %q", expr)
	}
	if !strings.Contains(expr, "language=ProjectCodegenLanguage.python") {
		t.Fatalf("expected enum-backed language value, got %q", expr)
	}
	if !strings.Contains(expr, `genCodeSuffix="state = SettaState()"`) {
		t.Fatalf("expected canonical suffix default, got %q", expr)
	}
	if !strings.Contains(expr, "sectionPolicy=SectionCodegenPolicy(") {
		t.Fatalf("expected nested section policy constructor, got %q", expr)
	}
	if !strings.Contains(
		expr,
		`"Chat": SectionTypeCodegenPolicy(mode=SectionCodegenMode.inherit, representation=SectionRepresentationMode.file_read)`,
	) {
		t.Fatalf("expected canonical Chat section policy, got %q", expr)
	}
	if !strings.Contains(
		expr,
		`"DropzoneParam": CodeObjTypeValuePolicy(representation=CodeObjValueRepresentationMode.file_path)`,
	) {
		t.Fatalf("expected canonical DropzoneParam value policy, got %q", expr)
	}
}

func TestBuildModelSpecUsesGoValueDefaultsForProjectConfig(t *testing.T) {
	spec := contractSpec{
		Name: reflect.TypeOf(projectview.ProjectConfig{}).Name(),
		Kind: contractKindModel,
		Type: reflect.TypeOf(projectview.ProjectConfig{}),
	}

	model, err := buildModelSpec(spec, map[string]struct{}{spec.Name: {}})
	if err != nil {
		t.Fatalf("buildModelSpec(...) error = %v", err)
	}

	expectedCodegenTargets := "Field(default_factory=lambda: " + mustPythonValueExprFromGoValue(
		"default project codegen targets",
		[]projectview.ProjectCodegenPythonTarget{
			projectview.FrontendDefaultProjectCodegenPythonTarget(),
		},
	) + ")"
	if got := defaultExprForField(t, model, "codegenTargets"); got != expectedCodegenTargets {
		t.Fatalf("codegenTargets default = %q, want %q", got, expectedCodegenTargets)
	}

	if got := defaultExprForField(t, model, "allowJsonSourceKeyEdits"); got != "True" {
		t.Fatalf("allowJsonSourceKeyEdits default = %q, want %q", got, "True")
	}
	if got := defaultExprForField(t, model, "hasPythonCodegenTarget"); got != "False" {
		t.Fatalf("hasPythonCodegenTarget default = %q, want %q", got, "False")
	}
	if got := defaultExprForField(t, model, "previewImgColor"); got != `"bg-blue-500/60 dark:bg-blue-600/30"` {
		t.Fatalf("previewImgColor default = %q, want canonical preview color", got)
	}
	if got := defaultExprForField(t, model, "viewport"); got != "Field(default_factory=lambda: Viewport(x=0.0, y=0.0, zoom=1.0))" {
		t.Fatalf("viewport default = %q, want canonical go-backed viewport", got)
	}
	if got := defaultExprForField(t, model, "runCapabilities"); got != "Field(default_factory=lambda: ProjectRunCapabilities(canRunFromMain=False, mainRunDisabledReason=None, effectiveEntrySectionId=None))" {
		t.Fatalf("runCapabilities default = %q, want canonical go-backed run capabilities", got)
	}
	for _, fieldName := range []string{
		"sectionPathSlugsById",
		"sectionIdsByPathSlug",
		"windowSpaceSlugsById",
		"windowSpaceIdsBySlug",
	} {
		if got := defaultExprForField(t, model, fieldName); got != "Field(default_factory=dict)" {
			t.Fatalf("%s default = %q, want %q", fieldName, got, "Field(default_factory=dict)")
		}
	}
}

func TestBuildModelSpecUsesGoValueDefaultsForOwnerTypes(t *testing.T) {
	typeErrorModel, err := buildModelSpec(contractSpec{
		Name: pythonSharedContractNameForType(reflect.TypeOf(projectstate.TypeErrorIgnoreState{})),
		Kind: contractKindModel,
		Type: reflect.TypeOf(projectstate.TypeErrorIgnoreState{}),
	}, map[string]struct{}{"TypeErrorIgnoreState": {}})
	if err != nil {
		t.Fatalf("buildModelSpec(TypeErrorIgnoreState) error = %v", err)
	}
	if got := defaultExprForField(t, typeErrorModel, "callable"); got != "False" {
		t.Fatalf("callable default = %q, want %q", got, "False")
	}
	if got := defaultExprForField(t, typeErrorModel, "params"); got != "Field(default_factory=dict)" {
		t.Fatalf("params default = %q, want %q", got, "Field(default_factory=dict)")
	}

	searchFiltersModel, err := buildModelSpec(contractSpec{
		Name: pythonSharedContractNameForType(reflect.TypeOf(projectstate.BrowserSavedSearchTypeFilters{})),
		Kind: contractKindModel,
		Type: reflect.TypeOf(projectstate.BrowserSavedSearchTypeFilters{}),
	}, map[string]struct{}{"BrowserSavedSearchTypeFilters": {}})
	if err != nil {
		t.Fatalf("buildModelSpec(BrowserSavedSearchTypeFilters) error = %v", err)
	}
	for _, fieldName := range []string{"image", "video", "audio", "text", "data"} {
		if got := defaultExprForField(t, searchFiltersModel, fieldName); got != "True" {
			t.Fatalf("%s default = %q, want %q", fieldName, got, "True")
		}
	}

	llmConfigModel, err := buildModelSpec(contractSpec{
		Name: pythonSharedContractNameForType(reflect.TypeOf(llmconfig.Config{})),
		Kind: contractKindModel,
		Type: reflect.TypeOf(llmconfig.Config{}),
	}, map[string]struct{}{"LLMConfig": {}})
	if err != nil {
		t.Fatalf("buildModelSpec(LLMConfig) error = %v", err)
	}
	if got := defaultExprForField(t, llmConfigModel, "temporary"); got != "False" {
		t.Fatalf("temporary default = %q, want %q", got, "False")
	}
}

func defaultExprForField(t *testing.T, model modelSpec, fieldName string) string {
	t.Helper()
	for _, field := range model.Fields {
		if field.Name == fieldName {
			return field.DefaultExpr
		}
	}
	t.Fatalf("field %q not found", fieldName)
	return ""
}

func pythonEnumValueIndex(values []enumValueSpec, target string) int {
	for index, value := range values {
		if value.Value == target {
			return index
		}
	}
	return -1
}
