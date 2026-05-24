package frontendvalues

import (
	"slices"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/appsubsystem/appspec"
	appsubsystemchatmodes "setta/internal/appsubsystem/chatmodes"
	"setta/internal/chatmodes"
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
	registry, err := chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Contributions: appsubsystemchatmodes.BuildChatModeContributions(),
	})
	if err != nil {
		t.Fatalf("build app generation mode registry: %v", err)
	}

	if got.DefaultCustomSlashCommandMode != string(agentruns.ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("unexpected default custom slash command mode: %q", got.DefaultCustomSlashCommandMode)
	}
	if len(got.CustomSlashCommandModeOptions) == 0 ||
		got.CustomSlashCommandModeOptions[0].Value != string(agentruns.ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected plain chat to be first custom slash command mode option, got %#v", got.CustomSlashCommandModeOptions)
	}

	metadataEntries := appsubsystemchatmodes.AppGenerationModeMetadataEntries()
	if len(got.SlashCommands) != len(metadataEntries) {
		t.Fatalf("unexpected slash command count: got %d want %d", len(got.SlashCommands), len(metadataEntries))
	}
	for _, entry := range got.SlashCommands {
		if entry.Command == "" || entry.Action == "" || entry.Summary == "" || entry.PromptTemplate == "" {
			t.Fatalf("expected populated slash command fields: %#v", entry)
		}
		mode := entry.AppGenerationMode
		normalized, ok := registry.NormalizeOptionalMode(&mode)
		if !ok || normalized == nil || *normalized != mode {
			t.Fatalf("slash command mode is not registered by backend registry: %#v", entry)
		}
	}

	for _, option := range got.CustomSlashCommandModeOptions[1:] {
		if option.Value == "" || option.Label == "" {
			t.Fatalf("expected populated custom slash command mode option: %#v", option)
		}
		mode := option.Value
		normalized, ok := registry.NormalizeOptionalMode(&mode)
		if !ok || normalized == nil || *normalized != mode {
			t.Fatalf("custom slash command mode is not registered by backend registry: %#v", option)
		}
		if option.RequiresImageAttachment != registry.AllowsReferenceImage(&mode) {
			t.Fatalf("image requirement mismatch for mode %q: %#v", mode, option)
		}
	}
}
