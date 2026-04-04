package frontendbindings

import (
	"reflect"
	"testing"
)

func TestTypeConverterReflectsSelectedContractsWithoutManualDeclarations(t *testing.T) {
	tests := []struct {
		name       string
		root       reflect.Type
		properties []TypeProperty
	}{
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
		})
	}
}
