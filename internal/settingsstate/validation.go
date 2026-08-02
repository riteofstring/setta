package settingsstate

import (
	"fmt"
	"math"
	"strings"

	"setta/internal/projectstate"
)

type ValidationError struct {
	message string
}

func (e *ValidationError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func newValidationError(format string, args ...any) error {
	return &ValidationError{message: fmt.Sprintf(format, args...)}
}

func ValidateDirectSaveDocument(document Document) error {
	return validateLiveSettingsContract(document, true)
}

func validateLiveSettingsContract(document Document, requireAllFields bool) error {
	defaults, err := DefaultDocument()
	if err != nil {
		return err
	}

	for branch := range document {
		if _, ok := defaults[branch]; ok {
			continue
		}
		return newValidationError("settings.%s: Extra inputs are not permitted", branch)
	}
	for branch, defaultValue := range defaults {
		currentValue, ok := document[branch]
		if !ok {
			if requireAllFields {
				return newValidationError("settings.%s: Field required", branch)
			}
			continue
		}
		if branch == "languageServer" {
			if err := validateLanguageServerSettingsBranch(currentValue, requireAllFields); err != nil {
				return err
			}
			continue
		}
		if err := validateValueAgainstDefault(currentValue, defaultValue, "settings."+branch, requireAllFields); err != nil {
			return err
		}
	}
	return nil
}

func validateLanguageServerSettingsBranch(current any, requireAllFields bool) error {
	currentObject, ok := asObject(current)
	if !ok {
		return newValidationError("settings.languageServer: Input should be an object")
	}
	if err := rejectUnexpectedObjectKeys(currentObject, map[string]any{
		"selectedByLanguage": map[string]any{},
	}, "settings.languageServer"); err != nil {
		return err
	}

	selectedByLanguageValue, ok := currentObject["selectedByLanguage"]
	if !ok {
		if requireAllFields {
			return newValidationError("settings.languageServer.selectedByLanguage: Field required")
		}
		return nil
	}
	return validateLanguageServerSelectedByLanguage(selectedByLanguageValue)
}

func validateLanguageServerSelectedByLanguage(current any) error {
	currentObject, ok := asObject(current)
	if !ok {
		return newValidationError("settings.languageServer.selectedByLanguage: Input should be an object")
	}
	for rawLanguage, value := range currentObject {
		language := normalizeLanguageServerSelectionLanguage(rawLanguage)
		if language == "" || language != rawLanguage {
			return newValidationError(
				"settings.languageServer.selectedByLanguage.%s: Language keys must be trimmed lowercase strings",
				rawLanguage,
			)
		}
		if value == nil {
			continue
		}
		pluginID, ok := value.(string)
		if !ok || strings.TrimSpace(pluginID) == "" {
			return newValidationError(
				"settings.languageServer.selectedByLanguage.%s: Input should be null or a valid string",
				rawLanguage,
			)
		}
	}
	return nil
}

func validateValueAgainstDefault(current any, expected any, path string, requireAllFields bool) error {
	switch typed := expected.(type) {
	case map[string]any:
		return validateObjectAgainstDefault(current, typed, path, requireAllFields)
	case []any:
		return validateArrayAgainstDefault(current, typed, path, requireAllFields)
	case string:
		return validateStringAgainstDefault(current, path)
	case bool:
		return validateBooleanAgainstDefault(current, path)
	case float64:
		return validateNumberAgainstDefault(current, path)
	case nil:
		return validateNilAgainstDefault(current, path)
	default:
		return nil
	}
}

func validateObjectAgainstDefault(current any, expected map[string]any, path string, requireAllFields bool) error {
	currentObject, ok := asObject(current)
	if !ok {
		return newValidationError("%s: Input should be an object", path)
	}
	if err := rejectUnexpectedObjectKeys(currentObject, expected, path); err != nil {
		return err
	}
	return validateExpectedObjectKeys(currentObject, expected, path, requireAllFields)
}

func rejectUnexpectedObjectKeys(currentObject map[string]any, expected map[string]any, path string) error {
	for key := range currentObject {
		if _, ok := expected[key]; ok {
			continue
		}
		return newValidationError("%s.%s: Extra inputs are not permitted", path, key)
	}
	return nil
}

func validateExpectedObjectKeys(
	currentObject map[string]any,
	expected map[string]any,
	path string,
	requireAllFields bool,
) error {
	for key, defaultValue := range expected {
		currentValue, ok := currentObject[key]
		if !ok {
			if requireAllFields {
				return newValidationError("%s.%s: Field required", path, key)
			}
			continue
		}
		if err := validateValueAgainstDefault(currentValue, defaultValue, path+"."+key, requireAllFields); err != nil {
			return err
		}
	}
	return nil
}

func validateArrayAgainstDefault(current any, expected []any, path string, requireAllFields bool) error {
	currentArray, ok := current.([]any)
	if !ok {
		return newValidationError("%s: Input should be an array", path)
	}
	if requiredLength, ok := exactArrayLengthForPath(path); ok && len(currentArray) != requiredLength {
		return newValidationError("%s: Input should contain exactly %d items", path, requiredLength)
	}
	if len(expected) == 0 {
		return nil
	}
	return validateArrayEntriesAgainstDefault(currentArray, expected[0], path, requireAllFields)
}

func validateArrayEntriesAgainstDefault(currentArray []any, template any, path string, requireAllFields bool) error {
	for index, entry := range currentArray {
		if err := validateValueAgainstDefault(entry, template, fmt.Sprintf("%s.%d", path, index), requireAllFields); err != nil {
			return err
		}
	}
	return nil
}

func exactArrayLengthForPath(path string) (int, bool) {
	switch path {
	case "settings.gui.snapGrid":
		return 2, true
	default:
		return 0, false
	}
}

func validateStringAgainstDefault(current any, path string) error {
	currentString, ok := current.(string)
	if !ok {
		return newValidationError("%s: Input should be a valid string", path)
	}
	return validateAllowedStringValue(path, currentString)
}

func validateAllowedStringValue(path string, currentString string) error {
	allowedValues := allowedValuesForPath(path)
	if len(allowedValues) == 0 {
		return nil
	}
	for _, allowed := range allowedValues {
		if currentString == allowed {
			return nil
		}
	}
	return newValidationError("%s: Input should be one of %s", path, formatAllowedValues(allowedValues))
}

func validateBooleanAgainstDefault(current any, path string) error {
	if _, ok := current.(bool); !ok {
		return newValidationError("%s: Input should be a valid boolean", path)
	}
	return nil
}

func validateNumberAgainstDefault(current any, path string) error {
	currentNumber, ok := asFloat(current)
	if !ok || math.IsNaN(currentNumber) || math.IsInf(currentNumber, 0) {
		return newValidationError("%s: Input should be a valid number", path)
	}
	return nil
}

func validateNilAgainstDefault(current any, path string) error {
	if !pathAllowsNullOrString(path) {
		return nil
	}
	if current == nil {
		return nil
	}
	if _, ok := current.(string); ok {
		return nil
	}
	return newValidationError("%s: Input should be null or a valid string", path)
}

func pathAllowsNullOrString(path string) bool {
	return path == "settings.backend.defaultTerminalShell"
}

func allowedValuesForPath(path string) []string {
	switch path {
	case "settings.backend.renameRefactorMode":
		return []string{"ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"}
	case "settings.backend.runSnapshotMode":
		return []string{"ephemeral", "always", "never"}
	case "settings.gui.gridPattern":
		return BackgroundVariantValues()
	case "settings.gui.panOnScrollMode":
		return PanOnScrollModeValues()
	case "settings.gui.selectionMode":
		return SelectionModeValues()
	case "settings.stateMachineGateSectionDefault.gateType":
		return []string{"AND", "OR", "XOR"}
	}

	if strings.HasPrefix(path, "settings.sectionSizingPolicy.metaControlByType.") &&
		(strings.HasSuffix(path, ".sizeModeHeight") || strings.HasSuffix(path, ".sizeModeWidth")) {
		return projectstate.MetaControlSizeModeValues()
	}

	return nil
}

func formatAllowedValues(values []string) string {
	if len(values) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return strings.Join(quoted, ", ")
}
