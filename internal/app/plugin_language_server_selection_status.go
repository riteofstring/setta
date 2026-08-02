package app

import (
	"fmt"
	"slices"
	"strings"

	"setta/internal/plugins"
)

func (r *pluginBackendRuntimeRefresher) applyLanguageServerSelectionStatuses(status *plugins.PluginStatusResponse) error {
	if r == nil || status == nil {
		return nil
	}

	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return err
	}
	status.LanguageServerSelections = buildLanguageServerSelectionStatuses(status.Plugins, selections)
	return nil
}

func buildLanguageServerSelectionStatuses(
	entries []plugins.PluginStatusEntry,
	selectedByLanguage map[string]*string,
) []plugins.LanguageServerSelectionStatus {
	languages := collectLanguageServerSelectionLanguages(entries, selectedByLanguage)
	if len(languages) == 0 {
		return []plugins.LanguageServerSelectionStatus{}
	}

	primaryByPluginID := primaryLanguageServerStatusByPluginID(entries)
	statuses := make([]plugins.LanguageServerSelectionStatus, 0, len(languages))
	for _, language := range languages {
		statuses = append(statuses, buildLanguageServerSelectionStatus(
			language,
			entries,
			primaryByPluginID,
			selectedByLanguage,
		))
	}
	return statuses
}

func collectLanguageServerSelectionLanguages(
	entries []plugins.PluginStatusEntry,
	selectedByLanguage map[string]*string,
) []string {
	languageSet := map[string]struct{}{}
	languageSet["python"] = struct{}{}
	for language := range selectedByLanguage {
		normalizedLanguage := normalizeLanguageServerStatusLanguage(language)
		if normalizedLanguage == "" {
			continue
		}
		languageSet[normalizedLanguage] = struct{}{}
	}
	for _, entry := range entries {
		for _, registration := range entry.RegisteredLanguageServers {
			normalizedLanguage := normalizeLanguageServerStatusLanguage(registration.Language)
			if normalizedLanguage == "" {
				continue
			}
			languageSet[normalizedLanguage] = struct{}{}
		}
		for _, language := range entry.AppliedLanguageServerLanguages {
			normalizedLanguage := normalizeLanguageServerStatusLanguage(language)
			if normalizedLanguage == "" {
				continue
			}
			languageSet[normalizedLanguage] = struct{}{}
		}
	}
	if len(languageSet) == 0 {
		return nil
	}
	languages := make([]string, 0, len(languageSet))
	for language := range languageSet {
		languages = append(languages, language)
	}
	slices.Sort(languages)
	return languages
}

func buildLanguageServerSelectionStatus(
	language string,
	entries []plugins.PluginStatusEntry,
	primaryByPluginID map[string]plugins.PluginStatusEntry,
	selectedByLanguage map[string]*string,
) plugins.LanguageServerSelectionStatus {
	selectionState, selectedPluginID := selectionStateForLanguage(selectedByLanguage, language)
	appliedPluginID := appliedLanguageServerPluginID(entries, language)
	providers := buildLanguageServerProviderOptions(primaryByPluginID, language, selectedPluginID)
	selectedEntry, hasSelectedEntry := primaryStatusEntryForSelectedPlugin(primaryByPluginID, selectedPluginID)
	selectionStatus := newLanguageServerSelectionStatusBase(
		language,
		selectionState,
		selectedPluginID,
		appliedPluginID,
		providers,
	)
	availableProviderCount := countAvailableLanguageServerProviders(providers)
	switch selectionState {
	case plugins.LanguageServerSelectionStateUnset:
		return buildUnsetLanguageServerSelectionStatus(selectionStatus, availableProviderCount)
	case plugins.LanguageServerSelectionStateDisabled:
		return buildDisabledLanguageServerSelectionStatus(selectionStatus)
	default:
		return buildSelectedLanguageServerSelectionStatus(
			selectionStatus,
			selectedEntry,
			hasSelectedEntry,
		)
	}
}

