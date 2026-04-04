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
		reflect.TypeOf(RunCodeRequestInput{}): {
			Name: "RunCodeRequestInput",
			Kind: "object",
			Properties: []TypeProperty{
				{Name: "projectConfigId", TypeExpr: "string"},
				{Name: "sectionId", TypeExpr: "string | null"},
				{Name: "terminalSectionId", TypeExpr: "string | null", Optional: true},
				{Name: "cliId", TypeExpr: "string | null", Optional: true},
				{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode | null", Optional: true},
				{Name: "drawSnapshotsBySectionId", TypeExpr: "Record<string, BinaryContentRef> | null", Optional: true},
				{Name: "sectionVariantOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
				{Name: "paramOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
			},
		},
		reflect.TypeOf(MessageTextDelta{}): objectDeclaration(
			"MessageTextDelta",
			TypeProperty{Name: "type", TypeExpr: `"text_delta"`},
			TypeProperty{Name: "index", TypeExpr: "number"},
			TypeProperty{Name: "text", TypeExpr: "string"},
		),
		reflect.TypeOf(MessageThinkingDelta{}): objectDeclaration(
			"MessageThinkingDelta",
			TypeProperty{Name: "type", TypeExpr: `"thinking_delta"`},
			TypeProperty{Name: "index", TypeExpr: "number"},
			TypeProperty{Name: "thinking", TypeExpr: "string"},
			TypeProperty{Name: "summary", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "signature", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf((*MessageContentDelta)(nil)).Elem(): aliasDeclaration(
			"MessageContentDelta",
			"MessageTextDelta | MessageThinkingDelta",
		),
		reflect.TypeOf(MessageStartEvent{}): objectDeclaration(
			"MessageStartEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_START"},
			TypeProperty{Name: "message", TypeExpr: "BaseChatMessageUnion"},
		),
		reflect.TypeOf(MessageDeltaEvent{}): objectDeclaration(
			"MessageDeltaEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.DELTA"},
			TypeProperty{Name: "message_id", TypeExpr: "string"},
			TypeProperty{Name: "content", TypeExpr: "Array<MessageContentDelta> | null", Optional: true},
		),
		reflect.TypeOf(ToolCallDeltaEvent{}): objectDeclaration(
			"ToolCallDeltaEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_CALL_DELTA"},
			TypeProperty{Name: "message_id", TypeExpr: "string"},
			TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
			TypeProperty{Name: "arguments_delta", TypeExpr: "string"},
			TypeProperty{Name: "tool_name", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(ToolResultEvent{}): objectDeclaration(
			"ToolResultEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_RESULT"},
			TypeProperty{Name: "result", TypeExpr: "ToolChatMessage"},
		),
		reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}): objectDeclaration(
			"ToolArgumentPreviewDeltaEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA"},
			TypeProperty{Name: "message_id", TypeExpr: "string"},
			TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
			TypeProperty{Name: "tool_name", TypeExpr: "string"},
			TypeProperty{Name: "arguments_delta", TypeExpr: "string"},
			TypeProperty{Name: "preview_kind", TypeExpr: "string"},
			TypeProperty{Name: "target_ids_by_type", TypeExpr: "Record<string, Array<string>>"},
			TypeProperty{Name: "preview_value_delta", TypeExpr: "string"},
		),
		reflect.TypeOf(MessageStopEvent{}): objectDeclaration(
			"MessageStopEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_STOP"},
			TypeProperty{Name: "message_id", TypeExpr: "string"},
		),
		reflect.TypeOf(MessageFinalizedEvent{}): objectDeclaration(
			"MessageFinalizedEvent",
			TypeProperty{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_FINALIZED"},
			TypeProperty{Name: "message", TypeExpr: "BaseChatMessageUnion"},
		),
		reflect.TypeOf((*LLMStreamingResponseChunk)(nil)).Elem(): aliasDeclaration(
			"LLMStreamingResponseChunk",
			"MessageStartEvent | MessageDeltaEvent | ToolCallDeltaEvent | ToolResultEvent | ToolArgumentPreviewDeltaEvent | MessageStopEvent | MessageFinalizedEvent",
		),
		reflect.TypeOf(LLMStreamingResponse{}): objectDeclaration(
			"LLMStreamingResponse",
			TypeProperty{Name: "chatId", TypeExpr: "string"},
			TypeProperty{Name: "chunk", TypeExpr: "LLMStreamingResponseChunk"},
			TypeProperty{Name: "sectionId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(SectionSizeValue{}): aliasDeclaration(
			"SectionSizeValue",
			"number | SectionSizeMode",
		),
		reflect.TypeOf(SectionSize{}): objectDeclarationWithCreateExpr(
			"SectionSize",
			`mergeGeneratedOptions(
    {
      width: SectionSizeModeEnum.auto,
      height: SectionSizeModeEnum.auto,
    },
    options,
  )`,
			TypeProperty{Name: "width", TypeExpr: "SectionSizeValue"},
			TypeProperty{Name: "height", TypeExpr: "SectionSizeValue"},
		),
		reflect.TypeOf(SectionSizingPolicyTypeEntry{}): objectDeclaration(
			"SectionSizingPolicyTypeEntry",
			TypeProperty{Name: "minHeight", TypeExpr: "number"},
			TypeProperty{Name: "maxHeight", TypeExpr: "number"},
			TypeProperty{Name: "minWidth", TypeExpr: "number"},
			TypeProperty{Name: "maxWidth", TypeExpr: "number"},
		),
		reflect.TypeOf(SectionSizingPolicyCallableTypeEntry{}): aliasDeclaration(
			"SectionSizingPolicyCallableTypeEntry",
			`SectionSizingPolicyTypeEntry & {
  hideSearchMinHeight: number;
  hideParamsMinHeight: number;
}`,
		),
		reflect.TypeOf(MetaControlSizingPolicyTypeEntry{}): objectDeclaration(
			"MetaControlSizingPolicyTypeEntry",
			TypeProperty{Name: "minHeight", TypeExpr: "number"},
			TypeProperty{Name: "minWidth", TypeExpr: "number"},
			TypeProperty{Name: "sizeModeHeight", TypeExpr: "MetaControlSizeMode"},
			TypeProperty{Name: "sizeModeWidth", TypeExpr: "MetaControlSizeMode"},
		),
		reflect.TypeOf(MetaControlSizingPolicyByType{}): objectDeclarationWithCreateBody(
			"MetaControlSizingPolicyByType",
			buildMetaControlSizingPolicyByTypeCreateBodyTS(),
			metaControlSizingPolicyByTypeProperties()...,
		),
		reflect.TypeOf(SectionSizingPolicyGlobals{}): objectDeclarationWithCreateExpr(
			"SectionSizingPolicyGlobals",
			`mergeGeneratedOptions(
    {
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 36,
      minimizedHeight: 32,
      infiniteMaxHeight: 100000,
      infiniteMaxWidth: 100000,
      autoMaxHeight: 350,
    },
    options,
  )`,
			TypeProperty{Name: "pinnedParamsAreaMinHeight", TypeExpr: "number"},
			TypeProperty{Name: "unpinnedParamsAreaMinHeight", TypeExpr: "number"},
			TypeProperty{Name: "minimizedHeight", TypeExpr: "number"},
			TypeProperty{Name: "infiniteMaxHeight", TypeExpr: "number"},
			TypeProperty{Name: "infiniteMaxWidth", TypeExpr: "number"},
			TypeProperty{Name: "autoMaxHeight", TypeExpr: "number"},
		),
		reflect.TypeOf(SectionSizingPolicyByType{}): objectDeclarationWithCreateBody(
			"SectionSizingPolicyByType",
			buildSectionSizingPolicyByTypeCreateBodyTS(),
			sectionSizingPolicyByTypeProperties()...,
		),
		reflect.TypeOf(SectionSizingPolicy{}): objectDeclarationWithCreateBody(
			"SectionSizingPolicy",
			buildSectionSizingPolicyCreateBodyTS(),
			TypeProperty{Name: "byType", TypeExpr: "SectionSizingPolicyByType"},
			TypeProperty{Name: "metaControlByType", TypeExpr: "MetaControlSizingPolicyByType"},
			TypeProperty{Name: "globals", TypeExpr: "SectionSizingPolicyGlobals"},
		),
		reflect.TypeOf(SharePolicy{}): objectDeclarationWithCreateExpr(
			"SharePolicy",
			buildDefaultSharePolicyCreateExprTS(),
			TypeProperty{Name: "allowParamChanges", TypeExpr: "boolean"},
			TypeProperty{Name: "allowVariantChanges", TypeExpr: "boolean"},
			TypeProperty{Name: "allowLayoutChanges", TypeExpr: "boolean"},
			TypeProperty{Name: "allowRun", TypeExpr: "boolean"},
			TypeProperty{Name: "allowLLM", TypeExpr: "boolean"},
			TypeProperty{Name: "allowExternalLinks", TypeExpr: "boolean"},
			TypeProperty{Name: "allowFileDownloads", TypeExpr: "boolean"},
			TypeProperty{Name: "allowMultipleRuns", TypeExpr: "boolean"},
			TypeProperty{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode"},
		),
		reflect.TypeOf(SettingsShortcuts{}): objectDeclarationWithCreateExpr(
			"SettingsShortcuts",
			buildSettingsSectionCreateExprTS("shortcuts", settingsShortcutsTypeProperties()),
			settingsShortcutsTypeProperties()...,
		),
		reflect.TypeOf(SettingsGUI{}): objectDeclarationWithCreateExpr(
			"SettingsGUI",
			buildSettingsSectionCreateExprTS("gui", settingsGUITypeProperties()),
			settingsGUITypeProperties()...,
		),
		reflect.TypeOf(SettingsBackend{}): objectDeclarationWithCreateExpr(
			"SettingsBackend",
			buildSettingsSectionCreateExprTS("backend", settingsBackendTypeProperties()),
			settingsBackendTypeProperties()...,
		),
		reflect.TypeOf(SettingsState{}): objectDeclarationWithCreateBody(
			"SettingsState",
			buildSettingsStateCreateBodyTS(),
			TypeProperty{Name: "shortcuts", TypeExpr: "SettingsShortcuts"},
			TypeProperty{Name: "gui", TypeExpr: "SettingsGUI"},
			TypeProperty{Name: "backend", TypeExpr: "SettingsBackend"},
			TypeProperty{Name: "sectionSizingPolicy", TypeExpr: "SectionSizingPolicy"},
			TypeProperty{Name: "languageServer", TypeExpr: "Record<string, unknown>"},
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
		reflect.TypeOf(Edge{}): objectDeclaration(
			"Edge",
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
			TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
			TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
			TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
			TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
			TypeProperty{Name: "targetPortId", TypeExpr: "string"},
			TypeProperty{Name: "type", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "label", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
			TypeProperty{Name: "animated", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "data", TypeExpr: "Record<string, unknown>", Optional: true},
			TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
		),
		reflect.TypeOf(StateMachineGateUIState{}): objectDeclarationWithCreateExpr(
			"StateMachineGateUIState",
			`mergeGeneratedOptions(
    {
      showDetails: false,
    },
    options,
  )`,
			TypeProperty{Name: "showDetails", TypeExpr: "boolean", Optional: true},
		),
		reflect.TypeOf(StateMachineSourceFilter{}): objectDeclarationWithCreateExpr(
			"StateMachineSourceFilter",
			`mergeGeneratedOptions(
    {
      type: StateMachineSourceFilterTypeEnum.run_completed,
      signalName: null,
      payloadField: null,
      equals: null,
    },
    options,
  )`,
			TypeProperty{Name: "type", TypeExpr: "StateMachineSourceFilterType", Optional: true},
			TypeProperty{Name: "signalName", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "payloadField", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "equals", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(StateMachineSourceActivationCountCondition{}): objectDeclarationWithCreateExpr(
			"StateMachineSourceActivationCountCondition",
			`mergeGeneratedOptions(
    {
      operator: StateMachineCountOperatorEnum.eq,
      value: 0,
    },
    options,
  )`,
			TypeProperty{Name: "operator", TypeExpr: "StateMachineCountOperator", Optional: true},
			TypeProperty{Name: "value", TypeExpr: "number"},
		),
		reflect.TypeOf(StateMachineTargetAction{}): objectDeclarationWithCreateExpr(
			"StateMachineTargetAction",
			`mergeGeneratedOptions(
    {
      type: StateMachineTargetActionTypeEnum.send_prompt,
      promptTemplateId: null,
      promptSectionId: null,
      inlinePrompt: null,
      promptInputs: {},
      threadStrategy: StateMachineThreadStrategyEnum.continue_current_thread,
      stopIfRunning: false,
      engineConfigId: null,
      agentProfileId: null,
      permissionMode: null,
      searchEnabled: null,
    },
    options,
  )`,
			TypeProperty{Name: "type", TypeExpr: "StateMachineTargetActionType", Optional: true},
			TypeProperty{Name: "promptTemplateId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "promptSectionId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "inlinePrompt", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "promptInputs", TypeExpr: "Record<string, string>", Optional: true},
			TypeProperty{Name: "threadStrategy", TypeExpr: "StateMachineThreadStrategy", Optional: true},
			TypeProperty{Name: "stopIfRunning", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "agentProfileId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "permissionMode", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "searchEnabled", TypeExpr: "boolean | null", Optional: true},
		),
		reflect.TypeOf(StateMachineEdge{}): objectDeclarationWithCreateExpr(
			"StateMachineEdge",
			`mergeGeneratedOptions(
    {
      id: "",
      machineGroupId: "",
      sourceSectionId: "",
      sourcePortId: "workflow-source",
      targetSectionId: "",
      targetPortId: "workflow-target",
      sourceFilter: null,
      sourceActivationCountCondition: null,
      targetAction: null,
      style: null,
      hidden: false,
      zIndex: 0,
      selected: false,
    },
    options,
  )`,
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
			TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
			TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
			TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
			TypeProperty{Name: "targetPortId", TypeExpr: "string"},
			TypeProperty{Name: "sourceFilter", TypeExpr: "StateMachineSourceFilter | null", Optional: true},
			TypeProperty{Name: "sourceActivationCountCondition", TypeExpr: "StateMachineSourceActivationCountCondition | null", Optional: true},
			TypeProperty{Name: "targetAction", TypeExpr: "StateMachineTargetAction | null", Optional: true},
			TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
			TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
		),
		reflect.TypeOf(AgenticEdge{}): objectDeclarationWithCreateExpr(
			"AgenticEdge",
			`mergeGeneratedOptions(
    {
      id: "",
      sourceSectionId: "",
      targetSectionId: "",
      kind: AgenticEdgeKindEnum.section_chat,
      contextMode: null,
      style: {},
      hidden: false,
      zIndex: 0,
      selected: false,
    },
    options,
  )`,
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
			TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
			TypeProperty{Name: "kind", TypeExpr: "AgenticEdgeKind"},
			TypeProperty{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
			TypeProperty{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
			TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "selected", TypeExpr: "boolean", Optional: true},
		),
		reflect.TypeOf(ClipboardProjectStateCore{}): objectDeclarationWithCreateExpr(
			"ClipboardProjectStateCore",
			`mergeGeneratedOptions(
    {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
    },
    options,
  )`,
			TypeProperty{Name: "sections", TypeExpr: "Record<string, Core>"},
			TypeProperty{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>"},
			TypeProperty{Name: "sectionVariants", TypeExpr: "Record<string, Variant>"},
			TypeProperty{Name: "codeObjs", TypeExpr: "Record<string, Core>"},
			TypeProperty{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>"},
			TypeProperty{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>"},
		),
		reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}): objectDeclarationWithCreateExpr(
			"ClipboardProjectStateCoreWithSectionVariantMap",
			`mergeGeneratedOptions(
    {
      core: createClipboardProjectStateCore(),
      sectionVariantMap: {},
    },
    options,
  )`,
			TypeProperty{Name: "core", TypeExpr: "ClipboardProjectStateCore"},
			TypeProperty{Name: "sectionVariantMap", TypeExpr: "Record<string, string>"},
		),
		reflect.TypeOf(SectionsClipboardData{}): objectDeclarationWithCreateExpr(
			"SectionsClipboardData",
			`mergeGeneratedOptions(
    {
      type: ClipboardDataTypeEnum.Sections,
      data: createClipboardProjectStateCoreWithSectionVariantMap(),
    },
    options,
  )`,
			TypeProperty{Name: "type", TypeExpr: "typeof ClipboardDataTypeEnum.Sections"},
			TypeProperty{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap"},
		),
		reflect.TypeOf(BaseClipboardDataUnionWithDiscriminator{}): aliasDeclaration(
			"BaseClipboardDataUnionWithDiscriminator",
			"SectionsClipboardData",
		),
		reflect.TypeOf(ProjectStateSingleConfigWithCompletedOpIds{}): objectDeclarationWithCreateExpr(
			"ProjectStateSingleConfigWithCompletedOpIds",
			`mergeGeneratedOptions(
    {
      projectState: createProjectStateSingleConfig(),
      completedOpIds: [],
      pendingOpIds: [],
    },
    options,
  )`,
			TypeProperty{Name: "projectState", TypeExpr: "ProjectStateSingleConfig"},
			TypeProperty{Name: "completedOpIds", TypeExpr: "Array<string>"},
			TypeProperty{Name: "pendingOpIds", TypeExpr: "Array<string>"},
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
		reflect.TypeOf(UserDefaultCallableSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultCallableSectionImpl",
			"Callable",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
			TypeProperty{Name: "paramFilter", TypeExpr: "string"},
			TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
			TypeProperty{Name: "configLanguage", TypeExpr: "ConfigLanguage"},
			TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>"},
			TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
			TypeProperty{Name: "hideParams", TypeExpr: "boolean"},
		),
		reflect.TypeOf(UserDefaultDictSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultDictSectionImpl",
			"Dict",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "hideUnpinnedParams", TypeExpr: "boolean"},
			TypeProperty{Name: "paramFilter", TypeExpr: "string"},
			TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
			TypeProperty{Name: "configLanguage", TypeExpr: "string"},
			TypeProperty{Name: "edgeInputParams", TypeExpr: "Array<string>"},
			TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
			TypeProperty{Name: "isJsonSource", TypeExpr: "boolean"},
			TypeProperty{Name: "jsonSourceKeys", TypeExpr: "Array<string>"},
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
		reflect.TypeOf(UserDefaultCodeParamCodeObjImpl{}): objectDeclarationWithCreateExpr(
			"UserDefaultCodeParamCodeObjImpl",
			`mergeGeneratedOptions(
    {
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      typeAnnotation: "",
      defaultVal: "",
      value: "",
    },
    options,
  )`,
			TypeProperty{Name: "coreNameType", TypeExpr: "ParamNameType"},
			TypeProperty{Name: "coreNameEditable", TypeExpr: "boolean"},
			TypeProperty{Name: "typeAnnotation", TypeExpr: "string"},
			TypeProperty{Name: "defaultVal", TypeExpr: "string"},
			TypeProperty{Name: "value", TypeExpr: "string"},
		),
		reflect.TypeOf(ColorPickerChoice{}): objectDeclaration(
			"ColorPickerChoice",
			TypeProperty{Name: "color", TypeExpr: "string"},
			TypeProperty{Name: "description", TypeExpr: "string"},
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
		reflect.TypeOf(UserDefaultChatSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultChatSectionImpl",
			"Chat",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "managed", TypeExpr: "boolean"},
			TypeProperty{Name: "engineConfigId", TypeExpr: "string | null"},
			TypeProperty{Name: "transcriptionProfileId", TypeExpr: "string | null"},
			TypeProperty{Name: "agentProfileId", TypeExpr: "string | null"},
			TypeProperty{Name: "chatId", TypeExpr: "string | null"},
			TypeProperty{Name: "thinking", TypeExpr: "boolean"},
			TypeProperty{Name: "permissionMode", TypeExpr: "ChatPermissionMode"},
			TypeProperty{Name: "searchEnabled", TypeExpr: "boolean"},
			TypeProperty{Name: "dictationMode", TypeExpr: "ChatDictationMode"},
			TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
			TypeProperty{Name: "inputText", TypeExpr: "string"},
			TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
			TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "activeBranchId", TypeExpr: "string | null"},
			TypeProperty{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>"},
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
