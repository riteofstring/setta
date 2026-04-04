package frontendbindings

import "reflect"

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

var generatedSectionAliasDeclarations = buildGeneratedSectionAliasDeclarations()

func buildGeneratedSectionAliasDeclarations() map[reflect.Type]TypeDeclaration {
	declarations := map[reflect.Type]TypeDeclaration{
		reflect.TypeOf(BaseSectionImpl{}): generatedBaseSectionImplDeclaration(),
		reflect.TypeOf(BaseParentSectionImplUnion{}): aliasIntersectionDeclarationFromProperties(
			"BaseParentSectionImplUnion",
			"BaseSectionImpl",
			[]TypeProperty{{Name: "children", TypeExpr: "Array<string>"}},
		),
		reflect.TypeOf(BaseSectionWithParamsImplUnion{}): aliasIntersectionDeclarationFromProperties(
			"BaseSectionWithParamsImplUnion",
			"BaseSectionImpl",
			[]TypeProperty{{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>"}},
		),
		reflect.TypeOf(ListRootSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"ListRootSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("ListRoot"),
				{Name: "children", TypeExpr: "Array<string>"},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
				{Name: "viewMode", TypeExpr: "ListRootViewMode"},
			},
		),
		reflect.TypeOf(GroupSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"GroupSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("Group"),
				{Name: "children", TypeExpr: "Array<string>"},
				{Name: "isHorizontalOrientation", TypeExpr: "boolean"},
				{Name: "overflowMode", TypeExpr: "boolean"},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			},
		),
		reflect.TypeOf(StateMachineStartSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"StateMachineStartSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("StateMachineStart"),
				{Name: "machineGroupId", TypeExpr: "string"},
				{Name: "label", TypeExpr: "string"},
				{Name: "maxIterations", TypeExpr: "number | null", Optional: true},
			},
		),
		reflect.TypeOf(StateMachineGateSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"StateMachineGateSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("StateMachineGate"),
				{Name: "machineGroupId", TypeExpr: "string"},
				{Name: "gateType", TypeExpr: "StateMachineGateType"},
				{Name: "label", TypeExpr: "string"},
				{Name: "ui", TypeExpr: "StateMachineGateUIState"},
			},
		),
		reflect.TypeOf(StateMachineEndSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"StateMachineEndSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("StateMachineEnd"),
				{Name: "machineGroupId", TypeExpr: "string"},
				{Name: "label", TypeExpr: "string"},
			},
		),
		reflect.TypeOf(TextBlockSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"TextBlockSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("TextBlock"),
				{Name: "format", TypeExpr: "TextBlockFormat"},
				{Name: "masterFontSizePx", TypeExpr: "number"},
				{Name: "headingAsSectionName", TypeExpr: "boolean"},
				{Name: "metaControlStyle", TypeExpr: "boolean"},
				{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
				{Name: "text", TypeExpr: "string"},
			},
		),
		reflect.TypeOf(PromptSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"PromptSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("Prompt"),
				{Name: "promptTemplateId", TypeExpr: "string | null", Optional: true},
				{Name: "template", TypeExpr: "string"},
				{Name: "format", TypeExpr: "PromptFormat"},
				{Name: "inputs", TypeExpr: "Record<string, string>"},
				{Name: "renderedText", TypeExpr: "string"},
				{Name: "missingVariables", TypeExpr: "Array<string>"},
				{Name: "renderError", TypeExpr: "string | null", Optional: true},
			},
		),
		reflect.TypeOf(CodeSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"CodeSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("Code"),
				{Name: "children", TypeExpr: "Array<string>"},
				{Name: "code", TypeExpr: "string"},
				{Name: "codeLanguage", TypeExpr: "string"},
				{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
				{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
				{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState"},
			},
		),
		reflect.TypeOf(TerminalSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"TerminalSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{sectionTypeProperty("Terminal")},
		),
		reflect.TypeOf(BaseSectionImplUnion{}): aliasUnionDeclaration(
			"BaseSectionImplUnion",
			"CallableSectionImpl",
			"DictSectionImpl",
			"ListRootSectionImpl",
			"GroupSectionImpl",
			"StateMachineStartSectionImpl",
			"StateMachineGateSectionImpl",
			"StateMachineEndSectionImpl",
			"TextBlockSectionImpl",
			"PromptSectionImpl",
			"CodeSectionImpl",
			"TerminalSectionImpl",
			"ChatSectionImpl",
			"BrowserSectionImpl",
			"ChartSectionImpl",
			"TaskBoardSectionImpl",
			"SpreadsheetSectionImpl",
			"BaseSectionImpl",
		),
		reflect.TypeOf(ChatSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"ChatSectionImpl",
			"BaseSectionImpl & ChatSectionState",
			[]TypeProperty{
				sectionTypeProperty("Chat"),
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
		),
		reflect.TypeOf(BrowserSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"BrowserSectionImpl",
			`Omit<BaseSectionImpl, "viewMode">`,
			[]TypeProperty{
				sectionTypeProperty("Browser"),
				{Name: "folder", TypeExpr: "string"},
				{Name: "hideColumn", TypeExpr: "boolean"},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
				{Name: "typesColumnWidth", TypeExpr: "number | null", Optional: true},
				{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
				{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
			},
		),
		reflect.TypeOf(TaskBoardSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"TaskBoardSectionImpl",
			`Omit<BaseSectionImpl, "viewMode">`,
			[]TypeProperty{
				sectionTypeProperty("TaskBoard"),
				{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
				{Name: "columns", TypeExpr: "Array<TaskBoardColumn>"},
				{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
			},
		),
		reflect.TypeOf(ChartSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"ChartSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("Chart"),
				{Name: "dataPath", TypeExpr: "string"},
				{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
			},
		),
		reflect.TypeOf(SpreadsheetSectionImpl{}): aliasIntersectionDeclarationFromProperties(
			"SpreadsheetSectionImpl",
			"BaseSectionImpl",
			[]TypeProperty{
				sectionTypeProperty("Spreadsheet"),
				{Name: "filePath", TypeExpr: "string"},
				{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
				{Name: "readOnly", TypeExpr: "boolean"},
				{Name: "showRowNumbers", TypeExpr: "boolean"},
				{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
				{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
			},
		),
	}

	callableProperties := append(
		[]TypeProperty{sectionTypeProperty("Callable")},
		generatedSectionWithParamsProperties("ConfigLanguage")...,
	)
	callableProperties = append(
		callableProperties,
		TypeProperty{Name: "callable", TypeExpr: "string | null", Optional: true},
		TypeProperty{Name: "hideParams", TypeExpr: "boolean"},
	)
	declarations[reflect.TypeOf(CallableSectionImpl{})] = aliasIntersectionDeclarationFromProperties(
		"CallableSectionImpl",
		"BaseSectionImpl",
		callableProperties,
	)

	dictProperties := append(
		[]TypeProperty{sectionTypeProperty("Dict")},
		generatedSectionWithParamsProperties("string")...,
	)
	dictProperties = append(
		dictProperties,
		TypeProperty{Name: "topLevelParamId", TypeExpr: "string | null"},
		TypeProperty{Name: "isJsonSource", TypeExpr: "boolean"},
		TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
		TypeProperty{Name: "jsonSourceMissing", TypeExpr: "boolean"},
	)
	declarations[reflect.TypeOf(DictSectionImpl{})] = aliasIntersectionDeclarationFromProperties(
		"DictSectionImpl",
		"BaseSectionImpl",
		dictProperties,
	)

	baseDictProperties := append(
		[]TypeProperty{{Name: "type", TypeExpr: "typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables"}},
		generatedSectionWithParamsProperties("string")...,
	)
	baseDictProperties = append(
		baseDictProperties,
		TypeProperty{Name: "topLevelParamId", TypeExpr: "string | null"},
		TypeProperty{Name: "isJsonSource", TypeExpr: "boolean"},
		TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
		TypeProperty{Name: "jsonSourceMissing", TypeExpr: "boolean"},
	)
	declarations[reflect.TypeOf(BaseDictSectionImplUnion{})] = aliasIntersectionDeclarationFromProperties(
		"BaseDictSectionImplUnion",
		"BaseSectionImpl",
		baseDictProperties,
	)

	return declarations
}

func generatedSectionAliasDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	declaration, ok := generatedSectionAliasDeclarations[t]
	return declaration, ok
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
	Name                 string
	TypeExpr             string
	IncludeChildren      bool
	IncludeParamBase     bool
	IncludeParamValues   bool
	AdditionalProperties []TypeProperty
}

var generatedCodeObjAliasDeclarations = map[reflect.Type]TypeDeclaration{
	reflect.TypeOf(BaseCodeObjImpl{}): aliasObjectDeclarationFromProperties(
		"BaseCodeObjImpl",
		baseCodeObjImplBaseProperties,
		"[key: string]: unknown;",
	),
	reflect.TypeOf(BaseCodeObjImplUnion{}): aliasUnionDeclaration(
		"BaseCodeObjImplUnion",
		"BaseCodeObjImpl",
		"CodeCallableCodeObjImpl",
		"CodeParamCodeObjImpl",
		"TextParamCodeObjImpl",
		"DateParamCodeObjImpl",
		"TimeParamCodeObjImpl",
		"ButtonParamCodeObjImpl",
		"SliderParamCodeObjImpl",
		"RotaryParamCodeObjImpl",
		"SwitchParamCodeObjImpl",
		"ColorPickerParamCodeObjImpl",
		"DropdownParamCodeObjImpl",
		"PasswordParamCodeObjImpl",
		"TextAreaParamCodeObjImpl",
		"DropzoneParamCodeObjImpl",
		"NestedParamCodeObjImpl",
	),
	reflect.TypeOf(BaseChildlessCodeObjImplUnion{}): aliasUnionDeclaration(
		"BaseChildlessCodeObjImplUnion",
		"BaseCodeObjImpl",
		"CodeParamCodeObjImpl",
		"TextParamCodeObjImpl",
		"DateParamCodeObjImpl",
		"TimeParamCodeObjImpl",
		"SliderParamCodeObjImpl",
		"RotaryParamCodeObjImpl",
		"SwitchParamCodeObjImpl",
		"ColorPickerParamCodeObjImpl",
		"DropdownParamCodeObjImpl",
		"PasswordParamCodeObjImpl",
		"TextAreaParamCodeObjImpl",
		"DropzoneParamCodeObjImpl",
	),
	reflect.TypeOf(BaseParamCodeObjImplUnion{}): aliasUnionDeclaration(
		"BaseParamCodeObjImplUnion",
		"BaseCodeObjImpl",
		"CodeParamCodeObjImpl",
		"TextParamCodeObjImpl",
		"DateParamCodeObjImpl",
		"TimeParamCodeObjImpl",
		"ButtonParamCodeObjImpl",
		"SliderParamCodeObjImpl",
		"RotaryParamCodeObjImpl",
		"SwitchParamCodeObjImpl",
		"ColorPickerParamCodeObjImpl",
		"DropdownParamCodeObjImpl",
		"PasswordParamCodeObjImpl",
		"TextAreaParamCodeObjImpl",
		"DropzoneParamCodeObjImpl",
		"NestedParamCodeObjImpl",
	),
	reflect.TypeOf(BaseParentCodeObjImplUnion{}): aliasUnionDeclaration(
		"BaseParentCodeObjImplUnion",
		"CodeCallableCodeObjImpl",
		"NestedParamCodeObjImpl",
	),
}

var generatedCodeObjAliasSpecs = map[reflect.Type]generatedCodeObjAliasSpec{
	reflect.TypeOf(CodeParamCodeObjImpl{}): {
		Name:               "CodeParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.CodeParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
	},
	reflect.TypeOf(CodeCallableCodeObjImpl{}): {
		Name:            "CodeCallableCodeObjImpl",
		TypeExpr:        "typeof CodeObjTypeEnum.CodeCallable",
		IncludeChildren: true,
	},
	reflect.TypeOf(NestedParamCodeObjImpl{}): {
		Name:             "NestedParamCodeObjImpl",
		TypeExpr:         "typeof CodeObjTypeEnum.NestedParam",
		IncludeChildren:  true,
		IncludeParamBase: true,
	},
	reflect.TypeOf(TextParamCodeObjImpl{}): {
		Name:               "TextParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.TextParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "uiType", TypeExpr: "TextParamInputUIType"},
		},
	},
	reflect.TypeOf(DateParamCodeObjImpl{}): {
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
	reflect.TypeOf(TimeParamCodeObjImpl{}): {
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
	reflect.TypeOf(ButtonParamCodeObjImpl{}): {
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
	reflect.TypeOf(SliderParamCodeObjImpl{}): {
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
	reflect.TypeOf(RotaryParamCodeObjImpl{}): {
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
	reflect.TypeOf(SwitchParamCodeObjImpl{}): {
		Name:               "SwitchParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.SwitchParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
	},
	reflect.TypeOf(ColorPickerParamCodeObjImpl{}): {
		Name:               "ColorPickerParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.ColorPickerParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "colorChoices", TypeExpr: "Array<ColorPickerChoice>"},
		},
	},
	reflect.TypeOf(DropdownParamCodeObjImpl{}): {
		Name:               "DropdownParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.DropdownParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "choices", TypeExpr: "Array<string>"},
		},
	},
	reflect.TypeOf(PasswordParamCodeObjImpl{}): {
		Name:               "PasswordParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.PasswordParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
		AdditionalProperties: []TypeProperty{
			{Name: "hasSecret", TypeExpr: "boolean"},
		},
	},
	reflect.TypeOf(TextAreaParamCodeObjImpl{}): {
		Name:               "TextAreaParamCodeObjImpl",
		TypeExpr:           "typeof CodeObjTypeEnum.TextAreaParam",
		IncludeParamBase:   true,
		IncludeParamValues: true,
	},
	reflect.TypeOf(DropzoneParamCodeObjImpl{}): {
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
}

func generatedCodeObjAliasDeclaration(t reflect.Type) (TypeDeclaration, bool) {
	if declaration, ok := generatedCodeObjAliasDeclarations[t]; ok {
		return declaration, true
	}
	if spec, ok := generatedCodeObjAliasSpecs[t]; ok {
		return generatedConcreteCodeObjAliasDeclaration(spec), true
	}
	return TypeDeclaration{}, false
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

type generatedUserDefaultSectionSpec struct {
	SectionName               string
	AdditionalPropertyOrder   []string
	PropertyTypeExprOverrides map[string]string
	IgnoredDefaultProperties  map[string]struct{}
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

var generatedUserDefaultSectionSpecs = map[reflect.Type]generatedUserDefaultSectionSpec{
	reflect.TypeOf(UserDefaultCallableSectionImpl{}): {
		SectionName: "Callable",
		AdditionalPropertyOrder: []string{
			"hideUnpinnedParams",
			"paramFilter",
			"columnWidth",
			"configLanguage",
			"edgeInputParams",
			"edgeOutputPorts",
			"hideParams",
		},
		PropertyTypeExprOverrides: map[string]string{
			"columnWidth":     "number | null",
			"configLanguage":  "ConfigLanguage",
			"edgeInputParams": "Array<string>",
			"edgeOutputPorts": "Array<EdgePort>",
			"hideParams":      "boolean",
		},
		IgnoredDefaultProperties: reflectedIgnoredProperties(
			"callable",
			"codeObjVariantMap",
			"pinnedParams",
			"selectedParams",
			"ignoreTypeErrors",
		),
	},
	reflect.TypeOf(UserDefaultDictSectionImpl{}): {
		SectionName: "Dict",
		AdditionalPropertyOrder: []string{
			"hideUnpinnedParams",
			"paramFilter",
			"columnWidth",
			"configLanguage",
			"edgeInputParams",
			"edgeOutputPorts",
			"isJsonSource",
			"jsonSourceKeys",
		},
		PropertyTypeExprOverrides: map[string]string{
			"columnWidth":     "number | null",
			"configLanguage":  "string",
			"edgeInputParams": "Array<string>",
			"edgeOutputPorts": "Array<EdgePort>",
			"jsonSourceKeys":  "Array<string>",
		},
		IgnoredDefaultProperties: reflectedIgnoredProperties(
			"codeObjVariantMap",
			"pinnedParams",
			"selectedParams",
			"ignoreTypeErrors",
			"topLevelParamId",
			"jsonSourceMissing",
		),
	},
	reflect.TypeOf(UserDefaultChatSectionImpl{}): {
		SectionName: "Chat",
		AdditionalPropertyOrder: []string{
			"managed",
			"engineConfigId",
			"transcriptionProfileId",
			"agentProfileId",
			"chatId",
			"thinking",
			"permissionMode",
			"searchEnabled",
			"dictationMode",
			"messages",
			"inputText",
			"waitingForResponse",
			"toolCallArguments",
			"activeBranchId",
			"branches",
		},
		PropertyTypeExprOverrides: map[string]string{
			"managed":                "boolean",
			"engineConfigId":         "string | null",
			"transcriptionProfileId": "string | null",
			"agentProfileId":         "string | null",
			"chatId":                 "string | null",
			"thinking":               "boolean",
			"permissionMode":         "ChatPermissionMode",
			"searchEnabled":          "boolean",
			"dictationMode":          "ChatDictationMode",
			"messages":               "Array<BaseChatMessageUnion>",
			"inputText":              "string",
			"waitingForResponse":     "boolean",
			"toolCallArguments":      "Record<string, string>",
			"activeBranchId":         "string | null",
			"branches":               "Record<string, ChatSectionBranch>",
		},
	},
	reflect.TypeOf(UserDefaultListRootSectionImpl{}): {
		SectionName: "ListRoot",
		AdditionalPropertyOrder: []string{
			"defaultChildSectionType",
			"viewMode",
		},
	},
	reflect.TypeOf(UserDefaultGroupSectionImpl{}): {
		SectionName: "Group",
		AdditionalPropertyOrder: []string{
			"isHorizontalOrientation",
			"overflowMode",
			"defaultChildSectionType",
		},
	},
	reflect.TypeOf(UserDefaultStateMachineStartSectionImpl{}): {
		SectionName: "StateMachineStart",
		AdditionalPropertyOrder: []string{
			"machineGroupId",
			"label",
			"maxIterations",
		},
		PropertyTypeExprOverrides: map[string]string{
			"machineGroupId": "string",
			"label":          "string",
			"maxIterations":  "number | null",
		},
	},
	reflect.TypeOf(UserDefaultStateMachineGateSectionImpl{}): {
		SectionName: "StateMachineGate",
		AdditionalPropertyOrder: []string{
			"machineGroupId",
			"gateType",
			"label",
			"ui",
		},
		PropertyTypeExprOverrides: map[string]string{
			"machineGroupId": "string",
			"gateType":       "StateMachineGateType",
			"label":          "string",
			"ui":             "StateMachineGateUIState",
		},
	},
	reflect.TypeOf(UserDefaultStateMachineEndSectionImpl{}): {
		SectionName: "StateMachineEnd",
		AdditionalPropertyOrder: []string{
			"machineGroupId",
			"label",
		},
		PropertyTypeExprOverrides: map[string]string{
			"machineGroupId": "string",
			"label":          "string",
		},
	},
	reflect.TypeOf(UserDefaultTextBlockSectionImpl{}): {
		SectionName: "TextBlock",
		AdditionalPropertyOrder: []string{
			"format",
			"masterFontSizePx",
			"headingAsSectionName",
			"metaControlStyle",
			"textDisplayMode",
			"text",
		},
		PropertyTypeExprOverrides: map[string]string{
			"format":               "TextBlockFormat",
			"masterFontSizePx":     "number",
			"headingAsSectionName": "boolean",
			"textDisplayMode":      "TextBlockDisplayMode",
		},
	},
	reflect.TypeOf(UserDefaultPromptSectionImpl{}): {
		SectionName: "Prompt",
		AdditionalPropertyOrder: []string{
			"template",
			"format",
			"inputs",
			"renderedText",
			"missingVariables",
			"renderError",
		},
		PropertyTypeExprOverrides: map[string]string{
			"template":         "string",
			"format":           "PromptFormat",
			"inputs":           "Record<string, string>",
			"renderedText":     "string",
			"missingVariables": "Array<string>",
			"renderError":      "string | null",
		},
	},
	reflect.TypeOf(UserDefaultCodeSectionImpl{}): {
		SectionName: "Code",
		AdditionalPropertyOrder: []string{
			"code",
			"codeFileBinding",
			"attachedTerminalSectionId",
			"codeLanguage",
			"diagnosticsIgnoreState",
		},
		PropertyTypeExprOverrides: map[string]string{
			"diagnosticsIgnoreState": "CodeSectionDiagnosticsIgnoreState",
		},
	},
	reflect.TypeOf(UserDefaultTerminalSectionImpl{}): {
		SectionName:             "Terminal",
		AdditionalPropertyOrder: nil,
	},
	reflect.TypeOf(UserDefaultBrowserSectionImpl{}): {
		SectionName: "Browser",
		AdditionalPropertyOrder: []string{
			"folder",
			"hideColumn",
			"columnWidth",
			"typesColumnWidth",
			"viewMode",
			"savedSearches",
		},
		PropertyTypeExprOverrides: map[string]string{
			"typesColumnWidth": "number | null",
			"viewMode":         "BrowserAreaViewMode",
			"savedSearches":    "Array<BrowserSavedSearch>",
		},
	},
	reflect.TypeOf(UserDefaultTaskBoardSectionImpl{}): {
		SectionName: "TaskBoard",
		AdditionalPropertyOrder: []string{
			"viewMode",
			"columns",
			"tasks",
		},
		PropertyTypeExprOverrides: map[string]string{
			"viewMode": "TaskBoardViewMode",
			"columns":  "Array<TaskBoardColumn> | null",
			"tasks":    "Array<TaskBoardTask>",
		},
	},
	reflect.TypeOf(UserDefaultChartSectionImpl{}): {
		SectionName: "Chart",
		AdditionalPropertyOrder: []string{
			"dataPath",
			"chartSettings",
		},
	},
	reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}): {
		SectionName: "Spreadsheet",
		AdditionalPropertyOrder: []string{
			"filePath",
			"activeSheet",
			"readOnly",
			"showRowNumbers",
			"density",
			"autoReloadOnExternalChange",
		},
		PropertyTypeExprOverrides: map[string]string{
			"density": "SpreadsheetGridDensity",
		},
	},
}

func generatedUserDefaultSectionSpecForType(t reflect.Type) (generatedUserDefaultSectionSpec, bool) {
	spec, ok := generatedUserDefaultSectionSpecs[t]
	return spec, ok
}
