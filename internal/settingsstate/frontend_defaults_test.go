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
