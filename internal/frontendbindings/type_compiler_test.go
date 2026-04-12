package frontendbindings

import (
	"reflect"
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/frontendbindingmeta"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

func TestCanonicalFrontendBindingTypeUsesRealtimeMirrorForPythonSDKTypes(t *testing.T) {
	t.Parallel()

	got := canonicalFrontendBindingType(reflect.TypeOf(pythonsdkcontracts.ListenerRealtimeDelta{}))
	want := reflect.TypeOf(realtime.ListenerRealtimeDelta{})
	if got != want {
		t.Fatalf("canonicalFrontendBindingType(ListenerRealtimeDelta) = %v, want %v", got, want)
	}
}

func TestCanonicalFrontendBindingTypeLeavesOwnerTypesUnchanged(t *testing.T) {
	t.Parallel()

	typ := reflect.TypeOf(realtime.ListenerRealtimeDelta{})
	if got := canonicalFrontendBindingType(typ); got != typ {
		t.Fatalf("canonicalFrontendBindingType(%v) = %v, want unchanged", typ, got)
	}
}

func TestSemanticDefaultValueForTypePreservesInitializedCollections(t *testing.T) {
	t.Parallel()

	viewModeValue, ok, err := semanticDefaultValueForType(
		reflect.TypeOf(projectstate.ViewMode{}),
		semanticDefaultProfileFrontend,
	)
	if err != nil {
		t.Fatalf("semanticDefaultValueForType(ViewMode): %v", err)
	}
	if !ok {
		t.Fatalf("semanticDefaultValueForType(ViewMode) returned no default")
	}
	viewMode, ok := viewModeValue.(projectstate.ViewMode)
	if !ok {
		t.Fatalf("semanticDefaultValueForType(ViewMode) type = %T, want projectstate.ViewMode", viewModeValue)
	}
	if viewMode.VisibilityBySectionID == nil {
		t.Fatalf("ViewMode visibility map should stay initialized")
	}
	if viewMode.TopLevelSections == nil {
		t.Fatalf("ViewMode top-level sections map should stay initialized")
	}

	singleConfigValue, ok, err := semanticDefaultValueForType(
		reflect.TypeOf(projectview.SingleConfig{}),
		semanticDefaultProfileFrontend,
	)
	if err != nil {
		t.Fatalf("semanticDefaultValueForType(SingleConfig): %v", err)
	}
	if !ok {
		t.Fatalf("semanticDefaultValueForType(SingleConfig) returned no default")
	}
	singleConfig, ok := singleConfigValue.(projectview.SingleConfig)
	if !ok {
		t.Fatalf("semanticDefaultValueForType(SingleConfig) type = %T, want projectview.SingleConfig", singleConfigValue)
	}
	if singleConfig.ArtifactGroups == nil {
		t.Fatalf("SingleConfig artifact groups should stay initialized")
	}
}

func TestGoBackedCreateFunctionUsesFieldCreateExprTagsInCreateBody(t *testing.T) {
	t.Parallel()

	declaration := goBackedCreateDeclarationForTest(t, reflect.TypeOf(agentruns.RunEvent{}))
	if !strings.Contains(declaration.FunctionBody, `"timestamp": options["timestamp"] ?? ""`) {
		t.Fatalf("%s body missing timestamp tag override:\n%s", declaration.Name, declaration.FunctionBody)
	}
}

func TestGoBackedCreateFunctionUsesNullableFieldCreateExprTagsInCreateBody(t *testing.T) {
	t.Parallel()

	declaration := goBackedCreateDeclarationForTest(t, reflect.TypeOf(settingsstate.FrontendSettingsBackend{}))
	if !strings.Contains(
		declaration.FunctionBody,
		`"defaultTerminalShell": options["defaultTerminalShell"] === null ? null : (options["defaultTerminalShell"] ?? null)`,
	) {
		t.Fatalf("%s body missing nullable ts_create_expr override:\n%s", declaration.Name, declaration.FunctionBody)
	}
}

func TestGoBackedCreateFunctionUsesMapValueCreateTags(t *testing.T) {
	t.Parallel()

	declaration := goBackedCreateDeclarationForTest(t, reflect.TypeOf(projectview.SectionCodegenPolicy{}))
	if !strings.Contains(declaration.FunctionBody, "Object.fromEntries(") {
		t.Fatalf("%s body missing map merge logic:\n%s", declaration.Name, declaration.FunctionBody)
	}
	if !strings.Contains(declaration.FunctionBody, "createSectionTypeCodegenPolicy") {
		t.Fatalf("%s body missing generated map value create call:\n%s", declaration.Name, declaration.FunctionBody)
	}
}

func TestDiscriminatedObjectFamiliesSkipUnusedTraitDeclarations(t *testing.T) {
	t.Parallel()

	extraDeclarations, err := CurrentAdditionalDeclarations()
	if err != nil {
		t.Fatalf("CurrentAdditionalDeclarations(): %v", err)
	}

	assertNoTypeDeclaration(t, extraDeclarations, "BaseDictSectionImplUnion")
	assertNoTypeDeclaration(t, extraDeclarations, "isBaseDictSectionImpl")
	assertNoTypeDeclaration(t, extraDeclarations, "ControlCodeObjTypeSet")
	assertNoTypeDeclaration(t, extraDeclarations, "SectionParamCodeObjTypeSet")

	for _, declarationName := range []string{
		"BaseParentSectionImplTypeSet",
		"BaseSectionWithParamsImplTypeSet",
		"BaseParamCodeObjImplTypeSet",
		"BaseParentCodeObjImplTypeSet",
	} {
		declaration := findTypeDeclaration(t, extraDeclarations, declarationName)
		if declaration.Kind != "set" {
			t.Fatalf("%s kind = %q, want %q", declarationName, declaration.Kind, "set")
		}
		if declaration.Exported {
			t.Fatalf("%s should stay local to generated guards", declarationName)
		}
	}
	for _, declarationName := range []string{
		"isBaseParentSectionImpl",
		"isBaseSectionWithParamsImpl",
		"isBaseParentCodeObjImpl",
	} {
		declaration := findTypeDeclaration(t, extraDeclarations, declarationName)
		if declaration.Kind != "type_guard" {
			t.Fatalf("%s kind = %q, want %q", declarationName, declaration.Kind, "type_guard")
		}
	}
}

func TestLookupProviderUsesPromotedDiscriminatedObjectFamilyMethods(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		typ      reflect.Type
		wantBase reflect.Type
	}{
		{
			name:     "section member",
			typ:      reflect.TypeOf(projectstate.FrontendChatSectionImpl{}),
			wantBase: reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}),
		},
		{
			name:     "nested code object member",
			typ:      reflect.TypeOf(projectstate.FrontendDropdownParamCodeObjImpl{}),
			wantBase: reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{}),
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](tc.typ)
			if !ok {
				t.Fatalf("LookupProvider(%v) did not find a family", tc.typ)
			}
			family := provider.FrontendBindingDiscriminatedObjectFamily()
			if got := canonicalFrontendBindingType(family.BaseType); got != tc.wantBase {
				t.Fatalf("LookupProvider(%v) base = %v, want %v", tc.typ, got, tc.wantBase)
			}
		})
	}
}

