package projectstate

var sourceDefaultUnsharedProjectFields = map[string]struct{}{
	"callable":          {},
	"codeObjVariantMap": {},
	"edgeInputParams":   {},
	"edgeOutputPorts":   {},
	"topLevelParamId":   {},
	"value":             {},
	"layers":            {},
}

func projectFieldUsesDefaultUnsharedOwnership(fieldName string) bool {
	_, ok := sourceDefaultUnsharedProjectFields[fieldName]
	return ok
}

func sectionFieldIsUnshared(section Section, fieldName string) bool {
	return containsString(section.UnsharedKeys, fieldName) || projectFieldUsesDefaultUnsharedOwnership(fieldName)
}

func codeObjectFieldIsUnshared(codeObj CodeObject, fieldName string) bool {
	return containsString(codeObj.UnsharedKeys, fieldName) || projectFieldUsesDefaultUnsharedOwnership(fieldName)
}

func fieldsContainUnsharedSectionField(section Section, fields map[string]any) bool {
	for fieldName := range fields {
		if sectionFieldIsUnshared(section, fieldName) {
			return true
		}
	}
	return false
}
