package externalagents

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/agentprofiles"
)

const (
	AppGenerationModeJSONRender          = "json_render"
	AppGenerationModeJSONRenderWithImage = "json_render_with_image"
	AppGenerationModePromptBuilder       = "prompt_builder"
	AppGenerationModeMCPServer           = "mcp_server"

	maxReferenceImageURLChars   = 4096
	maxReferenceImageNotesChars = 100000
)

var (
	ErrAppGenerationModeInvalid                 = errors.New("appGenerationMode is invalid")
	ErrAppGenerationReferenceImageURLTooLarge   = errors.New("appGenerationReferenceImageUrl is too large. Reduce it or omit it.")
	ErrAppGenerationReferenceImageNotesTooLarge = errors.New("appGenerationReferenceImageNotes is too large. Reduce it or omit it.")
)

func normalizeAppGenerationMode(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}
	switch trimmed {
	case AppGenerationModeJSONRender, AppGenerationModeJSONRenderWithImage, AppGenerationModePromptBuilder, AppGenerationModeMCPServer:
		return &trimmed, nil
	default:
		return nil, ErrAppGenerationModeInvalid
	}
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
	if mode == nil {
		return ""
	}
	resolvedMode := strings.TrimSpace(*mode)
	if resolvedMode == "" {
		return ""
	}

	lines := []string{
		"## App spec generation mode",
		fmt.Sprintf("- mode: %s", resolvedMode),
		"- streamingPreview: disabled",
	}
	if appSpecStreamingEnabled {
		lines[2] = "- streamingPreview: enabled"
	}

	switch resolvedMode {
	case AppGenerationModeJSONRender, AppGenerationModeJSONRenderWithImage, AppGenerationModePromptBuilder:
		lines = append(lines,
			"- If you are generating/updating the App spec (json-render):",
			"  - Use catalog-compatible components only.",
			"  - Persist via Setta app tools.",
		)
		if appSpecStreamingEnabled {
			lines = append(lines,
				"  - Use `setta__stream_app_definition` and stream patches into its `patches` string arg.",
				"  - For updates, omit `baseAppSpec` to patch the currently stored app spec (or pass `baseAppSpec` explicitly).",
			)
		} else {
			lines = append(lines,
				"  - Prefer `setta__set_app_definition` with the full UITree appSpec payload.",
				"  - Optionally call `setta__validate_app_definition` first and fix errors before persisting.",
			)
		}
	}

	switch resolvedMode {
	case AppGenerationModeJSONRenderWithImage:
		lines = append(lines,
			"- Prioritize reference-image fidelity in this order: layout structure, spacing rhythm, typography scale, then color intent.",
			"- If exact parity is impossible with catalog constraints, preserve hierarchy and explain the closest approximation.",
		)
		if referenceImageURL != nil && strings.TrimSpace(*referenceImageURL) != "" {
			lines = append(lines,
				fmt.Sprintf("- Reference image URL: %s", strings.TrimSpace(*referenceImageURL)),
				"- Use this image as layout/style guidance when composing the app spec.",
			)
			if referenceImageNotes != nil && strings.TrimSpace(*referenceImageNotes) != "" {
				lines = append(lines, fmt.Sprintf("- Reference image notes: %s", strings.TrimSpace(*referenceImageNotes)))
			}
		}
	case AppGenerationModePromptBuilder:
		lines = append(lines,
			"- Prompt-builder flow: keep responses concise and tool-oriented so generation can run from the App pane without manual copy/paste.",
		)
	case AppGenerationModeMCPServer:
		lines = append(lines,
			"- MCP-server flow: use MCP tools as the source of truth for design artifacts when available.",
			"- For Figma-oriented requests, support both paths:",
			"  - Pull an existing Figma design into a JSON-render appSpec.",
			"  - Generate/update in Figma first, then pull the resulting design back into Setta.",
		)
		if appSpecStreamingEnabled {
			lines = append(lines, "- After MCP design retrieval, persist into Setta via `setta__stream_app_definition`.")
		} else {
			lines = append(lines, "- After MCP design retrieval, persist into Setta via `setta__set_app_definition`.")
		}
	}

	return strings.Join(lines, "\n")
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
