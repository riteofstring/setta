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
