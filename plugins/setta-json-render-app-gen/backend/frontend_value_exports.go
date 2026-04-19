package settajsonrenderappgenbackend

import (
	"setta/internal/agentruns"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type AppSubsystemChatSlashCommandValue struct {
	Command           string `json:"command"`
	Action            string `json:"action"`
	Summary           string `json:"summary"`
	PromptTemplate    string `json:"promptTemplate"`
	AppGenerationMode string `json:"appGenerationMode"`
}

type AppSubsystemCustomSlashCommandModeOptionValue struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type AppSubsystemChatUIConfigValue struct {
	SlashCommands                 []AppSubsystemChatSlashCommandValue             `json:"slashCommands"`
	CustomSlashCommandModeOptions []AppSubsystemCustomSlashCommandModeOptionValue `json:"customSlashCommandModeOptions"`
	DefaultCustomSlashCommandMode string                                          `json:"defaultCustomSlashCommandMode"`
}

var frontendAppSubsystemSlashCommands = []AppSubsystemChatSlashCommandValue{
	{
		Command:           "/app-json",
		Action:            "app_json_render",
		Summary:           "Generate a standalone app spec through JSON render.",
		PromptTemplate:    "Generate a polished standalone JSON-render app spec. Use a strong hero section, clear content grouping, and consistent spacing/typography by default. Include one obvious primary action path and production-ready baseline structure.",
		AppGenerationMode: string(agentruns.AppGenerationModeJSONRender),
	},
	{
		Command:           "/app-image",
		Action:            "app_json_render_with_image",
		Summary:           "Generate an app spec using attached image guidance.",
		PromptTemplate:    "Generate a JSON-render app spec that matches the attached reference image as closely as possible. Prioritize layout composition first, then spacing, typography scale, and color intent. Stay within catalog constraints and preserve the closest visual approximation when exact parity is impossible.",
		AppGenerationMode: string(agentruns.AppGenerationModeJSONRenderWithImage),
	},
	{
		Command:           "/app-prompt",
		Action:            "app_prompt_builder",
		Summary:           "Generate an app-definition plan for chat-driven iteration.",
		PromptTemplate:    "Generate a practical, polished JSON-render app spec for this project. Use strong information hierarchy, clear spacing rhythm, and one primary action path. Persist the result into the project via Setta app-definition tools.",
		AppGenerationMode: string(agentruns.AppGenerationModePromptBuilder),
	},
	{
		Command:           "/app-mcp",
		Action:            "app_mcp_server",
		Summary:           "Route app generation through MCP-capable tools.",
		PromptTemplate:    "Use MCP tools to produce a high-fidelity UI implementation for this project. If design-import tools are available, import an existing design or generate one before mapping it back into Setta's app definition. Preserve clear hierarchy, responsive layout behavior, and practical defaults.",
		AppGenerationMode: string(agentruns.AppGenerationModeMCPServer),
	},
}

var frontendAppSubsystemCustomSlashCommandModeOptions = []AppSubsystemCustomSlashCommandModeOptionValue{
	{Value: string(agentruns.ChatAppGenerationMessageModePlainChat), Label: "Plain chat"},
	{Value: string(agentruns.AppGenerationModeJSONRender), Label: "JSON Render"},
	{Value: string(agentruns.AppGenerationModeJSONRenderWithImage), Label: "Image to JSON Render"},
	{Value: string(agentruns.AppGenerationModePromptBuilder), Label: "Prompt Builder"},
	{Value: string(agentruns.AppGenerationModeMCPServer), Label: "MCP Server"},
}

func FrontendValueAppSpecPatchPolicyConfig() appspec.PatchPolicy {
	return appspec.DefaultPatchPolicy()
}

func FrontendValueAppSubsystemChatUIConfig() AppSubsystemChatUIConfigValue {
	return AppSubsystemChatUIConfigValue{
		SlashCommands: append(
			[]AppSubsystemChatSlashCommandValue(nil),
			frontendAppSubsystemSlashCommands...,
		),
		CustomSlashCommandModeOptions: append(
			[]AppSubsystemCustomSlashCommandModeOptionValue(nil),
			frontendAppSubsystemCustomSlashCommandModeOptions...,
		),
		DefaultCustomSlashCommandMode: string(agentruns.ChatAppGenerationMessageModePlainChat),
	}
}
