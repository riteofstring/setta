package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"setta/internal/chat"

	_ "modernc.org/sqlite"
)

func TestSemanticCartographerSettingsFreshStoreCreatesDefaults(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	record, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read semantic cartographer settings: %v", err)
	}
	assertDefaultSemanticCartographerSettings(t, record)
	assertStoredSemanticCartographerSettingsCanonical(t, store, record)
}

func assertDefaultSemanticCartographerSettings(t *testing.T, record SemanticCartographerSettingsRecord) {
	t.Helper()
	settings := record.Settings
	if record.ID != semanticCartographerSettingsID {
		t.Fatalf("settings id = %q, want %q", record.ID, semanticCartographerSettingsID)
	}
	if settings.SchemaVersion != semanticCartographerSettingsSchemaVersion {
		t.Fatalf("settings schemaVersion = %d, want %d", settings.SchemaVersion, semanticCartographerSettingsSchemaVersion)
	}
	if !settings.AutomaticProcessingEnabled {
		t.Fatal("automaticProcessingEnabled = false, want true")
	}
	if settings.LiveTaskConfig.ModelSelection != SemanticCartographerModelSelectionProviderDefault ||
		settings.LiveTaskConfig.ModelID != "" ||
		settings.LiveTaskConfig.ReasoningEffort != chat.ReasoningEffortLow {
		t.Fatalf("live task config = %+v, want provider default low", settings.LiveTaskConfig)
	}
	if settings.FinalSynthesisTaskConfig.ModelSelection != SemanticCartographerModelSelectionProviderDefault ||
		settings.FinalSynthesisTaskConfig.ModelID != "" ||
		settings.FinalSynthesisTaskConfig.ReasoningEffort != chat.ReasoningEffortMedium {
		t.Fatalf("final task config = %+v, want provider default medium", settings.FinalSynthesisTaskConfig)
	}
	if settings.ProcessingConfig.MaxConcurrent != defaultAutomaticCartographerMaxConcurrent ||
		settings.ProcessingConfig.PerSourceConcurrent != defaultAutomaticCartographerPerSourceConcurrent ||
		settings.ProcessingConfig.MaxQueuedPerSource != defaultAutomaticCartographerMaxQueuedPerSource {
		t.Fatalf("processing config = %+v, want automatic cartographer defaults", settings.ProcessingConfig)
	}
	if settings.ObservationConfig.TokenBudget != defaultCartographerTokenBudget ||
		settings.ObservationConfig.QuietCloseAfterSeconds != defaultSemanticCartographerQuietCloseAfterSeconds {
		t.Fatalf("observation config = %+v, want persisted defaults", settings.ObservationConfig)
	}
	if settings.AuditConfig.CaptureLevel != SemanticCartographerAuditCaptureStandard {
		t.Fatalf("audit config = %+v, want standard capture", settings.AuditConfig)
	}
}

func assertStoredSemanticCartographerSettingsCanonical(t *testing.T, store *Store, record SemanticCartographerSettingsRecord) {
	t.Helper()
	settings := record.Settings
	canonicalJSON, err := canonicalSemanticCartographerSettingsJSON(settings)
	if err != nil {
		t.Fatalf("canonicalize settings: %v", err)
	}
	expectedHash := hashBytes([]byte(canonicalJSON))
	if record.SettingsHash != expectedHash {
		t.Fatalf("settings hash = %q, want %q", record.SettingsHash, expectedHash)
	}
	var rowCount int
	if err := store.db.QueryRow(`
SELECT COUNT(*)
FROM semantic_cartographer_settings
`).Scan(&rowCount); err != nil {
		t.Fatalf("count settings rows: %v", err)
	}
	if rowCount != 1 {
		t.Fatalf("settings row count = %d, want 1", rowCount)
	}
	var storedJSON string
	if err := store.db.QueryRow(`
SELECT settings_json
FROM semantic_cartographer_settings
WHERE id = ?
`, semanticCartographerSettingsID).Scan(&storedJSON); err != nil {
		t.Fatalf("read stored settings json: %v", err)
	}
	if storedJSON != canonicalJSON {
		t.Fatalf("stored settings json = %s, want canonical %s", storedJSON, canonicalJSON)
	}
}

