package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

type reflectedObjectDeclarationSpec struct {
	DeclarationName           string
	DefaultValue              any
	HasCreateExpr             bool
	UseGenericCreateBody      bool
	CreateBody                string
	CreateExprOverrides       map[string]string
	PropertyTypeExprOverrides map[string]string
	PropertyOptionalOverrides map[string]bool
	IgnoredProperties         map[string]struct{}
	ExtraProperties           []TypeProperty
}

func reflectedOptionalPropertiesSpec(names ...string) reflectedObjectDeclarationSpec {
	overrides := make(map[string]bool, len(names))
	for _, name := range names {
		overrides[name] = true
	}
	return reflectedObjectDeclarationSpec{
		PropertyOptionalOverrides: overrides,
	}
}

func reflectedIgnoredProperties(names ...string) map[string]struct{} {
	ignored := make(map[string]struct{}, len(names))
	for _, name := range names {
		ignored[name] = struct{}{}
	}
	return ignored
}

var discoveredFrontendDefaultValueProviderRegistry = discoveredFrontendDefaultValueProviders()

func reflectedSpecWithDiscoveredDefault(
	t reflect.Type,
	spec reflectedObjectDeclarationSpec,
) reflectedObjectDeclarationSpec {
	if spec.DefaultValue != nil {
		return spec
	}
	provider, ok := discoveredFrontendDefaultValueProviderRegistry[t]
	if !ok || provider == nil {
		return spec
	}
	spec.DefaultValue = provider()
	spec.HasCreateExpr = true
	return spec
}

var artifactAliasDeclarations = map[reflect.Type]TypeDeclaration{
	reflect.TypeOf(CanvasPoint{}): aliasDeclaration(
		"CanvasPoint",
		"[number, number]",
	),
	reflect.TypeOf(DrawAreaTransform{}): aliasDeclaration(
		"DrawAreaTransform",
		"[number, number, number, number, number, number]",
	),
	reflect.TypeOf(ChartDataValue{}): aliasDeclaration(
		"ChartDataValue",
		"Record<string, Array<string | number>>",
	),
	reflect.TypeOf(ChartData{}):     aliasDeclaration("ChartData", "ChartDataValue"),
	reflect.TypeOf(ChartDataType{}): aliasDeclaration("ChartDataType", "ChartDataValue"),
	reflect.TypeOf(ArtifactUnion{}): aliasDeclaration(
		"ArtifactUnion",
		"ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact",
	),
}

var artifactReflectedObjectDeclarationSpecs = map[reflect.Type]reflectedObjectDeclarationSpec{
	reflect.TypeOf(BrushStroke{}): {
		PropertyTypeExprOverrides: map[string]string{
			"points": `Array<CanvasPoint | "BREAK">`,
		},
	},
	reflect.TypeOf(BrushStrokeWithTransform{}): {
		PropertyTypeExprOverrides: map[string]string{
			"points":    `Array<CanvasPoint | "BREAK">`,
			"transform": "DrawAreaTransform",
		},
	},
	reflect.TypeOf(DrawAreaLayerItemTransform{}): {
		PropertyTypeExprOverrides: map[string]string{
			"transform": "DrawAreaTransform",
		},
	},
	reflect.TypeOf(DrawAreaLayerItem{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke",
		},
	},
	reflect.TypeOf(DrawAreaLayer{}): {
		CreateExprOverrides: map[string]string{
			"name": "createRandomName()",
		},
	},
	reflect.TypeOf(ImageArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createPngArtifactId()",
			"value": "createBinaryContentRef()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.Image",
		},
	},
	reflect.TypeOf(BrushStrokeArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createJsonArtifactId()",
			"value": "createBrushStroke()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.BrushStroke",
		},
	},
	reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createJsonArtifactId()",
			"value": "createDrawAreaLayerItemTransform()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.DrawAreaLayerItemTransform",
		},
	},
	reflect.TypeOf(ChartDataArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id": "createCsvArtifactId()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.ChartData",
		},
	},
	reflect.TypeOf(FileArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createFileArtifactId()",
			"value": "createBinaryContentRef()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.File",
		},
	},
}

func artifactTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	if declaration, ok := artifactAliasDeclarations[t]; ok {
		return declaration, true, nil
	}
	spec, ok := artifactReflectedObjectDeclarationSpecs[t]
	if !ok {
		return TypeDeclaration{}, false, nil
	}
	spec = reflectedSpecWithDiscoveredDefault(t, spec)
	declaration, err := converter.reflectedObjectDeclaration(t, spec)
	return declaration, true, err
}

