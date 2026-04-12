package projectstate

func AllPythonSectionTypes() []string {
	return append([]string(nil), allPythonSectionTypes...)
}

func DefaultPythonSectionAllowlistOrder() []string {
	return append([]string(nil), defaultPythonSectionAllowlist...)
}

func AllPythonCodeObjTypes() []string {
	return append([]string(nil), allPythonCodeObjTypes...)
}

func DefaultPythonMetaControlAllowlistOrder() []string {
	return append([]string(nil), defaultPythonMetaControlAllowlist...)
}

func PythonSectionCodegenModeValues() []PythonSectionCodegenMode {
	return []PythonSectionCodegenMode{
		PythonSectionCodegenModeInherit,
		PythonSectionCodegenModeInclude,
		PythonSectionCodegenModeExclude,
	}
}

func PythonSectionRepresentationModeValues() []PythonSectionRepresentationMode {
	return []PythonSectionRepresentationMode{
		PythonSectionRepresentationExpression,
		PythonSectionRepresentationFilePath,
		PythonSectionRepresentationFileRead,
	}
}

func PythonCodeObjValueRepresentationModeValues() []PythonCodeObjValueRepresentationMode {
	return []PythonCodeObjValueRepresentationMode{
		PythonCodeObjValueRepresentationExpression,
		PythonCodeObjValueRepresentationJSONParsed,
		PythonCodeObjValueRepresentationString,
		PythonCodeObjValueRepresentationFilePath,
		PythonCodeObjValueRepresentationFileRead,
	}
}

func PythonSectionRepresentationOptions(sectionType string) []PythonSectionRepresentationMode {
	options := make([]PythonSectionRepresentationMode, 0, len(PythonSectionRepresentationModeValues()))
	for _, representation := range PythonSectionRepresentationModeValues() {
		if isPythonSectionRepresentationSupported(sectionType, representation) {
			options = append(options, representation)
		}
	}
	return options
}

func PythonCodeObjRepresentationOptions(codeObjType string) []PythonCodeObjValueRepresentationMode {
	options := make([]PythonCodeObjValueRepresentationMode, 0, len(PythonCodeObjValueRepresentationModeValues()))
	for _, representation := range PythonCodeObjValueRepresentationModeValues() {
		if isPythonCodeObjRepresentationSupported(codeObjType, representation) {
			options = append(options, representation)
		}
	}
	return options
}
