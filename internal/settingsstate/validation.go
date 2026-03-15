package settingsstate

import (
	"fmt"
	"math"
	"strings"
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
	return validateLiveSettingsContract(document)
}

func validateLiveSettingsContract(document Document) error {
	defaults, err := DefaultDocument()
	if err != nil {
		return err
	}

	for _, branch := range []string{"shortcuts", "gui", "backend", "sectionSizingPolicy"} {
		currentValue, ok := document[branch]
		if !ok {
			continue
		}
		defaultValue, ok := defaults[branch]
		if !ok {
			continue
		}
		if err := validateValueAgainstDefault(currentValue, defaultValue, "settings."+branch); err != nil {
			return err
		}
	}

	languageServerValue, ok := document["languageServer"]
	if !ok {
		return nil
	}
	if _, ok := asObject(languageServerValue); !ok {
		return newValidationError("settings.languageServer: Input should be an object")
	}
	return nil
}

func validateValueAgainstDefault(current any, expected any, path string) error {
	switch typed := expected.(type) {
	case map[string]any:
		currentObject, ok := asObject(current)
		if !ok {
			return newValidationError("%s: Input should be an object", path)
		}
		for key, defaultValue := range typed {
			currentValue, ok := currentObject[key]
			if !ok {
				continue
			}
			if err := validateValueAgainstDefault(currentValue, defaultValue, path+"."+key); err != nil {
				return err
			}
		}
		return nil
	case []any:
		currentArray, ok := current.([]any)
		if !ok {
			return newValidationError("%s: Input should be an array", path)
		}
		if path == "settings.gui.snapGrid" && len(currentArray) != 2 {
			return newValidationError("%s: Input should contain exactly 2 items", path)
		}
		if len(typed) == 0 {
			return nil
		}
		template := typed[0]
		for i, entry := range currentArray {
			if err := validateValueAgainstDefault(entry, template, fmt.Sprintf("%s.%d", path, i)); err != nil {
				return err
			}
		}
		return nil
	case string:
		currentString, ok := current.(string)
		if !ok {
			return newValidationError("%s: Input should be a valid string", path)
		}
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
	case bool:
		if _, ok := current.(bool); !ok {
			return newValidationError("%s: Input should be a valid boolean", path)
		}
		return nil
	case float64:
		currentNumber, ok := asFloat(current)
		if !ok || math.IsNaN(currentNumber) || math.IsInf(currentNumber, 0) {
			return newValidationError("%s: Input should be a valid number", path)
		}
		return nil
	case nil:
		if path == "settings.backend.defaultTerminalShell" {
			if current == nil {
				return nil
			}
			if _, ok := current.(string); ok {
				return nil
			}
			return newValidationError("%s: Input should be null or a valid string", path)
		}
		return nil
	default:
		return nil
	}
}

func allowedValuesForPath(path string) []string {
	switch path {
	case "settings.backend.renameRefactorMode":
		return []string{"ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"}
	case "settings.backend.runSnapshotMode":
		return []string{"ephemeral", "always", "never"}
	case "settings.gui.gridPattern":
		return []string{"lines", "dots", "cross"}
	case "settings.gui.panOnScrollMode":
		return []string{"free", "vertical", "horizontal"}
	case "settings.gui.selectionMode":
		return []string{"partial", "full"}
	}

	if strings.HasPrefix(path, "settings.sectionSizingPolicy.metaControlByType.") &&
		(strings.HasSuffix(path, ".sizeModeHeight") || strings.HasSuffix(path, ".sizeModeWidth")) {
		return []string{"any", "auto_only", "manual_only"}
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
