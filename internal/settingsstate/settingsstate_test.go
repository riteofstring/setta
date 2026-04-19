package settingsstate

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/projectstate"
)

func TestNormalizeRawRejectsNonObjectPayload(t *testing.T) {
	t.Parallel()

	_, err := NormalizeRaw([]any{"not", "an", "object"})
	if !errors.Is(err, ErrSettingsPayloadNotObject) {
		t.Fatalf("expected ErrSettingsPayloadNotObject, got %v", err)
	}
}

func TestNormalizeRawRejectsMissingRequiredFields(t *testing.T) {
	t.Parallel()

	_, err := NormalizeRaw(map[string]any{
		"backend": map[string]any{
			"renameRefactorMode": "ALWAYS_RENAME",
		},
	})
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	if !strings.Contains(validationErr.Error(), "Field required") {
		t.Fatalf("expected missing-field validation error, got %v", validationErr)
	}
}

func TestQueriesReadDefaultsAndExplicitValues(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	mode, err := RenameRefactorModeForDocument(document)
	if err != nil {
		t.Fatalf("RenameRefactorModeForDocument returned error: %v", err)
	}
	if mode != projectstate.RenameRefactorModeAlwaysAsk {
		t.Fatalf(
			"expected default rename mode %q, got %q",
			projectstate.RenameRefactorModeAlwaysAsk,
			mode,
		)
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
	if mode != projectstate.RenameRefactorModeNeverRename {
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

	document, err := DefaultDocument()
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

func TestAutoBackupPolicyForDocumentReadsDefaultsAndExplicitValues(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	policy, err := AutoBackupPolicyForDocument(document)
	if err != nil {
		t.Fatalf("AutoBackupPolicyForDocument returned error: %v", err)
	}
	if !policy.Enabled || policy.FrequencySeconds != DefaultAutoBackupFrequencySeconds || policy.KeepLastN != DefaultAutoBackupKeepLastN {
		t.Fatalf("unexpected default autobackup policy %#v", policy)
	}

	backend := document["backend"].(map[string]any)
	backend["autobackup"] = false
	backend["autobackupFreq"] = 42
	backend["autobackupKeepLastN"] = 7

	policy, err = AutoBackupPolicyForDocument(document)
	if err != nil {
		t.Fatalf("AutoBackupPolicyForDocument explicit value: %v", err)
	}
	if policy.Enabled || policy.FrequencySeconds != 42 || policy.KeepLastN != 7 {
		t.Fatalf("unexpected explicit autobackup policy %#v", policy)
	}
}

func TestAutoBackupPolicyForDocumentRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	backend := document["backend"].(map[string]any)

	backend["autobackup"] = "nope"
	if _, err := AutoBackupPolicyForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for autobackup enabled, got %v", err)
	}

	backend["autobackup"] = true
	backend["autobackupFreq"] = 1.5
	if _, err := AutoBackupPolicyForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for autobackupFreq, got %v", err)
	}

	backend["autobackupFreq"] = 300
	backend["autobackupKeepLastN"] = 2.5
	if _, err := AutoBackupPolicyForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for autobackupKeepLastN, got %v", err)
	}
}