func TestSemanticCartographerSettingsPersistAcrossStoreReopen(t *testing.T) {
	appDataDir := t.TempDir()
	ctx := context.Background()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new semantic graph store: %v", err)
	}
	initial, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read initial settings: %v", err)
	}
	settings := editedSemanticCartographerSettingsForPersistenceTest(initial.Settings)

	updated, err := store.UpdateSemanticCartographerSettings(ctx, settings)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen semantic graph store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Fatalf("close reopened store: %v", err)
		}
	})
	readBack, err := reopened.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read reopened settings: %v", err)
	}
	assertReopenedSemanticCartographerSettings(t, readBack, updated.SettingsHash)
}

func editedSemanticCartographerSettingsForPersistenceTest(settings SemanticCartographerSettings) SemanticCartographerSettings {
	settings.AutomaticProcessingEnabled = false
	settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
	settings.LiveTaskConfig.ModelID = "gpt-cartographer-live"
	settings.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortMinimal
	settings.FinalSynthesisTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
	settings.FinalSynthesisTaskConfig.ModelID = "gpt-cartographer-final"
	settings.FinalSynthesisTaskConfig.InputBudget = defaultSemanticCartographerFinalInputBudget + 512
	settings.ProcessingConfig.MaxConcurrent = 3
	settings.ProcessingConfig.PerSourceConcurrent = 2
	settings.ObservationConfig.MaxWindowEvents = 12
	settings.AuditConfig.CaptureLevel = SemanticCartographerAuditCaptureDebug
	return settings
}

func assertReopenedSemanticCartographerSettings(t *testing.T, readBack SemanticCartographerSettingsRecord, expectedHash string) {
	t.Helper()
	if readBack.SettingsHash != expectedHash {
		t.Fatalf("reopened settings hash = %q, want %q", readBack.SettingsHash, expectedHash)
	}
	if readBack.Settings.AutomaticProcessingEnabled {
		t.Fatal("automaticProcessingEnabled = true after reopen, want false")
	}
	if readBack.Settings.LiveTaskConfig.ModelSelection != SemanticCartographerModelSelectionExplicit ||
		readBack.Settings.LiveTaskConfig.ModelID != "gpt-cartographer-live" ||
		readBack.Settings.LiveTaskConfig.ReasoningEffort != chat.ReasoningEffortMinimal {
		t.Fatalf("reopened live task config = %+v, want persisted explicit config", readBack.Settings.LiveTaskConfig)
	}
	if readBack.Settings.FinalSynthesisTaskConfig.ModelSelection != SemanticCartographerModelSelectionExplicit ||
		readBack.Settings.FinalSynthesisTaskConfig.ModelID != "gpt-cartographer-final" ||
		readBack.Settings.FinalSynthesisTaskConfig.InputBudget != defaultSemanticCartographerFinalInputBudget+512 {
		t.Fatalf("reopened final task config = %+v, want persisted explicit config", readBack.Settings.FinalSynthesisTaskConfig)
	}
	if readBack.Settings.ProcessingConfig.MaxConcurrent != 3 ||
		readBack.Settings.ProcessingConfig.PerSourceConcurrent != 2 ||
		readBack.Settings.ObservationConfig.MaxWindowEvents != 12 ||
		readBack.Settings.AuditConfig.CaptureLevel != SemanticCartographerAuditCaptureDebug {
		t.Fatalf("reopened settings = %+v, want persisted processing/observation/audit config", readBack.Settings)
	}
}

func TestSemanticCartographerSettingsHashIsStable(t *testing.T) {
	settings := DefaultSemanticCartographerSettings(testTimestamp(1))

	firstJSON, err := canonicalSemanticCartographerSettingsJSON(settings)
	if err != nil {
		t.Fatalf("canonical settings json: %v", err)
	}
	firstHash, err := semanticCartographerSettingsHash(settings)
	if err != nil {
		t.Fatalf("settings hash: %v", err)
	}
	secondJSON, err := canonicalSemanticCartographerSettingsJSON(settings)
	if err != nil {
		t.Fatalf("canonical settings json again: %v", err)
	}
	secondHash, err := semanticCartographerSettingsHash(settings)
	if err != nil {
		t.Fatalf("settings hash again: %v", err)
	}
	if firstJSON != secondJSON || firstHash != secondHash {
		t.Fatalf("settings canonicalization unstable: first %s %s second %s %s", firstJSON, firstHash, secondJSON, secondHash)
	}

	changed := settings
	changed.LiveTaskConfig.InputBudget++
	changedHash, err := semanticCartographerSettingsHash(changed)
	if err != nil {
		t.Fatalf("changed settings hash: %v", err)
	}
	if changedHash == firstHash {
		t.Fatalf("changed settings hash = %q, want different from %q", changedHash, firstHash)
	}
}

