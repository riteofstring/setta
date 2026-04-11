package gotypediscovery

import (
	"go/ast"
	"path/filepath"
	"reflect"
	"testing"
)

type TestWidget struct{}
type FrontendTestWidget struct{}
type TestEnvelope struct {
	Primary map[string]*FrontendTestWidget
}

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

func TestDiscoverPackageTypesInDirWithOptionsIncludesLocalNamedStructTypes(t *testing.T) {
	t.Helper()

	discovered, err := DiscoverPackageTypesInDirWithOptions(
		filepath.Join("testdata", "localnamedpkg"),
		DiscoverOptions{
			RequireJSONTaggedStructs: true,
		},
	)
	if err != nil {
		t.Fatalf("DiscoverPackageTypesInDirWithOptions(...) error = %v", err)
	}

	want := []DiscoveredType{
		{Name: "TaggedStruct", Kind: TypeKindStruct},
		{Name: "TaggedNamed", Kind: TypeKindStruct},
		{Name: "TaggedAlias", Kind: TypeKindStruct, IsAlias: true},
		{Name: "TaggedNamedChain", Kind: TypeKindStruct},
	}
	if !reflect.DeepEqual(discovered, want) {
		t.Fatalf("DiscoverPackageTypesInDirWithOptions(...) = %#v, want %#v", discovered, want)
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

func TestClassifyTypeRespectsNonStringScalarOption(t *testing.T) {
	t.Helper()

	cases := []struct {
		name     string
		typeName string
		options  DiscoverOptions
		wantKind TypeKind
		wantOK   bool
	}{
		{
			name:     "string always allowed",
			typeName: "string",
			wantKind: TypeKindString,
			wantOK:   true,
		},
		{
			name:     "bool gated by option",
			typeName: "bool",
			wantOK:   false,
		},
		{
			name:     "bool included when enabled",
			typeName: "bool",
			options:  DiscoverOptions{IncludeNonStringScalars: true},
			wantKind: TypeKindBool,
			wantOK:   true,
		},
		{
			name:     "int included when enabled",
			typeName: "int64",
			options:  DiscoverOptions{IncludeNonStringScalars: true},
			wantKind: TypeKindInt,
			wantOK:   true,
		},
		{
			name:     "uint included when enabled",
			typeName: "uint32",
			options:  DiscoverOptions{IncludeNonStringScalars: true},
			wantKind: TypeKindUint,
			wantOK:   true,
		},
		{
			name:     "float included when enabled",
			typeName: "float64",
			options:  DiscoverOptions{IncludeNonStringScalars: true},
			wantKind: TypeKindFloat,
			wantOK:   true,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Helper()

			got, ok := classifyType(
				ast.NewIdent(tc.typeName),
				tc.options,
				nil,
				map[string]bool{},
			)
			if ok != tc.wantOK || got != tc.wantKind {
				t.Fatalf(
					"classifyType(%q) = (%q, %t), want (%q, %t)",
					tc.typeName,
					got,
					ok,
					tc.wantKind,
					tc.wantOK,
				)
			}
		})
	}
}

func TestClassifyTypeFollowsLocalNamedTypeChains(t *testing.T) {
	t.Helper()

	localTypes := map[string]*ast.TypeSpec{
		"Inner": {
			Name: ast.NewIdent("Inner"),
			Type: &ast.StructType{
				Fields: &ast.FieldList{
					List: []*ast.Field{
						{
							Names: []*ast.Ident{ast.NewIdent("Value")},
							Type:  ast.NewIdent("string"),
						},
					},
				},
			},
		},
		"Alias": {
			Name: ast.NewIdent("Alias"),
			Type: ast.NewIdent("Inner"),
		},
	}

	got, ok := classifyType(
		ast.NewIdent("Alias"),
		DiscoverOptions{},
		localTypes,
		map[string]bool{},
	)
	if !ok || got != TypeKindStruct {
		t.Fatalf("classifyType(local alias) = (%q, %t), want (%q, true)", got, ok, TypeKindStruct)
	}
}

func TestPreferredFrontendContractNameTypesPrefersFrontendVariants(t *testing.T) {
	t.Helper()

	types := preferredFrontendContractNameTypes([]reflect.Type{
		reflect.TypeOf(TestWidget{}),
		reflect.TypeOf(FrontendTestWidget{}),
	})

	want := []reflect.Type{reflect.TypeOf(FrontendTestWidget{})}
	if !reflect.DeepEqual(types, want) {
		t.Fatalf("preferredFrontendContractNameTypes(...) = %#v, want %#v", types, want)
	}
}

func TestFrontendContractTypeCollectorCollectsNestedNamedTypes(t *testing.T) {
	t.Helper()

	collector := newFrontendContractTypeCollector()
	collector.visit(reflect.TypeOf(TestEnvelope{}))

	got := collector.sortedTypes()
	want := []reflect.Type{
		reflect.TypeOf(FrontendTestWidget{}),
		reflect.TypeOf(TestEnvelope{}),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("collector.sortedTypes() = %#v, want %#v", got, want)
	}
}
