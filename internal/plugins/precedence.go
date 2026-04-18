package plugins

import "strings"

func findPrimaryDiscoveredPlugin(entries []DiscoveredPlugin, pluginID string) (DiscoveredPlugin, bool) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return DiscoveredPlugin{}, false
	}
	for _, entry := range entries {
		if strings.TrimSpace(entry.PluginID) != trimmedPluginID {
			continue
		}
		return entry, true
	}
	return DiscoveredPlugin{}, false
}

func findPrimaryDiscoveredPluginForSourceManager(
	entries []DiscoveredPlugin,
	pluginID string,
	sourceManager PluginSourceManager,
) (DiscoveredPlugin, bool) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return DiscoveredPlugin{}, false
	}
	for _, entry := range entries {
		if strings.TrimSpace(entry.PluginID) != trimmedPluginID {
			continue
		}
		if entry.SourceManager != sourceManager {
			continue
		}
		return entry, true
	}
	return DiscoveredPlugin{}, false
}

func primaryDiscoveredPluginEntries(entries []DiscoveredPlugin) []DiscoveredPlugin {
	if len(entries) == 0 {
		return nil
	}

	selected := make([]DiscoveredPlugin, 0, len(entries))
	seen := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		pluginID := strings.TrimSpace(entry.PluginID)
		if pluginID == "" {
			continue
		}
		if _, ok := seen[pluginID]; ok {
			continue
		}
		seen[pluginID] = struct{}{}
		selected = append(selected, entry)
	}
	return selected
}
