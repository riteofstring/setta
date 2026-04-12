package projectview

import (
	"reflect"

	"setta/internal/projectstate"
)

type ProjectCodegenLanguage string

const ProjectCodegenLanguagePython ProjectCodegenLanguage = "python"

type SectionCodegenMode string

const (
	SectionCodegenModeInherit SectionCodegenMode = "inherit"
	SectionCodegenModeInclude SectionCodegenMode = "include"
	SectionCodegenModeExclude SectionCodegenMode = "exclude"
)

type SectionRepresentationMode string

const (
	SectionRepresentationModeExpression SectionRepresentationMode = "expression"
	SectionRepresentationModeFilePath   SectionRepresentationMode = "file_path"
	SectionRepresentationModeFileRead   SectionRepresentationMode = "file_read"
)

type CodeObjValueRepresentationMode string

const (
	CodeObjValueRepresentationModeExpression CodeObjValueRepresentationMode = "expression"
	CodeObjValueRepresentationModeJSONParsed CodeObjValueRepresentationMode = "json_parsed"
	CodeObjValueRepresentationModeString     CodeObjValueRepresentationMode = "string"
	CodeObjValueRepresentationModeFilePath   CodeObjValueRepresentationMode = "file_path"
	CodeObjValueRepresentationModeFileRead   CodeObjValueRepresentationMode = "file_read"
)

type SectionTypeCodegenPolicy struct {
	Mode           SectionCodegenMode        `json:"mode"`
	Representation SectionRepresentationMode `json:"representation"`
}

type SectionCodegenOverride struct {
	Mode           SectionCodegenMode        `json:"mode"`
	Representation SectionRepresentationMode `json:"representation"`
}

type SectionCodegenPolicy struct {
	Allowlist            []projectstate.FrontendSectionType  `json:"allowlist" ts_optional:"true"`
	MetaControlAllowlist []projectstate.FrontendCodeObjType  `json:"metaControlAllowlist" ts_optional:"true"`
	Exclude              []string                            `json:"exclude"`
	TypePolicies         map[string]SectionTypeCodegenPolicy `json:"typePolicies" ts_type:"Record<SectionType, SectionTypeCodegenPolicy>" ts_create_map_values:"true"`
	SectionOverrides     map[string]SectionCodegenOverride   `json:"sectionOverrides" ts_type:"Record<string, SectionCodegenOverride>" ts_create_map_values:"true"`
}

type CodeObjTypeValuePolicy struct {
	Representation CodeObjValueRepresentationMode `json:"representation"`
}

type CodeObjValueOverride struct {
	Representation CodeObjValueRepresentationMode `json:"representation"`
}

type CodeObjValuePolicy struct {
	TypePolicies     map[string]CodeObjTypeValuePolicy `json:"typePolicies" ts_type:"Record<CodeObjType, CodeObjTypeValuePolicy>" ts_create_map_values:"true"`
	CodeObjOverrides map[string]CodeObjValueOverride   `json:"codeObjOverrides" ts_type:"Record<string, CodeObjValueOverride>" ts_create_map_values:"true"`
}

type ProjectCodegenPythonTarget struct {
	Language           ProjectCodegenLanguage `json:"language" ts_type:"typeof ProjectCodegenLanguageEnum.python"`
	GenCodePrefix      string                 `json:"genCodePrefix"`
	GenCodeSuffix      string                 `json:"genCodeSuffix"`
	GenerateMetadata   bool                   `json:"generateMetadata"`
	SectionPolicy      SectionCodegenPolicy   `json:"sectionPolicy"`
	CodeObjValuePolicy CodeObjValuePolicy     `json:"codeObjValuePolicy"`
}

type ProjectCodegenPluginTarget struct {
	Language string         `json:"language"`
	Options  map[string]any `json:"options"`
}

type ProjectCodegenTarget []byte

func (target ProjectCodegenTarget) MarshalJSON() ([]byte, error) {
	if len(target) == 0 {
		return []byte("null"), nil
	}
	return append([]byte(nil), target...), nil
}

func (target *ProjectCodegenTarget) UnmarshalJSON(data []byte) error {
	if target == nil {
		return nil
	}
	*target = append((*target)[:0], data...)
	return nil
}

func (ProjectCodegenTarget) FrontendBindingUnionTypes() []reflect.Type {
	return []reflect.Type{
		reflect.TypeOf(ProjectCodegenPythonTarget{}),
		reflect.TypeOf(ProjectCodegenPluginTarget{}),
	}
}