func newLanguageServerSelectionStatusBase(
	language string,
	selectionState plugins.LanguageServerSelectionState,
	selectedPluginID *string,
	appliedPluginID *string,
	providers []plugins.LanguageServerProviderOption,
) plugins.LanguageServerSelectionStatus {
	return plugins.LanguageServerSelectionStatus{
		Language:           language,
		SelectionState:     selectionState,
		SelectedPluginID:   cloneOptionalString(selectedPluginID),
		AppliedPluginID:    cloneOptionalString(appliedPluginID),
		AvailableProviders: providers,
	}
}

func countAvailableLanguageServerProviders(providers []plugins.LanguageServerProviderOption) int {
	count := 0
	for _, provider := range providers {
		if provider.Available {
			count++
		}
	}
	return count
}

func buildUnsetLanguageServerSelectionStatus(
	status plugins.LanguageServerSelectionStatus,
	availableProviderCount int,
) plugins.LanguageServerSelectionStatus {
	languageLabel := formatLanguageServerLabel(status.Language)
	languageName := formatLanguageDisplayName(status.Language)
	if status.AppliedPluginID != nil {
		status.Status = plugins.LanguageServerSelectionStatusPendingRestart
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			`%s has not been selected in workspace settings. %q is still applied until the next language-server restart.`,
			languageLabel,
			*status.AppliedPluginID,
		)
		status.RestartRequired = true
		return status
	}
	if availableProviderCount == 0 {
		status.Status = plugins.LanguageServerSelectionStatusNoAvailableProviders
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			"No active plugins provide %s language-server support. Install and enable one to use %s completions and diagnostics.",
			languageName,
			languageName,
		)
		return status
	}
	status.Status = plugins.LanguageServerSelectionStatusUnselected
	status.Severity = plugins.LanguageServerSelectionSeverityWarning
	status.Message = fmt.Sprintf(
		"No %s is selected for this workspace. Choose one below, then restart the language server to apply it.",
		languageLabel,
	)
	return status
}

func buildDisabledLanguageServerSelectionStatus(
	status plugins.LanguageServerSelectionStatus,
) plugins.LanguageServerSelectionStatus {
	languageLabel := formatLanguageServerLabel(status.Language)
	languageName := formatLanguageDisplayName(status.Language)
	if status.AppliedPluginID != nil {
		status.Status = plugins.LanguageServerSelectionStatusPendingRestart
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			"%s is turned off in workspace settings. %q is still applied until the next language-server restart.",
			languageLabel,
			*status.AppliedPluginID,
		)
		status.RestartRequired = true
		return status
	}
	status.Status = plugins.LanguageServerSelectionStatusDisabled
	status.Severity = plugins.LanguageServerSelectionSeverityDefault
	status.Message = fmt.Sprintf(
		"%s is turned off for this workspace. Select a plugin below if you want %s completions and diagnostics.",
		languageLabel,
		languageName,
	)
	return status
}

func buildSelectedLanguageServerSelectionStatus(
	status plugins.LanguageServerSelectionStatus,
	selectedEntry plugins.PluginStatusEntry,
	hasSelectedEntry bool,
) plugins.LanguageServerSelectionStatus {
	languageLabel := formatLanguageServerLabel(status.Language)
	languageName := formatLanguageDisplayName(status.Language)
	if status.SelectedPluginID == nil {
		status.Status = plugins.LanguageServerSelectionStatusUnselected
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			"No %s is selected for this workspace.",
			strings.ToLower(languageLabel),
		)
		return status
	}
	if selectedLanguageServerSelectionIsApplied(status) {
		return buildAppliedSelectedLanguageServerSelectionStatus(status, selectedEntry, hasSelectedEntry)
	}
	if !hasSelectedEntry || !languageServerStatusEntryIsActive(selectedEntry) {
		status.Status = plugins.LanguageServerSelectionStatusSelectedUnavailable
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			`Selected %s %q is not active. Enable or reinstall it before restarting the language server.`,
			languageLabel,
			*status.SelectedPluginID,
		)
		return status
	}
	if !languageServerStatusEntryProvidesLanguage(selectedEntry, status.Language) {
		status.Status = plugins.LanguageServerSelectionStatusSelectedIncompatible
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			`Selected plugin %q is active, but it does not currently provide %s.`,
			*status.SelectedPluginID,
			languageName,
		)
		return status
	}
	status.Status = plugins.LanguageServerSelectionStatusPendingRestart
	status.Severity = plugins.LanguageServerSelectionSeverityWarning
	status.Message = fmt.Sprintf(
		`%q is selected for %s. Restart the language server to apply this workspace setting.`,
		*status.SelectedPluginID,
		languageName,
	)
	status.RestartRequired = true
	return status
}

