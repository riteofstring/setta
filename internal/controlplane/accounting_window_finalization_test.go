package controlplane

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
)

func TestFinalizeRuntimeAccountingWindowIsDurableContiguousAndIdempotent(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	now := start.Add(time.Minute)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	runtimeName := seedAccountingWindowTest(t, ctx, store, start, 100_000)
	firstEvents := []runtimeaccounting.ActivityEvent{
		accountingEvent(1, "provider-begin", start, runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, ""),
		accountingEvent(2, "attachment-begin", start.Add(10*time.Second), runtimeaccounting.ActivityAttachment, runtimeaccounting.EventBegin, "phone"),
		accountingEvent(3, "attachment-end", start.Add(20*time.Second), runtimeaccounting.ActivityAttachment, runtimeaccounting.EventEnd, "phone"),
	}
	recordAccountingEvents(t, ctx, store, runtimeName, firstEvents)
	firstRequest := FinalizeRuntimeAccountingWindowRequest{
		IdempotencyKey: "window-first", UserID: "user-accounting-window",
		RuntimeName: runtimeName, WindowEnd: now,
	}
	first, err := store.FinalizeRuntimeAccountingWindow(ctx, firstRequest, adminTestPriceSchedule())
	if err != nil {
		t.Fatalf("FinalizeRuntimeAccountingWindow: %v", err)
	}
	requireFinalizedAccountingWindow(t, first, firstEvents, start, now, firstRequest.IdempotencyKey)
	replayed, err := store.FinalizeRuntimeAccountingWindow(ctx, firstRequest, adminTestPriceSchedule())
	if err != nil || !reflect.DeepEqual(replayed, first) {
		t.Fatalf("replayed finalized window = %+v, %v", replayed, err)
	}
	conflict := firstRequest
	conflict.WindowEnd = conflict.WindowEnd.Add(time.Second)
	if _, err := store.FinalizeRuntimeAccountingWindow(ctx, conflict, adminTestPriceSchedule()); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting replay error = %v", err)
	}
	directory := filepath.Dir(store.Path())
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	secondEvent := accountingEvent(
		4, "attachment-second", firstRequest.WindowEnd.Add(10*time.Second),
		runtimeaccounting.ActivityAttachment, runtimeaccounting.EventBegin, "tablet",
	)
	recordAccountingEvents(t, ctx, restarted, runtimeName, []runtimeaccounting.ActivityEvent{secondEvent})
	second, err := restarted.FinalizeRuntimeAccountingWindow(ctx, FinalizeRuntimeAccountingWindowRequest{
		IdempotencyKey: "window-second", UserID: "user-accounting-window",
		RuntimeName: runtimeName, WindowEnd: now,
	}, adminTestPriceSchedule())
	if err != nil {
		t.Fatalf("FinalizeRuntimeAccountingWindow after restart: %v", err)
	}
	requireFinalizedAccountingWindow(
		t, second, []runtimeaccounting.ActivityEvent{secondEvent},
		firstRequest.WindowEnd, now, "window-second",
	)
	snapshot, err := restarted.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	requireAdvancedAccountingLedger(t, snapshot.Ledger, now)
}

func requireFinalizedAccountingWindow(
	t *testing.T,
	finalized FinalizedRuntimeAccountingWindow,
	events []runtimeaccounting.ActivityEvent,
	start time.Time,
	end time.Time,
	idempotencyKey string,
) {
	t.Helper()
	if finalized.Evidence.EventsSHA256 != accountingEventsSHA256(t, events) ||
		!finalized.Evidence.Usage.Window.Start.Equal(start) ||
		!finalized.Evidence.Usage.Window.End.Equal(end) ||
		finalized.Interval.IdempotencyKey != idempotencyKey ||
		finalized.Interval.CoveredCostUSDMicros <= 0 ||
		finalized.Interval.CutoffRequired {
		t.Fatalf("finalized accounting window = %+v", finalized)
	}
}

func requireAdvancedAccountingLedger(
	t *testing.T,
	ledger runtimeaccounting.LedgerState,
	windowStart time.Time,
) {
	t.Helper()
	if !ledger.WindowStart.Equal(windowStart) ||
		len(ledger.AppliedEvents) != 0 ||
		ledger.ProviderTime != 0 ||
		ledger.AttachedIdle != 0 ||
		ledger.WorkloadTime != 0 ||
		!ledger.ProviderActive ||
		len(ledger.Attachments) != 1 {
		t.Fatalf("advanced accounting ledger = %+v", ledger)
	}
}

