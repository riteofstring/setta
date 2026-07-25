package controlplane

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
)

func TestRuntimeAccountingEventsAreDurableOrderedAndIdempotent(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, _ := seededControlPlane(t, ctx)
	directory := filepath.Dir(store.Path())
	start := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	events := []runtimeaccounting.ActivityEvent{
		accountingEvent(1, "provider-begin", start, runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, ""),
		accountingEvent(2, "phone-begin", start.Add(time.Minute), runtimeaccounting.ActivityAttachment, runtimeaccounting.EventBegin, "phone"),
	}
	for _, event := range events {
		if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
			RuntimeName: runtimeName, Transition: accountingTransition(event),
		}); err != nil {
			t.Fatalf("RecordRuntimeAccountingEvent: %v", err)
		}
	}
	replayed, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName, Transition: accountingTransition(events[1]),
	})
	if err != nil || replayed.LastSequence != 2 {
		t.Fatalf("replayed ledger = %+v, %v", replayed, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	restarted, err := OpenStore(StoreConfig{Directory: directory})
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	lease := accountingEvent(
		3,
		"lease-begin",
		start.Add(2*time.Minute),
		runtimeaccounting.ActivityWorkloadLease,
		runtimeaccounting.EventBegin,
		"agent",
	)
	lease.LeaseExpiresAt = start.Add(4 * time.Minute)
	events = append(events, lease)
	if _, err := restarted.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName, Transition: accountingTransition(lease),
	}); err != nil {
		t.Fatalf("RecordRuntimeAccountingEvent after restart: %v", err)
	}
	snapshot, err := restarted.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Ledger.LastSequence != 3 ||
		len(snapshot.Ledger.Attachments) != 1 ||
		len(snapshot.Ledger.WorkloadLeases) != 1 ||
		snapshot.EventsSHA256 != accountingEventsSHA256(t, events) {
		t.Fatalf("accounting snapshot = %+v", snapshot)
	}
}

func TestRuntimeAccountingEventsRejectConflictInvalidTransitionAndForeignRuntimeAtomically(t *testing.T) {
	ctx := context.Background()
	store, _, runtimeName, _ := seededControlPlane(t, ctx)
	defer store.Close()
	start := time.Date(2026, 7, 24, 20, 0, 0, 0, time.UTC)
	first := accountingEvent(
		1, "provider-begin", start,
		runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, "",
	)
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName, Transition: accountingTransition(first),
	}); err != nil {
		t.Fatal(err)
	}
	conflict := first
	conflict.At = conflict.At.Add(time.Second)
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName, Transition: accountingTransition(conflict),
	}); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting replay error = %v", err)
	}
	invalid := accountingEvent(
		2, "duplicate-provider-begin", start.Add(time.Minute),
		runtimeaccounting.ActivityProvider, runtimeaccounting.EventBegin, "",
	)
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName, Transition: accountingTransition(invalid),
	}); !errors.Is(err, runtimeaccounting.ErrInvalidEvent) {
		t.Fatalf("invalid transition error = %v", err)
	}
	if _, err := store.RecordRuntimeAccountingEvent(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: testRuntimeName(t, "foreign-accounting"), Transition: accountingTransition(first),
	}); err == nil {
		t.Fatal("foreign runtime accounting event succeeded")
	}
	snapshot, err := store.RuntimeAccountingSnapshot(ctx, runtimeName)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Ledger.LastSequence != 1 ||
		snapshot.EventsSHA256 != accountingEventsSHA256(t, []runtimeaccounting.ActivityEvent{first}) {
		t.Fatalf("accounting snapshot after rejected events = %+v", snapshot)
	}
}

func accountingTransition(event runtimeaccounting.ActivityEvent) runtimeaccounting.ActivityTransition {
	return runtimeaccounting.ActivityTransition{
		EventID: event.EventID, At: event.At, Kind: event.Kind, Action: event.Action,
		SubjectID: event.SubjectID, LeaseExpiresAt: event.LeaseExpiresAt,
	}
}

func accountingEvent(
	sequence uint64,
	eventID string,
	at time.Time,
	kind runtimeaccounting.ActivityKind,
	action runtimeaccounting.EventAction,
	subjectID string,
) runtimeaccounting.ActivityEvent {
	return runtimeaccounting.ActivityEvent{
		Sequence: sequence, EventID: eventID, At: at,
		Kind: kind, Action: action, SubjectID: subjectID,
	}
}

func accountingEventsSHA256(t *testing.T, events []runtimeaccounting.ActivityEvent) string {
	t.Helper()
	digest := sha256.New()
	for _, event := range events {
		canonical, err := runtimeaccounting.CanonicalActivityEventLine(event)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := digest.Write(canonical); err != nil {
			t.Fatal(err)
		}
	}
	return hex.EncodeToString(digest.Sum(nil))
}
