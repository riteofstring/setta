package projectstate

// Keep the UI-editor param-impl type filters Go-owned so frontend consumers do
// not mirror the change-param-impl runtime allowlists.
type ChangeParamImplUIConfigValue struct {
	AllParamCodeObjTypes     []FrontendCodeObjType `json:"allParamCodeObjTypes"`
	ControlCodeObjTypes      []FrontendCodeObjType `json:"controlCodeObjTypes"`
	SectionParamCodeObjTypes []FrontendCodeObjType `json:"sectionParamCodeObjTypes"`
}

func FrontendValueChangeParamImplUIConfig() ChangeParamImplUIConfigValue {
	return ChangeParamImplUIConfigValue{
		AllParamCodeObjTypes:     frontendAllowedParamCodeObjTypes(allParamCodeObjectTypes),
		ControlCodeObjTypes:      frontendAllowedParamCodeObjTypes(controlCodeObjectTypes),
		SectionParamCodeObjTypes: frontendAllowedParamCodeObjTypes(sectionParamCodeObjectTypes),
	}
}

func frontendAllowedParamCodeObjTypes(
	allowedTypes map[string]struct{},
) []FrontendCodeObjType {
	orderedTypes := AllPythonCodeObjTypes()
	output := make([]FrontendCodeObjType, 0, len(allowedTypes))
	for _, codeObjType := range orderedTypes {
		if _, ok := allowedTypes[codeObjType]; ok {
			output = append(output, FrontendCodeObjType(codeObjType))
		}
	}
	return output
}
