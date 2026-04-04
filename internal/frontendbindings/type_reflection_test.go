package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/projectview"
)

func TestTypeConverterReflectsSelectedContractsWithoutManualDeclarations(t *testing.T) {
	overrides := frontendBindingDeclarationOverrides()
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
		{
			name: "SharePolicy",
			root: reflect.TypeOf(SharePolicy{}),
			properties: []TypeProperty{
				{Name: "allowParamChanges", TypeExpr: "boolean", Optional: false},
				{Name: "allowVariantChanges", TypeExpr: "boolean", Optional: false},
				{Name: "allowLayoutChanges", TypeExpr: "boolean", Optional: false},
				{Name: "allowRun", TypeExpr: "boolean", Optional: false},
				{Name: "allowLLM", TypeExpr: "boolean", Optional: false},
				{Name: "allowExternalLinks", TypeExpr: "boolean", Optional: false},
				{Name: "allowFileDownloads", TypeExpr: "boolean", Optional: false},
				{Name: "allowMultipleRuns", TypeExpr: "boolean", Optional: false},
				{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode", Optional: false},
			},
		},
		{
			name: "StateMachineGateUIState",
			root: reflect.TypeOf(StateMachineGateUIState{}),
			properties: []TypeProperty{
				{Name: "showDetails", TypeExpr: "boolean", Optional: true},
			},
		},
		{
			name: "StateMachineSourceFilter",
			root: reflect.TypeOf(StateMachineSourceFilter{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "StateMachineSourceFilterType", Optional: true},
				{Name: "signalName", TypeExpr: "string | null", Optional: true},
				{Name: "payloadField", TypeExpr: "string | null", Optional: true},
				{Name: "equals", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "StateMachineSourceActivationCountCondition",
			root: reflect.TypeOf(StateMachineSourceActivationCountCondition{}),
			properties: []TypeProperty{
				{Name: "operator", TypeExpr: "StateMachineCountOperator", Optional: true},
				{Name: "value", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "StateMachineTargetAction",
			root: reflect.TypeOf(StateMachineTargetAction{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "StateMachineTargetActionType", Optional: true},
				{Name: "promptTemplateId", TypeExpr: "string | null", Optional: true},
				{Name: "promptSectionId", TypeExpr: "string | null", Optional: true},
				{Name: "inlinePrompt", TypeExpr: "string | null", Optional: true},
				{Name: "promptInputs", TypeExpr: "Record<string, string>", Optional: true},
				{Name: "threadStrategy", TypeExpr: "StateMachineThreadStrategy", Optional: true},
				{Name: "stopIfRunning", TypeExpr: "boolean", Optional: true},
				{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "agentProfileId", TypeExpr: "string | null", Optional: true},
				{Name: "permissionMode", TypeExpr: "string | null", Optional: true},
				{Name: "searchEnabled", TypeExpr: "boolean | null", Optional: true},
			},
		},
		{
			name: "StateMachineEdge",
			root: reflect.TypeOf(StateMachineEdge{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "machineGroupId", TypeExpr: "string", Optional: false},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "sourcePortId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetPortId", TypeExpr: "string", Optional: false},
				{Name: "sourceFilter", TypeExpr: "StateMachineSourceFilter | null", Optional: true},
				{Name: "sourceActivationCountCondition", TypeExpr: "StateMachineSourceActivationCountCondition | null", Optional: true},
				{Name: "targetAction", TypeExpr: "StateMachineTargetAction | null", Optional: true},
				{Name: "style", TypeExpr: "Record<string, unknown> | null", Optional: true},
				{Name: "hidden", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "selected", TypeExpr: "boolean", Optional: true},
			},
		},
		{
			name: "AgenticEdge",
			root: reflect.TypeOf(AgenticEdge{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "sourceSectionId", TypeExpr: "string", Optional: false},
				{Name: "targetSectionId", TypeExpr: "string", Optional: false},
				{Name: "kind", TypeExpr: "AgenticEdgeKind", Optional: false},
				{Name: "contextMode", TypeExpr: "AgenticEdgeContextMode | null", Optional: true},
				{Name: "style", TypeExpr: "Record<string, unknown>", Optional: true},
				{Name: "hidden", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "selected", TypeExpr: "boolean", Optional: true},
			},
		},
		{
			name: "Viewport",
			root: reflect.TypeOf(Viewport{}),
			properties: []TypeProperty{
				{Name: "x", TypeExpr: "number", Optional: false},
				{Name: "y", TypeExpr: "number", Optional: false},
				{Name: "zoom", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "EngineConfig",
			root: reflect.TypeOf(EngineConfig{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "engineType", TypeExpr: "EngineType", Optional: false},
				{Name: "settaLlmConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "externalAgentConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "defaults", TypeExpr: "EngineConfigDefaults", Optional: false},
				{Name: "runtimeSupport", TypeExpr: "EngineRuntimeSupport | null", Optional: true},
			},
		},
		{
			name: "AgentProfile",
			root: reflect.TypeOf(AgentProfile{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "description", TypeExpr: "string", Optional: false},
				{Name: "systemPrompt", TypeExpr: "string", Optional: false},
				{Name: "enableBackgroundSummaryFill", TypeExpr: "boolean", Optional: false},
				{Name: "enableLlmChatTitles", TypeExpr: "boolean", Optional: false},
				{Name: "engineConfigId", TypeExpr: "string | null", Optional: true},
				{Name: "toolAllowlist", TypeExpr: "Array<string>", Optional: false},
				{Name: "memoryScope", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "TranscriptionProfile",
			root: reflect.TypeOf(TranscriptionProfile{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "transcriptionLlmConfigId", TypeExpr: "string", Optional: false},
				{Name: "transportMode", TypeExpr: "TranscriptionTransportMode", Optional: false},
				{Name: "chunkMs", TypeExpr: "number", Optional: false},
				{Name: "supportsRealtimeTranscription", TypeExpr: "boolean", Optional: false},
				{Name: "language", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "BrowserSavedSearch",
			root: reflect.TypeOf(BrowserSavedSearch{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "query", TypeExpr: "string", Optional: false},
				{Name: "searchScope", TypeExpr: "BrowserSearchScope", Optional: false},
				{Name: "typeFilters", TypeExpr: "BrowserSavedSearchTypeFilters", Optional: false},
				{Name: "color", TypeExpr: "string", Optional: false},
				{Name: "quickInfo", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "ProjectRunCapabilities",
			root: reflect.TypeOf(projectview.ProjectRunCapabilities{}),
			properties: []TypeProperty{
				{Name: "canRunFromMain", TypeExpr: "boolean", Optional: false},
				{Name: "mainRunDisabledReason", TypeExpr: "string | null", Optional: true},
				{Name: "effectiveEntrySectionId", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "ProjectConfig",
			root: reflect.TypeOf(ProjectConfig{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "showParamDisplayNames", TypeExpr: "boolean", Optional: false},
				{Name: "allowJsonSourceKeyEdits", TypeExpr: "boolean", Optional: false},
				{Name: "previewImgColor", TypeExpr: "string", Optional: true},
				{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				{Name: "viewportInitialized", TypeExpr: "boolean", Optional: false},
				{Name: "viewModes", TypeExpr: "Record<string, ViewMode>", Optional: false},
				{Name: "activeViewModeId", TypeExpr: "string | null", Optional: true},
				{Name: "isEditingViewMode", TypeExpr: "boolean", Optional: false},
				{Name: "hasPythonCodegenTarget", TypeExpr: "boolean", Optional: false},
				{Name: "runCapabilities", TypeExpr: "ProjectRunCapabilities", Optional: false},
				{Name: "codegenTargets", TypeExpr: "Array<ProjectCodegenTarget>", Optional: false},
				{Name: "watchCodeEnabled", TypeExpr: "boolean", Optional: false},
				{Name: "watchCodeFolders", TypeExpr: "Array<WatchCodeFolder>", Optional: false},
				{Name: "watchCodeFiles", TypeExpr: "Array<string>", Optional: false},
				{Name: "watchCodeRegistry", TypeExpr: "Record<string, WatchCodeRegistryEntry>", Optional: false},
				{Name: "watchCodeBaselineByPath", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "entryCodeBlockId", TypeExpr: "string | null", Optional: true},
				{Name: "sectionPathSlugsById", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "sectionIdsByPathSlug", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: false},
				{Name: "windowSpaceSlugsById", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "windowSpaceIdsBySlug", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "windowSpaces", TypeExpr: "Record<string, WindowSpaceConfig>", Optional: false},
				{Name: "sectionVariantMap", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "activeIds", TypeExpr: "Array<string>", Optional: false},
				{Name: "edges", TypeExpr: "Array<Edge>", Optional: false},
				{Name: "agenticEdges", TypeExpr: "Array<AgenticEdge>", Optional: false},
				{Name: "stateMachineEdges", TypeExpr: "Array<StateMachineEdge>", Optional: false},
			},
		},
		{
			name: "TopLevelSectionLayout",
			root: reflect.TypeOf(TopLevelSectionLayout{}),
			properties: []TypeProperty{
				{Name: "x", TypeExpr: "number", Optional: false},
				{Name: "y", TypeExpr: "number", Optional: false},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "w", TypeExpr: "number | null", Optional: true},
				{Name: "h", TypeExpr: "number | null", Optional: true},
			},
		},
		{
			name: "ViewMode",
			root: reflect.TypeOf(ViewMode{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: true},
				{Name: "isUserFacing", TypeExpr: "boolean", Optional: true},
				{Name: "isTab", TypeExpr: "boolean", Optional: true},
				{Name: "visibilityBySectionId", TypeExpr: "Record<string, boolean>", Optional: true},
				{Name: "viewport", TypeExpr: "Viewport | null", Optional: true},
				{Name: "viewportInitialized", TypeExpr: "boolean", Optional: true},
				{Name: "topLevelSections", TypeExpr: "Record<string, TopLevelSectionLayout>", Optional: true},
			},
		},
		{
			name: "SectionCapabilities",
			root: reflect.TypeOf(projectview.SectionCapabilities{}),
			properties: []TypeProperty{
				{Name: "canRun", TypeExpr: "boolean", Optional: false},
				{Name: "runDisabledReason", TypeExpr: "string | null", Optional: true},
				{Name: "runRequestSectionId", TypeExpr: "string | null", Optional: true},
				{Name: "canSelectAsEntryCodeBlock", TypeExpr: "boolean", Optional: false},
				{Name: "entryCodeBlockValue", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "ProjectStateSingleConfig",
			root: reflect.TypeOf(ProjectStateSingleConfig{}),
			properties: []TypeProperty{
				{Name: "sections", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>", Optional: false},
				{Name: "sectionCapabilities", TypeExpr: "Record<string, SectionCapabilities>", Optional: false},
				{Name: "sectionVariants", TypeExpr: "Record<string, Variant>", Optional: false},
				{Name: "codeObjs", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>", Optional: false},
				{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>", Optional: false},
				{Name: "projectConfig", TypeExpr: "ProjectConfig", Optional: false},
				{Name: "singletonSections", TypeExpr: "SingletonSections", Optional: false},
				{Name: "parentSectionMap", TypeExpr: "Record<string, string | null>", Optional: false},
				{Name: "shownParamIds", TypeExpr: "Record<string, ShownParamIds>", Optional: false},
				{Name: "requiredDecodedImages", TypeExpr: "Array<string>", Optional: false},
				{Name: "genCodeBinding", TypeExpr: "CodeFileBinding | null", Optional: true},
				{Name: "projectChatWindowing", TypeExpr: "ProjectChatWindowingState", Optional: false},
				{Name: "artifactGroups", TypeExpr: "Record<string, unknown>", Optional: true},
			},
		},
		{
			name: "ProjectStateSingleConfigWithCompletedOpIds",
			root: reflect.TypeOf(ProjectStateSingleConfigWithCompletedOpIds{}),
			properties: []TypeProperty{
				{Name: "projectState", TypeExpr: "ProjectStateSingleConfig", Optional: false},
				{Name: "completedOpIds", TypeExpr: "Array<string>", Optional: false},
				{Name: "pendingOpIds", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "ClipboardProjectStateCore",
			root: reflect.TypeOf(ClipboardProjectStateCore{}),
			properties: []TypeProperty{
				{Name: "sections", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "sectionImpls", TypeExpr: "Record<string, BaseSectionImplUnion>", Optional: false},
				{Name: "sectionVariants", TypeExpr: "Record<string, Variant>", Optional: false},
				{Name: "codeObjs", TypeExpr: "Record<string, Core>", Optional: false},
				{Name: "codeObjImpls", TypeExpr: "Record<string, BaseCodeObjImplUnion>", Optional: false},
				{Name: "codeObjVariants", TypeExpr: "Record<string, Variant>", Optional: false},
			},
		},
		{
			name: "ClipboardProjectStateCoreWithSectionVariantMap",
			root: reflect.TypeOf(ClipboardProjectStateCoreWithSectionVariantMap{}),
			properties: []TypeProperty{
				{Name: "core", TypeExpr: "ClipboardProjectStateCore", Optional: false},
				{Name: "sectionVariantMap", TypeExpr: "Record<string, string>", Optional: false},
			},
		},
		{
			name: "SectionsClipboardData",
			root: reflect.TypeOf(SectionsClipboardData{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof ClipboardDataTypeEnum.Sections", Optional: false},
				{Name: "data", TypeExpr: "ClipboardProjectStateCoreWithSectionVariantMap", Optional: false},
			},
		},
		{
			name: "Core",
			root: reflect.TypeOf(Core{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "displayName", TypeExpr: "string", Optional: false},
				{Name: "variants", TypeExpr: "Array<string>", Optional: false},
				{Name: "defaultVariant", TypeExpr: "string | null", Optional: false},
				{Name: "sharedModifier", TypeExpr: "Record<string, unknown>", Optional: false},
				{Name: "unsharedKeys", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "Variant",
			root: reflect.TypeOf(Variant{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "impl", TypeExpr: "string", Optional: false},
				{Name: "nonPresetImpls", TypeExpr: "Array<string>", Optional: false},
				{Name: "modifier", TypeExpr: "Record<string, unknown>", Optional: false},
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "SingletonSections",
			root: reflect.TypeOf(SingletonSections{}),
			properties: []TypeProperty{
				{Name: "GlobalVariables", TypeExpr: "string | null", Optional: false},
				{Name: "GenPythonCode", TypeExpr: "string | null", Optional: false},
				{Name: "GenPythonMetadata", TypeExpr: "string | null", Optional: false},
			},
		},
		{
			name: "ShownParamIdDetails",
			root: reflect.TypeOf(ShownParamIdDetails{}),
			properties: []TypeProperty{
				{Name: "requiredParamIdsToPaths", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "topLevelParamIds", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "ShownParamIds",
			root: reflect.TypeOf(ShownParamIds{}),
			properties: []TypeProperty{
				{Name: "pinned", TypeExpr: "ShownParamIdDetails", Optional: false},
				{Name: "unpinned", TypeExpr: "ShownParamIdDetails", Optional: false},
			},
		},
		{
			name: "ChatWindowBounds",
			root: reflect.TypeOf(ChatWindowBounds{}),
			properties: []TypeProperty{
				{Name: "x", TypeExpr: "number", Optional: false},
				{Name: "y", TypeExpr: "number", Optional: false},
				{Name: "width", TypeExpr: "number", Optional: false},
				{Name: "height", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "ChatWindowDockMetrics",
			root: reflect.TypeOf(ChatWindowDockMetrics{}),
			properties: []TypeProperty{
				{Name: "widthFraction", TypeExpr: "number | null", Optional: true},
				{Name: "preferredWidthPx", TypeExpr: "number | null", Optional: true},
			},
		},
		{
			name: "ProjectChatWindowInstance",
			root: reflect.TypeOf(ProjectChatWindowInstance{}),
			properties: []TypeProperty{
				{Name: "instanceId", TypeExpr: "string", Optional: false},
				{Name: "placement", TypeExpr: "ChatWindowPlacement", Optional: true},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: true},
				{Name: "isClosed", TypeExpr: "boolean", Optional: true},
				{Name: "isMaximized", TypeExpr: "boolean", Optional: true},
				{Name: "bounds", TypeExpr: "ChatWindowBounds", Optional: true},
				{Name: "dockMetrics", TypeExpr: "ChatWindowDockMetrics", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "lastPlacementBeforeMaximize", TypeExpr: "ChatWindowPlacement | null", Optional: true},
				{Name: "mode", TypeExpr: "ChatWindowMode", Optional: true},
				{Name: "sectionIdOrNull", TypeExpr: "string | null", Optional: true},
				{Name: "title", TypeExpr: "string | null", Optional: true},
				{Name: "lastFocusedAt", TypeExpr: "number", Optional: true},
				{Name: "chatId", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "ProjectChatWindowingState",
			root: reflect.TypeOf(ProjectChatWindowingState{}),
			properties: []TypeProperty{
				{Name: "instancesById", TypeExpr: "Record<string, ProjectChatWindowInstance>", Optional: false},
				{Name: "order", TypeExpr: "Array<string>", Optional: false},
				{Name: "nextInstanceNumber", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "NormalizedFloatingWindowBounds",
			root: reflect.TypeOf(NormalizedFloatingWindowBounds{}),
			properties: []TypeProperty{
				{Name: "x", TypeExpr: "number", Optional: false},
				{Name: "y", TypeExpr: "number", Optional: false},
				{Name: "width", TypeExpr: "number", Optional: false},
				{Name: "height", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "WindowSpaceWindow",
			root: reflect.TypeOf(WindowSpaceWindow{}),
			properties: []TypeProperty{
				{Name: "surfaceKind", TypeExpr: "WindowSpaceSurfaceKind", Optional: true},
				{Name: "sectionIdOrNull", TypeExpr: "string | null", Optional: true},
				{Name: "mode", TypeExpr: "ChatWindowMode", Optional: true},
				{Name: "title", TypeExpr: "string | null", Optional: true},
				{Name: "chatId", TypeExpr: "string | null", Optional: true},
				{Name: "embeddedGitPaneVisible", TypeExpr: "boolean", Optional: true},
				{Name: "zIndex", TypeExpr: "number", Optional: true},
				{Name: "normalizedBounds", TypeExpr: "NormalizedFloatingWindowBounds", Optional: true},
			},
		},
		{
			name: "WindowSpaceState",
			root: reflect.TypeOf(WindowSpaceState{}),
			properties: []TypeProperty{
				{Name: "windowsById", TypeExpr: "Record<string, WindowSpaceWindow>", Optional: false},
				{Name: "order", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "WindowSpaceConfig",
			root: reflect.TypeOf(WindowSpaceConfig{}),
			properties: []TypeProperty{
				{Name: "windowsById", TypeExpr: "Record<string, WindowSpaceWindow>", Optional: false},
				{Name: "order", TypeExpr: "Array<string>", Optional: false},
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: true},
			},
		},
		{
			name: "WatchCodeFolder",
			root: reflect.TypeOf(WatchCodeFolder{}),
			properties: []TypeProperty{
				{Name: "path", TypeExpr: "string", Optional: false},
				{Name: "recursive", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "WatchCodeRegistryEntry",
			root: reflect.TypeOf(WatchCodeRegistryEntry{}),
			properties: []TypeProperty{
				{Name: "callableName", TypeExpr: "string", Optional: false},
				{Name: "kind", TypeExpr: "string", Optional: false},
				{Name: "signatureHash", TypeExpr: "string", Optional: false},
				{Name: "bodyHash", TypeExpr: "string", Optional: false},
				{Name: "sourcePath", TypeExpr: "string", Optional: false},
				{Name: "sectionIds", TypeExpr: "Array<string>", Optional: true},
				{Name: "sectionsCount", TypeExpr: "number", Optional: true},
			},
		},
		{
			name: "CodeFileBinding",
			root: reflect.TypeOf(CodeFileBinding{}),
			properties: []TypeProperty{
				{Name: "canonical_path", TypeExpr: "string", Optional: false},
				{Name: "access_mode", TypeExpr: "CodeFileAccessMode", Optional: false},
				{Name: "autoBinding", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "TaskBoardColumn",
			root: reflect.TypeOf(TaskBoardColumn{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "color", TypeExpr: "string", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "TaskBoardTask",
			root: reflect.TypeOf(TaskBoardTask{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "title", TypeExpr: "string", Optional: false},
				{Name: "description", TypeExpr: "string", Optional: false},
				{Name: "completed", TypeExpr: "boolean", Optional: false},
				{Name: "columnId", TypeExpr: "string | null", Optional: true},
				{Name: "dueDateIso", TypeExpr: "string", Optional: false},
				{Name: "recurrence", TypeExpr: "TaskBoardTaskRecurrence", Optional: false},
				{Name: "recurrenceDays", TypeExpr: "Array<TaskBoardRecurringWeekday>", Optional: false},
				{Name: "recurrenceMonths", TypeExpr: "Array<TaskBoardRecurringMonth>", Optional: false},
				{Name: "recurrenceYears", TypeExpr: "Array<number>", Optional: false},
				{Name: "sortIndex", TypeExpr: "number", Optional: false},
			},
		},
		{
			name: "CodeSectionDiagnosticsIgnoreState",
			root: reflect.TypeOf(CodeSectionDiagnosticsIgnoreState{}),
			properties: []TypeProperty{
				{Name: "muted", TypeExpr: "boolean", Optional: false},
				{Name: "suppressedCodes", TypeExpr: "Array<string | number>", Optional: false},
			},
		},
		{
			name: "SectionSize",
			root: reflect.TypeOf(SectionSize{}),
			properties: []TypeProperty{
				{Name: "width", TypeExpr: "SectionSizeValue", Optional: false},
				{Name: "height", TypeExpr: "SectionSizeValue", Optional: false},
			},
		},
		{
			name: "UserDefaultCodeParamCodeObjImpl",
			root: reflect.TypeOf(UserDefaultCodeParamCodeObjImpl{}),
			properties: []TypeProperty{
				{Name: "coreNameType", TypeExpr: "ParamNameType", Optional: false},
				{Name: "coreNameEditable", TypeExpr: "boolean", Optional: false},
				{Name: "typeAnnotation", TypeExpr: "string", Optional: false},
				{Name: "defaultVal", TypeExpr: "string", Optional: false},
				{Name: "value", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "UserDefaultCallableSectionImpl",
			root: reflect.TypeOf(UserDefaultCallableSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: false},
				{Name: "paramFilter", TypeExpr: "string", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "configLanguage", TypeExpr: "ConfigLanguage", Optional: false},
				{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: false},
				{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: false},
				{Name: "hideParams", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "UserDefaultDictSectionImpl",
			root: reflect.TypeOf(UserDefaultDictSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "hideUnpinnedParams", TypeExpr: "boolean", Optional: false},
				{Name: "paramFilter", TypeExpr: "string", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "configLanguage", TypeExpr: "string", Optional: false},
				{Name: "edgeInputParams", TypeExpr: "Array<string>", Optional: false},
				{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>", Optional: false},
				{Name: "isJsonSource", TypeExpr: "boolean", Optional: false},
				{Name: "jsonSourceKeys", TypeExpr: "Array<string>", Optional: false},
			},
		},
		{
			name: "UserDefaultChatSectionImpl",
			root: reflect.TypeOf(UserDefaultChatSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "managed", TypeExpr: "boolean", Optional: false},
				{Name: "engineConfigId", TypeExpr: "string | null", Optional: false},
				{Name: "transcriptionProfileId", TypeExpr: "string | null", Optional: false},
				{Name: "agentProfileId", TypeExpr: "string | null", Optional: false},
				{Name: "chatId", TypeExpr: "string | null", Optional: false},
				{Name: "thinking", TypeExpr: "boolean", Optional: false},
				{Name: "permissionMode", TypeExpr: "ChatPermissionMode", Optional: false},
				{Name: "searchEnabled", TypeExpr: "boolean", Optional: false},
				{Name: "dictationMode", TypeExpr: "ChatDictationMode", Optional: false},
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "inputText", TypeExpr: "string", Optional: false},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: false},
				{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "activeBranchId", TypeExpr: "string | null", Optional: false},
				{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>", Optional: false},
			},
		},
		{
			name: "UserDefaultBrowserSectionImpl",
			root: reflect.TypeOf(UserDefaultBrowserSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "folder", TypeExpr: "string", Optional: false},
				{Name: "hideColumn", TypeExpr: "boolean", Optional: false},
				{Name: "columnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "typesColumnWidth", TypeExpr: "number | null", Optional: false},
				{Name: "viewMode", TypeExpr: "BrowserAreaViewMode", Optional: false},
				{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>", Optional: false},
			},
		},
		{
			name: "UserDefaultListRootSectionImpl",
			root: reflect.TypeOf(UserDefaultListRootSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: false},
				{Name: "viewMode", TypeExpr: "ListRootViewMode", Optional: false},
			},
		},
		{
			name: "UserDefaultGroupSectionImpl",
			root: reflect.TypeOf(UserDefaultGroupSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "isHorizontalOrientation", TypeExpr: "boolean", Optional: false},
				{Name: "overflowMode", TypeExpr: "boolean", Optional: false},
				{Name: "defaultChildSectionType", TypeExpr: "SectionType", Optional: false},
			},
		},
		{
			name: "UserDefaultStateMachineStartSectionImpl",
			root: reflect.TypeOf(UserDefaultStateMachineStartSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "machineGroupId", TypeExpr: "string", Optional: false},
				{Name: "label", TypeExpr: "string", Optional: false},
				{Name: "maxIterations", TypeExpr: "number | null", Optional: false},
			},
		},
		{
			name: "UserDefaultStateMachineGateSectionImpl",
			root: reflect.TypeOf(UserDefaultStateMachineGateSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "machineGroupId", TypeExpr: "string", Optional: false},
				{Name: "gateType", TypeExpr: "StateMachineGateType", Optional: false},
				{Name: "label", TypeExpr: "string", Optional: false},
				{Name: "ui", TypeExpr: "StateMachineGateUIState", Optional: false},
			},
		},
		{
			name: "UserDefaultStateMachineEndSectionImpl",
			root: reflect.TypeOf(UserDefaultStateMachineEndSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "machineGroupId", TypeExpr: "string", Optional: false},
				{Name: "label", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "UserDefaultTextBlockSectionImpl",
			root: reflect.TypeOf(UserDefaultTextBlockSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "format", TypeExpr: "TextBlockFormat", Optional: false},
				{Name: "masterFontSizePx", TypeExpr: "number", Optional: false},
				{Name: "headingAsSectionName", TypeExpr: "boolean", Optional: false},
				{Name: "metaControlStyle", TypeExpr: "boolean", Optional: false},
				{Name: "textDisplayMode", TypeExpr: "TextBlockDisplayMode", Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "UserDefaultPromptSectionImpl",
			root: reflect.TypeOf(UserDefaultPromptSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "template", TypeExpr: "string", Optional: false},
				{Name: "format", TypeExpr: "PromptFormat", Optional: false},
				{Name: "inputs", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "renderedText", TypeExpr: "string", Optional: false},
				{Name: "missingVariables", TypeExpr: "Array<string>", Optional: false},
				{Name: "renderError", TypeExpr: "string | null", Optional: false},
			},
		},
		{
			name: "UserDefaultCodeSectionImpl",
			root: reflect.TypeOf(UserDefaultCodeSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "code", TypeExpr: "string", Optional: false},
				{Name: "codeFileBinding", TypeExpr: "CodeFileBinding | null", Optional: false},
				{Name: "attachedTerminalSectionId", TypeExpr: "string | null", Optional: false},
				{Name: "codeLanguage", TypeExpr: "string", Optional: false},
				{Name: "diagnosticsIgnoreState", TypeExpr: "CodeSectionDiagnosticsIgnoreState", Optional: false},
			},
		},
		{
			name: "UserDefaultTerminalSectionImpl",
			root: reflect.TypeOf(UserDefaultTerminalSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "UserDefaultTaskBoardSectionImpl",
			root: reflect.TypeOf(UserDefaultTaskBoardSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "viewMode", TypeExpr: "TaskBoardViewMode", Optional: false},
				{Name: "columns", TypeExpr: "Array<TaskBoardColumn> | null", Optional: false},
				{Name: "tasks", TypeExpr: "Array<TaskBoardTask>", Optional: false},
			},
		},
		{
			name: "UserDefaultChartSectionImpl",
			root: reflect.TypeOf(UserDefaultChartSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "dataPath", TypeExpr: "string", Optional: false},
				{Name: "chartSettings", TypeExpr: "BaseChartSettingsUnion", Optional: false},
			},
		},
		{
			name: "UserDefaultSpreadsheetSectionImpl",
			root: reflect.TypeOf(UserDefaultSpreadsheetSectionImpl{}),
			properties: []TypeProperty{
				{Name: "isFrozen", TypeExpr: "boolean", Optional: false},
				{Name: "tagColor", TypeExpr: "string | null", Optional: false},
				{Name: "styleColor", TypeExpr: "string | null", Optional: false},
				{Name: "size", TypeExpr: "SectionSize", Optional: false},
				{Name: "aspectRatio", TypeExpr: "boolean | number", Optional: false},
				{Name: "isMinimized", TypeExpr: "boolean", Optional: false},
				{Name: "positionAndSizeLocked", TypeExpr: "boolean", Optional: false},
				{Name: "filePath", TypeExpr: "string", Optional: false},
				{Name: "activeSheet", TypeExpr: "string | null", Optional: false},
				{Name: "readOnly", TypeExpr: "boolean", Optional: false},
				{Name: "showRowNumbers", TypeExpr: "boolean", Optional: false},
				{Name: "density", TypeExpr: "SpreadsheetGridDensity", Optional: false},
				{Name: "autoReloadOnExternalChange", TypeExpr: "boolean", Optional: false},
			},
		},
		{
			name: "UpdateAgentProfileRequestInput",
			root: reflect.TypeOf(UpdateAgentProfileRequestInput{}),
			properties: []TypeProperty{
				{Name: "profile", TypeExpr: "AgentProfile", Optional: false},
			},
		},
		{
			name: "UpdateEngineConfigRequestInput",
			root: reflect.TypeOf(UpdateEngineConfigRequestInput{}),
			properties: []TypeProperty{
				{Name: "config", TypeExpr: "EngineConfig", Optional: false},
			},
		},
		{
			name: "CreateTranscriptionProfileRequestInput",
			root: reflect.TypeOf(CreateTranscriptionProfileRequestInput{}),
			properties: []TypeProperty{
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "transcriptionLlmConfigId", TypeExpr: "string", Optional: false},
				{Name: "transportMode", TypeExpr: "TranscriptionTransportMode", Optional: false},
				{Name: "chunkMs", TypeExpr: "number", Optional: false},
				{Name: "language", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "UpdateTranscriptionProfileRequestInput",
			root: reflect.TypeOf(UpdateTranscriptionProfileRequestInput{}),
			properties: []TypeProperty{
				{Name: "profile", TypeExpr: "TranscriptionProfile", Optional: false},
			},
		},
		{
			name: "SetChatSectionStateRequestInput",
			root: reflect.TypeOf(SetChatSectionStateRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "state", TypeExpr: "ChatSectionState", Optional: false},
			},
		},
		{
			name: "SetStateMachineSectionSettingsRequestInput",
			root: reflect.TypeOf(SetStateMachineSectionSettingsRequestInput{}),
			properties: []TypeProperty{
				{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string", Optional: false},
				{Name: "sectionId", TypeExpr: "string", Optional: false},
				{Name: "machineGroupId", TypeExpr: "string", Optional: false},
				{Name: "label", TypeExpr: "string", Optional: false},
				{Name: "gateType", TypeExpr: "StateMachineGateType | null", Optional: true},
			},
		},
		{
			name: "CodeFileBindingUpdate",
			root: reflect.TypeOf(CodeFileBindingUpdate{}),
			properties: []TypeProperty{
				{Name: "canonical_path", TypeExpr: "string", Optional: false},
				{Name: "access_mode", TypeExpr: "CodeFileAccessMode", Optional: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, ok := overrides[tt.root]; ok {
				t.Fatalf("%s should not remain in the manual declaration override map", tt.name)
			}

			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want object", tt.name, declaration.Kind)
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
			if tt.name == "EngineConfig" && declaration.CreateBody == "" {
				t.Fatalf("EngineConfig should use a structured create body")
			}
			if (tt.name == "SharePolicy" ||
				tt.name == "StateMachineGateUIState" ||
				tt.name == "StateMachineSourceFilter" ||
				tt.name == "StateMachineSourceActivationCountCondition" ||
				tt.name == "StateMachineTargetAction" ||
				tt.name == "StateMachineEdge" ||
				tt.name == "AgenticEdge" ||
				tt.name == "BrowserSavedSearch" ||
				tt.name == "SectionSize" ||
				tt.name == "TaskBoardColumn" ||
				tt.name == "TaskBoardTask" ||
				tt.name == "UserDefaultCodeParamCodeObjImpl" ||
				tt.name == "UserDefaultCallableSectionImpl" ||
				tt.name == "UserDefaultDictSectionImpl" ||
				tt.name == "UserDefaultChatSectionImpl" ||
				tt.name == "UserDefaultBrowserSectionImpl" ||
				tt.name == "UserDefaultListRootSectionImpl" ||
				tt.name == "UserDefaultGroupSectionImpl" ||
				tt.name == "UserDefaultStateMachineStartSectionImpl" ||
				tt.name == "UserDefaultStateMachineGateSectionImpl" ||
				tt.name == "UserDefaultStateMachineEndSectionImpl" ||
				tt.name == "UserDefaultTextBlockSectionImpl" ||
				tt.name == "UserDefaultPromptSectionImpl" ||
				tt.name == "UserDefaultCodeSectionImpl" ||
				tt.name == "UserDefaultTerminalSectionImpl" ||
				tt.name == "UserDefaultTaskBoardSectionImpl" ||
				tt.name == "UserDefaultChartSectionImpl" ||
				tt.name == "UserDefaultSpreadsheetSectionImpl" ||
				tt.name == "ProjectRunCapabilities" ||
				tt.name == "ProjectConfig" ||
				tt.name == "SectionCapabilities" ||
				tt.name == "ProjectStateSingleConfig" ||
				tt.name == "ProjectStateSingleConfigWithCompletedOpIds" ||
				tt.name == "ClipboardProjectStateCore" ||
				tt.name == "ClipboardProjectStateCoreWithSectionVariantMap" ||
				tt.name == "SectionsClipboardData" ||
				tt.name == "Core" ||
				tt.name == "Variant" ||
				tt.name == "SingletonSections" ||
				tt.name == "ShownParamIdDetails" ||
				tt.name == "ShownParamIds" ||
				tt.name == "TopLevelSectionLayout" ||
				tt.name == "ViewMode" ||
				tt.name == "ChatWindowBounds" ||
				tt.name == "ChatWindowDockMetrics" ||
				tt.name == "ProjectChatWindowInstance" ||
				tt.name == "ProjectChatWindowingState" ||
				tt.name == "NormalizedFloatingWindowBounds" ||
				tt.name == "WindowSpaceWindow" ||
				tt.name == "WindowSpaceState" ||
				tt.name == "WindowSpaceConfig") && declaration.CreateExpr == "" {
				t.Fatalf("%s should use a Go-backed create expr", tt.name)
			}
		})
	}
}

func TestTypeConverterReflectsProjectStateMutationRequestsWithoutManualDeclarations(t *testing.T) {
	overrides := frontendBindingDeclarationOverrides()
	tests := []struct {
		name string
		root reflect.Type
	}{
		{name: "PrepareSectionsForCopyRequestInput", root: reflect.TypeOf(PrepareSectionsForCopyRequestInput{})},
		{name: "PasteSectionsRequestInput", root: reflect.TypeOf(PasteSectionsRequestInput{})},
		{name: "CreateChildSectionsRequestInput", root: reflect.TypeOf(CreateChildSectionsRequestInput{})},
		{name: "CreateChildSectionsViaIncrementerRequestInput", root: reflect.TypeOf(CreateChildSectionsViaIncrementerRequestInput{})},
		{name: "DeleteChildSectionsViaDecrementerRequestInput", root: reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{})},
		{name: "CreateEdgeRequestInput", root: reflect.TypeOf(CreateEdgeRequestInput{})},
		{name: "UpdateEdgeRequestInput", root: reflect.TypeOf(UpdateEdgeRequestInput{})},
		{name: "DeleteEdgesRequestInput", root: reflect.TypeOf(DeleteEdgesRequestInput{})},
		{name: "ReconnectEdgeRequestInput", root: reflect.TypeOf(ReconnectEdgeRequestInput{})},
		{name: "SetEdgesRequestInput", root: reflect.TypeOf(SetEdgesRequestInput{})},
		{name: "CreateStateMachineEdgeRequestInput", root: reflect.TypeOf(CreateStateMachineEdgeRequestInput{})},
		{name: "UpdateStateMachineEdgeRequestInput", root: reflect.TypeOf(UpdateStateMachineEdgeRequestInput{})},
		{name: "DeleteStateMachineEdgesRequestInput", root: reflect.TypeOf(DeleteStateMachineEdgesRequestInput{})},
		{name: "SetStateMachineEdgesRequestInput", root: reflect.TypeOf(SetStateMachineEdgesRequestInput{})},
		{name: "CreateAgenticEdgeRequestInput", root: reflect.TypeOf(CreateAgenticEdgeRequestInput{})},
		{name: "UpdateAgenticEdgeRequestInput", root: reflect.TypeOf(UpdateAgenticEdgeRequestInput{})},
		{name: "DeleteAgenticEdgesRequestInput", root: reflect.TypeOf(DeleteAgenticEdgesRequestInput{})},
		{name: "SetAgenticEdgesRequestInput", root: reflect.TypeOf(SetAgenticEdgesRequestInput{})},
		{name: "MoveSectionsRequestInput", root: reflect.TypeOf(MoveSectionsRequestInput{})},
		{name: "SetSectionSizesRequestInput", root: reflect.TypeOf(SetSectionSizesRequestInput{})},
		{name: "SetSectionEdgeOutputsRequestInput", root: reflect.TypeOf(SetSectionEdgeOutputsRequestInput{})},
		{name: "SetParentDefaultChildSectionTypeRequestInput", root: reflect.TypeOf(SetParentDefaultChildSectionTypeRequestInput{})},
		{name: "SetListRootViewModeRequestInput", root: reflect.TypeOf(SetListRootViewModeRequestInput{})},
		{name: "SetBrowserAreaViewModeRequestInput", root: reflect.TypeOf(SetBrowserAreaViewModeRequestInput{})},
		{name: "SetBrowserSavedSearchesRequestInput", root: reflect.TypeOf(SetBrowserSavedSearchesRequestInput{})},
		{name: "SetSpreadsheetSectionSettingsRequestInput", root: reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{})},
		{name: "SetTaskBoardSectionStateRequestInput", root: reflect.TypeOf(SetTaskBoardSectionStateRequestInput{})},
		{name: "AppendDrawAreaLayerItemRequestInput", root: reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{})},
		{name: "SetChartTypeRequestInput", root: reflect.TypeOf(SetChartTypeRequestInput{})},
		{name: "SetChartSettingsRequestInput", root: reflect.TypeOf(SetChartSettingsRequestInput{})},
		{name: "SetTextBlockDisplayModeRequestInput", root: reflect.TypeOf(SetTextBlockDisplayModeRequestInput{})},
		{name: "SetTextBlockFormatRequestInput", root: reflect.TypeOf(SetTextBlockFormatRequestInput{})},
		{name: "SetCodeFileBindingRequestInput", root: reflect.TypeOf(SetCodeFileBindingRequestInput{})},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, ok := overrides[tt.root]; ok {
				t.Fatalf("%s should not remain in the manual declaration override map", tt.name)
			}

			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want object", tt.name, declaration.Kind)
			}
		})
	}
}

func TestTypeConverterReflectsChatSupportContractsWithoutManualDeclarations(t *testing.T) {
	overrides := frontendBindingDeclarationOverrides()
	tests := []struct {
		name               string
		root               reflect.Type
		properties         []TypeProperty
		expectCreateHelper bool
	}{
		{
			name: "ChatFileAttachment",
			root: reflect.TypeOf(ChatFileAttachment{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "mimeType", TypeExpr: "string | null", Optional: true},
				{Name: "size", TypeExpr: "number | null", Optional: true},
			},
		},
		{
			name: "MessageTextContent",
			root: reflect.TypeOf(MessageTextContent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"text"`, Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
			expectCreateHelper: true,
		},
		{
			name: "MessageImageUrl",
			root: reflect.TypeOf(MessageImageURL{}),
			properties: []TypeProperty{
				{Name: "url", TypeExpr: "string", Optional: false},
				{Name: "detail", TypeExpr: `"auto" | "low" | "high" | null`, Optional: true},
			},
		},
		{
			name: "MessageImageUrlContent",
			root: reflect.TypeOf(MessageImageURLContent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"image_url"`, Optional: false},
				{Name: "image_url", TypeExpr: "MessageImageUrl", Optional: false},
			},
		},
		{
			name: "MessageThinkingContent",
			root: reflect.TypeOf(MessageThinkingContent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"thinking"`, Optional: false},
				{Name: "thinking", TypeExpr: "string", Optional: false},
				{Name: "summary", TypeExpr: "string | null", Optional: true},
				{Name: "signature", TypeExpr: "string | null", Optional: true},
			},
			expectCreateHelper: true,
		},
		{
			name: "ToolReferenceContent",
			root: reflect.TypeOf(ToolReferenceContent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"tool_reference"`, Optional: false},
				{Name: "tool_name", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "ToolCallFunction",
			root: reflect.TypeOf(ToolCallFunction{}),
			properties: []TypeProperty{
				{Name: "name", TypeExpr: "string", Optional: false},
				{Name: "arguments", TypeExpr: "{ [key: string]: JSONValue | undefined }", Optional: false},
			},
			expectCreateHelper: true,
		},
		{
			name: "ToolCall",
			root: reflect.TypeOf(ToolCall{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "type", TypeExpr: `"function"`, Optional: false},
				{Name: "function", TypeExpr: "ToolCallFunction", Optional: false},
			},
			expectCreateHelper: true,
		},
		{
			name: "SystemChatMessage",
			root: reflect.TypeOf(SystemChatMessage{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContent>", Optional: false},
				{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.system", Optional: false},
			},
			expectCreateHelper: true,
		},
		{
			name: "AssistantChatMessage",
			root: reflect.TypeOf(AssistantChatMessage{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContent>", Optional: false},
				{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.assistant", Optional: false},
				{Name: "tool_calls", TypeExpr: "Array<ToolCall> | null", Optional: true},
			},
			expectCreateHelper: true,
		},
		{
			name: "UserChatMessage",
			root: reflect.TypeOf(UserChatMessage{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContent>", Optional: false},
				{Name: "attachments", TypeExpr: "Array<ChatFileAttachment>", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.user", Optional: false},
			},
			expectCreateHelper: true,
		},
		{
			name: "ToolChatMessage",
			root: reflect.TypeOf(ToolChatMessage{}),
			properties: []TypeProperty{
				{Name: "id", TypeExpr: "string", Optional: false},
				{Name: "role", TypeExpr: "typeof ChatRoleEnum.tool", Optional: false},
				{Name: "tool_call_id", TypeExpr: "string", Optional: false},
				{Name: "tool_name", TypeExpr: "string | null", Optional: true},
				{Name: "arguments", TypeExpr: "JSONValue", Optional: false},
				{Name: "result", TypeExpr: "JSONValue", Optional: false},
				{Name: "content", TypeExpr: "Array<ToolReferenceContent | Record<string, unknown>>", Optional: false},
				{Name: "is_error", TypeExpr: "boolean", Optional: false},
				{Name: "started_at", TypeExpr: "string", Optional: false},
				{Name: "completed_at", TypeExpr: "string | null", Optional: true},
			},
			expectCreateHelper: true,
		},
		{
			name: "ChatSectionBranch",
			root: reflect.TypeOf(ChatSectionBranch{}),
			properties: []TypeProperty{
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "createdAt", TypeExpr: "number", Optional: false},
				{Name: "parentBranchId", TypeExpr: "string | null", Optional: true},
				{Name: "branchFromMessageId", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "ChatSectionState",
			root: reflect.TypeOf(ChatSectionState{}),
			properties: []TypeProperty{
				{Name: "messages", TypeExpr: "Array<BaseChatMessageUnion>", Optional: false},
				{Name: "inputText", TypeExpr: "string", Optional: false},
				{Name: "waitingForResponse", TypeExpr: "boolean", Optional: false},
				{Name: "toolCallArguments", TypeExpr: "Record<string, string>", Optional: false},
				{Name: "activeBranchId", TypeExpr: "string | null", Optional: true},
				{Name: "branches", TypeExpr: "Record<string, ChatSectionBranch>", Optional: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, ok := overrides[tt.root]; ok {
				t.Fatalf("%s should not remain in the manual declaration override map", tt.name)
			}

			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want object", tt.name, declaration.Kind)
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
			if tt.expectCreateHelper && declaration.CreateExpr == "" {
				t.Fatalf("%s should use a Go-backed create expr", tt.name)
			}
		})
	}
}

func TestTypeConverterReflectsStreamingContractsWithoutManualDeclarations(t *testing.T) {
	overrides := frontendBindingDeclarationOverrides()
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
		{
			name: "MessageTextDelta",
			root: reflect.TypeOf(MessageTextDelta{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"text_delta"`, Optional: false},
				{Name: "index", TypeExpr: "number", Optional: false},
				{Name: "text", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "MessageThinkingDelta",
			root: reflect.TypeOf(MessageThinkingDelta{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: `"thinking_delta"`, Optional: false},
				{Name: "index", TypeExpr: "number", Optional: false},
				{Name: "thinking", TypeExpr: "string", Optional: false},
				{Name: "summary", TypeExpr: "string | null", Optional: true},
				{Name: "signature", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "MessageStartEvent",
			root: reflect.TypeOf(MessageStartEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_START", Optional: false},
				{Name: "message", TypeExpr: "BaseChatMessageUnion", Optional: false},
			},
		},
		{
			name: "MessageDeltaEvent",
			root: reflect.TypeOf(MessageDeltaEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.DELTA", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
				{Name: "content", TypeExpr: "Array<MessageContentDelta> | null", Optional: true},
			},
		},
		{
			name: "ToolCallDeltaEvent",
			root: reflect.TypeOf(ToolCallDeltaEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_CALL_DELTA", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
				{Name: "tool_call_id", TypeExpr: "string", Optional: false},
				{Name: "arguments_delta", TypeExpr: "string", Optional: false},
				{Name: "tool_name", TypeExpr: "string | null", Optional: true},
			},
		},
		{
			name: "ToolResultEvent",
			root: reflect.TypeOf(ToolResultEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_RESULT", Optional: false},
				{Name: "result", TypeExpr: "ToolChatMessage", Optional: false},
			},
		},
		{
			name: "ToolArgumentPreviewDeltaEvent",
			root: reflect.TypeOf(ToolArgumentPreviewDeltaEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.TOOL_ARGUMENT_PREVIEW_DELTA", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
				{Name: "tool_call_id", TypeExpr: "string", Optional: false},
				{Name: "tool_name", TypeExpr: "string", Optional: false},
				{Name: "arguments_delta", TypeExpr: "string", Optional: false},
				{Name: "preview_kind", TypeExpr: "string", Optional: false},
				{Name: "target_ids_by_type", TypeExpr: "Record<string, Array<string>>", Optional: false},
				{Name: "preview_value_delta", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "MessageStopEvent",
			root: reflect.TypeOf(MessageStopEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_STOP", Optional: false},
				{Name: "message_id", TypeExpr: "string", Optional: false},
			},
		},
		{
			name: "MessageFinalizedEvent",
			root: reflect.TypeOf(MessageFinalizedEvent{}),
			properties: []TypeProperty{
				{Name: "type", TypeExpr: "typeof StreamingEventTypeEnum.MESSAGE_FINALIZED", Optional: false},
				{Name: "message", TypeExpr: "BaseChatMessageUnion", Optional: false},
			},
		},
		{
			name: "LLMStreamingResponse",
			root: reflect.TypeOf(LLMStreamingResponse{}),
			properties: []TypeProperty{
				{Name: "chatId", TypeExpr: "string", Optional: false},
				{Name: "chunk", TypeExpr: "LLMStreamingResponseChunk", Optional: false},
				{Name: "sectionId", TypeExpr: "string | null", Optional: true},
				{Name: "projectConfigId", TypeExpr: "string | null", Optional: true},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, ok := overrides[tt.root]; ok {
				t.Fatalf("%s should not remain in the manual declaration override map", tt.name)
			}

			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want object", tt.name, declaration.Kind)
			}
			if !reflect.DeepEqual(declaration.Properties, tt.properties) {
				t.Fatalf("%s properties = %#v, want %#v", tt.name, declaration.Properties, tt.properties)
			}
		})
	}
}

func TestTypeConverterReflectsRealtimeContractsWithoutManualDeclarations(t *testing.T) {
	overrides := frontendBindingDeclarationOverrides()
	tests := []struct {
		name string
		root reflect.Type
	}{
		{name: "GetLLMChatResponse", root: reflect.TypeOf(GetLLMChatResponse{})},
		{name: "ExternalAgentChatResponse", root: reflect.TypeOf(ExternalAgentChatResponse{})},
		{name: "UpdateArtifactMsgContent", root: reflect.TypeOf(UpdateArtifactMsgContent{})},
		{name: "UISettingRevealActivationStep", root: reflect.TypeOf(UISettingRevealActivationStep{})},
		{name: "UISettingRevealTarget", root: reflect.TypeOf(UISettingRevealTarget{})},
		{name: "UISettingRevealContent", root: reflect.TypeOf(UISettingRevealContent{})},
		{name: "UISettingRevealResultStatus", root: reflect.TypeOf(UISettingRevealResultStatus{})},
		{name: "UISettingRevealResultContent", root: reflect.TypeOf(UISettingRevealResultContent{})},
		{name: "WebsocketMsgRealtimeUIChangeContent", root: reflect.TypeOf(WebsocketMsgRealtimeUIChangeContent{})},
		{name: "WebsocketMsgRealtimeUIChange", root: reflect.TypeOf(WebsocketMsgRealtimeUIChange{})},
		{name: "WebsocketMsgRealtimeDependencyEventContent", root: reflect.TypeOf(WebsocketMsgRealtimeDependencyEventContent{})},
		{name: "WebsocketMsgRealtimeDependencyEvent", root: reflect.TypeOf(WebsocketMsgRealtimeDependencyEvent{})},
		{name: "WebsocketMsgUISettingRevealResult", root: reflect.TypeOf(WebsocketMsgUISettingRevealResult{})},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, ok := overrides[tt.root]; ok {
				t.Fatalf("%s should not remain in the manual declaration override map", tt.name)
			}

			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want object", tt.name, declaration.Kind)
			}
		})
	}
}

func TestTypeConverterReflectsPluginRuntimeContractsWithoutManualDeclarations(t *testing.T) {
	overrides := frontendBindingDeclarationOverrides()
	tests := []struct {
		name string
		root reflect.Type
	}{
		{name: "PluginListEntry", root: reflect.TypeOf(PluginListEntry{})},
		{name: "PluginStatusEntry", root: reflect.TypeOf(PluginStatusEntry{})},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, ok := overrides[tt.root]; ok {
				t.Fatalf("%s should not remain in the manual declaration override map", tt.name)
			}

			converter := newTypeConverter()
			if err := converter.AddRootType(tt.root); err != nil {
				t.Fatalf("AddRootType(%s) error = %v", tt.root.String(), err)
			}

			declaration := requireDeclaration(t, converter.Declarations(), tt.name)
			if declaration.Kind != "object" {
				t.Fatalf("%s declaration kind = %q, want object", tt.name, declaration.Kind)
			}
		})
	}
}
