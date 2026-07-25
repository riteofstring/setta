package runtimeaccounting

import (
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestWorkloadLeaseTransitionIsDeterministicAndActionComplete(t *testing.T) {
	at := time.Date(2026, 7, 25, 20, 0, 0, 0, time.UTC)
	lease := runtimeprovider.WorkloadLease{
		Name: "setta-agent", StartedAt: at.Add(-time.Second), ExpiresAt: at.Add(time.Minute),
	}
	for _, action := range []EventAction{EventBegin, EventRenew, EventEnd} {
		first, err := NewWorkloadLeaseTransition(action, lease, at)
		if err != nil {
			t.Fatalf("%s transition: %v", action, err)
		}
		second, err := NewWorkloadLeaseTransition(action, lease, at)
		if err != nil || second != first {
			t.Fatalf("%s transition replay = %+v, %v; want %+v", action, second, err, first)
		}
		if first.EventID == "" || first.Kind != ActivityWorkloadLease ||
			first.SubjectID != lease.Name || first.Action != action {
			t.Fatalf("%s transition = %+v", action, first)
		}
		if action == EventEnd && !first.LeaseExpiresAt.IsZero() {
			t.Fatalf("end transition retained expiry: %+v", first)
		}
	}
}

func TestWorkloadLeaseTransitionRejectsIncompleteInputs(t *testing.T) {
	at := time.Now().UTC()
	for _, test := range []struct {
		action EventAction
		lease  runtimeprovider.WorkloadLease
		at     time.Time
	}{
		{action: "invalid", lease: runtimeprovider.WorkloadLease{Name: "setta-agent"}, at: at},
		{action: EventBegin, lease: runtimeprovider.WorkloadLease{}, at: at},
		{
			action: EventRenew,
			lease:  runtimeprovider.WorkloadLease{Name: "setta-agent", ExpiresAt: at},
			at:     at,
		},
	} {
		if _, err := NewWorkloadLeaseTransition(test.action, test.lease, test.at); err == nil {
			t.Fatalf("invalid workload lease transition accepted: %+v", test)
		}
	}
}
