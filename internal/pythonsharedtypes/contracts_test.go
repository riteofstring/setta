package pythonsharedtypes

import (
	"reflect"
	"testing"

	"setta/internal/frontendbindings"
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
