package projectstate

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

const defaultAppSpecVersion = "v1"
const defaultAppThemeMode = "auto"

func EffectiveAppDefinition(document Document) AppDefinition {
	return effectiveAppDefinition(document)
}

func EffectiveAppSpecPath(document Document) string {
	current := effectiveAppDefinition(document)
	if trimmed := strings.TrimSpace(current.AppSpecPath); trimmed != "" {
		return trimmed
	}
	return appspec.DefaultPath()
}

func EffectiveAppThemeMode(document Document) string {
	current := effectiveAppDefinition(document)
	theme, err := decodeAppDefinitionJSONObject(current.Theme, "appDefinition.theme")
	if err != nil || theme == nil {
		return defaultAppThemeMode
	}
	if mode, ok := theme["mode"].(string); ok && strings.TrimSpace(mode) != "" {
		return mode
	}
	return defaultAppThemeMode
}

func effectiveAppDefinition(document Document) AppDefinition {
	if document.AppDefinition == nil {
		return AppDefinition{
			AppSpecVersion: defaultAppSpecVersion,
			CatalogID:      appspec.DefaultCatalogID,
		}
	}

	current := document.AppDefinition.Clone()
	if strings.TrimSpace(current.AppSpecVersion) == "" {
		current.AppSpecVersion = defaultAppSpecVersion
	}
	if strings.TrimSpace(current.CatalogID) == "" {
		current.CatalogID = appspec.DefaultCatalogID
	}
	return current
}

func decodeAppDefinitionJSONObject(raw RawJSON, field string) (map[string]any, error) {
	return decodeRawJSONObject(raw, field)
}

func decodeRawJSONObject(raw RawJSON, field string) (map[string]any, error) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, nil
	}

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode %s: %w", field, err)
	}
	if value == nil {
		return nil, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a JSON object", field)
	}
	return object, nil
}
