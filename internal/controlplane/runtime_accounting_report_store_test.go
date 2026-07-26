package controlplane

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

func TestRuntimeAccountingReportUsesCentralOrderingAndReplaysProducerIdentity(t *testing.T) {
	ctx := context.Background()
	centralNow := time.Date(2026, 7, 25, 21, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return centralNow }, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "central-report-time", "user-central-report")
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName,
		Transition: runtimeaccounting.ActivityTransition{
			EventID: "central-provider-begin", At: centralNow.Add(-time.Minute),
			Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
		},
	}); err != nil {
		t.Fatal(err)
	}
	producerNow := centralNow.Add(-3 * time.Hour)
	report, err := runtimeaccounting.NewWorkloadLeaseTransition(
		runtimeaccounting.EventBegin,
		runtimeprovider.WorkloadLease{
			Name: "setta-agent", StartedAt: producerNow, ExpiresAt: producerNow.Add(2 * time.Minute),
		},
		producerNow,
	)
	if err != nil {
		t.Fatal(err)
	}
	state, err := store.RecordRuntimeAccountingReport(ctx, runtimeName, report)
	if err != nil || state.LastSequence != 2 || !state.LastEventAt.Equal(centralNow) ||
		len(state.WorkloadLeases) != 1 ||
		!state.WorkloadLeases[0].ExpiresAt.Equal(centralNow.Add(2*time.Minute)) {
		t.Fatalf("centralized runtime accounting report = %+v, %v", state, err)
	}
	centralNow = centralNow.Add(time.Minute)
	replayed, err := store.RecordRuntimeAccountingReport(ctx, runtimeName, report)
	if err != nil || replayed.LastSequence != state.LastSequence ||
		!replayed.LastEventAt.Equal(state.LastEventAt) {
		t.Fatalf("replayed runtime accounting report = %+v, %v", replayed, err)
	}
	changed := report
	changed.LeaseExpiresAt = changed.LeaseExpiresAt.Add(time.Second)
	if _, err := store.RecordRuntimeAccountingReport(
		ctx,
		runtimeName,
		changed,
	); !errors.Is(err, runtimeaccounting.ErrInvalidEvent) {
		t.Fatalf("changed runtime accounting report error = %v", err)
	}
}

func TestRuntimeAccountingReportRejectsUnboundedProducerLease(t *testing.T) {
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	runtimeName := prepareDeletionRuntime(t, store, "bounded-report", "user-bounded-report")
	now := time.Now().UTC()
	report, err := runtimeaccounting.NewWorkloadLeaseTransition(
		runtimeaccounting.EventBegin,
		runtimeprovider.WorkloadLease{
			Name: "setta-agent", StartedAt: now, ExpiresAt: now.Add(maximumReportedWorkloadLeaseTTL + time.Second),
		},
		now,
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.RecordRuntimeAccountingReport(
		context.Background(),
		runtimeName,
		report,
	); !errors.Is(err, runtimeaccounting.ErrInvalidEvent) {
		t.Fatalf("unbounded runtime accounting report error = %v", err)
	}
}
