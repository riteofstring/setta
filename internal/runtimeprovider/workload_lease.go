package runtimeprovider

import (
	"context"
	"time"
)

// WorkloadLeaseManager manages renewable holds through a trusted API inside a
// runtime. It is intentionally separate from the external Provider lifecycle.
type WorkloadLeaseManager interface {
	Acquire(context.Context, WorkloadLeaseRequest) (WorkloadLease, error)
	Renew(context.Context, string, time.Duration) (WorkloadLease, error)
	Inspect(context.Context, string) (WorkloadLease, bool, error)
	Release(context.Context, string) error
}

// WorkloadLeaseRequest describes a bounded hold for active background work.
type WorkloadLeaseRequest struct {
	Name string
	TTL  time.Duration
}

// WorkloadLease is the authoritative observation returned by the in-runtime
// lease API.
type WorkloadLease struct {
	Name      string
	StartedAt time.Time
	ExpiresAt time.Time
}
