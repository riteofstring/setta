package pythonsharedtypes

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/frontendbindings"
	"setta/internal/projectview"
)

func TestEnumContractSpecIfConvertibleFallsBackToFrontendBindingEnumValues(t *testing.T) {
	spec, ok, err := enumContractSpecIfConvertible(reflect.TypeOf(frontendbindings.SectionType("")))
	if err != nil {
		t.Fatalf("enumContractSpecIfConvertible() error = %v", err)
	}
	if !ok {
		t.Fatalf("expected frontendbinding-backed enum to be convertible")
	}
	if spec.Name != "SectionType" {
		t.Fatalf("spec.Name = %q, want %q", spec.Name, "SectionType")
	}
	if len(spec.EnumValues) == 0 {
		t.Fatalf("expected fallback enum values to be populated")
	}
	if spec.EnumValues[0].Value != "Callable" {
		t.Fatalf("first enum value = %q, want %q", spec.EnumValues[0].Value, "Callable")
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

func TestPythonProjectConfigDefaultCodegenTargetsExprUsesRenderedGoValue(t *testing.T) {
	expectedValueExpr := mustPythonValueExprFromGoValue(
		"default project codegen targets",
		[]projectview.ProjectCodegenPythonTarget{
			projectview.FrontendDefaultProjectCodegenPythonTarget(),
		},
	)
	expected := "Field(default_factory=lambda: " + expectedValueExpr + ")"
	if got := pythonProjectConfigDefaultCodegenTargetsExpr(); got != expected {
		t.Fatalf("pythonProjectConfigDefaultCodegenTargetsExpr() = %q, want %q", got, expected)
	}
}
