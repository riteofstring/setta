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
	selection := plugins.WatchCodeProviderSelectionFromSnapshot(snapshot)
	return selection.ActivePluginIDMatches(pluginID)
}

func watchCodeProviderCandidate(snapshot plugins.DiscoverySnapshot, pluginID string) bool {
	selection := plugins.WatchCodeProviderSelectionFromSnapshot(snapshot)
	return selection.ContainsPluginID(pluginID)
}

func watchCodeBackendUISettingRegistration(registration plugins.PluginRegisteredUISetting) bool {
	if watchcodecontracts.IsBackendLocalSettingID(registration.LocalSettingID) ||
		watchcodecontracts.IsBackendUISettingHandlerID(registration.ReadHandlerID) {
		return true
	}
	return registration.WriteHandlerID != nil && watchcodecontracts.IsBackendUISettingHandlerID(*registration.WriteHandlerID)
}

func watchCodeProviderUISettingUnavailableError(pluginID string) error {
	return &plugins.ServiceError{
		Code:    plugins.ServiceErrorCodeNotFound,
		Message: "Watch Code provider is unavailable for UI setting access: " + strings.TrimSpace(pluginID),
	}
}
