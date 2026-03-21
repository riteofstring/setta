package settingsstate

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/projectstate"
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
	completionGuardEnabled, err := CompletionGuardEnabled(document)
	if err != nil {
		t.Fatalf("CompletionGuardEnabled returned error: %v", err)
	}
	if completionGuardEnabled {
		t.Fatal("expected default completion guard setting to be false")
	}

	backend := document["backend"].(map[string]any)
	backend["renameRefactorMode"] = "NEVER_RENAME"
	backend["autoRefetchCallableParamsOnLspMismatch"] = false
	backend["completionGuardEnabled"] = true

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
	completionGuardEnabled, err = CompletionGuardEnabled(document)
	if err != nil {
		t.Fatalf("CompletionGuardEnabled explicit value: %v", err)
	}
	if !completionGuardEnabled {
		t.Fatal("expected explicit completion guard setting to be true")
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
	backend["autoRefetchCallableParamsOnLspMismatch"] = true
	backend["completionGuardEnabled"] = "nope"
	if _, err := CompletionGuardEnabled(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for completion guard, got %v", err)
	}
}

func TestValidateDirectSaveDocumentAcceptsCurrentSupportedBranches(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	document["backend"].(map[string]any)["completionGuardEnabled"] = true
	document["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
	document["gui"].(map[string]any)["sectionTagColorChoices"] = []any{
		map[string]any{"color": "#111111", "description": "Custom"},
	}
	document["sectionSizingPolicy"].(map[string]any)["globals"].(map[string]any)["autoMaxHeight"] = 240.0
	document["languageServer"] = map[string]any{
		"pylsp": map[string]any{"enabled": true},
	}

	if err := ValidateDirectSaveDocument(document); err != nil {
		t.Fatalf("ValidateDirectSaveDocument returned error: %v", err)
	}
}

func TestValidateDirectSaveDocumentRejectsInvalidSupportedBranchValues(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		mutate       func(Document)
		expectedPath string
	}{
		{
			name: "backend rename refactor mode",
			mutate: func(document Document) {
				document["backend"].(map[string]any)["renameRefactorMode"] = "LATER"
			},
			expectedPath: "backend.renameRefactorMode",
		},
		{
			name: "gui color choice description",
			mutate: func(document Document) {
				document["gui"].(map[string]any)["sectionTagColorChoices"] = []any{
					map[string]any{"color": "#111111", "description": 7.0},
				}
			},
			expectedPath: "gui.sectionTagColorChoices.0.description",
		},
		{
			name: "section sizing globals",
			mutate: func(document Document) {
				document["sectionSizingPolicy"].(map[string]any)["globals"].(map[string]any)["autoMaxHeight"] = "tall"
			},
			expectedPath: "sectionSizingPolicy.globals.autoMaxHeight",
		},
		{
			name: "language server root",
			mutate: func(document Document) {
				document["languageServer"] = []any{"bad"}
			},
			expectedPath: "languageServer",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			document, err := NewDocument()
			if err != nil {
				t.Fatalf("NewDocument returned error: %v", err)
			}
			testCase.mutate(document)

			err = ValidateDirectSaveDocument(document)
			if err == nil {
				t.Fatal("expected validation error, got nil")
			}
			if !strings.Contains(err.Error(), testCase.expectedPath) {
				t.Fatalf("expected error to contain %q, got %q", testCase.expectedPath, err.Error())
			}
		})
	}
}

