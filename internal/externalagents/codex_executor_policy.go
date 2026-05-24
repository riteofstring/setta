package externalagents

import (
	"strings"
)

func mapCodexApprovalPolicy(preferred string, fallback string) string {
	raw := strings.TrimSpace(preferred)
	if raw == "" {
		raw = strings.TrimSpace(fallback)
	}
	if raw == "" {
		return ""
	}
	normalizedKey := strings.ToLower(strings.ReplaceAll(raw, "_", "-"))
	switch normalizedKey {
	case "unlesstrusted", "unless-trusted", "untrusted":
		return "untrusted"
	case "onrequested", "on-requested", "onrequest", "on-request":
		return "on-request"
	case "onfailure", "on-failure":
		return "on-failure"
	default:
		return raw
	}
}

func buildCodexSandboxPolicy(preferred string, fallback string) map[string]any {
	raw := strings.TrimSpace(preferred)
	if raw == "" {
		raw = strings.TrimSpace(fallback)
	}
	if raw == "" {
		return nil
	}
	switch strings.ToLower(strings.ReplaceAll(raw, "_", "-")) {
	case "workspace-write":
		return map[string]any{"type": "workspaceWrite"}
	case "read-only":
		return map[string]any{"type": "readOnly"}
	case "danger-full-access":
		return map[string]any{"type": "dangerFullAccess"}
	case "external":
		return map[string]any{"type": "externalSandbox"}
	default:
		return map[string]any{"type": raw}
	}
}

func ensureAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	return cloneAnyMap(input)
}

func ensureAnyMapFromValue(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneAnyMap(typed)
	case map[string]string:
		converted := map[string]any{}
		for key, item := range typed {
			converted[key] = item
		}
		return converted
	default:
		return map[string]any{}
	}
}

func cloneStringAnyMapToStringMap(input map[string]string) map[string]string {
	if input == nil {
		return map[string]string{}
	}
	cloned := map[string]string{}
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func envMapToList(envMap map[string]string) []string {
	envList := make([]string, 0, len(envMap))
	for key, value := range envMap {
		envList = append(envList, key+"="+value)
	}
	return envList
}

func stringValue(raw any) string {
	if value, ok := raw.(string); ok {
		return value
	}
	return ""
}

func mapValue(raw any) (map[string]any, bool) {
	value, ok := raw.(map[string]any)
	return value, ok
}

func envWhitelistContains(whitelist []string, target string) bool {
	for _, entry := range whitelist {
		if strings.EqualFold(strings.TrimSpace(entry), target) {
			return true
		}
	}
	return false
}
