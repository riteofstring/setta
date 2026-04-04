package frontendbindings

import (
	"reflect"
	"strings"
)

var specialMetadataDeclarations = map[reflect.Type]TypeDeclaration{
	reflect.TypeOf(BaseDependencyKeyUnion{}): aliasDeclaration(
		"BaseDependencyKeyUnion",
		"SectionDependencyKey | SectionParamDependencyKey",
	),
	reflect.TypeOf(BaseDependencyValueUnion{}): aliasDeclaration(
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
	reflect.TypeOf(SectionSizeValue{}): aliasDeclaration(
		"SectionSizeValue",
		"number | SectionSizeMode",
	),
	reflect.TypeOf(ProjectCodegenTarget{}): aliasDeclaration(
		"ProjectCodegenTarget",
		"ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
	),
	reflect.TypeOf(ViewModeConfig{}): aliasDeclarationWithCreateExpr(
		"ViewModeConfig",
		"ViewMode",
		"createViewMode(options)",
	),
	reflect.TypeOf(BaseClipboardDataUnionWithDiscriminator{}): aliasDeclaration(
		"BaseClipboardDataUnionWithDiscriminator",
		"SectionsClipboardData",
	),
	reflect.TypeOf(SectionsClipboardDataResponse{}): aliasDeclaration(
		"SectionsClipboardDataResponse",
		"SectionsClipboardData",
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
	reflect.TypeOf(BinaryUploadRequestInput{}): aliasDeclaration(
		"BinaryUploadRequestInput",
		"FormData",
	),
	reflect.TypeOf(BinaryDownloadResponse{}): aliasDeclaration(
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
	return aliasIntersectionDeclarationFromProperties(
		"BaseDictSectionImplUnion",
		"BaseSectionImpl",
		[]TypeProperty{
			{Name: "type", TypeExpr: "typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables"},
			{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>"},
			{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
			{Name: "paramFilter", TypeExpr: "string"},
			{Name: "columnWidth", TypeExpr: "number | null"},
			{Name: "configLanguage", TypeExpr: "string"},
			{Name: "pinnedParams", TypeExpr: "Array<string>"},
			{Name: "selectedParams", TypeExpr: "Array<string>"},
			{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState"},
			{Name: "edgeInputParams", TypeExpr: "Array<string>"},
			{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
			{Name: "topLevelParamId", TypeExpr: "string | null"},
			{Name: "isJsonSource", TypeExpr: "boolean"},
			{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
			{Name: "jsonSourceMissing", TypeExpr: "boolean"},
		},
	)
}

func generatedBaseSectionImplUnionDeclaration() TypeDeclaration {
	members := append(generatedSectionImplTypeNames(), "BaseSectionImpl")
	return aliasUnionDeclaration("BaseSectionImplUnion", members...)
}

var generatedSectionImplOrder = []string{
	"Callable",
	"Dict",
	"ListRoot",
	"Group",
	"StateMachineStart",
	"StateMachineGate",
	"StateMachineEnd",
	"TextBlock",
	"Prompt",
	"Code",
	"Terminal",
	"Chat",
	"Browser",
	"Chart",
	"TaskBoard",
	"Spreadsheet",
}

func generatedSectionImplTypeNames() []string {
	names := make([]string, 0, len(generatedSectionImplOrder))
	for _, sectionName := range generatedSectionImplOrder {
		if t, ok := generatedSectionImplTypeForSectionName(sectionName); ok {
			names = append(names, t.Name())
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

var generatedCodeObjImplOrder = []string{
	"CodeCallable",
	"CodeParam",
	"TextParam",
	"DateParam",
	"TimeParam",
	"ButtonParam",
	"SliderParam",
	"RotaryParam",
	"SwitchParam",
	"ColorPickerParam",
	"DropdownParam",
	"PasswordParam",
	"TextAreaParam",
	"DropzoneParam",
	"NestedParam",
}

func generatedCodeObjImplTypeNames() []string {
	names := make([]string, 0, len(generatedCodeObjImplOrder))
	for _, codeObjName := range generatedCodeObjImplOrder {
		if t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName); ok {
			names = append(names, t.Name())
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

var generatedBaseSectionOptionalPropertyOrder = []string{
	"children",
	"codeObjVariantMap",
	"hideUnpinnedParams",
	"paramFilter",
	"columnWidth",
	"configLanguage",
	"pinnedParams",
	"selectedParams",
	"ignoreTypeErrors",
	"edgeInputParams",
	"edgeOutputPorts",
	"topLevelParamId",
	"isJsonSource",
	"jsonSourceKeys",
	"jsonSourceMissing",
	"metaControlParamId",
	"showSectionTitle",
	"attachedTerminalSectionId",
	"code",
	"codeLanguage",
	"codeFileBinding",
	"messages",
	"inputText",
	"waitingForResponse",
	"toolCallArguments",
	"pluginId",
	"kind",
	"data",
	"schemaVersion",
	"viewMode",
	"defaultChildSectionType",
	"isHorizontalOrientation",
	"overflowMode",
	"hideColumn",
	"folder",
	"filePath",
	"activeSheet",
	"readOnly",
	"showRowNumbers",
	"density",
	"autoReloadOnExternalChange",
	"text",
	"metaControlStyle",
	"imagePath",
	"dataPath",
	"chartSettings",
}

var generatedBaseSectionOptionalPropertyTypeOverrides = map[string]string{
	"configLanguage":     "string",
	"metaControlParamId": "string | null",
	"showSectionTitle":   "boolean",
	"pluginId":           "string",
	"kind":               "string",
	"data":               "Record<string, unknown>",
	"schemaVersion":      "number | null",
	"density":            "string",
	"imagePath":          "string",
}

var generatedBaseCodeObjOptionalPropertyOrder = []string{
	"children",
	"coreNameType",
	"coreNameEditable",
	"passingStyle",
	"typeAnnotation",
	"defaultVal",
	"value",
}

func generatedConcreteSectionMetadataDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	if t == reflect.TypeOf(BaseSectionImpl{}) {
		return generatedBaseSectionImplDeclaration(), true
	}
	sectionName, ok := generatedSectionImplName(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	return generatedSectionImplAliasDeclaration(t, sectionName), true
}

func generatedConcreteCodeObjMetadataDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	if t == reflect.TypeOf(BaseCodeObjImpl{}) {
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
		t.Name(),
		generatedSectionImplAliasBaseExpr(sectionName),
		generatedSectionImplAliasProperties(t, sectionName),
	)
}

func generatedCodeObjImplAliasDeclaration(
	t reflect.Type,
	codeObjName string,
) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		t.Name(),
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
			mustGeneratedReflectedProperties(reflect.TypeOf(ChatSectionState{})),
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
	return generatedUserDefaultSectionOrderedProperties(
		filtered,
		generatedSectionImplAliasPropertyOrder(sectionName),
	)
}

func generatedCodeObjImplAliasProperties(
	t reflect.Type,
	codeObjName string,
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
	return generatedUserDefaultSectionOrderedProperties(
		filtered,
		generatedCodeObjImplAliasPropertyOrder(codeObjName),
	)
}

func generatedBaseSectionOptionalProperties(coreProperties []TypeProperty) []TypeProperty {
	coreNames := generatedPropertyNameSet(coreProperties)
	registry := make(map[string]TypeProperty, len(generatedBaseSectionOptionalPropertyOrder))

	for _, sectionName := range generatedSectionImplOrder {
		t, ok := generatedSectionImplTypeForSectionName(sectionName)
		if !ok {
			continue
		}
		for _, property := range mustGeneratedReflectedProperties(t) {
			if _, ok := coreNames[property.Name]; ok {
				continue
			}
			if _, exists := registry[property.Name]; exists {
				continue
			}
			property.Optional = true
			if override, ok := generatedBaseSectionOptionalPropertyTypeOverrides[property.Name]; ok {
				property.TypeExpr = override
			}
			registry[property.Name] = property
		}
	}

	for name, typeExpr := range generatedBaseSectionOptionalPropertyTypeOverrides {
		if _, ok := registry[name]; ok {
			continue
		}
		registry[name] = TypeProperty{Name: name, TypeExpr: typeExpr, Optional: true}
	}

	properties := make([]TypeProperty, 0, len(generatedBaseSectionOptionalPropertyOrder))
	for _, name := range generatedBaseSectionOptionalPropertyOrder {
		property, ok := registry[name]
		if !ok {
			continue
		}
		properties = append(properties, property)
	}
	return properties
}

func generatedBaseCodeObjOptionalProperties(coreProperties []TypeProperty) []TypeProperty {
	coreNames := generatedPropertyNameSet(coreProperties)
	registry := make(map[string]TypeProperty, len(generatedBaseCodeObjOptionalPropertyOrder))

	for _, codeObjName := range generatedCodeObjImplOrder {
		t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName)
		if !ok {
			continue
		}
		for _, property := range mustGeneratedReflectedProperties(t) {
			if _, ok := coreNames[property.Name]; ok {
				continue
			}
			if _, exists := registry[property.Name]; exists {
				continue
			}
			property.Optional = true
			registry[property.Name] = property
		}
	}

	properties := make([]TypeProperty, 0, len(generatedBaseCodeObjOptionalPropertyOrder))
	for _, name := range generatedBaseCodeObjOptionalPropertyOrder {
		property, ok := registry[name]
		if !ok {
			continue
		}
		properties = append(properties, property)
	}
	return properties
}

func mustGeneratedSectionBaseCoreProperties() []TypeProperty {
	converter := newTypeConverter()
	properties, err := converter.structProperties(
		reflect.TypeOf(BaseSectionImpl{}),
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
		reflect.TypeOf(BaseCodeObjImpl{}),
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

func generatedSectionImplAliasPropertyOrder(sectionName string) []string {
	switch sectionName {
	case "Callable":
		return []string{
			"type",
			"codeObjVariantMap",
			"hideUnpinnedParams",
			"paramFilter",
			"columnWidth",
			"configLanguage",
			"pinnedParams",
			"selectedParams",
			"ignoreTypeErrors",
			"edgeInputParams",
			"edgeOutputPorts",
			"callable",
			"hideParams",
		}
	case "Dict":
		return []string{
			"type",
			"codeObjVariantMap",
			"hideUnpinnedParams",
			"paramFilter",
			"columnWidth",
			"configLanguage",
			"pinnedParams",
			"selectedParams",
			"ignoreTypeErrors",
			"edgeInputParams",
			"edgeOutputPorts",
			"topLevelParamId",
			"isJsonSource",
			"jsonSourceKeys",
			"jsonSourceMissing",
		}
	default:
		return nil
	}
}

func generatedCodeObjImplAliasPropertyOrder(codeObjName string) []string {
	if codeObjName == "NestedParam" {
		return []string{
			"type",
			"children",
			"coreNameType",
			"coreNameEditable",
			"passingStyle",
			"typeAnnotation",
		}
	}
	return nil
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