func TestValidateDirectSaveDocumentRejectsUnknownTopLevelBranch(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	document["unexpectedSettingsBranch"] = true

	err = ValidateDirectSaveDocument(document)
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
	if !strings.Contains(err.Error(), "settings.unexpectedSettingsBranch") {
		t.Fatalf("expected error to contain unexpected top-level path, got %q", err.Error())
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
	if got := settings.SectionSizingPolicy.ByType["StateMachineStart"]; got.MinWidth != 240 || got.MinHeight != 96 {
		t.Fatalf("expected default StateMachineStart dimensions, got %#v", got)
	}
	if got := settings.SectionSizingPolicy.ByType["StateMachineGate"]; got.MinWidth != 240 || got.MinHeight != 120 {
		t.Fatalf("expected default StateMachineGate dimensions, got %#v", got)
	}
	if got := settings.SectionSizingPolicy.ByType["StateMachineEnd"]; got.MinWidth != 240 || got.MinHeight != 96 {
		t.Fatalf("expected default StateMachineEnd dimensions, got %#v", got)
	}
	if settings.TerminalDefaultHeight != 150 {
		t.Fatalf("expected default terminal height 150, got %v", settings.TerminalDefaultHeight)
	}
	if got := settings.SectionDefaultsByType["TaskBoard"]["columns"]; got != nil {
		t.Fatalf("expected default task board columns sentinel nil, got %#v", got)
	}
	if got := settings.SectionDefaultsByType["TextBlock"]["headingAsSectionName"]; got != false {
		t.Fatalf("expected default text block headingAsSectionName false, got %#v", got)
	}

	document["sectionSizingPolicy"].(map[string]any)["byType"].(map[string]any)["Chart"].(map[string]any)["minWidth"] = 150.0
	document["terminalSectionDefault"].(map[string]any)["size"].(map[string]any)["height"] = 222.0
	document["textBlockSectionDefault"].(map[string]any)["headingAsSectionName"] = true

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
	if got := settings.SectionDefaultsByType["TextBlock"]["headingAsSectionName"]; got != true {
		t.Fatalf("expected overridden text block headingAsSectionName true, got %#v", got)
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

func TestStructuralMutationSettingsForDocumentPreservesTaskBoardNilColumnsSentinelAcrossJSONRoundTrip(t *testing.T) {
	t.Parallel()

	document, err := NewDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	encoded, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("marshal settings defaults: %v", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatalf("unmarshal settings defaults: %v", err)
	}

	normalized, err := NormalizeRaw(raw)
	if err != nil {
		t.Fatalf("NormalizeRaw round-tripped defaults: %v", err)
	}

	settings, err := StructuralMutationSettingsForDocument(normalized)
	if err != nil {
		t.Fatalf("StructuralMutationSettingsForDocument round-tripped defaults: %v", err)
	}
	if got := settings.SectionDefaultsByType["TaskBoard"]["columns"]; got != nil {
		t.Fatalf("expected task board columns sentinel nil after JSON round trip, got %#v", got)
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

func TestStoreLoadWritesMissingDefaultsBackToDisk(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), DefaultFileName), StoreOptions{})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte("{\n  \"backend\": {\n    \"renameRefactorMode\": \"ALWAYS_RENAME\"\n  }\n}\n"), 0o644); err != nil {
		t.Fatalf("seed partial settings file: %v", err)
	}

	// Loading an existing partial settings file should normalize the returned
	// document and persist the missing default keys back to disk immediately.
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load partial settings returned error: %v", err)
	}
	if got := document["backend"].(map[string]any)["autosave"]; got != true {
		t.Fatalf("expected load to seed missing backend defaults in memory, got %#v", got)
	}

	content, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("read normalized settings file: %v", err)
	}
	var persisted map[string]any
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode normalized settings file: %v", err)
	}
	backend, ok := persisted["backend"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted backend object, got %#v", persisted["backend"])
	}
	if got := backend["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected persisted renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := backend["autosave"]; got != true {
		t.Fatalf("expected persisted missing backend default autosave=true, got %#v", got)
	}
	if _, ok := persisted["gui"].(map[string]any); !ok {
		t.Fatalf("expected load writeback to persist default top-level branches, got %#v", persisted)
	}
}

