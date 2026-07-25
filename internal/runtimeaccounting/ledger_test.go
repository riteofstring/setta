package runtimeaccounting

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"setta/internal/runtimecost"
	spritescost "setta/internal/runtimecost/sprites"
	"setta/internal/runtimeprovider"
)

func TestLedgerClassifiesOverlappingActivityWithoutDoubleCounting(t *testing.T) {
	start := testStart()
	ledger := newTestLedger(t, start)
	for _, event := range testActivityEvents(start) {
		if err := ledger.Apply(event); err != nil {
			t.Fatalf("Apply %#v: %v", event, err)
		}
	}
	closed, err := ledger.Close(start.Add(time.Hour))
	if err != nil {
		t.Fatalf("Close: %v", err)
	}
	if closed.ProviderActive != 50*time.Minute || closed.AttachedIdle != 20*time.Minute ||
		closed.WorkloadLease != 10*time.Minute {
		t.Fatalf("closed window = %#v", closed)
	}
}

func TestLedgerRestartReplayAndWindowRolloverDoNotDrift(t *testing.T) {
	start := testStart()
	events := testActivityEvents(start)
	uninterrupted := newTestLedger(t, start)
	for _, event := range events {
		if err := uninterrupted.Apply(event); err != nil {
			t.Fatalf("uninterrupted Apply: %v", err)
		}
	}
	want, err := uninterrupted.Close(start.Add(time.Hour))
	if err != nil {
		t.Fatalf("uninterrupted Close: %v", err)
	}

	restarted := newTestLedger(t, start)
	for _, event := range events[:4] {
		if err := restarted.Apply(event); err != nil {
			t.Fatalf("pre-restart Apply: %v", err)
		}
	}
	restarted = roundTripLedger(t, restarted)
	for _, event := range events[:5] {
		if err := restarted.Apply(event); err != nil {
			t.Fatalf("idempotent replay Apply: %v", err)
		}
	}
	first, err := restarted.Close(start.Add(25 * time.Minute))
	if err != nil {
		t.Fatalf("first Close: %v", err)
	}
	for _, event := range events[5:] {
		if err := restarted.Apply(event); err != nil {
			t.Fatalf("post-restart Apply: %v", err)
		}
	}
	second, err := restarted.Close(start.Add(time.Hour))
	if err != nil {
		t.Fatalf("second Close: %v", err)
	}
	if first.ProviderActive+second.ProviderActive != want.ProviderActive ||
		first.AttachedIdle+second.AttachedIdle != want.AttachedIdle ||
		first.WorkloadLease+second.WorkloadLease != want.WorkloadLease {
		t.Fatalf("rollover first=%#v second=%#v want=%#v", first, second, want)
	}
}

func TestWorkloadLeaseExpiryAndRenewalSurviveRestart(t *testing.T) {
	start := testStart()
	ledger := newTestLedger(t, start)
	events := []ActivityEvent{
		testEvent(1, "provider-start", start, ActivityProvider, EventBegin, "", time.Time{}),
		testEvent(2, "lease-start", start.Add(5*time.Minute), ActivityWorkloadLease, EventBegin, "agent", start.Add(15*time.Minute)),
		testEvent(3, "attachment-start", start.Add(6*time.Minute), ActivityAttachment, EventBegin, "client", time.Time{}),
	}
	for _, event := range events {
		if err := ledger.Apply(event); err != nil {
			t.Fatalf("Apply: %v", err)
		}
	}
	ledger = roundTripLedger(t, ledger)
	closed, err := ledger.Close(start.Add(30 * time.Minute))
	if err != nil {
		t.Fatalf("Close expired lease: %v", err)
	}
	if closed.WorkloadLease != 10*time.Minute || closed.AttachedIdle != 15*time.Minute {
		t.Fatalf("expired lease window = %#v", closed)
	}
	if len(ledger.Snapshot().WorkloadLeases) != 0 {
		t.Fatalf("expired lease survived snapshot: %#v", ledger.Snapshot().WorkloadLeases)
	}

	renewed := newTestLedger(t, start)
	for _, event := range []ActivityEvent{
		testEvent(1, "provider-start", start, ActivityProvider, EventBegin, "", time.Time{}),
		testEvent(2, "lease-start", start.Add(5*time.Minute), ActivityWorkloadLease, EventBegin, "agent", start.Add(15*time.Minute)),
		testEvent(3, "lease-renew", start.Add(10*time.Minute), ActivityWorkloadLease, EventRenew, "agent", start.Add(25*time.Minute)),
	} {
		if err := renewed.Apply(event); err != nil {
			t.Fatalf("Apply renewal: %v", err)
		}
	}
	renewed = roundTripLedger(t, renewed)
	renewedWindow, err := renewed.Close(start.Add(30 * time.Minute))
	if err != nil {
		t.Fatalf("Close renewed lease: %v", err)
	}
	if renewedWindow.WorkloadLease != 20*time.Minute {
		t.Fatalf("renewed workload time = %s, want 20m", renewedWindow.WorkloadLease)
	}
}

