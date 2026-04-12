package projectview

import "setta/internal/projectstate"

// Keep state-machine editor option ordering, defaults, and labels Go-owned so
// the frontend does not hand-maintain workflow enum metadata.
var (
	frontendStateMachineGateTypeOptions = []StateMachineGateTypeOption{
		{Value: projectstate.StateMachineGateTypeAND, Label: "AND"},
		{Value: projectstate.StateMachineGateTypeOR, Label: "OR"},
		{Value: projectstate.StateMachineGateTypeXOR, Label: "XOR"},
	}
	frontendStateMachineSourceFilterOptions = []StateMachineSourceFilterTypeOption{
		{Value: projectstate.StateMachineSourceFilterTypeRunCompleted, Label: "Run Completed"},
		{Value: projectstate.StateMachineSourceFilterTypeRunFailed, Label: "Run Failed"},
		{Value: projectstate.StateMachineSourceFilterTypeSignal, Label: "Structured Signal"},
	}
	frontendStateMachineTargetActionOptions = []StateMachineTargetActionTypeOption{
		{Value: projectstate.StateMachineTargetActionTypeResetThread, Label: "Reset Thread"},
		{Value: projectstate.StateMachineTargetActionTypeSendPrompt, Label: "Send Prompt"},
	}
	frontendStateMachineThreadStrategyOptions = []StateMachineThreadStrategyOption{
		{
			Value: projectstate.StateMachineThreadStrategyContinueCurrentThread,
			Label: "Continue Current Thread",
		},
		{
			Value: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
			Label: "New Thread Before Send",
		},
	}
	frontendStateMachineCountOperatorOptions = []StateMachineCountOperatorOption{
		{Value: projectstate.StateMachineCountOperatorLT, Label: "<"},
		{Value: projectstate.StateMachineCountOperatorLTE, Label: "<="},
		{Value: projectstate.StateMachineCountOperatorEQ, Label: "="},
		{Value: projectstate.StateMachineCountOperatorGTE, Label: ">="},
		{Value: projectstate.StateMachineCountOperatorGT, Label: ">"},
	}
	frontendStateMachinePermissionModeOptions = []StateMachinePermissionModeOption{
		{Value: projectstate.ChatPermissionModeMinimal, Label: "Minimal"},
		{Value: projectstate.ChatPermissionModeYOLO, Label: "Yolo"},
		{Value: projectstate.ChatPermissionModeConfigTomlCustom, Label: "Config TOML Custom"},
	}
)

type StateMachineGateTypeOption struct {
	Value projectstate.StateMachineGateType `json:"value"`
	Label string                            `json:"label"`
}

type StateMachineSourceFilterTypeOption struct {
	Value projectstate.StateMachineSourceFilterType `json:"value"`
	Label string                                    `json:"label"`
}

type StateMachineTargetActionTypeOption struct {
	Value projectstate.StateMachineTargetActionType `json:"value"`
	Label string                                    `json:"label"`
}

type StateMachineThreadStrategyOption struct {
	Value projectstate.StateMachineThreadStrategy `json:"value"`
	Label string                                  `json:"label"`
}

type StateMachineCountOperatorOption struct {
	Value projectstate.StateMachineCountOperator `json:"value"`
	Label string                                 `json:"label"`
}

type StateMachinePermissionModeOption struct {
	Value projectstate.ChatPermissionMode `json:"value"`
	Label string                          `json:"label"`
}

type StateMachineUIConfigValue struct {
	DefaultGateType                   projectstate.StateMachineGateType         `json:"defaultGateType"`
	DefaultSourceFilterType           projectstate.StateMachineSourceFilterType `json:"defaultSourceFilterType"`
	DefaultTargetActionType           projectstate.StateMachineTargetActionType `json:"defaultTargetActionType"`
	DefaultThreadStrategy             projectstate.StateMachineThreadStrategy   `json:"defaultThreadStrategy"`
	DefaultSourceActivationCountOp    projectstate.StateMachineCountOperator    `json:"defaultSourceActivationCountOperator"`
	GateTypeOptions                   []StateMachineGateTypeOption              `json:"gateTypeOptions"`
	SourceFilterOptions               []StateMachineSourceFilterTypeOption      `json:"sourceFilterOptions"`
	TargetActionOptions               []StateMachineTargetActionTypeOption      `json:"targetActionOptions"`
	ThreadStrategyOptions             []StateMachineThreadStrategyOption        `json:"threadStrategyOptions"`
	SourceActivationCountOperatorOpts []StateMachineCountOperatorOption         `json:"sourceActivationCountOperatorOptions"`
	PermissionModeOptions             []StateMachinePermissionModeOption        `json:"permissionModeOptions"`
}

func FrontendValueStateMachineUIConfig() StateMachineUIConfigValue {
	return StateMachineUIConfigValue{
		DefaultGateType:                projectstate.StateMachineGateTypeAND,
		DefaultSourceFilterType:        projectstate.StateMachineSourceFilterTypeRunCompleted,
		DefaultTargetActionType:        projectstate.StateMachineTargetActionTypeResetThread,
		DefaultThreadStrategy:          projectstate.StateMachineThreadStrategyContinueCurrentThread,
		DefaultSourceActivationCountOp: projectstate.StateMachineCountOperatorEQ,
		GateTypeOptions: append(
			[]StateMachineGateTypeOption(nil),
			frontendStateMachineGateTypeOptions...,
		),
		SourceFilterOptions: append(
			[]StateMachineSourceFilterTypeOption(nil),
			frontendStateMachineSourceFilterOptions...,
		),
		TargetActionOptions: append(
			[]StateMachineTargetActionTypeOption(nil),
			frontendStateMachineTargetActionOptions...,
		),
		ThreadStrategyOptions: append(
			[]StateMachineThreadStrategyOption(nil),
			frontendStateMachineThreadStrategyOptions...,
		),
		SourceActivationCountOperatorOpts: append(
			[]StateMachineCountOperatorOption(nil),
			frontendStateMachineCountOperatorOptions...,
		),
		PermissionModeOptions: append(
			[]StateMachinePermissionModeOption(nil),
			frontendStateMachinePermissionModeOptions...,
		),
	}
}
