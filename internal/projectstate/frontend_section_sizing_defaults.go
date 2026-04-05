package projectstate

type FrontendSectionSizingPolicyTypeEntry struct {
	MinHeight float64 `json:"minHeight"`
	MaxHeight float64 `json:"maxHeight"`
	MinWidth  float64 `json:"minWidth"`
	MaxWidth  float64 `json:"maxWidth"`
}

type FrontendSectionSizingPolicyCallableTypeEntry struct {
	FrontendSectionSizingPolicyTypeEntry
	HideSearchMinHeight float64 `json:"hideSearchMinHeight"`
	HideParamsMinHeight float64 `json:"hideParamsMinHeight"`
}

type FrontendMetaControlSizingPolicyTypeEntry struct {
	MinHeight      float64             `json:"minHeight"`
	MinWidth       float64             `json:"minWidth"`
	SizeModeHeight MetaControlSizeMode `json:"sizeModeHeight"`
	SizeModeWidth  MetaControlSizeMode `json:"sizeModeWidth"`
}

type FrontendMetaControlSizingPolicyByType struct {
	CodeCallable     FrontendMetaControlSizingPolicyTypeEntry `json:"CodeCallable"`
	CodeParam        FrontendMetaControlSizingPolicyTypeEntry `json:"CodeParam"`
	TextParam        FrontendMetaControlSizingPolicyTypeEntry `json:"TextParam"`
	DateParam        FrontendMetaControlSizingPolicyTypeEntry `json:"DateParam"`
	TimeParam        FrontendMetaControlSizingPolicyTypeEntry `json:"TimeParam"`
	ButtonParam      FrontendMetaControlSizingPolicyTypeEntry `json:"ButtonParam"`
	SliderParam      FrontendMetaControlSizingPolicyTypeEntry `json:"SliderParam"`
	RotaryParam      FrontendMetaControlSizingPolicyTypeEntry `json:"RotaryParam"`
	SwitchParam      FrontendMetaControlSizingPolicyTypeEntry `json:"SwitchParam"`
	ColorPickerParam FrontendMetaControlSizingPolicyTypeEntry `json:"ColorPickerParam"`
	DropdownParam    FrontendMetaControlSizingPolicyTypeEntry `json:"DropdownParam"`
	PasswordParam    FrontendMetaControlSizingPolicyTypeEntry `json:"PasswordParam"`
	TextAreaParam    FrontendMetaControlSizingPolicyTypeEntry `json:"TextAreaParam"`
	DropzoneParam    FrontendMetaControlSizingPolicyTypeEntry `json:"DropzoneParam"`
	NestedParam      FrontendMetaControlSizingPolicyTypeEntry `json:"NestedParam"`
}

type FrontendSectionSizingPolicyGlobals struct {
	PinnedParamsAreaMinHeight   float64 `json:"pinnedParamsAreaMinHeight"`
	UnpinnedParamsAreaMinHeight float64 `json:"unpinnedParamsAreaMinHeight"`
	MinimizedHeight             float64 `json:"minimizedHeight"`
	InfiniteMaxHeight           float64 `json:"infiniteMaxHeight"`
	InfiniteMaxWidth            float64 `json:"infiniteMaxWidth"`
	AutoMaxHeight               float64 `json:"autoMaxHeight"`
}

