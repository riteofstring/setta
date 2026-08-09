package app

import (
	"fmt"
	"strings"

	"setta/internal/plugins"
)

const watchCodeLanguageServerDependencyLanguage = "python"

func applyWatchCodeLanguageServerDependencyStatus(
	response *plugins.PluginRuntimeResponse,
) {
	if response == nil || response.FeatureCapabilities == nil {
		return
	}

	capabilities := response.FeatureCapabilities.WatchCode
	capabilities.LanguageServerDependency = buildWatchCodeLanguageServerDependencyStatus(
		capabilities,
		response.Status.LanguageServerSelections,
	)
	response.FeatureCapabilities.WatchCode = capabilities
}

func buildWatchCodeLanguageServerDependencyStatus(
	capabilities plugins.PluginWatchCodeCapabilities,
	selections []plugins.LanguageServerSelectionStatus,
) *plugins.PluginWatchCodeLanguageServerDependencyStatus {
	status := plugins.PluginWatchCodeLanguageServerDependencyStatus{
		Language: watchCodeLanguageServerDependencyLanguage,
		Required: capabilities.PluginEnabled &&
			capabilities.Python &&
			capabilities.RequiresLanguageServer,
	}

	switch {
	case !capabilities.PluginEnabled || !capabilities.Python:
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusUnavailable
		status.Message = "Watch Code provider is unavailable."
		return &status
	case !capabilities.RequiresLanguageServer:
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusNotRequired
		status.Message = "Watch Code does not require a Python language server."
		return &status
	}

	selection, ok := watchCodeLanguageServerSelectionStatus(selections)
	if !ok {
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusMissing
		status.Message = "Watch Code requires an active Python language server, but no Python language-server status is available."
		return &status
	}

	status.SelectedPluginID = cloneOptionalString(selection.SelectedPluginID)
	status.AppliedPluginID = cloneOptionalString(selection.AppliedPluginID)
	status.RestartRequired = selection.RestartRequired
	switch selection.Status {
	case plugins.LanguageServerSelectionStatusActive:
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusActive
		status.Message = activeWatchCodeLanguageServerDependencyMessage(selection.AppliedPluginID)
	case plugins.LanguageServerSelectionStatusDisabled:
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusDisabled
		status.Message = "Watch Code is enabled, but Python language-server support is turned off for this workspace."
	case plugins.LanguageServerSelectionStatusPendingRestart:
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusPendingRestart
		status.Message = "Watch Code requires a Python language server, but the current selection is pending restart."
	default:
		status.Status = plugins.PluginWatchCodeLanguageServerDependencyStatusMissing
		status.Message = missingWatchCodeLanguageServerDependencyMessage(selection)
	}
	return &status
}

func watchCodeLanguageServerSelectionStatus(
	selections []plugins.LanguageServerSelectionStatus,
) (plugins.LanguageServerSelectionStatus, bool) {
	for _, selection := range selections {
		if strings.EqualFold(
			strings.TrimSpace(selection.Language),
			watchCodeLanguageServerDependencyLanguage,
		) {
			return selection, true
		}
	}
	return plugins.LanguageServerSelectionStatus{}, false
}

func activeWatchCodeLanguageServerDependencyMessage(appliedPluginID *string) string {
	if appliedPluginID == nil || strings.TrimSpace(*appliedPluginID) == "" {
		return "Watch Code Python language-server dependency is active."
	}
	return fmt.Sprintf(
		"Watch Code Python language-server dependency is active through %q.",
		strings.TrimSpace(*appliedPluginID),
	)
}

func missingWatchCodeLanguageServerDependencyMessage(
	selection plugins.LanguageServerSelectionStatus,
) string {
	detail := strings.TrimSpace(selection.Message)
	if detail == "" {
		return "Watch Code requires an active Python language server."
	}
	return "Watch Code requires an active Python language server. " + detail
}
