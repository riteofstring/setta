package mcpx

import "strings"

const (
	ToolNameSeparator = "__"
	DefaultServerID   = "setta"
)

func BuildNamespacedToolName(serverID string, toolName string) string {
	return strings.TrimSpace(serverID) + ToolNameSeparator + strings.TrimSpace(toolName)
}

func SplitNamespacedToolName(toolName string) (string, string, bool) {
	trimmed := strings.TrimSpace(toolName)
	if !strings.Contains(trimmed, ToolNameSeparator) {
		return "", trimmed, false
	}
	serverID, baseName, _ := strings.Cut(trimmed, ToolNameSeparator)
	return serverID, baseName, true
}

func NormalizeToolName(toolName string) string {
	normalized := strings.TrimSpace(toolName)
	if normalized == "" {
		return ""
	}
	if strings.HasPrefix(normalized, "mcp__") {
		normalized = strings.TrimPrefix(normalized, "mcp__")
	}
	singlePrefix := DefaultServerID + "_"
	doublePrefix := DefaultServerID + ToolNameSeparator
	if strings.HasPrefix(normalized, singlePrefix) && !strings.HasPrefix(normalized, doublePrefix) {
		normalized = DefaultServerID + ToolNameSeparator + strings.TrimPrefix(normalized, singlePrefix)
	}
	return normalized
}
