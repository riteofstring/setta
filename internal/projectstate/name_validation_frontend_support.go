package projectstate

import (
	"sort"
	"strings"
)

const simpleNameSlugReplacementChars = "[]\"' "

type FrontendNameValidationContract struct {
	ProjectReservedNames          []string `json:"projectReservedNames"`
	PythonKeywords                []string `json:"pythonKeywords"`
	SimpleNameAllowedChars        []string `json:"simpleNameAllowedChars"`
	PythonIdentifierStartChars    []string `json:"pythonIdentifierStartChars"`
	PythonIdentifierContinueChars []string `json:"pythonIdentifierContinueChars"`
	SlugReplacementChars          []string `json:"slugReplacementChars"`
}

func FrontendNameValidationContractData() FrontendNameValidationContract {
	return FrontendNameValidationContract{
		ProjectReservedNames:          sortedStringSetKeys(projectReservedNames),
		PythonKeywords:                sortedStringSetKeys(pythonKeywords),
		SimpleNameAllowedChars:        collectASCIIChars(isAllowedSimpleNameChar),
		PythonIdentifierStartChars:    collectASCIIChars(isPythonIdentifierStartChar),
		PythonIdentifierContinueChars: collectASCIIChars(isPythonIdentifierContinueChar),
		SlugReplacementChars:          splitStringRunes(simpleNameSlugReplacementChars),
	}
}

func FrontendValueNameValidationRules() FrontendNameValidationContract {
	return FrontendNameValidationContractData()
}

func sanitizeSimpleNameSlug(name string) string {
	replaced := strings.NewReplacer(
		"[", "_",
		"]", "_",
		"\"", "_",
		"'", "_",
		" ", "_",
	).Replace(name)
	for strings.Contains(replaced, "__") {
		replaced = strings.ReplaceAll(replaced, "__", "_")
	}
	return strings.Trim(strings.ToLower(replaced), "_")
}

func collectASCIIChars(match func(rune) bool) []string {
	chars := make([]string, 0, 95)
	for char := rune(32); char <= 126; char++ {
		if match(char) {
			chars = append(chars, string(char))
		}
	}
	return chars
}

func isPythonIdentifierStartChar(char rune) bool {
	return pythonIdentifierRegexp.MatchString(string(char))
}

func isPythonIdentifierContinueChar(char rune) bool {
	return pythonIdentifierRegexp.MatchString("a" + string(char))
}

func sortedStringSetKeys(values map[string]struct{}) []string {
	keys := make([]string, 0, len(values))
	for value := range values {
		keys = append(keys, value)
	}
	sort.Strings(keys)
	return keys
}

func splitStringRunes(value string) []string {
	output := make([]string, 0, len(value))
	for _, char := range value {
		output = append(output, string(char))
	}
	return output
}
