package plugins

import (
	"fmt"
	"strings"

	"setta/internal/config"
)

func (s *Service) addPendingRestartBackendIDLocked(pluginID string, languageServerOnly bool) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	syncPendingRestartBackendState(&state, pluginID, languageServerOnly)
	return s.store.SavePluginsState(state)
}

func (s *Service) discardPendingRestartBackendIDLocked(pluginID string) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	clearPendingRestartBackendState(&state, pluginID)
	return s.store.SavePluginsState(state)
}

func pluginConfigKey(pluginID string, scope PluginScope) string {
	return fmt.Sprintf("%s:%s", scope, pluginID)
}

func entryHasLanguageServerOnlyBackendRuntime(entry DiscoveredPlugin) bool {
	if !entry.HasBackend() {
		return false
	}
	return capabilitiesHaveLanguageServerOnlyBackendRuntime(entry.EffectiveCapabilities)
}

func manifestHasLanguageServerOnlyBackendRuntime(manifest *PluginManifest, serverMode config.Mode) bool {
	if manifest == nil || manifest.Backend == nil {
		return false
	}
	_, effectiveCapabilities, _, err := resolveFilesystemPluginCapabilities(manifest.Capabilities, serverMode)
	if err != nil {
		return false
	}
	return capabilitiesHaveLanguageServerOnlyBackendRuntime(effectiveCapabilities)
}

func capabilitiesHaveLanguageServerOnlyBackendRuntime(capabilities []string) bool {
	hasLanguageServer := false
	for _, capability := range capabilities {
		switch capability {
		case "registerLanguageServer":
			hasLanguageServer = true
		case "registerCodegenTarget", "registerListenerEndpoint", "registerMcpTools", "registerRouter", "registerStaticDir":
			return false
		}
	}
	return hasLanguageServer
}

func (s *Service) pendingRestartLanguageServerOnlyForManifest(manifest *PluginManifest, fallback bool) bool {
	if manifest == nil || manifest.Backend == nil {
		return fallback
	}
	return manifestHasLanguageServerOnlyBackendRuntime(manifest, s.discoveryService.serverMode)
}

func syncPendingRestartBackendState(state *PluginsStateFile, pluginID string, languageServerOnly bool) bool {
	if state == nil {
		return false
	}
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}
	stateChanged := false
	if !containsString(state.PendingRestartBackendPluginIDs, trimmedPluginID) {
		state.PendingRestartBackendPluginIDs = appendIfMissing(state.PendingRestartBackendPluginIDs, trimmedPluginID)
		stateChanged = true
	}
	hasLanguageServerOnly := containsString(state.PendingRestartLanguageServerOnlyPluginIDs, trimmedPluginID)
	switch {
	case languageServerOnly && !hasLanguageServerOnly:
		state.PendingRestartLanguageServerOnlyPluginIDs = appendIfMissing(state.PendingRestartLanguageServerOnlyPluginIDs, trimmedPluginID)
		stateChanged = true
	case !languageServerOnly && hasLanguageServerOnly:
		state.PendingRestartLanguageServerOnlyPluginIDs = removeString(state.PendingRestartLanguageServerOnlyPluginIDs, trimmedPluginID)
		stateChanged = true
	}
	return stateChanged
}

func clearPendingRestartBackendState(state *PluginsStateFile, pluginID string) bool {
	if state == nil {
		return false
	}
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}
	stateChanged := false
	if containsString(state.PendingRestartBackendPluginIDs, trimmedPluginID) {
		state.PendingRestartBackendPluginIDs = removeString(state.PendingRestartBackendPluginIDs, trimmedPluginID)
		stateChanged = true
	}
	if containsString(state.PendingRestartLanguageServerOnlyPluginIDs, trimmedPluginID) {
		state.PendingRestartLanguageServerOnlyPluginIDs = removeString(state.PendingRestartLanguageServerOnlyPluginIDs, trimmedPluginID)
		stateChanged = true
	}
	return stateChanged
}

func selectedPendingRestartLanguageServerOnlyPluginIDs(
	pendingLanguageServerOnlyPluginIDs []string,
	pluginIDs []string,
) map[string]struct{} {
	selected := stringSet(pluginIDs)
	if len(selected) == 0 {
		return nil
	}

	removable := map[string]struct{}{}
	for _, pluginID := range pendingLanguageServerOnlyPluginIDs {
		if _, ok := selected[pluginID]; !ok {
			continue
		}
		removable[pluginID] = struct{}{}
	}
	if len(removable) == 0 {
		return nil
	}
	return removable
}

func removeString(values []string, target string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if value == target {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func removeStrings(values []string, removals map[string]struct{}) []string {
	if len(values) == 0 || len(removals) == 0 {
		return values
	}
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := removals[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func appendIfMissing(values []string, target string) []string {
	for _, value := range values {
		if value == target {
			return values
		}
	}
	return append(values, target)
}

func stringSet(values []string) map[string]struct{} {
	if len(values) == 0 {
		return nil
	}
	set := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		set[trimmed] = struct{}{}
	}
	if len(set) == 0 {
		return nil
	}
	return set
}
