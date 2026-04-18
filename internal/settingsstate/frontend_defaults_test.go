package settingsstate

import (
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendSettingsStateFromDocumentUsesOwnerContract(t *testing.T) {
	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	document["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"
	document["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"] = false

	state, err := FrontendSettingsStateFromDocument(document)
	if err != nil {
		t.Fatalf("frontend settings state from document: %v", err)
	}

	if state.Backend.RenameRefactorMode != projectstate.RenameRefactorModeAlwaysRename {
		t.Fatalf(
			"rename refactor mode = %q, want %q",
			state.Backend.RenameRefactorMode,
			projectstate.RenameRefactorModeAlwaysRename,
		)
	}
	if state.Backend.AutoRefetchCallableParamsOnLspMismatch {
		t.Fatalf("expected auto refetch callable params on lsp mismatch to be false")
	}
}

func TestFrontendSettingsStateFromDocumentPreservesChatWindowing(t *testing.T) {
	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	chatWindowing, ok := document["chatWindowing"].(map[string]any)
	if !ok {
		t.Fatalf("expected chatWindowing defaults section, got %#v", document["chatWindowing"])
	}
	chatWindowing["autoCreateInitialChat"] = false
	chatWindowing["restorePriorStateOnUnmaximize"] = false
	shortcuts, ok := chatWindowing["shortcuts"].(map[string]any)
	if !ok {
		t.Fatalf("expected chatWindowing shortcuts section, got %#v", chatWindowing["shortcuts"])
	}
	shortcuts["maximizeFocused"] = "Mod + Enter"

	state, err := FrontendSettingsStateFromDocument(document)
	if err != nil {
		t.Fatalf("frontend settings state from document: %v", err)
	}

	if state.ChatWindowing.AutoCreateInitialChat {
		t.Fatalf("expected auto create initial chat override to be preserved")
	}
	if state.ChatWindowing.RestorePriorStateOnUnmaximize {
		t.Fatalf("expected restore prior state on unmaximize override to be preserved")
	}
	if state.ChatWindowing.Shortcuts.MaximizeFocused != "Mod + Enter" {
		t.Fatalf(
			"maximize focused shortcut = %q, want %q",
			state.ChatWindowing.Shortcuts.MaximizeFocused,
			"Mod + Enter",
		)
	}

	defaults := FrontendDefaultSettingsState()
	if !defaults.ChatWindowing.AutoCreateInitialChat {
		t.Fatalf("expected chat windowing defaults to include autoCreateInitialChat")
	}
	if !defaults.ChatWindowing.RestorePriorStateOnUnmaximize {
		t.Fatalf("expected chat windowing defaults to include restorePriorStateOnUnmaximize")
	}
	if defaults.ChatWindowing.Shortcuts.CanvasToggle != "Shift + Esc" {
		t.Fatalf(
			"canvas toggle shortcut = %q, want %q",
			defaults.ChatWindowing.Shortcuts.CanvasToggle,
			"Shift + Esc",
		)
	}
}
