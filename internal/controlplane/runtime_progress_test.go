package controlplane

import (
	"context"
	"testing"
	"time"
)

func TestRuntimeProgressPushesProvisioningRetryAndCompletion(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	request := testEnsureRuntimeRequest(t, "progress-ensure", "user-progress-ensure", "progress-ensure")
	if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	events, update, err := store.RuntimeProgressAfter(ctx, request.IdempotencyKey, "")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressQueued)
	provider := newTestReconcilerProvider(request.RuntimeName)
	provider.ambiguousCreate = true
	reconciler := newTestReconciler(t, store, provider, 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("retrying reconcile = %t, %v", processed, err)
	}
	requireClosed(t, update, "provisioning claim progress")
	events, update, err = store.RuntimeProgressAfter(ctx, request.IdempotencyKey, "1")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressReconciling, RuntimeProgressRetrying)
	operation, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil {
		t.Fatal(err)
	}
	now = operation.NextAttemptAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("completion reconcile = %t, %v", processed, err)
	}
	requireClosed(t, update, "provisioning completion progress")
	events, _, err = store.RuntimeProgressAfter(ctx, request.IdempotencyKey, "3")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressReconciling, RuntimeProgressProvisioned)
	if events[0].ErrorCode != "" || events[1].Retryable {
		t.Fatalf("content-free completion progress = %+v", events)
	}
}

func TestRuntimeProgressPushesWakeHealthWithoutFalseUnhealthyTransition(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "progress-wake", "user-progress-wake")
	if _, err := store.RequestRuntimeWake(ctx, "progress-wake-operation", runtimeName); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RequestRuntimeWake(ctx, "progress-wake-operation-second", runtimeName); err != nil {
		t.Fatal(err)
	}
	events, update, err := store.RuntimeProgressAfter(ctx, "progress-wake-operation", "")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressWakeRequested)
	now = now.Add(time.Minute)
	health, err := store.RecordRuntimeHealth(ctx, RecordRuntimeHealthRequest{
		RuntimeName:     runtimeName,
		HealthState:     RuntimeHealthDegraded,
		ObservedRelease: "test-release",
	})
	if err != nil || health.Runtime.WakeRequestedAt == nil ||
		!health.WakePending || health.WakeCompleted {
		t.Fatalf("degraded wake health = %+v, %v", health, err)
	}
	select {
	case <-update:
		t.Fatal("degraded health completed wake progress")
	default:
	}
	now = now.Add(time.Minute)
	health, err = store.RecordRuntimeHealth(ctx, RecordRuntimeHealthRequest{
		RuntimeName:     runtimeName,
		HealthState:     RuntimeHealthHealthy,
		ObservedRelease: "test-release",
	})
	if err != nil || health.Runtime.WakeRequestedAt != nil ||
		!health.WakePending || !health.WakeCompleted {
		t.Fatalf("healthy wake state = %+v, %v", health, err)
	}
	requireClosed(t, update, "healthy wake progress")
	events, _, err = store.RuntimeProgressAfter(ctx, "progress-wake-operation", "1")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(t, events, RuntimeProgressHealthy)
	events, _, err = store.RuntimeProgressAfter(ctx, "progress-wake-operation-second", "")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(
		t,
		events,
		RuntimeProgressWakeRequested,
		RuntimeProgressHealthy,
	)
}

func TestRuntimeProgressPersistsDeletionRetryAndRestartReplay(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	store := openTestStore(t, directory, clock, RateLimit{})
	runtimeName := prepareDeletionRuntime(t, store, "progress-delete", "user-progress-delete")
	scheduledAt := now.Add(time.Minute)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "progress-delete-operation",
		RuntimeName:    runtimeName,
		ScheduledAt:    scheduledAt,
	}); err != nil {
		t.Fatal(err)
	}
	provider := newTestReconcilerProvider(runtimeName)
	provider.found = true
	provider.ambiguousDestroy = true
	reconciler := newTestReconciler(t, store, provider, 3)
	now = scheduledAt
	if _, err := reconciler.ReconcileOnce(ctx); err != nil {
		t.Fatal(err)
	}
	operation, err := store.RuntimeDeletionOperation(ctx, "progress-delete-operation")
	if err != nil {
		t.Fatal(err)
	}
	now = operation.NextAttemptAt
	if _, err := reconciler.ReconcileOnce(ctx); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store = openTestStore(t, directory, clock, RateLimit{})
	defer store.Close()
	events, _, err := store.RuntimeProgressAfter(ctx, "progress-delete-operation", "")
	if err != nil {
		t.Fatal(err)
	}
	requireRuntimeProgressStates(
		t,
		events,
		RuntimeProgressDeletionScheduled,
		RuntimeProgressReconciling,
		RuntimeProgressRetrying,
		RuntimeProgressReconciling,
		RuntimeProgressDeleted,
	)
	if !events[2].Retryable || events[2].ErrorCode != "provider_destroy" {
		t.Fatalf("deletion retry progress = %+v", events[2])
	}
}

func TestRuntimeProgressRejectsMalformedAndAheadCursors(t *testing.T) {
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	request := testEnsureRuntimeRequest(t, "progress-cursor", "user-progress-cursor", "progress-cursor")
	if _, err := store.UpsertUser(t.Context(), request.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(t.Context(), request); err != nil {
		t.Fatal(err)
	}
	for _, cursor := range []string{"-1", "not-a-cursor", "2"} {
		if _, _, err := store.RuntimeProgressAfter(
			t.Context(),
			request.IdempotencyKey,
			cursor,
		); err == nil {
			t.Fatalf("runtime progress accepted cursor %q", cursor)
		}
	}
}

func requireRuntimeProgressStates(
	t *testing.T,
	events []RuntimeProgress,
	want ...RuntimeProgressState,
) {
	t.Helper()
	if len(events) != len(want) {
		t.Fatalf("runtime progress count = %d, want %d: %+v", len(events), len(want), events)
	}
	for index, state := range want {
		if events[index].State != state {
			t.Fatalf("runtime progress[%d] = %+v, want state %q", index, events[index], state)
		}
	}
}
