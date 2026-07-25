package runtimeaccounting

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"setta/internal/runtimeprovider"
)

type workloadLeaseEventIdentity struct {
	Action    EventAction `json:"action"`
	At        time.Time   `json:"at"`
	ExpiresAt time.Time   `json:"expires_at,omitempty"`
	Name      string      `json:"name"`
}

func NewWorkloadLeaseTransition(
	action EventAction,
	lease runtimeprovider.WorkloadLease,
	at time.Time,
) (ActivityTransition, error) {
	if action != EventBegin && action != EventRenew && action != EventEnd {
		return ActivityTransition{}, errors.New("workload lease transition action is invalid")
	}
	if lease.Name == "" || at.IsZero() {
		return ActivityTransition{}, errors.New("workload lease transition identity is incomplete")
	}
	expiresAt := lease.ExpiresAt
	if action == EventEnd {
		expiresAt = time.Time{}
	} else if !expiresAt.After(at) {
		return ActivityTransition{}, errors.New("workload lease transition expiry must follow the event")
	}
	identity, err := json.Marshal(workloadLeaseEventIdentity{
		Action:    action,
		At:        at.UTC(),
		ExpiresAt: expiresAt.UTC(),
		Name:      lease.Name,
	})
	if err != nil {
		return ActivityTransition{}, err
	}
	digest := sha256.Sum256(identity)
	return ActivityTransition{
		EventID:        "workload-lease-" + hex.EncodeToString(digest[:]),
		At:             at.UTC(),
		Kind:           ActivityWorkloadLease,
		Action:         action,
		SubjectID:      lease.Name,
		LeaseExpiresAt: expiresAt.UTC(),
	}, nil
}
