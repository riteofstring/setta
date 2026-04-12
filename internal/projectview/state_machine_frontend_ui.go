package projectview

import "setta/internal/projectstate"

// Keep state-machine editor option ordering, defaults, labels, and connection
// eligibility metadata Go-owned so the frontend does not hand-maintain
// workflow validation rules.
var (
	frontendStateMachineGateTypeOptions = []StateMachineGateTypeOption{
		{Value: projectstate.StateMachineGateTypeAND, Label: "AND"},
		{Value: projectstate.StateMachineGateTypeOR, Label: "OR"},
		{Value: projectstate.StateMachineGateTypeXOR, Label: "XOR"},
	}
	frontendStateMachinePromptSourceOptions = []StateMachinePromptSourceOption{
		{Value: projectstate.StateMachinePromptSourceTypeInline, Label: "Inline Prompt"},
		{Value: projectstate.StateMachinePromptSourceTypePromptTemplate, Label: "Prompt Template"},
		{Value: projectstate.StateMachinePromptSourceTypePromptSection, Label: "Prompt Section"},
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

type StateMachinePromptSourceOption struct {
	Value projectstate.StateMachinePromptSourceType `json:"value"`
	Label string                                    `json:"label"`
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

type StateMachinePromptSourceTypesValue struct {
	Inline         projectstate.StateMachinePromptSourceType `json:"inline"`
	PromptTemplate projectstate.StateMachinePromptSourceType `json:"promptTemplate"`
	PromptSection  projectstate.StateMachinePromptSourceType `json:"promptSection"`
}

type StateMachineUIConfigValue struct {
	DefaultGateType                   projectstate.StateMachineGateType         `json:"defaultGateType"`
	DefaultPromptSourceType           projectstate.StateMachinePromptSourceType `json:"defaultPromptSourceType"`
	DefaultSourceFilterType           projectstate.StateMachineSourceFilterType `json:"defaultSourceFilterType"`
	DefaultTargetActionType           projectstate.StateMachineTargetActionType `json:"defaultTargetActionType"`
	DefaultThreadStrategy             projectstate.StateMachineThreadStrategy   `json:"defaultThreadStrategy"`
	DefaultSourceActivationCountOp    projectstate.StateMachineCountOperator    `json:"defaultSourceActivationCountOperator"`
	ConnectionSourceTypes             []projectstate.FrontendSectionType        `json:"connectionSourceTypes"`
	ConnectionTargetTypes             []projectstate.FrontendSectionType        `json:"connectionTargetTypes"`
	SelfLoopSectionTypes              []projectstate.FrontendSectionType        `json:"selfLoopSectionTypes"`
	GateTypeOptions                   []StateMachineGateTypeOption              `json:"gateTypeOptions"`
	PromptSourceTypes                 StateMachinePromptSourceTypesValue        `json:"promptSourceTypes"`
	PromptSourceOptions               []StateMachinePromptSourceOption          `json:"promptSourceOptions"`
	SourceFilterOptions               []StateMachineSourceFilterTypeOption      `json:"sourceFilterOptions"`
	TargetActionOptions               []StateMachineTargetActionTypeOption      `json:"targetActionOptions"`
	ThreadStrategyOptions             []StateMachineThreadStrategyOption        `json:"threadStrategyOptions"`
	SourceActivationCountOperatorOpts []StateMachineCountOperatorOption         `json:"sourceActivationCountOperatorOptions"`
	PermissionModeOptions             []StateMachinePermissionModeOption        `json:"permissionModeOptions"`
}

func FrontendValueStateMachineUIConfig() StateMachineUIConfigValue {
	return StateMachineUIConfigValue{
		DefaultGateType:                projectstate.StateMachineGateTypeAND,
		DefaultPromptSourceType:        projectstate.StateMachinePromptSourceTypeInline,
		DefaultSourceFilterType:        projectstate.StateMachineSourceFilterTypeRunCompleted,
		DefaultTargetActionType:        projectstate.StateMachineTargetActionTypeResetThread,
		DefaultThreadStrategy:          projectstate.StateMachineThreadStrategyContinueCurrentThread,
		DefaultSourceActivationCountOp: projectstate.StateMachineCountOperatorEQ,
		ConnectionSourceTypes:          projectstate.FrontendStateMachineConnectionSourceTypes(),
		ConnectionTargetTypes:          projectstate.FrontendStateMachineConnectionTargetTypes(),
		SelfLoopSectionTypes:           projectstate.FrontendStateMachineSelfLoopSectionTypes(),
		GateTypeOptions: append(
			[]StateMachineGateTypeOption(nil),
			frontendStateMachineGateTypeOptions...,
		),
		PromptSourceTypes: StateMachinePromptSourceTypesValue{
			Inline:         projectstate.StateMachinePromptSourceTypeInline,
			PromptTemplate: projectstate.StateMachinePromptSourceTypePromptTemplate,
			PromptSection:  projectstate.StateMachinePromptSourceTypePromptSection,
		},
		PromptSourceOptions: append(
			[]StateMachinePromptSourceOption(nil),
			frontendStateMachinePromptSourceOptions...,
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
