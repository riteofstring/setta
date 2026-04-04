package frontendbindings

import (
	"reflect"
)

func frontendBindingDeclarationOverrides() map[reflect.Type]TypeDeclaration {
	return map[reflect.Type]TypeDeclaration{
		reflect.TypeOf(BaseDependencyKeyUnion{}): {
			Name:  "BaseDependencyKeyUnion",
			Kind:  "alias",
			Alias: "SectionDependencyKey | SectionParamDependencyKey",
		},
		reflect.TypeOf(BaseDependencyValueUnion{}): {
			Name:  "BaseDependencyValueUnion",
			Kind:  "alias",
			Alias: "LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue",
		},
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
		reflect.TypeOf(BaseSectionImpl{}): objectDeclaration(
			"BaseSectionImpl",
			TypeProperty{Name: "type", TypeExpr: "SectionType"},
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "isInOtherProjectConfigs", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "aspectRatioExtraHeight", TypeExpr: "number"},
			TypeProperty{Name: "aspectRatioExtraWidth", TypeExpr: "number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "isPreset", TypeExpr: "boolean"},
			TypeProperty{Name: "children", TypeExpr: "Array<string>", Optional: true},
			TypeProperty{Name: "codeObjVariantMap", TypeExpr: "Record<string, string>", Optional: true},
			TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "paramFilter", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "columnWidth", TypeExpr: "number | null", Optional: true},
			TypeProperty{Name: "configLanguage", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "pinnedParams", TypeExpr: "Array<string>", Optional: true},
			TypeProperty{Name: "selectedParams", TypeExpr: "Array<string>", Optional: true},
			TypeProperty{Name: "ignoreTypeErrors", TypeExpr: "TypeErrorIgnoreState", Optional: true},
			TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: true},
			TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: true},
			TypeProperty{Name: "topLevelParamId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "isJsonSource", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: true},
			TypeProperty{Name: "jsonSourceMissing", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "metaControlParamId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "showSectionTitle", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "code", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "codeLanguage", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
			TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: true},
			TypeProperty{Name: "inputText", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: true},
			TypeProperty{Name: "pluginId", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "kind", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
			TypeProperty{Name: "schemaVersion", TypeExpr: "number | null", Optional: true},
			TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: true},
			TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: true},
			TypeProperty{Name: "isHorizontalOrientation", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "overflowMode", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "hideColumn", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "folder", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "filePath", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "activeSheet", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "readOnly", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "density", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "text", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "metaControlStyle", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "imagePath", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "dataPath", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: true},
		),
		reflect.TypeOf(CallableSectionImpl{}): aliasDeclaration(
			"CallableSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Callable;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  callable?: string | null;
  hideParams: boolean;
}`,
		),
		reflect.TypeOf(BaseParentSectionImplUnion{}): aliasDeclaration(
			"BaseParentSectionImplUnion",
			`BaseSectionImpl & {
  children: Array<string>;
}`,
		),
		reflect.TypeOf(BaseSectionWithParamsImplUnion{}): aliasDeclaration(
			"BaseSectionWithParamsImplUnion",
			`BaseSectionImpl & {
  codeObjVariantMap: Record<string, string>;
}`,
		),
		reflect.TypeOf(DictSectionImpl{}): aliasDeclaration(
			"DictSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
		),
		reflect.TypeOf(BaseDictSectionImplUnion{}): aliasDeclaration(
			"BaseDictSectionImplUnion",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
}`,
		),
		reflect.TypeOf(BaseCodeObjImpl{}): aliasDeclaration(
			"BaseCodeObjImpl",
			`{
  type: CodeObjType;
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  children?: Array<string>;
  coreNameType?: ParamNameType;
  coreNameEditable?: boolean;
  passingStyle?: ParameterPassingStyle;
  typeAnnotation?: string;
  defaultVal?: string;
  value?: string;
  [key: string]: unknown;
}`,
		),
		reflect.TypeOf(CodeParamCodeObjImpl{}): aliasDeclaration(
			"CodeParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
		),
		reflect.TypeOf(CodeCallableCodeObjImpl{}): aliasDeclaration(
			"CodeCallableCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeCallable;
  children: Array<string>;
}`,
		),
		reflect.TypeOf(NestedParamCodeObjImpl{}): aliasDeclaration(
			"NestedParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.NestedParam;
  children: Array<string>;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
}`,
		),
		reflect.TypeOf(BaseCodeObjImplUnion{}): aliasDeclaration(
			"BaseCodeObjImplUnion",
			`BaseCodeObjImpl
  | CodeCallableCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
		),
		reflect.TypeOf(BaseChildlessCodeObjImplUnion{}): aliasDeclaration(
			"BaseChildlessCodeObjImplUnion",
			`BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl`,
		),
		reflect.TypeOf(BaseParamCodeObjImplUnion{}): aliasDeclaration(
			"BaseParamCodeObjImplUnion",
			`BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl`,
		),
		reflect.TypeOf(BaseParentCodeObjImplUnion{}): aliasDeclaration(
			"BaseParentCodeObjImplUnion",
			`CodeCallableCodeObjImpl
  | NestedParamCodeObjImpl`,
		),
		reflect.TypeOf(TextParamCodeObjImpl{}): aliasDeclaration(
			"TextParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  uiType: TextParamInputUIType;
}`,
		),
		reflect.TypeOf(DateParamCodeObjImpl{}): aliasDeclaration(
			"DateParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DateParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
}`,
		),
		reflect.TypeOf(TimeParamCodeObjImpl{}): aliasDeclaration(
			"TimeParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TimeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
}`,
		),
		reflect.TypeOf(ButtonParamCodeObjImpl{}): aliasDeclaration(
			"ButtonParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ButtonParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  label: string;
  actionMode: ButtonActionMode;
  requestMethod: HttpRequestMethod;
  requestUrl: string;
  requestHeaderKey: string;
  requestHeaderValue: string;
  requestBody: string;
}`,
		),
		reflect.TypeOf(SliderParamCodeObjImpl{}): aliasDeclaration(
			"SliderParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SliderParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
		),
		reflect.TypeOf(RotaryParamCodeObjImpl{}): aliasDeclaration(
			"RotaryParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.RotaryParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
}`,
		),
		reflect.TypeOf(SwitchParamCodeObjImpl{}): aliasDeclaration(
			"SwitchParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SwitchParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
		),
		reflect.TypeOf(ColorPickerParamCodeObjImpl{}): aliasDeclaration(
			"ColorPickerParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ColorPickerParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  colorChoices: Array<ColorPickerChoice>;
}`,
		),
		reflect.TypeOf(DropdownParamCodeObjImpl{}): aliasDeclaration(
			"DropdownParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropdownParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  choices: Array<string>;
}`,
		),
		reflect.TypeOf(PasswordParamCodeObjImpl{}): aliasDeclaration(
			"PasswordParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.PasswordParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  hasSecret: boolean;
}`,
		),
		reflect.TypeOf(TextAreaParamCodeObjImpl{}): aliasDeclaration(
			"TextAreaParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextAreaParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
}`,
		),
		reflect.TypeOf(DropzoneParamCodeObjImpl{}): aliasDeclaration(
			"DropzoneParamCodeObjImpl",
			`BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropzoneParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  mode: DropzoneMode;
  maxAttachments?: number | null;
  placeholder: string;
}`,
		),
		reflect.TypeOf(ListRootSectionImpl{}): aliasDeclaration(
			"ListRootSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.ListRoot;
  children: Array<string>;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
}`,
		),
		reflect.TypeOf(GroupSectionImpl{}): aliasDeclaration(
			"GroupSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Group;
  children: Array<string>;
  isHorizontalOrientation: boolean;
  overflowMode: boolean;
  defaultChildSectionType: SectionType;
}`,
		),
		reflect.TypeOf(StateMachineStartSectionImpl{}): aliasDeclaration(
			"StateMachineStartSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineStart;
  machineGroupId: string;
  label: string;
  maxIterations?: number | null;
}`,
		),
		reflect.TypeOf(StateMachineGateSectionImpl{}): aliasDeclaration(
			"StateMachineGateSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineGate;
  machineGroupId: string;
  gateType: StateMachineGateType;
  label: string;
  ui: StateMachineGateUIState;
}`,
		),
		reflect.TypeOf(StateMachineEndSectionImpl{}): aliasDeclaration(
			"StateMachineEndSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineEnd;
  machineGroupId: string;
  label: string;
}`,
		),
		reflect.TypeOf(TextBlockSectionImpl{}): aliasDeclaration(
			"TextBlockSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.TextBlock;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
}`,
		),
		reflect.TypeOf(PromptSectionImpl{}): aliasDeclaration(
			"PromptSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Prompt;
  promptTemplateId?: string | null;
  template: string;
  format: PromptFormat;
  inputs: Record<string, string>;
  renderedText: string;
  missingVariables: Array<string>;
  renderError?: string | null;
}`,
		),
		reflect.TypeOf(CodeSectionImpl{}): aliasDeclaration(
			"CodeSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Code;
  children: Array<string>;
  code: string;
  codeLanguage: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
}`,
		),
		reflect.TypeOf(TerminalSectionImpl{}): aliasDeclaration(
			"TerminalSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Terminal;
}`,
		),
		reflect.TypeOf(BaseSectionImplUnion{}): aliasDeclaration(
			"BaseSectionImplUnion",
			`CallableSectionImpl
  | DictSectionImpl
  | ListRootSectionImpl
  | GroupSectionImpl
  | StateMachineStartSectionImpl
  | StateMachineGateSectionImpl
  | StateMachineEndSectionImpl
  | TextBlockSectionImpl
  | PromptSectionImpl
  | CodeSectionImpl
  | TerminalSectionImpl
  | ChatSectionImpl
  | BrowserSectionImpl
  | ChartSectionImpl
  | TaskBoardSectionImpl
  | SpreadsheetSectionImpl
  | BaseSectionImpl`,
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
		reflect.TypeOf(ChatSectionImpl{}): aliasDeclaration(
			"ChatSectionImpl",
			`BaseSectionImpl & ChatSectionState & {
  type: typeof SectionTypeEnum.Chat;
  managed: boolean;
  engineConfigId?: string | null;
  transcriptionProfileId?: string | null;
  agentProfileId?: string | null;
  chatId?: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
}`,
		),
		reflect.TypeOf(BrowserSectionImpl{}): aliasDeclaration(
			"BrowserSectionImpl",
			`Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.Browser;
  folder: string;
  hideColumn: boolean;
  columnWidth?: number | null;
  typesColumnWidth?: number | null;
  viewMode: BrowserAreaViewMode;
  savedSearches: Array<BrowserSavedSearch>;
}`,
		),
		reflect.TypeOf(TaskBoardSectionImpl{}): aliasDeclaration(
			"TaskBoardSectionImpl",
			`Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.TaskBoard;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
}`,
		),
		reflect.TypeOf(BaseChartSettingsUnion{}): aliasDeclaration(
			"BaseChartSettingsUnion",
			"LineChartSettings | ScatterChartSettings",
		),
		reflect.TypeOf(ChartSectionImpl{}): aliasDeclaration(
			"ChartSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Chart;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
}`,
		),
		reflect.TypeOf(SpreadsheetSectionImpl{}): aliasDeclaration(
			"SpreadsheetSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Spreadsheet;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
}`,
		),
		reflect.TypeOf(BinaryUploadRequestInput{}): {
			Name:  "BinaryUploadRequestInput",
			Kind:  "alias",
			Alias: "FormData",
		},
		reflect.TypeOf(BinaryDownloadResponse{}): {
			Name:  "BinaryDownloadResponse",
			Kind:  "alias",
			Alias: "Uint8Array",
		},
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
}
