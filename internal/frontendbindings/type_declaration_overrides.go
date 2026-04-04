package frontendbindings

import (
	"reflect"

	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/scriptablechat"
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
		reflect.TypeOf(EngineConfig{}): objectDeclarationWithCreateBody(
			"EngineConfig",
			buildEngineConfigCreateBodyTS(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "engineType", TypeExpr: "EngineType"},
			TypeProperty{Name: "settaLlmConfigId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "externalAgentConfigId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "defaults", TypeExpr: "EngineConfigDefaults"},
			TypeProperty{Name: "runtimeSupport", TypeExpr: "EngineRuntimeSupport | null", Optional: true},
		),
		reflect.TypeOf(AgentProfile{}): objectDeclaration(
			"AgentProfile",
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "description", TypeExpr: "string"},
			TypeProperty{Name: "systemPrompt", TypeExpr: "string"},
			TypeProperty{Name: "enableBackgroundSummaryFill", TypeExpr: "boolean"},
			TypeProperty{Name: "enableLlmChatTitles", TypeExpr: "boolean"},
			TypeProperty{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "toolAllowlist", TypeExpr: "Array<string>"},
			TypeProperty{Name: "memoryScope", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(TranscriptionProfile{}): objectDeclaration(
			"TranscriptionProfile",
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "transcriptionLlmConfigId", TypeExpr: "string"},
			TypeProperty{Name: "transportMode", TypeExpr: "TranscriptionTransportMode"},
			TypeProperty{Name: "chunkMs", TypeExpr: "number"},
			TypeProperty{Name: "supportsRealtimeTranscription", TypeExpr: "boolean"},
			TypeProperty{Name: "language", TypeExpr: "string | null", Optional: true},
		),
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
		reflect.TypeOf(UpdateAgentProfileRequestInput{}): objectDeclaration(
			"UpdateAgentProfileRequestInput",
			TypeProperty{Name: "profile", TypeExpr: "AgentProfile"},
		),
		reflect.TypeOf(UpdateEngineConfigRequestInput{}): objectDeclaration(
			"UpdateEngineConfigRequestInput",
			TypeProperty{Name: "config", TypeExpr: "EngineConfig"},
		),
		reflect.TypeOf(CreateTranscriptionProfileRequestInput{}): objectDeclaration(
			"CreateTranscriptionProfileRequestInput",
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "transcriptionLlmConfigId", TypeExpr: "string"},
			TypeProperty{Name: "transportMode", TypeExpr: "TranscriptionTransportMode"},
			TypeProperty{Name: "chunkMs", TypeExpr: "number"},
			TypeProperty{Name: "language", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(UpdateTranscriptionProfileRequestInput{}): objectDeclaration(
			"UpdateTranscriptionProfileRequestInput",
			TypeProperty{Name: "profile", TypeExpr: "TranscriptionProfile"},
		),
		reflect.TypeOf(SetChatSectionStateRequestInput{}): objectDeclaration(
			"SetChatSectionStateRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "state", TypeExpr: "ChatSectionState"},
		),
		reflect.TypeOf(SetStateMachineSectionSettingsRequestInput{}): objectDeclaration(
			"SetStateMachineSectionSettingsRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
			TypeProperty{Name: "label", TypeExpr: "string"},
			TypeProperty{Name: "gateType", TypeExpr: "StateMachineGateType | null", Optional: true},
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
		reflect.TypeOf(SectionCodegenPolicy{}): objectDeclarationWithCreateBody(
			"SectionCodegenPolicy",
			buildSectionCodegenPolicyCreateBodyTS(),
			TypeProperty{Name: "allowlist", TypeExpr: "Array<SectionType> | null", Optional: true},
			TypeProperty{Name: "metaControlAllowlist", TypeExpr: "Array<CodeObjType> | null", Optional: true},
			TypeProperty{Name: "exclude", TypeExpr: "Array<string>"},
			TypeProperty{Name: "typePolicies", TypeExpr: "Record<SectionType, SectionTypeCodegenPolicy>"},
			TypeProperty{Name: "sectionOverrides", TypeExpr: "Record<string, SectionCodegenOverride>"},
		),
		reflect.TypeOf(CodeObjValuePolicy{}): objectDeclarationWithCreateBody(
			"CodeObjValuePolicy",
			buildCodeObjValuePolicyCreateBodyTS(),
			TypeProperty{Name: "typePolicies", TypeExpr: "Record<CodeObjType, CodeObjTypeValuePolicy>"},
			TypeProperty{Name: "codeObjOverrides", TypeExpr: "Record<string, CodeObjValueOverride>"},
		),
		reflect.TypeOf(ProjectCodegenPythonTarget{}): objectDeclarationWithCreateBody(
			"ProjectCodegenPythonTarget",
			buildProjectCodegenPythonTargetCreateBodyTS(),
			TypeProperty{Name: "language", TypeExpr: "typeof ProjectCodegenLanguageEnum.python"},
			TypeProperty{Name: "genCodePrefix", TypeExpr: "string"},
			TypeProperty{Name: "genCodeSuffix", TypeExpr: "string"},
			TypeProperty{Name: "generateMetadata", TypeExpr: "boolean"},
			TypeProperty{Name: "sectionPolicy", TypeExpr: "SectionCodegenPolicy"},
			TypeProperty{Name: "codeObjValuePolicy", TypeExpr: "CodeObjValuePolicy"},
		),
		reflect.TypeOf(ProjectCodegenTarget{}): aliasDeclaration(
			"ProjectCodegenTarget",
			"ProjectCodegenPythonTarget | ProjectCodegenPluginTarget",
		),
		reflect.TypeOf(Viewport{}): objectDeclaration(
			"Viewport",
			TypeProperty{Name: "x", TypeExpr: "number"},
			TypeProperty{Name: "y", TypeExpr: "number"},
			TypeProperty{Name: "zoom", TypeExpr: "number"},
		),
		reflect.TypeOf(TopLevelSectionLayout{}): objectDeclarationWithCreateExpr(
			"TopLevelSectionLayout",
			`mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      zIndex: 0,
      w: null,
      h: null,
    },
    options,
  )`,
			TypeProperty{Name: "x", TypeExpr: "number"},
			TypeProperty{Name: "y", TypeExpr: "number"},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "w", TypeExpr: "number | null", Optional: true},
			TypeProperty{Name: "h", TypeExpr: "number | null", Optional: true},
		),
		reflect.TypeOf(ViewMode{}): objectDeclarationWithCreateExpr(
			"ViewMode",
			`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      sortIndex: 0,
      isUserFacing: false,
      isTab: false,
      visibilityBySectionId: {},
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {},
    },
    options,
  )`,
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "sortIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "isUserFacing", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "isTab", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "visibilityBySectionId", TypeExpr: "Record<string, boolean>", Optional: true},
			TypeProperty{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
			TypeProperty{Name: "viewportInitialized", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: true},
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
		reflect.TypeOf(WatchCodeFolder{}): objectDeclaration(
			"WatchCodeFolder",
			TypeProperty{Name: "path", TypeExpr: "string"},
			TypeProperty{Name: "recursive", TypeExpr: "boolean"},
		),
		reflect.TypeOf(WatchCodeRegistryEntry{}): objectDeclaration(
			"WatchCodeRegistryEntry",
			TypeProperty{Name: "callableName", TypeExpr: "string"},
			TypeProperty{Name: "kind", TypeExpr: "string"},
			TypeProperty{Name: "signatureHash", TypeExpr: "string"},
			TypeProperty{Name: "bodyHash", TypeExpr: "string"},
			TypeProperty{Name: "sourcePath", TypeExpr: "string"},
			TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>", Optional: true},
			TypeProperty{Name: "sectionsCount", TypeExpr: "number", Optional: true},
		),
		reflect.TypeOf(CodeFileBinding{}): objectDeclaration(
			"CodeFileBinding",
			TypeProperty{Name: "canonical_path", TypeExpr: "string"},
			TypeProperty{Name: "access_mode", TypeExpr: "CodeFileAccessMode"},
			TypeProperty{Name: "autoBinding", TypeExpr: "boolean"},
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
		reflect.TypeOf(Core{}): objectDeclarationWithCreateExpr(
			"Core",
			`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      displayName: "",
      variants: [],
      defaultVariant: null,
      sharedModifier: {},
      unsharedKeys: [],
    },
    options,
  )`,
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "displayName", TypeExpr: "string"},
			TypeProperty{Name: "variants", TypeExpr: "Array<string>"},
			TypeProperty{Name: "defaultVariant", TypeExpr: "string | null"},
			TypeProperty{Name: "sharedModifier", TypeExpr: "Record<string, unknown>"},
			TypeProperty{Name: "unsharedKeys", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(Variant{}): objectDeclarationWithCreateExpr(
			"Variant",
			`mergeGeneratedOptions(
    {
      id: "",
      name: "",
      impl: "",
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    options,
  )`,
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "impl", TypeExpr: "string"},
			TypeProperty{Name: "nonPresetImpls", TypeExpr: "Array<string>"},
			TypeProperty{Name: "modifier", TypeExpr: "Record<string, unknown>"},
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
		),
		reflect.TypeOf(SingletonSections{}): objectDeclarationWithCreateExpr(
			"SingletonSections",
			`mergeGeneratedOptions(
    {
      GlobalVariables: null,
      GenPythonCode: null,
      GenPythonMetadata: null,
    },
    options,
  )`,
			TypeProperty{Name: "GlobalVariables", TypeExpr: "string | null"},
			TypeProperty{Name: "GenPythonCode", TypeExpr: "string | null"},
			TypeProperty{Name: "GenPythonMetadata", TypeExpr: "string | null"},
		),
		reflect.TypeOf(ShownParamIdDetails{}): objectDeclarationWithCreateExpr(
			"ShownParamIdDetails",
			`mergeGeneratedOptions(
    {
      requiredParamIdsToPaths: {},
      topLevelParamIds: [],
    },
    options,
  )`,
			TypeProperty{Name: "requiredParamIdsToPaths", TypeExpr: "Record<string, Array<string>>"},
			TypeProperty{Name: "topLevelParamIds", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(ShownParamIds{}): objectDeclarationWithCreateExpr(
			"ShownParamIds",
			`mergeGeneratedOptions(
    {
      pinned: createShownParamIdDetails(),
      unpinned: createShownParamIdDetails(),
    },
    options,
  )`,
			TypeProperty{Name: "pinned", TypeExpr: "ShownParamIdDetails"},
			TypeProperty{Name: "unpinned", TypeExpr: "ShownParamIdDetails"},
		),
		reflect.TypeOf(ChatWindowBounds{}): objectDeclarationWithCreateExpr(
			"ChatWindowBounds",
			`mergeGeneratedOptions(
    {
      x: 120,
      y: 120,
      width: 820,
      height: 520,
    },
    options,
  )`,
			TypeProperty{Name: "x", TypeExpr: "number"},
			TypeProperty{Name: "y", TypeExpr: "number"},
			TypeProperty{Name: "width", TypeExpr: "number"},
			TypeProperty{Name: "height", TypeExpr: "number"},
		),
		reflect.TypeOf(ChatWindowDockMetrics{}): objectDeclarationWithCreateExpr(
			"ChatWindowDockMetrics",
			`mergeGeneratedOptions(
    {
      widthFraction: null,
      preferredWidthPx: null,
    },
    options,
  )`,
			TypeProperty{Name: "widthFraction", TypeExpr: "number | null", Optional: true},
			TypeProperty{Name: "preferredWidthPx", TypeExpr: "number | null", Optional: true},
		),
		reflect.TypeOf(ProjectChatWindowInstance{}): objectDeclarationWithCreateExpr(
			"ProjectChatWindowInstance",
			`mergeGeneratedOptions(
    {
      instanceId: "",
      placement: ChatWindowPlacementEnum.bottom_docked,
      isMinimized: false,
      isClosed: false,
      isMaximized: false,
      bounds: createChatWindowBounds(),
      dockMetrics: createChatWindowDockMetrics(),
      zIndex: 0,
      lastPlacementBeforeMaximize: null,
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: null,
      title: null,
      lastFocusedAt: 0,
      chatId: null,
    },
    options,
  )`,
			TypeProperty{Name: "instanceId", TypeExpr: "string"},
			TypeProperty{Name: "placement", TypeExpr: "ChatWindowPlacement", Optional: true},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "isClosed", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "isMaximized", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "bounds", TypeExpr: "ChatWindowBounds", Optional: true},
			TypeProperty{Name: "dockMetrics", TypeExpr: "ChatWindowDockMetrics", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "lastPlacementBeforeMaximize", TypeExpr: "ChatWindowPlacement | null", Optional: true},
			TypeProperty{Name: "mode", TypeExpr: "ChatWindowMode", Optional: true},
			TypeProperty{Name: "sectionIdOrNull", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "title", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "lastFocusedAt", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(ProjectChatWindowingState{}): objectDeclarationWithCreateExpr(
			"ProjectChatWindowingState",
			`mergeGeneratedOptions(
    {
      instancesById: {},
      order: [],
      nextInstanceNumber: 1,
    },
    options,
  )`,
			TypeProperty{Name: "instancesById", TypeExpr: "Record<string, ProjectChatWindowInstance>"},
			TypeProperty{Name: "order", TypeExpr: "Array<string>"},
			TypeProperty{Name: "nextInstanceNumber", TypeExpr: "number"},
		),
		reflect.TypeOf(NormalizedFloatingWindowBounds{}): objectDeclarationWithCreateExpr(
			"NormalizedFloatingWindowBounds",
			`mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    options,
  )`,
			TypeProperty{Name: "x", TypeExpr: "number"},
			TypeProperty{Name: "y", TypeExpr: "number"},
			TypeProperty{Name: "width", TypeExpr: "number"},
			TypeProperty{Name: "height", TypeExpr: "number"},
		),
		reflect.TypeOf(WindowSpaceWindow{}): objectDeclarationWithCreateExpr(
			"WindowSpaceWindow",
			`mergeGeneratedOptions(
    {
      surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
      sectionIdOrNull: null,
      mode: ChatWindowModeEnum.project_ai_mode,
      title: null,
      chatId: null,
      embeddedGitPaneVisible: false,
      zIndex: 0,
      normalizedBounds: createNormalizedFloatingWindowBounds(),
    },
    options,
  )`,
			TypeProperty{Name: "surfaceKind", TypeExpr: "WindowSpaceSurfaceKind", Optional: true},
			TypeProperty{Name: "sectionIdOrNull", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "mode", TypeExpr: "ChatWindowMode", Optional: true},
			TypeProperty{Name: "title", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "embeddedGitPaneVisible", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "normalizedBounds", TypeExpr: "NormalizedFloatingWindowBounds", Optional: true},
		),
		reflect.TypeOf(WindowSpaceState{}): objectDeclarationWithCreateExpr(
			"WindowSpaceState",
			`mergeGeneratedOptions(
    {
      windowsById: {},
      order: [],
    },
    options,
  )`,
			TypeProperty{Name: "windowsById", TypeExpr: "Record<string, WindowSpaceWindow>"},
			TypeProperty{Name: "order", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(WindowSpaceConfig{}): objectDeclarationWithCreateExpr(
			"WindowSpaceConfig",
			`mergeGeneratedOptions(
    {
      windowsById: {},
      order: [],
      id: "",
      name: "",
      sortIndex: 0,
    },
    options,
  )`,
			TypeProperty{Name: "windowsById", TypeExpr: "Record<string, WindowSpaceWindow>"},
			TypeProperty{Name: "order", TypeExpr: "Array<string>"},
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "sortIndex", TypeExpr: "number", Optional: true},
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
		reflect.TypeOf(ProjectConfig{}): objectDeclarationWithGoBackedCreateExpr(
			"ProjectConfig",
			projectview.FrontendDefaultProjectConfig(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "showParamDisplayNames", TypeExpr: "boolean"},
			TypeProperty{Name: "allowJsonSourceKeyEdits", TypeExpr: "boolean"},
			TypeProperty{Name: "previewImgColor", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
			TypeProperty{Name: "viewportInitialized", TypeExpr: "boolean"},
			TypeProperty{Name: "viewModes", TypeExpr: "Record<string, ViewMode>"},
			TypeProperty{Name: "activeViewModeId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "isEditingViewMode", TypeExpr: "boolean"},
			TypeProperty{Name: "hasPythonCodegenTarget", TypeExpr: "boolean"},
			TypeProperty{Name: "runCapabilities", TypeExpr: "ProjectRunCapabilities"},
			TypeProperty{Name: "codegenTargets", TypeExpr: "Array<ProjectCodegenTarget>"},
			TypeProperty{Name: "watchCodeEnabled", TypeExpr: "boolean"},
			TypeProperty{Name: "watchCodeFolders", TypeExpr: "Array<WatchCodeFolder>"},
			TypeProperty{Name: "watchCodeFiles", TypeExpr: "Array<string>"},
			TypeProperty{Name: "watchCodeRegistry", TypeExpr: "Record<string, WatchCodeRegistryEntry>"},
			TypeProperty{Name: "watchCodeBaselineByPath", TypeExpr: "Record<string, Array<string>>"},
			TypeProperty{Name: "entryCodeBlockId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "sectionPathSlugsById", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "sectionIdsByPathSlug", TypeExpr: "Record<string, Array<string>>"},
			TypeProperty{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>"},
			TypeProperty{Name: "windowSpaceSlugsById", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "windowSpaceIdsBySlug", TypeExpr: "Record<string, Array<string>>"},
			TypeProperty{Name: "windowSpaces", TypeExpr: "Record<string, WindowSpaceConfig>"},
			TypeProperty{Name: "sectionVariantMap", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "activeIds", TypeExpr: "Array<string>"},
			TypeProperty{Name: "edges", TypeExpr: "Array<Edge>"},
			TypeProperty{Name: "agenticEdges", TypeExpr: "Array<AgenticEdge>"},
			TypeProperty{Name: "stateMachineEdges", TypeExpr: "Array<StateMachineEdge>"},
		),
		reflect.TypeOf(ProjectStateSingleConfig{}): objectDeclarationWithGoBackedCreateExpr(
			"ProjectStateSingleConfig",
			projectview.FrontendDefaultSingleConfig(),
			TypeProperty{Name: "projectConfig", TypeExpr: "ProjectConfig"},
			TypeProperty{Name: "sections", TypeExpr: "Record<string, Core>"},
			TypeProperty{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>"},
			TypeProperty{Name: "sectionCapabilities", TypeExpr: "Record<string, SectionCapabilities>"},
			TypeProperty{Name: "sectionVariants", TypeExpr: "Record<string, Variant>"},
			TypeProperty{Name: "codeObjs", TypeExpr: "Record<string, Core>"},
			TypeProperty{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>"},
			TypeProperty{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>"},
			TypeProperty{Name: "artifactGroups", TypeExpr: "Record<string, unknown>", Optional: true},
			TypeProperty{Name: "singletonSections", TypeExpr: "SingletonSections"},
			TypeProperty{Name: "parentSectionMap", TypeExpr: "Record<string, string | null>"},
			TypeProperty{Name: "shownParamIds", TypeExpr: "Record<string, ShownParamIds>"},
			TypeProperty{Name: "requiredDecodedImages", TypeExpr: "Array<string>"},
			TypeProperty{Name: "genCodeBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
			TypeProperty{Name: "projectChatWindowing", TypeExpr: "ProjectChatWindowingState"},
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
		reflect.TypeOf(UserDefaultListRootSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultListRootSectionImpl",
			"ListRoot",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
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
		reflect.TypeOf(UserDefaultGroupSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultGroupSectionImpl",
			"Group",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "isHorizontalOrientation", TypeExpr: "boolean"},
			TypeProperty{Name: "overflowMode", TypeExpr: "boolean"},
			TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
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
		reflect.TypeOf(UserDefaultStateMachineStartSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultStateMachineStartSectionImpl",
			"StateMachineStart",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
			TypeProperty{Name: "label", TypeExpr: "string"},
			TypeProperty{Name: "maxIterations", TypeExpr: "number | null"},
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
		reflect.TypeOf(UserDefaultStateMachineGateSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultStateMachineGateSectionImpl",
			"StateMachineGate",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
			TypeProperty{Name: "gateType", TypeExpr: "StateMachineGateType"},
			TypeProperty{Name: "label", TypeExpr: "string"},
			TypeProperty{Name: "ui", TypeExpr: "StateMachineGateUIState"},
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
		reflect.TypeOf(UserDefaultStateMachineEndSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultStateMachineEndSectionImpl",
			"StateMachineEnd",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "machineGroupId", TypeExpr: "string"},
			TypeProperty{Name: "label", TypeExpr: "string"},
		),
		reflect.TypeOf(StateMachineEndSectionImpl{}): aliasDeclaration(
			"StateMachineEndSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.StateMachineEnd;
  machineGroupId: string;
  label: string;
}`,
		),
		reflect.TypeOf(UserDefaultTextBlockSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultTextBlockSectionImpl",
			"TextBlock",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "format", TypeExpr: "TextBlockFormat"},
			TypeProperty{Name: "masterFontSizePx", TypeExpr: "number"},
			TypeProperty{Name: "headingAsSectionName", TypeExpr: "boolean"},
			TypeProperty{Name: "metaControlStyle", TypeExpr: "boolean"},
			TypeProperty{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
			TypeProperty{Name: "text", TypeExpr: "string"},
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
		reflect.TypeOf(UserDefaultPromptSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultPromptSectionImpl",
			"Prompt",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "template", TypeExpr: "string"},
			TypeProperty{Name: "format", TypeExpr: "PromptFormat"},
			TypeProperty{Name: "inputs", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "renderedText", TypeExpr: "string"},
			TypeProperty{Name: "missingVariables", TypeExpr: "Array<string>"},
			TypeProperty{Name: "renderError", TypeExpr: "string | null"},
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
		reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}): objectDeclaration(
			"CodeSectionDiagnosticsIgnoreState",
			TypeProperty{Name: "muted", TypeExpr: "boolean"},
			TypeProperty{Name: "suppressedCodes", TypeExpr: "Array<string | number>"},
		),
		reflect.TypeOf(UserDefaultCodeSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultCodeSectionImpl",
			"Code",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "code", TypeExpr: "string"},
			TypeProperty{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null"},
			TypeProperty{Name: "attachedTerminalSectionId", TypeExpr: "string | null"},
			TypeProperty{Name: "codeLanguage", TypeExpr: "string"},
			TypeProperty{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState"},
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
		reflect.TypeOf(UserDefaultTerminalSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultTerminalSectionImpl",
			"Terminal",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
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
		reflect.TypeOf(ChatFileAttachment{}): objectDeclaration(
			"ChatFileAttachment",
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "mimeType", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "size", TypeExpr: "number | null", Optional: true},
		),
		reflect.TypeOf(MessageTextContent{}): objectDeclarationWithGoBackedCreateExpr(
			"MessageTextContent",
			scriptablechat.FrontendDefaultMessageTextContent(),
			TypeProperty{Name: "type", TypeExpr: `"text"`},
			TypeProperty{Name: "text", TypeExpr: "string"},
		),
		reflect.TypeOf(MessageImageURL{}): objectDeclaration(
			"MessageImageUrl",
			TypeProperty{Name: "url", TypeExpr: "string"},
			TypeProperty{Name: "detail", TypeExpr: `"auto" | "low" | "high" | null`, Optional: true},
		),
		reflect.TypeOf(MessageImageURLContent{}): objectDeclaration(
			"MessageImageUrlContent",
			TypeProperty{Name: "type", TypeExpr: `"image_url"`},
			TypeProperty{Name: "image_url", TypeExpr: "MessageImageUrl"},
		),
		reflect.TypeOf(MessageThinkingContent{}): objectDeclarationWithGoBackedCreateExpr(
			"MessageThinkingContent",
			scriptablechat.FrontendDefaultMessageThinkingContent(),
			TypeProperty{Name: "type", TypeExpr: `"thinking"`},
			TypeProperty{Name: "thinking", TypeExpr: "string"},
			TypeProperty{Name: "summary", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "signature", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(MessageContent{}): aliasDeclaration(
			"MessageContent",
			"MessageTextContent | MessageImageUrlContent | MessageThinkingContent",
		),
		reflect.TypeOf(ToolReferenceContent{}): objectDeclaration(
			"ToolReferenceContent",
			TypeProperty{Name: "type", TypeExpr: `"tool_reference"`},
			TypeProperty{Name: "tool_name", TypeExpr: "string"},
		),
		reflect.TypeOf(ToolCallFunction{}): objectDeclarationWithGoBackedCreateExpr(
			"ToolCallFunction",
			scriptablechat.FrontendDefaultToolCallFunction(),
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "arguments", TypeExpr: "{ [key: string]: JSONValue | undefined }"},
		),
		reflect.TypeOf(ToolCall{}): objectDeclarationWithGoBackedCreateExpr(
			"ToolCall",
			scriptablechat.FrontendDefaultToolCall(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "type", TypeExpr: `"function"`},
			TypeProperty{Name: "function", TypeExpr: "ToolCallFunction"},
		),
		reflect.TypeOf(SystemChatMessage{}): objectDeclarationWithGoBackedCreateExpr(
			"SystemChatMessage",
			scriptablechat.FrontendDefaultSystemChatMessage(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
			TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
			TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.system"},
		),
		reflect.TypeOf(AssistantChatMessage{}): objectDeclarationWithGoBackedCreateExpr(
			"AssistantChatMessage",
			scriptablechat.FrontendDefaultAssistantChatMessage(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
			TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
			TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.assistant"},
			TypeProperty{Name: "tool_calls", TypeExpr: "Array<ToolCall> | null", Optional: true},
		),
		reflect.TypeOf(UserChatMessage{}): objectDeclarationWithGoBackedCreateExpr(
			"UserChatMessage",
			scriptablechat.FrontendDefaultUserChatMessage(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "content", TypeExpr: "Array<MessageContent>"},
			TypeProperty{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>"},
			TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.user"},
		),
		reflect.TypeOf(ToolChatMessage{}): objectDeclarationWithGoBackedCreateExpr(
			"ToolChatMessage",
			scriptablechat.FrontendDefaultToolChatMessage(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "role", TypeExpr: "typeof ChatRoleEnum.tool"},
			TypeProperty{Name: "tool_call_id", TypeExpr: "string"},
			TypeProperty{Name: "tool_name", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "arguments", TypeExpr: "JSONValue"},
			TypeProperty{Name: "result", TypeExpr: "JSONValue"},
			TypeProperty{Name: "content", TypeExpr: "Array<ToolReferenceContent | Record<string, unknown>>"},
			TypeProperty{Name: "is_error", TypeExpr: "boolean"},
			TypeProperty{Name: "started_at", TypeExpr: "string"},
			TypeProperty{Name: "completed_at", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(BaseChatMessageUnion{}): aliasDeclaration(
			"BaseChatMessageUnion",
			"SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage",
		),
		reflect.TypeOf(ChatSectionBranch{}): objectDeclaration(
			"ChatSectionBranch",
			TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
			TypeProperty{Name: "createdAt", TypeExpr: "number"},
			TypeProperty{Name: "parentBranchId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "branchFromMessageId", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(ChatSectionState{}): objectDeclaration(
			"ChatSectionState",
			TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
			TypeProperty{Name: "inputText", TypeExpr: "string"},
			TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
			TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "activeBranchId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>"},
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
		reflect.TypeOf(BrowserSavedSearch{}): objectDeclarationWithGoBackedCreateExpr(
			"BrowserSavedSearch",
			projectstate.FrontendDefaultBrowserSavedSearch(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "query", TypeExpr: "string"},
			TypeProperty{Name: "searchScope", TypeExpr: "BrowserSearchScope"},
			TypeProperty{Name: "typeFilters", TypeExpr: "BrowserSavedSearchTypeFilters"},
			TypeProperty{Name: "color", TypeExpr: "string"},
			TypeProperty{Name: "quickInfo", TypeExpr: "string"},
		),
		reflect.TypeOf(UserDefaultBrowserSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultBrowserSectionImpl",
			"Browser",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "folder", TypeExpr: "string"},
			TypeProperty{Name: "hideColumn", TypeExpr: "boolean"},
			TypeProperty{Name: "columnWidth", TypeExpr: "number | null"},
			TypeProperty{Name: "typesColumnWidth", TypeExpr: "number | null"},
			TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
			TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
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
		reflect.TypeOf(TaskBoardTask{}): objectDeclarationWithGoBackedCreateExpr(
			"TaskBoardTask",
			projectstate.FrontendDefaultTaskBoardTask(),
			TypeProperty{Name: "id", TypeExpr: "string"},
			TypeProperty{Name: "title", TypeExpr: "string"},
			TypeProperty{Name: "description", TypeExpr: "string"},
			TypeProperty{Name: "completed", TypeExpr: "boolean"},
			TypeProperty{Name: "columnId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "dueDateIso", TypeExpr: "string"},
			TypeProperty{Name: "recurrence", TypeExpr: "TaskBoardTaskRecurrence"},
			TypeProperty{Name: "recurrenceDays", TypeExpr: "Array<TaskBoardRecurringWeekday>"},
			TypeProperty{Name: "recurrenceMonths", TypeExpr: "Array<TaskBoardRecurringMonth>"},
			TypeProperty{Name: "recurrenceYears", TypeExpr: "Array<number>"},
			TypeProperty{Name: "sortIndex", TypeExpr: "number"},
		),
		reflect.TypeOf(UserDefaultTaskBoardSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultTaskBoardSectionImpl",
			"TaskBoard",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
			TypeProperty{Name: "columns", TypeExpr: "Array<TaskBoardColumn> | null"},
			TypeProperty{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
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
		reflect.TypeOf(UserDefaultChartSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultChartSectionImpl",
			"Chart",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "dataPath", TypeExpr: "string"},
			TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
		),
		reflect.TypeOf(ChartSectionImpl{}): aliasDeclaration(
			"ChartSectionImpl",
			`BaseSectionImpl & {
  type: typeof SectionTypeEnum.Chart;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
}`,
		),
		reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}): objectDeclarationWithGoBackedSectionDefaults(
			"UserDefaultSpreadsheetSectionImpl",
			"Spreadsheet",
			TypeProperty{Name: "isFrozen", TypeExpr: "boolean"},
			TypeProperty{Name: "tagColor", TypeExpr: "string | null"},
			TypeProperty{Name: "styleColor", TypeExpr: "string | null"},
			TypeProperty{Name: "size", TypeExpr: "SectionSize"},
			TypeProperty{Name: "aspectRatio", TypeExpr: "boolean | number"},
			TypeProperty{Name: "isMinimized", TypeExpr: "boolean"},
			TypeProperty{Name: "positionAndSizeLocked", TypeExpr: "boolean"},
			TypeProperty{Name: "filePath", TypeExpr: "string"},
			TypeProperty{Name: "activeSheet", TypeExpr: "string | null"},
			TypeProperty{Name: "readOnly", TypeExpr: "boolean"},
			TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean"},
			TypeProperty{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
			TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
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
		reflect.TypeOf(PrepareSectionsForCopyRequestInput{}): objectDeclaration(
			"PrepareSectionsForCopyRequestInput",
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(PasteSectionsRequestInput{}): objectDeclaration(
			"PasteSectionsRequestInput",
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap"},
			TypeProperty{Name: "position", TypeExpr: "Position"},
			TypeProperty{Name: "asRef", TypeExpr: "boolean"},
		),
		reflect.TypeOf(CreateChildSectionsRequestInput{}): objectDeclaration(
			"CreateChildSectionsRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "parentId", TypeExpr: "string"},
			TypeProperty{Name: "implType", TypeExpr: "SectionType"},
			TypeProperty{Name: "numChildren", TypeExpr: "number"},
			TypeProperty{Name: "startIdx", TypeExpr: "number | null", Optional: true},
		),
		reflect.TypeOf(CreateChildSectionsViaIncrementerRequestInput{}): objectDeclaration(
			"CreateChildSectionsViaIncrementerRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "calledBy", TypeExpr: "string"},
			TypeProperty{Name: "implType", TypeExpr: "SectionType"},
			TypeProperty{Name: "numChildren", TypeExpr: "number"},
		),
		reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{}): objectDeclaration(
			"DeleteChildSectionsViaDecrementerRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "calledBy", TypeExpr: "string"},
			TypeProperty{Name: "numChildren", TypeExpr: "number"},
		),
		reflect.TypeOf(CreateEdgeRequestInput{}): objectDeclaration(
			"CreateEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
			TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
			TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
			TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
			TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
			TypeProperty{Name: "targetPortId", TypeExpr: "string"},
			TypeProperty{Name: "type", TypeExpr: "string", Optional: true},
			TypeProperty{Name: "label", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
			TypeProperty{Name: "animated", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
			TypeProperty{Name: "data", TypeExpr: "Record<string, unknown> | null", Optional: true},
		),
		reflect.TypeOf(UpdateEdgeRequestInput{}): objectDeclaration(
			"UpdateEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edge", TypeExpr: "Edge"},
		),
		reflect.TypeOf(DeleteEdgesRequestInput{}): objectDeclaration(
			"DeleteEdgesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(ReconnectEdgeRequestInput{}): objectDeclaration(
			"ReconnectEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edgeId", TypeExpr: "string"},
			TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
			TypeProperty{Name: "sourceVariantId", TypeExpr: "string"},
			TypeProperty{Name: "sourcePortId", TypeExpr: "string"},
			TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
			TypeProperty{Name: "targetVariantId", TypeExpr: "string"},
			TypeProperty{Name: "targetPortId", TypeExpr: "string"},
		),
		reflect.TypeOf(SetEdgesRequestInput{}): objectDeclaration(
			"SetEdgesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edges", TypeExpr: "Array<Edge>"},
		),
		reflect.TypeOf(CreateStateMachineEdgeRequestInput{}): objectDeclaration(
			"CreateStateMachineEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
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
		reflect.TypeOf(UpdateStateMachineEdgeRequestInput{}): objectDeclaration(
			"UpdateStateMachineEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edge", TypeExpr: "StateMachineEdge"},
		),
		reflect.TypeOf(DeleteStateMachineEdgesRequestInput{}): objectDeclaration(
			"DeleteStateMachineEdgesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(SetStateMachineEdgesRequestInput{}): objectDeclaration(
			"SetStateMachineEdgesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edges", TypeExpr: "Array<StateMachineEdge>"},
		),
		reflect.TypeOf(CreateAgenticEdgeRequestInput{}): objectDeclaration(
			"CreateAgenticEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "sourceSectionId", TypeExpr: "string"},
			TypeProperty{Name: "targetSectionId", TypeExpr: "string"},
			TypeProperty{Name: "kind", TypeExpr: "AgenticEdgeKind"},
			TypeProperty{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
			TypeProperty{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
			TypeProperty{Name: "hidden", TypeExpr: "boolean", Optional: true},
			TypeProperty{Name: "zIndex", TypeExpr: "number", Optional: true},
		),
		reflect.TypeOf(UpdateAgenticEdgeRequestInput{}): objectDeclaration(
			"UpdateAgenticEdgeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edge", TypeExpr: "AgenticEdge"},
		),
		reflect.TypeOf(DeleteAgenticEdgesRequestInput{}): objectDeclaration(
			"DeleteAgenticEdgesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edgeIds", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(SetAgenticEdgesRequestInput{}): objectDeclaration(
			"SetAgenticEdgesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "edges", TypeExpr: "Array<AgenticEdge>"},
		),
		reflect.TypeOf(MoveSectionsRequestInput{}): objectDeclaration(
			"MoveSectionsRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionIds", TypeExpr: "Array<string>"},
			TypeProperty{Name: "newParentId", TypeExpr: "string | null"},
			TypeProperty{Name: "newIndex", TypeExpr: "number | null"},
			TypeProperty{Name: "positionsById", TypeExpr: "Record<string, Position> | null"},
		),
		reflect.TypeOf(SetSectionSizesRequestInput{}): objectDeclaration(
			"SetSectionSizesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionSizes", TypeExpr: "Record<string, SectionSize>"},
		),
		reflect.TypeOf(SetSectionEdgeOutputsRequestInput{}): objectDeclaration(
			"SetSectionEdgeOutputsRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
		),
		reflect.TypeOf(SetParentDefaultChildSectionTypeRequestInput{}): objectDeclaration(
			"SetParentDefaultChildSectionTypeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
		),
		reflect.TypeOf(SetListRootViewModeRequestInput{}): objectDeclaration(
			"SetListRootViewModeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
		),
		reflect.TypeOf(SetBrowserAreaViewModeRequestInput{}): objectDeclaration(
			"SetBrowserAreaViewModeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
		),
		reflect.TypeOf(SetBrowserSavedSearchesRequestInput{}): objectDeclaration(
			"SetBrowserSavedSearchesRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
		),
		reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{}): objectDeclaration(
			"SetSpreadsheetSectionSettingsRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "readOnly", TypeExpr: "boolean"},
			TypeProperty{Name: "showRowNumbers", TypeExpr: "boolean"},
			TypeProperty{Name: "density", TypeExpr: "SpreadsheetGridDensity"},
			TypeProperty{Name: "autoReloadOnExternalChange", TypeExpr: "boolean"},
		),
		reflect.TypeOf(SetTaskBoardSectionStateRequestInput{}): objectDeclaration(
			"SetTaskBoardSectionStateRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "viewMode", TypeExpr: "TaskBoardViewMode"},
			TypeProperty{Name: "columns", TypeExpr: "Array<TaskBoardColumn>"},
			TypeProperty{Name: "tasks", TypeExpr: "Array<TaskBoardTask>"},
		),
		reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{}): objectDeclaration(
			"AppendDrawAreaLayerItemRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "layerIdx", TypeExpr: "number"},
			TypeProperty{Name: "element", TypeExpr: "DrawAreaLayerItem"},
		),
		reflect.TypeOf(SetChartTypeRequestInput{}): objectDeclaration(
			"SetChartTypeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "chartType", TypeExpr: "ChartType"},
		),
		reflect.TypeOf(SetChartSettingsRequestInput{}): objectDeclaration(
			"SetChartSettingsRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion"},
			TypeProperty{Name: "changedSettings", TypeExpr: "Array<string>"},
		),
		reflect.TypeOf(SetTextBlockDisplayModeRequestInput{}): objectDeclaration(
			"SetTextBlockDisplayModeRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode"},
		),
		reflect.TypeOf(SetTextBlockFormatRequestInput{}): objectDeclaration(
			"SetTextBlockFormatRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "format", TypeExpr: "TextBlockFormat"},
		),
		reflect.TypeOf(CodeFileBindingUpdate{}): objectDeclaration(
			"CodeFileBindingUpdate",
			TypeProperty{Name: "canonical_path", TypeExpr: "string"},
			TypeProperty{Name: "access_mode", TypeExpr: "CodeFileAccessMode"},
		),
		reflect.TypeOf(SetCodeFileBindingRequestInput{}): objectDeclaration(
			"SetCodeFileBindingRequestInput",
			TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "sectionId", TypeExpr: "string"},
			TypeProperty{Name: "binding", TypeExpr: "CodeFileBindingUpdate"},
		),
		reflect.TypeOf(GetLLMChatResponse{}): objectDeclaration(
			"GetLLMChatResponse",
			TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
			TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
			TypeProperty{Name: "llmConfig", TypeExpr: "LLMConfig | null", Optional: true},
			TypeProperty{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
		),
		reflect.TypeOf(ExternalAgentChatResponse{}): objectDeclaration(
			"ExternalAgentChatResponse",
			TypeProperty{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>"},
			TypeProperty{Name: "waitingForResponse", TypeExpr: "boolean"},
			TypeProperty{Name: "toolCallArguments", TypeExpr: "Record<string, string>"},
			TypeProperty{Name: "contextUsage", TypeExpr: "ChatContextUsage | null", Optional: true},
		),
		reflect.TypeOf(PluginListEntry{}): objectDeclaration(
			"PluginListEntry",
			TypeProperty{Name: "pluginId", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "version", TypeExpr: "string"},
			TypeProperty{Name: "sourceScope", TypeExpr: "PluginScope"},
			TypeProperty{Name: "sourceScopeLabel", TypeExpr: "string"},
			TypeProperty{Name: "sourceManager", TypeExpr: "PluginSourceManager"},
			TypeProperty{Name: "sourceManagerHint", TypeExpr: "string | null"},
			TypeProperty{Name: "canonicalSourceKey", TypeExpr: "string"},
			TypeProperty{Name: "sourceDigestSha256", TypeExpr: "string | null"},
			TypeProperty{Name: "frontend", TypeExpr: "PluginFrontendDescriptor"},
			TypeProperty{Name: "content", TypeExpr: "PluginContentDescriptor"},
			TypeProperty{Name: "config", TypeExpr: "PluginConfigDescriptor"},
			TypeProperty{Name: "effectiveCapabilities", TypeExpr: "Array<string>"},
			TypeProperty{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null"},
			TypeProperty{Name: "restartRequired", TypeExpr: "boolean"},
		),
		reflect.TypeOf(PluginStatusEntry{}): objectDeclaration(
			"PluginStatusEntry",
			TypeProperty{Name: "pluginId", TypeExpr: "string"},
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "version", TypeExpr: "string"},
			TypeProperty{Name: "state", TypeExpr: "PluginRuntimeState"},
			TypeProperty{Name: "sourceScope", TypeExpr: "PluginScope"},
			TypeProperty{Name: "sourceScopeLabel", TypeExpr: "string"},
			TypeProperty{Name: "sourceManager", TypeExpr: "PluginSourceManager"},
			TypeProperty{Name: "sourceManagerHint", TypeExpr: "string | null"},
			TypeProperty{Name: "sourcePath", TypeExpr: "string"},
			TypeProperty{Name: "canonicalSourceKey", TypeExpr: "string"},
			TypeProperty{Name: "sourceDigestSha256", TypeExpr: "string | null"},
			TypeProperty{Name: "shadowedBySourcePath", TypeExpr: "string | null"},
			TypeProperty{Name: "requestedCapabilities", TypeExpr: "Array<string>"},
			TypeProperty{Name: "effectiveCapabilities", TypeExpr: "Array<string>"},
			TypeProperty{Name: "blockedCapabilities", TypeExpr: "Array<PluginBlockedCapability>"},
			TypeProperty{Name: "registeredCodegenTargets", TypeExpr: "Array<PluginRegisteredCodegenTarget>"},
			TypeProperty{Name: "registeredBackendRoutes", TypeExpr: "Array<PluginRegisteredBackendRoute>"},
			TypeProperty{Name: "registeredStaticDirs", TypeExpr: "Array<PluginRegisteredStaticDir>"},
			TypeProperty{Name: "registeredListenerEndpoints", TypeExpr: "Array<PluginRegisteredListenerEndpoint>"},
			TypeProperty{Name: "enablementSource", TypeExpr: "PluginEnablementSource | null"},
			TypeProperty{Name: "restartRequired", TypeExpr: "boolean"},
			TypeProperty{Name: "runtimePayloadDigestSha256", TypeExpr: "string"},
			TypeProperty{Name: "errors", TypeExpr: "Array<PluginErrorInfo>"},
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
		reflect.TypeOf(UpdateArtifactMsgContent{}): objectDeclaration(
			"UpdateArtifactMsgContent",
			TypeProperty{Name: "artifacts", TypeExpr: "Array<ArtifactUnion>"},
			TypeProperty{Name: "updateType", TypeExpr: `"update" | "delete"`},
		),
		reflect.TypeOf(UISettingRevealActivationStep{}): objectDeclaration(
			"UISettingRevealActivationStep",
			TypeProperty{Name: "type", TypeExpr: "string"},
			TypeProperty{Name: "itemValue", TypeExpr: "string"},
		),
		reflect.TypeOf(UISettingRevealTarget{}): objectDeclaration(
			"UISettingRevealTarget",
			TypeProperty{Name: "settingId", TypeExpr: "string"},
			TypeProperty{Name: "side", TypeExpr: "string"},
			TypeProperty{Name: "overviewTabKey", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "uiEditorTabName", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "pluginId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "paneId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "strategy", TypeExpr: "string"},
			TypeProperty{Name: "anchorId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "pluginRevealKey", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "revealActivationSteps", TypeExpr: "Array<UISettingRevealActivationStep>"},
		),
		reflect.TypeOf(UISettingRevealContent{}): objectDeclaration(
			"UISettingRevealContent",
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "chatId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "activeSectionId", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "reveals", TypeExpr: "Array<UISettingRevealTarget>"},
			TypeProperty{Name: "durationMs", TypeExpr: "number"},
			TypeProperty{Name: "requestId", TypeExpr: "string"},
		),
		reflect.TypeOf(UISettingRevealResultStatus{}): objectDeclaration(
			"UISettingRevealResultStatus",
			TypeProperty{Name: "settingId", TypeExpr: "string"},
			TypeProperty{Name: "status", TypeExpr: `"revealed" | "failed"`},
			TypeProperty{Name: "errorCode", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "errorMessage", TypeExpr: "string | null", Optional: true},
		),
		reflect.TypeOf(UISettingRevealResultContent{}): objectDeclaration(
			"UISettingRevealResultContent",
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "requestId", TypeExpr: "string"},
			TypeProperty{Name: "statuses", TypeExpr: "Array<UISettingRevealResultStatus>"},
		),
		reflect.TypeOf(WebsocketMsgRealtimeUIChangeContent{}): objectDeclaration(
			"WebsocketMsgRealtimeUIChangeContent",
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "dependencyKey", TypeExpr: "BaseDependencyKeyUnion"},
			TypeProperty{Name: "value", TypeExpr: "BaseDependencyValueUnion"},
		),
		reflect.TypeOf(WebsocketMsgRealtimeUIChange{}): objectDeclaration(
			"WebsocketMsgRealtimeUIChange",
			TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeUIChange"},
			TypeProperty{Name: "content", TypeExpr: "WebsocketMsgRealtimeUIChangeContent"},
		),
		reflect.TypeOf(WebsocketMsgRealtimeDependencyEventContent{}): objectDeclaration(
			"WebsocketMsgRealtimeDependencyEventContent",
			TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
			TypeProperty{Name: "dependencyEvent", TypeExpr: "DependencyEvent"},
		),
		reflect.TypeOf(WebsocketMsgRealtimeDependencyEvent{}): objectDeclaration(
			"WebsocketMsgRealtimeDependencyEvent",
			TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent"},
			TypeProperty{Name: "content", TypeExpr: "WebsocketMsgRealtimeDependencyEventContent"},
		),
		reflect.TypeOf(WebsocketMsgUISettingRevealResult{}): objectDeclaration(
			"WebsocketMsgUISettingRevealResult",
			TypeProperty{Name: "id", TypeExpr: "string | null", Optional: true},
			TypeProperty{Name: "messageType", TypeExpr: "typeof WebsocketMsgTypeForBackendEnum.UISettingRevealResult"},
			TypeProperty{Name: "content", TypeExpr: "UISettingRevealResultContent"},
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
}
