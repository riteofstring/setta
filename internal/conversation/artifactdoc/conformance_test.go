package artifactdoc

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestAcceptedFixturesCompile(t *testing.T) {
	catalog := SettaCatalogV1()
	for _, fixture := range AcceptedFixtures() {
		t.Run(fixture.Name, func(t *testing.T) {
			document, err := Compile(catalog, fixture.Source)
			if err != nil {
				t.Fatalf("compile %s: %v", fixture.Name, err)
			}
			if document.Language != DocumentLanguageOpenUI {
				t.Fatalf("language is %q, want %q", document.Language, DocumentLanguageOpenUI)
			}
			if document.CatalogID != CatalogSettaV1 {
				t.Fatalf("catalog is %q, want %q", document.CatalogID, CatalogSettaV1)
			}
			if document.Root.Component != ComponentDocument {
				t.Fatalf("root component is %q, want %q", document.Root.Component, ComponentDocument)
			}
			if _, err := json.Marshal(document); err != nil {
				t.Fatalf("encode compiled document: %v", err)
			}
		})
	}
}

// The accepted corpus is the evidence the upstream OpenUI parser will be
// checked against, so a component absent from it is a component nobody has
// proven either side renders.
func TestAcceptedFixturesCoverEveryCatalogComponent(t *testing.T) {
	catalog := SettaCatalogV1()
	seen := map[ComponentName]bool{}
	for _, fixture := range AcceptedFixtures() {
		document, err := Compile(catalog, fixture.Source)
		if err != nil {
			t.Fatalf("compile %s: %v", fixture.Name, err)
		}
		collectComponents(document.Root, seen)
	}
	for _, name := range catalog.Names() {
		if !seen[name] {
			t.Errorf("no accepted fixture renders %s", name)
		}
	}
}

func TestRejectedFixturesReportExpectedCode(t *testing.T) {
	catalog := SettaCatalogV1()
	for _, fixture := range RejectedFixtures() {
		t.Run(fixture.Name, func(t *testing.T) {
			_, err := Compile(catalog, fixture.Source)
			if err == nil {
				t.Fatalf("compile %s was accepted, want %s", fixture.Name, fixture.Code)
			}
			var failure *CompileError
			if !errors.As(err, &failure) {
				t.Fatalf("compile %s returned %T, want *CompileError", fixture.Name, err)
			}
			if !failure.Has(fixture.Code) {
				t.Fatalf("compile %s reported %v, want %s", fixture.Name, failure.Codes(), fixture.Code)
			}
			assertDiagnosticsAreActionable(t, failure)
		})
	}
}

func TestRejectedFixturesCoverEveryCode(t *testing.T) {
	covered := map[Code]bool{}
	for _, fixture := range RejectedFixtures() {
		covered[fixture.Code] = true
	}
	for _, code := range AllCodes() {
		if !covered[code] {
			t.Errorf("no rejected fixture proves the compiler reports %s", code)
		}
	}
}

func TestCompilingTheSameSourceTwiceProducesTheSameTree(t *testing.T) {
	catalog := SettaCatalogV1()
	for _, fixture := range AcceptedFixtures() {
		first := mustCompileJSON(t, catalog, fixture.Source)
		second := mustCompileJSON(t, catalog, fixture.Source)
		if first != second {
			t.Fatalf("%s compiled to two different trees", fixture.Name)
		}
	}
}

func TestOmittedOptionalPropertiesAreAbsentRatherThanNull(t *testing.T) {
	document, err := Compile(SettaCatalogV1(), `root = Document([Heading("Status")])`)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	blocks, ok := listProperty(document.Root, "blocks")
	if !ok || len(blocks) != 1 {
		t.Fatalf("root blocks are %v, want one entry", document.Root.Props["blocks"])
	}
	heading, ok := blocks[0].(Node)
	if !ok {
		t.Fatalf("block is %T, want Node", blocks[0])
	}
	if _, present := heading.Props["level"]; present {
		t.Fatalf("omitted level is present as %v", heading.Props["level"])
	}
}

