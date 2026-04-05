package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

var specialMetadataDeclarations = map[reflect.Type]TypeDeclaration{
	reflect.TypeOf(realtime.BaseDependencyKeyUnion{}): aliasDeclaration(
		"BaseDependencyKeyUnion",
		"SectionDependencyKey | SectionParamDependencyKey",
	),
	reflect.TypeOf(realtime.BaseDependencyValueUnion{}): aliasDeclaration(
		"BaseDependencyValueUnion",
		"LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue",
	),
	reflect.TypeOf(BuiltinCodeLanguage{}): aliasDeclaration(
		"BuiltinCodeLanguage",
		"CodeLanguage",
	),
	reflect.TypeOf((*MessageContentDelta)(nil)).Elem(): aliasDeclaration(
		"MessageContentDelta",
		"MessageTextDelta | MessageThinkingDelta",
	),
	reflect.TypeOf((*LLMStreamingResponseChunk)(nil)).Elem(): aliasDeclaration(
		"LLMStreamingResponseChunk",
		"MessageStartEvent | MessageDeltaEvent | ToolCallDeltaEvent | ToolResultEvent | ToolArgumentPreviewDeltaEvent | MessageStopEvent | MessageFinalizedEvent",
	),
	reflect.TypeOf(projectstate.SectionSizeValue{}): aliasDeclaration(
		"SectionSizeValue",
		"number | SectionSizeMode",
	),
	reflect.TypeOf(projectview.ProjectCodegenTarget{}): aliasDeclaration(
		"ProjectCodegenTarget",
		"ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
	),
	reflect.TypeOf(ViewModeConfig{}): aliasDeclarationWithCreateExpr(
		"ViewModeConfig",
		"ViewMode",
		"createViewMode(options)",
	),
	reflect.TypeOf(JSONValue{}): aliasDeclaration(
		"JSONValue",
		"null | boolean | number | string | Array<JSONValue> | { [key: string]: JSONValue | undefined }",
	),
	reflect.TypeOf(MessageContent{}): aliasDeclaration(
		"MessageContent",
		"MessageTextContent | MessageImageUrlContent | MessageThinkingContent",
	),
	reflect.TypeOf(BaseChatMessageUnion{}): aliasDeclaration(
		"BaseChatMessageUnion",
		"SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage",
	),
	reflect.TypeOf(BaseChartSettingsUnion{}): aliasDeclaration(
		"BaseChartSettingsUnion",
		"LineChartSettings | ScatterChartSettings",
	),
	reflect.TypeOf(httpapi.BinaryUploadRequest{}): aliasDeclaration(
		"BinaryUploadRequest",
		"FormData",
	),
	reflect.TypeOf(httpapi.BinaryDownloadResponse{}): aliasDeclaration(
		"BinaryDownloadResponse",
		"Uint8Array",
	),
	reflect.TypeOf(WebsocketMsg{}): aliasDeclaration(
		"WebsocketMsg",
		"WebsocketMsgCurrentAddressUpdate | WebsocketMsgRealtimeUIChange | WebsocketMsgRealtimeDependencyEvent | WebsocketMsgUISettingRevealResult",
	),
	reflect.TypeOf(FrontendWebsocketMsgUnion{}): objectDeclaration(
		"FrontendWebsocketMsgUnion",
		TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
		TypeProperty{Name: "messageType", TypeExpr: "WebsocketMsgTypeForFrontend"},
		TypeProperty{Name: "content", TypeExpr: "any"},
	),
}

func specialMetadataTypeDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	if declaration, ok := specialMetadataDeclarations[t]; ok {
		return declaration, true
	}
	if declaration, ok := generatedConcreteCodeObjMetadataDeclaration(t); ok {
		return declaration, true
	}
	if declaration, ok := generatedConcreteSectionMetadataDeclaration(t); ok {
		return declaration, true
	}
	if declaration, ok := generatedCodeObjMetadataDeclaration(t); ok {
		return declaration, true
	}
	return generatedSectionMetadataDeclaration(t)
}

func generatedSectionMetadataDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(BaseParentSectionImplUnion{}):
		return generatedBaseParentSectionImplUnionDeclaration(), true
	case reflect.TypeOf(BaseSectionWithParamsImplUnion{}):
		return generatedBaseSectionWithParamsImplUnionDeclaration(), true
	case reflect.TypeOf(BaseDictSectionImplUnion{}):
		return generatedBaseDictSectionImplUnionDeclaration(), true
	case reflect.TypeOf(BaseSectionImplUnion{}):
		return generatedBaseSectionImplUnionDeclaration(), true
	default:
		return TypeDeclaration{}, false
	}
}

func generatedCodeObjMetadataDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(BaseCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseCodeObjImplUnion", "", true), true
	case reflect.TypeOf(BaseChildlessCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseChildlessCodeObjImplUnion", "BaseChildlessCodeObjImplTypeSet", true), true
	case reflect.TypeOf(BaseParamCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseParamCodeObjImplUnion", "BaseParamCodeObjImplTypeSet", true), true
	case reflect.TypeOf(BaseParentCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseParentCodeObjImplUnion", "BaseParentCodeObjImplTypeSet", false), true
	default:
		return TypeDeclaration{}, false
	}
}

func generatedBaseParentSectionImplUnionDeclaration() TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		"BaseParentSectionImplUnion",
		"BaseSectionImpl",
		[]TypeProperty{{Name: "children", TypeExpr: "Array<string>"}},
	)
}

