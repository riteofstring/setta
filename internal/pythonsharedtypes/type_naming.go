package pythonsharedtypes

import (
	"reflect"
	"strings"
	"unicode"
)

var pythonSharedOwnerContractNamesByType = newPythonSharedOwnerContractNamesByType()

func newPythonSharedOwnerContractNamesByType() map[reflect.Type]string {
	contractNames := map[reflect.Type]string{}
	for _, t := range discoveredSharedTypes() {
		contractName := normalizedPythonSharedContractName(t.Name())
		if contractName == "" {
			continue
		}
		contractNames[t] = contractName
	}
	return contractNames
}

func normalizedPythonSharedContractName(name string) string {
	const frontendPrefix = "Frontend"
	if !strings.HasPrefix(name, frontendPrefix) || len(name) <= len(frontendPrefix) {
		return name
	}
	trimmed := name[len(frontendPrefix):]
	if trimmed == "" {
		return name
	}
	firstRune := []rune(trimmed)[0]
	if !unicode.IsUpper(firstRune) {
		return name
	}
	return trimmed
}

func pythonSharedContractNameForType(t reflect.Type) string {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return ""
	}
	if contractName, ok := pythonSharedOwnerContractNamesByType[t]; ok {
		return contractName
	}
	return normalizedPythonSharedContractName(t.Name())
}
