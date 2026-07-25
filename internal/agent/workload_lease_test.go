package agent

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestWorkloadLeaseControllerRenewsAndReleasesCompletedTurn(t *testing.T) {
	manager := &testWorkloadLeaseManager{renewed: make(chan struct{}, 1)}
	controller := newWorkloadLeaseController(manager, "setta-agent", 2*time.Minute)
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
}

func TestWorkloadLeaseControllerCancelsTurnAfterRenewalFailure(t *testing.T) {
	renewErr := errors.New("renewal failed")
	manager := &testWorkloadLeaseManager{
		renewErr: renewErr,
		renewed:  make(chan struct{}, 1),
	}
	controller := newWorkloadLeaseController(manager, "setta-agent", 2*time.Minute)
	controller.wait = immediateFirstRenewal()
	_, err := controller.run(t.Context(), func(ctx context.Context) (TurnResult, error) {
		<-ctx.Done()
		return TurnResult{}, ctx.Err()
	})
	if !errors.Is(err, renewErr) || !errors.Is(err, context.Canceled) {
		t.Fatalf("renewal failure = %v", err)
	}
	manager.requireCalls(t, 1, 1, 1)
}

func TestWorkloadLeaseControllerDoesNotRunAfterAcquireFailure(t *testing.T) {
	acquireErr := errors.New("acquire failed")
	manager := &testWorkloadLeaseManager{acquireErr: acquireErr}
	controller := newWorkloadLeaseController(manager, "setta-agent", 2*time.Minute)
	ran := false
	_, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
		ran = true
		return TurnResult{}, nil
	})
	if !errors.Is(err, acquireErr) || ran {
		t.Fatalf("acquire failure = %v, ran = %t", err, ran)
	}
	manager.requireCalls(t, 1, 0, 0)
}

func TestWorkloadLeaseControllerReleasesInvalidAcquireObservation(t *testing.T) {
	manager := &testWorkloadLeaseManager{invalidAcquire: true}
	controller := newWorkloadLeaseController(manager, "setta-agent", 2*time.Minute)
	ran := false
	_, err := controller.run(t.Context(), func(context.Context) (TurnResult, error) {
		ran = true
		return TurnResult{}, nil
	})
	if err == nil || ran {
		t.Fatalf("invalid acquire observation error = %v, ran = %t", err, ran)
	}
	manager.requireCalls(t, 1, 0, 1)
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
