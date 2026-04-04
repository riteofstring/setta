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
	if declaration, ok := generatedCodeObjAliasDeclaration(t); ok {
		return declaration, true
	}
	return generatedSectionAliasDeclaration(t)
}

var baseSectionImplProperties = []TypeProperty{
	{Name: "type", TypeExpr: "SectionType"},
	{Name: "id", TypeExpr: "string"},
	{Name: "name", TypeExpr: "string"},
	{Name: "isFrozen", TypeExpr: "boolean"},
	{Name: "isInOtherProjectConfigs", TypeExpr: "boolean"},
	{Name: "tagColor", TypeExpr: "string | null"},
	{Name: "styleColor", TypeExpr: "string | null"},
	{Name: "size", TypeExpr: "SectionSize"},
	{Name: "aspectRatio", TypeExpr: "boolean | number"},
	{Name: "aspectRatioExtraHeight", TypeExpr: "number"},
	{Name: "aspectRatioExtraWidth", TypeExpr: "number"},
	{Name: "isMinimized", TypeExpr: "boolean"},
	{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
	{Name: "isPreset", TypeExpr: "boolean"},
	{Name: "children", TypeExpr: "Array<string>", Optional: true},
	{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>", Optional: true},
	{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: true},
	{Name: "paramFilter", TypeExpr: "string", Optional: true},
	{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
	{Name: "configLanguage", TypeExpr: "string", Optional: true},
	{Name: "pinnedParams", TypeExpr: "Array<string>", Optional: true},
	{Name: "selectedParams", TypeExpr: "Array<string>", Optional: true},
	{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState", Optional: true},
	{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: true},
	{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: true},
	{Name: "topLevelParamId", TypeExpr: "string | null", Optional: true},
	{Name: "isJsonSource", TypeExpr: "boolean", Optional: true},
	{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: true},
	{Name: "jsonSourceMissing", TypeExpr: "boolean", Optional: true},
	{Name: "metaControlParamId", TypeExpr: "string | null", Optional: true},
	{Name: "showSectionTitle", TypeExpr: "boolean", Optional: true},
	{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
	{Name: "code", TypeExpr: "string", Optional: true},
	{Name: "codeLanguage", TypeExpr: "string", Optional: true},
	{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
	{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: true},
	{Name: "inputText", TypeExpr: "string", Optional: true},
	{Name: "waitingForResponse", TypeExpr: "boolean", Optional: true},
	{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: true},
	{Name: "pluginId", TypeExpr: "string", Optional: true},
	{Name: "kind", TypeExpr: "string", Optional: true},
	{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
	{Name: "schemaVersion", TypeExpr: "number | null", Optional: true},
	{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: true},
	{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: true},
	{Name: "isHorizontalOrientation", TypeExpr: "boolean", Optional: true},
	{Name: "overflowMode", TypeExpr: "boolean", Optional: true},
	{Name: "hideColumn", TypeExpr: "boolean", Optional: true},
	{Name: "folder", TypeExpr: "string", Optional: true},
	{Name: "filePath", TypeExpr: "string", Optional: true},
	{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
	{Name: "readOnly", TypeExpr: "boolean", Optional: true},
	{Name: "showRowNumbers", TypeExpr: "boolean", Optional: true},
	{Name: "density", TypeExpr: "string", Optional: true},
	{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: true},
	{Name: "text", TypeExpr: "string", Optional: true},
	{Name: "metaControlStyle", TypeExpr: "boolean", Optional: true},
	{Name: "imagePath", TypeExpr: "string", Optional: true},
	{Name: "dataPath", TypeExpr: "string", Optional: true},
	{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: true},
}

func generatedBaseSectionImplDeclaration() TypeDeclaration {
	return objectDeclaration("BaseSectionImpl", baseSectionImplProperties...)
}

func sectionTypeProperty(sectionName string) TypeProperty {
	return TypeProperty{
		Name:     "type",
		TypeExpr: "typeof SectionTypeEnum." + sectionName,
	}
}

func generatedSectionWithParamsProperties(configLanguageTypeExpr string) []TypeProperty {
	return []TypeProperty{
		{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>"},
		{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
		{Name: "paramFilter", TypeExpr: "string"},
		{Name: "columnWidth", TypeExpr: "number | null"},
		{Name: "configLanguage", TypeExpr: configLanguageTypeExpr},
		{Name: "pinnedParams", TypeExpr: "Array<string>"},
		{Name: "selectedParams", TypeExpr: "Array<string>"},
		{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState"},
		{Name: "edgeInputParams", TypeExpr: "Array<string>"},
		{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
	}
}

type generatedSectionAliasSpec struct {
	RootType                     reflect.Type
	SectionName                  string
	BaseExpr                     string
	IncludeChildren              bool
	IncludeWithParams            bool
	ConfigLanguageTypeExpr       string
	AdditionalProperties         []TypeProperty
	UserDefaultPropertyOrder     []string
	UserDefaultIgnoredProperties map[string]struct{}
	UserDefaultReflectedSources  []reflect.Type
}

var generatedSectionAliasSpecs = []generatedSectionAliasSpec{
	{
		RootType:               reflect.TypeOf(CallableSectionImpl{}),
		SectionName:            "Callable",
		IncludeWithParams:      true,
		ConfigLanguageTypeExpr: "ConfigLanguage",
		AdditionalProperties: []TypeProperty{
			{Name: "callable", TypeExpr: "string | null", Optional: true},
			{Name: "hideParams", TypeExpr: "boolean"},
		},
		UserDefaultIgnoredProperties: reflectedIgnoredProperties(
			"callable",
			"codeObjVariantMap",
			"pinnedParams",
			"selectedParams",
			"ignoreTypeErrors",
		),
	},
	{
		RootType:               reflect.TypeOf(DictSectionImpl{}),
		SectionName:            "Dict",
		IncludeWithParams:      true,
		ConfigLanguageTypeExpr: "string",
		AdditionalProperties: []TypeProperty{
			{Name: "topLevelParamId", TypeExpr: "string | null"},
			{Name: "isJsonSource", TypeExpr: "boolean"},
			{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
			{Name: "jsonSourceMissing", TypeExpr: "boolean"},
		},
		UserDefaultIgnoredProperties: reflectedIgnoredProperties(
			"codeObjVariantMap",
			"pinnedParams",
			"selectedParams",
			"ignoreTypeErrors",
			"topLevelParamId",
			"jsonSourceMissing",
		),
	},
	{
		RootType:        reflect.TypeOf(ListRootSectionImpl{}),
		SectionName:     "ListRoot",
		IncludeChildren: true,
		AdditionalProperties: []TypeProperty{
			{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			{Name: "viewMode", TypeExpr: "ListRootViewMode"},
		},
	},
	{
		RootType:        reflect.TypeOf(GroupSectionImpl{}),
		SectionName:     "Group",
		IncludeChildren: true,
		AdditionalProperties: []TypeProperty{
			{Name: "isHorizontalOrientation", TypeExpr: "boolean"},
			{Name: "overflowMode", TypeExpr: "boolean"},
			{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
		},
	},
	{
		RootType:    reflect.TypeOf(StateMachineStartSectionImpl{}),
		SectionName: "StateMachineStart",
		AdditionalProperties: []TypeProperty{
			{Name: "machineGroupId", TypeExpr: "string"},
			{Name: "label", TypeExpr: "string"},
			{Name: "maxIterations", TypeExpr: "number | null", Optional: true},
		},
	},
	{
		RootType:    reflect.TypeOf(StateMachineGateSectionImpl{}),
		SectionName: "StateMachineGate",
		AdditionalProperties: []TypeProperty{
			{Name: "machineGroupId", TypeExpr: "string"},
			{Name: "gateType", TypeExpr: "StateMachineGateType"},
			{Name: "label", TypeExpr: "string"},
			{Name: "ui", TypeExpr: "StateMachineGateUIState"},
		},
	},
	{
		RootType:    reflect.TypeOf(StateMachineEndSectionImpl{}),
		SectionName: "StateMachineEnd",
		AdditionalProperties: []TypeProperty{
			{Name: "machineGroupId", TypeExpr: "string"},
			{Name: "label", TypeExpr: "string"},
		},
	},
	{
		RootType:    reflect.TypeOf(TextBlockSectionImpl{}),
		SectionName: "TextBlock",
		AdditionalProperties: []TypeProperty{
			{Name: "format", TypeExpr: "TextBlockFormat"},
			{Name: "masterFontSizePx", TypeExpr: "number"},
			{Name: "headingAsSectionName", TypeExpr: "boolean"},
			{Name: "metaControlStyle", TypeExpr: "boolean"},
			{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
			{Name: "text", TypeExpr: "string"},
		},
	},
	{
		RootType:    reflect.TypeOf(PromptSectionImpl{}),
		SectionName: "Prompt",
		AdditionalProperties: []TypeProperty{
			{Name: "promptTemplateId", TypeExpr: "string | null", Optional: true},
			{Name: "template", TypeExpr: "string"},
			{Name: "format", TypeExpr: "PromptFormat"},
			{Name: "inputs", TypeExpr: "Record<string, string>"},
			{Name: "renderedText", TypeExpr: "string"},
			{Name: "missingVariables", TypeExpr: "Array<string>"},
			{Name: "renderError", TypeExpr: "string | null", Optional: true},
		},
	},
	{
		RootType:        reflect.TypeOf(CodeSectionImpl{}),
		SectionName:     "Code",
		IncludeChildren: true,
		UserDefaultPropertyOrder: []string{
			"code",
			"codeFileBinding",
			"attachedTerminalSectionId",
			"codeLanguage",
			"diagnosticsIgnoreState",
		},
		AdditionalProperties: []TypeProperty{
			{Name: "code", TypeExpr: "string"},
			{Name: "codeLanguage", TypeExpr: "string"},
			{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
			{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
			{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState"},
		},
	},
	{
		RootType:    reflect.TypeOf(TerminalSectionImpl{}),
		SectionName: "Terminal",
	},
	{
		RootType:    reflect.TypeOf(ChatSectionImpl{}),
		SectionName: "Chat",
		BaseExpr:    "BaseSectionImpl & ChatSectionState",
		AdditionalProperties: []TypeProperty{
			{Name: "managed", TypeExpr: "boolean"},
			{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
			{Name: "transcriptionProfileId", TypeExpr: "string | null", Optional: true},
			{Name: "agentProfileId", TypeExpr: "string | null", Optional: true},
			{Name: "chatId", TypeExpr: "string | null", Optional: true},
			{Name: "thinking", TypeExpr: "boolean"},
			{Name: "permissionMode", TypeExpr: "ChatPermissionMode"},
			{Name: "searchEnabled", TypeExpr: "boolean"},
			{Name: "dictationMode", TypeExpr: "ChatDictationMode"},
		},
		UserDefaultReflectedSources: []reflect.Type{
			reflect.TypeOf(ChatSectionState{}),
		},
	},
	{
		RootType:    reflect.TypeOf(BrowserSectionImpl{}),
		SectionName: "Browser",
		BaseExpr:    `Omit<BaseSectionImpl, "viewMode">`,
		AdditionalProperties: []TypeProperty{
			{Name: "folder", TypeExpr: "string"},
			{Name: "hideColumn", TypeExpr: "boolean"},
			{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
			{Name: "typesColumnWidth", TypeExpr: "number | null", Optional: true},
			{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
			{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
		},
	},
	{
		RootType:    reflect.TypeOf(ChartSectionImpl{}),
		SectionName: "Chart",
		AdditionalProperties: []TypeProperty{
			{Name: "dataPath", TypeExpr: "string"},
			{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
		},
	},
	{
		RootType:    reflect.TypeOf(TaskBoardSectionImpl{}),
		SectionName: "TaskBoard",
		BaseExpr:    `Omit<BaseSectionImpl, "viewMode">`,
		AdditionalProperties: []TypeProperty{
			{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
			{Name: "columns", TypeExpr: "Array<TaskBoardColumn>"},
			{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
		},
	},
	{
		RootType:    reflect.TypeOf(SpreadsheetSectionImpl{}),
		SectionName: "Spreadsheet",
		AdditionalProperties: []TypeProperty{
			{Name: "filePath", TypeExpr: "string"},
			{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
			{Name: "readOnly", TypeExpr: "boolean"},
			{Name: "showRowNumbers", TypeExpr: "boolean"},
			{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
			{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
		},
	},
}

func generatedSectionAliasDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(BaseSectionImpl{}):
		return generatedBaseSectionImplDeclaration(), true
	case reflect.TypeOf(BaseParentSectionImplUnion{}):
		return generatedBaseParentSectionImplUnionDeclaration(), true
	case reflect.TypeOf(BaseSectionWithParamsImplUnion{}):
		return generatedBaseSectionWithParamsImplUnionDeclaration(), true
	case reflect.TypeOf(BaseDictSectionImplUnion{}):
		return generatedBaseDictSectionImplUnionDeclaration(), true
	case reflect.TypeOf(BaseSectionImplUnion{}):
		return generatedBaseSectionImplUnionDeclaration(), true
	}
	spec, ok := generatedSectionAliasSpecForType(t)
	if !ok {
		return TypeDeclaration{}, false
	}
	return generatedConcreteSectionAliasDeclaration(spec), true
}

func generatedSectionAliasSpecForType(t reflect.Type) (generatedSectionAliasSpec, bool) {
	for _, spec := range generatedSectionAliasSpecs {
		if spec.RootType == t {
			return spec, true
		}
	}
	return generatedSectionAliasSpec{}, false
}

func generatedSectionAliasSpecForSectionName(sectionName string) (generatedSectionAliasSpec, bool) {
	for _, spec := range generatedSectionAliasSpecs {
		if spec.SectionName == sectionName {
			return spec, true
		}
	}
	return generatedSectionAliasSpec{}, false
}

func generatedSectionAliasBaseExpr(spec generatedSectionAliasSpec) string {
	if strings.TrimSpace(spec.BaseExpr) != "" {
		return spec.BaseExpr
	}
	return "BaseSectionImpl"
}

func generatedSectionAliasProperties(spec generatedSectionAliasSpec) []TypeProperty {
	properties := []TypeProperty{sectionTypeProperty(spec.SectionName)}
	if spec.IncludeWithParams {
		properties = append(properties, generatedSectionWithParamsProperties(spec.ConfigLanguageTypeExpr)...)
	}
	if spec.IncludeChildren {
		properties = append(properties, TypeProperty{Name: "children", TypeExpr: "Array<string>"})
	}
	properties = append(properties, spec.AdditionalProperties...)
	return properties
}

func generatedConcreteSectionAliasDeclaration(spec generatedSectionAliasSpec) TypeDeclaration {
	return aliasIntersectionDeclarationFromProperties(
		spec.RootType.Name(),
		generatedSectionAliasBaseExpr(spec),
		generatedSectionAliasProperties(spec),
	)
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
		[]TypeProperty{{Name: "type", TypeExpr: "typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables"}},
		generatedSectionWithParamsProperties("string")...,
	)
	properties = append(
		properties,
		TypeProperty{Name: "topLevelParamId", TypeExpr: "string | null"},
		TypeProperty{Name: "isJsonSource", TypeExpr: "boolean"},
		TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
		TypeProperty{Name: "jsonSourceMissing", TypeExpr: "boolean"},
	)
	return aliasIntersectionDeclarationFromProperties(
		"BaseDictSectionImplUnion",
		"BaseSectionImpl",
		properties,
	)
}

func generatedBaseSectionImplUnionDeclaration() TypeDeclaration {
	members := make([]string, 0, len(generatedSectionAliasSpecs)+1)
	for _, spec := range generatedSectionAliasSpecs {
		members = append(members, spec.RootType.Name())
	}
	members = append(members, "BaseSectionImpl")
	return aliasUnionDeclaration("BaseSectionImplUnion", members...)
}

var baseCodeObjImplBaseProperties = []TypeProperty{
	{Name: "type", TypeExpr: "CodeObjType"},
	{Name: "id", TypeExpr: "string"},
	{Name: "name", TypeExpr: "string"},
	{Name: "description", TypeExpr: "string"},
	{Name: "isPreset", TypeExpr: "boolean"},
	{Name: "children", TypeExpr: "Array<string>", Optional: true},
	{Name: "coreNameType", TypeExpr: "ParamNameType", Optional: true},
	{Name: "coreNameEditable", TypeExpr: "boolean", Optional: true},
	{Name: "passingStyle", TypeExpr: "ParameterPassingStyle", Optional: true},
	{Name: "typeAnnotation", TypeExpr: "string", Optional: true},
	{Name: "defaultVal", TypeExpr: "string", Optional: true},
	{Name: "value", TypeExpr: "string", Optional: true},
}

var codeObjImplParamBaseProperties = []TypeProperty{
	{Name: "coreNameType", TypeExpr: "ParamNameType"},
	{Name: "coreNameEditable", TypeExpr: "boolean"},
	{Name: "passingStyle", TypeExpr: "ParameterPassingStyle"},
	{Name: "typeAnnotation", TypeExpr: "string"},
}

var codeObjImplParamValueProperties = []TypeProperty{
	{Name: "defaultVal", TypeExpr: "string"},
	{Name: "value", TypeExpr: "string"},
}

type generatedCodeObjAliasSpec struct {
	RootType             reflect.Type
	Name                 string
	TypeExpr             string
	IncludeChildren      bool
	IncludeParamBase     bool
	IncludeParamValues   bool
	AdditionalProperties []TypeProperty
}

var generatedCodeObjAliasSpecs = []generatedCodeObjAliasSpec{
	{
		RootType:        reflect.TypeOf(CodeCallableCodeObjImpl{}),
		Name:            "CodeCallableCodeObjImpl",
		TypeExpr:        "typeof CodeObjTypeEnum.CodeCallable",
		IncludeChildren: true,
	},
	{
		RootType:           reflect.TypeOf(CodeParamCodeObjImpl{}),
		Name:               "CodeParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.CodeParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
	},
	{
		RootType:           reflect.TypeOf(TextParamCodeObjImpl{}),
		Name:               "TextParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.TextParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "uiType", TypeExpr: "TextParamInputUIType"},
		},
	},
	{
		RootType:           reflect.TypeOf(DateParamCodeObjImpl{}),
		Name:               "DateParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.DateParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "dateDisplayFormat", TypeExpr: "DateDisplayFormat"},
			{Name: "dateControlMode", TypeExpr: "DateControlMode"},
			{Name: "dateSelectionMode", TypeExpr: "DateSelectionMode"},
			{Name: "dateCalendarWeekStart", TypeExpr: "DateCalendarWeekStart"},
			{Name: "dateIncludesTime", TypeExpr: "boolean"},
		},
	},
	{
		RootType:           reflect.TypeOf(TimeParamCodeObjImpl{}),
		Name:               "TimeParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.TimeParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "timeControlMode", TypeExpr: "TimeControlMode"},
			{Name: "timeDisplayFormat", TypeExpr: "TimeDisplayFormat"},
			{Name: "timeDisplayTransparent", TypeExpr: "boolean"},
			{Name: "timeDisplayScale", TypeExpr: "number"},
			{Name: "timeDisplayFont", TypeExpr: "TimeDisplayFont"},
		},
	},
	{
		RootType:         reflect.TypeOf(ButtonParamCodeObjImpl{}),
		Name:             "ButtonParamCodeObjImpl",
		TypeExpr:         "typeof CodeObjTypeEnum.ButtonParam",
		IncludeParamBase: true,
		AdditionalProperties: []TypeProperty{
			{Name: "label", TypeExpr: "string"},
			{Name: "actionMode", TypeExpr: "ButtonActionMode"},
			{Name: "requestMethod", TypeExpr: "HttpRequestMethod"},
			{Name: "requestUrl", TypeExpr: "string"},
			{Name: "requestHeaderKey", TypeExpr: "string"},
			{Name: "requestHeaderValue", TypeExpr: "string"},
			{Name: "requestBody", TypeExpr: "string"},
		},
	},
	{
		RootType:           reflect.TypeOf(SliderParamCodeObjImpl{}),
		Name:               "SliderParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.SliderParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "min", TypeExpr: "number"},
			{Name: "max", TypeExpr: "number"},
			{Name: "step", TypeExpr: "number"},
		},
	},
	{
		RootType:           reflect.TypeOf(RotaryParamCodeObjImpl{}),
		Name:               "RotaryParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.RotaryParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "min", TypeExpr: "number"},
			{Name: "max", TypeExpr: "number"},
			{Name: "step", TypeExpr: "number"},
		},
	},
	{
		RootType:           reflect.TypeOf(SwitchParamCodeObjImpl{}),
		Name:               "SwitchParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.SwitchParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
	},
	{
		RootType:           reflect.TypeOf(ColorPickerParamCodeObjImpl{}),
		Name:               "ColorPickerParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.ColorPickerParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "colorChoices", TypeExpr: "Array<ColorPickerChoice>"},
		},
	},
	{
		RootType:           reflect.TypeOf(DropdownParamCodeObjImpl{}),
		Name:               "DropdownParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.DropdownParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "choices", TypeExpr: "Array<string>"},
		},
	},
	{
		RootType:           reflect.TypeOf(PasswordParamCodeObjImpl{}),
		Name:               "PasswordParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.PasswordParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "hasSecret", TypeExpr: "boolean"},
		},
	},
	{
		RootType:           reflect.TypeOf(TextAreaParamCodeObjImpl{}),
		Name:               "TextAreaParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.TextAreaParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
	},
	{
		RootType:           reflect.TypeOf(DropzoneParamCodeObjImpl{}),
		Name:               "DropzoneParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.DropzoneParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "mode", TypeExpr: "DropzoneMode"},
			{Name: "maxAttachments", TypeExpr: "number | null", Optional: true},
			{Name: "placeholder", TypeExpr: "string"},
		},
	},
	{
		RootType:         reflect.TypeOf(NestedParamCodeObjImpl{}),
		Name:             "NestedParamCodeObjImpl",
		TypeExpr:         "typeof CodeObjTypeEnum.NestedParam",
		IncludeChildren:  true,
		IncludeParamBase: true,
	},
}

func generatedCodeObjAliasDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	switch t {
	case reflect.TypeOf(BaseCodeObjImpl{}):
		return generatedBaseCodeObjImplDeclaration(), true
	case reflect.TypeOf(BaseCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseCodeObjImplUnion", "", true), true
	case reflect.TypeOf(BaseChildlessCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseChildlessCodeObjImplUnion", "BaseChildlessCodeObjImplTypeSet", true), true
	case reflect.TypeOf(BaseParamCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseParamCodeObjImplUnion", "BaseParamCodeObjImplTypeSet", true), true
	case reflect.TypeOf(BaseParentCodeObjImplUnion{}):
		return generatedCodeObjUnionDeclaration("BaseParentCodeObjImplUnion", "BaseParentCodeObjImplTypeSet", false), true
	}
	if spec, ok := generatedCodeObjAliasSpecForType(t); ok {
		return generatedConcreteCodeObjAliasDeclaration(spec), true
	}
	return TypeDeclaration{}, false
}

func generatedCodeObjAliasSpecForType(t reflect.Type) (generatedCodeObjAliasSpec, bool) {
	for _, spec := range generatedCodeObjAliasSpecs {
		if spec.RootType == t {
			return spec, true
		}
	}
	return generatedCodeObjAliasSpec{}, false
}

func generatedBaseCodeObjImplDeclaration() TypeDeclaration {
	return aliasObjectDeclarationFromProperties(
		"BaseCodeObjImpl",
		baseCodeObjImplBaseProperties,
		"[key: string]: unknown;",
	)
}

func generatedCodeObjUnionDeclaration(
	name string,
	typeSetName string,
	includeBase bool,
) TypeDeclaration {
	members := make([]string, 0, len(generatedCodeObjAliasSpecs)+1)
	if includeBase {
		members = append(members, "BaseCodeObjImpl")
	}
	if typeSetName == "" {
		for _, spec := range generatedCodeObjAliasSpecs {
			members = append(members, spec.Name)
		}
		return aliasUnionDeclaration(name, members...)
	}
	allowedMembers := generatedCodeObjAliasNamesForTypeSet(typeSetName)
	for _, spec := range generatedCodeObjAliasSpecs {
		if _, ok := allowedMembers[spec.Name]; ok {
			members = append(members, spec.Name)
		}
	}
	return aliasUnionDeclaration(name, members...)
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

func generatedConcreteCodeObjAliasDeclaration(spec generatedCodeObjAliasSpec) TypeDeclaration {
	properties := []TypeProperty{{Name: "type", TypeExpr: spec.TypeExpr}}
	if spec.IncludeChildren {
		properties = append(properties, TypeProperty{Name: "children", TypeExpr: "Array<string>"})
	}
	if spec.IncludeParamBase {
		properties = append(properties, codeObjImplParamBaseProperties...)
	}
	if spec.IncludeParamValues {
		properties = append(properties, codeObjImplParamValueProperties...)
	}
	properties = append(properties, spec.AdditionalProperties...)
	return aliasIntersectionDeclarationFromProperties(spec.Name, "BaseCodeObjImpl", properties)
}

var generatedUserDefaultSectionBasePropertyOrder = []string{
	"isFrozen",
	"tagColor",
	"styleColor",
	"size",
	"aspectRatio",
	"isMinimized",
	"positionAndSizeLocked",
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
