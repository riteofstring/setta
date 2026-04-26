package app

import (
	"strings"

	"setta/internal/plugins"
	"setta/internal/watchcodecontracts"
)

func filterUnavailableWatchCodeBackendUISettings(
	snapshot plugins.DiscoverySnapshot,
	pluginID string,
	registrations []plugins.PluginRegisteredUISetting,
) []plugins.PluginRegisteredUISetting {
	if !watchCodeProviderCandidate(snapshot, pluginID) {
		return registrations
	}

	filtered := make([]plugins.PluginRegisteredUISetting, 0, len(registrations))
	for _, registration := range registrations {
		if watchCodeBackendUISettingRegistration(registration) {
			continue
		}
		filtered = append(filtered, registration)
	}
	return filtered
}

func watchCodeBackendUISettingCandidate(
	snapshot plugins.DiscoverySnapshot,
	pluginID string,
	handlerID string,
) bool {
	return watchCodeProviderCandidate(snapshot, pluginID) &&
		watchcodecontracts.IsBackendUISettingHandlerID(handlerID)
}

func watchCodeBackendUISettingAccessError(
	snapshot plugins.DiscoverySnapshot,
	pluginID string,
	host *watchCodeBackendRouteHost,
) error {
	if watchCodeProviderCandidateSelected(snapshot, pluginID) && host != nil {
		return nil
	}
	return watchCodeProviderUISettingUnavailableError(pluginID)
}

func watchCodeProviderCandidateSelected(snapshot plugins.DiscoverySnapshot, pluginID string) bool {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}
	selection := plugins.WatchCodeProviderSelectionFromSnapshot(snapshot)
	return selection.Status == plugins.PluginWatchCodeProviderSelectionStatusActive &&
		selection.SelectedPluginID != nil &&
		strings.TrimSpace(*selection.SelectedPluginID) == trimmedPluginID
}

func watchCodeProviderCandidate(snapshot plugins.DiscoverySnapshot, pluginID string) bool {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}
	selection := plugins.WatchCodeProviderSelectionFromSnapshot(snapshot)
	if selection.SelectedPluginID != nil && strings.TrimSpace(*selection.SelectedPluginID) == trimmedPluginID {
		return true
	}
	for _, candidates := range [][]string{
		selection.ActivePluginIDs,
		selection.DisabledPluginIDs,
		selection.InvalidPluginIDs,
		selection.PendingRestartPluginIDs,
		selection.ConflictingPluginIDs,
	} {
		if stringSliceContainsTrimmed(candidates, trimmedPluginID) {
			return true
		}
	}
	return false
}

func watchCodeBackendUISettingRegistration(registration plugins.PluginRegisteredUISetting) bool {
	if watchcodecontracts.IsBackendLocalSettingID(registration.LocalSettingID) ||
		watchcodecontracts.IsBackendUISettingHandlerID(registration.ReadHandlerID) {
		return true
	}
	return registration.WriteHandlerID != nil && watchcodecontracts.IsBackendUISettingHandlerID(*registration.WriteHandlerID)
}

func stringSliceContainsTrimmed(values []string, expected string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == expected {
			return true
		}
	}
	return false
}

func watchCodeProviderUISettingUnavailableError(pluginID string) error {
	return &plugins.ServiceError{
		Code:    plugins.ServiceErrorCodeNotFound,
		Message: "Watch Code provider is unavailable for UI setting access: " + strings.TrimSpace(pluginID),
	}
}
