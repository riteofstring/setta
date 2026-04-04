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
			if (tt.name == "BrowserSavedSearch" ||
				tt.name == "ProjectRunCapabilities" ||
				tt.name == "ProjectConfig" ||
				tt.name == "SectionCapabilities" ||
				tt.name == "ProjectStateSingleConfig" ||
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
