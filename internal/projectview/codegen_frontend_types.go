package projectview

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
	Allowlist            []string                            `json:"allowlist"`
	MetaControlAllowlist []string                            `json:"metaControlAllowlist"`
	Exclude              []string                            `json:"exclude"`
	TypePolicies         map[string]SectionTypeCodegenPolicy `json:"typePolicies"`
	SectionOverrides     map[string]SectionCodegenOverride   `json:"sectionOverrides"`
}

type CodeObjTypeValuePolicy struct {
	Representation CodeObjValueRepresentationMode `json:"representation"`
}

type CodeObjValueOverride struct {
	Representation CodeObjValueRepresentationMode `json:"representation"`
}

type CodeObjValuePolicy struct {
	TypePolicies     map[string]CodeObjTypeValuePolicy `json:"typePolicies"`
	CodeObjOverrides map[string]CodeObjValueOverride   `json:"codeObjOverrides"`
}

type ProjectCodegenPythonTarget struct {
	Language           ProjectCodegenLanguage `json:"language"`
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

type ProjectCodegenTarget struct{}
