package controlplane

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

func TestReconcilerEnsuresOneRuntimeForConcurrentIntent(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 20, 18, 0, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	if _, err := store.UpsertUser(ctx, "user-concurrent"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	request := testEnsureRuntimeRequest(t, "ensure-concurrent", "user-concurrent", "concurrent")
	var wait sync.WaitGroup
	errorsByCall := make(chan error, 12)
	for range 12 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.EnsureRuntimeIntent(ctx, request)
			errorsByCall <- err
		}()
	}
	wait.Wait()
	close(errorsByCall)
	for err := range errorsByCall {
		if err != nil {
			t.Fatalf("EnsureRuntimeIntent: %v", err)
		}
	}
	provider := newTestReconcilerProvider(request.RuntimeName)
	reconciler := newTestReconciler(t, store, provider, 3)
	processed, err := reconciler.ReconcileOnce(ctx)
	if err != nil || !processed {
		t.Fatalf("ReconcileOnce = %t, %v", processed, err)
	}
	operation, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil {
		t.Fatalf("RuntimeOperation: %v", err)
	}
	if operation.Status != RuntimeOperationSucceeded || provider.createCalls != 1 {
		t.Fatalf("operation/create calls = %+v/%d", operation, provider.createCalls)
	}
	observation, err := store.ProviderObservation(ctx, request.RuntimeName)
	if err != nil || observation.ProviderResourceID == "" ||
		observation.URLAccess != runtimeprovider.URLAccessAuthenticated {
		t.Fatalf("ProviderObservation = %+v, %v", observation, err)
	}
}

func TestReconcilerAdoptsAmbiguousCreateAfterRestart(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 20, 18, 10, 0, 0, time.UTC)
	directory := t.TempDir()
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	if _, err := store.UpsertUser(ctx, "user-ambiguous"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	request := testEnsureRuntimeRequest(t, "ensure-ambiguous", "user-ambiguous", "ambiguous")
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatalf("EnsureRuntimeIntent: %v", err)
	}
	provider := newTestReconcilerProvider(request.RuntimeName)
	provider.ambiguousCreate = true
	first := newTestReconciler(t, store, provider, 3)
	if processed, err := first.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("first ReconcileOnce = %t, %v", processed, err)
	}
	deferred, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil || deferred.Status != RuntimeOperationRetryWait || deferred.LastErrorCode != "provider_create" {
		t.Fatalf("deferred operation = %+v, %v", deferred, err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	now = now.Add(time.Minute)
	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	second := newTestReconciler(t, restarted, provider, 3)
	if processed, err := second.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("restarted ReconcileOnce = %t, %v", processed, err)
	}
	completed, err := restarted.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil || completed.Status != RuntimeOperationSucceeded || provider.createCalls != 1 {
		t.Fatalf("completed operation/create calls = %+v/%d, %v", completed, provider.createCalls, err)
	}
}

func TestRuntimeOperationLeaseFencesStaleWorker(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 20, 18, 20, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	if _, err := store.UpsertUser(ctx, "user-fence"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	request := testEnsureRuntimeRequest(t, "ensure-fence", "user-fence", "fence")
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatalf("EnsureRuntimeIntent: %v", err)
	}
	stale, found, err := store.ClaimRuntimeOperation(ctx, "worker-stale", time.Minute)
	if err != nil || !found {
		t.Fatalf("first claim = %+v, %t, %v", stale, found, err)
	}
	now = now.Add(2 * time.Minute)
	observation := authenticatedTestObservation(t, request.RuntimeName)
	if err := store.CompleteRuntimeOperation(ctx, stale, observation); !errors.Is(err, ErrFenceLost) {
		t.Fatalf("expired completion error = %v, want ErrFenceLost", err)
	}
	current, found, err := store.ClaimRuntimeOperation(ctx, "worker-current", time.Minute)
	if err != nil || !found || current.FenceToken <= stale.FenceToken {
		t.Fatalf("second claim = %+v, %t, %v", current, found, err)
	}
	if err := store.CompleteRuntimeOperation(ctx, current, observation); err != nil {
		t.Fatalf("complete current claim: %v", err)
	}
	if err := store.CompleteRuntimeOperation(ctx, stale, observation); !errors.Is(err, ErrFenceLost) {
		t.Fatalf("stale completion error = %v, want ErrFenceLost", err)
	}
}

