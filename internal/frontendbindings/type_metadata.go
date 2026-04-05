package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

func typeMetadataDeclarations(converter *typeConverter) []TypeDeclaration {
	return []TypeDeclaration{
		aliasDeclaration("BuiltinCodeLanguage", "CodeLanguage"),
		aliasDeclaration("MessageContentDelta", "MessageTextDelta | MessageThinkingDelta"),
		aliasDeclaration(
			"LLMStreamingResponseChunk",
			"MessageStartEvent | MessageDeltaEvent | ToolCallDeltaEvent | ToolResultEvent | ToolArgumentPreviewDeltaEvent | MessageStopEvent | MessageFinalizedEvent",
		),
		aliasDeclarationWithCreateExpr(
			"ViewModeConfig",
			"ViewMode",
			"createViewMode(options)",
		),
		aliasDeclaration(
			"JSONValue",
			"null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
		),
		aliasDeclaration(
			"MessageContent",
			"MessageTextContent | MessageImageURLContent | MessageThinkingContent",
		),
		aliasDeclaration(
			"BaseChatMessageUnion",
			"SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage",
		),
		aliasDeclaration(
			"BaseChartSettingsUnion",
			"LineChartSettings | ScatterChartSettings",
		),
		aliasDeclaration(
			"ProjectCodegenTarget",
			"ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
		),
		generatedBaseParentSectionImplUnionDeclaration(converter),
		generatedBaseSectionWithParamsImplUnionDeclaration(converter),
		generatedBaseDictSectionImplUnionDeclaration(converter),
		generatedBaseSectionImplUnionDeclaration(),
		generatedCodeObjUnionDeclaration("BaseCodeObjImplUnion", true, nil),
		generatedCodeObjUnionDeclaration(
			"BaseChildlessCodeObjImplUnion",
			true,
			generatedCodeObjImplIsChildless,
		),
		generatedCodeObjUnionDeclaration(
			"BaseParamCodeObjImplUnion",
			true,
			generatedCodeObjImplIsParam,
		),
		generatedCodeObjUnionDeclaration(
			"BaseParentCodeObjImplUnion",
			false,
			generatedCodeObjImplHasChildren,
		),
	}
}

var specialMetadataDeclarations = map[reflect.Type]TypeDeclaration{
	reflect.TypeOf(realtime.BaseDependencyKeyUnion{}): aliasDeclaration(
		"BaseDependencyKeyUnion",
		"SectionDependencyKey | SectionParamDependencyKey",
	),
	reflect.TypeOf(realtime.BaseDependencyValueUnion{}): aliasDeclaration(
		"BaseDependencyValueUnion",
		"LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue",
	),
	reflect.TypeOf(projectstate.SectionSizeValue{}): aliasDeclaration(
		"SectionSizeValue",
		"number | SectionSizeMode",
	),
	reflect.TypeOf(httpapi.BinaryUploadRequest{}): aliasDeclaration(
		"BinaryUploadRequest",
		"FormData",
	),
	reflect.TypeOf(httpapi.BinaryDownloadResponse{}): aliasDeclaration(
		"BinaryDownloadResponse",
		"Uint8Array",
	),
}

func specialMetadataTypeDeclaration(converter *typeConverter, t reflect.Type) (TypeDeclaration, bool) {
	if declaration, ok := specialMetadataDeclarations[t]; ok {
		return declaration, true
	}
	if declaration, ok := generatedConcreteSectionMetadataDeclaration(converter, t); ok {
		return declaration, true
	}
	return generatedConcreteCodeObjMetadataDeclaration(converter, t)
}

func generatedBaseParentSectionImplUnionDeclaration(converter *typeConverter) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		"BaseParentSectionImplUnion",
		"BaseSectionImpl",
		[]TypeProperty{{Name: "children", TypeExpr: "Array<string>"}},
	)
}

func generatedBaseSectionWithParamsImplUnionDeclaration(converter *typeConverter) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		"BaseSectionWithParamsImplUnion",
		"BaseSectionImpl",
		[]TypeProperty{{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>"}},
	)
}

