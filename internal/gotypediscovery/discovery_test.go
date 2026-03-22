package gotypediscovery

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestDiscoverPackageTypesInDir(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageTypesInDir(filepath.Join("testdata", "samplepkg"))
	if err != nil {
		t.Fatalf("DiscoverPackageTypesInDir(...) error = %v", err)
	}

	want := []DiscoveredType{
		{Name: "AllowedMode", Kind: TypeKindString},
		{Name: "AllowedBool", Kind: TypeKindBool},
		{Name: "AllowedNumber", Kind: TypeKindInt},
		{Name: "AllowedUnsigned", Kind: TypeKindUint},
		{Name: "AllowedFloat", Kind: TypeKindFloat},
		{Name: "AllowedSlice", Kind: TypeKindSlice},
		{Name: "AllowedArray", Kind: TypeKindArray},
		{Name: "AllowedMap", Kind: TypeKindMap},
		{Name: "AllowedStruct", Kind: TypeKindStruct},
		{Name: "AllowedInterface", Kind: TypeKindInterface},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf("DiscoverPackageTypesInDir(...) = %#v, want %#v", discovered, want)
	}
}
