package runtimetest

import (
	"context"
	"fmt"
	"time"

	"setta/internal/runtimeprovider"
)

// LeaseManager is an in-memory runtimeprovider.WorkloadLeaseManager.
type LeaseManager struct {
	Now    func() time.Time
	leases map[string]runtimeprovider.WorkloadLease
}

// NewLeaseManager returns an empty fake workload lease manager.
func NewLeaseManager(now func() time.Time) *LeaseManager {
	if now == nil {
		now = time.Now
	}
	return &LeaseManager{
		Now:    now,
		leases: make(map[string]runtimeprovider.WorkloadLease),
	}
}

// Acquire records a new lease beginning at Now.
func (manager *LeaseManager) Acquire(
	_ context.Context,
	request runtimeprovider.WorkloadLeaseRequest,
) (runtimeprovider.WorkloadLease, error) {
	if err := validateLeaseRequest(request.Name, request.TTL); err != nil {
		return runtimeprovider.WorkloadLease{}, err
	}
	now := manager.Now().UTC()
	lease := runtimeprovider.WorkloadLease{
		Name:      request.Name,
		StartedAt: now,
		ExpiresAt: now.Add(request.TTL),
	}
	manager.leases[request.Name] = lease
	return lease, nil
}

// Renew extends an active lease.
func (manager *LeaseManager) Renew(
	_ context.Context,
	name string,
	ttl time.Duration,
) (runtimeprovider.WorkloadLease, error) {
	if err := validateLeaseRequest(name, ttl); err != nil {
		return runtimeprovider.WorkloadLease{}, err
	}
	manager.expire(name)
	lease, ok := manager.leases[name]
	if !ok {
		return runtimeprovider.WorkloadLease{}, fmt.Errorf("workload lease %s is absent", name)
	}
	lease.ExpiresAt = manager.Now().UTC().Add(ttl)
	manager.leases[name] = lease
	return lease, nil
}

// Inspect returns an active lease if it has not expired.
func (manager *LeaseManager) Inspect(
	_ context.Context,
	name string,
) (runtimeprovider.WorkloadLease, bool, error) {
	if name == "" {
		return runtimeprovider.WorkloadLease{}, false, fmt.Errorf("%w: workload lease name is empty", runtimeprovider.ErrInvalidContract)
	}
	manager.expire(name)
	lease, ok := manager.leases[name]
	return lease, ok, nil
}

// Release removes an active or absent lease.
func (manager *LeaseManager) Release(_ context.Context, name string) error {
	if name == "" {
		return fmt.Errorf("%w: workload lease name is empty", runtimeprovider.ErrInvalidContract)
	}
	delete(manager.leases, name)
	return nil
}

func (manager *LeaseManager) expire(name string) {
	lease, ok := manager.leases[name]
	if !ok {
		return
	}
	if !manager.Now().UTC().Before(lease.ExpiresAt) {
		delete(manager.leases, name)
	}
}

func validateLeaseRequest(name string, ttl time.Duration) error {
	if name == "" {
		return fmt.Errorf("%w: workload lease name is empty", runtimeprovider.ErrInvalidContract)
	}
	if ttl <= 0 {
		return fmt.Errorf("%w: workload lease TTL must be positive", runtimeprovider.ErrInvalidContract)
	}
	return nil
}

var _ runtimeprovider.WorkloadLeaseManager = (*LeaseManager)(nil)
