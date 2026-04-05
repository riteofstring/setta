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
