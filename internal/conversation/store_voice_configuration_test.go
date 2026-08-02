package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/speech"
)

func TestStoreInitializesDirectorVoiceSelectionOnceAndPreservesItAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	initial := speech.DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z")
	selection, err := store.EnsureDirectorVoiceSelection(context.Background(), initial)
	if err != nil {
		t.Fatalf("EnsureDirectorVoiceSelection: %v", err)
	}
	if selection.Selection != speech.VoiceSelectionExact ||
		selection.ResolvedVoiceID == nil || *selection.ResolvedVoiceID != speech.SpeechVoiceMarin {
		t.Fatalf("initial selection = %+v", selection)
	}
	assertDirectorVoiceInitializationEvent(t, store, initial)

	cedar := speech.SpeechVoiceCedar
	differentDefault := speech.DirectorVoiceSelection{
		Selection:        speech.VoiceSelectionExact,
		RequestedVoiceID: &cedar,
		ResolvedVoiceID:  &cedar,
		UpdatedAt:        "2026-07-12T19:00:00Z",
	}
	preserved, err := store.EnsureDirectorVoiceSelection(context.Background(), differentDefault)
	if err != nil {
		t.Fatalf("repeat EnsureDirectorVoiceSelection: %v", err)
	}
	if preserved.ResolvedVoiceID == nil || *preserved.ResolvedVoiceID != speech.SpeechVoiceMarin ||
		preserved.UpdatedAt != initial.UpdatedAt {
		t.Fatalf("preserved selection = %+v, want original %+v", preserved, initial)
	}
	if got := countRows(t, store, "director_voice_selection"); got != 1 {
		t.Fatalf("director voice selection rows = %d, want 1", got)
	}
	assertDirectorVoiceInitializationEvent(t, store, initial)
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	restored, err := reopened.ReadDirectorVoiceSelection(context.Background())
	if err != nil {
		t.Fatalf("ReadDirectorVoiceSelection after restart: %v", err)
	}
	if restored.ResolvedVoiceID == nil || *restored.ResolvedVoiceID != speech.SpeechVoiceMarin ||
		restored.UpdatedAt != initial.UpdatedAt {
		t.Fatalf("restored selection = %+v, want original %+v", restored, initial)
	}
	assertDirectorVoiceInitializationEvent(t, reopened, initial)
}

func TestStoreDoesNotSilentlyRecreateMissingInitializedDirectorVoiceSelection(t *testing.T) {
	store := newTestStore(t)
	initial := speech.DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z")
	if _, err := store.EnsureDirectorVoiceSelection(context.Background(), initial); err != nil {
		t.Fatalf("EnsureDirectorVoiceSelection: %v", err)
	}
	if err := store.write(context.Background(), "delete initialized director voice selection", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "DELETE FROM director_voice_selection WHERE singleton = 1")
		return err
	}); err != nil {
		t.Fatalf("delete initialized director voice selection: %v", err)
	}

	if _, err := store.EnsureDirectorVoiceSelection(context.Background(), initial); !IsCorruptStateError(err) ||
		!strings.Contains(err.Error(), "missing after initialization") {
		t.Fatalf("ensure error = %T %v, want missing initialized state", err, err)
	}
	if got := countRows(t, store, "director_voice_selection"); got != 0 {
		t.Fatalf("director voice selection rows after rejected recreation = %d, want 0", got)
	}
}

func TestStoreRejectsDirectorVoiceSelectionWithoutInitializationEvent(t *testing.T) {
	store := newTestStore(t)
	selection := speech.DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z")
	if err := store.write(context.Background(), "seed unpublished director voice selection", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO director_voice_selection (
  singleton, selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
) VALUES (1, 'exact', 'marin', 'marin', NULL, ?)
`, selection.UpdatedAt)
		return err
	}); err != nil {
		t.Fatalf("seed unpublished director voice selection: %v", err)
	}

	if _, err := store.ReadDirectorVoiceSelection(context.Background()); !IsCorruptStateError(err) ||
		!strings.Contains(err.Error(), "initialization event is missing") {
		t.Fatalf("read error = %T %v, want unpublished configuration error", err, err)
	}
}

func TestStoreRejectsMalformedDirectorVoiceInitializationEvent(t *testing.T) {
	store := newTestStore(t)
	initial := speech.DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z")
	if _, err := store.EnsureDirectorVoiceSelection(context.Background(), initial); err != nil {
		t.Fatalf("EnsureDirectorVoiceSelection: %v", err)
	}
	if err := store.write(context.Background(), "corrupt director voice initialization", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
UPDATE committed_events
SET payload_json = '{"catalog":{},"selection":{},"unknown":true}'
WHERE id = ?
`, speech.DirectorVoiceSelectionInitializedEventID)
		return err
	}); err != nil {
		t.Fatalf("corrupt director voice initialization: %v", err)
	}

	if _, err := store.ReadDirectorVoiceSelection(context.Background()); !IsCorruptStateError(err) ||
		!strings.Contains(err.Error(), "initialization event") {
		t.Fatalf("read error = %T %v, want malformed initialization event", err, err)
	}
}