func TestDiscriminatedObjectFamilyCreateFunctionsReuseGoBackedCreateBody(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	contractDeclarations, err := semanticContractDeclarations(converter)
	if err != nil {
		t.Fatalf("semanticContractDeclarations(): %v", err)
	}
	extraDeclarations, err := CurrentAdditionalDeclarations()
	if err != nil {
		t.Fatalf("CurrentAdditionalDeclarations(): %v", err)
	}
	declaration := findTypeDeclaration(
		t,
		append(contractDeclarations, extraDeclarations...),
		"createChatSectionImpl",
	)
	if declaration.Kind != "function" {
		t.Fatalf("createChatSectionImpl kind = %q, want %q", declaration.Kind, "function")
	}
	if !strings.Contains(declaration.FunctionBody, "const defaults: ChatSectionImpl = {") {
		t.Fatalf("createChatSectionImpl should use shared defaults staging:\n%s", declaration.FunctionBody)
	}
	if !strings.Contains(declaration.FunctionBody, "createSectionSize(") {
		t.Fatalf("createChatSectionImpl should reuse nested create helpers:\n%s", declaration.FunctionBody)
	}
}

func TestSemanticContractDeclarationsAliasSharedContracts(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	declarations, err := semanticContractDeclarations(converter)
	if err != nil {
		t.Fatalf("semanticContractDeclarations(): %v", err)
	}
	declaration := findTypeDeclaration(t, declarations, frontendBindingTypeName(reflect.TypeOf(projectview.ProjectCodegenTarget{})))
	if declaration.Kind != "alias" {
		t.Fatalf("%s kind = %q, want %q", declaration.Name, declaration.Kind, "alias")
	}
	wantAlias := "gt.ProjectCodegenTarget"
	if declaration.Alias != wantAlias {
		t.Fatalf("%s alias = %q, want %q", declaration.Name, declaration.Alias, wantAlias)
	}
}