func TestStoreLoadResolvesClaimedSlicesFromSettingsProjectAndFallsBackToSharedFile(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, DefaultFileName)
	dedicatedGUIPath := filepath.Join(root, "gui-settings.json")
	settingsProjectPath := filepath.Join(root, projectstate.SettingsFileName)

	defaults, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	sharedDocument := defaults.Clone()
	sharedDocument["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
	if err := writeSettingsObject(sharedSettingsPath, sharedDocument); err != nil {
		t.Fatalf("write shared settings document: %v", err)
	}

	dedicatedGUIDocument := defaults.Clone()
	dedicatedGUIDocument["gui"].(map[string]any)["gridColor"] = "#123456"
	if err := writeSettingsObject(dedicatedGUIPath, dedicatedGUIDocument); err != nil {
		t.Fatalf("write dedicated gui settings document: %v", err)
	}

	settingsProjectDocument, err := buildProjectDocumentWithSharedSettingsPath(defaults, sharedSettingsPath)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}
	settingsProject, err := settingsProjectDocument.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("settings project by id: %v", err)
	}
	guiVariantID := settingsProject.SectionVariantMap[settingsSectionID("gui")]
	guiVariant := settingsProject.SectionVariants[guiVariantID]
	guiVariant.Name = dedicatedGUIPath
	settingsProject.SectionVariants[guiVariantID] = guiVariant
	settingsProjectDocument.Projects[SettingsProjectID] = settingsProject

	settingsProjectStore, err := projectstate.NewStore(settingsProjectPath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings project store: %v", err)
	}
	if err := settingsProjectStore.Save(context.Background(), settingsProjectDocument); err != nil {
		t.Fatalf("save settings project document: %v", err)
	}

	store, err := NewStore(sharedSettingsPath, StoreOptions{SettingsProjectPath: settingsProjectPath})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if got := document["gui"].(map[string]any)["gridColor"]; got != "#123456" {
		t.Fatalf("expected gui slice to load from dedicated file, got %#v", got)
	}
	if got := document["backend"].(map[string]any)["renameRefactorMode"]; got != "NEVER_RENAME" {
		t.Fatalf("expected unclaimed backend slice to fall back to shared file, got %#v", got)
	}
}

func TestStoreLoadCreatesMissingClaimedTargetWithFullDefaultsBeforeRead(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, DefaultFileName)
	missingGUIPath := filepath.Join(root, "gui-settings.json")
	settingsProjectPath := filepath.Join(root, projectstate.SettingsFileName)

	defaults, err := NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	sharedDocument := defaults.Clone()
	sharedDocument["backend"].(map[string]any)["renameRefactorMode"] = "ALWAYS_RENAME"
	if err := writeSettingsObject(sharedSettingsPath, sharedDocument); err != nil {
		t.Fatalf("write shared settings document: %v", err)
	}

	settingsProjectDocument, err := buildProjectDocumentWithSharedSettingsPath(defaults, sharedSettingsPath)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}
	settingsProject, err := settingsProjectDocument.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("settings project by id: %v", err)
	}
	guiVariantID := settingsProject.SectionVariantMap[settingsSectionID("gui")]
	guiVariant := settingsProject.SectionVariants[guiVariantID]
	guiVariant.Name = missingGUIPath
	settingsProject.SectionVariants[guiVariantID] = guiVariant
	settingsProjectDocument.Projects[SettingsProjectID] = settingsProject

	settingsProjectStore, err := projectstate.NewStore(settingsProjectPath, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings project store: %v", err)
	}
	if err := settingsProjectStore.Save(context.Background(), settingsProjectDocument); err != nil {
		t.Fatalf("save settings project document: %v", err)
	}

	store, err := NewStore(sharedSettingsPath, StoreOptions{SettingsProjectPath: settingsProjectPath})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if got := document["gui"].(map[string]any)["gridColor"]; got != defaults["gui"].(map[string]any)["gridColor"] {
		t.Fatalf("expected missing dedicated gui file to bootstrap defaults before read, got %#v", got)
	}

	content, err := os.ReadFile(missingGUIPath)
	if err != nil {
		t.Fatalf("read bootstrapped dedicated settings file: %v", err)
	}
	var persisted Document
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode bootstrapped dedicated settings file: %v", err)
	}
	if got := persisted["backend"].(map[string]any)["renameRefactorMode"]; got != "ALWAYS_ASK" {
		t.Fatalf("expected dedicated target bootstrap to write full defaults document, got %#v", got)
	}
	if _, ok := persisted["gui"].(map[string]any); !ok {
		t.Fatalf("expected dedicated target bootstrap to include gui defaults, got %#v", persisted)
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