func TestRuntimeIdempotencyKeysAreGlobalAcrossOperationKinds(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t, t.TempDir(), time.Now, RateLimit{})
	defer store.Close()
	for _, userID := range []string{"user-ensure-first", "user-assign-first"} {
		if _, err := store.UpsertUser(ctx, userID); err != nil {
			t.Fatalf("UpsertUser %s: %v", userID, err)
		}
	}
	ensureFirst := testEnsureRuntimeRequest(t, "global-key-ensure", "user-ensure-first", "global-ensure")
	if _, err := store.EnsureRuntimeIntent(ctx, ensureFirst); err != nil {
		t.Fatalf("EnsureRuntimeIntent: %v", err)
	}
	assignConflict := testAssignment("global-key-ensure", "user-ensure-first", ensureFirst.RuntimeName, "runtime_credential")
	if _, err := store.AssignRuntime(ctx, assignConflict); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("assignment reused ensure key: %v", err)
	}
	assignRuntime := testRuntimeName(t, "global-assign")
	assignTestRuntime(t, store, "global-key-assign", "user-assign-first", assignRuntime, "runtime_credential")
	ensureConflict := testEnsureRuntimeRequest(t, "global-key-assign", "user-assign-first", "global-assign")
	if _, err := store.EnsureRuntimeIntent(ctx, ensureConflict); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("ensure reused assignment key: %v", err)
	}
}

func TestReconcilerHonorsSuspensionAndReplacement(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 20, 18, 30, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	if _, err := store.UpsertUser(ctx, "user-policy"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	firstRequest := testEnsureRuntimeRequest(t, "ensure-first", "user-policy", "policy-first")
	if _, err := store.EnsureRuntimeIntent(ctx, firstRequest); err != nil {
		t.Fatalf("first EnsureRuntimeIntent: %v", err)
	}
	firstClaim, found, err := store.ClaimRuntimeOperation(ctx, "worker-first", time.Minute)
	if err != nil || !found {
		t.Fatalf("first claim = %+v, %t, %v", firstClaim, found, err)
	}
	secondRequest := testEnsureRuntimeRequest(t, "ensure-second", "user-policy", "policy-second")
	if _, err := store.EnsureRuntimeIntent(ctx, secondRequest); err != nil {
		t.Fatalf("second EnsureRuntimeIntent: %v", err)
	}
	if err := store.CompleteRuntimeOperation(ctx, firstClaim, authenticatedTestObservation(t, firstRequest.RuntimeName)); !errors.Is(err, ErrFenceLost) {
		t.Fatalf("replaced completion error = %v", err)
	}
	assertRuntimeReplacementState(t, store, firstRequest, secondRequest)
	if err := store.SetUserStatus(ctx, "user-policy", UserStatusSuspended); err != nil {
		t.Fatalf("suspend user: %v", err)
	}
	if claim, found, err := store.ClaimRuntimeOperation(ctx, "worker-suspended", time.Minute); err != nil || found {
		t.Fatalf("suspended claim = %+v, %t, %v", claim, found, err)
	}
	if err := store.SetUserStatus(ctx, "user-policy", UserStatusActive); err != nil {
		t.Fatalf("resume user: %v", err)
	}
	if _, found, err := store.ClaimRuntimeOperation(ctx, "worker-resumed", time.Minute); err != nil || !found {
		t.Fatalf("resumed claim = %t, %v", found, err)
	}
}

func assertRuntimeReplacementState(
	t *testing.T,
	store *Store,
	firstRequest EnsureRuntimeRequest,
	secondRequest EnsureRuntimeRequest,
) {
	t.Helper()
	ctx := context.Background()
	firstOperation, err := store.RuntimeOperation(ctx, firstRequest.IdempotencyKey)
	if err != nil || firstOperation.Status != RuntimeOperationCanceled {
		t.Fatalf("first operation after replacement = %+v, %v", firstOperation, err)
	}
	oldRuntime, err := store.readRuntimeLocked(ctx, firstRequest.RuntimeName)
	if err != nil || oldRuntime.Lifecycle != RuntimeLifecycleDeleting ||
		oldRuntime.AccessState != RuntimeAccessSuspended {
		t.Fatalf("old runtime after replacement = %+v, %v", oldRuntime, err)
	}
	newRuntime, err := store.readRuntimeLocked(ctx, secondRequest.RuntimeName)
	if err != nil || newRuntime.Lifecycle != RuntimeLifecycleProvisioning ||
		newRuntime.AccessState != RuntimeAccessSuspended {
		t.Fatalf("new runtime after replacement = %+v, %v", newRuntime, err)
	}
}

func TestReconcilerPermanentlyRejectsMalformedProviderIdentity(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 20, 18, 40, 0, 0, time.UTC)
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	if _, err := store.UpsertUser(ctx, "user-malformed"); err != nil {
		t.Fatalf("UpsertUser: %v", err)
	}
	request := testEnsureRuntimeRequest(t, "ensure-malformed", "user-malformed", "malformed")
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatalf("EnsureRuntimeIntent: %v", err)
	}
	provider := newTestReconcilerProvider(request.RuntimeName)
	provider.malformedIdentity = true
	reconciler := newTestReconciler(t, store, provider, 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || !processed {
		t.Fatalf("ReconcileOnce = %t, %v", processed, err)
	}
	operation, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil || operation.Status != RuntimeOperationFailed ||
		operation.LastErrorCode != "provider_identity_mismatch" {
		t.Fatalf("malformed operation = %+v, %v", operation, err)
	}
}

