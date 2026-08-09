package projectview

import "setta/internal/projectstate"

// Keep the run-instructions policy editor metadata Go-owned so the frontend
// does not hand-maintain Python codegen policy tables.
var (
	frontendPythonCodegenSectionTypes = []projectstate.FrontendSectionType{
		projectstate.FrontendSectionTypeCallable,
		projectstate.FrontendSectionTypeDict,
		projectstate.FrontendSectionTypeListRoot,
		projectstate.FrontendSectionTypeGroup,
		projectstate.FrontendSectionTypeGlobalVariables,
		projectstate.FrontendSectionTypeTextBlock,
		projectstate.FrontendSectionTypeDraw,
		projectstate.FrontendSectionTypeImage,
		projectstate.FrontendSectionTypeMetaControl,
		projectstate.FrontendSectionTypeChat,
	}
	frontendPythonCodegenCodeObjTypes = []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeCodeParam,
		projectstate.FrontendCodeObjTypeTextParam,
		projectstate.FrontendCodeObjTypeDateParam,
		projectstate.FrontendCodeObjTypeTimeParam,
		projectstate.FrontendCodeObjTypeButtonParam,
		projectstate.FrontendCodeObjTypeSliderParam,
		projectstate.FrontendCodeObjTypeRotaryParam,
		projectstate.FrontendCodeObjTypeSwitchParam,
		projectstate.FrontendCodeObjTypeColorPickerParam,
		projectstate.FrontendCodeObjTypeDropdownParam,
		projectstate.FrontendCodeObjTypePasswordParam,
		projectstate.FrontendCodeObjTypeTextAreaParam,
		projectstate.FrontendCodeObjTypeDropzoneParam,
		projectstate.FrontendCodeObjTypeNestedParam,
	}
	frontendPythonMetaControlCodeObjTypes = []PythonCodegenPolicyCodeObjOption{
		{Type: projectstate.FrontendCodeObjTypeDropdownParam, Label: "Dropdown"},
		{Type: projectstate.FrontendCodeObjTypeSliderParam, Label: "Slider"},
		{Type: projectstate.FrontendCodeObjTypeRotaryParam, Label: "Rotary"},
		{Type: projectstate.FrontendCodeObjTypeSwitchParam, Label: "Switch"},
		{Type: projectstate.FrontendCodeObjTypeTextParam, Label: "Text Input"},
		{Type: projectstate.FrontendCodeObjTypeDateParam, Label: "Date Input"},
		{Type: projectstate.FrontendCodeObjTypeTimeParam, Label: "Time Input"},
		{Type: projectstate.FrontendCodeObjTypeTextAreaParam, Label: "Text Area"},
		{Type: projectstate.FrontendCodeObjTypeCodeParam, Label: "Code Input"},
		{Type: projectstate.FrontendCodeObjTypePasswordParam, Label: "Password Field"},
		{Type: projectstate.FrontendCodeObjTypeColorPickerParam, Label: "Color Picker"},
		{Type: projectstate.FrontendCodeObjTypeButtonParam, Label: "Button"},
		{Type: projectstate.FrontendCodeObjTypeDropzoneParam, Label: "Dropzone"},
	}
)

type PythonCodegenPolicyCodeObjOption struct {
	Type  projectstate.FrontendCodeObjType `json:"type"`
	Label string                           `json:"label"`
}

type PythonCodegenPolicyUIConfigValue struct {
	SectionModeOptions                  []SectionCodegenMode                        `json:"sectionModeOptions"`
	SectionTypes                        []projectstate.FrontendSectionType          `json:"sectionTypes"`
	MetaControlCodeObjTypes             []PythonCodegenPolicyCodeObjOption          `json:"metaControlCodeObjTypes"`
	CodeObjTypes                        []projectstate.FrontendCodeObjType          `json:"codeObjTypes"`
	DefaultSectionRepresentationOptions []SectionRepresentationMode                 `json:"defaultSectionRepresentationOptions"`
	DefaultCodeObjRepresentationOptions []CodeObjValueRepresentationMode            `json:"defaultCodeObjRepresentationOptions"`
	SectionRepresentationOptionsByType  map[string][]SectionRepresentationMode      `json:"sectionRepresentationOptionsByType" ts_type:"Record<SectionType, SectionRepresentationMode[]>"`
	CodeObjRepresentationOptionsByType  map[string][]CodeObjValueRepresentationMode `json:"codeObjRepresentationOptionsByType" ts_type:"Record<CodeObjType, CodeObjValueRepresentationMode[]>"`
}

func FrontendValuePythonCodegenPolicyUIConfig() PythonCodegenPolicyUIConfigValue {
	return PythonCodegenPolicyUIConfigValue{
		SectionModeOptions:                  convertStringSlice[SectionCodegenMode](projectstate.PythonSectionCodegenModeValues()),
		SectionTypes:                        append([]projectstate.FrontendSectionType(nil), frontendPythonCodegenSectionTypes...),
		MetaControlCodeObjTypes:             append([]PythonCodegenPolicyCodeObjOption(nil), frontendPythonMetaControlCodeObjTypes...),
		CodeObjTypes:                        append([]projectstate.FrontendCodeObjType(nil), frontendPythonCodegenCodeObjTypes...),
		DefaultSectionRepresentationOptions: convertStringSlice[SectionRepresentationMode](projectstate.PythonSectionRepresentationOptions("")),
		DefaultCodeObjRepresentationOptions: convertStringSlice[CodeObjValueRepresentationMode](projectstate.PythonCodeObjRepresentationOptions("")),
		SectionRepresentationOptionsByType:  frontendPythonSectionRepresentationOptionsByType(),
		CodeObjRepresentationOptionsByType:  frontendPythonCodeObjRepresentationOptionsByType(),
	}
}

func frontendPythonSectionRepresentationOptionsByType() map[string][]SectionRepresentationMode {
	sectionTypes := projectstate.AllPythonSectionTypes()
	optionsByType := make(map[string][]SectionRepresentationMode, len(sectionTypes))
	for _, sectionType := range sectionTypes {
		optionsByType[sectionType] = convertStringSlice[SectionRepresentationMode](
			projectstate.PythonSectionRepresentationOptions(sectionType),
		)
	}
	return optionsByType
}

func frontendPythonCodeObjRepresentationOptionsByType() map[string][]CodeObjValueRepresentationMode {
	codeObjTypes := projectstate.AllPythonCodeObjTypes()
	optionsByType := make(map[string][]CodeObjValueRepresentationMode, len(codeObjTypes))
	for _, codeObjType := range codeObjTypes {
		optionsByType[codeObjType] = convertStringSlice[CodeObjValueRepresentationMode](
			projectstate.PythonCodeObjRepresentationOptions(codeObjType),
		)
	}
	return optionsByType
}

func convertStringSlice[To ~string, From ~string](values []From) []To {
	converted := make([]To, len(values))
	for index, value := range values {
		converted[index] = To(value)
	}
	return converted
}