func TestSemanticCartographerSettingsRejectInvalidUpdate(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	initial, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read initial settings: %v", err)
	}

	tests := []struct {
		name string
		edit func(*SemanticCartographerSettings)
		want string
	}{
		{
			name: "unsupported reasoning",
			edit: func(settings *SemanticCartographerSettings) {
				settings.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffort("enormous")
			},
			want: "reasoningEffort is unsupported",
		},
		{
			name: "provider default with model id",
			edit: func(settings *SemanticCartographerSettings) {
				settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionProviderDefault
				settings.LiveTaskConfig.ModelID = "gpt-test"
			},
			want: "modelId must be empty",
		},
		{
			name: "explicit without model id",
			edit: func(settings *SemanticCartographerSettings) {
				settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
				settings.LiveTaskConfig.ModelID = ""
			},
			want: "modelId is required",
		},
		{
			name: "impossible concurrency",
			edit: func(settings *SemanticCartographerSettings) {
				settings.ProcessingConfig.MaxConcurrent = 1
				settings.ProcessingConfig.PerSourceConcurrent = 2
			},
			want: "perSourceConcurrent 2 exceeds maxConcurrent 1",
		},
		{
			name: "invalid window threshold",
			edit: func(settings *SemanticCartographerSettings) {
				settings.ObservationConfig.MaxWindowContentBytes = 100
				settings.ObservationConfig.AssistantThresholdBytes = 101
			},
			want: "assistantThresholdBytes 101 exceeds maxWindowContentBytes 100",
		},
		{
			name: "unsupported audit capture",
			edit: func(settings *SemanticCartographerSettings) {
				settings.AuditConfig.CaptureLevel = SemanticCartographerAuditCaptureLevel("everything")
			},
			want: "captureLevel is unsupported",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			settings := initial.Settings
			test.edit(&settings)
			_, err := store.UpdateSemanticCartographerSettings(ctx, settings)
			if err == nil {
				t.Fatal("update invalid settings succeeded")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("update invalid settings error = %v, want %q", err, test.want)
			}
			after, readErr := store.ReadSemanticCartographerSettings(ctx)
			if readErr != nil {
				t.Fatalf("read settings after rejected update: %v", readErr)
			}
			if after.SettingsHash != initial.SettingsHash {
				t.Fatalf("settings hash after rejected update = %q, want unchanged %q", after.SettingsHash, initial.SettingsHash)
			}
		})
	}
}

func TestSemanticCartographerSettingsCatalogValidationUsesModelValue(t *testing.T) {
	settings := DefaultSemanticCartographerSettings(testTimestamp(1))
	settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
	settings.LiveTaskConfig.ModelID = "display-only-option-id"
	settings.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortHigh

	catalog := []chat.ChatModelOption{
		cartographerSettingsCatalogModel("display-only-option-id", "gpt-real", true, chat.ReasoningEffortLow, chat.ReasoningEffortMedium, chat.ReasoningEffortHigh),
	}
	err := ValidateSemanticCartographerSettingsAgainstModelCatalog(settings, catalog)
	if err == nil {
		t.Fatal("catalog validation succeeded with display-only id, want explicit model lookup by model value")
	}
	if !strings.Contains(err.Error(), `explicit model "display-only-option-id" is absent`) {
		t.Fatalf("catalog validation error = %v, want absent explicit model by model value", err)
	}

	settings.LiveTaskConfig.ModelID = "gpt-real"
	if err := ValidateSemanticCartographerSettingsAgainstModelCatalog(settings, catalog); err != nil {
		t.Fatalf("catalog validation with model value: %v", err)
	}
}

func TestSemanticCartographerSettingsCatalogValidationAllowsProviderDefaultWithoutReportedDefault(t *testing.T) {
	settings := DefaultSemanticCartographerSettings(testTimestamp(1))
	catalog := []chat.ChatModelOption{
		cartographerSettingsCatalogModel("explicit-id", "gpt-explicit", false, chat.ReasoningEffortHigh),
	}

	if err := ValidateSemanticCartographerSettingsAgainstModelCatalog(settings, catalog); err != nil {
		t.Fatalf("provider default validation without reported default model: %v", err)
	}
}

