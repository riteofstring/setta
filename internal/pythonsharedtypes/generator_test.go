package pythonsharedtypes

import (
	"reflect"
	"strings"
	"testing"

	binarypayload "setta/internal/binary"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
)

func TestBuild(t *testing.T) {
	t.Helper()

	types, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	for _, snippet := range []string{
		"class SettaSharedTypeModel(BaseModel):",
		"model_config = ConfigDict(extra=\"forbid\")",
		"class Route(str, Enum):",
	} {
		if !strings.Contains(types.PythonModule, snippet) {
			t.Fatalf("generated python shared types missing %q:\n%s", snippet, types.PythonModule)
		}
	}
}

func TestBuildModelSpecTreatsOmitEmptyFieldsAsOptional(t *testing.T) {
	t.Helper()

	type omitEmptyExample struct {
		Name     string `json:"name"`
		MimeType string `json:"mimeType,omitempty"`
	}

	model, err := buildModelSpec(contractSpec{
		Name: "omitEmptyExample",
		Kind: contractKindModel,
		Type: reflect.TypeOf(omitEmptyExample{}),
	}, map[string]struct{}{"omitEmptyExample": {}})
	if err != nil {
		t.Fatalf("buildModelSpec(...) error = %v", err)
	}

	if len(model.Fields) != 2 {
		t.Fatalf("field count = %d, want 2", len(model.Fields))
	}
	if model.Fields[1].Name != "mimeType" {
		t.Fatalf("field[1].Name = %q, want %q", model.Fields[1].Name, "mimeType")
	}
	if model.Fields[1].TypeExpr != "str | None" {
		t.Fatalf("field[1].TypeExpr = %q, want %q", model.Fields[1].TypeExpr, "str | None")
	}
	if model.Fields[1].DefaultExpr != "None" {
		t.Fatalf("field[1].DefaultExpr = %q, want %q", model.Fields[1].DefaultExpr, "None")
	}
}

func TestSortModelSpecsByDependencies(t *testing.T) {
	t.Helper()

	models := []modelSpec{
		{
			Name: "Chat",
			Fields: []fieldSpec{
				{Name: "llmConfig", TypeExpr: "LLMConfig"},
				{Name: "branches", TypeExpr: "dict[str, ChatSectionBranch]"},
			},
		},
		{
			Name: "ChatSectionBranch",
			Fields: []fieldSpec{
				{Name: "messages", TypeExpr: "list[dict[str, Any]]"},
			},
		},
		{
			Name: "LLMConfig",
			Fields: []fieldSpec{
				{Name: "id", TypeExpr: "str"},
			},
		},
	}

	sorted := sortModelSpecsByDependencies(models)
	if len(sorted) != 3 {
		t.Fatalf("sorted len = %d, want 3", len(sorted))
	}
	if sorted[0].Name != "ChatSectionBranch" {
		t.Fatalf("sorted[0].Name = %q, want %q", sorted[0].Name, "ChatSectionBranch")
	}
	if sorted[1].Name != "LLMConfig" {
		t.Fatalf("sorted[1].Name = %q, want %q", sorted[1].Name, "LLMConfig")
	}
	if sorted[2].Name != "Chat" {
		t.Fatalf("sorted[2].Name = %q, want %q", sorted[2].Name, "Chat")
	}
}

func TestPythonTypeExprUsesWrapperOverrideNamesForNestedOwnerFields(t *testing.T) {
	t.Helper()

	typeExpr, err := pythonTypeExpr(reflect.TypeOf(binarypayload.ContentRef{}), "")
	if err != nil {
		t.Fatalf("pythonTypeExpr(...) error = %v", err)
	}
	if typeExpr != "BinaryContentRef" {
		t.Fatalf("typeExpr = %q, want %q", typeExpr, "BinaryContentRef")
	}
}

func TestPythonTypeExprPreservesNamedStringEnumsForNestedOwnerFields(t *testing.T) {
	t.Helper()

	typeExpr, err := pythonTypeExpr(reflect.TypeOf(realtime.DependencyValueType("")), "")
	if err != nil {
		t.Fatalf("pythonTypeExpr(...) error = %v", err)
	}
	if typeExpr != "DependencyValueType" {
		t.Fatalf("typeExpr = %q, want %q", typeExpr, "DependencyValueType")
	}
}

func TestPythonTypeExprWithImportsUsesSDKContractModuleForExternalTypes(t *testing.T) {
	t.Helper()

	spec, err := pythonTypeExprWithImports(
		reflect.TypeOf(pythonsdkcontracts.ListenerSnapshot{}),
		"",
		nil,
	)
	if err != nil {
		t.Fatalf("pythonTypeExprWithImports(...) error = %v", err)
	}
	if spec.TypeExpr != "ListenerSnapshot" {
		t.Fatalf("spec.TypeExpr = %q, want %q", spec.TypeExpr, "ListenerSnapshot")
	}
	importLine := "from setta.sdk_contracts.generated import ListenerSnapshot"
	if _, ok := spec.Imports[importLine]; !ok {
		t.Fatalf("expected import %q, got %#v", importLine, spec.Imports)
	}
}

func TestPythonTypeExprWithImportsSkipsExternalImportWhenTypeIsGeneratedLocally(t *testing.T) {
	t.Helper()

	spec, err := pythonTypeExprWithImports(
		reflect.TypeOf(pythonsdkcontracts.ListenerSnapshot{}),
		"",
		map[string]struct{}{"ListenerSnapshot": {}},
	)
	if err != nil {
		t.Fatalf("pythonTypeExprWithImports(...) error = %v", err)
	}
	if spec.TypeExpr != "ListenerSnapshot" {
		t.Fatalf("spec.TypeExpr = %q, want %q", spec.TypeExpr, "ListenerSnapshot")
	}
	if len(spec.Imports) != 0 {
		t.Fatalf("expected no imports, got %#v", spec.Imports)
	}
}
