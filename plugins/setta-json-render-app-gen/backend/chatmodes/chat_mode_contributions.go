package settajsonrenderappgenbackendchatmodes

import (
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/chatmodes"
)

func BuildChatModeContributions() []chatmodes.AppGenerationModeContribution {
	return []chatmodes.AppGenerationModeContribution{
		{
			Mode: string(agentruns.AppGenerationModeJSONRender),
			PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
				return buildAppGenerationModePrompt(
					string(agentruns.AppGenerationModeJSONRender),
					options,
				)
			},
		},
		{
			Mode: string(agentruns.AppGenerationModeJSONRenderWithImage),
			PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
				return buildAppGenerationModePrompt(
					string(agentruns.AppGenerationModeJSONRenderWithImage),
					options,
				)
			},
		},
		{
			Mode: string(agentruns.AppGenerationModePromptBuilder),
			PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
				return buildAppGenerationModePrompt(
					string(agentruns.AppGenerationModePromptBuilder),
					options,
				)
			},
		},
		{
			Mode: string(agentruns.AppGenerationModeMCPServer),
			PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
				return buildAppGenerationModePrompt(
					string(agentruns.AppGenerationModeMCPServer),
					options,
				)
			},
		},
	}
}

func buildAppGenerationModePrompt(
	mode string,
	options chatmodes.AppGenerationPromptOptions,
) string {
	trimmedMode := strings.TrimSpace(mode)
	if trimmedMode == "" {
		return ""
	}

	lines := []string{
		"## App spec generation mode",
		fmt.Sprintf("- mode: %s", trimmedMode),
		fmt.Sprintf("- streamingPreview: %s", enabledDisabledLabel(options.AppSpecStreamingEnabled)),
	}
	lines = append(lines, appGenerationModePromptLines(trimmedMode, options)...)
	return strings.Join(lines, "\n")
}

func appGenerationModePromptLines(
	mode string,
	options chatmodes.AppGenerationPromptOptions,
) []string {
	switch mode {
	case string(agentruns.AppGenerationModeJSONRender):
		return buildJSONRenderPromptLines(options.AppSpecStreamingEnabled)
	case string(agentruns.AppGenerationModeJSONRenderWithImage):
		return append(
			buildJSONRenderPromptLines(options.AppSpecStreamingEnabled),
			buildReferenceImagePromptLines(
				options.ReferenceImageURL,
				options.ReferenceImageNotes,
			)...,
		)
	case string(agentruns.AppGenerationModePromptBuilder):
		return append(
			buildJSONRenderPromptLines(options.AppSpecStreamingEnabled),
			"- Prompt-builder flow: keep responses concise and tool-oriented so generation can run from the App pane without manual copy/paste.",
		)
	case string(agentruns.AppGenerationModeMCPServer):
		return buildMCPServerPromptLines(options.AppSpecStreamingEnabled)
	default:
		return nil
	}
}

func buildJSONRenderPromptLines(appSpecStreamingEnabled bool) []string {
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

func buildReferenceImagePromptLines(
	referenceImageURL *string,
	referenceImageNotes *string,
) []string {
	lines := []string{
		"- Prioritize reference-image fidelity in this order: layout structure, spacing rhythm, typography scale, then color intent.",
		"- If exact parity is impossible with catalog constraints, preserve hierarchy and explain the closest approximation.",
	}
	normalizedURL := strings.TrimSpace(derefOptionalString(referenceImageURL))
	if normalizedURL == "" {
		return lines
	}
	lines = append(lines,
		fmt.Sprintf("- Reference image URL: %s", normalizedURL),
		"- Use this image as layout/style guidance when composing the app spec.",
	)
	if normalizedNotes := strings.TrimSpace(derefOptionalString(referenceImageNotes)); normalizedNotes != "" {
		lines = append(lines, fmt.Sprintf("- Reference image notes: %s", normalizedNotes))
	}
	return lines
}

func buildMCPServerPromptLines(appSpecStreamingEnabled bool) []string {
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

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
