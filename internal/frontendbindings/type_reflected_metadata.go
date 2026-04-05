package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/artifacts"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/transcriptionprofiles"
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
	reflect.TypeOf(artifacts.ChartDataValue{}): aliasDeclaration(
		"ChartDataValue",
		"Record<string, Array<string | number>>",
	),
}

var artifactReflectedObjectDeclarationSpecs = map[reflect.Type]reflectedObjectDeclarationSpec{
	reflect.TypeOf(artifacts.BrushStroke{}): {
		PropertyTypeExprOverrides: map[string]string{
			"points": `Array<CanvasPoint | "BREAK">`,
		},
	},
	reflect.TypeOf(artifacts.BrushStrokeWithTransform{}): {
		PropertyTypeExprOverrides: map[string]string{
			"points": `Array<CanvasPoint | "BREAK">`,
		},
	},
	reflect.TypeOf(projectstate.DrawAreaLayerItem{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke",
		},
	},
	reflect.TypeOf(artifacts.DrawAreaLayer{}): {
		CreateExprOverrides: map[string]string{
			"name": "createRandomName()",
		},
	},
	reflect.TypeOf(artifacts.ImageArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createPngArtifactId()",
			"value": "createContentRef()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.Image",
		},
	},
	reflect.TypeOf(artifacts.BrushStrokeArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createJsonArtifactId()",
			"value": "createBrushStroke()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.BrushStroke",
		},
	},
	reflect.TypeOf(artifacts.DrawAreaLayerItemTransformArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createJsonArtifactId()",
			"value": "createDrawAreaLayerItemTransform()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.DrawAreaLayerItemTransform",
		},
	},
	reflect.TypeOf(artifacts.ChartDataArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id": "createCsvArtifactId()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ArtifactTypeEnum.ChartData",
		},
	},
	reflect.TypeOf(artifacts.FileArtifact{}): {
		CreateExprOverrides: map[string]string{
			"id":    "createFileArtifactId()",
			"value": "createContentRef()",
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
	reflect.TypeOf(realtime.ListenerCoverageSnapshot{}): {
		PropertyTypeExprOverrides: map[string]string{
			"dependencies": "Array<BaseDependencyKeyUnion>",
		},
	},
	reflect.TypeOf(agentruns.EngineRuntimeSupport{}): {
		DefaultValue:  agentruns.EngineRuntimeSupport{},
		HasCreateExpr: true,
	},
	reflect.TypeOf(agentruns.EngineConfig{}): {
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
	reflect.TypeOf(agentprofiles.Profile{}): {
		PropertyOptionalOverrides: map[string]bool{
			"engineConfigId": true,
			"memoryScope":    true,
		},
	},
	reflect.TypeOf(transcriptionprofiles.Profile{}): {
		PropertyOptionalOverrides: map[string]bool{
			"language": true,
		},
	},
	reflect.TypeOf(agentruns.Run{}): {
		PropertyTypeExprOverrides: map[string]string{
			"inputs":  "Record<string, unknown> | null",
			"outputs": "Record<string, unknown> | null",
		},
	},
	reflect.TypeOf(httpapi.RunCodeRequest{}): {
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
	reflect.TypeOf(settingsstate.FrontendSettingsGUI{}): {
		PropertyTypeExprOverrides: map[string]string{
			"snapGrid":               "[number, number]",
			"sectionTagColorChoices": "Array<ColorPickerChoice>",
		},
	},
	reflect.TypeOf(settingsstate.FrontendSettingsBackend{}): {
		CreateExprOverrides: map[string]string{
			"defaultTerminalShell": "null",
		},
	},
	reflect.TypeOf(projectstate.FrontendMetaControlSizingPolicyByType{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(projectstate.FrontendSectionSizingPolicyByType{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(projectstate.FrontendSectionSizingPolicy{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
	},
	reflect.TypeOf(settingsstate.FrontendSettingsState{}): {
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
	reflect.TypeOf(deployments.Policy{}): {
		DefaultValue:  deployments.DefaultPolicy(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(projectstate.StateMachineGateUIState{}): {
		PropertyOptionalOverrides: map[string]bool{
			"showDetails": true,
		},
	},
	reflect.TypeOf(projectstate.StateMachineSourceFilter{}): {
		PropertyOptionalOverrides: map[string]bool{
			"type": true,
		},
	},
	reflect.TypeOf(projectstate.StateMachineSourceActivationCountCondition{}): {
		PropertyOptionalOverrides: map[string]bool{
			"operator": true,
		},
	},
	reflect.TypeOf(projectstate.StateMachineTargetAction{}): {
		PropertyOptionalOverrides: map[string]bool{
			"type":           true,
			"threadStrategy": true,
		},
	},
	reflect.TypeOf(projectstate.StateMachineEdge{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style": "Record<string, unknown> | null",
		},
	},
	reflect.TypeOf(projectstate.AgenticEdge{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style": "Record<string, unknown>",
		},
	},
	reflect.TypeOf(projectstate.SectionSize{}): {
		CreateExprOverrides: map[string]string{
			"width":  "SectionSizeModeEnum.auto",
			"height": "SectionSizeModeEnum.auto",
		},
	},
	reflect.TypeOf(projectstate.TopLevelSectionLayout{}): {
		CreateExprOverrides: map[string]string{
			"zIndex": "0",
			"w":      "null",
			"h":      "null",
		},
	},
	reflect.TypeOf(projectstate.ViewMode{}): {
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
	reflect.TypeOf(projectview.Core{}): {
		PropertyTypeExprOverrides: map[string]string{
			"sharedModifier": "Record<string, unknown>",
		},
	},
	reflect.TypeOf(projectview.Variant{}): {
		PropertyTypeExprOverrides: map[string]string{
			"modifier": "Record<string, unknown>",
		},
	},
	reflect.TypeOf(projectstate.ChatWindowBounds{}): {
		DefaultValue:  projectstate.DefaultChatWindowBounds(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(projectstate.ChatWindowDockMetrics{}): {
		CreateExprOverrides: map[string]string{
			"widthFraction":    "null",
			"preferredWidthPx": "null",
		},
	},
	reflect.TypeOf(projectstate.ProjectChatWindowInstance{}): {
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
	reflect.TypeOf(projectstate.ProjectChatWindowingState{}): {
		DefaultValue:  projectstate.DefaultProjectChatWindowingState(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(projectstate.NormalizedFloatingWindowBounds{}): {
		DefaultValue:  projectstate.DefaultNormalizedFloatingWindowBounds(),
		HasCreateExpr: true,
	},
	reflect.TypeOf(projectstate.WindowSpaceWindow{}): {
		CreateExprOverrides: map[string]string{
			"sectionIdOrNull":        "null",
			"title":                  "null",
			"chatId":                 "null",
			"embeddedGitPaneVisible": "false",
			"zIndex":                 "0",
			"normalizedBounds":       "createNormalizedFloatingWindowBounds()",
		},
	},
	reflect.TypeOf(projectstate.WindowSpaceConfig{}): {
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
	reflect.TypeOf(projectstate.Edge{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style": "Record<string, unknown>",
			"data":  "Record<string, unknown>",
		},
	},
	reflect.TypeOf(projectstate.ClipboardProjectStateCore{}): {
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
	reflect.TypeOf(projectstate.ClipboardProjectStateCoreWithSectionVariantMap{}): {
		CreateExprOverrides: map[string]string{
			"core": "createClipboardProjectStateCore()",
		},
		PropertyOptionalOverrides: map[string]bool{
			"sectionVariantMap": false,
		},
	},
	reflect.TypeOf(projectstate.SectionsClipboardData{}): {
		CreateExprOverrides: map[string]string{
			"type": "ClipboardDataTypeEnum.Sections",
			"data": "createClipboardProjectStateCoreWithSectionVariantMap()",
		},
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ClipboardDataTypeEnum.Sections",
		},
	},
	reflect.TypeOf(projectview.SectionCodegenPolicy{}): {
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
	reflect.TypeOf(projectview.CodeObjValuePolicy{}): {
		DefaultValue:         projectview.FrontendDefaultPythonCodeObjValuePolicy(),
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"typePolicies":     "Record<CodeObjType, CodeObjTypeValuePolicy>",
			"codeObjOverrides": "Record<string, CodeObjValueOverride>",
		},
	},
	reflect.TypeOf(projectview.ProjectCodegenPythonTarget{}): {
		HasCreateExpr:        true,
		UseGenericCreateBody: true,
		PropertyTypeExprOverrides: map[string]string{
			"language":           "typeof ProjectCodegenLanguageEnum.python",
			"sectionPolicy":      "SectionCodegenPolicy",
			"codeObjValuePolicy": "CodeObjValuePolicy",
		},
	},
	reflect.TypeOf(projectstate.BrowserSavedSearch{}): {
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
	reflect.TypeOf(projectstate.WatchCodeRegistryEntry{}): {
		PropertyTypeExprOverrides: map[string]string{
			"kind": "string",
		},
	},
	reflect.TypeOf(projectstate.FrontendCodeFileBinding{}): {
		PropertyTypeExprOverrides: map[string]string{
			"access_mode": "CodeFileAccessMode",
		},
	},
	reflect.TypeOf(projectstate.TaskBoardTask{}): {
		PropertyTypeExprOverrides: map[string]string{
			"recurrence":       "TaskBoardTaskRecurrence",
			"recurrenceDays":   "Array<TaskBoardRecurringWeekday>",
			"recurrenceMonths": "Array<TaskBoardRecurringMonth>",
		},
		PropertyOptionalOverrides: map[string]bool{
			"columnId": true,
		},
	},
	reflect.TypeOf(projectstate.CodeSectionDiagnosticsIgnoreState{}): {
		PropertyTypeExprOverrides: map[string]string{
			"suppressedCodes": "Array<string | number>",
		},
	},
	reflect.TypeOf(httpapi.CreateEdgeRequest{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type":     "string",
			"style":    "Record<string, unknown> | null",
			"animated": "boolean",
			"hidden":   "boolean",
			"zIndex":   "number",
			"data":     "Record<string, unknown> | null",
		},
	},
	reflect.TypeOf(httpapi.CreateStateMachineEdgeRequest{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style":    "Record<string, unknown> | null",
			"hidden":   "boolean",
			"zIndex":   "number",
			"selected": "boolean",
		},
	},
	reflect.TypeOf(httpapi.CreateAgenticEdgeRequest{}): {
		PropertyTypeExprOverrides: map[string]string{
			"style":  "Record<string, unknown> | null",
			"hidden": "boolean",
			"zIndex": "number",
		},
	},
	reflect.TypeOf(httpapi.MoveSectionsRequest{}): {
		PropertyTypeExprOverrides: map[string]string{
			"positionsById": "Record<string, Position> | null",
		},
	},
	reflect.TypeOf(httpapi.UpdateArtifactsRequest{}): {
		PropertyTypeExprOverrides: map[string]string{
			"artifacts": "Array<ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact>",
		},
	},
	reflect.TypeOf(realtime.UpdateArtifactsContent{}): {
		PropertyTypeExprOverrides: map[string]string{
			"artifacts":  "Array<ImageArtifact | BrushStrokeArtifact | DrawAreaLayerItemTransformArtifact | ChartDataArtifact | FileArtifact>",
			"updateType": `"update" | "delete"`,
		},
	},
	reflect.TypeOf(realtime.UISettingRevealTarget{}): {
		PropertyOptionalOverrides: map[string]bool{
			"revealActivationSteps": false,
		},
	},
	reflect.TypeOf(realtime.UISettingRevealResultStatus{}): {
		PropertyTypeExprOverrides: map[string]string{
			"status": `"revealed" | "failed"`,
		},
		PropertyOptionalOverrides: map[string]bool{
			"errorCode":    true,
			"errorMessage": true,
		},
	},
	reflect.TypeOf(projectstate.LineChartSettings{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ChartTypeEnum.line",
		},
	},
	reflect.TypeOf(projectstate.ScatterChartSettings{}): {
		PropertyTypeExprOverrides: map[string]string{
			"type": "typeof ChartTypeEnum.scatter",
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
	if t == reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}) {
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
