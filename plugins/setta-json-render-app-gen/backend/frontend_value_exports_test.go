package settajsonrenderappgenbackend

import (
	"slices"
	"testing"

	"setta/internal/agentruns"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestFrontendValueAppSpecPatchPolicyConfigUsesAuthoritativeAppSpecPatchPolicy(t *testing.T) {
	t.Parallel()

	got := FrontendValueAppSpecPatchPolicyConfig()
	want := appspec.DefaultPatchPolicy()

	if got.CommentPrefix != want.CommentPrefix {
		t.Fatalf("unexpected patch comment prefix: got %q want %q", got.CommentPrefix, want.CommentPrefix)
	}
	if got.RootPath != want.RootPath {
		t.Fatalf("unexpected patch root path: got %q want %q", got.RootPath, want.RootPath)
	}
	if got.ElementsPathPrefix != want.ElementsPathPrefix {
		t.Fatalf("unexpected patch elements path prefix: got %q want %q", got.ElementsPathPrefix, want.ElementsPathPrefix)
	}
	if got.RootResetValue != want.RootResetValue {
		t.Fatalf("unexpected patch root reset value: got %q want %q", got.RootResetValue, want.RootResetValue)
	}
	if !slices.Equal(got.AllowedOps, want.AllowedOps) {
		t.Fatalf("unexpected allowed patch ops: got %v want %v", got.AllowedOps, want.AllowedOps)
	}
	if !slices.Equal(got.ValueOptionalOps, want.ValueOptionalOps) {
		t.Fatalf("unexpected optional-value patch ops: got %v want %v", got.ValueOptionalOps, want.ValueOptionalOps)
	}
}

func TestFrontendValueAppSubsystemChatUIConfigUsesAuthoritativeAppGenerationMetadata(t *testing.T) {
	t.Parallel()

	got := FrontendValueAppSubsystemChatUIConfig()

	if got.DefaultCustomSlashCommandMode != string(agentruns.ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("unexpected default custom slash command mode: %q", got.DefaultCustomSlashCommandMode)
	}

	wantCommands := []struct {
		command string
		action  string
		mode    string
	}{
		{command: "/app-json", action: "app_json_render", mode: string(agentruns.AppGenerationModeJSONRender)},
		{command: "/app-image", action: "app_json_render_with_image", mode: string(agentruns.AppGenerationModeJSONRenderWithImage)},
		{command: "/app-prompt", action: "app_prompt_builder", mode: string(agentruns.AppGenerationModePromptBuilder)},
		{command: "/app-mcp", action: "app_mcp_server", mode: string(agentruns.AppGenerationModeMCPServer)},
	}

	if len(got.SlashCommands) != len(wantCommands) {
		t.Fatalf("unexpected slash command count: got %d want %d", len(got.SlashCommands), len(wantCommands))
	}
	for index, want := range wantCommands {
		entry := got.SlashCommands[index]
		if entry.Command != want.command || entry.Action != want.action || entry.AppGenerationMode != want.mode {
			t.Fatalf("unexpected slash command at %d: %#v", index, entry)
		}
		if entry.Summary == "" || entry.PromptTemplate == "" {
			t.Fatalf("expected populated summary and prompt template at %d: %#v", index, entry)
		}
	}

	wantModes := []AppSubsystemCustomSlashCommandModeOptionValue{
		{Value: string(agentruns.ChatAppGenerationMessageModePlainChat), Label: "Plain chat"},
		{Value: string(agentruns.AppGenerationModeJSONRender), Label: "JSON Render"},
		{Value: string(agentruns.AppGenerationModeJSONRenderWithImage), Label: "Image to JSON Render"},
		{Value: string(agentruns.AppGenerationModePromptBuilder), Label: "Prompt Builder"},
		{Value: string(agentruns.AppGenerationModeMCPServer), Label: "MCP Server"},
	}
	if !slices.Equal(got.CustomSlashCommandModeOptions, wantModes) {
		t.Fatalf("unexpected custom slash command mode options: got %#v want %#v", got.CustomSlashCommandModeOptions, wantModes)
	}
}
