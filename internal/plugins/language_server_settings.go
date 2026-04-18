package plugins

import (
	"encoding/json"
	"os"
	"strings"
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
	if entry.Manifest == nil {
		return nil
	}
	trimmedSchemaPath := strings.TrimSpace(entry.Manifest.ConfigSchemaPath)
	if trimmedSchemaPath == "" {
		return nil
	}
	schemaPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedSchemaPath, "plugin config schema")
	if err != nil {
		return nil
	}
	payload, err := os.ReadFile(schemaPath)
	if err != nil {
		return nil
	}
	var schema map[string]any
	if err := json.Unmarshal(payload, &schema); err != nil {
		return nil
	}
	defaultValue, ok := schemaDefaultValue(schema)
	if !ok {
		return nil
	}
	defaultMap, ok := defaultValue.(map[string]any)
	if !ok {
		return nil
	}
	return defaultMap
}

func schemaDefaultValue(schema map[string]any) (any, bool) {
	if len(schema) == 0 {
		return nil, false
	}
	if defaultValue, ok := schema["default"]; ok {
		return cloneJSONValue(defaultValue), true
	}

	properties, ok := schema["properties"].(map[string]any)
	if !ok || len(properties) == 0 {
		return nil, false
	}

	defaults := map[string]any{}
	for key, rawProperty := range properties {
		property, ok := rawProperty.(map[string]any)
		if !ok {
			continue
		}
		defaultValue, ok := schemaDefaultValue(property)
		if !ok {
			continue
		}
		defaults[key] = defaultValue
	}
	if len(defaults) == 0 {
		return nil, false
	}
	return defaults, true
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