func TestFinalizeRuntimeAccountingWindowRollsBackEveryArtifactOnFailure(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	now := start.Add(time.Minute)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := seedAccountingWindowTest(t, ctx, store, start, 100_000)
	event := accountingEvent(
		1, "provider-begin", start,
		runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, "",
	)
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{event})
	before, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `
UPDATE user_budget_policies
SET cutoff_exposure_usd_micros = cutoff_exposure_usd_micros + 1
WHERE user_id = ?
`, "user-accounting-window"); err != nil {
		t.Fatal(err)
	}
	request := FinalizeRuntimeAccountingWindowRequest{
		IdempotencyKey: "window-failure", UserID: "user-accounting-window",
		RuntimeName: runtimeName, WindowEnd: now,
	}
	if _, err := store.FinalizeRuntimeAccountingWindow(ctx, request, adminTestPriceSchedule()); err == nil ||
		!strings.Contains(err.Error(), "cutoff exposure") {
		t.Fatalf("finalization error = %v", err)
	}
	after, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(after.Ledger, before.Ledger) {
		t.Fatalf("ledger changed after rollback: before=%+v after=%+v", before.Ledger, after.Ledger)
	}
	for _, table := range []string{"runtime_accounting_windows", "usage_intervals"} {
		var count int
		if err := store.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table+" WHERE idempotency_key = ?", request.IdempotencyKey).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s rows after rollback = %d", table, count)
		}
	}
	policy, err := store.UserBudgetPolicy(ctx, "user-accounting-window")
	if err != nil {
		t.Fatal(err)
	}
	if policy.AccruedUSDMicros != 0 {
		t.Fatalf("accrued budget after rollback = %d", policy.AccruedUSDMicros)
	}
}

func TestFinalizeRuntimeAccountingWindowRejectsFutureAndForeignRequests(t *testing.T) {
	ctx := context.Background()
	start := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	now := start.Add(time.Minute)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := seedAccountingWindowTest(t, ctx, store, start, 100_000)
	recordAccountingEvents(t, ctx, store, runtimeName, []runtimeaccounting.ActivityEvent{
		accountingEvent(1, "provider-begin", start, runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, ""),
	})
	for name, request := range map[string]FinalizeRuntimeAccountingWindowRequest{
		"future": {
			IdempotencyKey: "window-future", UserID: "user-accounting-window",
			RuntimeName: runtimeName, WindowEnd: now.Add(time.Second),
		},
		"foreign": {
			IdempotencyKey: "window-foreign", UserID: "another-user",
			RuntimeName: runtimeName, WindowEnd: now,
		},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := store.FinalizeRuntimeAccountingWindow(ctx, request, adminTestPriceSchedule()); err == nil {
				t.Fatal("FinalizeRuntimeAccountingWindow succeeded")
			}
		})
	}
}

func seedAccountingWindowTest(
	t *testing.T,
	ctx context.Context,
	store *Store,
	start time.Time,
	coveredLimit int64,
) string {
	t.Helper()
	const userID = "user-accounting-window"
	runtimeName := testRuntimeName(t, "accounting-window")
	if _, err := store.UpsertUser(ctx, userID); err != nil {
		t.Fatal(err)
	}
	assignTestRuntime(t, store, "assign-accounting-window", userID, runtimeName, "window-secret")
	exposure := testAdminUsageEvidence(t, runtimeName, start).Cutoff.CutoffExposureUSDMicros
	if _, err := store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: userID, PeriodStart: start, PeriodEnd: start.Add(time.Hour),
		CoveredLimitUSDMicros: coveredLimit, SafetyReserveUSDMicros: 500,
		CutoffExposureUSDMicros: int64(exposure), MaximumCutoffLag: time.Minute,
	}); err != nil {
		t.Fatal(err)
	}
	return runtimeName
}

func recordAccountingEvents(
	t *testing.T,
	ctx context.Context,
	store *Store,
	runtimeName string,
	events []runtimeaccounting.ActivityEvent,
) {
	t.Helper()
	for _, event := range events {
		if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
			RuntimeName: runtimeName, Transition: accountingTransition(event),
		}); err != nil {
			t.Fatalf("RecordRuntimeAccountingEvent: %v", err)
		}
	}
}