func TestValidateDirectSaveDocumentAcceptsCurrentSupportedBranches(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
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
		"selectedByLanguage": map[string]any{
			"python": "setta-basedpyright",
			"bash":   nil,
		},
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
			name: "gui snap grid length",
			mutate: func(document Document) {
				document["gui"].(map[string]any)["snapGrid"] = []any{8.0}
			},
			expectedPath: "gui.snapGrid",
		},
		{
			name: "backend default terminal shell",
			mutate: func(document Document) {
				document["backend"].(map[string]any)["defaultTerminalShell"] = 7.0
			},
			expectedPath: "backend.defaultTerminalShell",
		},
		{
			name: "language server root",
			mutate: func(document Document) {
				document["languageServer"] = []any{"bad"}
			},
			expectedPath: "languageServer",
		},
		{
			name: "language server extra field",
			mutate: func(document Document) {
				document["languageServer"] = map[string]any{
					"basedpyright": map[string]any{},
				}
			},
			expectedPath: "languageServer.basedpyright",
		},
		{
			name: "language server selectedByLanguage type",
			mutate: func(document Document) {
				document["languageServer"] = map[string]any{
					"selectedByLanguage": []any{"python"},
				}
			},
			expectedPath: "languageServer.selectedByLanguage",
		},
		{
			name: "language server selectedByLanguage invalid key",
			mutate: func(document Document) {
				document["languageServer"] = map[string]any{
					"selectedByLanguage": map[string]any{
						"Python": "plugin-id",
					},
				}
			},
			expectedPath: "languageServer.selectedByLanguage.Python",
		},
		{
			name: "language server selectedByLanguage invalid value",
			mutate: func(document Document) {
				document["languageServer"] = map[string]any{
					"selectedByLanguage": map[string]any{
						"python": 7.0,
					},
				}
			},
			expectedPath: "languageServer.selectedByLanguage.python",
		},
		{
			name: "language server selectedByLanguage blank plugin id",
			mutate: func(document Document) {
				document["languageServer"] = map[string]any{
					"selectedByLanguage": map[string]any{
						"python": "   ",
					},
				}
			},
			expectedPath: "languageServer.selectedByLanguage.python",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			document, err := DefaultDocument()
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

func TestLanguageServerSelectionForLanguageDistinguishesMissingNullAndPluginID(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	document["languageServer"] = map[string]any{
		"selectedByLanguage": map[string]any{
			"python": "setta-basedpyright",
			"bash":   nil,
		},
	}

	pythonSelection, ok, err := LanguageServerSelectionForLanguage(document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage python returned error: %v", err)
	}
	if !ok || pythonSelection == nil || *pythonSelection != "setta-basedpyright" {
		t.Fatalf("expected python selection setta-basedpyright, got ok=%v selection=%#v", ok, pythonSelection)
	}

	bashSelection, ok, err := LanguageServerSelectionForLanguage(document, "bash")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage bash returned error: %v", err)
	}
	if !ok || bashSelection != nil {
		t.Fatalf("expected explicit bash null selection, got ok=%v selection=%#v", ok, bashSelection)
	}

	goSelection, ok, err := LanguageServerSelectionForLanguage(document, "go")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage go returned error: %v", err)
	}
	if ok || goSelection != nil {
		t.Fatalf("expected missing go selection, got ok=%v selection=%#v", ok, goSelection)
	}
}

func TestLanguageServerSelectedByLanguageRejectsInvalidDocumentValues(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	document["languageServer"] = map[string]any{
		"selectedByLanguage": map[string]any{
			"python": "",
		},
	}

	if _, err := LanguageServerSelectedByLanguage(document); err == nil {
		t.Fatal("expected invalid language-server selection error")
	}
}

func TestBootstrapLanguageServerSelectionsWritesOnlyMissingKeys(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("DefaultDocument returned error: %v", err)
	}
	document["languageServer"] = map[string]any{
		"selectedByLanguage": map[string]any{
			"bash": nil,
		},
	}

	next, changed, err := BootstrapLanguageServerSelections(document, map[string]string{
		"python": "setta-basedpyright",
		"bash":   "setta-bashls",
	})
	if err != nil {
		t.Fatalf("BootstrapLanguageServerSelections returned error: %v", err)
	}
	if !changed {
		t.Fatal("expected bootstrap helper to write missing python selection")
	}

	pythonSelection, ok, err := LanguageServerSelectionForLanguage(next, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage python returned error: %v", err)
	}
	if !ok || pythonSelection == nil || *pythonSelection != "setta-basedpyright" {
		t.Fatalf("expected python selection setta-basedpyright, got ok=%v selection=%#v", ok, pythonSelection)
	}

	bashSelection, ok, err := LanguageServerSelectionForLanguage(next, "bash")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage bash returned error: %v", err)
	}
	if !ok || bashSelection != nil {
		t.Fatalf("expected explicit bash null selection to remain, got ok=%v selection=%#v", ok, bashSelection)
	}
}

func TestBootstrapLanguageServerSelectionsLeavesExplicitPluginSelectionUntouched(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("DefaultDocument returned error: %v", err)
	}
	document["languageServer"] = map[string]any{
		"selectedByLanguage": map[string]any{
			"python": "custom-python-lsp",
		},
	}

	next, changed, err := BootstrapLanguageServerSelections(document, map[string]string{
		"python": "setta-basedpyright",
	})
	if err != nil {
		t.Fatalf("BootstrapLanguageServerSelections returned error: %v", err)
	}
	if changed {
		t.Fatal("expected bootstrap helper to leave explicit plugin selection unchanged")
	}

	pythonSelection, ok, err := LanguageServerSelectionForLanguage(next, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage python returned error: %v", err)
	}
	if !ok || pythonSelection == nil || *pythonSelection != "custom-python-lsp" {
		t.Fatalf("expected explicit python selection to remain, got ok=%v selection=%#v", ok, pythonSelection)
	}
}

