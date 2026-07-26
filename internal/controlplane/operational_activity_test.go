package controlplane

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
)

func TestReconcilerAlertsOnExpiredTaskAndRestartOrphanedSession(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 25, 20, 0, 0, 0, time.UTC)
	now := start
	directory := t.TempDir()
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	runtimeName := seedStaleRuntimeActivity(t, ctx, store, start)
	beginGatewayAttachment(t, ctx, store, runtimeName)
	recordStaleWorkloadTask(t, ctx, store, runtimeName, "stale-task-begin", start)
	requireNoStaleRuntimeActivityAlert(t, ctx, store, "current runtime activity")
	closeControlPlaneTestStore(t, store)

	now = start.Add(time.Minute)
	restarted := openTestStore(
		t,
		filepath.Clean(directory),
		func() time.Time { return now },
		RateLimit{},
	)
	var output bytes.Buffer
	reconciler := newStaleRuntimeActivityTestReconciler(t, restarted, runtimeName, &output)
	requireReconcileProcessed(t, ctx, reconciler, "expired Task", true)
	requireReconcileProcessed(t, ctx, reconciler, "orphaned session", true)
	requireReconcileProcessed(t, ctx, reconciler, "deduplicated activity", false)
	requireOperationalAlertStream(t, output.Bytes(), []OperationalAlertMeasurement{
		{
			ErrorCode:  staleWorkloadTaskReason,
			Event:      "operational_alert",
			OccurredAt: now,
			Severity:   OperationalAlertWarning,
			Signal:     OperationalAlertStaleWorkloadTask,
		},
		{
			ErrorCode:  staleActiveSessionReason,
			Event:      "operational_alert",
			OccurredAt: now,
			Severity:   OperationalAlertWarning,
			Signal:     OperationalAlertStaleActiveSession,
		},
	})
	requireRecoveredRuntimeActivity(t, ctx, restarted, runtimeName)
	closeControlPlaneTestStore(t, restarted)

	replayed := openTestStore(
		t,
		filepath.Clean(directory),
		func() time.Time { return now },
		RateLimit{},
	)
	defer replayed.Close()
	requireNoStaleRuntimeActivityAlert(t, ctx, replayed, "restarted activity alert replay")
	recordStaleWorkloadTask(t, ctx, replayed, runtimeName, "stale-task-second-begin", now)
	now = now.Add(time.Minute)
	requireStaleRuntimeActivitySignal(
		t,
		ctx,
		replayed,
		"second expired Task",
		OperationalAlertStaleWorkloadTask,
	)
}

func beginGatewayAttachment(
	t *testing.T,
	ctx context.Context,
	store *Store,
	runtimeName string,
) {
	t.Helper()
	attachment, err := store.BeginGatewayAttachment(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	if attachment.ID == "" {
		t.Fatal("gateway attachment identity is empty")
	}
}

func recordStaleWorkloadTask(
	t *testing.T,
	ctx context.Context,
	store *Store,
	runtimeName string,
	eventID string,
	start time.Time,
) {
	t.Helper()
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName,
		Transition: runtimeaccounting.ActivityTransition{
			EventID:        eventID,
			At:             start,
			Kind:           runtimeaccounting.ActivityWorkloadLease,
			Action:         runtimeaccounting.EventBegin,
			SubjectID:      "setta-agent",
			LeaseExpiresAt: start.Add(time.Minute),
		},
	}); err != nil {
		t.Fatal(err)
	}
}

func requireNoStaleRuntimeActivityAlert(
	t *testing.T,
	ctx context.Context,
	store *Store,
	label string,
) {
	t.Helper()
	if _, found, err := store.ClaimStaleRuntimeActivityAlert(ctx); err != nil || found {
		t.Fatalf("%s = %t, %v", label, found, err)
	}
}

func requireStaleRuntimeActivitySignal(
	t *testing.T,
	ctx context.Context,
	store *Store,
	label string,
	want OperationalAlertSignal,
) {
	t.Helper()
	alert, found, err := store.ClaimStaleRuntimeActivityAlert(ctx)
	if err != nil || !found || alert.Signal != want {
		t.Fatalf("%s = %+v, %t, %v", label, alert, found, err)
	}
}

func requireReconcileProcessed(
	t *testing.T,
	ctx context.Context,
	reconciler *Reconciler,
	label string,
	want bool,
) {
	t.Helper()
	processed, err := reconciler.ReconcileOnce(ctx)
	if err != nil || processed != want {
		t.Fatalf("%s ReconcileOnce = %t, %v", label, processed, err)
	}
}

func requireRecoveredRuntimeActivity(
	t *testing.T,
	ctx context.Context,
	store *Store,
	runtimeName string,
) {
	t.Helper()
	snapshot, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Ledger.Attachments) != 0 || len(snapshot.Ledger.WorkloadLeases) != 0 {
		t.Fatalf("recovered runtime activity = %+v", snapshot.Ledger)
	}
}

func closeControlPlaneTestStore(t *testing.T, store *Store) {
	t.Helper()
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
}

func seedStaleRuntimeActivity(
	t *testing.T,
	ctx context.Context,
	store *Store,
	at time.Time,
) string {
	t.Helper()
	if _, err := store.UpsertUser(ctx, "user-stale-runtime-activity"); err != nil {
		t.Fatal(err)
	}
	runtimeName := testRuntimeName(t, "stale-runtime-activity")
	assignTestRuntime(
		t,
		store,
		"assign-stale-runtime-activity",
		"user-stale-runtime-activity",
		runtimeName,
		"stale_runtime_activity_secret",
	)
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName,
		Transition: runtimeaccounting.ActivityTransition{
			EventID: "stale-activity-provider-begin",
			At:      at,
			Kind:    runtimeaccounting.ActivityProvider,
			Action:  runtimeaccounting.EventBegin,
		},
	}); err != nil {
		t.Fatal(err)
	}
	return runtimeName
}

func newStaleRuntimeActivityTestReconciler(
	t *testing.T,
	store *Store,
	runtimeName string,
	output *bytes.Buffer,
) *Reconciler {
	t.Helper()
	observer, err := NewJSONLinesObserver(output)
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
		Provider:           newTestReconcilerProvider(runtimeName),
		RetryDelay:         time.Minute,
		Store:              store,
		WorkerID:           "stale-runtime-activity-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return reconciler
}
