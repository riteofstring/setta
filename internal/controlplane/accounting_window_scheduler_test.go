package controlplane

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
)

func TestAccountingWindowSchedulerFinalizesFixedWindowsAcrossRestart(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 25, 14, 0, 0, 0, time.UTC)
	now := start.Add(70 * time.Second)
	directory := t.TempDir()
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	runtimeName := seedAccountingWindowTest(t, ctx, store, start, 100_000)
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{
		accountingEvent(
			1,
			"scheduled-provider-begin",
			now,
			runtimeaccounting.ActivityProvider,
			runtimeaccounting.EventBegin,
			"",
		),
	})

	next, found, err := store.NextAccountingWindow(ctx, time.Minute)
	if err != nil || !found || !next.WindowEnd.Equal(start.Add(time.Minute)) {
		t.Fatalf("first scheduled window = %+v, %t, %v", next, found, err)
	}
	snapshot, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil || !snapshot.Ledger.WindowStart.Equal(start) {
		t.Fatalf("delayed activity ledger = %+v, %v", snapshot, err)
	}

	var audit bytes.Buffer
	reconciler := newAccountingSchedulerTestReconciler(t, store, runtimeName, &audit)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("first ReconcileOnce = %t, %v", processed, err)
	}
	requireScheduledAccountingWindowCount(t, store, 1)
	next, found, err = store.NextAccountingWindow(ctx, time.Minute)
	if err != nil || !found || !next.WindowEnd.Equal(start.Add(2*time.Minute)) {
		t.Fatalf("second scheduled window = %+v, %t, %v", next, found, err)
	}
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || processed {
		t.Fatalf("early ReconcileOnce = %t, %v", processed, err)
	}

	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	now = start.Add(2 * time.Minute)
	restarted := openTestStore(
		t,
		filepath.Clean(directory),
		func() time.Time { return now },
		RateLimit{},
	)
	defer restarted.Close()
	reconciler = newAccountingSchedulerTestReconciler(t, restarted, runtimeName, &audit)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("restarted ReconcileOnce = %t, %v", processed, err)
	}
	requireScheduledAccountingWindowCount(t, restarted, 2)
	requireScheduledAccountingAudits(t, audit.Bytes(), 2)
}

func TestAccountingWindowSchedulerCapsAtBudgetEnd(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 25, 15, 0, 0, 0, time.UTC)
	now := start
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := seedScheduledAccountingRuntime(
		t,
		ctx,
		store,
		"user-scheduled-cap",
		"scheduled-cap",
		start,
		start.Add(90*time.Second),
	)
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{
		accountingEvent(
			1,
			"scheduled-cap-provider-begin",
			start,
			runtimeaccounting.ActivityProvider,
			runtimeaccounting.EventBegin,
			"",
		),
	})
	reconciler := newAccountingSchedulerTestReconciler(t, store, runtimeName, io.Discard)

	now = start.Add(time.Minute)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("first ReconcileOnce = %t, %v", processed, err)
	}
	next, found, err := store.NextAccountingWindow(ctx, time.Minute)
	if err != nil || !found || !next.WindowEnd.Equal(start.Add(90*time.Second)) {
		t.Fatalf("capped scheduled window = %+v, %t, %v", next, found, err)
	}
	now = start.Add(90 * time.Second)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("capped ReconcileOnce = %t, %v", processed, err)
	}
	if _, found, err := store.NextAccountingWindow(ctx, time.Minute); err != nil || found {
		t.Fatalf("schedule after budget end = %t, %v", found, err)
	}
}