func generatedBaseDictSectionImplUnionDeclaration(converter *typeConverter) TypeDeclaration {
	properties := append(
		[]TypeProperty(nil),
		generatedSectionImplAliasProperties(
			converter,
			reflect.TypeOf(projectstate.FrontendDictSectionImpl{}),
			"Dict",
		)...,
	)
	for index := range properties {
		if properties[index].Name == "type" {
			properties[index].TypeExpr = "typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables"
			break
		}
	}
	return aliasIntersectionDeclarationFromProperties(
		"BaseDictSectionImplUnion",
		"BaseSectionImpl",
		properties,
	)
}

func generatedBaseSectionImplUnionDeclaration() TypeDeclaration {
	members := append(generatedSectionImplTypeNames(), "BaseSectionImpl")
	return aliasUnionDeclaration("BaseSectionImplUnion", members...)
}

func generatedSectionImplTypeNames() []string {
	names := []string{}
	for _, sectionName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendSectionType("")),
	) {
		if t, ok := generatedSectionImplTypeForSectionName(sectionName); ok {
			names = append(names, frontendBindingTypeName(t))
		}
	}
	return names
}

func generatedCodeObjUnionDeclaration(
	name string,
	includeBase bool,
	predicate func(reflect.Type) bool,
) TypeDeclaration {
	members := make([]string, 0, 16)
	if includeBase {
		members = append(members, "BaseCodeObjImpl")
	}
	members = append(members, generatedCodeObjImplTypeNamesMatching(predicate)...)
	return aliasUnionDeclaration(name, members...)
}

func generatedCodeObjImplTypeNames() []string {
	return generatedCodeObjImplTypeNamesMatching(nil)
}

func generatedCodeObjImplTypeNamesMatching(predicate func(reflect.Type) bool) []string {
	names := []string{}
	for _, codeObjName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendCodeObjType("")),
	) {
		t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName)
		if !ok {
			continue
		}
		if predicate != nil && !predicate(t) {
			continue
		}
		names = append(names, frontendBindingTypeName(t))
	}
	return names
}

var generatedUserDefaultSectionIgnoredDefaultProperties = map[string]struct{}{
	"name":                    {},
	"isInOtherProjectConfigs": {},
	"aspectRatioExtraHeight":  {},
	"aspectRatioExtraWidth":   {},
	"isPreset":                {},
	"children":                {},
	"promptTemplateId":        {},
}

var generatedBaseSectionOptionalPropertySeeds = []reflect.Type{
	reflect.TypeOf(projectstate.FrontendListRootSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendCallableSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendDictSectionImpl{}),
	reflect.TypeOf(projectstate.ChatSectionState{}),
	reflect.TypeOf(projectstate.FrontendCodeSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendBrowserSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendGroupSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendSpreadsheetSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendTextBlockSectionImpl{}),
	reflect.TypeOf(projectstate.FrontendChartSectionImpl{}),
}

var generatedBaseSectionOptionalIgnoredProperties = map[string]struct{}{
	"callable":               {},
	"hideParams":             {},
	"activeBranchId":         {},
	"branches":               {},
	"diagnosticsIgnoreState": {},
	"typesColumnWidth":       {},
	"savedSearches":          {},
	"format":                 {},
	"masterFontSizePx":       {},
	"headingAsSectionName":   {},
	"textDisplayMode":        {},
}

var generatedBaseSectionOptionalPropertyTypeOverrides = map[string]string{
	"configLanguage": "string",
	"density":        "string",
}

var generatedBaseCodeObjOptionalPropertySeeds = []reflect.Type{
	reflect.TypeOf(projectstate.FrontendCodeCallableCodeObjImpl{}),
	reflect.TypeOf(projectstate.FrontendCodeParamCodeObjImpl{}),
}

func generatedConcreteSectionMetadataDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool) {
	if t == reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}) {
		return generatedBaseSectionImplDeclaration(converter), true
	}
	sectionName, ok := generatedSectionImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	return generatedSectionImplAliasDeclaration(converter, t, sectionName), true
}

func generatedConcreteCodeObjMetadataDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool) {
	if t == reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{}) {
		return generatedBaseCodeObjImplDeclaration(converter), true
	}
	implName, ok := generatedCodeObjImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	return generatedCodeObjImplAliasDeclaration(
		converter,
		t,
		strings.TrimSuffix(implName, "CodeObjImpl"),
	), true
}

func generatedBaseSectionImplDeclaration(converter *typeConverter) TypeDeclaration {
	coreProperties := mustGeneratedSectionBaseCoreProperties(converter)
	extraProperties := generatedBaseSectionOptionalProperties(converter, coreProperties)
	return objectDeclaration("BaseSectionImpl", append(coreProperties, extraProperties...)...)
}

func generatedBaseCodeObjImplDeclaration(converter *typeConverter) TypeDeclaration {
	coreProperties := mustGeneratedCodeObjBaseCoreProperties(converter)
	extraProperties := generatedBaseCodeObjOptionalProperties(converter, coreProperties)
	return aliasObjectDeclarationFromProperties(
		"BaseCodeObjImpl",
		append(coreProperties, extraProperties...),
		"[key: string]: unknown;",
	)
}

func generatedSectionImplAliasDeclaration(
	converter *typeConverter,
	t reflect.Type,
	sectionName string,
) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		generatedSectionImplAliasBaseExpr(sectionName),
		generatedSectionImplAliasProperties(converter, t, sectionName),
	)
}

func generatedCodeObjImplAliasDeclaration(
	converter *typeConverter,
	t reflect.Type,
	codeObjName string,
) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		"BaseCodeObjImpl",
		generatedCodeObjImplAliasProperties(converter, t, codeObjName),
	)
}

func generatedSectionImplAliasBaseExpr(sectionName string) string {
	switch sectionName {
	case "Chat":
		return "BaseSectionImpl & ChatSectionState"
	case "Browser", "TaskBoard":
		return `Omit<BaseSectionImpl, "viewMode">`
	default:
		return "BaseSectionImpl"
	}
}

func generatedSectionImplAliasProperties(
	converter *typeConverter,
	t reflect.Type,
	sectionName string,
) []TypeProperty {
	properties := mustGeneratedReflectedProperties(converter, t)
	baseNames := generatedPropertyNameSet(mustGeneratedSectionBaseCoreProperties(converter))
	excludedNames := map[string]struct{}{}
	if sectionName == "Chat" {
		excludedNames = generatedPropertyNameSet(
			mustGeneratedReflectedProperties(converter, reflect.TypeOf(projectstate.ChatSectionState{})),
		)
	}

	filtered := make([]TypeProperty, 0, len(properties))
	for _, property := range properties {
		if property.Name != "type" {
			if _, ok := baseNames[property.Name]; ok {
				continue
			}
			if _, ok := excludedNames[property.Name]; ok {
				continue
			}
		}
		filtered = append(filtered, property)
	}
	return filtered
}

func generatedCodeObjImplAliasProperties(
	converter *typeConverter,
	t reflect.Type,
	_ string,
) []TypeProperty {
	properties := mustGeneratedReflectedProperties(converter, t)
	baseNames := generatedPropertyNameSet(mustGeneratedCodeObjBaseCoreProperties(converter))

	filtered := make([]TypeProperty, 0, len(properties))
	for _, property := range properties {
		if property.Name != "type" {
			if _, ok := baseNames[property.Name]; ok {
				continue
			}
		}
		filtered = append(filtered, property)
	}
	return filtered
}

func generatedBaseSectionOptionalProperties(
	converter *typeConverter,
	coreProperties []TypeProperty,
) []TypeProperty {
	properties := generatedSeedOptionalProperties(
		converter,
		coreProperties,
		generatedBaseSectionOptionalPropertySeeds,
		generatedBaseSectionOptionalIgnoredProperties,
		generatedBaseSectionOptionalPropertyTypeOverrides,
	)
	return append(properties, generatedBaseSectionSyntheticOptionalProperties()...)
}