func TestEnumDeclarationsComeFromSemanticSidecar(t *testing.T) {
	t.Parallel()

	contractDeclarations, err := semanticContractDeclarations(newTypeConverter())
	if err != nil {
		t.Fatalf("semanticContractDeclarations(): %v", err)
	}
	assertNoTypeDeclaration(t, contractDeclarations, "SectionType")

	extraDeclarations, err := CurrentAdditionalDeclarations()
	if err != nil {
		t.Fatalf("CurrentAdditionalDeclarations(): %v", err)
	}
	declaration := findTypeDeclaration(t, extraDeclarations, "SectionType")
	if declaration.Kind != "enum" {
		t.Fatalf("SectionType kind = %q, want %q", declaration.Kind, "enum")
	}
	if len(declaration.EnumValues) == 0 {
		t.Fatalf("SectionType enum values are empty")
	}
}

type TestEmbeddedOmitEmptyDefaults struct {
	Enabled bool `json:"enabled,omitempty"`
}

type testOmitEmptyDefaults struct {
	TestEmbeddedOmitEmptyDefaults
	Count int `json:"count,omitempty"`
}

type TestNestedOmitEmptyDefaultsInner struct {
	Enabled bool `json:"enabled,omitempty"`
}

type testNestedOmitEmptyDefaults struct {
	Inner TestNestedOmitEmptyDefaultsInner `json:"inner"`
}

func TestBuildGoBackedCreateBodyTSUsesNormalizedZeroValueDefaults(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	propertySpecs, err := converter.structPropertySpecs(reflect.TypeOf(testOmitEmptyDefaults{}))
	if err != nil {
		t.Fatalf("structPropertySpecs(testOmitEmptyDefaults): %v", err)
	}

	createBody, err := buildGoBackedCreateBodyTS(
		"test omit empty defaults",
		"TestOmitEmptyDefaults",
		map[string]any{
			"count":   float64(0),
			"enabled": false,
		},
		propertySpecs,
	)
	if err != nil {
		t.Fatalf("buildGoBackedCreateBodyTS(testOmitEmptyDefaults): %v", err)
	}
	if !strings.Contains(createBody, "\"count\": 0") {
		t.Fatalf("create body missing zero-value omitempty int default:\n%s", createBody)
	}
	if !strings.Contains(createBody, "\"enabled\": false") {
		t.Fatalf("create body missing zero-value omitempty embedded bool default:\n%s", createBody)
	}
}

func TestBuildGoBackedCreateBodyTSUsesNormalizedNestedDefaults(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	propertySpecs, err := converter.structPropertySpecs(reflect.TypeOf(testNestedOmitEmptyDefaults{}))
	if err != nil {
		t.Fatalf("structPropertySpecs(testNestedOmitEmptyDefaults): %v", err)
	}

	createBody, err := buildGoBackedCreateBodyTS(
		"test nested omit empty defaults",
		"TestNestedOmitEmptyDefaults",
		map[string]any{
			"inner": map[string]any{
				"enabled": false,
			},
		},
		propertySpecs,
	)
	if err != nil {
		t.Fatalf("buildGoBackedCreateBodyTS(testNestedOmitEmptyDefaults): %v", err)
	}
	if !strings.Contains(createBody, "\"inner\": {") || !strings.Contains(createBody, "\"enabled\": false") {
		t.Fatalf("create body missing nested zero-value omitempty default:\n%s", createBody)
	}
}

func findTypeDeclaration(t *testing.T, declarations []TypeDeclaration, name string) TypeDeclaration {
	t.Helper()

	for _, declaration := range declarations {
		if declaration.Name == name {
			return declaration
		}
	}
	t.Fatalf("declaration %q not found", name)
	return TypeDeclaration{}
}

func assertNoTypeDeclaration(t *testing.T, declarations []TypeDeclaration, name string) {
	t.Helper()

	for _, declaration := range declarations {
		if declaration.Name == name {
			t.Fatalf("unexpected declaration %q found with kind %q", name, declaration.Kind)
		}
	}
}

func goBackedCreateDeclarationForTest(t *testing.T, typ reflect.Type) TypeDeclaration {
	t.Helper()

	defaultLiteral, ok, err := semanticDefaultLiteralForType(
		canonicalFrontendBindingType(typ),
		semanticDefaultProfileFrontend,
	)
	if err != nil {
		t.Fatalf("semanticDefaultLiteralForType(%v): %v", typ, err)
	}
	if !ok {
		t.Fatalf("semanticDefaultLiteralForType(%v) returned no default", typ)
	}

	declaration, err := newTypeConverter().goBackedCreateFunctionDeclaration(typ, defaultLiteral)
	if err != nil {
		t.Fatalf("goBackedCreateFunctionDeclaration(%v): %v", typ, err)
	}
	return declaration
}