func TestWorkloadLeaseRejectsRenewalAtOrAfterExpiry(t *testing.T) {
	start := testStart()
	for name, renewalAt := range map[string]time.Time{
		"at expiry":    start.Add(15 * time.Minute),
		"after expiry": start.Add(16 * time.Minute),
	} {
		t.Run(name, func(t *testing.T) {
			ledger := newTestLedger(t, start)
			for _, event := range []ActivityEvent{
				testEvent(1, "provider-start", start, ActivityProvider, EventBegin, "", time.Time{}),
				testEvent(2, "lease-start", start.Add(5*time.Minute), ActivityWorkloadLease, EventBegin, "agent", start.Add(15*time.Minute)),
			} {
				if err := ledger.Apply(event); err != nil {
					t.Fatalf("Apply setup: %v", err)
				}
			}
			renewal := testEvent(3, "lease-renew", renewalAt, ActivityWorkloadLease, EventRenew, "agent", start.Add(25*time.Minute))
			if err := ledger.Apply(renewal); !errors.Is(err, ErrInvalidEvent) {
				t.Fatalf("Apply renewal error = %v, want ErrInvalidEvent", err)
			}
		})
	}
}

func TestLedgerRejectsGapsConflictsAndImpossibleTransitionsWithoutMutation(t *testing.T) {
	start := testStart()
	tests := []ActivityEvent{
		testEvent(2, "gap", start, ActivityProvider, EventBegin, "", time.Time{}),
		testEvent(1, "attachment", start, ActivityAttachment, EventBegin, "client", time.Time{}),
		testEvent(1, "provider-end", start, ActivityProvider, EventEnd, "", time.Time{}),
	}
	for _, event := range tests {
		ledger := newTestLedger(t, start)
		before := ledger.Snapshot()
		if err := ledger.Apply(event); !errors.Is(err, ErrInvalidEvent) {
			t.Fatalf("Apply %#v error = %v, want ErrInvalidEvent", event, err)
		}
		after := ledger.Snapshot()
		if before.LastSequence != after.LastSequence || before.ProviderActive != after.ProviderActive ||
			!before.LastEventAt.Equal(after.LastEventAt) {
			t.Fatalf("invalid event mutated state: before=%#v after=%#v", before, after)
		}
	}

	ledger := newTestLedger(t, start)
	original := testEvent(1, "stable-id", start, ActivityProvider, EventBegin, "", time.Time{})
	if err := ledger.Apply(original); err != nil {
		t.Fatalf("Apply original: %v", err)
	}
	conflict := original
	conflict.At = start.Add(time.Second)
	if err := ledger.Apply(conflict); !errors.Is(err, ErrInvalidEvent) {
		t.Fatalf("conflicting replay error = %v, want ErrInvalidEvent", err)
	}

	backwards := testEvent(2, "backwards", start.Add(-time.Second), ActivityProvider, EventEnd, "", time.Time{})
	if err := ledger.Apply(backwards); !errors.Is(err, ErrInvalidEvent) {
		t.Fatalf("backward event error = %v, want ErrInvalidEvent", err)
	}
	ledger.state.LastSequence = ^uint64(0)
	if err := ledger.Apply(testEvent(1, "overflow", start, ActivityProvider, EventEnd, "", time.Time{})); !errors.Is(err, ErrInvalidEvent) {
		t.Fatalf("sequence overflow error = %v, want ErrInvalidEvent", err)
	}
}

func TestConservativeObservationUsesOnlyEnforcedUpperBounds(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("accounting-bounds")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	start := testStart()
	closed := ClosedWindow{
		Window:         runtimeprovider.UsageWindow{Start: start, End: start.Add(2 * time.Hour)},
		ProviderActive: time.Hour,
		AttachedIdle:   30 * time.Minute,
		WorkloadLease:  15 * time.Minute,
	}
	observation, err := ConservativeObservation(
		spritescost.Provider,
		identity.Name,
		closed,
		closed.Window.End,
		ResourceCeilings{
			CPUCoreMillionths: EnforcedBound{Enforced: true, Value: 500_000},
			MemoryBytes:       EnforcedBound{Enforced: true, Value: 1_000_000_000},
			ColdStorageBytes:  EnforcedBound{Enforced: true, Value: 10_000_000_000},
		},
	)
	if err != nil {
		t.Fatalf("ConservativeObservation: %v", err)
	}
	if observation.Quantities.CPUCoreMicroseconds != 1_800_000_000 ||
		observation.Quantities.MemoryByteSeconds != 3_600_000_000_000 ||
		observation.Quantities.HotStorageByteSeconds != 72_000_000_000_000 ||
		observation.Quantities.ColdStorageByteSeconds != 0 {
		t.Fatalf("quantities = %#v", observation.Quantities)
	}
	if observation.Includes(runtimeprovider.UsageDimensionColdStorage) {
		t.Fatalf("unproven cold storage was covered: %#v", observation.Coverage)
	}
}

