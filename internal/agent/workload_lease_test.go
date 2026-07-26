package agent

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

func TestWorkloadLeaseControllerRenewsAndReleasesCompletedTurn(t *testing.T) {
	manager := &testWorkloadLeaseManager{renewed: make(chan struct{}, 1)}
	reporter := &testWorkloadLeaseReporter{}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	controller.wait = immediateFirstRenewal()
	want := TurnResult{Outcome: TurnOutcomeCompleted}
	result, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
		<-manager.renewed
		return want, nil
	})
	if err != nil || result != want {
		t.Fatalf("leased turn = %+v, %v", result, err)
	}
	manager.requireCalls(t, 1, 1, 1)
	reporter.requireActions(t, runtimeaccounting.EventBegin, runtimeaccounting.EventRenew, runtimeaccounting.EventEnd)
}

func TestWorkloadLeaseControllerCancelsTurnAfterRenewalFailure(t *testing.T) {
	renewErr := errors.New("renewal failed")
	manager := &testWorkloadLeaseManager{
		renewErr: renewErr,
		renewed:  make(chan struct{}, 1),
	}
	reporter := &testWorkloadLeaseReporter{}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	controller.wait = immediateFirstRenewal()
	_, err := controller.run(t.Context(), func(ctx context.Context) (TurnResult, error) {
		<-ctx.Done()
		return TurnResult{}, ctx.Err()
	})
	if !errors.Is(err, renewErr) || !errors.Is(err, context.Canceled) {
		t.Fatalf("renewal failure = %v", err)
	}
	manager.requireCalls(t, 1, 1, 1)
	reporter.requireActions(t, runtimeaccounting.EventBegin, runtimeaccounting.EventEnd)
}

func TestWorkloadLeaseControllerCancelsAllSharedTurnsAfterRenewalFailure(t *testing.T) {
	renewErr := errors.New("renewal failed")
	manager := &testWorkloadLeaseManager{renewErr: renewErr}
	reporter := &testWorkloadLeaseReporter{}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	allowRenewal := make(chan struct{})
	controller.wait = func(ctx context.Context, _ time.Duration) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-allowRenewal:
			return nil
		}
	}
	started := make(chan struct{}, 2)
	finished := make(chan error, 2)
	for range 2 {
		go func() {
			_, err := controller.run(t.Context(), func(ctx context.Context) (TurnResult, error) {
				started <- struct{}{}
				<-ctx.Done()
				return TurnResult{}, ctx.Err()
			})
			finished <- err
		}()
	}
	<-started
	<-started
	close(allowRenewal)
	for range 2 {
		err := <-finished
		if !errors.Is(err, renewErr) || !errors.Is(err, context.Canceled) {
			t.Fatalf("shared renewal failure = %v", err)
		}
	}
	manager.requireCalls(t, 1, 1, 1)
	reporter.requireActions(t, runtimeaccounting.EventBegin, runtimeaccounting.EventEnd)
}

func TestWorkloadLeaseControllerDoesNotJoinWithCanceledContext(t *testing.T) {
	manager := &testWorkloadLeaseManager{}
	reporter := &testWorkloadLeaseReporter{}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	started := make(chan struct{})
	release := make(chan struct{})
	finished := make(chan error, 1)
	go func() {
		_, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
			close(started)
			<-release
			return TurnResult{Outcome: TurnOutcomeCompleted}, nil
		})
		finished <- err
	}()
	<-started

	canceledCtx, cancel := context.WithCancel(t.Context())
	cancel()
	ran := false
	_, err := controller.run(canceledCtx, func(context.Context) (TurnResult, error) {
		ran = true
		return TurnResult{}, nil
	})
	if !errors.Is(err, context.Canceled) || ran {
		t.Fatalf("canceled shared turn = %v, ran = %t", err, ran)
	}
	manager.requireCalls(t, 1, 0, 0)

	close(release)
	if err := <-finished; err != nil {
		t.Fatalf("active shared turn: %v", err)
	}
	manager.requireCalls(t, 1, 0, 1)
	reporter.requireActions(t, runtimeaccounting.EventBegin, runtimeaccounting.EventEnd)
}

func TestWorkloadLeaseControllerDoesNotRunAfterAcquireFailure(t *testing.T) {
	acquireErr := errors.New("acquire failed")
	manager := &testWorkloadLeaseManager{acquireErr: acquireErr}
	reporter := &testWorkloadLeaseReporter{}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	ran := false
	_, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
		ran = true
		return TurnResult{}, nil
	})
	if !errors.Is(err, acquireErr) || ran {
		t.Fatalf("acquire failure = %v, ran = %t", err, ran)
	}
	manager.requireCalls(t, 1, 0, 0)
	reporter.requireActions(t)
}

func TestWorkloadLeaseControllerReleasesInvalidAcquireObservation(t *testing.T) {
	manager := &testWorkloadLeaseManager{invalidAcquire: true}
	reporter := &testWorkloadLeaseReporter{}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	ran := false
	_, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
		ran = true
		return TurnResult{}, nil
	})
	if err == nil || ran {
		t.Fatalf("invalid acquire observation error = %v, ran = %t", err, ran)
	}
	manager.requireCalls(t, 1, 0, 1)
	reporter.requireActions(t)
}

