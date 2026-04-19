package projectview

import (
	"reflect"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

func TestFrontendValueProjectChatUIConfigUsesGoOwnedChatMetadata(t *testing.T) {
	config := FrontendValueProjectChatUIConfig()

	if got, want := config.SectionChatWindowModeOptions, []ProjectChatWindowModeOption{
		{Value: projectstate.ChatWindowModeSection, Label: "Section mode (edge scoped)"},
		{Value: projectstate.ChatWindowModeProjectAI, Label: "Project AI mode (full project)"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected section chat window mode options: %#v", got)
	}

	if got, want := config.AgenticEdgeContextModeOptions, []ProjectChatAgenticEdgeContextModeOption{
		{Value: projectstate.AgenticEdgeContextModeReferenceOnly, Label: "Reference only"},
		{Value: projectstate.AgenticEdgeContextModeInlineText, Label: "Inline text"},
		{Value: projectstate.AgenticEdgeContextModeSummary, Label: "Summary"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected agentic edge context mode options: %#v", got)
	}

	if got, want := config.SectionDictationModeOptions, []ProjectChatDictationModeOption{
		{Value: projectstate.ChatDictationModeAuto, Label: "Auto"},
		{Value: projectstate.ChatDictationModeBrowser, Label: "Browser"},
		{Value: projectstate.ChatDictationModeProvider, Label: "Provider"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected section dictation mode options: %#v", got)
	}

	if got, want := config.ProjectDictationModeOptions, []ProjectChatDictationModeOption{
		{Value: projectstate.ChatDictationModeAuto, Label: "Auto"},
		{Value: projectstate.ChatDictationModeProvider, Label: "Provider"},
		{Value: projectstate.ChatDictationModeBrowser, Label: "Browser"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected project dictation mode options: %#v", got)
	}

	if got, want := config.PermissionModeOptions, []ProjectChatPermissionModeOption{
		{Value: projectstate.ChatPermissionModeMinimal, Label: "minimal"},
		{Value: projectstate.ChatPermissionModeYOLO, Label: "yolo"},
		{Value: projectstate.ChatPermissionModeConfigTomlCustom, Label: "config.toml custom"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected permission mode options: %#v", got)
	}

	if got, want := config.CustomSlashCommandModeOptions, []ProjectChatAppGenerationModeOption{
		{Value: string(agentruns.ChatAppGenerationMessageModePlainChat), Label: "Plain chat"},
		{Value: string(agentruns.AppGenerationModeJSONRender), Label: "JSON Render"},
		{Value: string(agentruns.AppGenerationModeJSONRenderWithImage), Label: "Image to JSON Render"},
		{Value: string(agentruns.AppGenerationModePromptBuilder), Label: "Prompt Builder"},
		{Value: string(agentruns.AppGenerationModeMCPServer), Label: "MCP Server"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected custom slash command mode options: %#v", got)
	}

	if got, want := config.DefaultCustomSlashCommandMode, string(agentruns.ChatAppGenerationMessageModePlainChat); got != want {
		t.Fatalf("unexpected default custom slash command mode: %q", got)
	}
}