func TestStoreReportsInvalidDirectorVoiceSelectionAsCorruptState(t *testing.T) {
	store := newTestStore(t)
	initial := speech.DefaultDirectorVoiceSelection("2026-07-12T18:00:00Z")
	if _, err := store.EnsureDirectorVoiceSelection(context.Background(), initial); err != nil {
		t.Fatalf("EnsureDirectorVoiceSelection: %v", err)
	}
	err := store.write(context.Background(), "seed invalid director voice selection", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
UPDATE director_voice_selection
SET requested_voice_id = 'missing', resolved_voice_id = 'missing'
WHERE singleton = 1
`)
		return err
	})
	if err != nil {
		t.Fatalf("seed invalid director voice selection: %v", err)
	}
	if _, err := store.ReadDirectorVoiceSelection(context.Background()); !IsCorruptStateError(err) {
		t.Fatalf("read error = %T %v, want CorruptStateError", err, err)
	}
}

func TestStorePersistsAndUpdatesNarratorVoiceDefaultAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	initial := speech.DefaultNarratorVoiceSelection("2026-07-12T18:00:00Z")
	value, err := store.EnsureNarratorVoiceDefault(context.Background(), initial)
	if err != nil || value.Selection != speech.VoiceSelectionAutoDistinct {
		t.Fatalf("initial narrator voice default = %+v, err=%v", value, err)
	}
	cedar := speech.SpeechVoiceCedar
	updated, err := store.UpdateNarratorVoiceDefault(
		context.Background(),
		speech.VoiceSelectionRequest{
			Selection:        speech.VoiceSelectionExact,
			RequestedVoiceID: &cedar,
		},
		"2026-07-12T18:00:01Z",
	)
	if err != nil || updated.RequestedVoiceID == nil || *updated.RequestedVoiceID != cedar {
		t.Fatalf("updated narrator voice default = %+v, err=%v", updated, err)
	}
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		speech.NarratorVoiceDefaultStreamID,
		0,
		10,
	)
	if err != nil || len(events) != 2 ||
		events[0].ID != speech.NarratorVoiceDefaultInitializedEventID ||
		events[1].Kind != speech.NarratorVoiceDefaultUpdatedEventKind {
		t.Fatalf("narrator voice default events = %+v, err=%v", events, err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	restored, err := reopened.ReadNarratorVoiceDefault(context.Background())
	if err != nil || restored.RequestedVoiceID == nil || *restored.RequestedVoiceID != cedar ||
		restored.UpdatedAt != updated.UpdatedAt {
		t.Fatalf("restored narrator voice default = %+v, err=%v", restored, err)
	}
}

func assertDirectorVoiceInitializationEvent(
	t *testing.T,
	store *Store,
	want speech.DirectorVoiceSelection,
) {
	t.Helper()
	events, err := store.ReadCommittedStreamEvents(
		context.Background(),
		speech.DirectorVoiceSelectionStreamID,
		0,
		10,
	)
	if err != nil {
		t.Fatalf("read director voice selection events: %v", err)
	}
	if len(events) != 1 || events[0].ID != speech.DirectorVoiceSelectionInitializedEventID ||
		events[0].Kind != speech.DirectorVoiceSelectionInitializedEventKind {
		t.Fatalf("director voice initialization events = %+v", events)
	}
	var initialization speech.DirectorVoiceSelectionInitialization
	if err := json.Unmarshal(events[0].Payload, &initialization); err != nil {
		t.Fatalf("decode director voice initialization: %v", err)
	}
	if initialization.Catalog.Provider != speech.SpeechProviderOpenAI ||
		initialization.Catalog.Version == "" ||
		len(initialization.Catalog.VoiceIDs) != 13 ||
		initialization.Selection.Selection != want.Selection ||
		initialization.Selection.RequestedVoiceID == nil ||
		initialization.Selection.ResolvedVoiceID == nil ||
		*initialization.Selection.RequestedVoiceID != *want.RequestedVoiceID ||
		*initialization.Selection.ResolvedVoiceID != *want.ResolvedVoiceID ||
		initialization.Selection.UpdatedAt != want.UpdatedAt {
		t.Fatalf("director voice initialization = %+v, want selection %+v", initialization, want)
	}
}
