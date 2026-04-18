package settingsstate

import (
	"fmt"
	"strings"
)

func LanguageServerSelectedByLanguage(document Document) (map[string]*string, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return nil, err
	}

	languageServerBranch, ok, err := objectField(normalized, "languageServer")
	if err != nil {
		return nil, err
	}
	if !ok {
		return map[string]*string{}, nil
	}

	selectedByLanguageBranch, ok, err := objectField(languageServerBranch, "selectedByLanguage")
	if err != nil {
		return nil, err
	}
	if !ok || len(selectedByLanguageBranch) == 0 {
		return map[string]*string{}, nil
	}

	selectedByLanguage := make(map[string]*string, len(selectedByLanguageBranch))
	for language, rawSelection := range selectedByLanguageBranch {
		normalizedLanguage := normalizeLanguageServerSelectionLanguage(language)
		if normalizedLanguage == "" {
			return nil, fmt.Errorf("%w: languageServer.selectedByLanguage.%s is not a valid language", ErrSettingsValueInvalid, language)
		}
		if rawSelection == nil {
			selectedByLanguage[normalizedLanguage] = nil
			continue
		}
		pluginID, ok := rawSelection.(string)
		if !ok {
			return nil, fmt.Errorf("%w: languageServer.selectedByLanguage.%s is not null or string", ErrSettingsValueInvalid, language)
		}
		trimmedPluginID := strings.TrimSpace(pluginID)
		if trimmedPluginID == "" {
			return nil, fmt.Errorf("%w: languageServer.selectedByLanguage.%s is empty", ErrSettingsValueInvalid, language)
		}
		selectedByLanguage[normalizedLanguage] = stringPointer(trimmedPluginID)
	}
	return selectedByLanguage, nil
}

func LanguageServerSelectionForLanguage(document Document, language string) (*string, bool, error) {
	selectedByLanguage, err := LanguageServerSelectedByLanguage(document)
	if err != nil {
		return nil, false, err
	}

	normalizedLanguage := normalizeLanguageServerSelectionLanguage(language)
	if normalizedLanguage == "" {
		return nil, false, fmt.Errorf("%w: language id is required", ErrSettingsValueInvalid)
	}
	selection, ok := selectedByLanguage[normalizedLanguage]
	if !ok {
		return nil, false, nil
	}
	return cloneLanguageServerSelection(selection), true, nil
}

func normalizeLanguageServerSelectionLanguage(language string) string {
	return strings.ToLower(strings.TrimSpace(language))
}

func stringPointer(value string) *string {
	return &value
}

func cloneLanguageServerSelection(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
