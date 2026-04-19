package externalagents

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/chatmodes"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
)

const (
	maxReferenceImageURLChars   = 4096
	maxReferenceImageNotesChars = 100000
)

var (
	ErrAppGenerationModeInvalid                 = errors.New("appGenerationMode is invalid")
	ErrAppGenerationReferenceImageURLTooLarge   = errors.New("appGenerationReferenceImageUrl is too large. Reduce it or omit it.")
	ErrAppGenerationReferenceImageNotesTooLarge = errors.New("appGenerationReferenceImageNotes is too large. Reduce it or omit it.")
)

func normalizeAppGenerationModeWithResolver(
	resolver chatmodes.AppGenerationModeResolver,
	value *string,
) (*string, error) {
	if resolver == nil {
		resolver = (*chatmodes.AppGenerationModeRegistry)(nil)
	}
	normalized, ok := resolver.NormalizeOptionalMode(value)
	if !ok {
		return nil, ErrAppGenerationModeInvalid
	}
	return normalized, nil
}

func appGenerationModeAllowsReferenceImage(
	resolver chatmodes.AppGenerationModeResolver,
	mode *string,
) bool {
	if resolver == nil {
		return false
	}
	return resolver.AllowsReferenceImage(mode)
}

func normalizeReferenceImageInputs(referenceImageURL *string, referenceImageNotes *string) (*string, *string, error) {
	normalizedURL := strings.TrimSpace(derefOptionalString(referenceImageURL))
	normalizedNotes := strings.TrimSpace(derefOptionalString(referenceImageNotes))
	if len(normalizedURL) > maxReferenceImageURLChars {
		return nil, nil, ErrAppGenerationReferenceImageURLTooLarge
	}
	if len(normalizedNotes) > maxReferenceImageNotesChars {
		return nil, nil, ErrAppGenerationReferenceImageNotesTooLarge
	}
	var resolvedURL *string
	var resolvedNotes *string
	if normalizedURL != "" {
		resolvedURL = stringPtr(normalizedURL)
	}
	if normalizedNotes != "" {
		resolvedNotes = stringPtr(normalizedNotes)
	}
	return resolvedURL, resolvedNotes, nil
}

func buildAppGenerationModePromptWithResolver(
	resolver chatmodes.AppGenerationModeResolver,
	mode *string,
	appSpecStreamingEnabled bool,
	referenceImageURL *string,
	referenceImageNotes *string,
) string {
	if resolver == nil {
		return ""
	}
	return resolver.BuildPrompt(mode, chatmodes.AppGenerationPromptOptions{
		AppSpecStreamingEnabled: appSpecStreamingEnabled,
		ReferenceImageURL:       referenceImageURL,
		ReferenceImageNotes:     referenceImageNotes,
	})
}

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
