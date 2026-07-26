package controlplane

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestReconciliationBacklogAlertIsDurableAndDeduplicated(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 25, 18, 0, 0, 0, time.UTC)
	now := start
	directory := t.TempDir()
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	if _, err := store.UpsertUser(ctx, "user-backlog-store"); err != nil {
		t.Fatal(err)
	}
	request := testEnsureRuntimeRequest(
		t,
		"ensure-backlog-store",
		"user-backlog-store",
		"backlog-store",
	)
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	now = start.Add(time.Minute)
	alert, found, err := store.ClaimReconciliationBacklogAlert(ctx, time.Minute)
	if err != nil || !found || !alert.OccurredAt.Equal(now) {
		t.Fatalf("first backlog alert = %+v, %t, %v", alert, found, err)
	}
	if _, found, err := store.ClaimReconciliationBacklogAlert(ctx, time.Minute); err != nil || found {
		t.Fatalf("replayed backlog alert = %t, %v", found, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	restarted := openTestStore(
		t,
		filepath.Clean(directory),
		func() time.Time { return now },
		RateLimit{},
	)
	defer restarted.Close()
	if _, found, err := restarted.ClaimReconciliationBacklogAlert(
		ctx,
		time.Minute,
	); err != nil || found {
		t.Fatalf("restarted backlog alert = %t, %v", found, err)
	}
}

func TestReconcilerAlertsOnBacklogBeforeRecoveringOperation(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 25, 18, 30, 0, 0, time.UTC)
	now := start
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	if _, err := store.UpsertUser(ctx, "user-backlog-reconciler"); err != nil {
		t.Fatal(err)
	}
	request := testEnsureRuntimeRequest(
		t,
		"ensure-backlog-reconciler",
		"user-backlog-reconciler",
		"backlog-reconciler",
	)
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	provider := newTestReconcilerProvider(request.RuntimeName)
	var output bytes.Buffer
	observer, err := NewJSONLinesObserver(&output)
	if err != nil {
		t.Fatal(err)
	}
	reconciler, err := NewReconciler(ReconcilerConfig{
		AccountingObserver: observer,
		AccountingWindow:   time.Minute,
		AlertObserver:      observer,
		BacklogAlertAfter:  time.Minute,
		LeaseDuration:      2 * time.Minute,
		MaxAttempts:        3,
		OperationTimeout:   time.Minute,
		Observer:           observer,
		PriceSchedule:      adminTestPriceSchedule(),
		Provider:           provider,
		RetryDelay:         time.Minute,
		Store:              store,
		WorkerID:           "backlog-reconciler-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	now = start.Add(time.Minute)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("backlog ReconcileOnce = %t, %v", processed, err)
	}
	if provider.createCalls != 1 {
		t.Fatalf("provider recovery calls = %d", provider.createCalls)
	}
	requireOperationalAlertStream(t, output.Bytes(), []OperationalAlertMeasurement{{
		ErrorCode:  reconciliationBacklogReason,
		Event:      "operational_alert",
		OccurredAt: now,
		Severity:   OperationalAlertWarning,
		Signal:     OperationalAlertReconciliationBacklog,
	}})
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || processed {
		t.Fatalf("post-recovery ReconcileOnce = %t, %v", processed, err)
	}
}