type FrontendSectionSizingPolicyByType struct {
	Callable          FrontendSectionSizingPolicyCallableTypeEntry `json:"Callable"`
	Dict              FrontendSectionSizingPolicyTypeEntry         `json:"Dict"`
	ListRoot          FrontendSectionSizingPolicyTypeEntry         `json:"ListRoot"`
	Group             FrontendSectionSizingPolicyTypeEntry         `json:"Group"`
	StateMachineStart FrontendSectionSizingPolicyTypeEntry         `json:"StateMachineStart"`
	StateMachineGate  FrontendSectionSizingPolicyTypeEntry         `json:"StateMachineGate"`
	StateMachineEnd   FrontendSectionSizingPolicyTypeEntry         `json:"StateMachineEnd"`
	Image             FrontendSectionSizingPolicyTypeEntry         `json:"Image"`
	Chart             FrontendSectionSizingPolicyTypeEntry         `json:"Chart"`
	Draw              FrontendSectionSizingPolicyTypeEntry         `json:"Draw"`
	Prompt            FrontendSectionSizingPolicyTypeEntry         `json:"Prompt"`
	TextBlock         FrontendSectionSizingPolicyTypeEntry         `json:"TextBlock"`
	MetaControl       FrontendSectionSizingPolicyTypeEntry         `json:"MetaControl"`
	Social            FrontendSectionSizingPolicyTypeEntry         `json:"Social"`
	GlobalVariables   FrontendSectionSizingPolicyTypeEntry         `json:"GlobalVariables"`
	Code              FrontendSectionSizingPolicyTypeEntry         `json:"Code"`
	GenPythonCode     FrontendSectionSizingPolicyTypeEntry         `json:"GenPythonCode"`
	GenPythonMetadata FrontendSectionSizingPolicyTypeEntry         `json:"GenPythonMetadata"`
	Terminal          FrontendSectionSizingPolicyTypeEntry         `json:"Terminal"`
	IFrame            FrontendSectionSizingPolicyTypeEntry         `json:"IFrame"`
	Chat              FrontendSectionSizingPolicyTypeEntry         `json:"Chat"`
	Browser           FrontendSectionSizingPolicyTypeEntry         `json:"Browser"`
	Plugin            FrontendSectionSizingPolicyTypeEntry         `json:"Plugin"`
	TaskBoard         FrontendSectionSizingPolicyTypeEntry         `json:"TaskBoard"`
	Spreadsheet       FrontendSectionSizingPolicyTypeEntry         `json:"Spreadsheet"`
}

type FrontendSectionSizingPolicy struct {
	ByType            FrontendSectionSizingPolicyByType     `json:"byType"`
	MetaControlByType FrontendMetaControlSizingPolicyByType `json:"metaControlByType"`
	Globals           FrontendSectionSizingPolicyGlobals    `json:"globals"`
}

func FrontendDefaultMetaControlSizingPolicyByType() FrontendMetaControlSizingPolicyByType {
	return FrontendMetaControlSizingPolicyByType{
		ButtonParam:      frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		CodeCallable:     frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		CodeParam:        frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		ColorPickerParam: frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		DateParam:        frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		DropdownParam:    frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAutoOnly, MetaControlSizeModeAny),
		DropzoneParam:    frontendDefaultMetaControlSizingPolicyTypeEntry(120, 240, MetaControlSizeModeAny, MetaControlSizeModeAny),
		NestedParam:      frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		PasswordParam:    frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAutoOnly, MetaControlSizeModeAny),
		RotaryParam:      frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		SliderParam:      frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAutoOnly, MetaControlSizeModeAny),
		SwitchParam:      frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		TextAreaParam:    frontendDefaultMetaControlSizingPolicyTypeEntry(80, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		TextParam:        frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
		TimeParam:        frontendDefaultMetaControlSizingPolicyTypeEntry(32, 200, MetaControlSizeModeAny, MetaControlSizeModeAny),
	}
}

func FrontendDefaultSectionSizingPolicyGlobals() FrontendSectionSizingPolicyGlobals {
	return FrontendSectionSizingPolicyGlobals{
		PinnedParamsAreaMinHeight:   64,
		UnpinnedParamsAreaMinHeight: 36,
		MinimizedHeight:             32,
		InfiniteMaxHeight:           100000,
		InfiniteMaxWidth:            100000,
		AutoMaxHeight:               350,
	}
}

