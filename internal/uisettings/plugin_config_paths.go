package uisettings

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

func requireNonEmptyString(raw any) (string, error) {
	value, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("expected non-empty string")
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("expected non-empty string")
	}
	return trimmed, nil
}

func readPluginConfigPathValue(config map[string]any, configPath []string, defaultValue any, pluginID string) (any, error) {
	currentValue := any(config)
	traversedSegments := make([]string, 0, len(configPath))
	for _, segment := range configPath {
		node, ok := currentValue.(map[string]any)
		if !ok {
			mismatchPath := "<root>"
			if len(traversedSegments) > 0 {
				mismatchPath = strings.Join(traversedSegments, ".")
			}
			return nil, newSettingError(
				ErrorCodeMutationFailed,
				"Plugin %s config path %s contains a non-object node at %s.",
				pluginID,
				strings.Join(configPath, "."),
				mismatchPath,
			)
		}
		value, ok := node[segment]
		if !ok {
			return cloneJSONValue(defaultValue), nil
		}
		traversedSegments = append(traversedSegments, segment)
		currentValue = value
	}
	return cloneJSONValue(currentValue), nil
}

func writePluginConfigPathValue(config map[string]any, configPath []string, value any, pluginID string) (map[string]any, error) {
	if len(configPath) == 0 {
		return nil, newSettingError(ErrorCodeMutationFailed, "Plugin %s config path must not be empty.", pluginID)
	}
	nextConfig := cloneStringAnyMap(config)
	current := nextConfig
	for index, segment := range configPath[:len(configPath)-1] {
		existing, ok := current[segment]
		if !ok || existing == nil {
			child := map[string]any{}
			current[segment] = child
			current = child
			continue
		}
		child, ok := existing.(map[string]any)
		if !ok {
			mismatchPath := "<root>"
			if index >= 0 {
				mismatchPath = strings.Join(configPath[:index+1], ".")
			}
			return nil, newSettingError(
				ErrorCodeMutationFailed,
				"Plugin %s config path %s contains a non-object node at %s.",
				pluginID,
				strings.Join(configPath, "."),
				mismatchPath,
			)
		}
		current = child
	}
	current[configPath[len(configPath)-1]] = cloneJSONValue(value)
	return nextConfig, nil
}

func cloneStringAnyMap(values map[string]any) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	cloned, ok := cloneJSONValue(values).(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloned
}

func buildPluginSettingID(pluginID string, localSettingID string) string {
	return pluginSettingPrefix + strings.TrimSpace(pluginID) + "::" + strings.TrimSpace(localSettingID)
}

func pluginSettingKey(pluginID string, localSettingID string) string {
	return strings.TrimSpace(pluginID) + "::" + strings.TrimSpace(localSettingID)
}

func parsePluginSettingID(settingID string) (string, string, bool) {
	if !strings.HasPrefix(settingID, pluginSettingPrefix) {
		return "", "", false
	}
	remainder := strings.TrimPrefix(settingID, pluginSettingPrefix)
	parts := strings.SplitN(remainder, "::", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	pluginID := strings.TrimSpace(parts[0])
	localSettingID := strings.TrimSpace(parts[1])
	if pluginID == "" || localSettingID == "" {
		return "", "", false
	}
	return pluginID, localSettingID, true
}

func pluginHasRegisterPaneCapability(capabilities []string) bool {
	for _, capability := range capabilities {
		if strings.TrimSpace(capability) == pluginRegisterPaneCapability {
			return true
		}
	}
	return false
}

func pluginHasRegisterUISettingsCapability(capabilities []string) bool {
	for _, capability := range capabilities {
		if strings.TrimSpace(capability) == pluginRegisterUISettingsCapability {
			return true
		}
	}
	return false
}

func pluginHasAnyUISettingsCapability(capabilities []string) bool {
	return pluginHasRegisterPaneCapability(capabilities) || pluginHasRegisterUISettingsCapability(capabilities)
}

// Keep this key builder aligned with the frontend's buildPluginPaneOverviewTabName:
// the backend emits canonical reveal keys, while the frontend must build and
// parse identical keys locally for routing and tab state without a round trip.
func buildPluginPaneOverviewTabKey(pluginID string, paneID string) string {
	return string(PluginOverviewTabPrefixValue) + ":" + encodeURIComponent(pluginID) + ":" + encodeURIComponent(paneID)
}

func encodeURIComponent(raw string) string {
	var builder strings.Builder
	builder.Grow(len(raw))
	for _, r := range raw {
		if isEncodeURIComponentSafe(r) {
			builder.WriteRune(r)
			continue
		}
		var buffer [utf8.UTFMax]byte
		size := utf8.EncodeRune(buffer[:], r)
		for _, b := range buffer[:size] {
			builder.WriteByte('%')
			builder.WriteString(fmt.Sprintf("%02X", b))
		}
	}
	return builder.String()
}

func isEncodeURIComponentSafe(r rune) bool {
	if r >= 'a' && r <= 'z' {
		return true
	}
	if r >= 'A' && r <= 'Z' {
		return true
	}
	if r >= '0' && r <= '9' {
		return true
	}
	switch r {
	case '-', '_', '.', '!', '~', '*', '\'', '(', ')':
		return true
	default:
		return false
	}
}
