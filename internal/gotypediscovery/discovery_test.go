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

func TestDiscoverPackageTypesInDirWithOptionsRequireJSONTags(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageTypesInDirWithOptions(
		filepath.Join("testdata", "samplejsonpkg"),
		DiscoverOptions{
			RequireJSONTaggedStructs: true,
		},
	)
	if err != nil {
		t.Fatalf("DiscoverPackageTypesInDirWithOptions(...) error = %v", err)
	}

	want := []DiscoveredType{
		{Name: "TaggedStruct", Kind: TypeKindStruct},
		{Name: "TaggedString", Kind: TypeKindString},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf(
			"DiscoverPackageTypesInDirWithOptions(...) = %#v, want %#v",
			discovered,
			want,
		)
	}
}

func TestDiscoverPackageTypesInDirIncludesSelectorBackedNamedTypes(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageTypesInDir(
		filepath.Join("testdata", "selectoraliaspkg"),
	)
	if err != nil {
		t.Fatalf("DiscoverPackageTypesInDir(...) error = %v", err)
	}

	want := []DiscoveredType{
		{Name: "HeaderAlias", Kind: TypeKindNamed},
		{Name: "HeaderNamed", Kind: TypeKindNamed},
		{Name: "TimeAlias", Kind: TypeKindNamed},
		{Name: "TimeNamed", Kind: TypeKindNamed},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf("DiscoverPackageTypesInDir(...) = %#v, want %#v", discovered, want)
	}
}