func TestSemanticCartographerSettingsCatalogValidationRejectsUnsupportedSavedOptions(t *testing.T) {
	tests := []struct {
		name    string
		edit    func(*SemanticCartographerSettings)
		catalog []chat.ChatModelOption
		want    string
	}{
		{
			name: "missing explicit model",
			edit: func(settings *SemanticCartographerSettings) {
				settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
				settings.LiveTaskConfig.ModelID = "gpt-missing"
				settings.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortHigh
			},
			catalog: []chat.ChatModelOption{
				cartographerSettingsCatalogModel("other-id", "gpt-other", true, chat.ReasoningEffortMedium, chat.ReasoningEffortHigh),
			},
			want: `explicit model "gpt-missing" is absent`,
		},
		{
			name: "unsupported explicit reasoning",
			edit: func(settings *SemanticCartographerSettings) {
				settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
				settings.LiveTaskConfig.ModelID = "gpt-explicit"
				settings.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortHigh
			},
			catalog: []chat.ChatModelOption{
				cartographerSettingsCatalogModel("explicit-id", "gpt-explicit", true, chat.ReasoningEffortLow, chat.ReasoningEffortMedium),
			},
			want: `reasoningEffort high is unsupported for explicit model "gpt-explicit"`,
		},
		{
			name: "unsupported provider default reasoning",
			edit: func(settings *SemanticCartographerSettings) {},
			catalog: []chat.ChatModelOption{
				cartographerSettingsCatalogModel("default-id", "gpt-default", true, chat.ReasoningEffortLow),
			},
			want: `reasoningEffort medium is unsupported for provider default model "gpt-default"`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			settings := DefaultSemanticCartographerSettings(testTimestamp(1))
			test.edit(&settings)
			err := ValidateSemanticCartographerSettingsAgainstModelCatalog(settings, test.catalog)
			if err == nil {
				t.Fatal("catalog validation succeeded, want rejection")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("catalog validation error = %v, want %q", err, test.want)
			}
		})
	}
}

func cartographerSettingsCatalogModel(id string, model string, isDefault bool, efforts ...chat.ReasoningEffort) chat.ChatModelOption {
	options := make([]chat.ChatReasoningEffortOption, 0, len(efforts))
	for _, effort := range efforts {
		options = append(options, chat.ChatReasoningEffortOption{
			Effort:      effort,
			DisplayName: string(effort),
		})
	}
	return chat.ChatModelOption{
		ID:                        id,
		Model:                     model,
		DisplayName:               model,
		Description:               model,
		IsDefault:                 isDefault,
		DefaultReasoningEffort:    efforts[0],
		SupportedReasoningEfforts: options,
	}
}

