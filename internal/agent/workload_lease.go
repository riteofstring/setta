package agent

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

const (
	defaultWorkloadLeaseName = "setta-agent"
	defaultWorkloadLeaseTTL  = 2 * time.Minute
	workloadReleaseTimeout   = 10 * time.Second
	workloadReportTimeout    = 10 * time.Second
)

type workloadLeaseController struct {
	manager  runtimeprovider.WorkloadLeaseManager
	reporter WorkloadLeaseReporter
	name     string
	ttl      time.Duration
	clock    func() time.Time
	wait     func(context.Context, time.Duration) error

	mu     sync.Mutex
	active *sharedWorkloadLease
}

type sharedWorkloadLease struct {
	lease runtimeprovider.WorkloadLease
	ctx   context.Context
	stop  context.CancelFunc
	refs  int

	renewDone chan struct{}
	renewErr  error
}

type WorkloadLeaseReporter interface {
	RecordTransition(context.Context, runtimeaccounting.ActivityTransition) error
}

func newWorkloadLeaseController(
	manager runtimeprovider.WorkloadLeaseManager,
	reporter WorkloadLeaseReporter,
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
		manager:  manager,
		reporter: reporter,
		name:     name,
		ttl:      ttl,
		clock:    time.Now,
		wait:     waitForWorkloadLeaseRenewal,
	}
}

func (controller *workloadLeaseController) run(
	ctx context.Context,
	run func(context.Context) (TurnResult, error),
) (TurnResult, error) {
	shared, err := controller.join(ctx)
	if err != nil {
		return TurnResult{}, err
	}
	runCtx, cancelRun := context.WithCancel(ctx)
	stopSharedCancellation := context.AfterFunc(shared.ctx, cancelRun)
	result, runErr := run(runCtx)
	stopSharedCancellation()
	cancelRun()
	return result, errors.Join(runErr, controller.leave(shared))
}

func (controller *workloadLeaseController) join(ctx context.Context) (*sharedWorkloadLease, error) {
	controller.mu.Lock()
	defer controller.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if controller.active != nil {
		select {
		case <-controller.active.renewDone:
			if controller.active.renewErr == nil {
				return nil, errors.New("agent workload lease stopped before release")
			}
			return nil, fmt.Errorf(
				"renew agent workload lease: %w",
				controller.active.renewErr,
			)
		default:
			controller.active.refs++
			return controller.active, nil
		}
	}
	lease, err := controller.manager.Acquire(ctx, runtimeprovider.WorkloadLeaseRequest{
		Name: controller.name,
		TTL:  controller.ttl,
	})
	if err != nil {
		return nil, fmt.Errorf("acquire agent workload lease: %w", err)
	}
	if err := validateObservedWorkloadLease(lease, controller.name); err != nil {
		return nil, errors.Join(err, controller.releaseProvider())
	}
	if err := controller.report(runtimeaccounting.EventBegin, lease); err != nil {
		releaseErr := controller.releaseProvider()
		var endErr error
		if releaseErr == nil {
			endErr = controller.report(runtimeaccounting.EventEnd, lease)
		}
		return nil, errors.Join(
			fmt.Errorf("record acquired agent workload lease: %w", err),
			releaseErr,
			endErr,
		)
	}
	leaseCtx, stopLease := context.WithCancel(context.Background())
	shared := &sharedWorkloadLease{
		lease:     lease,
		ctx:       leaseCtx,
		stop:      stopLease,
		refs:      1,
		renewDone: make(chan struct{}),
	}
	controller.active = shared
	go func() {
		shared.renewErr = controller.renew(leaseCtx)
		close(shared.renewDone)
		if shared.renewErr != nil {
			stopLease()
		}
	}()
	return shared, nil
}

func (controller *workloadLeaseController) leave(shared *sharedWorkloadLease) error {
	controller.mu.Lock()
	defer controller.mu.Unlock()
	if controller.active != shared || shared.refs <= 0 {
		return errors.New("agent workload lease participation is inconsistent")
	}
	shared.refs--
	if shared.refs > 0 {
		select {
		case <-shared.renewDone:
			return wrapWorkloadLeaseError(
				"renew agent workload lease",
				shared.renewErr,
			)
		default:
			return nil
		}
	}
	shared.stop()
	<-shared.renewDone
	controller.active = nil
	return errors.Join(
		wrapWorkloadLeaseError("renew agent workload lease", shared.renewErr),
		controller.release(shared.lease),
	)
}

func (controller *workloadLeaseController) release(lease runtimeprovider.WorkloadLease) error {
	if err := controller.releaseProvider(); err != nil {
		return err
	}
	return wrapWorkloadLeaseError(
		"record released agent workload lease",
		controller.report(runtimeaccounting.EventEnd, lease),
	)
}

func (controller *workloadLeaseController) releaseProvider() error {
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
		if err := controller.report(runtimeaccounting.EventRenew, lease); err != nil {
			return fmt.Errorf("record renewed agent workload lease: %w", err)
		}
	}
}

func (controller *workloadLeaseController) report(
	action runtimeaccounting.EventAction,
	lease runtimeprovider.WorkloadLease,
) error {
	transition, err := runtimeaccounting.NewWorkloadLeaseTransition(
		action,
		lease,
		controller.clock().UTC(),
	)
	if err != nil {
		return err
	}
	reportCtx, cancel := context.WithTimeout(context.Background(), workloadReportTimeout)
	defer cancel()
	return controller.reporter.RecordTransition(reportCtx, transition)
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
