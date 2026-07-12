package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"

	"setta/internal/agent"
	"setta/internal/master"
)

func TestStorePersistsSingletonMasterSessionAndLifecycleEventsAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	candidate, created := createPersistentMasterSession(t, store)
	assertSingletonMasterSession(t, store, candidate)
	threadID := activatePersistentMasterSession(t, store, created)
	assertCommittedMasterSessionEvents(t, store, threadID)
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	reopened := reopenMasterSessionStore(t, appDataDir)
	assertRestoredMasterSession(t, reopened, threadID)
}

func createPersistentMasterSession(t *testing.T, store *Store) (master.Session, master.Session) {
	t.Helper()
	candidate := persistentMasterSession(t)
	created, didCreate, err := store.CreateMasterSession(context.Background(), candidate)
	if err != nil {
		t.Fatalf("CreateMasterSession: %v", err)
	}
	if !didCreate || created.ID != candidate.ID || countRows(t, store, "master_sessions") != 1 {
		t.Fatalf("created master session = %+v created=%t", created, didCreate)
	}
	return candidate, created
}

func assertSingletonMasterSession(t *testing.T, store *Store, candidate master.Session) {
	t.Helper()
	duplicateCandidate := persistentMasterSession(t)
	duplicateCandidate.ID = "master-session-other"
	existing, didCreate, err := store.CreateMasterSession(context.Background(), duplicateCandidate)
	if err != nil {
		t.Fatalf("duplicate CreateMasterSession: %v", err)
	}
	if didCreate || existing.ID != candidate.ID || countRows(t, store, "master_sessions") != 1 {
		t.Fatalf("singleton master session = %+v created=%t", existing, didCreate)
	}
}

func activatePersistentMasterSession(t *testing.T, store *Store, created master.Session) string {
	t.Helper()
	threadID := "provider-master-thread"
	ready := master.CloneSession(created)
	ready.ProviderThreadID = &threadID
	ready.Status = master.SessionStatusReady
	ready.UpdatedAt = testTimeEnded
	if err := store.UpdateMasterSession(context.Background(), created.UpdatedAt, ready); err != nil {
		t.Fatalf("UpdateMasterSession: %v", err)
	}
	return threadID
}

func assertCommittedMasterSessionEvents(t *testing.T, store *Store, threadID string) {
	t.Helper()
	events, err := store.ReadCommittedStreamEvents(context.Background(), master.GlobalSessionStreamID, 0, 10)
	if err != nil {
		t.Fatalf("ReadCommittedStreamEvents: %v", err)
	}
	if len(events) != 2 || events[0].Kind != master.SessionCreatedEventKind ||
		events[1].Kind != master.SessionUpdatedEventKind {
		t.Fatalf("master lifecycle events = %+v", events)
	}
	var eventSession master.Session
	if err := json.Unmarshal(events[1].Payload, &eventSession); err != nil {
		t.Fatalf("decode master session event: %v", err)
	}
	if err := eventSession.Validate(); err != nil || eventSession.ProviderThreadID == nil ||
		*eventSession.ProviderThreadID != threadID {
		t.Fatalf("master session event = %+v validation=%v", eventSession, err)
	}
}

func reopenMasterSessionStore(t *testing.T, appDataDir string) *Store {
	t.Helper()
	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	return reopened
}

func assertRestoredMasterSession(t *testing.T, reopened *Store, threadID string) {
	t.Helper()
	restored, found, err := reopened.ReadMasterSession(context.Background())
	if err != nil {
		t.Fatalf("ReadMasterSession after restart: %v", err)
	}
	if !found || restored.ProviderThreadID == nil || *restored.ProviderThreadID != threadID ||
		restored.Status != master.SessionStatusReady {
		t.Fatalf("restored master session = %+v found=%t", restored, found)
	}
}

func TestStoreRejectsStaleMasterSessionUpdate(t *testing.T) {
	store := newTestStore(t)
	candidate := persistentMasterSession(t)
	created, _, err := store.CreateMasterSession(context.Background(), candidate)
	if err != nil {
		t.Fatalf("CreateMasterSession: %v", err)
	}
	threadID := "provider-master-thread"
	ready := master.CloneSession(created)
	ready.ProviderThreadID = &threadID
	ready.Status = master.SessionStatusReady
	ready.UpdatedAt = testTimeEnded
	if err := store.UpdateMasterSession(context.Background(), created.UpdatedAt, ready); err != nil {
		t.Fatalf("UpdateMasterSession: %v", err)
	}

	stale := master.CloneSession(ready)
	stale.UpdatedAt = "2026-07-11T20:02:00Z"
	if err := store.UpdateMasterSession(context.Background(), created.UpdatedAt, stale); !master.IsSessionConflict(err) {
		t.Fatalf("stale update error = %T %v, want SessionConflictError", err, err)
	}
	if countRows(t, store, "committed_events") != 2 {
		t.Fatal("stale master session update published an event")
	}
}

func TestStoreReportsCorruptMasterSessionConfiguration(t *testing.T) {
	store := newTestStore(t)
	if _, _, err := store.CreateMasterSession(context.Background(), persistentMasterSession(t)); err != nil {
		t.Fatalf("CreateMasterSession: %v", err)
	}
	err := store.write(context.Background(), "corrupt master configuration", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
UPDATE master_sessions
SET resolved_invocation_json = '{}'
WHERE singleton = 1
`)
		return err
	})
	if err != nil {
		t.Fatalf("corrupt master configuration: %v", err)
	}
	if _, _, err := store.ReadMasterSession(context.Background()); !IsCorruptStateError(err) {
		t.Fatalf("corrupt master session error = %T %v, want CorruptStateError", err, err)
	}
}

func persistentMasterSession(t *testing.T) master.Session {
	t.Helper()
	profile := DefaultMasterRoleProfile()
	profileJSON, err := json.Marshal(profile)
	if err != nil {
		t.Fatalf("encode master profile: %v", err)
	}
	requested, err := providerInvocation(profile)
	if err != nil {
		t.Fatalf("map master provider invocation: %v", err)
	}
	configuration := master.RoleConfiguration{
		RequestedProfile: profileJSON,
		ResolvedInvocation: agent.ResolvedInvocation{
			Requested:       requested,
			Model:           requested.Model,
			ReasoningEffort: requested.ReasoningEffort,
			PermissionMode:  requested.PermissionMode,
			ApprovalMode:    requested.ApprovalMode,
		},
	}
	return master.Session{
		ID:             "master-session",
		Provider:       "codex",
		Status:         master.SessionStatusInitializing,
		Configuration:  configuration,
		DurableContext: json.RawMessage(`{}`),
		CreatedAt:      testTimeStarted,
		UpdatedAt:      testTimeStarted,
	}
}
