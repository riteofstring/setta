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

func BootstrapLanguageServerSelections(document Document, selectedByLanguage map[string]string) (Document, bool, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return nil, false, err
	}
	if len(selectedByLanguage) == 0 {
		return normalized, false, nil
	}

	next := normalized.Clone()
	selectedBranch := ensureLanguageServerSelectedByLanguageBranch(next)
	changed, err := applyBootstrapLanguageServerSelections(selectedBranch, selectedByLanguage)
	if err != nil {
		return nil, false, err
	}
	if !changed {
		return normalized, false, nil
	}

	next, err = next.Normalized()
	if err != nil {
		return nil, false, err
	}
	return next, true, nil
}

func SetLanguageServerSelection(document Document, language string, selection *string) (Document, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return nil, err
	}

	normalizedLanguage := normalizeLanguageServerSelectionLanguage(language)
	if normalizedLanguage == "" {
		return nil, fmt.Errorf("%w: language id is required", ErrSettingsValueInvalid)
	}

	next := normalized.Clone()
	selectedBranch := ensureLanguageServerSelectedByLanguageBranch(next)
	if selection == nil {
		selectedBranch[normalizedLanguage] = nil
	} else {
		trimmedPluginID := strings.TrimSpace(*selection)
		if trimmedPluginID == "" {
			return nil, fmt.Errorf("%w: languageServer.selectedByLanguage.%s is empty", ErrSettingsValueInvalid, normalizedLanguage)
		}
		selectedBranch[normalizedLanguage] = trimmedPluginID
	}

	return next.Normalized()
}

func ensureLanguageServerSelectedByLanguageBranch(document Document) map[string]any {
	languageServerBranch, ok := document["languageServer"].(map[string]any)
	if !ok || languageServerBranch == nil {
		languageServerBranch = map[string]any{}
		document["languageServer"] = languageServerBranch
	}
	selectedBranch, ok := languageServerBranch["selectedByLanguage"].(map[string]any)
	if !ok || selectedBranch == nil {
		selectedBranch = map[string]any{}
		languageServerBranch["selectedByLanguage"] = selectedBranch
	}
	return selectedBranch
}

func applyBootstrapLanguageServerSelections(selectedBranch map[string]any, selectedByLanguage map[string]string) (bool, error) {
	changed := false
	for rawLanguage, rawPluginID := range selectedByLanguage {
		language, pluginID, err := normalizeBootstrapLanguageServerSelection(rawLanguage, rawPluginID)
		if err != nil {
			return false, err
		}
		if _, exists := selectedBranch[language]; exists {
			continue
		}
		selectedBranch[language] = pluginID
		changed = true
	}
	return changed, nil
}

func normalizeBootstrapLanguageServerSelection(language string, pluginID string) (string, string, error) {
	normalizedLanguage := normalizeLanguageServerSelectionLanguage(language)
	if normalizedLanguage == "" {
		return "", "", fmt.Errorf("%w: language id is required", ErrSettingsValueInvalid)
	}
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return "", "", fmt.Errorf("%w: languageServer.selectedByLanguage.%s is empty", ErrSettingsValueInvalid, normalizedLanguage)
	}
	return normalizedLanguage, trimmedPluginID, nil
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
