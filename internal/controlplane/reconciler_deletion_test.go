package controlplane

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDeletionReconcilerDestroysDueRuntimeAfterStoreRestart(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	now := time.Date(2026, 7, 24, 18, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	store := openTestStore(t, directory, clock, RateLimit{})
	runtimeName := prepareDeletionRuntime(t, store, "delete-restart", "user-delete-restart")
	scheduledAt := now.Add(time.Hour)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-restart-operation",
		RuntimeName:    runtimeName,
		ScheduledAt:    scheduledAt,
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store = openTestStore(t, directory, clock, RateLimit{})
	defer store.Close()
	provider := newTestReconcilerProvider(runtimeName)
	provider.found = true
	reconciler := newTestReconciler(t, store, provider, 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || processed {
		t.Fatalf("early deletion reconcile = %t, %v", processed, err)
	}
	now = scheduledAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("due deletion reconcile = %t, %v", processed, err)
	}
	requireCompletedDeletion(t, store, provider, runtimeName, "delete-restart-operation")
}

func TestDeletionReconcilerAdoptsAmbiguousDestroyWithoutRepeatingIt(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "delete-ambiguous", "user-delete-ambiguous")
	scheduledAt := now.Add(time.Minute)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-ambiguous-operation",
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
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("ambiguous deletion reconcile = %t, %v", processed, err)
	}
	operation, err := store.RuntimeDeletionOperation(ctx, "delete-ambiguous-operation")
	if err != nil || operation.Status != RuntimeOperationRetryWait ||
		operation.LastErrorCode != "provider_destroy" || provider.destroyCalls != 1 {
		t.Fatalf("deferred ambiguous deletion = %+v, calls=%d, %v", operation, provider.destroyCalls, err)
	}
	now = operation.NextAttemptAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("adopt deletion reconcile = %t, %v", processed, err)
	}
	requireCompletedDeletion(t, store, provider, runtimeName, "delete-ambiguous-operation")
}

func TestDeletionReconcilerRefusesForeignProviderIdentity(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "delete-foreign", "user-delete-foreign")
	scheduledAt := now.Add(time.Minute)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-foreign-operation",
		RuntimeName:    runtimeName,
		ScheduledAt:    scheduledAt,
	}); err != nil {
		t.Fatal(err)
	}
	provider := newTestReconcilerProvider(runtimeName)
	provider.found = true
	provider.malformedIdentity = true
	reconciler := newTestReconciler(t, store, provider, 3)
	now = scheduledAt
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("foreign deletion reconcile = %t, %v", processed, err)
	}
	operation, err := store.RuntimeDeletionOperation(ctx, "delete-foreign-operation")
	if err != nil || operation.Status != RuntimeOperationFailed ||
		operation.LastErrorCode != "provider_identity_mismatch" ||
		provider.destroyCalls != 0 {
		t.Fatalf("foreign deletion = %+v, calls=%d, %v", operation, provider.destroyCalls, err)
	}
	recovered, err := store.CancelRuntimeDeletion(ctx, runtimeName, RuntimeAccessSuspended)
	if err != nil || recovered.AccessState != RuntimeAccessSuspended ||
		recovered.DeletionScheduledAt != nil {
		t.Fatalf("recovered failed deletion = %+v, %v", recovered, err)
	}
}

func TestDeletionSchedulingIsGloballyIdempotentAndCancelIsExplicit(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "delete-policy", "user-delete-policy")
	request := ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-policy-operation",
		RuntimeName:    runtimeName,
		ScheduledAt:    now.Add(time.Hour),
	}
	first, err := store.ScheduleRuntimeDeletion(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := store.ScheduleRuntimeDeletion(ctx, request)
	if err != nil || replayed.DeletionScheduledAt == nil ||
		!replayed.DeletionScheduledAt.Equal(*first.DeletionScheduledAt) {
		t.Fatalf("replayed deletion schedule = %+v, %v", replayed, err)
	}
	conflict := request
	conflict.IdempotencyKey = "assign-delete-policy"
	if _, err := store.ScheduleRuntimeDeletion(ctx, conflict); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("cross-kind deletion conflict = %v, want ErrIdempotencyConflict", err)
	}
	canceled, err := store.CancelRuntimeDeletion(ctx, runtimeName, RuntimeAccessSuspended)
	if err != nil || canceled.AccessState != RuntimeAccessSuspended ||
		canceled.DeletionScheduledAt != nil {
		t.Fatalf("canceled deletion = %+v, %v", canceled, err)
	}
	operation, err := store.RuntimeDeletionOperation(ctx, request.IdempotencyKey)
	if err != nil || operation.Status != RuntimeOperationCanceled {
		t.Fatalf("canceled deletion operation = %+v, %v", operation, err)
	}
}

