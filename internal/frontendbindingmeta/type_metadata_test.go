package frontendbindingmeta

import (
	"reflect"
	"testing"
)

type testValueTypeMetadata struct{}

func (testValueTypeMetadata) FrontendBindingTypeScriptExpr() string {
	return "test-value-expr"
}

type testPointerTypeMetadata struct{}

func (*testPointerTypeMetadata) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{reflect.TypeOf("")}
}

func TestLookupProviderSupportsValueReceiver(t *testing.T) {
	t.Parallel()

	provider, ok := LookupProvider[TypeScriptExprProvider](reflect.TypeOf(testValueTypeMetadata{}))
	if !ok {
		t.Fatal("expected value-receiver provider")
	}
	if got := provider.FrontendBindingTypeScriptExpr(); got != "test-value-expr" {
		t.Fatalf("FrontendBindingTypeScriptExpr() = %q, want %q", got, "test-value-expr")
	}
}

func TestLookupProviderSupportsPointerReceiver(t *testing.T) {
	t.Parallel()

	provider, ok := LookupProvider[UnionTypesProvider](reflect.TypeOf(testPointerTypeMetadata{}))
	if !ok {
		t.Fatal("expected pointer-receiver provider")
	}
	if got := provider.FrontendBindingUnionTypes(); len(got) != 1 || got[0] != reflect.TypeOf("") {
		t.Fatalf("FrontendBindingUnionTypes() = %#v, want []reflect.Type{reflect.TypeOf(\"\")}", got)
	}
}

func TestLookupProviderSupportsPointerInputType(t *testing.T) {
	t.Parallel()

	provider, ok := LookupProvider[TypeScriptExprProvider](reflect.TypeOf(&testValueTypeMetadata{}))
	if !ok {
		t.Fatal("expected pointer input type to resolve")
	}
	if got := provider.FrontendBindingTypeScriptExpr(); got != "test-value-expr" {
		t.Fatalf("FrontendBindingTypeScriptExpr() = %q, want %q", got, "test-value-expr")
	}
}