type testReconcilerProvider struct {
	runtimeName       string
	observation       runtimeprovider.RuntimeObservation
	found             bool
	createCalls       int
	destroyCalls      int
	suspendCalls      int
	ambiguousCreate   bool
	ambiguousDestroy  bool
	ambiguousSuspend  bool
	malformedIdentity bool
}

func newTestReconcilerProvider(runtimeName string) *testReconcilerProvider {
	identity, _ := runtimeprovider.ManagedIdentityFromName(runtimeName)
	return &testReconcilerProvider{
		runtimeName: runtimeName,
		observation: runtimeprovider.RuntimeObservation{
			ProviderResourceID: "provider-resource",
			Name:               runtimeName,
			Labels:             identity.Labels,
			Activity:           runtimeprovider.RuntimeActivityWarm,
			URLAccess:          runtimeprovider.URLAccessPublic,
		},
	}
}

func (provider *testReconcilerProvider) Inspect(
	context.Context,
	string,
) (runtimeprovider.RuntimeObservation, bool, error) {
	return provider.currentObservation(), provider.found, nil
}

func (provider *testReconcilerProvider) Create(
	_ context.Context,
	_ runtimeprovider.CreateRequest,
) (runtimeprovider.RuntimeObservation, error) {
	provider.createCalls++
	provider.found = true
	if provider.ambiguousCreate {
		provider.ambiguousCreate = false
		return runtimeprovider.RuntimeObservation{}, errors.New("ambiguous provider create")
	}
	return provider.currentObservation(), nil
}

func (provider *testReconcilerProvider) ConfigureURL(
	_ context.Context,
	_ string,
	access runtimeprovider.URLAccess,
) error {
	provider.observation.URLAccess = access
	return nil
}

func (provider *testReconcilerProvider) Destroy(
	_ context.Context,
	_ string,
) error {
	provider.destroyCalls++
	provider.found = false
	if provider.ambiguousDestroy {
		provider.ambiguousDestroy = false
		return errors.New("ambiguous provider destroy")
	}
	return nil
}

func (provider *testReconcilerProvider) Suspend(
	_ context.Context,
	_ string,
) error {
	provider.suspendCalls++
	provider.observation.Activity = runtimeprovider.RuntimeActivityWarm
	if provider.ambiguousSuspend {
		provider.ambiguousSuspend = false
		return errors.New("ambiguous provider suspend")
	}
	return nil
}

func (provider *testReconcilerProvider) currentObservation() runtimeprovider.RuntimeObservation {
	result := provider.observation
	if provider.malformedIdentity {
		result.Name = "foreign-runtime"
	}
	return result
}

func testEnsureRuntimeRequest(
	t *testing.T,
	idempotencyKey string,
	userID string,
	identityKey string,
) EnsureRuntimeRequest {
	t.Helper()
	return EnsureRuntimeRequest{
		IdempotencyKey:      idempotencyKey,
		UserID:              userID,
		RuntimeName:         testRuntimeName(t, identityKey),
		CredentialEpoch:     1,
		UpstreamAuthority:   "127.0.0.1:7345",
		CredentialSecretRef: "runtime_credential",
		DesiredRelease:      "reconciler-test-release",
	}
}

func newTestReconciler(
	t *testing.T,
	store *Store,
	provider RuntimeReconcilerProvider,
	maximumAttempts int,
) *Reconciler {
	t.Helper()
	observer, err := NewJSONLinesObserver(io.Discard)
	if err != nil {
		t.Fatalf("NewJSONLinesObserver: %v", err)
	}
	reconciler, err := NewReconciler(ReconcilerConfig{
		LeaseDuration:    time.Minute,
		MaxAttempts:      maximumAttempts,
		OperationTimeout: 30 * time.Second,
		Observer:         observer,
		Provider:         provider,
		RetryDelay:       time.Minute,
		Store:            store,
		WorkerID:         "test-worker",
	})
	if err != nil {
		t.Fatalf("NewReconciler: %v", err)
	}
	return reconciler
}

func authenticatedTestObservation(t *testing.T, runtimeName string) runtimeprovider.RuntimeObservation {
	t.Helper()
	identity, err := runtimeprovider.ManagedIdentityFromName(runtimeName)
	if err != nil {
		t.Fatalf("ManagedIdentityFromName: %v", err)
	}
	return runtimeprovider.RuntimeObservation{
		ProviderResourceID: "provider-resource",
		Name:               identity.Name,
		Labels:             identity.Labels,
		Activity:           runtimeprovider.RuntimeActivityWarm,
		URLAccess:          runtimeprovider.URLAccessAuthenticated,
	}
}