func generatedBaseCodeObjOptionalProperties(
	converter *typeConverter,
	coreProperties []TypeProperty,
) []TypeProperty {
	return generatedSeedOptionalProperties(
		converter,
		coreProperties,
		generatedBaseCodeObjOptionalPropertySeeds,
		nil,
		nil,
	)
}

func mustGeneratedSectionBaseCoreProperties(converter *typeConverter) []TypeProperty {
	properties, err := converter.structProperties(
		reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}),
		map[string]string{
			"type":        "SectionType",
			"aspectRatio": "boolean | number",
		},
		nil,
		nil,
	)
	if err != nil {
		panic(err)
	}
	return properties
}

func mustGeneratedCodeObjBaseCoreProperties(converter *typeConverter) []TypeProperty {
	properties, err := converter.structProperties(
		reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{}),
		map[string]string{
			"type": "CodeObjType",
		},
		nil,
		nil,
	)
	if err != nil {
		panic(err)
	}
	return properties
}

func mustGeneratedReflectedProperties(converter *typeConverter, t reflect.Type) []TypeProperty {
	properties, err := generatedUserDefaultReflectedProperties(converter, t)
	if err != nil {
		panic(err)
	}
	return properties
}

func generatedPropertyNameSet(properties []TypeProperty) map[string]struct{} {
	names := make(map[string]struct{}, len(properties))
	for _, property := range properties {
		names[property.Name] = struct{}{}
	}
	return names
}

func generatedSeedOptionalProperties(
	converter *typeConverter,
	coreProperties []TypeProperty,
	seeds []reflect.Type,
	ignoredNames map[string]struct{},
	typeOverrides map[string]string,
) []TypeProperty {
	coreNames := generatedPropertyNameSet(coreProperties)
	properties := make([]TypeProperty, 0, len(seeds)*4)
	seen := make(map[string]struct{}, len(coreNames))

	for name := range coreNames {
		seen[name] = struct{}{}
	}
	for _, seed := range seeds {
		for _, property := range mustGeneratedReflectedProperties(converter, seed) {
			if _, ok := seen[property.Name]; ok {
				continue
			}
			if _, ok := ignoredNames[property.Name]; ok {
				continue
			}
			property.Optional = true
			if override, ok := typeOverrides[property.Name]; ok {
				property.TypeExpr = override
			}
			properties = append(properties, property)
			seen[property.Name] = struct{}{}
		}
	}
	return properties
}

func generatedBaseSectionSyntheticOptionalProperties() []TypeProperty {
	return []TypeProperty{
		{Name: "metaControlParamId", TypeExpr: "string | null", Optional: true},
		{Name: "showSectionTitle", TypeExpr: "boolean", Optional: true},
		{Name: "pluginId", TypeExpr: "string", Optional: true},
		{Name: "kind", TypeExpr: "string", Optional: true},
		{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
		{Name: "schemaVersion", TypeExpr: "number | null", Optional: true},
		{Name: "imagePath", TypeExpr: "string", Optional: true},
	}
}

func mustGeneratedEnumValues(t reflect.Type) []string {
	values, ok, err := frontendBindingEnumValues(t)
	if err != nil {
		panic("resolve enum values for " + t.String() + ": " + err.Error())
	}
	if !ok {
		panic("enum values unavailable for " + t.String())
	}
	names := make([]string, 0, len(values))
	for _, value := range values {
		names = append(names, value.Value)
	}
	return names
}

func generatedCodeObjImplTypeForCodeObjName(codeObjName string) (reflect.Type, bool) {
	implName := codeObjName + "CodeObjImpl"
	for _, t := range DiscoveredConvertibleTypes() {
		name, ok := generatedCodeObjImplName(t)
		if ok && name == implName {
			return t, true
		}
	}
	return nil, false
}
