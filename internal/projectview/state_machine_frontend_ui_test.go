package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueStateMachineUIConfigUsesGoOwnedWorkflowMetadata(t *testing.T) {
	config := FrontendValueStateMachineUIConfig()

	if got, want := config.DefaultGateType, projectstate.StateMachineGateTypeAND; got != want {
		t.Fatalf("unexpected default gate type: %q", got)
	}
	if got, want := config.DefaultPromptSourceType, projectstate.StateMachinePromptSourceTypeInline; got != want {
		t.Fatalf("unexpected default prompt source type: %q", got)
	}
	if got, want := config.DefaultSourceFilterType, projectstate.StateMachineSourceFilterTypeRunCompleted; got != want {
		t.Fatalf("unexpected default source filter type: %q", got)
	}
	if got, want := config.DefaultTargetActionType, projectstate.StateMachineTargetActionTypeResetThread; got != want {
		t.Fatalf("unexpected default target action type: %q", got)
	}
	if got, want := config.DefaultThreadStrategy, projectstate.StateMachineThreadStrategyContinueCurrentThread; got != want {
		t.Fatalf("unexpected default thread strategy: %q", got)
	}
	if got, want := config.DefaultSourceActivationCountOp, projectstate.StateMachineCountOperatorEQ; got != want {
		t.Fatalf("unexpected default source activation operator: %q", got)
	}

	if got, want := config.GateTypeOptions, []StateMachineGateTypeOption{
		{Value: projectstate.StateMachineGateTypeAND, Label: "AND"},
		{Value: projectstate.StateMachineGateTypeOR, Label: "OR"},
		{Value: projectstate.StateMachineGateTypeXOR, Label: "XOR"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected gate type options: %#v", got)
	}

	if got, want := config.PromptSourceTypes, (StateMachinePromptSourceTypesValue{
		Inline:         projectstate.StateMachinePromptSourceTypeInline,
		PromptTemplate: projectstate.StateMachinePromptSourceTypePromptTemplate,
		PromptSection:  projectstate.StateMachinePromptSourceTypePromptSection,
	}); !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected prompt source types: %#v", got)
	}

	if got, want := config.PromptSourceOptions, []StateMachinePromptSourceOption{
		{Value: projectstate.StateMachinePromptSourceTypeInline, Label: "Inline Prompt"},
		{Value: projectstate.StateMachinePromptSourceTypePromptTemplate, Label: "Prompt Template"},
		{Value: projectstate.StateMachinePromptSourceTypePromptSection, Label: "Prompt Section"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected prompt source options: %#v", got)
	}

	if got, want := config.SourceFilterOptions, []StateMachineSourceFilterTypeOption{
		{Value: projectstate.StateMachineSourceFilterTypeRunCompleted, Label: "Run Completed"},
		{Value: projectstate.StateMachineSourceFilterTypeRunFailed, Label: "Run Failed"},
		{Value: projectstate.StateMachineSourceFilterTypeSignal, Label: "Structured Signal"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected source filter options: %#v", got)
	}

	if got, want := config.TargetActionOptions, []StateMachineTargetActionTypeOption{
		{Value: projectstate.StateMachineTargetActionTypeResetThread, Label: "Reset Thread"},
		{Value: projectstate.StateMachineTargetActionTypeSendPrompt, Label: "Send Prompt"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected target action options: %#v", got)
	}

	if got, want := config.ThreadStrategyOptions, []StateMachineThreadStrategyOption{
		{
			Value: projectstate.StateMachineThreadStrategyContinueCurrentThread,
			Label: "Continue Current Thread",
		},
		{
			Value: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
			Label: "New Thread Before Send",
		},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected thread strategy options: %#v", got)
	}

	if got, want := config.SourceActivationCountOperatorOpts, []StateMachineCountOperatorOption{
		{Value: projectstate.StateMachineCountOperatorLT, Label: "<"},
		{Value: projectstate.StateMachineCountOperatorLTE, Label: "<="},
		{Value: projectstate.StateMachineCountOperatorEQ, Label: "="},
		{Value: projectstate.StateMachineCountOperatorGTE, Label: ">="},
		{Value: projectstate.StateMachineCountOperatorGT, Label: ">"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected count operator options: %#v", got)
	}

	if got, want := config.PermissionModeOptions, []StateMachinePermissionModeOption{
		{Value: projectstate.ChatPermissionModeMinimal, Label: "Minimal"},
		{Value: projectstate.ChatPermissionModeYOLO, Label: "Yolo"},
		{Value: projectstate.ChatPermissionModeConfigTomlCustom, Label: "Config TOML Custom"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected permission mode options: %#v", got)
	}
}
