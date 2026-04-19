package externalagents

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
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

func normalizeAppGenerationMode(value *string) (*string, error) {
	normalized, ok := agentruns.NormalizeOptionalAppGenerationMode(value)
	if !ok {
		return nil, ErrAppGenerationModeInvalid
	}
	return normalized, nil
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

func buildAppGenerationModePrompt(mode *string, appSpecStreamingEnabled bool, referenceImageURL *string, referenceImageNotes *string) string {
	resolvedMode := strings.TrimSpace(derefOptionalString(mode))
	if resolvedMode == "" {
		return ""
	}

	lines := appGenerationModePromptHeader(resolvedMode, appSpecStreamingEnabled)
	lines = append(lines, appGenerationAppSpecPromptLines(resolvedMode, appSpecStreamingEnabled)...)
	lines = append(lines, appGenerationModeSpecificPromptLines(
		resolvedMode,
		appSpecStreamingEnabled,
		strings.TrimSpace(derefOptionalString(referenceImageURL)),
		strings.TrimSpace(derefOptionalString(referenceImageNotes)),
	)...)
	return strings.Join(lines, "\n")
}

func appGenerationModePromptHeader(mode string, appSpecStreamingEnabled bool) []string {
	return []string{
		"## App spec generation mode",
		fmt.Sprintf("- mode: %s", mode),
		fmt.Sprintf("- streamingPreview: %s", enabledDisabledLabel(appSpecStreamingEnabled)),
	}
}

func appGenerationAppSpecPromptLines(mode string, appSpecStreamingEnabled bool) []string {
	if !modeUsesAppSpecTools(mode) {
		return nil
	}

	lines := []string{
		"- If you are generating/updating the App spec (json-render):",
		"  - Use catalog-compatible components only.",
		"  - Persist via Setta app tools.",
	}
	if appSpecStreamingEnabled {
		return append(lines,
			"  - Use `setta__stream_app_definition` and stream patches into its `patches` string arg.",
			"  - For updates, omit `baseAppSpec` to patch the currently stored app spec (or pass `baseAppSpec` explicitly).",
		)
	}
	return append(lines,
		"  - Prefer `setta__set_app_definition` with the full UITree appSpec payload.",
		"  - Optionally call `setta__validate_app_definition` first and fix errors before persisting.",
	)
}

func modeUsesAppSpecTools(mode string) bool {
	switch mode {
	case string(agentruns.AppGenerationModeJSONRender),
		string(agentruns.AppGenerationModeJSONRenderWithImage),
		string(agentruns.AppGenerationModePromptBuilder):
		return true
	default:
		return false
	}
}

func appGenerationModeSpecificPromptLines(
	mode string,
	appSpecStreamingEnabled bool,
	referenceImageURL string,
	referenceImageNotes string,
) []string {
	switch mode {
	case string(agentruns.AppGenerationModeJSONRenderWithImage):
		return appendReferenceImagePromptLines(referenceImageURL, referenceImageNotes)
	case string(agentruns.AppGenerationModePromptBuilder):
		return []string{
			"- Prompt-builder flow: keep responses concise and tool-oriented so generation can run from the App pane without manual copy/paste.",
		}
	case string(agentruns.AppGenerationModeMCPServer):
		return mcpServerModePromptLines(appSpecStreamingEnabled)
	default:
		return nil
	}
}

func appendReferenceImagePromptLines(referenceImageURL string, referenceImageNotes string) []string {
	lines := []string{
		"- Prioritize reference-image fidelity in this order: layout structure, spacing rhythm, typography scale, then color intent.",
		"- If exact parity is impossible with catalog constraints, preserve hierarchy and explain the closest approximation.",
	}
	if referenceImageURL == "" {
		return lines
	}

	lines = append(lines,
		fmt.Sprintf("- Reference image URL: %s", referenceImageURL),
		"- Use this image as layout/style guidance when composing the app spec.",
	)
	if referenceImageNotes == "" {
		return lines
	}
	return append(lines, fmt.Sprintf("- Reference image notes: %s", referenceImageNotes))
}

func mcpServerModePromptLines(appSpecStreamingEnabled bool) []string {
	lines := []string{
		"- MCP-server flow: use MCP tools as the source of truth for design artifacts when available.",
		"- For Figma-oriented requests, support both paths:",
		"  - Pull an existing Figma design into a JSON-render appSpec.",
		"  - Generate/update in Figma first, then pull the resulting design back into Setta.",
	}
	if appSpecStreamingEnabled {
		return append(lines, "- After MCP design retrieval, persist into Setta via `setta__stream_app_definition`.")
	}
	return append(lines, "- After MCP design retrieval, persist into Setta via `setta__set_app_definition`.")
}

func enabledDisabledLabel(enabled bool) string {
	if enabled {
		return "enabled"
	}
	return "disabled"
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