func selectedLanguageServerSelectionIsApplied(status plugins.LanguageServerSelectionStatus) bool {
	return status.AppliedPluginID != nil &&
		status.SelectedPluginID != nil &&
		*status.AppliedPluginID == *status.SelectedPluginID
}

func buildAppliedSelectedLanguageServerSelectionStatus(
	status plugins.LanguageServerSelectionStatus,
	selectedEntry plugins.PluginStatusEntry,
	hasSelectedEntry bool,
) plugins.LanguageServerSelectionStatus {
	languageLabel := formatLanguageServerLabel(status.Language)
	languageName := formatLanguageDisplayName(status.Language)
	if !hasSelectedEntry || !languageServerStatusEntryIsActive(selectedEntry) || !languageServerStatusEntryProvidesLanguage(selectedEntry, status.Language) {
		status.Status = plugins.LanguageServerSelectionStatusPendingRestart
		status.Severity = plugins.LanguageServerSelectionSeverityWarning
		status.Message = fmt.Sprintf(
			`Selected %s %q is still applied, but restart is still required before the current workspace/plugin state takes effect.`,
			languageLabel,
			*status.SelectedPluginID,
		)
		status.RestartRequired = true
		return status
	}
	status.Status = plugins.LanguageServerSelectionStatusActive
	status.Severity = plugins.LanguageServerSelectionSeveritySuccess
	status.Message = fmt.Sprintf(
		`%q is active for %s in this workspace.`,
		*status.SelectedPluginID,
		languageName,
	)
	return status
}

func selectionStateForLanguage(
	selectedByLanguage map[string]*string,
	language string,
) (plugins.LanguageServerSelectionState, *string) {
	selectedPluginID, ok := selectedByLanguage[language]
	if !ok {
		return plugins.LanguageServerSelectionStateUnset, nil
	}
	if selectedPluginID == nil {
		return plugins.LanguageServerSelectionStateDisabled, nil
	}
	return plugins.LanguageServerSelectionStateSelected, cloneOptionalString(selectedPluginID)
}

func appliedLanguageServerPluginID(entries []plugins.PluginStatusEntry, language string) *string {
	normalizedLanguage := normalizeLanguageServerStatusLanguage(language)
	if normalizedLanguage == "" {
		return nil
	}
	for _, entry := range entries {
		if !languageServerStatusEntryAppliesLanguage(entry, normalizedLanguage) {
			continue
		}
		pluginID := strings.TrimSpace(entry.PluginID)
		if pluginID == "" {
			continue
		}
		return &pluginID
	}
	return nil
}

func primaryLanguageServerStatusByPluginID(
	entries []plugins.PluginStatusEntry,
) map[string]plugins.PluginStatusEntry {
	if len(entries) == 0 {
		return nil
	}
	primaryByPluginID := map[string]plugins.PluginStatusEntry{}
	for _, entry := range entries {
		pluginID := strings.TrimSpace(entry.PluginID)
		if pluginID == "" {
			continue
		}
		if _, ok := primaryByPluginID[pluginID]; ok {
			continue
		}
		primaryByPluginID[pluginID] = entry
	}
	if len(primaryByPluginID) == 0 {
		return nil
	}
	return primaryByPluginID
}

