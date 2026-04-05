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

func TestOwnerBackedReflectedObjectDeclarationUsesFieldCreateExprTagsInCreateBody(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(agentruns.RunEvent{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateBody == "" {
		t.Fatalf("%s CreateBody is empty", declaration.Name)
	}
	if !strings.Contains(declaration.CreateBody, "timestamp: options.timestamp ?? \"\"") {
		t.Fatalf("%s CreateBody missing timestamp tag override:\n%s", declaration.Name, declaration.CreateBody)
	}
}

func TestOwnerBackedReflectedObjectDeclarationUsesNullableFieldCreateExprTagsInCreateBody(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(settingsstate.FrontendSettingsBackend{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateBody == "" {
		t.Fatalf("%s CreateBody is empty", declaration.Name)
	}
	if !strings.Contains(
		declaration.CreateBody,
		"defaultTerminalShell: options.defaultTerminalShell === null ? null : (options.defaultTerminalShell ?? null)",
	) {
		t.Fatalf("%s CreateBody missing nullable ts_create_expr override:\n%s", declaration.Name, declaration.CreateBody)
	}
}

func TestOwnerBackedReflectedObjectDeclarationUsesMapValueCreateTags(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(projectview.SectionCodegenPolicy{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.CreateBody == "" {
		t.Fatalf("%s CreateBody is empty", declaration.Name)
	}
	if !strings.Contains(declaration.CreateBody, "Object.fromEntries(") {
		t.Fatalf("%s CreateBody missing map merge logic:\n%s", declaration.Name, declaration.CreateBody)
	}
	if !strings.Contains(declaration.CreateBody, "createSectionTypeCodegenPolicy") {
		t.Fatalf("%s CreateBody missing generated map value create call:\n%s", declaration.Name, declaration.CreateBody)
	}
}

func TestDiscriminatedObjectFamiliesSkipUnusedTraitDeclarations(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	for _, root := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v): %v", root, err)
		}
	}
	extraDeclarations, err := CurrentAdditionalDeclarations(converter)
	if err != nil {
		t.Fatalf("CurrentAdditionalDeclarations(): %v", err)
	}
	declarations := append(converter.Declarations(), extraDeclarations...)

	assertNoTypeDeclaration(t, declarations, "BaseDictSectionImplUnion")
	assertNoTypeDeclaration(t, declarations, "isBaseDictSectionImpl")
	assertNoTypeDeclaration(t, declarations, "ControlCodeObjTypeSet")
	assertNoTypeDeclaration(t, declarations, "SectionParamCodeObjTypeSet")

	for _, declarationName := range []string{
		"BaseParentSectionImplTypeSet",
		"BaseSectionWithParamsImplTypeSet",
		"BaseParamCodeObjImplTypeSet",
		"BaseParentCodeObjImplTypeSet",
	} {
		declaration := findTypeDeclaration(t, declarations, declarationName)
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
		declaration := findTypeDeclaration(t, declarations, declarationName)
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
	for _, root := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(root); err != nil {
			t.Fatalf("AddRootType(%v): %v", root, err)
		}
	}
	extraDeclarations, err := CurrentAdditionalDeclarations(converter)
	if err != nil {
		t.Fatalf("CurrentAdditionalDeclarations(): %v", err)
	}
	declarations, err := applySemanticSidecarCreateBodies(converter, converter.Declarations())
	if err != nil {
		t.Fatalf("applySemanticSidecarCreateBodies(): %v", err)
	}
	declaration := findTypeDeclaration(
		t,
		replaceStructuralDeclarationsWithOpenAPIAliases(append(declarations, extraDeclarations...)),
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

func TestUnionTypeProvidersGenerateAliasDeclarations(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(projectview.ProjectCodegenTarget{})
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}

	declaration := findTypeDeclaration(t, converter.Declarations(), frontendBindingTypeName(typ))
	if declaration.Kind != "alias" {
		t.Fatalf("%s kind = %q, want %q", declaration.Name, declaration.Kind, "alias")
	}
	wantAlias := "ProjectCodegenPythonTarget\n  | ProjectCodegenPluginTarget"
	if declaration.Alias != wantAlias {
		t.Fatalf("%s alias = %q, want %q", declaration.Name, declaration.Alias, wantAlias)
	}
}

func TestEnumDeclarationsComeFromSemanticSidecar(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	typ := reflect.TypeOf(projectstate.FrontendSectionType(""))
	if err := converter.ensureDeclaration(typ); err != nil {
		t.Fatalf("ensureDeclaration(%v): %v", typ, err)
	}
	assertNoTypeDeclaration(t, converter.Declarations(), "SectionType")

	extraDeclarations, err := CurrentAdditionalDeclarations(converter)
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

func TestBuildGoBackedCreateBodyTSRestoresOmitEmptyDefaultsFromStructFields(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	propertySpecs, err := converter.structPropertySpecs(reflect.TypeOf(testOmitEmptyDefaults{}), nil, nil, nil)
	if err != nil {
		t.Fatalf("structPropertySpecs(testOmitEmptyDefaults): %v", err)
	}

	createBody, err := buildGoBackedCreateBodyTS(
		"test omit empty defaults",
		"TestOmitEmptyDefaults",
		testOmitEmptyDefaults{},
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

func TestBuildGoBackedCreateBodyTSRestoresNestedOmitEmptyDefaults(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	propertySpecs, err := converter.structPropertySpecs(reflect.TypeOf(testNestedOmitEmptyDefaults{}), nil, nil, nil)
	if err != nil {
		t.Fatalf("structPropertySpecs(testNestedOmitEmptyDefaults): %v", err)
	}

	createBody, err := buildGoBackedCreateBodyTS(
		"test nested omit empty defaults",
		"TestNestedOmitEmptyDefaults",
		testNestedOmitEmptyDefaults{},
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