func TestSemanticCartographerSettingsRejectInvalidPersistedRow(t *testing.T) {
	appDataDir := t.TempDir()
	ctx := context.Background()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new semantic graph store: %v", err)
	}
	record, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	invalid := record.Settings
	invalid.FinalSynthesisTaskConfig.ReasoningEffort = chat.ReasoningEffort("unknown")
	raw, err := json.Marshal(invalid)
	if err != nil {
		t.Fatalf("marshal invalid settings: %v", err)
	}
	if _, err := store.db.ExecContext(ctx, `
UPDATE semantic_cartographer_settings
SET settings_json = ?,
    settings_hash = ?,
    updated_at = ?
WHERE id = ?
`, string(raw), hashBytes(raw), invalid.UpdatedAt, semanticCartographerSettingsID); err != nil {
		t.Fatalf("write invalid settings row: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err == nil {
		_ = reopened.Close()
		t.Fatal("reopen invalid settings store succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("reopen invalid settings error = %T %v, want corrupt state error", err, err)
	}
	if !strings.Contains(err.Error(), "reasoningEffort is unsupported") {
		t.Fatalf("reopen invalid settings error = %v, want reasoning effort validation", err)
	}
}

func TestSemanticCartographerSettingsRejectsPreviousAuditSchemaStore(t *testing.T) {
	appDataDir := t.TempDir()
	dbPath := filepath.Join(appDataDir, semanticDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if _, err := db.Exec("PRAGMA user_version = 11"); err != nil {
		t.Fatalf("write version 11: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close sqlite db: %v", err)
	}

	store, err := NewStore(appDataDir)
	if err == nil {
		_ = store.Close()
		t.Fatal("new store with version 11 succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("version 11 store error = %T %v, want corrupt state error", err, err)
	}
	if !strings.Contains(err.Error(), "unsupported schema version 11") ||
		!strings.Contains(err.Error(), "reset the semantic graph store") {
		t.Fatalf("version 11 store error = %v, want reset guidance", err)
	}
}

func TestSemanticCartographerSettingsRejectsPreviousFinalSynthesisBudgetSchemaStore(t *testing.T) {
	appDataDir := t.TempDir()
	dbPath := filepath.Join(appDataDir, semanticDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if _, err := db.Exec("PRAGMA user_version = 12"); err != nil {
		t.Fatalf("write version 12: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close sqlite db: %v", err)
	}

	store, err := NewStore(appDataDir)
	if err == nil {
		_ = store.Close()
		t.Fatal("new store with version 12 succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("version 12 store error = %T %v, want corrupt state error", err, err)
	}
	if !strings.Contains(err.Error(), "unsupported schema version 12") ||
		!strings.Contains(err.Error(), "reset the semantic graph store") {
		t.Fatalf("version 12 store error = %v, want reset guidance", err)
	}
}

func TestSemanticCartographerSettingsProvideServiceDefaults(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	record, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	settings := record.Settings
	settings.AutomaticProcessingEnabled = false
	settings.ProcessingConfig.MaxConcurrent = 4
	settings.ProcessingConfig.PerSourceConcurrent = 2
	settings.ObservationConfig.MaxWindowEvents = 9
	if _, err := store.UpdateSemanticCartographerSettings(ctx, settings); err != nil {
		t.Fatalf("update settings: %v", err)
	}

	service, err := NewService(store, associationWorkspaceResolver{root: t.TempDir()})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	if service.automaticCartographer.enabled {
		t.Fatal("automatic cartographer enabled = true, want persisted false")
	}
	if service.automaticCartographer.config.MaxConcurrent != 4 ||
		service.automaticCartographer.config.PerSourceConcurrent != 2 {
		t.Fatalf("service automatic cartographer config = %+v, want persisted config", service.automaticCartographer.config)
	}
	if service.cartographerConfig.MaxWindowEvents != 9 {
		t.Fatalf("service cartographer observation config = %+v, want persisted maxWindowEvents", service.cartographerConfig)
	}

	override, err := NewService(
		store,
		associationWorkspaceResolver{root: t.TempDir()},
		WithAutomaticCartographerProcessingConfig(AutomaticCartographerProcessingConfig{MaxConcurrent: 1, PerSourceConcurrent: 1, MaxQueuedPerSource: 2, LeaseDurationSeconds: 3}),
		WithCartographerObservationConfig(CartographerObservationConfig{MaxWindowEvents: 5, MaxWindowContentBytes: 100, AssistantThresholdBytes: 50, OutputThresholdBytes: 50, PriorSummaryLimit: 1, TokenBudget: 80}),
	)
	if err != nil {
		t.Fatalf("new service with overrides: %v", err)
	}
	if override.automaticCartographer.config.MaxConcurrent != 1 ||
		override.cartographerConfig.MaxWindowEvents != 5 {
		t.Fatalf("override service configs = %+v / %+v, want constructor options to override persisted defaults", override.automaticCartographer.config, override.cartographerConfig)
	}
}

func TestSemanticCartographerSettingsUpdateSynchronizesObserverInputConstruction(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	service, err := NewService(store, associationWorkspaceResolver{root: t.TempDir()})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	initial, err := service.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	models := []chat.ChatModelOption{
		cartographerSettingsCatalogModel("default", "gpt-default", true, chat.ReasoningEffortLow, chat.ReasoningEffortMedium, chat.ReasoningEffortHigh),
	}

	const iterations = 50
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		for index := 0; index < iterations; index++ {
			input := SemanticCartographerSettingsInputFromSettings(initial.Settings)
			input.ObservationConfig.MaxWindowEvents = 3 + index%5
			input.ObservationConfig.MaxWindowContentBytes = 512 + index
			input.ObservationConfig.AssistantThresholdBytes = 128
			input.ObservationConfig.OutputThresholdBytes = 128
			input.ObservationConfig.PriorSummaryLimit = 1 + index%3
			input.ObservationConfig.TokenBudget = 256 + index
			if _, err := service.UpdateSemanticCartographerSettings(ctx, input, models); err != nil {
				errs <- err
				return
			}
		}
	}()
	go func() {
		defer wg.Done()
		<-start
		for index := 0; index < iterations; index++ {
			_, err := service.BuildManualCartographerWindow(ctx, CartographerManualWindowRequest{
				WorkspaceID:    testWorkspaceID,
				TargetEntityID: "node_settings_sync_" + threeDigit(index+1),
				Summary:        "Build a cartographer input bundle while settings are changing.",
			})
			if err != nil {
				errs <- err
				return
			}
		}
	}()
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent settings/window input operation failed: %v", err)
	}
}

func TestCartographerQueuedRunsSnapshotCurrentSettingsAudit(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	initial, err := store.ReadSemanticCartographerSettings(ctx)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	settings := initial.Settings
	settings.LiveTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
	settings.LiveTaskConfig.ModelID = "gpt-cartographer-live"
	settings.LiveTaskConfig.ReasoningEffort = "high"
	settings.FinalSynthesisTaskConfig.ModelSelection = SemanticCartographerModelSelectionExplicit
	settings.FinalSynthesisTaskConfig.ModelID = "gpt-cartographer-final"
	settings.FinalSynthesisTaskConfig.ReasoningEffort = "medium"
	snapshot, err := store.UpdateSemanticCartographerSettings(ctx, settings)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}

	service, err := NewService(
		store,
		associationWorkspaceResolver{root: t.TempDir()},
		WithIDGenerator(countingIDGenerator()),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	liveWindow, err := service.BuildManualCartographerWindow(ctx, CartographerManualWindowRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    CartographerTriggerWorkflowWindow,
		TargetEntityID: "node_cartographer_live_settings",
		SourceRefs:     SemanticContextSourceRefs{ChatRunID: "chat_run_cartographer_live_settings"},
		Summary:        "Snapshot live settings.",
	})
	if err != nil {
		t.Fatalf("build live cartographer window: %v", err)
	}
	finalWindow, err := service.BuildManualCartographerWindow(ctx, CartographerManualWindowRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    CartographerTriggerWorkflowDone,
		TargetEntityID: "node_cartographer_final_settings",
		SourceRefs:     SemanticContextSourceRefs{WorkflowExecutionID: "workflow_execution_cartographer_final_settings"},
		Summary:        "Snapshot final settings.",
	})
	if err != nil {
		t.Fatalf("build final cartographer window: %v", err)
	}

	changed := snapshot.Settings
	changed.LiveTaskConfig.ModelID = "gpt-cartographer-live-changed"
	changed.FinalSynthesisTaskConfig.ModelID = "gpt-cartographer-final-changed"
	if _, err := store.UpdateSemanticCartographerSettings(ctx, changed); err != nil {
		t.Fatalf("change settings after queueing: %v", err)
	}

	liveRun := readCartographerRunForTest(t, store, liveWindow.RunID)
	assertCartographerRunSettingsSnapshot(t, liveRun, snapshot.SettingsHash, CartographerTaskProfileLiveWindow, "gpt-cartographer-live", "high")
	finalRun := readCartographerRunForTest(t, store, finalWindow.RunID)
	assertCartographerRunSettingsSnapshot(t, finalRun, snapshot.SettingsHash, CartographerTaskProfileFinalSynthesis, "gpt-cartographer-final", "medium")
}

func readCartographerRunForTest(t *testing.T, store *Store, runID string) CartographerRun {
	t.Helper()
	run, ok, err := store.ReadCartographerRun(context.Background(), testWorkspaceID, runID)
	if err != nil || !ok {
		t.Fatalf("read cartographer run %s: ok=%v err=%v", runID, ok, err)
	}
	return run
}

func assertCartographerRunSettingsSnapshot(t *testing.T, run CartographerRun, settingsHash string, profile CartographerTaskProfile, requestedModel string, requestedReasoning string) {
	t.Helper()
	if run.SettingsHash != settingsHash ||
		run.TaskProfile != profile ||
		run.RequestedModelSelection != SemanticCartographerModelSelectionExplicit ||
		run.RequestedModel != requestedModel ||
		string(run.RequestedReasoningEffort) != requestedReasoning ||
		run.EffectiveModel != "" ||
		run.EffectiveReasoningEffort != "" {
		t.Fatalf("run settings audit = %+v, want hash %s profile %s requested model %s reasoning %s with empty effective fields", run, settingsHash, profile, requestedModel, requestedReasoning)
	}
}
