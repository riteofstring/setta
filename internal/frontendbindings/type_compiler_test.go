package frontendbindings

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/agentruns"
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

func TestOwnerBackedReflectedObjectDeclarationUsesFieldCreateExprTags(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(agentruns.RunEvent{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateExpr == "" {
		t.Fatalf("%s CreateExpr is empty", declaration.Name)
	}
	if !strings.Contains(declaration.CreateExpr, "timestamp: \"\"") {
		t.Fatalf("%s CreateExpr missing timestamp tag override:\n%s", declaration.Name, declaration.CreateExpr)
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
