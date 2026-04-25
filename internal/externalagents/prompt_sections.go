package externalagents

import (
	"fmt"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/chatmodes"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
)

var (
	ErrAppGenerationModeInvalid                 = chatmodes.ErrAppGenerationModeInvalid
	ErrAppGenerationReferenceImageURLTooLarge   = chatmodes.ErrAppGenerationReferenceImageURLTooLarge
	ErrAppGenerationReferenceImageNotesTooLarge = chatmodes.ErrAppGenerationReferenceImageNotesTooLarge
)

func buildExternalProfilePrompt(profile *agentprofiles.Profile) string {
	if profile == nil {
		return ""
	}
	profileLines := []string{}
	if trimmed := strings.TrimSpace(profile.Name); trimmed != "" {
		profileLines = append(profileLines, fmt.Sprintf("- name: %s", trimmed))
	}
	if trimmed := strings.TrimSpace(profile.Description); trimmed != "" {
		profileLines = append(profileLines, fmt.Sprintf("- description: %s", trimmed))
	}
	systemPrompt := strings.TrimSpace(profile.SystemPrompt)
	if len(profileLines) == 0 && systemPrompt == "" {
		return ""
	}
	lines := []string{"## Agent profile"}
	lines = append(lines, profileLines...)
	if systemPrompt == "" {
		return strings.Join(lines, "\n")
	}
	return strings.Join(lines, "\n") + "\n\n" + systemPrompt
}

func buildSettaMCPAwarenessPrompt(
	toolType externalagentconfigs.ToolType,
	settaStatus *mcpx.ServerRuntimeStatus,
) string {
	if toolType != externalagentconfigs.ToolTypeCodex {
		return ""
	}

	lines := []string{
		"## Setta MCP availability",
		"- Setta MCP tools are namespaced as `mcp__setta__<toolName>`.",
		"- Do not use `list_mcp_resources` or `list_mcp_resource_templates` to decide whether Setta MCP tools are available.",
		"- Resources and resource templates are separate from MCP tool registration and may be empty even when Setta MCP tools are available.",
		"- If the user asks about Setta MCP tool availability or count, answer from the `mcp__setta__...` tools in your tool inventory.",
	}
	if settaStatus == nil {
		return strings.Join(lines, "\n")
	}
	lines = append(lines, fmt.Sprintf(
		"- Last known Setta MCP runtime status: %s with %d tool%s.",
		string(settaStatus.State),
		settaStatus.ToolCount,
		pluralSuffix(settaStatus.ToolCount),
	))
	return strings.Join(lines, "\n")
}

func pluralSuffix(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}