func TestConservativeObservationRejectsAmbiguousBoundsAndOverflow(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("accounting-invalid-bounds")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	start := testStart()
	closed := ClosedWindow{
		Window:         runtimeprovider.UsageWindow{Start: start, End: start.Add(time.Hour)},
		ProviderActive: time.Hour,
	}
	for name, ceilings := range map[string]ResourceCeilings{
		"disabled nonzero": {MemoryBytes: EnforcedBound{Value: 1}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ConservativeObservation(spritescost.Provider, identity.Name, closed, closed.Window.End, ceilings); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
				t.Fatalf("error = %v, want ErrInvalidContract", err)
			}
		})
	}
	closed.Window.End = start.Add(time.Duration(1<<63 - 1))
	closed.ProviderActive = closed.Window.End.Sub(start)
	if _, err := ConservativeObservation(spritescost.Provider, identity.Name, closed, closed.Window.End, ResourceCeilings{
		MemoryBytes: EnforcedBound{Enforced: true, Value: ^uint64(0)},
	}); !errors.Is(err, runtimecost.ErrCostOverflow) {
		t.Fatalf("overflow error = %v, want ErrCostOverflow", err)
	}
}

func TestEvaluateCutoffBuildsWorstCaseEnforcementExposure(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("accounting-cutoff")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	start := testStart()
	ceilings := ResourceCeilings{
		CPUCoreMillionths: EnforcedBound{Enforced: true, Value: 1_000_000},
		MemoryBytes:       EnforcedBound{Enforced: true, Value: 1_000_000_000},
	}
	current := conservativeTestObservation(t, identity.Name, start, time.Hour, ceilings)
	policy := BudgetPolicy{
		CoveredLimitUSDMicros:  120_000,
		SafetyReserveUSDMicros: 4_353,
		MaximumCutoffLag:       time.Minute,
		RequiredDimensions: []runtimeprovider.UsageDimension{
			runtimeprovider.UsageDimensionCPU,
			runtimeprovider.UsageDimensionMemory,
		},
	}
	decision, err := EvaluateCutoff(spritescost.PublishedRates20260714(), current, ceilings, policy)
	if err != nil {
		t.Fatalf("EvaluateCutoff: %v", err)
	}
	if decision.Action != CutoffSuspend || decision.CurrentCoveredUSDMicros != 113_750 ||
		decision.CutoffExposureUSDMicros != 1_897 || decision.ThresholdUSDMicros != 115_647 {
		t.Fatalf("decision = %#v", decision)
	}

	policy.RequiredDimensions = append(policy.RequiredDimensions, runtimeprovider.UsageDimensionColdStorage)
	if _, err := EvaluateCutoff(spritescost.PublishedRates20260714(), current, ceilings, policy); !errors.Is(err, ErrMissingBound) {
		t.Fatalf("missing bound error = %v, want ErrMissingBound", err)
	}

	policy.RequiredDimensions = []runtimeprovider.UsageDimension{runtimeprovider.UsageDimensionProviderActive}
	if _, err := EvaluateCutoff(spritescost.PublishedRates20260714(), current, ceilings, policy); !errors.Is(err, runtimeprovider.ErrInvalidContract) {
		t.Fatalf("activity dimension error = %v, want ErrInvalidContract", err)
	}

	missingRate := spritescost.PublishedRates20260714()
	missingRate.MemoryGBHour.Available = false
	missingRate.MemoryGBHour.USDMicros = 0
	policy.RequiredDimensions = []runtimeprovider.UsageDimension{runtimeprovider.UsageDimensionCPU, runtimeprovider.UsageDimensionMemory}
	if _, err := EvaluateCutoff(missingRate, current, ceilings, policy); !errors.Is(err, runtimecost.ErrRateUnavailable) {
		t.Fatalf("missing rate error = %v, want ErrRateUnavailable", err)
	}
}