func TestAccountingWindowSchedulerRunWakesOnLateAccountingEvent(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	start := time.Date(2026, 7, 25, 15, 30, 0, 0, time.UTC)
	var clockNanos atomic.Int64
	clockNanos.Store(start.UnixNano())
	store := openTestStore(t, t.TempDir(), func() time.Time {
		return time.Unix(0, clockNanos.Load()).UTC()
	}, RateLimit{})
	defer store.Close()
	runtimeName := seedScheduledAccountingRuntime(
		t,
		ctx,
		store,
		"user-scheduled-wake",
		"scheduled-wake",
		start,
		start.Add(time.Hour),
	)
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{
		accountingEvent(
			1,
			"scheduled-wake-provider-begin",
			start,
			runtimeaccounting.ActivityProvider,
			runtimeaccounting.EventBegin,
			"",
		),
	})
	observer := &accountingSchedulerTestObserver{
		audits: make(chan ControlPlaneAuditObservation, 1),
	}
	reconciler, err := NewReconciler(ReconcilerConfig{
		AccountingObserver: observer,
		AccountingWindow:   time.Minute,
		LeaseDuration:      time.Minute,
		MaxAttempts:        3,
		OperationTimeout:   30 * time.Second,
		Observer:           observer,
		PriceSchedule:      adminTestPriceSchedule(),
		Provider:           newTestReconcilerProvider(runtimeName),
		RetryDelay:         time.Minute,
		Store:              store,
		WorkerID:           "accounting-scheduler-run-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	runResult := make(chan error, 1)
	go func() {
		runResult <- reconciler.Run(ctx)
	}()

	lateEventAt := start.Add(70 * time.Second)
	clockNanos.Store(lateEventAt.UnixNano())
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{
		accountingEvent(
			2,
			"scheduled-wake-attachment-begin",
			lateEventAt,
			runtimeaccounting.ActivityAttachment,
			runtimeaccounting.EventBegin,
			"late-phone",
		),
	})
	select {
	case audit := <-observer.audits:
		if audit.Action != ControlPlaneAuditUsageRecorded || audit.State != "continue" {
			t.Fatalf("scheduled wake audit = %+v", audit)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("scheduled accounting did not wake")
	}
	requireScheduledAccountingWindowCount(t, store, 1)
	cancel()
	select {
	case err := <-runResult:
		if err != nil {
			t.Fatalf("Reconciler.Run: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("scheduled accounting reconciler did not stop")
	}
}

func TestBudgetPolicyRejectsDiscontinuousActiveLedger(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 25, 16, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return start }, RateLimit{})
	defer store.Close()
	const userID = "user-discontinuous-budget"
	runtimeName := testRuntimeName(t, "discontinuous-budget")
	if _, err := store.UpsertUser(ctx, userID); err != nil {
		t.Fatal(err)
	}
	assignTestRuntime(t, store, "assign-discontinuous-budget", userID, runtimeName, "budget-secret")
	eventAt := start.Add(10 * time.Second)
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{
		accountingEvent(
			1,
			"discontinuous-provider-begin",
			eventAt,
			runtimeaccounting.ActivityProvider,
			runtimeaccounting.EventBegin,
			"",
		),
	})
	exposure := testAdminUsageEvidence(t, runtimeName, eventAt).Cutoff.CutoffExposureUSDMicros
	_, err := store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: userID, PeriodStart: start, PeriodEnd: start.Add(time.Hour),
		CoveredLimitUSDMicros: 100_000, SafetyReserveUSDMicros: 500,
		CutoffExposureUSDMicros: int64(exposure), MaximumCutoffLag: time.Minute,
	})
	if err == nil || errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("discontinuous budget error = %v", err)
	}
}

type accountingSchedulerTestObserver struct {
	audits chan ControlPlaneAuditObservation
}

func (observer *accountingSchedulerTestObserver) ObserveControlPlaneAudit(
	observation ControlPlaneAuditObservation,
) {
	observer.audits <- observation
}

func (*accountingSchedulerTestObserver) ObserveRuntimeAudit(RuntimeAuditObservation) {}

func seedScheduledAccountingRuntime(
	t *testing.T,
	ctx context.Context,
	store *Store,
	userID string,
	runtimeKey string,
	periodStart time.Time,
	periodEnd time.Time,
) string {
	t.Helper()
	runtimeName := testRuntimeName(t, runtimeKey)
	if _, err := store.UpsertUser(ctx, userID); err != nil {
		t.Fatal(err)
	}
	assignTestRuntime(t, store, "assign-"+runtimeKey, userID, runtimeName, "scheduled-secret")
	exposure := testAdminUsageEvidence(t, runtimeName, periodStart).Cutoff.CutoffExposureUSDMicros
	if _, err := store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: userID, PeriodStart: periodStart, PeriodEnd: periodEnd,
		CoveredLimitUSDMicros: 100_000, SafetyReserveUSDMicros: 500,
		CutoffExposureUSDMicros: int64(exposure), MaximumCutoffLag: time.Minute,
	}); err != nil {
		t.Fatal(err)
	}
	return runtimeName
}

func newAccountingSchedulerTestReconciler(
	t *testing.T,
	store *Store,
	runtimeName string,
	audit io.Writer,
) *Reconciler {
	t.Helper()
	observer, err := NewJSONLinesObserver(audit)
	if err != nil {
		t.Fatal(err)
	}
	reconciler, err := NewReconciler(ReconcilerConfig{
		AccountingObserver: observer,
		AccountingWindow:   time.Minute,
		LeaseDuration:      time.Minute,
		MaxAttempts:        3,
		OperationTimeout:   30 * time.Second,
		Observer:           observer,
		PriceSchedule:      adminTestPriceSchedule(),
		Provider:           newTestReconcilerProvider(runtimeName),
		RetryDelay:         time.Minute,
		Store:              store,
		WorkerID:           "accounting-scheduler-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return reconciler
}

func requireScheduledAccountingWindowCount(t *testing.T, store *Store, expected int) {
	t.Helper()
	var actual int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM runtime_accounting_windows`).Scan(&actual); err != nil {
		t.Fatal(err)
	}
	if actual != expected {
		t.Fatalf("scheduled accounting window count = %d, want %d", actual, expected)
	}
}

func requireScheduledAccountingAudits(t *testing.T, payload []byte, expected int) {
	t.Helper()
	scanner := bufio.NewScanner(bytes.NewReader(payload))
	count := 0
	for scanner.Scan() {
		var measurement ControlPlaneAuditMeasurement
		if err := json.Unmarshal(scanner.Bytes(), &measurement); err != nil {
			t.Fatal(err)
		}
		if measurement.Action != ControlPlaneAuditUsageRecorded ||
			measurement.State != "continue" {
			t.Fatalf("scheduled accounting audit = %+v", measurement)
		}
		count++
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if count != expected {
		t.Fatalf("scheduled accounting audit count = %d, want %d", count, expected)
	}
}
