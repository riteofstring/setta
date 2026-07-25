package controlplane

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

func TestUsageIntervalsAccumulateAndCutOffAuthorizationAtomically(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName, grant := seedBudgetCutoffTest(t, ctx, store, now)
	firstRequest := testUsageRequest(
		"usage-1", "user-budget", runtimeName, now, now.Add(10*time.Minute), 400,
	)
	first, err := store.RecordUsageInterval(ctx, firstRequest)
	requireContinuingUsage(t, first, err)
	replayed, err := store.RecordUsageInterval(ctx, firstRequest)
	if err != nil || !reflect.DeepEqual(replayed, first) {
		t.Fatalf("replayed usage = %+v, %v", replayed, err)
	}
	requireBudgetAuthorization(t, ctx, store, grant.Token, runtimeaccess.AuthorizationAllowed)
	now = now.Add(time.Minute)
	second, err := store.RecordUsageInterval(ctx, testUsageRequest(
		"usage-2", "user-budget", runtimeName,
		first.IntervalEnd, first.IntervalEnd.Add(10*time.Minute), 300,
	))
	requireCutoffUsage(t, second, err)
	requireBudgetAuthorization(t, ctx, store, grant.Token, runtimeaccess.AuthorizationSuspended)
	runtime, err := store.Runtime(ctx, runtimeName)
	if err != nil || runtime.AccessState != RuntimeAccessSuspended {
		t.Fatalf("runtime after cutoff = %+v, %v", runtime, err)
	}
	persisted, err := store.UserBudgetPolicy(ctx, "user-budget")
	if err != nil || persisted.AccruedUSDMicros != 700 || persisted.CutoffRequiredAt == nil {
		t.Fatalf("budget after cutoff = %+v, %v", persisted, err)
	}
}

func seedBudgetCutoffTest(
	t *testing.T,
	ctx context.Context,
	store *Store,
	now time.Time,
) (string, CreatedDeviceGrant) {
	t.Helper()
	runtimeName := testRuntimeName(t, "budget-cutoff")
	if _, err := store.UpsertUser(ctx, "user-budget"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	assignTestRuntime(t, store, "assign-budget", "user-budget", runtimeName, "budget-secret")
	grant, err := store.CreateDeviceGrant(ctx, CreateDeviceGrantRequest{
		UserID: "user-budget", RuntimeName: runtimeName, DisplayName: "Budget phone",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGrant: %v", err)
	}
	_, err = store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: "user-budget", PeriodStart: now, PeriodEnd: now.Add(time.Hour),
		CoveredLimitUSDMicros: 1_000, SafetyReserveUSDMicros: 100, CutoffExposureUSDMicros: 200,
	})
	if err != nil {
		t.Fatalf("SetUserBudgetPolicy: %v", err)
	}
	return runtimeName, grant
}

func requireContinuingUsage(t *testing.T, interval UsageInterval, err error) {
	t.Helper()
	if err != nil || interval.CutoffRequired || interval.EnforcedBudgetUSDMicros != 700 {
		t.Fatalf("continuing usage = %+v, %v", interval, err)
	}
}

func requireCutoffUsage(t *testing.T, interval UsageInterval, err error) {
	t.Helper()
	if err != nil || !interval.CutoffRequired || interval.CumulativeCostUSDMicros != 700 {
		t.Fatalf("cutoff usage = %+v, %v", interval, err)
	}
}

func requireBudgetAuthorization(
	t *testing.T,
	ctx context.Context,
	store *Store,
	token string,
	outcome runtimeaccess.AuthorizationOutcome,
) {
	t.Helper()
	result, err := store.AuthorizeClient(ctx, token)
	if err != nil || result.Outcome != outcome {
		t.Fatalf("budget authorization = %+v, %v; want %s", result, err, outcome)
	}
}

func TestUsageIntervalsRejectGapsConflictsAndNonConservativeEvidence(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	runtimeName := testRuntimeName(t, "budget-validation")
	if _, err := store.UpsertUser(ctx, "user-validation"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	assignTestRuntime(t, store, "assign-validation", "user-validation", runtimeName, "validation-secret")
	if _, err := store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: "user-validation", PeriodStart: now, PeriodEnd: now.Add(time.Hour),
		CoveredLimitUSDMicros: 1_000, SafetyReserveUSDMicros: 100, CutoffExposureUSDMicros: 100,
	}); err != nil {
		t.Fatalf("SetUserBudgetPolicy: %v", err)
	}
	gap := testUsageRequest("usage-gap", "user-validation", runtimeName, now.Add(time.Minute), now.Add(2*time.Minute), 1)
	if _, err := store.RecordUsageInterval(ctx, gap); err == nil {
		t.Fatal("RecordUsageInterval accepted a gap")
	}
	first := testUsageRequest("usage-first", "user-validation", runtimeName, now, now.Add(time.Minute), 1)
	if _, err := store.RecordUsageInterval(ctx, first); err != nil {
		t.Fatalf("RecordUsageInterval first: %v", err)
	}
	conflict := first
	conflict.CoveredCostUSDMicros = 2
	if _, err := store.RecordUsageInterval(ctx, conflict); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting replay error = %v", err)
	}
	authoritative := testUsageRequest(
		"usage-authoritative", "user-validation", runtimeName,
		first.IntervalEnd, first.IntervalEnd.Add(time.Minute), 1,
	)
	authoritative.MeasurementSource = runtimeprovider.UsageBasisProviderAuthoritative
	if _, err := store.RecordUsageInterval(ctx, authoritative); err == nil {
		t.Fatal("RecordUsageInterval accepted non-conservative evidence")
	}
}

func TestBudgetPolicyPersistsAcrossRestartAndCannotResetActivePeriod(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	if _, err := store.UpsertUser(ctx, "user-restart"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	runtimeName := testRuntimeName(t, "budget-restart")
	assignTestRuntime(t, store, "assign-restart", "user-restart", runtimeName, "restart-secret")
	request := SetUserBudgetPolicyRequest{
		UserID: "user-restart", PeriodStart: now, PeriodEnd: now.Add(time.Hour),
		CoveredLimitUSDMicros: 1_000, SafetyReserveUSDMicros: 100, CutoffExposureUSDMicros: 100,
	}
	if _, err := store.SetUserBudgetPolicy(ctx, request); err != nil {
		t.Fatalf("SetUserBudgetPolicy: %v", err)
	}
	if _, err := store.RecordUsageInterval(ctx, testUsageRequest(
		"usage-restart", "user-restart", runtimeName, now, now.Add(time.Minute), 123,
	)); err != nil {
		t.Fatalf("RecordUsageInterval: %v", err)
	}
	changed := request
	changed.CoveredLimitUSDMicros = 2_000
	if _, err := store.SetUserBudgetPolicy(ctx, changed); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("active-period reset error = %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	persisted, err := restarted.UserBudgetPolicy(ctx, "user-restart")
	if err != nil || !sameBudgetPolicyRequest(persisted, request) || persisted.AccruedUSDMicros != 123 {
		t.Fatalf("persisted policy = %+v, %v", persisted, err)
	}
}

func testUsageRequest(
	idempotencyKey string,
	userID string,
	runtimeName string,
	start time.Time,
	end time.Time,
	cost int64,
) RecordUsageIntervalRequest {
	return RecordUsageIntervalRequest{
		IdempotencyKey:       idempotencyKey,
		UserID:               userID,
		RuntimeName:          runtimeName,
		IntervalStart:        start,
		IntervalEnd:          end,
		MeasurementSource:    runtimeprovider.UsageBasisSettaConservative,
		CoveredCostUSDMicros: cost,
	}
}