func TestDeletionClaimUsesLeaseAndMonotonicFence(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "delete-fence", "user-delete-fence")
	scheduledAt := now.Add(time.Minute)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-fence-operation",
		RuntimeName:    runtimeName,
		ScheduledAt:    scheduledAt,
	}); err != nil {
		t.Fatal(err)
	}
	now = scheduledAt
	first, found, err := store.ClaimRuntimeDeletionOperation(ctx, "delete-worker-first", time.Minute)
	if err != nil || !found || first.FenceToken != 1 {
		t.Fatalf("first deletion claim = %+v, found=%t, %v", first, found, err)
	}
	if _, err := store.CancelRuntimeDeletion(
		ctx,
		runtimeName,
		RuntimeAccessEnabled,
	); err == nil {
		t.Fatal("running deletion claim was canceled")
	}
	now = now.Add(2 * time.Minute)
	second, found, err := store.ClaimRuntimeDeletionOperation(ctx, "delete-worker-second", time.Minute)
	if err != nil || !found || second.FenceToken != 2 {
		t.Fatalf("second deletion claim = %+v, found=%t, %v", second, found, err)
	}
	if err := store.CompleteRuntimeDeletionOperation(ctx, first); !errors.Is(err, ErrFenceLost) {
		t.Fatalf("stale deletion fence error = %v, want ErrFenceLost", err)
	}
	if err := store.CompleteRuntimeDeletionOperation(ctx, second); err != nil {
		t.Fatal(err)
	}
}

func TestDueDeletionTakesPriorityOverProvisioningBacklog(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "delete-priority", "user-delete-priority")
	scheduledAt := now.Add(time.Minute)
	if _, err := store.ScheduleRuntimeDeletion(ctx, ScheduleRuntimeDeletionRequest{
		IdempotencyKey: "delete-priority-operation",
		RuntimeName:    runtimeName,
		ScheduledAt:    scheduledAt,
	}); err != nil {
		t.Fatal(err)
	}
	ensure := testEnsureRuntimeRequest(t, "ensure-behind-deletion", "user-ensure-behind", "ensure-behind")
	if _, err := store.UpsertUser(ctx, ensure.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(ctx, ensure); err != nil {
		t.Fatal(err)
	}
	provider := newTestReconcilerProvider(runtimeName)
	provider.found = true
	now = scheduledAt
	if processed, err := newTestReconciler(t, store, provider, 3).ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("priority deletion reconcile = %t, %v", processed, err)
	}
	if provider.destroyCalls != 1 {
		t.Fatalf("priority deletion destroy calls = %d, want 1", provider.destroyCalls)
	}
	operation, err := store.RuntimeOperation(ctx, ensure.IdempotencyKey)
	if err != nil || operation.Status != RuntimeOperationPending {
		t.Fatalf("provisioning behind deletion = %+v, %v", operation, err)
	}
}

func prepareDeletionRuntime(t *testing.T, store *Store, key string, userID string) string {
	t.Helper()
	runtimeName := testRuntimeName(t, key)
	if _, err := store.UpsertUser(t.Context(), userID); err != nil {
		t.Fatal(err)
	}
	assignTestRuntime(t, store, "assign-"+key, userID, runtimeName, key+"_secret")
	return runtimeName
}

func requireCompletedDeletion(
	t *testing.T,
	store *Store,
	provider *testReconcilerProvider,
	runtimeName string,
	idempotencyKey string,
) {
	t.Helper()
	operation, err := store.RuntimeDeletionOperation(t.Context(), idempotencyKey)
	if err != nil || operation.Status != RuntimeOperationSucceeded ||
		operation.AttemptCount == 0 || operation.CompletedAt == nil ||
		provider.destroyCalls != 1 {
		t.Fatalf("completed deletion = %+v, calls=%d, %v", operation, provider.destroyCalls, err)
	}
	runtime, err := store.Runtime(t.Context(), runtimeName)
	if err != nil || runtime.Lifecycle != RuntimeLifecycleDeleting ||
		runtime.HealthState != RuntimeHealthUnreachable ||
		runtime.AccessState != RuntimeAccessDeleteScheduled ||
		runtime.DeletionScheduledAt == nil {
		t.Fatalf("deleted runtime state = %+v, %v", runtime, err)
	}
}
