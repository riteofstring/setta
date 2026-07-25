package controlplane

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestHostedAccessIntentIsDurableIdempotentAndProviderNeutral(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	if _, err := store.UpsertUser(ctx, "user-hosted"); err != nil {
		t.Fatal(err)
	}
	intent := testHostedAccessIntent()
	progress, err := store.EnsureHostedAccessIntent(ctx, intent)
	if err != nil {
		t.Fatalf("EnsureHostedAccessIntent: %v", err)
	}
	requirePreparingHostedAccess(t, progress)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	restarted := openTestStore(t, directory, time.Now, RateLimit{})
	defer restarted.Close()
	replayed, err := restarted.EnsureHostedAccessIntent(ctx, intent)
	if err != nil {
		t.Fatalf("replay hosted access intent: %v", err)
	}
	requirePreparingHostedAccess(t, replayed)
	read, err := restarted.HostedAccessProgress(ctx, intent.IdempotencyKey)
	if err != nil {
		t.Fatalf("read hosted access progress: %v", err)
	}
	requirePreparingHostedAccess(t, read)

	changed := intent
	changed.ProjectID = "different-project"
	if _, err := restarted.EnsureHostedAccessIntent(ctx, changed); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("changed replay error = %v, want ErrIdempotencyConflict", err)
	}
}

func TestHostedAccessIntentRequiresActiveKnownUserAndBoundedCapabilities(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	intent := testHostedAccessIntent()
	if _, err := store.EnsureHostedAccessIntent(ctx, intent); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown user error = %v, want ErrNotFound", err)
	}
	if _, err := store.UpsertUser(ctx, intent.UserID); err != nil {
		t.Fatal(err)
	}
	duplicate := intent
	duplicate.IdempotencyKey = "hosted-duplicate"
	duplicate.RequestedCapabilities = []HostedAccessCapability{
		HostedAccessCapabilityObserve,
		HostedAccessCapabilityObserve,
	}
	if _, err := store.EnsureHostedAccessIntent(ctx, duplicate); err == nil {
		t.Fatal("duplicate capability was accepted")
	}
	unknown := intent
	unknown.IdempotencyKey = "hosted-unknown"
	unknown.RequestedCapabilities = []HostedAccessCapability{"provider_admin"}
	if _, err := store.EnsureHostedAccessIntent(ctx, unknown); err == nil {
		t.Fatal("unknown capability was accepted")
	}
}

func TestHostedAccessProgressRejectsInvalidOrAheadCursors(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	intent := testHostedAccessIntent()
	if _, err := store.UpsertUser(ctx, intent.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureHostedAccessIntent(ctx, intent); err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.HostedAccessProgressAfter(ctx, intent.IdempotencyKey, "not-a-cursor"); err == nil {
		t.Fatal("non-numeric hosted access cursor was accepted")
	}
	if _, _, err := store.HostedAccessProgressAfter(ctx, intent.IdempotencyKey, "2"); err == nil {
		t.Fatal("cursor ahead of durable hosted access progress was accepted")
	}
	events, _, err := store.HostedAccessProgressAfter(ctx, intent.IdempotencyKey, "1")
	if err != nil || len(events) != 0 {
		t.Fatalf("current hosted access cursor = %+v, %v", events, err)
	}
}

func TestHostedAccessCompletionPublishesReadyGrantAcrossRestart(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	intent := testHostedAccessIntent()
	credential, err := NewDeviceCredential()
	if err != nil {
		t.Fatal(err)
	}
	intent.Client.DeviceID = credential.DeviceID
	if _, err := store.UpsertUser(ctx, intent.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureHostedAccessIntent(ctx, intent); err != nil {
		t.Fatal(err)
	}
	runtimeName := testRuntimeName(t, "hosted-ready")
	assignTestRuntime(t, store, "hosted-ready-runtime", intent.UserID, runtimeName, "hosted_secret")
	created, err := store.EnsureDeviceGrant(ctx, EnsureDeviceGrantRequest{
		Credential:  credential,
		UserID:      intent.UserID,
		RuntimeName: runtimeName,
		DisplayName: "Hosted phone",
		GrantTTL:    time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	progress, err := store.CompleteHostedAccessIntent(ctx, intent.IdempotencyKey, created)
	if err != nil {
		t.Fatalf("CompleteHostedAccessIntent: %v", err)
	}
	requireReadyHostedAccess(t, progress, credential.DeviceID)
	replayed, err := store.CompleteHostedAccessIntent(ctx, intent.IdempotencyKey, created)
	if err != nil {
		t.Fatalf("replay CompleteHostedAccessIntent: %v", err)
	}
	requireReadyHostedAccess(t, replayed, credential.DeviceID)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	restarted := openTestStore(t, directory, time.Now, RateLimit{})
	defer restarted.Close()
	persisted, err := restarted.HostedAccessProgress(ctx, intent.IdempotencyKey)
	if err != nil {
		t.Fatalf("read restarted hosted access progress: %v", err)
	}
	requireReadyHostedAccess(t, persisted, credential.DeviceID)
}

func TestVersionOneControlPlaneDatabaseFailsWithoutCompatibilityMigration(t *testing.T) {
	directory := t.TempDir()
	store := openTestStore(t, directory, time.Now, RateLimit{})
	if _, err := store.db.Exec("PRAGMA user_version = 1"); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := OpenStore(StoreConfig{Directory: filepath.Clean(directory)}); err == nil {
		t.Fatal("version 1 database was silently migrated")
	}
}

func testHostedAccessIntent() EnsureHostedAccessIntent {
	return EnsureHostedAccessIntent{
		IdempotencyKey: "hosted-intent-1",
		UserID:         "user-hosted",
		ProjectID:      "project-hosted",
		WorkstreamID:   "workstream-hosted",
		Client: HostedAccessClient{
			DeviceID: "phone-hosted",
			Kind:     HostedAccessClientPhone,
		},
		RequestedCapabilities: []HostedAccessCapability{
			HostedAccessCapabilityObserve,
			HostedAccessCapabilitySteer,
			HostedAccessCapabilityApprove,
			HostedAccessCapabilityArtifacts,
		},
	}
}

func requirePreparingHostedAccess(t *testing.T, progress HostedAccessProgress) {
	t.Helper()
	if progress.IntentID != "hosted-intent-1" ||
		progress.Cursor != "1" ||
		progress.State != HostedAccessProgressPreparingAccess ||
		progress.ReasonCode != "" ||
		progress.Retryable ||
		progress.AccessGrant != nil {
		t.Fatalf("unexpected hosted access progress: %+v", progress)
	}
}

func requireReadyHostedAccess(t *testing.T, progress HostedAccessProgress, deviceID string) {
	t.Helper()
	if progress.IntentID != "hosted-intent-1" ||
		progress.Cursor != "3" ||
		progress.State != HostedAccessProgressReadyOnPhone ||
		progress.ReasonCode != "" ||
		progress.Retryable ||
		progress.AccessGrant == nil ||
		progress.AccessGrant.DeviceID != deviceID ||
		progress.AccessGrant.ProjectID != "project-hosted" ||
		progress.AccessGrant.WorkstreamID != "workstream-hosted" ||
		len(progress.AccessGrant.GrantedCapabilities) != 4 ||
		progress.AccessGrant.ExpiresAt == "" {
		t.Fatalf("unexpected ready hosted access progress: %+v", progress)
	}
}