func generatedBaseSectionWithParamsImplUnionDeclaration() TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		"BaseSectionWithParamsImplUnion",
		"BaseSectionImpl",
		[]TypeProperty{{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>"}},
	)
}

func generatedBaseDictSectionImplUnionDeclaration() TypeDeclaration {
	properties := append(
		[]TypeProperty(nil),
		generatedSectionImplAliasProperties(
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
	typeSetName string,
	includeBase bool,
) TypeDeclaration {
	members := make([]string, 0, 16)
	if includeBase {
		members = append(members, "BaseCodeObjImpl")
	}
	if typeSetName == "" {
		members = append(members, generatedCodeObjImplTypeNames()...)
		return aliasUnionDeclaration(name, members...)
	}
	allowedMembers := generatedCodeObjAliasNamesForTypeSet(typeSetName)
	for _, candidate := range generatedCodeObjImplTypeNames() {
		if _, ok := allowedMembers[candidate]; ok {
			members = append(members, candidate)
		}
	}
	return aliasUnionDeclaration(name, members...)
}

func generatedCodeObjImplTypeNames() []string {
	names := []string{}
	for _, codeObjName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendCodeObjType("")),
	) {
		if t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName); ok {
			names = append(names, frontendBindingTypeName(t))
		}
	}
	return names
}

func generatedCodeObjAliasNamesForTypeSet(typeSetName string) map[string]struct{} {
	for _, spec := range projectStateTypeGuardTypeSets {
		if spec.Name != typeSetName {
			continue
		}
		members := make(map[string]struct{}, len(spec.Members))
		for _, member := range spec.Members {
			members[generatedCodeObjAliasNameFromTypeSetMember(member)] = struct{}{}
		}
		return members
	}
	return map[string]struct{}{}
}

func generatedCodeObjAliasNameFromTypeSetMember(member string) string {
	name := strings.TrimPrefix(strings.TrimSpace(member), "CodeObjTypeEnum.")
	if name == "" {
		return member
	}
	return name + "CodeObjImpl"
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

func generatedConcreteSectionMetadataDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	if t == reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}) {
		return generatedBaseSectionImplDeclaration(), true
	}
	sectionName, ok := generatedSectionImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	return generatedSectionImplAliasDeclaration(t, sectionName), true
}

func generatedConcreteCodeObjMetadataDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	if t == reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{}) {
		return generatedBaseCodeObjImplDeclaration(), true
	}
	implName, ok := generatedCodeObjImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	return generatedCodeObjImplAliasDeclaration(
		t,
		strings.TrimSuffix(implName, "CodeObjImpl"),
	), true
}

func generatedBaseSectionImplDeclaration() TypeDeclaration {
	coreProperties := mustGeneratedSectionBaseCoreProperties()
	extraProperties := generatedBaseSectionOptionalProperties(coreProperties)
	return objectDeclaration("BaseSectionImpl", append(coreProperties, extraProperties...)...)
}

func generatedBaseCodeObjImplDeclaration() TypeDeclaration {
	coreProperties := mustGeneratedCodeObjBaseCoreProperties()
	extraProperties := generatedBaseCodeObjOptionalProperties(coreProperties)
	return aliasObjectDeclarationFromProperties(
		"BaseCodeObjImpl",
		append(coreProperties, extraProperties...),
		"[key: string]: unknown;",
	)
}

func generatedSectionImplAliasDeclaration(
	t reflect.Type,
	sectionName string,
) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		generatedSectionImplAliasBaseExpr(sectionName),
		generatedSectionImplAliasProperties(t, sectionName),
	)
}

func generatedCodeObjImplAliasDeclaration(
	t reflect.Type,
	codeObjName string,
) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		"BaseCodeObjImpl",
		generatedCodeObjImplAliasProperties(t, codeObjName),
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
	t reflect.Type,
	sectionName string,
) []TypeProperty {
	properties := mustGeneratedReflectedProperties(t)
	baseNames := generatedPropertyNameSet(mustGeneratedSectionBaseCoreProperties())
	excludedNames := map[string]struct{}{}
	if sectionName == "Chat" {
		excludedNames = generatedPropertyNameSet(
			mustGeneratedReflectedProperties(reflect.TypeOf(projectstate.ChatSectionState{})),
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
	t reflect.Type,
	_ string,
) []TypeProperty {
	properties := mustGeneratedReflectedProperties(t)
	baseNames := generatedPropertyNameSet(mustGeneratedCodeObjBaseCoreProperties())

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

func generatedBaseSectionOptionalProperties(coreProperties []TypeProperty) []TypeProperty {
	properties := generatedSeedOptionalProperties(
		coreProperties,
		generatedBaseSectionOptionalPropertySeeds,
		generatedBaseSectionOptionalIgnoredProperties,
		generatedBaseSectionOptionalPropertyTypeOverrides,
	)
	return append(properties, generatedBaseSectionSyntheticOptionalProperties()...)
}

func generatedBaseCodeObjOptionalProperties(coreProperties []TypeProperty) []TypeProperty {
	return generatedSeedOptionalProperties(
		coreProperties,
		generatedBaseCodeObjOptionalPropertySeeds,
		nil,
		nil,
	)
}

func mustGeneratedSectionBaseCoreProperties() []TypeProperty {
	converter := newTypeConverter()
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

func mustGeneratedCodeObjBaseCoreProperties() []TypeProperty {
	converter := newTypeConverter()
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

func mustGeneratedReflectedProperties(t reflect.Type) []TypeProperty {
	properties, err := generatedUserDefaultReflectedProperties(t)
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
		for _, property := range mustGeneratedReflectedProperties(seed) {
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
