package controlplane

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestBudgetCutoffReconcilerSuspendsProviderAndCompletes(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 22, 0, 0, 0, time.UTC)
	store, runtimeName, operationID := seedBudgetCutoffOperation(t, ctx, &now)
	defer store.Close()
	next, found, err := store.NextRuntimeOperationAt(ctx)
	if err != nil || !found || !next.Equal(now) {
		t.Fatalf("next budget cutoff = %v, %t, %v; want %v", next, found, err, now)
	}
	provider := activeBudgetTestProvider(runtimeName)
	reconciler := newTestReconciler(t, store, provider, 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("ReconcileOnce = %t, %v", processed, err)
	}
	operation, err := store.BudgetCutoffOperation(ctx, operationID)
	if err != nil || operation.Status != RuntimeOperationSucceeded || provider.suspendCalls != 1 {
		t.Fatalf("budget cutoff = %+v, calls %d, %v", operation, provider.suspendCalls, err)
	}
}

func TestBudgetCutoffReconcilerAdoptsAmbiguousSuspendAfterRestart(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 22, 0, 0, 0, time.UTC)
	store, runtimeName, operationID := seedBudgetCutoffOperation(t, ctx, &now)
	defer store.Close()
	provider := activeBudgetTestProvider(runtimeName)
	provider.ambiguousSuspend = true
	if processed, err := newTestReconciler(t, store, provider, 3).ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("first ReconcileOnce = %t, %v", processed, err)
	}
	requireBudgetCutoffStatus(t, store, operationID, RuntimeOperationRetryWait, "provider_suspend")
	now = now.Add(time.Minute)
	if processed, err := newTestReconciler(t, store, provider, 3).ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("restarted ReconcileOnce = %t, %v", processed, err)
	}
	requireBudgetCutoffStatus(t, store, operationID, RuntimeOperationSucceeded, "")
	if provider.suspendCalls != 1 {
		t.Fatalf("suspend calls = %d, want one ambiguous call", provider.suspendCalls)
	}
}

func TestBudgetCutoffReconcilerPermanentlyRejectsForeignIdentity(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 22, 0, 0, 0, time.UTC)
	store, runtimeName, operationID := seedBudgetCutoffOperation(t, ctx, &now)
	defer store.Close()
	provider := activeBudgetTestProvider(runtimeName)
	provider.malformedIdentity = true
	if processed, err := newTestReconciler(t, store, provider, 3).ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("ReconcileOnce = %t, %v", processed, err)
	}
	requireBudgetCutoffStatus(
		t,
		store,
		operationID,
		RuntimeOperationFailed,
		"provider_identity_mismatch",
	)
	if provider.suspendCalls != 0 {
		t.Fatalf("foreign runtime suspend calls = %d", provider.suspendCalls)
	}
}

func TestBudgetCutoffExpiredLeaseUsesMonotonicFence(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 22, 0, 0, 0, time.UTC)
	store, _, _ := seedBudgetCutoffOperation(t, ctx, &now)
	defer store.Close()
	first, found, err := store.ClaimBudgetCutoffOperation(ctx, "worker-first", time.Minute)
	if err != nil || !found {
		t.Fatalf("first claim = %+v, %t, %v", first, found, err)
	}
	now = now.Add(2 * time.Minute)
	second, found, err := store.ClaimBudgetCutoffOperation(ctx, "worker-second", time.Minute)
	if err != nil || !found || second.FenceToken <= first.FenceToken {
		t.Fatalf("second claim = %+v, %t, %v", second, found, err)
	}
	if err := store.CompleteBudgetCutoffOperation(ctx, first); !errors.Is(err, ErrFenceLost) {
		t.Fatalf("stale completion error = %v", err)
	}
	if err := store.CompleteBudgetCutoffOperation(ctx, second); err != nil {
		t.Fatalf("current completion: %v", err)
	}
}

func TestBudgetCutoffFailsLoudlyAtEnforcedDeadline(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 22, 0, 0, 0, time.UTC)
	store, runtimeName, operationID := seedBudgetCutoffOperation(t, ctx, &now)
	defer store.Close()
	now = now.Add(2 * time.Minute)
	provider := activeBudgetTestProvider(runtimeName)
	if processed, err := newTestReconciler(t, store, provider, 3).ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("deadline ReconcileOnce = %t, %v", processed, err)
	}
	requireBudgetCutoffStatus(
		t,
		store,
		operationID,
		RuntimeOperationFailed,
		"cutoff_deadline_exceeded",
	)
	if provider.suspendCalls != 0 {
		t.Fatalf("expired cutoff suspend calls = %d", provider.suspendCalls)
	}
}

func seedBudgetCutoffOperation(
	t *testing.T,
	ctx context.Context,
	now *time.Time,
) (*Store, string, string) {
	t.Helper()
	store := openTestStore(t, t.TempDir(), func() time.Time { return *now }, RateLimit{})
	runtimeName := testRuntimeName(t, "provider-budget-cutoff")
	if _, err := store.UpsertUser(ctx, "user-provider-budget"); err != nil {
		t.Fatal(err)
	}
	assignTestRuntime(
		t,
		store,
		"assign-provider-budget",
		"user-provider-budget",
		runtimeName,
		"provider-budget-secret",
	)
	policy := SetUserBudgetPolicyRequest{
		UserID: "user-provider-budget", PeriodStart: *now, PeriodEnd: now.Add(time.Hour),
		CoveredLimitUSDMicros: 1_000, SafetyReserveUSDMicros: 100, CutoffExposureUSDMicros: 200,
		MaximumCutoffLag: 2 * time.Minute,
	}
	if _, err := store.SetUserBudgetPolicy(ctx, policy); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RecordUsageInterval(ctx, testUsageRequest(
		"usage-provider-cutoff",
		"user-provider-budget",
		runtimeName,
		*now,
		now.Add(time.Minute),
		700,
	)); err != nil {
		t.Fatal(err)
	}
	return store, runtimeName, budgetCutoffOperationID(policy.UserID, policy.PeriodStart)
}

func activeBudgetTestProvider(runtimeName string) *testReconcilerProvider {
	provider := newTestReconcilerProvider(runtimeName)
	provider.found = true
	provider.observation.Activity = runtimeprovider.RuntimeActivityActive
	provider.observation.URLAccess = runtimeprovider.URLAccessAuthenticated
	return provider
}

func requireBudgetCutoffStatus(
	t *testing.T,
	store *Store,
	operationID string,
	status RuntimeOperationStatus,
	errorCode string,
) {
	t.Helper()
	operation, err := store.BudgetCutoffOperation(context.Background(), operationID)
	if err != nil || operation.Status != status || operation.LastErrorCode != errorCode {
		t.Fatalf("budget cutoff operation = %+v, %v; want %s %q", operation, err, status, errorCode)
	}
}