func TestSetLanguageServerSelectionWritesPluginAndExplicitNull(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("DefaultDocument returned error: %v", err)
	}

	next, err := SetLanguageServerSelection(document, "python", stringPointer("setta-basedpyright"))
	if err != nil {
		t.Fatalf("SetLanguageServerSelection plugin returned error: %v", err)
	}

	pythonSelection, ok, err := LanguageServerSelectionForLanguage(next, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage python returned error: %v", err)
	}
	if !ok || pythonSelection == nil || *pythonSelection != "setta-basedpyright" {
		t.Fatalf("expected python selection setta-basedpyright, got ok=%v selection=%#v", ok, pythonSelection)
	}

	disabled, err := SetLanguageServerSelection(next, "python", nil)
	if err != nil {
		t.Fatalf("SetLanguageServerSelection nil returned error: %v", err)
	}

	pythonSelection, ok, err = LanguageServerSelectionForLanguage(disabled, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage python after disable returned error: %v", err)
	}
	if !ok || pythonSelection != nil {
		t.Fatalf("expected explicit python null selection after disable, got ok=%v selection=%#v", ok, pythonSelection)
	}
}

func TestSetLanguageServerSelectionRejectsBlankPluginID(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("DefaultDocument returned error: %v", err)
	}

	if _, err := SetLanguageServerSelection(document, "python", stringPointer("   ")); err == nil {
		t.Fatal("expected blank plugin id to be rejected")
	}
}

func TestValidateDirectSaveDocumentRejectsUnknownTopLevelBranch(t *testing.T) {
	t.Parallel()

	document, err := DefaultDocument()
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

	document, err := DefaultDocument()
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
	if settings.TerminalDefaultHeight != 220 {
		t.Fatalf("expected default terminal height 220, got %v", settings.TerminalDefaultHeight)
	}
	if got := settings.SectionDefaultsByType["Terminal"]["size"].(map[string]any)["width"]; got != 720.0 {
		t.Fatalf("expected default terminal width 720, got %#v", got)
	}
	if got := settings.SectionDefaultsByType["Terminal"]["size"].(map[string]any)["height"]; got != 220.0 {
		t.Fatalf("expected default terminal size height 220, got %#v", got)
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

	document, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	document["sectionSizingPolicy"].(map[string]any)["byType"].(map[string]any)["TextBlock"].(map[string]any)["maxWidth"] = "nope"
	if _, err := StructuralMutationSettingsForDocument(document); !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid for section sizing policy, got %v", err)
	}

	document, err = DefaultDocument()
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

	document, err := DefaultDocument()
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

func TestStoreLoadFailsClosedOnMissingDefaults(t *testing.T) {
	t.Parallel()

	store, err := NewStore(filepath.Join(t.TempDir(), DefaultFileName), StoreOptions{})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte("{\n  \"backend\": {\n    \"renameRefactorMode\": \"ALWAYS_RENAME\"\n  }\n}\n"), 0o644); err != nil {
		t.Fatalf("seed partial settings file: %v", err)
	}

	_, err = store.Load(context.Background())
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError for partial settings file, got %v", err)
	}

	content, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("read partial settings file: %v", err)
	}
	var persisted map[string]any
	if err := json.Unmarshal(content, &persisted); err != nil {
		t.Fatalf("decode partial settings file: %v", err)
	}
	backend, ok := persisted["backend"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted backend object, got %#v", persisted["backend"])
	}
	if got := backend["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected persisted renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if _, ok := backend["autosave"]; ok {
		t.Fatalf("did not expect load to write back missing defaults, got %#v", backend["autosave"])
	}
	if _, ok := persisted["gui"].(map[string]any); ok {
		t.Fatalf("did not expect load to write back missing top-level branches, got %#v", persisted["gui"])
	}
}

func TestStoreLoadResolvesClaimedSlicesFromSettingsProjectAndFallsBackToSharedFile(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, DefaultFileName)
	dedicatedGUIPath := filepath.Join(root, "gui-settings.json")
	settingsProjectPath := filepath.Join(root, projectstate.SettingsFileName)

	defaults, err := DefaultDocument()
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

	defaults, err := DefaultDocument()
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