func TestWorkloadLeaseControllerDoesNotRunWhenAcquireReportFails(t *testing.T) {
	reportErr := errors.New("report failed")
	manager := &testWorkloadLeaseManager{}
	reporter := &testWorkloadLeaseReporter{failAction: runtimeaccounting.EventBegin, err: reportErr}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	ran := false
	_, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
		ran = true
		return TurnResult{}, nil
	})
	if !errors.Is(err, reportErr) || ran {
		t.Fatalf("acquire reporting failure = %v, ran = %t", err, ran)
	}
	manager.requireCalls(t, 1, 0, 1)
	reporter.requireActions(t, runtimeaccounting.EventBegin, runtimeaccounting.EventEnd)
}

func TestWorkloadLeaseControllerCancelsTurnWhenRenewReportFails(t *testing.T) {
	reportErr := errors.New("report failed")
	manager := &testWorkloadLeaseManager{renewed: make(chan struct{}, 1)}
	reporter := &testWorkloadLeaseReporter{failAction: runtimeaccounting.EventRenew, err: reportErr}
	controller := newWorkloadLeaseController(manager, reporter, "setta-agent", 2*time.Minute)
	controller.wait = immediateFirstRenewal()
	_, err := controller.run(t.Context(), func(ctx context.Context) (TurnResult, error) {
		<-ctx.Done()
		return TurnResult{}, ctx.Err()
	})
	if !errors.Is(err, reportErr) || !errors.Is(err, context.Canceled) {
		t.Fatalf("renew reporting failure = %v", err)
	}
	manager.requireCalls(t, 1, 1, 1)
	reporter.requireActions(t, runtimeaccounting.EventBegin, runtimeaccounting.EventRenew, runtimeaccounting.EventEnd)
}

func immediateFirstRenewal() func(context.Context, time.Duration) error {
	var calls int
	return func(ctx context.Context, _ time.Duration) error {
		calls++
		if calls == 1 {
			return nil
		}
		<-ctx.Done()
		return ctx.Err()
	}
}

type testWorkloadLeaseManager struct {
	mu             sync.Mutex
	acquireErr     error
	invalidAcquire bool
	renewErr       error
	renewed        chan struct{}
	acquires       int
	renews         int
	releases       int
}

type testWorkloadLeaseReporter struct {
	mu         sync.Mutex
	actions    []runtimeaccounting.EventAction
	failAction runtimeaccounting.EventAction
	err        error
}

func (reporter *testWorkloadLeaseReporter) RecordTransition(
	_ context.Context,
	transition runtimeaccounting.ActivityTransition,
) error {
	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	reporter.actions = append(reporter.actions, transition.Action)
	if transition.Action == reporter.failAction {
		return reporter.err
	}
	return nil
}

func (reporter *testWorkloadLeaseReporter) requireActions(
	t *testing.T,
	want ...runtimeaccounting.EventAction,
) {
	t.Helper()
	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	if !slices.Equal(reporter.actions, want) {
		t.Fatalf("workload lease report actions = %v, want %v", reporter.actions, want)
	}
}

func (manager *testWorkloadLeaseManager) Acquire(
	_ context.Context,
	request runtimeprovider.WorkloadLeaseRequest,
) (runtimeprovider.WorkloadLease, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.acquires++
	if manager.acquireErr != nil {
		return runtimeprovider.WorkloadLease{}, manager.acquireErr
	}
	if manager.invalidAcquire {
		return runtimeprovider.WorkloadLease{}, nil
	}
	return runtimeprovider.WorkloadLease{
		Name:      request.Name,
		StartedAt: time.Now(),
		ExpiresAt: time.Now().Add(request.TTL),
	}, nil
}

func (manager *testWorkloadLeaseManager) Renew(
	_ context.Context,
	name string,
	ttl time.Duration,
) (runtimeprovider.WorkloadLease, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.renews++
	if manager.renewed != nil {
		select {
		case manager.renewed <- struct{}{}:
		default:
		}
	}
	if manager.renewErr != nil {
		return runtimeprovider.WorkloadLease{}, manager.renewErr
	}
	return runtimeprovider.WorkloadLease{
		Name:      name,
		StartedAt: time.Now(),
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func (manager *testWorkloadLeaseManager) Inspect(
	context.Context,
	string,
) (runtimeprovider.WorkloadLease, bool, error) {
	return runtimeprovider.WorkloadLease{}, false, errors.New("unexpected inspect")
}

func (manager *testWorkloadLeaseManager) Release(context.Context, string) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.releases++
	return nil
}

func (manager *testWorkloadLeaseManager) requireCalls(
	t *testing.T,
	acquires int,
	renews int,
	releases int,
) {
	t.Helper()
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.acquires != acquires || manager.renews != renews || manager.releases != releases {
		t.Fatalf(
			"workload lease calls = acquire %d, renew %d, release %d; want %d, %d, %d",
			manager.acquires,
			manager.renews,
			manager.releases,
			acquires,
			renews,
			releases,
		)
	}
}
