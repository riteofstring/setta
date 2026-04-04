package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/projectview"
)

func TestTypeConverterReflectsSelectedContractsWithoutManualDeclarations(t *testing.T) {
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
			if (tt.name == "BrowserSavedSearch" || tt.name == "ProjectRunCapabilities" || tt.name == "ProjectConfig") && declaration.CreateExpr == "" {
				t.Fatalf("%s should use a Go-backed create expr", tt.name)
			}
		})
	}
}
