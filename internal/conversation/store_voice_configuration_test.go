package conversation

import (
	"context"
	"database/sql"
	"testing"

	"setta/internal/speech"
)

func TestStoreInitializesMasterVoiceSelectionOnceAndPreservesItAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	initial := speech.DefaultMasterVoiceSelection("2026-07-12T18:00:00Z")
	selection, err := store.EnsureMasterVoiceSelection(context.Background(), initial)
	if err != nil {
		t.Fatalf("EnsureMasterVoiceSelection: %v", err)
	}
	if selection.Selection != speech.VoiceSelectionExact ||
		selection.ResolvedVoiceID == nil || *selection.ResolvedVoiceID != speech.SpeechVoiceMarin {
		t.Fatalf("initial selection = %+v", selection)
	}

	cedar := speech.SpeechVoiceCedar
	differentDefault := speech.MasterVoiceSelection{
		Selection:        speech.VoiceSelectionExact,
		RequestedVoiceID: &cedar,
		ResolvedVoiceID:  &cedar,
		UpdatedAt:        "2026-07-12T19:00:00Z",
	}
	preserved, err := store.EnsureMasterVoiceSelection(context.Background(), differentDefault)
	if err != nil {
		t.Fatalf("repeat EnsureMasterVoiceSelection: %v", err)
	}
	if preserved.ResolvedVoiceID == nil || *preserved.ResolvedVoiceID != speech.SpeechVoiceMarin ||
		preserved.UpdatedAt != initial.UpdatedAt {
		t.Fatalf("preserved selection = %+v, want original %+v", preserved, initial)
	}
	if got := countRows(t, store, "master_voice_selection"); got != 1 {
		t.Fatalf("master voice selection rows = %d, want 1", got)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	restored, err := reopened.ReadMasterVoiceSelection(context.Background())
	if err != nil {
		t.Fatalf("ReadMasterVoiceSelection after restart: %v", err)
	}
	if restored.ResolvedVoiceID == nil || *restored.ResolvedVoiceID != speech.SpeechVoiceMarin ||
		restored.UpdatedAt != initial.UpdatedAt {
		t.Fatalf("restored selection = %+v, want original %+v", restored, initial)
	}
}

func TestStoreReportsInvalidMasterVoiceSelectionAsCorruptState(t *testing.T) {
	store := newTestStore(t)
	err := store.write(context.Background(), "seed invalid master voice selection", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO master_voice_selection (
  singleton, selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
) VALUES (1, 'exact', 'missing', 'missing', NULL, '2026-07-12T18:00:00Z')
`)
		return err
	})
	if err != nil {
		t.Fatalf("seed invalid master voice selection: %v", err)
	}
	if _, err := store.ReadMasterVoiceSelection(context.Background()); !IsCorruptStateError(err) {
		t.Fatalf("read error = %T %v, want CorruptStateError", err, err)
	}
}
