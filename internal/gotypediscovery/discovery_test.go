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

func TestDiscoverPackageTypesInDirWithOptionsRequireJSONTagsIncludesEmbeddedOnlyStructs(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageTypesInDirWithOptions(
		filepath.Join("testdata", "embeddedjsonpkg"),
		DiscoverOptions{
			RequireJSONTaggedStructs: true,
		},
	)
	if err != nil {
		t.Fatalf("DiscoverPackageTypesInDirWithOptions(...) error = %v", err)
	}

	want := []DiscoveredType{
		{Name: "TaggedFields", Kind: TypeKindStruct},
		{Name: "EmbeddedOnlyStruct", Kind: TypeKindStruct},
		{Name: "UntaggedEmbeddedOnlyStruct", Kind: TypeKindStruct},
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
		{
			Name:              "HeaderAlias",
			Kind:              TypeKindNamed,
			IsAlias:           true,
			TargetPackagePath: "net/http",
			TargetTypeName:    "Header",
		},
		{
			Name:              "HeaderNamed",
			Kind:              TypeKindNamed,
			TargetPackagePath: "net/http",
			TargetTypeName:    "Header",
		},
		{
			Name:              "TimeAlias",
			Kind:              TypeKindNamed,
			IsAlias:           true,
			TargetPackagePath: "time",
			TargetTypeName:    "Time",
		},
		{
			Name:              "TimeNamed",
			Kind:              TypeKindNamed,
			TargetPackagePath: "time",
			TargetTypeName:    "Time",
		},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf("DiscoverPackageTypesInDir(...) = %#v, want %#v", discovered, want)
	}
}

func TestDiscoverPackageZeroArgFunctionsWithPrefixInDir(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageZeroArgFunctionsWithPrefixInDir(
		filepath.Join("testdata", "functionpkg"),
		"FrontendDefault",
	)
	if err != nil {
		t.Fatalf("DiscoverPackageZeroArgFunctionsWithPrefixInDir(...) error = %v", err)
	}

	want := []DiscoveredFunction{
		{Name: "FrontendDefaultWidget"},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf(
			"DiscoverPackageZeroArgFunctionsWithPrefixInDir(...) = %#v, want %#v",
			discovered,
			want,
		)
	}
}

func TestDiscoverPackageStringConstantsWithPrefixInDir(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageStringConstantsWithPrefixInDir(
		filepath.Join("testdata", "constpkg"),
		"Route",
	)
	if err != nil {
		t.Fatalf("DiscoverPackageStringConstantsWithPrefixInDir(...) error = %v", err)
	}

	want := []DiscoveredStringConstant{
		{Name: "RouteAPIPrefix", Value: "/api"},
		{Name: "RouteBootstrapPage", Value: "/__setta__/bootstrap"},
		{Name: "RouteSDKRuntimeHandshake", Value: "/sdkRuntimeHandshake"},
		{Name: "RouteToolsCall", Value: "/api/tools/call"},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf(
			"DiscoverPackageStringConstantsWithPrefixInDir(...) = %#v, want %#v",
			discovered,
			want,
		)
	}
}
