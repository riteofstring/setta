package frontendbindings

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

func TestCanonicalFrontendBindingTypeUsesRealtimeMirrorForPythonSDKTypes(t *testing.T) {
	t.Parallel()

	got := canonicalFrontendBindingType(reflect.TypeOf(pythonsdkcontracts.ListenerRealtimeDelta{}))
	want := reflect.TypeOf(realtime.ListenerRealtimeDelta{})
	if got != want {
		t.Fatalf("canonicalFrontendBindingType(ListenerRealtimeDelta) = %v, want %v", got, want)
	}
}

func TestCanonicalFrontendBindingTypeLeavesOwnerTypesUnchanged(t *testing.T) {
	t.Parallel()

	typ := reflect.TypeOf(realtime.ListenerRealtimeDelta{})
	if got := canonicalFrontendBindingType(typ); got != typ {
		t.Fatalf("canonicalFrontendBindingType(%v) = %v, want unchanged", typ, got)
	}
}

func TestOwnerBackedReflectedObjectDeclarationUsesFieldCreateExprTagsInCreateBody(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(agentruns.RunEvent{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateBody == "" {
		t.Fatalf("%s CreateBody is empty", declaration.Name)
	}
	if !strings.Contains(declaration.CreateBody, "timestamp: options.timestamp ?? \"\"") {
		t.Fatalf("%s CreateBody missing timestamp tag override:\n%s", declaration.Name, declaration.CreateBody)
	}
}

func TestOwnerBackedReflectedObjectDeclarationUsesNullableFieldCreateExprTagsInCreateBody(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(settingsstate.FrontendSettingsBackend{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateBody == "" {
		t.Fatalf("%s CreateBody is empty", declaration.Name)
	}
	if !strings.Contains(
		declaration.CreateBody,
		"defaultTerminalShell: options.defaultTerminalShell === null ? null : (options.defaultTerminalShell ?? null)",
	) {
		t.Fatalf("%s CreateBody missing nullable ts_create_expr override:\n%s", declaration.Name, declaration.CreateBody)
	}
}

func TestOwnerBackedReflectedObjectDeclarationUsesMapValueCreateTags(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(projectview.SectionCodegenPolicy{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateBody == "" {
		t.Fatalf("%s CreateBody is empty", declaration.Name)
	}
	if !strings.Contains(declaration.CreateBody, "Object.fromEntries(") {
		t.Fatalf("%s CreateBody missing map merge logic:\n%s", declaration.Name, declaration.CreateBody)
	}
	if !strings.Contains(declaration.CreateBody, "createSectionTypeCodegenPolicy") {
		t.Fatalf("%s CreateBody missing generated map value create call:\n%s", declaration.Name, declaration.CreateBody)
	}
}

func TestDiscriminatedObjectFamiliesSkipUnusedTraitDeclarations(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	if err := converter.ensureDeclaration(reflect.TypeOf(projectstate.FrontendBaseSectionImpl{})); err != nil {
		t.Fatalf("ensureDeclaration(FrontendBaseSectionImpl): %v", err)
	}
	if err := converter.ensureDeclaration(reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{})); err != nil {
		t.Fatalf("ensureDeclaration(FrontendBaseCodeObjImpl): %v", err)
	}

	assertNoTypeDeclaration(t, converter.Declarations(), "BaseDictSectionImplUnion")
	assertNoTypeDeclaration(t, converter.Declarations(), "isBaseDictSectionImpl")
	assertNoTypeDeclaration(t, converter.Declarations(), "ControlCodeObjTypeSet")
	assertNoTypeDeclaration(t, converter.Declarations(), "SectionParamCodeObjTypeSet")

	declaration := findTypeDeclaration(t, converter.Declarations(), "BaseParamCodeObjImplTypeSet")
	if declaration.Kind != "set" {
		t.Fatalf("BaseParamCodeObjImplTypeSet kind = %q, want %q", declaration.Kind, "set")
	}
	if declaration.Exported {
		t.Fatalf("BaseParamCodeObjImplTypeSet should stay local to generated guards")
	}
}

func TestDiscriminatedObjectFamilyCreateFunctionsReuseGoBackedCreateBody(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(projectstate.FrontendChatSectionImpl{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), "createChatSectionImpl")
	if declaration.Kind != "function" {
		t.Fatalf("createChatSectionImpl kind = %q, want %q", declaration.Kind, "function")
	}
	if !strings.Contains(declaration.FunctionBody, "const defaults: ChatSectionImpl = {") {
		t.Fatalf("createChatSectionImpl should use shared defaults staging:\n%s", declaration.FunctionBody)
	}
	if !strings.Contains(declaration.FunctionBody, "createSectionSize(") {
		t.Fatalf("createChatSectionImpl should reuse nested create helpers:\n%s", declaration.FunctionBody)
	}
}

type TestEmbeddedOmitEmptyDefaults struct {
	Enabled bool `json:"enabled,omitempty"`
}

type testOmitEmptyDefaults struct {
	TestEmbeddedOmitEmptyDefaults
	Count int `json:"count,omitempty"`
}

type TestNestedOmitEmptyDefaultsInner struct {
	Enabled bool `json:"enabled,omitempty"`
}

type testNestedOmitEmptyDefaults struct {
	Inner TestNestedOmitEmptyDefaultsInner `json:"inner"`
}

func TestBuildGoBackedCreateBodyTSRestoresOmitEmptyDefaultsFromStructFields(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	propertySpecs, err := converter.structPropertySpecs(reflect.TypeOf(testOmitEmptyDefaults{}), nil, nil, nil)
	if err != nil {
		t.Fatalf("structPropertySpecs(testOmitEmptyDefaults): %v", err)
	}

	createBody, err := buildGoBackedCreateBodyTS(
		"test omit empty defaults",
		"TestOmitEmptyDefaults",
		testOmitEmptyDefaults{},
		propertySpecs,
	)
	if err != nil {
		t.Fatalf("buildGoBackedCreateBodyTS(testOmitEmptyDefaults): %v", err)
	}
	if !strings.Contains(createBody, "\"count\": 0") {
		t.Fatalf("create body missing zero-value omitempty int default:\n%s", createBody)
	}
	if !strings.Contains(createBody, "\"enabled\": false") {
		t.Fatalf("create body missing zero-value omitempty embedded bool default:\n%s", createBody)
	}
}

func TestBuildGoBackedCreateBodyTSRestoresNestedOmitEmptyDefaults(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	propertySpecs, err := converter.structPropertySpecs(reflect.TypeOf(testNestedOmitEmptyDefaults{}), nil, nil, nil)
	if err != nil {
		t.Fatalf("structPropertySpecs(testNestedOmitEmptyDefaults): %v", err)
	}

	createBody, err := buildGoBackedCreateBodyTS(
		"test nested omit empty defaults",
		"TestNestedOmitEmptyDefaults",
		testNestedOmitEmptyDefaults{},
		propertySpecs,
	)
	if err != nil {
		t.Fatalf("buildGoBackedCreateBodyTS(testNestedOmitEmptyDefaults): %v", err)
	}
	if !strings.Contains(createBody, "\"inner\": {") || !strings.Contains(createBody, "\"enabled\": false") {
		t.Fatalf("create body missing nested zero-value omitempty default:\n%s", createBody)
	}
}

func findTypeDeclaration(t *testing.T, declarations []TypeDeclaration, name string) TypeDeclaration {
	t.Helper()

	for _, declaration := range declarations {
		if declaration.Name == name {
			return declaration
		}
	}
	t.Fatalf("declaration %q not found", name)
	return TypeDeclaration{}
}

func assertNoTypeDeclaration(t *testing.T, declarations []TypeDeclaration, name string) {
	t.Helper()

	for _, declaration := range declarations {
		if declaration.Name == name {
			t.Fatalf("unexpected declaration %q found with kind %q", name, declaration.Kind)
		}
	}
}