func TestReferencedStatementRendersOnceForEachUse(t *testing.T) {
	source := `shared = Text("Reused")
root = Document([shared, shared])`
	document, err := Compile(SettaCatalogV1(), source)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	blocks, _ := listProperty(document.Root, "blocks")
	if len(blocks) != 2 {
		t.Fatalf("root has %d blocks, want 2", len(blocks))
	}
	for index, block := range blocks {
		node, ok := block.(Node)
		if !ok || node.Component != ComponentText {
			t.Fatalf("block %d is %v, want a Text node", index, block)
		}
	}
}

func TestSignaturesDescribeEveryComponent(t *testing.T) {
	catalog := SettaCatalogV1()
	signatures := catalog.Signatures()
	for _, component := range catalog.Components {
		if !strings.Contains(signatures, string(component.Name)+"(") {
			t.Errorf("catalog signatures omit %s", component.Name)
		}
		if component.Summary == "" {
			t.Errorf("%s has no model-facing summary", component.Name)
		}
	}
}

func TestCatalogPropertiesAreFullyDeclared(t *testing.T) {
	for _, component := range SettaCatalogV1().Components {
		for _, property := range component.Properties {
			if property.Description == "" {
				t.Errorf("%s.%s has no description", component.Name, property.Name)
			}
			assertSchemaIsComplete(t, string(component.Name)+"."+property.Name, property.Schema)
		}
	}
}

func assertSchemaIsComplete(t *testing.T, path string, schema ValueSchema) {
	t.Helper()
	switch schema.Kind {
	case ValueKindString:
		if schema.Role == "" || schema.MaxBytes == 0 {
			t.Errorf("%s is a string with no role or size limit", path)
		}
	case ValueKindEnum:
		if len(schema.EnumValues) == 0 {
			t.Errorf("%s is an enum with no values", path)
		}
	case ValueKindComponent:
		if len(schema.Components) == 0 {
			t.Errorf("%s accepts a component but names none", path)
		}
	case ValueKindList:
		if schema.Element == nil {
			t.Fatalf("%s is a list with no element schema", path)
		}
		assertSchemaIsComplete(t, path+"[]", *schema.Element)
	case ValueKindObject:
		if len(schema.Fields) == 0 {
			t.Errorf("%s is an object with no fields", path)
		}
		for _, field := range schema.Fields {
			assertSchemaIsComplete(t, path+"."+field.Name, field.Schema)
		}
	}
}

func assertDiagnosticsAreActionable(t *testing.T, failure *CompileError) {
	t.Helper()
	if len(failure.Diagnostics) > MaxDiagnostics {
		t.Fatalf("compile reported %d diagnostics, over the %d cap", len(failure.Diagnostics), MaxDiagnostics)
	}
	for _, diagnostic := range failure.Diagnostics {
		if diagnostic.Message == "" || diagnostic.Correction == "" {
			t.Errorf("%s has no message or correction", diagnostic.Code)
		}
		if diagnostic.Position.Line < 1 || diagnostic.Position.Column < 1 {
			t.Errorf("%s has position %+v", diagnostic.Code, diagnostic.Position)
		}
		if !strings.HasPrefix(diagnostic.Field(), "source") {
			t.Errorf("%s reports field %q", diagnostic.Code, diagnostic.Field())
		}
	}
}

func mustCompileJSON(t *testing.T, catalog Catalog, source string) string {
	t.Helper()
	document, err := Compile(catalog, source)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("encode compiled document: %v", err)
	}
	return string(encoded)
}

func collectComponents(node Node, seen map[ComponentName]bool) {
	seen[node.Component] = true
	for _, value := range node.Props {
		collectValueComponents(value, seen)
	}
}

func collectValueComponents(value any, seen map[ComponentName]bool) {
	switch typed := value.(type) {
	case Node:
		collectComponents(typed, seen)
	case []any:
		for _, entry := range typed {
			collectValueComponents(entry, seen)
		}
	case map[string]any:
		for _, entry := range typed {
			collectValueComponents(entry, seen)
		}
	}
}
