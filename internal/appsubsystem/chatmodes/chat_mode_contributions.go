package appsubsystemchatmodes

import (
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/chatmodes"
)

type AppGenerationModeMetadata struct {
	Mode                 string
	SlashCommand         string
	SlashAction          string
	Summary              string
	PromptTemplate       string
	Label                string
	AllowsReferenceImage bool
	ValidateCurrentTurn  func(chatmodes.AppGenerationTurnValidationOptions) error
	promptLines          func(chatmodes.AppGenerationPromptOptions) []string
}

var appGenerationModeMetadata = []AppGenerationModeMetadata{
	{
		Mode:           string(agentruns.AppGenerationModeJSONRender),
		SlashCommand:   "/app-json",
		SlashAction:    "app_json_render",
		Summary:        "Generate a standalone app spec through JSON render.",
		PromptTemplate: "Generate a polished standalone JSON-render app spec. Use a strong hero section, clear content grouping, and consistent spacing/typography by default. Include one obvious primary action path and production-ready baseline structure.",
		Label:          "JSON Render",
		promptLines: func(options chatmodes.AppGenerationPromptOptions) []string {
			return buildJSONRenderPromptLines(options.AppSpecStreamingEnabled)
		},
	},
	{
		Mode:                 string(agentruns.AppGenerationModeJSONRenderWithImage),
		SlashCommand:         "/app-image",
		SlashAction:          "app_json_render_with_image",
		Summary:              "Generate an app spec using attached image guidance.",
		PromptTemplate:       "Generate a JSON-render app spec that matches the attached reference image as closely as possible. Prioritize layout composition first, then spacing, typography scale, and color intent. Stay within catalog constraints and preserve the closest visual approximation when exact parity is impossible.",
		Label:                "Image to JSON Render",
		AllowsReferenceImage: true,
		ValidateCurrentTurn:  validateJSONRenderWithImageTurn,
		promptLines: func(options chatmodes.AppGenerationPromptOptions) []string {
			return append(
				buildJSONRenderPromptLines(options.AppSpecStreamingEnabled),
				buildReferenceImagePromptLines(
					options.ReferenceImageURL,
					options.ReferenceImageNotes,
				)...,
			)
		},
	},
	{
		Mode:           string(agentruns.AppGenerationModePromptBuilder),
		SlashCommand:   "/app-prompt",
		SlashAction:    "app_prompt_builder",
		Summary:        "Generate an app-definition plan for chat-driven iteration.",
		PromptTemplate: "Generate a practical, polished JSON-render app spec for this project. Use strong information hierarchy, clear spacing rhythm, and one primary action path. Persist the result into the project via Setta app-definition tools.",
		Label:          "Prompt Builder",
		promptLines: func(options chatmodes.AppGenerationPromptOptions) []string {
			return append(
				buildJSONRenderPromptLines(options.AppSpecStreamingEnabled),
				"- Prompt-builder flow: keep responses concise and tool-oriented so generation can run from the App pane without manual copy/paste.",
			)
		},
	},
	{
		Mode:           string(agentruns.AppGenerationModeMCPServer),
		SlashCommand:   "/app-mcp",
		SlashAction:    "app_mcp_server",
		Summary:        "Route app generation through MCP-capable tools.",
		PromptTemplate: "Use MCP tools to produce a high-fidelity UI implementation for this project. If design-import tools are available, import an existing design or generate one before mapping it back into Setta's app definition. Preserve clear hierarchy, responsive layout behavior, and practical defaults.",
		Label:          "MCP Server",
		promptLines: func(options chatmodes.AppGenerationPromptOptions) []string {
			return buildMCPServerPromptLines(options.AppSpecStreamingEnabled)
		},
	},
}

func AppGenerationModeMetadataEntries() []AppGenerationModeMetadata {
	return append([]AppGenerationModeMetadata(nil), appGenerationModeMetadata...)
}

func BuildChatModeContributions() []chatmodes.AppGenerationModeContribution {
	metadataEntries := AppGenerationModeMetadataEntries()
	contributions := make([]chatmodes.AppGenerationModeContribution, 0, len(metadataEntries))
	for _, metadata := range metadataEntries {
		contributions = append(contributions, chatmodes.AppGenerationModeContribution{
			Mode:                 metadata.Mode,
			AllowsReferenceImage: metadata.AllowsReferenceImage,
			PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
				return buildAppGenerationModePrompt(metadata, options)
			},
			ValidateCurrentTurn: metadata.ValidateCurrentTurn,
		})
	}
	return contributions
}

func buildAppGenerationModePrompt(
	metadata AppGenerationModeMetadata,
	options chatmodes.AppGenerationPromptOptions,
) string {
	trimmedMode := strings.TrimSpace(metadata.Mode)
	if trimmedMode == "" {
		return ""
	}

	lines := []string{
		"## App spec generation mode",
		fmt.Sprintf("- mode: %s", trimmedMode),
		fmt.Sprintf("- streamingPreview: %s", enabledDisabledLabel(options.AppSpecStreamingEnabled)),
	}
	if metadata.promptLines != nil {
		lines = append(lines, metadata.promptLines(options)...)
	}
	return strings.Join(lines, "\n")
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

func validateJSONRenderWithImageTurn(
	options chatmodes.AppGenerationTurnValidationOptions,
) error {
	if messageHasImageAttachment(options.Message) {
		return nil
	}
	if hasRetainedImageAttachmentFromImageModeThread(
		options.PriorMessages,
		options.AppGenerationByMessageID,
	) {
		return nil
	}
	return chatmodes.ErrAppGenerationImageAttachmentRequired
}

func hasRetainedImageAttachmentFromImageModeThread(
	messages []map[string]any,
	appGenerationByMessageID map[string]string,
) bool {
	for _, message := range messages {
		role, _ := message["role"].(string)
		if strings.TrimSpace(role) != "user" {
			continue
		}
		messageID, _ := message["id"].(string)
		if strings.TrimSpace(appGenerationByMessageID[messageID]) != string(agentruns.AppGenerationModeJSONRenderWithImage) {
			continue
		}
		if messageHasImageAttachment(message) {
			return true
		}
	}
	return false
}

func messageHasImageAttachment(message map[string]any) bool {
	rawAttachments, ok := message["attachments"]
	if !ok {
		return false
	}
	attachments, ok := rawAttachments.([]any)
	if !ok {
		return false
	}
	for _, rawAttachment := range attachments {
		attachment, ok := rawAttachment.(map[string]any)
		if !ok {
			continue
		}
		mimeType, ok := attachment["mimeType"].(string)
		if !ok {
			continue
		}
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "image/") {
			return true
		}
	}
	return false
}
