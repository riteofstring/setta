package controlplane

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeaccess"
	"setta/internal/runtimeaccounting"
	"setta/internal/runtimecost"
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
	first, err := store.recordUsageInterval(ctx, firstRequest)
	requireContinuingUsage(t, first, err)
	replayed, err := store.recordUsageInterval(ctx, firstRequest)
	if err != nil || !reflect.DeepEqual(replayed, first) {
		t.Fatalf("replayed usage = %+v, %v", replayed, err)
	}
	requireBudgetAuthorization(t, ctx, store, grant.Token, runtimeaccess.AuthorizationAllowed)
	now = now.Add(time.Minute)
	second, err := store.recordUsageInterval(ctx, testUsageRequest(
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
		MaximumCutoffLag: time.Minute,
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
		MaximumCutoffLag: time.Minute,
	}); err != nil {
		t.Fatalf("SetUserBudgetPolicy: %v", err)
	}
	gap := testUsageRequest("usage-gap", "user-validation", runtimeName, now.Add(time.Minute), now.Add(2*time.Minute), 1)
	if _, err := store.recordUsageInterval(ctx, gap); err == nil {
		t.Fatal("RecordUsageInterval accepted a gap")
	}
	first := testUsageRequest("usage-first", "user-validation", runtimeName, now, now.Add(time.Minute), 1)
	if _, err := store.recordUsageInterval(ctx, first); err != nil {
		t.Fatalf("RecordUsageInterval first: %v", err)
	}
	conflict := first
	conflict.CoveredCostUSDMicros = 2
	if _, err := store.recordUsageInterval(ctx, conflict); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting replay error = %v", err)
	}
	authoritative := testUsageRequest(
		"usage-authoritative", "user-validation", runtimeName,
		first.IntervalEnd, first.IntervalEnd.Add(time.Minute), 1,
	)
	authoritative.MeasurementSource = runtimeprovider.UsageBasisProviderAuthoritative
	if _, err := store.recordUsageInterval(ctx, authoritative); err == nil {
		t.Fatal("RecordUsageInterval accepted non-conservative evidence")
	}
}

func TestUsageEvidenceRecomputesCostAndBindsReplayToTheFinalizedArtifact(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	_, evidence := seedBudgetEvidenceTest(t, ctx, store, now)

	tamperedCost := evidence
	tamperedCost.Cost.CoveredTotal++
	if _, err := store.RecordUsageEvidence(ctx, RecordUsageEvidenceRequest{
		IdempotencyKey: "tampered-cost", UserID: "user-budget", Evidence: tamperedCost,
	}, adminTestPriceSchedule()); err == nil {
		t.Fatal("RecordUsageEvidence accepted a tampered cost")
	}
	policy, err := store.UserBudgetPolicy(ctx, "user-budget")
	if err != nil || policy.AccruedUSDMicros != 0 {
		t.Fatalf("budget after rejected evidence = %+v, %v", policy, err)
	}

	request := RecordUsageEvidenceRequest{
		IdempotencyKey: "finalized-evidence", UserID: "user-budget", Evidence: evidence,
	}
	first, err := store.RecordUsageEvidence(ctx, request, adminTestPriceSchedule())
	if err != nil {
		t.Fatalf("RecordUsageEvidence: %v", err)
	}
	replayed, err := store.RecordUsageEvidence(ctx, request, adminTestPriceSchedule())
	if err != nil || !reflect.DeepEqual(replayed, first) {
		t.Fatalf("replayed evidence = %+v, %v", replayed, err)
	}
	conflict := request
	conflict.Evidence.Cutoff.Action = runtimeaccounting.CutoffContinue
	if _, err := store.RecordUsageEvidence(ctx, conflict, adminTestPriceSchedule()); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting evidence replay error = %v", err)
	}
}

func TestUsageEvidenceRejectsUntrustedIdentityAndMeasurementBasis(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	_, valid := seedBudgetEvidenceTest(t, ctx, store, now)
	tests := []struct {
		name   string
		mutate func(*runtimeaccounting.Evidence)
	}{
		{name: "version", mutate: func(evidence *runtimeaccounting.Evidence) { evidence.Version++ }},
		{name: "rate card", mutate: func(evidence *runtimeaccounting.Evidence) { evidence.RateCardVersion = "foreign" }},
		{name: "event hash", mutate: func(evidence *runtimeaccounting.Evidence) { evidence.EventsSHA256 = "invalid" }},
		{name: "basis", mutate: func(evidence *runtimeaccounting.Evidence) {
			evidence.Usage.Basis = runtimeprovider.UsageBasisProviderAuthoritative
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			evidence := valid
			test.mutate(&evidence)
			if _, err := store.RecordUsageEvidence(ctx, RecordUsageEvidenceRequest{
				IdempotencyKey: "invalid-" + test.name,
				UserID:         "user-budget",
				Evidence:       evidence,
			}, adminTestPriceSchedule()); err == nil {
				t.Fatal("RecordUsageEvidence accepted invalid evidence")
			}
		})
	}
}