func buildLanguageServerProviderOptions(
	primaryByPluginID map[string]plugins.PluginStatusEntry,
	language string,
	selectedPluginID *string,
) []plugins.LanguageServerProviderOption {
	providers := make([]plugins.LanguageServerProviderOption, 0)
	seenPluginIDs := map[string]struct{}{}
	for pluginID, entry := range primaryByPluginID {
		if !languageServerStatusEntryIsActive(entry) || !languageServerStatusEntryProvidesLanguage(entry, language) {
			continue
		}
		providers = append(providers, plugins.LanguageServerProviderOption{
			PluginID:  pluginID,
			Name:      formatLanguageServerProviderName(entry),
			Available: true,
		})
		seenPluginIDs[pluginID] = struct{}{}
	}
	if selectedPluginID != nil {
		if _, ok := seenPluginIDs[*selectedPluginID]; !ok {
			entry, ok := primaryByPluginID[*selectedPluginID]
			name := *selectedPluginID
			if ok {
				name = formatLanguageServerProviderName(entry)
			}
			providers = append(providers, plugins.LanguageServerProviderOption{
				PluginID:  *selectedPluginID,
				Name:      name,
				Available: false,
			})
		}
	}
	slices.SortFunc(providers, func(a, b plugins.LanguageServerProviderOption) int {
		if a.Available != b.Available {
			if a.Available {
				return -1
			}
			return 1
		}
		return strings.Compare(a.PluginID, b.PluginID)
	})
	return providers
}

func primaryStatusEntryForSelectedPlugin(
	primaryByPluginID map[string]plugins.PluginStatusEntry,
	selectedPluginID *string,
) (plugins.PluginStatusEntry, bool) {
	if selectedPluginID == nil {
		return plugins.PluginStatusEntry{}, false
	}
	entry, ok := primaryByPluginID[*selectedPluginID]
	return entry, ok
}

func languageServerStatusEntryProvidesLanguage(entry plugins.PluginStatusEntry, language string) bool {
	normalizedLanguage := normalizeLanguageServerStatusLanguage(language)
	if normalizedLanguage == "" {
		return false
	}
	for _, registration := range entry.RegisteredLanguageServers {
		if normalizeLanguageServerStatusLanguage(registration.Language) == normalizedLanguage {
			return true
		}
	}
	return false
}

func languageServerStatusEntryAppliesLanguage(entry plugins.PluginStatusEntry, language string) bool {
	normalizedLanguage := normalizeLanguageServerStatusLanguage(language)
	if normalizedLanguage == "" {
		return false
	}
	for _, appliedLanguage := range entry.AppliedLanguageServerLanguages {
		if normalizeLanguageServerStatusLanguage(appliedLanguage) == normalizedLanguage {
			return true
		}
	}
	return false
}

func languageServerStatusEntryIsActive(entry plugins.PluginStatusEntry) bool {
	return entry.State == plugins.PluginRuntimeStateActive
}

func normalizeLanguageServerStatusLanguage(language string) string {
	return strings.ToLower(strings.TrimSpace(language))
}

func formatLanguageServerProviderName(entry plugins.PluginStatusEntry) string {
	name := strings.TrimSpace(entry.Name)
	pluginID := strings.TrimSpace(entry.PluginID)
	if name == "" || name == pluginID {
		return pluginID
	}
	return fmt.Sprintf("%s (%s)", name, pluginID)
}

func formatLanguageDisplayName(language string) string {
	normalizedLanguage := normalizeLanguageServerStatusLanguage(language)
	if normalizedLanguage == "" {
		return "Unknown"
	}
	return strings.ToUpper(normalizedLanguage[:1]) + normalizedLanguage[1:]
}

func formatLanguageServerLabel(language string) string {
	return fmt.Sprintf("%s language server", formatLanguageDisplayName(language))
}
