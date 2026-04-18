package plugins

import (
	"encoding/json"
)

func languageServerSettingsRoot(entry DiscoveredPlugin, pluginsState *PluginsStateFile) map[string]any {
	defaults := pluginLanguageServerDefaults(entry)
	current := runtimeCurrentConfig(entry, pluginsState)
	switch {
	case len(defaults) == 0 && len(current) == 0:
		return nil
	case len(defaults) == 0:
		return current
	case len(current) == 0:
		return defaults
	default:
		return mergeStringAnyMaps(defaults, current)
	}
}

func pluginLanguageServerDefaults(entry DiscoveredPlugin) map[string]any {
	_, schemaJSON, ok, err := loadPluginConfigSchemaDocument(entry)
	if err != nil || !ok {
		return nil
	}
	return pluginConfigSchemaDefaults(schemaJSON)
}

func mergeStringAnyMaps(base map[string]any, overlay map[string]any) map[string]any {
	switch {
	case len(base) == 0 && len(overlay) == 0:
		return nil
	case len(base) == 0:
		return cloneStringAnyMap(overlay)
	case len(overlay) == 0:
		return cloneStringAnyMap(base)
	}

	merged := cloneStringAnyMap(base)
	for key, overlayValue := range overlay {
		overlayMap, overlayIsMap := overlayValue.(map[string]any)
		baseMap, baseIsMap := merged[key].(map[string]any)
		if overlayIsMap && baseIsMap {
			merged[key] = mergeStringAnyMaps(baseMap, overlayMap)
			continue
		}
		merged[key] = cloneJSONValue(overlayValue)
	}
	return merged
}

func cloneJSONValue(value any) any {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var cloned any
	if err := json.Unmarshal(payload, &cloned); err != nil {
		return nil
	}
	return cloned
}