func TestUsageEvidenceRejectsForgedCutoffAndOversizedRuntimeUsage(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	_, valid := seedBudgetEvidenceTest(t, ctx, store, now)

	forgedCutoff := valid
	forgedCutoff.Cutoff.CutoffExposureUSDMicros++
	if _, err := store.RecordUsageEvidence(ctx, RecordUsageEvidenceRequest{
		IdempotencyKey: "forged-cutoff", UserID: "user-budget", Evidence: forgedCutoff,
	}, adminTestPriceSchedule()); err == nil || !strings.Contains(err.Error(), "control-plane authority") {
		t.Fatalf("forged cutoff error = %v", err)
	}

	oversized := valid
	oversized.Usage.Quantities.CPUCoreMicroseconds *= 2
	cost, err := runtimecost.Estimate(adminTestPriceSchedule(), oversized.Usage)
	if err != nil {
		t.Fatal(err)
	}
	oversized.Cost = cost
	resources := testRuntimeResources()
	resources.CPUCoreMillionths *= 2
	policy, err := store.UserBudgetPolicy(ctx, "user-budget")
	if err != nil {
		t.Fatal(err)
	}
	oversized.Cutoff, err = runtimeaccounting.EvaluateCutoff(
		adminTestPriceSchedule(),
		oversized.Usage,
		accountingCeilings(resources),
		accountingBudgetPolicy(policy),
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.RecordUsageEvidence(ctx, RecordUsageEvidenceRequest{
		IdempotencyKey: "oversized-usage", UserID: "user-budget", Evidence: oversized,
	}, adminTestPriceSchedule()); err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("oversized usage error = %v", err)
	}

	if _, err := store.db.ExecContext(ctx, `
UPDATE user_budget_policies
SET cutoff_exposure_usd_micros = cutoff_exposure_usd_micros + 1
WHERE user_id = 'user-budget'
`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RecordUsageEvidence(ctx, RecordUsageEvidenceRequest{
		IdempotencyKey: "mismatched-budget-exposure", UserID: "user-budget", Evidence: valid,
	}, adminTestPriceSchedule()); err == nil || !strings.Contains(err.Error(), "budget cutoff exposure") {
		t.Fatalf("mismatched budget exposure error = %v", err)
	}
}

func seedBudgetEvidenceTest(
	t *testing.T,
	ctx context.Context,
	store *Store,
	now time.Time,
) (string, runtimeaccounting.Evidence) {
	t.Helper()
	runtimeName := testRuntimeName(t, "budget-evidence")
	if _, err := store.UpsertUser(ctx, "user-budget"); err != nil {
		t.Fatal(err)
	}
	assignTestRuntime(t, store, "assign-budget-evidence", "user-budget", runtimeName, "budget-evidence-secret")
	evidence := testAdminUsageEvidence(t, runtimeName, now)
	if _, err := store.SetUserBudgetPolicy(ctx, SetUserBudgetPolicyRequest{
		UserID: "user-budget", PeriodStart: now, PeriodEnd: now.Add(time.Hour),
		CoveredLimitUSDMicros:   testEvidenceCoveredLimit,
		SafetyReserveUSDMicros:  testEvidenceSafetyReserve,
		CutoffExposureUSDMicros: int64(evidence.Cutoff.CutoffExposureUSDMicros),
		MaximumCutoffLag:        time.Minute,
	}); err != nil {
		t.Fatal(err)
	}
	return runtimeName, evidence
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
		MaximumCutoffLag: time.Minute,
	}
	if _, err := store.SetUserBudgetPolicy(ctx, request); err != nil {
		t.Fatalf("SetUserBudgetPolicy: %v", err)
	}
	if _, err := store.recordUsageInterval(ctx, testUsageRequest(
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
) recordUsageIntervalRequest {
	return recordUsageIntervalRequest{
		IdempotencyKey:       idempotencyKey,
		UserID:               userID,
		RuntimeName:          runtimeName,
		IntervalStart:        start,
		IntervalEnd:          end,
		MeasurementSource:    runtimeprovider.UsageBasisSettaConservative,
		CoveredCostUSDMicros: cost,
	}
}
