package plugins

import (
	"encoding/json"
	"os"
	"strings"
)

func resolvePluginConfigSchemaPath(entry DiscoveredPlugin) (string, bool, error) {
	if entry.Manifest == nil {
		return "", false, nil
	}
	trimmedPath := strings.TrimSpace(entry.Manifest.ConfigSchemaPath)
	if trimmedPath == "" {
		return "", false, nil
	}
	schemaPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedPath, "plugin config schema")
	if err != nil {
		return "", false, err
	}
	return schemaPath, true, nil
}

func loadPluginConfigSchemaJSON(schemaPath string) (map[string]any, error) {
	payload, err := os.ReadFile(schemaPath)
	if err != nil {
		return nil, err
	}
	var schemaJSON map[string]any
	if err := json.Unmarshal(payload, &schemaJSON); err != nil {
		return nil, err
	}
	if schemaJSON == nil {
		return map[string]any{}, nil
	}
	return schemaJSON, nil
}

func loadPluginConfigSchemaDocument(entry DiscoveredPlugin) (string, map[string]any, bool, error) {
	schemaPath, ok, err := resolvePluginConfigSchemaPath(entry)
	if err != nil || !ok {
		return "", nil, ok, err
	}
	schemaJSON, err := loadPluginConfigSchemaJSON(schemaPath)
	if err != nil {
		return schemaPath, nil, true, err
	}
	return schemaPath, schemaJSON, true, nil
}

func validateDiscoveredPluginConfigSchema(entry DiscoveredPlugin) error {
	schemaPath, _, ok, err := loadPluginConfigSchemaDocument(entry)
	if err == nil || !ok {
		return err
	}
	return newServiceError(ServiceErrorCodeConfigSchemaInvalid, "Invalid plugin config schema JSON: %s", schemaPath)
}

func pluginConfigSchemaDefaultValue(schema map[string]any) (any, bool) {
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
		defaultValue, ok := pluginConfigSchemaDefaultValue(property)
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

func pluginConfigSchemaDefaults(schemaJSON map[string]any) map[string]any {
	defaultValue, ok := pluginConfigSchemaDefaultValue(schemaJSON)
	if !ok {
		return nil
	}
	defaultMap, ok := defaultValue.(map[string]any)
	if !ok {
		return nil
	}
	return defaultMap
}
