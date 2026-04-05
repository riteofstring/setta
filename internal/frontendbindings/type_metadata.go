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
	properties, err := generatedSectionImplAliasProperties(
		converter,
		reflect.TypeOf(projectstate.FrontendDictSectionImpl{}),
		"Dict",
	)
	if err != nil {
		panic(err)
	}
	properties = append([]TypeProperty(nil), properties...)
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
	"id":                      {},
	"name":                    {},
	"isInOtherProjectConfigs": {},
	"aspectRatioExtraHeight":  {},
	"aspectRatioExtraWidth":   {},
	"isPreset":                {},
	"children":                {},
	"promptTemplateId":        {},
	"type":                    {},
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
	declaration, err := generatedSectionImplAliasDeclaration(converter, t, sectionName)
	if err != nil {
		panic(err)
	}
	return declaration, true
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
	declaration, err := generatedCodeObjImplAliasDeclaration(
		converter,
		t,
		strings.TrimSuffix(implName, "CodeObjImpl"),
	)
	if err != nil {
		panic(err)
	}
	return declaration, true
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
) (TypeDeclaration, error) {
	properties, err := generatedSectionImplAliasProperties(converter, t, sectionName)
	if err != nil {
		return TypeDeclaration{}, err
	}
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		"BaseSectionImpl",
		properties,
	), nil
}

func generatedCodeObjImplAliasDeclaration(
	converter *typeConverter,
	t reflect.Type,
	codeObjName string,
) (TypeDeclaration, error) {
	properties, err := generatedCodeObjImplAliasProperties(converter, t, codeObjName)
	if err != nil {
		return TypeDeclaration{}, err
	}
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		"BaseCodeObjImpl",
		properties,
	), nil
}

func generatedSectionImplAliasProperties(
	converter *typeConverter,
	t reflect.Type,
	sectionName string,
) ([]TypeProperty, error) {
	properties, err := generatedConcreteSectionProperties(converter, t, sectionName)
	if err != nil {
		return nil, err
	}
	return generatedAliasProperties(
		generatedBaseSectionImplDeclaration(converter).Properties,
		properties,
	), nil
}

func generatedCodeObjImplAliasProperties(
	converter *typeConverter,
	t reflect.Type,
	codeObjName string,
) ([]TypeProperty, error) {
	properties, err := generatedConcreteCodeObjProperties(converter, t, codeObjName)
	if err != nil {
		return nil, err
	}
	return generatedAliasProperties(
		generatedBaseCodeObjImplDeclaration(converter).Properties,
		properties,
	), nil
}

func generatedBaseSectionOptionalProperties(
	converter *typeConverter,
	coreProperties []TypeProperty,
) []TypeProperty {
	return generatedMergedOptionalProperties(
		coreProperties,
		generatedSectionImplTypes(),
		func(t reflect.Type) ([]TypeProperty, error) {
			sectionName, ok := generatedSectionImplName(t)
			if !ok {
				return nil, nil
			}
			return generatedConcreteSectionProperties(converter, t, sectionName)
		},
	)
}

func generatedBaseCodeObjOptionalProperties(
	converter *typeConverter,
	coreProperties []TypeProperty,
) []TypeProperty {
	return generatedMergedOptionalProperties(
		coreProperties,
		generatedCodeObjImplTypes(),
		func(t reflect.Type) ([]TypeProperty, error) {
			codeObjName, ok := generatedCodeObjImplName(t)
			if !ok {
				return nil, nil
			}
			return generatedConcreteCodeObjProperties(
				converter,
				t,
				strings.TrimSuffix(codeObjName, "CodeObjImpl"),
			)
		},
	)
}

func mustGeneratedSectionBaseCoreProperties(converter *typeConverter) []TypeProperty {
	properties, err := converter.structProperties(
		reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}),
		nil,
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
		nil,
		nil,
		nil,
	)
	if err != nil {
		panic(err)
	}
	return properties
}

func generatedPropertyMap(properties []TypeProperty) map[string]TypeProperty {
	names := make(map[string]TypeProperty, len(properties))
	for _, property := range properties {
		names[property.Name] = property
	}
	return names
}

func generatedAliasProperties(
	baseProperties []TypeProperty,
	properties []TypeProperty,
) []TypeProperty {
	baseByName := generatedPropertyMap(baseProperties)
	filtered := make([]TypeProperty, 0, len(properties))
	for _, property := range properties {
		baseProperty, ok := baseByName[property.Name]
		if !ok ||
			baseProperty.TypeExpr != property.TypeExpr ||
			baseProperty.Optional != property.Optional {
			filtered = append(filtered, property)
		}
	}
	return filtered
}

func generatedMergedOptionalProperties(
	coreProperties []TypeProperty,
	types []reflect.Type,
	propertiesForType func(reflect.Type) ([]TypeProperty, error),
) []TypeProperty {
	coreByName := generatedPropertyMap(coreProperties)
	order := []string{}
	merged := map[string]*TypeProperty{}
	typeExprsByName := map[string][]string{}
	seenTypeExprsByName := map[string]map[string]struct{}{}

	for _, t := range types {
		properties, err := propertiesForType(t)
		if err != nil {
			panic(err)
		}
		for _, property := range properties {
			if _, ok := coreByName[property.Name]; ok {
				continue
			}
			spec, ok := merged[property.Name]
			if !ok {
				property.Optional = true
				copyProperty := property
				merged[property.Name] = &copyProperty
				typeExprsByName[property.Name] = []string{}
				seenTypeExprsByName[property.Name] = map[string]struct{}{}
				order = append(order, property.Name)
				spec = &copyProperty
			}
			spec.Optional = true
			if _, seen := seenTypeExprsByName[property.Name][property.TypeExpr]; seen {
				continue
			}
			seenTypeExprsByName[property.Name][property.TypeExpr] = struct{}{}
			typeExprsByName[property.Name] = append(typeExprsByName[property.Name], property.TypeExpr)
		}
	}
	properties := make([]TypeProperty, 0, len(order))
	for _, name := range order {
		property := *merged[name]
		property.TypeExpr = strings.Join(typeExprsByName[name], " | ")
		properties = append(properties, property)
	}
	return properties
}

func generatedConcreteSectionProperties(
	converter *typeConverter,
	t reflect.Type,
	sectionName string,
) ([]TypeProperty, error) {
	return converter.structProperties(
		t,
		map[string]string{
			"type": "typeof " + generatedSectionImplTypeExpr(sectionName),
		},
		nil,
		nil,
	)
}

func generatedConcreteCodeObjProperties(
	converter *typeConverter,
	t reflect.Type,
	codeObjName string,
) ([]TypeProperty, error) {
	return converter.structProperties(
		t,
		map[string]string{
			"type": "typeof CodeObjTypeEnum." + codeObjName,
		},
		nil,
		nil,
	)
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

func generatedSectionImplTypes() []reflect.Type {
	types := []reflect.Type{}
	for _, sectionName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendSectionType("")),
	) {
		t, ok := generatedSectionImplTypeForSectionName(sectionName)
		if !ok {
			continue
		}
		types = append(types, t)
	}
	return types
}

func generatedCodeObjImplTypes() []reflect.Type {
	types := []reflect.Type{}
	for _, codeObjName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendCodeObjType("")),
	) {
		t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName)
		if !ok {
			continue
		}
		types = append(types, t)
	}
	return types
}
