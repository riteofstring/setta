package projectstate

import (
	"strings"

	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

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
