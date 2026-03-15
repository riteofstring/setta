package settingsstate

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestNormalizeRawRejectsNonObjectPayload(t *testing.T) {
	t.Parallel()

	_, err := NormalizeRaw([]any{"not", "an", "object"})
	if !errors.Is(err, ErrSettingsPayloadNotObject) {
		t.Fatalf("expected ErrSettingsPayloadNotObject, got %v", err)
	}
}

func TestNormalizeRawMergesMissingDefaults(t *testing.T) {
	t.Parallel()

	document, err := NormalizeRaw(map[string]any{
		"backend": map[string]any{
			"renameRefactorMode": "ALWAYS_RENAME",
		},
	})
	if err != nil {
		t.Fatalf("NormalizeRaw returned error: %v", err)
	}

	backend, ok := document["backend"].(map[string]any)
	if !ok {
		t.Fatalf("expected backend object, got %#v", document["backend"])
	}
	if got := backend["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected explicit renameRefactorMode to survive normalization, got %#v", got)
	}
	if got := backend["autosave"]; got != true {
		t.Fatalf("expected missing backend defaults to be seeded, got %#v", got)
	}
}

func TestQueriesReadDefaultsAndExplicitValues(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	mode, err := RenameRefactorModeForDocument(document)
	if err != nil {
		t.Fatalf("RenameRefactorModeForDocument returned error: %v", err)
	}
	if mode != DefaultRenameRefactorMode {
		t.Fatalf("expected default rename mode %q, got %q", DefaultRenameRefactorMode, mode)
	}

	enabled, err := AutoRefetchCallableParamsOnLSPMismatchEnabled(document)
	if err != nil {
		t.Fatalf("AutoRefetchCallableParamsOnLSPMismatchEnabled returned error: %v", err)
	}
	if !enabled {
		t.Fatal("expected default mismatch-refetch setting to be true")
	}

	backend := document["backend"].(map[string]any)
	backend["renameRefactorMode"] = "NEVER_RENAME"
	backend["autoRefetchCallableParamsOnLspMismatch"] = false

	mode, err = RenameRefactorModeForDocument(document)
	if err != nil {
		t.Fatalf("RenameRefactorModeForDocument explicit value: %v", err)
	}
	if mode != RenameRefactorModeNeverRename {
		t.Fatalf("expected explicit rename mode NEVER_RENAME, got %q", mode)
	}

	enabled, err = AutoRefetchCallableParamsOnLSPMismatchEnabled(document)
	if err != nil {
		t.Fatalf("AutoRefetchCallableParamsOnLSPMismatchEnabled explicit value: %v", err)
	}
	if enabled {
		t.Fatal("expected explicit mismatch-refetch setting to be false")
	}
}

func TestQueriesRejectInvalidValues(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	backend := document["backend"].(map[string]any)

	backend["renameRefactorMode"] = "SOMETHING_ELSE"
	if _, err := RenameRefactorModeForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for rename mode, got %v", err)
	}

	backend["renameRefactorMode"] = "ALWAYS_ASK"
	backend["autoRefetchCallableParamsOnLspMismatch"] = "nope"
	if _, err := AutoRefetchCallableParamsOnLSPMismatchEnabled(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for mismatch-refetch, got %v", err)
	}
}

func TestStructuralMutationSettingsForDocumentReadsDefaultsAndOverrides(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	settings, err := StructuralMutationSettingsForDocument(document)
	if err != nil {
		t.Fatalf("StructuralMutationSettingsForDocument defaults returned error: %v", err)
	}
	if got := settings.SectionSizingPolicy.ByType["TextBlock"]; got.MinWidth != 100 || got.MinHeight != 49 {
		t.Fatalf("expected default TextBlock dimensions, got %#v", got)
	}
	if settings.TerminalDefaultHeight != 150 {
		t.Fatalf("expected default terminal height 150, got %v", settings.TerminalDefaultHeight)
	}

	document["sectionSizingPolicy"].(map[string]any)["byType"].(map[string]any)["Chart"].(map[string]any)["minWidth"] = 150.0
	document["terminalSectionDefault"].(map[string]any)["size"].(map[string]any)["height"] = 222.0

	settings, err = StructuralMutationSettingsForDocument(document)
	if err != nil {
		t.Fatalf("StructuralMutationSettingsForDocument overrides returned error: %v", err)
	}
	if got := settings.SectionSizingPolicy.ByType["Chart"].MinWidth; got != 150 {
		t.Fatalf("expected overridden Chart min width 150, got %v", got)
	}
	if settings.TerminalDefaultHeight != 222 {
		t.Fatalf("expected overridden terminal height 222, got %v", settings.TerminalDefaultHeight)
	}
}

func TestStructuralMutationSettingsForDocumentRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	document["sectionSizingPolicy"].(map[string]any)["byType"].(map[string]any)["TextBlock"].(map[string]any)["maxWidth"] = "nope"
	if _, err := StructuralMutationSettingsForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for section sizing policy, got %v", err)
	}

	document, err = NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	document["terminalSectionDefault"].(map[string]any)["size"].(map[string]any)["height"] = "auto"
	if _, err := StructuralMutationSettingsForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for terminal default height, got %v", err)
	}
}

func TestStoreLoadBootstrapsDefaultsAndPersistsMutations(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), DefaultFileName), StoreOptions{})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}

	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load missing settings returned error: %v", err)
	}
	if got := document["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_ASK" {
		t.Fatalf("expected default rename mode ALWAYS_ASK, got %#v", got)
	}

	document["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	reloaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load saved settings returned error: %v", err)
	}
	if got := reloaded["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected saved rename mode ALWAYS_RENAME, got %#v", got)
	}
}

func TestRuntimeMutateAndSaveBumpsRevisionOnlyOnChange(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), DefaultFileName), StoreOptions{})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}
	runtime, err := OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("OpenRuntime returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("Close returned error: %v", err)
		}
	})

	before := runtime.Snapshot()
	if before.Revision != 1 {
		t.Fatalf("expected initial revision 1, got %d", before.Revision)
	}

	noChange, err := runtime.MutateAndSave(context.Background(), func(document Document) (Document, error) {
		return document, nil
	})
	if err != nil {
		t.Fatalf("MutateAndSave no-op returned error: %v", err)
	}
	if noChange.Revision != before.Revision {
		t.Fatalf("expected no-op revision %d, got %d", before.Revision, noChange.Revision)
	}

	after, err := runtime.MutateAndSave(context.Background(), func(document Document) (Document, error) {
		document["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"
		return document, nil
	})
	if err != nil {
		t.Fatalf("MutateAndSave returned error: %v", err)
	}
	if after.Revision != before.Revision+1 {
		t.Fatalf("expected revision %d after change, got %d", before.Revision+1, after.Revision)
	}
}