func FrontendDefaultSectionSizingPolicyByType() FrontendSectionSizingPolicyByType {
	defaults := defaultAutoLayoutSectionSizingPolicy()
	return FrontendSectionSizingPolicyByType{
		Callable: FrontendSectionSizingPolicyCallableTypeEntry{
			FrontendSectionSizingPolicyTypeEntry: frontendSectionSizingPolicyTypeEntry(defaults.ByType["Callable"]),
			HideSearchMinHeight:                  42,
			HideParamsMinHeight:                  90,
		},
		Dict:              frontendSectionSizingPolicyTypeEntry(defaults.ByType["Dict"]),
		ListRoot:          frontendSectionSizingPolicyTypeEntry(defaults.ByType["ListRoot"]),
		Group:             frontendSectionSizingPolicyTypeEntry(defaults.ByType["Group"]),
		StateMachineStart: frontendSectionSizingPolicyTypeEntry(defaults.ByType["StateMachineStart"]),
		StateMachineGate:  frontendSectionSizingPolicyTypeEntry(defaults.ByType["StateMachineGate"]),
		StateMachineEnd:   frontendSectionSizingPolicyTypeEntry(defaults.ByType["StateMachineEnd"]),
		Image:             frontendSectionSizingPolicyTypeEntry(defaults.ByType["Image"]),
		Chart:             frontendSectionSizingPolicyTypeEntry(defaults.ByType["Chart"]),
		Draw:              frontendSectionSizingPolicyTypeEntry(defaults.ByType["Draw"]),
		Prompt:            frontendSectionSizingPolicyTypeEntry(defaults.ByType["Prompt"]),
		TextBlock:         frontendSectionSizingPolicyTypeEntry(defaults.ByType["TextBlock"]),
		MetaControl:       frontendSectionSizingPolicyTypeEntry(defaults.ByType["MetaControl"]),
		Social:            frontendSectionSizingPolicyTypeEntry(defaults.ByType["Social"]),
		GlobalVariables:   frontendSectionSizingPolicyTypeEntry(defaults.ByType["GlobalVariables"]),
		Code:              frontendSectionSizingPolicyTypeEntry(defaults.ByType["Code"]),
		GenPythonCode:     frontendSectionSizingPolicyTypeEntry(defaults.ByType["GenPythonCode"]),
		GenPythonMetadata: frontendSectionSizingPolicyTypeEntry(defaults.ByType["GenPythonMetadata"]),
		Terminal:          frontendSectionSizingPolicyTypeEntry(defaults.ByType["Terminal"]),
		IFrame:            frontendSectionSizingPolicyTypeEntry(defaults.ByType["IFrame"]),
		Chat:              frontendSectionSizingPolicyTypeEntry(defaults.ByType["Chat"]),
		Browser:           frontendSectionSizingPolicyTypeEntry(defaults.ByType["Browser"]),
		Plugin:            frontendSectionSizingPolicyTypeEntry(defaults.ByType["Plugin"]),
		TaskBoard:         frontendSectionSizingPolicyTypeEntry(defaults.ByType["TaskBoard"]),
		Spreadsheet:       frontendSectionSizingPolicyTypeEntry(defaults.ByType["Spreadsheet"]),
	}
}

func FrontendDefaultSectionSizingPolicy() FrontendSectionSizingPolicy {
	return FrontendSectionSizingPolicy{
		ByType:            FrontendDefaultSectionSizingPolicyByType(),
		MetaControlByType: FrontendDefaultMetaControlSizingPolicyByType(),
		Globals:           FrontendDefaultSectionSizingPolicyGlobals(),
	}
}

func frontendDefaultMetaControlSizingPolicyTypeEntry(
	minHeight float64,
	minWidth float64,
	sizeModeHeight MetaControlSizeMode,
	sizeModeWidth MetaControlSizeMode,
) FrontendMetaControlSizingPolicyTypeEntry {
	return FrontendMetaControlSizingPolicyTypeEntry{
		MinHeight:      minHeight,
		MinWidth:       minWidth,
		SizeModeHeight: sizeModeHeight,
		SizeModeWidth:  sizeModeWidth,
	}
}

func frontendSectionSizingPolicyTypeEntry(
	entry AutoLayoutSectionMinDimensions,
) FrontendSectionSizingPolicyTypeEntry {
	return FrontendSectionSizingPolicyTypeEntry{
		MinHeight: entry.MinHeight,
		MaxHeight: entry.MaxHeight,
		MinWidth:  entry.MinWidth,
		MaxWidth:  entry.MaxWidth,
	}
}
