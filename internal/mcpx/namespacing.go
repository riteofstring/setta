package mcpx

import "strings"

const (
	ToolNameSeparator       = "__"
	ToolNameMCPPrefix       = "mcp__"
	DefaultServerID         = "setta"
	DefaultServerSingleTool = DefaultServerID + "_"
	DefaultServerDoubleTool = DefaultServerID + ToolNameSeparator
	AskUserQuestionAlias    = "question"
	AskUserQuestionToolName = "AskUserQuestion"
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
	if strings.HasPrefix(normalized, ToolNameMCPPrefix) {
		normalized = strings.TrimPrefix(normalized, ToolNameMCPPrefix)
	}
	if strings.HasPrefix(normalized, DefaultServerSingleTool) && !strings.HasPrefix(normalized, DefaultServerDoubleTool) {
		normalized = DefaultServerDoubleTool + strings.TrimPrefix(normalized, DefaultServerSingleTool)
	}
	return normalized
}