var ownerBackedReflectedObjectDeclarationSpecs = map[reflect.Type]reflectedObjectDeclarationSpec{
	reflect.TypeOf(realtime.SectionDependencyKey{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof DependencyKeyTypeEnum.Section",
		},
	},
	reflect.TypeOf(realtime.SectionParamDependencyKey{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof DependencyKeyTypeEnum.SectionParam",
		},
	},
	reflect.TypeOf(realtime.LiteralDependencyValue{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof DependencyValueTypeEnum.Literal",
		},
	},
	reflect.TypeOf(realtime.FileReadDependencyValue{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof DependencyValueTypeEnum.FileRead",
		},
	},
	reflect.TypeOf(realtime.BinaryDependencyValue{}): {
		PropertyTypeExprOverrides: map[string]string{
			"payload": "BinaryContentRef",
			"type":    "typeof DependencyValueTypeEnum.Binary",
		},
	},
	reflect.TypeOf(realtime.ListenerCoverageSnapshot{}): {
		PropertyTypeExprOverrides: map[string]string{
			"dependencies": "Array<BaseDependencyKeyUnion>",
		},
	},
	reflect.TypeOf(EngineRuntimeSupport{}): {
		DefaultValue:  agentruns.EngineRuntimeSupport{},
		HasCreateExpr: true,
	},
	reflect.TypeOf(EngineConfig{}): {
		DefaultValue:         agentruns.EngineConfig{EngineType: agentruns.EngineTypeSettaLLM},
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyOptionalOverrides: map[string]bool{
			"defaults":              false,
			"externalAgentConfigId": true,
			"runtimeSupport":        true,
			"settaLlmConfigId":      true,
		},
	},
	reflect.TypeOf(AgentProfile{}): {
		PropertyOptionalOverrides: map[string]bool{
			"engineConfigId": true,
			"memoryScope":    true,
		},
	},
	reflect.TypeOf(TranscriptionProfile{}): {
		PropertyOptionalOverrides: map[string]bool{
			"language": true,
		},
	},
	reflect.TypeOf(RunEvent{}): {},
	reflect.TypeOf(AgentRun{}): {
		PropertyTypeExprOverrides: map[string]string{
			"inputs":  "Record<string, unknown> | null",
			"outputs": "Record<string, unknown> | null",
		},
	},
	reflect.TypeOf(MessageTextDelta{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": `"text_delta"`,
		},
	},
	reflect.TypeOf(MessageThinkingDelta{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": `"thinking_delta"`,
		},
		PropertyOptionalOverrides: map[string]bool{
			"summary":   true,
			"signature": true,
		},
	},
	reflect.TypeOf(MessageStartEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type":    "typeof StreamingEventTypeEnum.MESSAGE_START",
			"message": "BaseChatMessageUnion",
		},
	},
	reflect.TypeOf(MessageDeltaEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type":    "typeof StreamingEventTypeEnum.DELTA",
			"content": "Array<MessageContentDelta> | null",
		},
		PropertyOptionalOverrides: map[string]bool{
			"content": true,
		},
	},
	reflect.TypeOf(ToolCallDeltaEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof StreamingEventTypeEnum.TOOL_CALL_DELTA",
		},
		PropertyOptionalOverrides: map[string]bool{
			"tool_name": true,
		},
	},
	reflect.TypeOf(ToolResultEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type":   "typeof StreamingEventTypeEnum.TOOL_RESULT",
			"result": "ToolChatMessage",
		},
	},
	reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA",
		},
	},
	reflect.TypeOf(MessageStopEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof StreamingEventTypeEnum.MESSAGE_STOP",
		},
	},
	reflect.TypeOf(MessageFinalizedEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type":    "typeof StreamingEventTypeEnum.MESSAGE_FINALIZED",
			"message": "BaseChatMessageUnion",
		},
	},
	reflect.TypeOf(LLMStreamingResponse{}): {
		DeclarationName: "LLMStreamingResponse",
		PropertyTypeExprOverrides: map[string]string{
			"chunk": "LLMStreamingResponseChunk",
		},
		PropertyOptionalOverrides: map[string]bool{
			"sectionId":       true,
			"projectConfigId": true,
		},
	},
	reflect.TypeOf(RunCodeRequestInput{}): {
		PropertyTypeExprOverrides: map[string]string{
			"runSnapshotMode": "RunSnapshotMode | null",
		},
	},
	reflect.TypeOf(projectview.ProjectRunCapabilities{}): {
		DefaultValue:  projectview.ProjectRunCapabilities{},
		HasCreateExpr: true,
		PropertyOptionalOverrides: map[string]bool{
			"mainRunDisabledReason":   true,
			"effectiveEntrySectionId": true,
		},
	},
	reflect.TypeOf(SettingsGUI{}): {
		PropertyTypeExprOverrides: map[string]string{
			"snapGrid":               "[number, number]",
			"gridPattern":            "BackgroundVariant",
			"panOnScrollMode":        "PanOnScrollMode",
			"selectionMode":          "SelectionMode",
			"sectionTagColorChoices": "Array<ColorPickerChoice>",
		},
	},
	reflect.TypeOf(SettingsBackend{}): {
		CreateExprOverrides: map[string]string{
			"defaultTerminalShell": "null",
		},
	},
	reflect.TypeOf(MetaControlSizingPolicyTypeEntry{}): {
		PropertyTypeExprOverrides: map[string]string{
			"sizeModeHeight": "MetaControlSizeMode",
			"sizeModeWidth":  "MetaControlSizeMode",
		},
	},
	reflect.TypeOf(MetaControlSizingPolicyByType{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(SectionSizingPolicyByType{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(SectionSizingPolicy{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(SettingsState{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(projectview.SectionCapabilities{}): {
		DefaultValue:  projectview.SectionCapabilities{},
		HasCreateExpr: true,
		PropertyOptionalOverrides: map[string]bool{
			"runDisabledReason":   true,
			"runRequestSectionId": true,
			"entryCodeBlockValue": true,
		},
	},
	reflect.TypeOf(projectview.SingleConfig{}): {
		DefaultValue:  projectview.FrontendDefaultSingleConfig(),
		HasCreateExpr: true,
		PropertyTypeExprOverrides: map[string]string{
			"sectionImpls": "Record<string, BaseSectionImplUnion>",
			"codeObjImpls": "Record<string, BaseCodeObjImplUnion>",
		},
	},
	reflect.TypeOf(httpapi.ProjectStateSingleConfigWithCompletedOpIDs{}): {
		DefaultValue: httpapi.ProjectStateSingleConfigWithCompletedOpIDs{
			ProjectState:   projectview.FrontendDefaultSingleConfig(),
			CompletedOpIDs: []string{},
			PendingOpIDs:   []string{},
		},
		HasCreateExpr: true,
	},
	reflect.TypeOf(projectview.ProjectConfig{}): {
		DefaultValue:  projectview.FrontendDefaultProjectConfig(),
		HasCreateExpr: true,
		PropertyTypeExprOverrides: map[string]string{
			"codegenTargets": "Array<ProjectCodegenTarget>",
		},
	},
	reflect.TypeOf(SharePolicy{}): {
		DefaultValue:  deployments.DefaultPolicy(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(StateMachineGateUIState{}): {
		PropertyOptionalOverrides: map[string]bool{
			"showDetails": true,
		},
	},
	reflect.TypeOf(StateMachineSourceFilter{}): {
		PropertyOptionalOverrides: map[string]bool{
			"type": true,
		},
	},
	reflect.TypeOf(StateMachineSourceActivationCountCondition{}): {
		PropertyOptionalOverrides: map[string]bool{
			"operator": true,
		},
	},
	reflect.TypeOf(StateMachineTargetAction{}): {
		PropertyOptionalOverrides: map[string]bool{
			"type":           true,
			"threadStrategy": true,
		},
	},
	reflect.TypeOf(StateMachineEdge{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style": "Record<string, unknown> | null",
		},
	},
	reflect.TypeOf(AgenticEdge{}): {
		PropertyTypeExprOverrides: map[string]string{
			"kind":        "AgenticEdgeKind",
			"contextMode": "AgenticEdgeContextMode | null",
			"style":       "Record<string, unknown>",
		},
	},
	reflect.TypeOf(SectionSize{}): {
		CreateExprOverrides: map[string]string{
			"width":  "SectionSizeModeEnum.auto",
			"height": "SectionSizeModeEnum.auto",
		},
	},
	reflect.TypeOf(TopLevelSectionLayout{}): {
		CreateExprOverrides: map[string]string{
			"zIndex": "0",
			"w":      "null",
			"h":      "null",
		},
	},
	reflect.TypeOf(ViewMode{}): {
		CreateExprOverrides: map[string]string{
			"sortIndex":             "0",
			"isUserFacing":          "false",
			"isTab":                 "false",
			"visibilityBySectionId": "{}",
			"viewport":              "null",
			"viewportInitialized":   "false",
			"topLevelSections":      "{}",
		},
		PropertyOptionalOverrides: map[string]bool{
			"sortIndex": true,
		},
	},
	reflect.TypeOf(Core{}): {
		PropertyTypeExprOverrides: map[string]string{
			"sharedModifier": "Record<string, unknown>",
		},
	},
	reflect.TypeOf(Variant{}): {
		PropertyTypeExprOverrides: map[string]string{
			"modifier": "Record<string, unknown>",
		},
	},
	reflect.TypeOf(ChatWindowBounds{}): {
		DefaultValue:  projectstate.DefaultChatWindowBounds(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(ChatWindowDockMetrics{}): {
		CreateExprOverrides: map[string]string{
			"widthFraction":    "null",
			"preferredWidthPx": "null",
		},
	},
	reflect.TypeOf(ProjectChatWindowInstance{}): {
		CreateExprOverrides: map[string]string{
			"isMinimized":                 "false",
			"isClosed":                    "false",
			"isMaximized":                 "false",
			"dockMetrics":                 "createChatWindowDockMetrics()",
			"zIndex":                      "0",
			"lastPlacementBeforeMaximize": "null",
			"sectionIdOrNull":             "null",
			"title":                       "null",
			"lastFocusedAt":               "0",
			"chatId":                      "null",
		},
	},
	reflect.TypeOf(ProjectChatWindowingState{}): {
		DefaultValue:  projectstate.DefaultProjectChatWindowingState(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(NormalizedFloatingWindowBounds{}): {
		DefaultValue:  projectstate.DefaultNormalizedFloatingWindowBounds(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(WindowSpaceWindow{}): {
		CreateExprOverrides: map[string]string{
			"sectionIdOrNull":        "null",
			"title":                  "null",
			"chatId":                 "null",
			"embeddedGitPaneVisible": "false",
			"zIndex":                 "0",
			"normalizedBounds":       "createNormalizedFloatingWindowBounds()",
		},
	},
	reflect.TypeOf(WindowSpaceConfig{}): {
		CreateExprOverrides: map[string]string{
			"id":        `""`,
			"name":      `""`,
			"sortIndex": "0",
		},
		PropertyOptionalOverrides: map[string]bool{
			"id":   false,
			"name": false,
		},
	},
	reflect.TypeOf(Edge{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style": "Record<string, unknown>",
			"data":  "Record<string, unknown>",
		},
	},
	reflect.TypeOf(ClipboardProjectStateCore{}): {
		PropertyTypeExprOverrides: map[string]string{
			"sections":        "Record<string, Core>",
			"sectionImpls":    "Record<string, BaseSectionImplUnion>",
			"sectionVariants": "Record<string, Variant>",
			"codeObjs":        "Record<string, Core>",
			"codeObjImpls":    "Record<string, BaseCodeObjImplUnion>",
			"codeObjVariants": "Record<string, Variant>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"sections":        false,
			"sectionImpls":    false,
			"sectionVariants": false,
			"codeObjs":        false,
			"codeObjImpls":    false,
			"codeObjVariants": false,
		},
	},
	reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}): {
		CreateExprOverrides: map[string]string{
			"core": "createClipboardProjectStateCore()",
		},
		PropertyOptionalOverrides: map[string]bool{
			"sectionVariantMap": false,
		},
	},
	reflect.TypeOf(SectionsClipboardData{}): {
		CreateExprOverrides: map[string]string{
			"type": "ClipboardDataTypeEnum.Sections",
			"data": "createClipboardProjectStateCoreWithSectionVariantMap()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ClipboardDataTypeEnum.Sections",
		},
	},
	reflect.TypeOf(SectionCodegenPolicy{}): {
		DefaultValue:         projectview.FrontendDefaultPythonSectionCodegenPolicy(),
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"allowlist":            "Array<SectionType> | null",
			"metaControlAllowlist": "Array<CodeObjType> | null",
			"typePolicies":         "Record<SectionType, SectionTypeCodegenPolicy>",
			"sectionOverrides":     "Record<string, SectionCodegenOverride>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"allowlist":            true,
			"metaControlAllowlist": true,
		},
	},
	reflect.TypeOf(CodeObjValuePolicy{}): {
		DefaultValue:         projectview.FrontendDefaultPythonCodeObjValuePolicy(),
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"typePolicies":     "Record<CodeObjType, CodeObjTypeValuePolicy>",
			"codeObjOverrides": "Record<string, CodeObjValueOverride>",
		},
	},
	reflect.TypeOf(ProjectCodegenPythonTarget{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"language":           "typeof ProjectCodegenLanguageEnum.python",
			"sectionPolicy":      "SectionCodegenPolicy",
			"codeObjValuePolicy": "CodeObjValuePolicy",
		},
	},
	reflect.TypeOf(BrowserSavedSearch{}): {
		PropertyTypeExprOverrides: map[string]string{
			"typeFilters": "BrowserSavedSearchTypeFilters",
		},
	},
	reflect.TypeOf(plugins.PluginListEntry{}): {
		IgnoredProperties: reflectedIgnoredProperties("components"),
	},
	reflect.TypeOf(plugins.PluginStatusEntry{}): {
		IgnoredProperties: reflectedIgnoredProperties("components"),
	},
	reflect.TypeOf(WatchCodeRegistryEntry{}): {
		PropertyTypeExprOverrides: map[string]string{
			"kind": "string",
		},
	},
	reflect.TypeOf(CodeFileBinding{}): {
		PropertyTypeExprOverrides: map[string]string{
			"access_mode": "CodeFileAccessMode",
		},
	},
	reflect.TypeOf(TaskBoardTask{}): {
		PropertyTypeExprOverrides: map[string]string{
			"recurrence":       "TaskBoardTaskRecurrence",
			"recurrenceDays":   "Array<TaskBoardRecurringWeekday>",
			"recurrenceMonths": "Array<TaskBoardRecurringMonth>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"columnId": true,
		},
	},
	reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}): {
		PropertyTypeExprOverrides: map[string]string{
			"suppressedCodes": "Array<string | number>",
		},
	},
	reflect.TypeOf(MessageTextContent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": `"text"`,
		},
	},
	reflect.TypeOf(MessageImageURL{}): {
		DeclarationName: "MessageImageUrl",
		PropertyTypeExprOverrides: map[string]string{
			"detail": `"auto" | "low" | "high" | null`,
		},
	},
	reflect.TypeOf(MessageImageURLContent{}): {
		DeclarationName: "MessageImageUrlContent",
		PropertyTypeExprOverrides: map[string]string{
			"type": `"image_url"`,
		},
	},
	reflect.TypeOf(MessageThinkingContent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": `"thinking"`,
		},
	},
	reflect.TypeOf(ToolReferenceContent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": `"tool_reference"`,
		},
	},
	reflect.TypeOf(ToolCallFunction{}): {
		PropertyTypeExprOverrides: map[string]string{
			"arguments": "{ [key: string]: JSONValue | undefined }",
		},
	},
	reflect.TypeOf(ToolCall{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": `"function"`,
		},
	},
	reflect.TypeOf(SystemChatMessage{}): {
		IgnoredProperties: reflectedIgnoredProperties("role", "createdAt"),
		ExtraProperties: []TypeProperty{
			{Name: "role", TypeExpr: "typeof ChatRoleEnum.system"},
		},
		PropertyTypeExprOverrides: map[string]string{
			"content": "Array<MessageContent>",
		},
	},
	reflect.TypeOf(AssistantChatMessage{}): {
		IgnoredProperties: reflectedIgnoredProperties("role", "createdAt", "tool_calls"),
		ExtraProperties: []TypeProperty{
			{Name: "role", TypeExpr: "typeof ChatRoleEnum.assistant"},
			{Name: "tool_calls", TypeExpr: "Array<ToolCall> | null", Optional: true},
		},
		PropertyTypeExprOverrides: map[string]string{
			"content": "Array<MessageContent>",
		},
	},
	reflect.TypeOf(UserChatMessage{}): {
		IgnoredProperties: reflectedIgnoredProperties("role", "createdAt"),
		ExtraProperties: []TypeProperty{
			{Name: "role", TypeExpr: "typeof ChatRoleEnum.user"},
		},
		PropertyTypeExprOverrides: map[string]string{
			"content": "Array<MessageContent>",
		},
	},
	reflect.TypeOf(ToolChatMessage{}): {
		IgnoredProperties: reflectedIgnoredProperties("createdAt"),
		PropertyTypeExprOverrides: map[string]string{
			"role":       "typeof ChatRoleEnum.tool",
			"arguments":  "JSONValue",
			"result":     "JSONValue",
			"content":    "Array<ToolReferenceContent | Record<string, unknown>>",
			"started_at": "string",
		},
	},
	reflect.TypeOf(ChatSectionBranch{}): {
		PropertyTypeExprOverrides: map[string]string{
			"messages": "Array<BaseChatMessageUnion>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"parentBranchId":      true,
			"branchFromMessageId": true,
		},
	},
	reflect.TypeOf(ChatSectionState{}): {
		PropertyTypeExprOverrides: map[string]string{
			"messages": "Array<BaseChatMessageUnion>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"activeBranchId": true,
		},
	},
	reflect.TypeOf(SetSectionParamFilterRequestInput{}):            reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetMetaControlShowSectionTitleRequestInput{}):   reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetSectionColumnWidthRequestInput{}):            reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetSectionEdgeInputsRequestInput{}):             reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(ToggleGroupOrientationRequestInput{}):           reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetGroupOverflowModeRequestInput{}):             reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetBrowserColumnWidthsRequestInput{}):           reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetBrowserHideColumnRequestInput{}):             reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetSpreadsheetFilePathRequestInput{}):           reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetImageAreaImagePathRequestInput{}):            reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetSocialURLRequestInput{}):                     reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetChartAreaDataPathRequestInput{}):             reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTextBlockTextRequestInput{}):                 reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTextBlockHeadingAsSectionNameRequestInput{}): reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTextBlockMetaControlStyleRequestInput{}):     reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTextBlockMasterFontSizeRequestInput{}):       reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(CreateEdgeRequestInput{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type":     "string",
			"style":    "Record<string, unknown> | null",
			"animated": "boolean",
			"hidden":   "boolean",
			"zIndex":   "number",
			"data":     "Record<string, unknown> | null",
		},
	},
	reflect.TypeOf(CreateStateMachineEdgeRequestInput{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style":    "Record<string, unknown> | null",
			"hidden":   "boolean",
			"zIndex":   "number",
			"selected": "boolean",
		},
	},
	reflect.TypeOf(CreateAgenticEdgeRequestInput{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style":  "Record<string, unknown> | null",
			"hidden": "boolean",
			"zIndex": "number",
		},
	},
	reflect.TypeOf(SetChatSectionStateRequestInput{}):               reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetStateMachineSectionSettingsRequestInput{}):    reflectedOptionalPropertiesSpec("frontendOpId", "gateType"),
	reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{}): reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(UpdateEdgeRequestInput{}):                        reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(DeleteEdgesRequestInput{}):                       reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(ReconnectEdgeRequestInput{}):                     reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetEdgesRequestInput{}):                          reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(UpdateStateMachineEdgeRequestInput{}):            reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(DeleteStateMachineEdgesRequestInput{}):           reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetStateMachineEdgesRequestInput{}):              reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(UpdateAgenticEdgeRequestInput{}):                 reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(DeleteAgenticEdgesRequestInput{}):                reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetAgenticEdgesRequestInput{}):                   reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(MoveSectionsRequestInput{}): {
		PropertyTypeExprOverrides: map[string]string{
			"positionsById": "Record<string, Position> | null",
		},
		PropertyOptionalOverrides: map[string]bool{
			"frontendOpId": true,
		},
	},
	reflect.TypeOf(SetSectionEdgeOutputsRequestInput{}):         reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetListRootViewModeRequestInput{}):           reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetBrowserAreaViewModeRequestInput{}):        reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetBrowserSavedSearchesRequestInput{}):       reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{}): reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTaskBoardSectionStateRequestInput{}):      reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{}):       reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetChartTypeRequestInput{}):                  reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTextBlockDisplayModeRequestInput{}):       reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetTextBlockFormatRequestInput{}):            reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(SetCodeFileBindingRequestInput{}):            reflectedOptionalPropertiesSpec("frontendOpId"),
	reflect.TypeOf(UpdateArtifactMsgContent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"updateType": `"update" | "delete"`,
		},
	},
	reflect.TypeOf(UISettingRevealTarget{}): {
		PropertyOptionalOverrides: map[string]bool{
			"revealActivationSteps": false,
		},
	},
	reflect.TypeOf(UISettingRevealResultStatus{}): {
		PropertyTypeExprOverrides: map[string]string{
			"status": `"revealed" | "failed"`,
		},
		PropertyOptionalOverrides: map[string]bool{
			"errorCode":    true,
			"errorMessage": true,
		},
	},
	reflect.TypeOf(LineChartSettings{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ChartTypeEnum.line",
		},
	},
	reflect.TypeOf(ScatterChartSettings{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ChartTypeEnum.scatter",
		},
	},
	reflect.TypeOf(WebsocketConnectionInfo{}): {
		DefaultValue:  frontendDefaultWebsocketConnectionInfo(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(WebsocketMsgCurrentAddressUpdate{}): {
		DefaultValue:  frontendDefaultWebsocketMsgCurrentAddressUpdate(),
		HasCreateExpr: true,
		PropertyTypeExprOverrides: map[string]string{
			"messageType": "typeof WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate",
		},
	},
	reflect.TypeOf(WebsocketMsgRealtimeUIChange{}): {
		PropertyTypeExprOverrides: map[string]string{
			"messageType": "typeof WebsocketMsgTypeForBackendEnum.RealtimeUIChange",
		},
	},
	reflect.TypeOf(WebsocketMsgRealtimeDependencyEvent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"messageType": "typeof WebsocketMsgTypeForBackendEnum.RealtimeDependencyEvent",
		},
	},
	reflect.TypeOf(WebsocketMsgUISettingRevealResult{}): {
		PropertyTypeExprOverrides: map[string]string{
			"messageType": "typeof WebsocketMsgTypeForBackendEnum.UISettingRevealResult",
		},
	},
}

