package aggregate

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

func validateStoredCallableExpression(expression string) error {
	if expression == "" {
		return nil
	}
	canonical, err := canonicalCallableExpression(expression)
	if err != nil {
		return err
	}
	if canonical != expression {
		return validationError("callable expression must be canonical")
	}
	return nil
}

func canonicalCallableExpression(expression string) (string, error) {
	canonical := strings.TrimSpace(expression)
	if canonical == "" || len(canonical) > maxAuthoredExpressionBytes ||
		!utf8.ValidString(canonical) || strings.ContainsRune(canonical, '\x00') {
		return "", validationError("callable expression is invalid")
	}
	for _, component := range strings.Split(canonical, ".") {
		if !isPythonIdentifier(component) || isPythonKeyword(component) {
			return "", validationError("callable expression is invalid")
		}
	}
	return canonical, nil
}

func canonicalDisplayName(kind string, name string) (string, error) {
	canonical := strings.TrimSpace(name)
	if canonical == "" || len(canonical) > maxDisplayNameBytes || !utf8.ValidString(canonical) || strings.ContainsRune(canonical, '\x00') {
		return "", validationError("%s name is invalid", kind)
	}
	return canonical, nil
}

func canonicalParameterName(name string) (string, error) {
	canonical := strings.TrimSpace(name)
	if canonical == "" {
		return "", nil
	}
	if len(canonical) > maxParameterNameBytes || !utf8.ValidString(canonical) ||
		strings.ContainsRune(canonical, '\x00') || !isPythonIdentifier(canonical) || isPythonKeyword(canonical) {
		return "", validationError("parameter name is invalid")
	}
	return canonical, nil
}

func validateParameterExpression(expression string) error {
	if len(expression) > maxAuthoredExpressionBytes || !utf8.ValidString(expression) ||
		strings.ContainsRune(expression, '\x00') || strings.ContainsAny(expression, "\r\n;") {
		return validationError("parameter expression is invalid")
	}
	return nil
}

func validateTargetRegion(region string, value string) error {
	if len(value) > maxPythonTargetBytes || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return validationError("Python target %s is invalid", region)
	}
	return nil
}

func validateMetadata(kind string, value string) error {
	if len(value) > maxAuthoredExpressionBytes || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return validationError("provider %s is invalid", kind)
	}
	return nil
}

func validateID(kind string, id string) error {
	if id == "" || id != strings.TrimSpace(id) || len(id) > maxIDBytes || !utf8.ValidString(id) || strings.ContainsRune(id, '\x00') {
		return validationError("%s ID is invalid", kind)
	}
	return nil
}

func isSupportedPassingStyle(style PassingStyle) bool {
	switch style {
	case PassingStylePositionalOnly,
		PassingStylePositionalOrKeyword,
		PassingStyleKeywordOnly,
		PassingStyleVariadicPositional,
		PassingStyleVariadicKeyword:
		return true
	default:
		return false
	}
}

func isPythonIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, character := range value {
		if character == '_' || unicode.IsLetter(character) || (index > 0 && unicode.IsDigit(character)) {
			continue
		}
		return false
	}
	return true
}

func isPythonKeyword(value string) bool {
	_, isKeyword := pythonKeywords[value]
	return isKeyword
}

func validationError(format string, arguments ...any) error {
	return fmt.Errorf("%w: %s", ErrValidation, fmt.Sprintf(format, arguments...))
}