func TestConservativeObservationRoundsUpSubUnitExposure(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("accounting-rounding")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	start := testStart()
	observation, err := ConservativeObservation(
		spritescost.Provider,
		identity.Name,
		ClosedWindow{
			Window:         runtimeprovider.UsageWindow{Start: start, End: start.Add(time.Nanosecond)},
			ProviderActive: time.Nanosecond,
		},
		start.Add(time.Nanosecond),
		ResourceCeilings{CPUCoreMillionths: EnforcedBound{Enforced: true, Value: 1}},
	)
	if err != nil {
		t.Fatalf("ConservativeObservation: %v", err)
	}
	if observation.Quantities.CPUCoreMicroseconds != 1 {
		t.Fatalf("CPUCoreMicroseconds = %d, want conservative round-up to 1", observation.Quantities.CPUCoreMicroseconds)
	}
}

func TestConservativeObservationIntegratesEgressRateOverWindow(t *testing.T) {
	identity, err := runtimeprovider.NewManagedIdentity("accounting-egress")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	start := testStart()
	observation, err := ConservativeObservation(
		spritescost.Provider,
		identity.Name,
		ClosedWindow{
			Window:         runtimeprovider.UsageWindow{Start: start, End: start.Add(90 * time.Second)},
			ProviderActive: 30 * time.Second,
		},
		start.Add(90*time.Second),
		ResourceCeilings{EgressBytesPerSecond: EnforcedBound{Enforced: true, Value: 11}},
	)
	if err != nil {
		t.Fatalf("ConservativeObservation: %v", err)
	}
	if observation.Quantities.EgressBytes != 990 {
		t.Fatalf("EgressBytes = %d, want 990", observation.Quantities.EgressBytes)
	}
}

func newTestLedger(t *testing.T, start time.Time) *Ledger {
	t.Helper()
	ledger, err := NewLedger(start)
	if err != nil {
		t.Fatalf("NewLedger: %v", err)
	}
	return ledger
}

func roundTripLedger(t *testing.T, ledger *Ledger) *Ledger {
	t.Helper()
	encoded, err := json.Marshal(ledger.Snapshot())
	if err != nil {
		t.Fatalf("Marshal snapshot: %v", err)
	}
	var persisted LedgerState
	if err := json.Unmarshal(encoded, &persisted); err != nil {
		t.Fatalf("Unmarshal snapshot: %v", err)
	}
	restored, err := RestoreLedger(persisted)
	if err != nil {
		t.Fatalf("RestoreLedger: %v", err)
	}
	return restored
}

func testStart() time.Time {
	return time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
}

func testActivityEvents(start time.Time) []ActivityEvent {
	return []ActivityEvent{
		testEvent(1, "provider-start", start, ActivityProvider, EventBegin, "", time.Time{}),
		testEvent(2, "client-a-start", start.Add(10*time.Minute), ActivityAttachment, EventBegin, "client-a", time.Time{}),
		testEvent(3, "client-b-start", start.Add(15*time.Minute), ActivityAttachment, EventBegin, "client-b", time.Time{}),
		testEvent(4, "lease-start", start.Add(20*time.Minute), ActivityWorkloadLease, EventBegin, "agent", start.Add(35*time.Minute)),
		testEvent(5, "client-a-end", start.Add(25*time.Minute), ActivityAttachment, EventEnd, "client-a", time.Time{}),
		testEvent(6, "lease-end", start.Add(30*time.Minute), ActivityWorkloadLease, EventEnd, "agent", time.Time{}),
		testEvent(7, "client-b-end", start.Add(40*time.Minute), ActivityAttachment, EventEnd, "client-b", time.Time{}),
		testEvent(8, "provider-end", start.Add(50*time.Minute), ActivityProvider, EventEnd, "", time.Time{}),
	}
}

func testEvent(
	sequence uint64,
	eventID string,
	at time.Time,
	kind ActivityKind,
	action EventAction,
	subjectID string,
	expiresAt time.Time,
) ActivityEvent {
	return ActivityEvent{
		Sequence:       sequence,
		EventID:        eventID,
		At:             at,
		Kind:           kind,
		Action:         action,
		SubjectID:      subjectID,
		LeaseExpiresAt: expiresAt,
	}
}

func conservativeTestObservation(
	t *testing.T,
	runtimeName string,
	start time.Time,
	duration time.Duration,
	ceilings ResourceCeilings,
) runtimeprovider.UsageObservation {
	t.Helper()
	observation, err := ConservativeObservation(
		spritescost.Provider,
		runtimeName,
		ClosedWindow{
			Window:         runtimeprovider.UsageWindow{Start: start, End: start.Add(duration)},
			ProviderActive: duration,
		},
		start.Add(duration),
		ceilings,
	)
	if err != nil {
		t.Fatalf("ConservativeObservation: %v", err)
	}
	return observation
}
