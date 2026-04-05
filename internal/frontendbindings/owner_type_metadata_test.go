package frontendbindings

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

func TestFrontendBindingOwnerMetadataProviderSupportsValueReceiver(t *testing.T) {
	t.Parallel()

	provider, ok := frontendBindingOwnerMetadataProvider[frontendBindingTypeScriptExprProvider](reflect.TypeOf(testValueTypeMetadata{}))
	if !ok {
		t.Fatal("expected value-receiver provider")
	}
	if got := provider.FrontendBindingTypeScriptExpr(); got != "test-value-expr" {
		t.Fatalf("FrontendBindingTypeScriptExpr() = %q, want %q", got, "test-value-expr")
	}
}

func TestFrontendBindingOwnerMetadataProviderSupportsPointerReceiver(t *testing.T) {
	t.Parallel()

	provider, ok := frontendBindingOwnerMetadataProvider[frontendBindingUnionTypesProvider](reflect.TypeOf(testPointerTypeMetadata{}))
	if !ok {
		t.Fatal("expected pointer-receiver provider")
	}
	if got := provider.FrontendBindingUnionTypes(); len(got) != 1 || got[0] != reflect.TypeOf("") {
		t.Fatalf("FrontendBindingUnionTypes() = %#v, want []reflect.Type{reflect.TypeOf(\"\")}", got)
	}
}

func TestFrontendBindingOwnerMetadataProviderSupportsPointerInputType(t *testing.T) {
	t.Parallel()

	provider, ok := frontendBindingOwnerMetadataProvider[frontendBindingTypeScriptExprProvider](reflect.TypeOf(&testValueTypeMetadata{}))
	if !ok {
		t.Fatal("expected pointer input type to resolve")
	}
	if got := provider.FrontendBindingTypeScriptExpr(); got != "test-value-expr" {
		t.Fatalf("FrontendBindingTypeScriptExpr() = %q, want %q", got, "test-value-expr")
	}
}