func TestStoreLoadWithSettingsProjectAcceptsLanguageServerSelections(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, DefaultFileName)
	settingsProjectPath := filepath.Join(root, projectstate.SettingsFileName)

	defaults, err := DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}

	sharedDocument := defaults.Clone()
	sharedDocument["languageServer"] = map[string]any{
		"selectedByLanguage": map[string]any{
			"python": "setta-ty",
		},
	}
	if err := writeSettingsObject(sharedSettingsPath, sharedDocument); err != nil {
		t.Fatalf("write shared settings document: %v", err)
	}

	settingsProjectDocument, err := buildProjectDocumentWithSharedSettingsPath(defaults, sharedSettingsPath)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}
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

	languageServer, ok := document["languageServer"].(map[string]any)
	if !ok {
		t.Fatalf("expected languageServer branch, got %#v", document["languageServer"])
	}
	selectedByLanguage, ok := languageServer["selectedByLanguage"].(map[string]any)
	if !ok {
		t.Fatalf("expected selectedByLanguage branch, got %#v", languageServer["selectedByLanguage"])
	}
	if got := selectedByLanguage["python"]; got != "setta-ty" {
		t.Fatalf("expected python language-server selection to persist, got %#v", got)
	}
}

func TestStoreFindPathForSettingsSliceResolvesDedicatedJSONSourcePath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, DefaultFileName)
	dedicatedGUIPath := filepath.Join(root, "gui-settings.json")

	defaults, err := DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
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

	store, err := NewStore(sharedSettingsPath, StoreOptions{})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}

	path, found, err := store.findPathForSettingsSlice(settingsProject, "gui")
	if err != nil {
		t.Fatalf("findPathForSettingsSlice returned error: %v", err)
	}
	if !found {
		t.Fatal("expected gui slice path to resolve from settings project")
	}
	if path != dedicatedGUIPath {
		t.Fatalf("expected gui path %q, got %q", dedicatedGUIPath, path)
	}
}

func TestStoreFindPathForSettingsSliceRejectsMissingActiveVariant(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	sharedSettingsPath := filepath.Join(root, DefaultFileName)

	defaults, err := DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsProjectDocument, err := buildProjectDocumentWithSharedSettingsPath(defaults, sharedSettingsPath)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}
	settingsProject, err := settingsProjectDocument.ProjectByID(SettingsProjectID)
	if err != nil {
		t.Fatalf("settings project by id: %v", err)
	}
	settingsProject.SectionVariantMap[settingsSectionID("gui")] = ""

	store, err := NewStore(sharedSettingsPath, StoreOptions{})
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}

	_, _, err = store.findPathForSettingsSlice(settingsProject, "gui")
	if err == nil {
		t.Fatal("expected missing active variant error")
	}
	if !strings.Contains(err.Error(), "missing an active variant") {
		t.Fatalf("expected missing active variant error, got %v", err)
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

func TestRuntimeSaveWaitsForPendingMutation(t *testing.T) {
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

	started := make(chan struct{})
	release := make(chan struct{})

	go func() {
		_, _ = runtime.Mutate(func(document Document) (Document, error) {
			close(started)
			<-release
			document["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
			return document, nil
		})
	}()

	<-started

	done := make(chan Snapshot, 1)
	errs := make(chan error, 1)
	go func() {
		snapshot, saveErr := runtime.Save(context.Background())
		if saveErr != nil {
			errs <- saveErr
			return
		}
		done <- snapshot
	}()

	select {
	case <-done:
		t.Fatal("expected save to wait for the pending mutation")
	case saveErr := <-errs:
		t.Fatalf("save failed early: %v", saveErr)
	case <-time.After(50 * time.Millisecond):
	}

	close(release)

	var snapshot Snapshot
	select {
	case saveErr := <-errs:
		t.Fatalf("save failed: %v", saveErr)
	case snapshot = <-done:
	}

	if got := snapshot.Document["backend"].(map[string]any)["renameRefactorMode"]; got != "NEVER_RENAME" {
		t.Fatalf("expected saved snapshot renameRefactorMode NEVER_RENAME, got %#v", got)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if got := loaded["backend"].(map[string]any)["renameRefactorMode"]; got != "NEVER_RENAME" {
		t.Fatalf("expected persisted renameRefactorMode NEVER_RENAME, got %#v", got)
	}
}