func ownerBackedReflectedObjectDeclarationSpec(t reflect.Type) (reflectedObjectDeclarationSpec, bool) {
	if spec, ok := ownerBackedReflectedObjectDeclarationSpecs[t]; ok {
		return reflectedSpecWithDiscoveredDefault(t, spec), true
	}
	if spec, ok := generatedOwnerBackedReflectedObjectDeclarationSpec(t); ok {
		return reflectedSpecWithDiscoveredDefault(t, spec), true
	}
	if spec := reflectedSpecWithDiscoveredDefault(t, reflectedObjectDeclarationSpec{}); spec.HasCreateExpr {
		return spec, true
	}
	return reflectedObjectDeclarationSpec{}, false
}

func generatedOwnerBackedReflectedObjectDeclarationSpec(
	t reflect.Type,
) (reflectedObjectDeclarationSpec, bool) {
	if t == reflect.TypeOf(BaseSectionImpl{}) {
		return reflectedObjectDeclarationSpec{
			PropertyTypeExprOverrides: map[string]string{
				"type":        "SectionType",
				"aspectRatio": "boolean | number",
			},
		}, true
	}
	if sectionName, ok := generatedSectionImplName(t); ok {
		return generatedSectionImplReflectedSpec(sectionName), true
	}
	if codeObjName, ok := generatedCodeObjImplName(t); ok {
		return generatedCodeObjImplReflectedSpec(
			strings.TrimSuffix(codeObjName, "CodeObjImpl"),
		), true
	}
	return reflectedObjectDeclarationSpec{}, false
}

func generatedSectionImplReflectedSpec(sectionName string) reflectedObjectDeclarationSpec {
	overrides := map[string]string{
		"type":        "typeof " + generatedSectionImplTypeExpr(sectionName),
		"aspectRatio": "boolean | number",
	}
	switch sectionName {
	case "Chart":
		overrides["chartSettings"] = "BaseChartSettingsUnion"
	case "Chat":
		overrides["messages"] = "Array<BaseChatMessageUnion>"
	}
	return reflectedObjectDeclarationSpec{
		PropertyTypeExprOverrides: overrides,
	}
}

func generatedCodeObjImplReflectedSpec(codeObjName string) reflectedObjectDeclarationSpec {
	overrides := map[string]string{
		"type": "typeof CodeObjTypeEnum." + codeObjName,
	}
	if codeObjName == "ColorPickerParam" {
		overrides["colorChoices"] = "Array<ColorPickerChoice>"
	}
	return reflectedObjectDeclarationSpec{
		PropertyTypeExprOverrides: overrides,
	}
}
