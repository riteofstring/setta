package agent

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	defaultWorkloadLeaseName = "setta-agent"
	defaultWorkloadLeaseTTL  = 2 * time.Minute
	workloadReleaseTimeout   = 10 * time.Second
)

type workloadLeaseController struct {
	manager runtimeprovider.WorkloadLeaseManager
	name    string
	ttl     time.Duration
	wait    func(context.Context, time.Duration) error
}

func newWorkloadLeaseController(
	manager runtimeprovider.WorkloadLeaseManager,
	name string,
	ttl time.Duration,
) *workloadLeaseController {
	if name == "" {
		name = defaultWorkloadLeaseName
	}
	if ttl <= 0 {
		ttl = defaultWorkloadLeaseTTL
	}
	return &workloadLeaseController{
		manager: manager,
		name:    name,
		ttl:     ttl,
		wait:    waitForWorkloadLeaseRenewal,
	}
}

func (controller *workloadLeaseController) run(
	ctx context.Context,
	run func(context.Context) (TurnResult, error),
) (TurnResult, error) {
	lease, err := controller.manager.Acquire(ctx, runtimeprovider.WorkloadLeaseRequest{
		Name: controller.name,
		TTL:  controller.ttl,
	})
	if err != nil {
		return TurnResult{}, fmt.Errorf("acquire agent workload lease: %w", err)
	}
	if err := validateObservedWorkloadLease(lease, controller.name); err != nil {
		return TurnResult{}, errors.Join(err, controller.release())
	}
	leaseCtx, cancel := context.WithCancel(ctx)
	renewed := make(chan error, 1)
	go func() {
		err := controller.renew(leaseCtx)
		if err != nil {
			cancel()
		}
		renewed <- err
	}()
	result, runErr := run(leaseCtx)
	cancel()
	renewErr := <-renewed
	return result, errors.Join(
		runErr,
		wrapWorkloadLeaseError("renew agent workload lease", renewErr),
		controller.release(),
	)
}

func (controller *workloadLeaseController) release() error {
	releaseCtx, releaseCancel := context.WithTimeout(context.Background(), workloadReleaseTimeout)
	releaseErr := controller.manager.Release(releaseCtx, controller.name)
	releaseCancel()
	return wrapWorkloadLeaseError("release agent workload lease", releaseErr)
}

func (controller *workloadLeaseController) renew(ctx context.Context) error {
	for {
		if err := controller.wait(ctx, controller.ttl/2); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		lease, err := controller.manager.Renew(ctx, controller.name, controller.ttl)
		if err != nil {
			return err
		}
		if err := validateObservedWorkloadLease(lease, controller.name); err != nil {
			return err
		}
	}
}

func waitForWorkloadLeaseRenewal(ctx context.Context, interval time.Duration) error {
	timer := time.NewTimer(interval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func wrapWorkloadLeaseError(label string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", label, err)
}

func validateObservedWorkloadLease(lease runtimeprovider.WorkloadLease, name string) error {
	if lease.Name != name || lease.StartedAt.IsZero() || !lease.ExpiresAt.After(lease.StartedAt) {
		return errors.New("agent workload lease manager returned an invalid observation")
	}
	return nil
}
