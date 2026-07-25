package controlplane

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
	"setta/internal/sprites"
)

func TestProductionProviderProtocolCollapsesConcurrentEnsureAndAdoptsOrphan(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 25, 4, 0, 0, 0, time.UTC)
	api := newScriptedSpritesAPI(t)
	server := httptest.NewServer(api)
	defer server.Close()
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	adapter := newProtocolTestAdapter(t, server.URL)
	request := testEnsureRuntimeRequest(t, "protocol-concurrent", "user-protocol", "protocol-concurrent")
	if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
		t.Fatal(err)
	}
	var wait sync.WaitGroup
	failures := make(chan error, 12)
	for range 12 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.EnsureRuntimeIntent(ctx, request)
			failures <- err
		}()
	}
	wait.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatalf("EnsureRuntimeIntent: %v", err)
		}
	}
	reconciler := newTestReconciler(t, store, adapter, 3)
	requireProtocolReconcile(t, ctx, reconciler)
	requireProtocolOperationSucceeded(t, ctx, store, request)
	if creates, updates := api.callCounts(); creates != 1 || updates != 1 {
		t.Fatalf("provider calls after concurrent ensure = create %d, update %d", creates, updates)
	}

	orphan := testEnsureRuntimeRequest(t, "protocol-orphan", "user-orphan", "protocol-orphan")
	if _, err := store.UpsertUser(ctx, orphan.UserID); err != nil {
		t.Fatal(err)
	}
	api.seed(orphan)
	if _, err := store.EnsureRuntimeIntent(ctx, orphan); err != nil {
		t.Fatal(err)
	}
	requireProtocolReconcile(t, ctx, reconciler)
	requireProtocolOperationSucceeded(t, ctx, store, orphan)
	if creates, updates := api.callCounts(); creates != 1 || updates != 2 {
		t.Fatalf("provider calls after orphan adoption = create %d, update %d", creates, updates)
	}
}

func TestProductionProviderProtocolAdoptsAmbiguousCreateAfterRestart(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 25, 5, 0, 0, 0, time.UTC)
	api := newScriptedSpritesAPI(t)
	api.ambiguousCreate = true
	server := httptest.NewServer(api)
	defer server.Close()
	directory := t.TempDir()
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	request := testEnsureRuntimeRequest(t, "protocol-ambiguous", "user-ambiguous-protocol", "protocol-ambiguous")
	if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	first := newTestReconciler(t, store, newProtocolTestAdapter(t, server.URL), 3)
	requireProtocolReconcile(t, ctx, first)
	deferred, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil || deferred.Status != RuntimeOperationRetryWait ||
		deferred.LastErrorCode != "provider_create" {
		t.Fatalf("deferred operation = %+v, %v", deferred, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	second := newTestReconciler(t, restarted, newProtocolTestAdapter(t, server.URL), 3)
	requireProtocolReconcile(t, ctx, second)
	requireProtocolOperationSucceeded(t, ctx, restarted, request)
	if creates, updates := api.callCounts(); creates != 1 || updates != 1 {
		t.Fatalf("provider calls after restart adoption = create %d, update %d", creates, updates)
	}
}

func TestProductionProviderProtocolClassifiesProviderFailures(t *testing.T) {
	for _, test := range []struct {
		name      string
		configure func(*scriptedSpritesAPI)
		errorCode string
	}{
		{
			name: "throttled inspection",
			configure: func(api *scriptedSpritesAPI) {
				api.inspectStatus = http.StatusTooManyRequests
			},
			errorCode: "provider_inspect",
		},
		{
			name: "malformed inspection",
			configure: func(api *scriptedSpritesAPI) {
				api.malformedInspection = true
			},
			errorCode: "provider_inspect",
		},
		{
			name: "capacity rejection",
			configure: func(api *scriptedSpritesAPI) {
				api.createStatus = http.StatusUnprocessableEntity
			},
			errorCode: "provider_create",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			now := time.Date(2026, 7, 25, 6, 0, 0, 0, time.UTC)
			api := newScriptedSpritesAPI(t)
			test.configure(api)
			server := httptest.NewServer(api)
			defer server.Close()
			store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
			defer store.Close()
			request := testEnsureRuntimeRequest(t, "protocol-failure", "user-protocol-failure", "protocol-failure")
			if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
				t.Fatal(err)
			}
			if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
				t.Fatal(err)
			}
			reconciler := newTestReconciler(t, store, newProtocolTestAdapter(t, server.URL), 1)
			requireProtocolReconcile(t, ctx, reconciler)
			operation, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
			if err != nil || operation.Status != RuntimeOperationFailed ||
				operation.LastErrorCode != test.errorCode {
				t.Fatalf("failed operation = %+v, %v", operation, err)
			}
		})
	}
}

func TestProductionProviderProtocolRecoversTimedOutExpiredLeaseAfterRestart(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 25, 7, 0, 0, 0, time.UTC)
	api := newScriptedSpritesAPI(t)
	api.blockInspection = true
	server := httptest.NewServer(api)
	defer server.Close()
	directory := t.TempDir()
	store := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	request := testEnsureRuntimeRequest(t, "protocol-timeout", "user-protocol-timeout", "protocol-timeout")
	if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	first := newTimedProtocolReconciler(
		t, store, newProtocolTestAdapter(t, server.URL), "timeout-worker-first",
	)
	requireProtocolReconcile(t, ctx, first)
	running, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil || running.Status != RuntimeOperationRunning {
		t.Fatalf("timed-out operation = %+v, %v", running, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	now = now.Add(3 * time.Second)
	restarted := openTestStore(t, directory, func() time.Time { return now }, RateLimit{})
	defer restarted.Close()
	second := newTestReconciler(t, restarted, newProtocolTestAdapter(t, server.URL), 3)
	requireProtocolReconcile(t, ctx, second)
	requireProtocolOperationSucceeded(t, ctx, restarted, request)
	if creates, _ := api.callCounts(); creates != 1 {
		t.Fatalf("create calls after timed-out lease recovery = %d", creates)
	}
}

func TestProductionProviderProtocolDoesNotCallProviderForSuspendedUser(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)
	api := newScriptedSpritesAPI(t)
	server := httptest.NewServer(api)
	defer server.Close()
	store := openTestStore(t, t.TempDir(), func() time.Time { return now }, RateLimit{})
	defer store.Close()
	request := testEnsureRuntimeRequest(t, "protocol-suspended", "user-protocol-suspended", "protocol-suspended")
	if _, err := store.UpsertUser(ctx, request.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.EnsureRuntimeIntent(ctx, request); err != nil {
		t.Fatal(err)
	}
	if err := store.SetUserStatus(ctx, request.UserID, UserStatusSuspended); err != nil {
		t.Fatal(err)
	}
	reconciler := newTestReconciler(t, store, newProtocolTestAdapter(t, server.URL), 3)
	if processed, err := reconciler.ReconcileOnce(ctx); err != nil || processed {
		t.Fatalf("suspended ReconcileOnce = %t, %v", processed, err)
	}
	if calls := api.totalCalls(); calls != 0 {
		t.Fatalf("provider calls for suspended user = %d", calls)
	}
}

func newProtocolTestAdapter(t *testing.T, baseURL string) *sprites.Adapter {
	t.Helper()
	adapter, err := sprites.NewAdapterWithBaseURL("scripted-provider-token", baseURL)
	if err != nil {
		t.Fatal(err)
	}
	return adapter
}

func newTimedProtocolReconciler(
	t *testing.T,
	store *Store,
	adapter *sprites.Adapter,
	workerID string,
) *Reconciler {
	t.Helper()
	observer, err := NewJSONLinesObserver(io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	reconciler, err := NewReconciler(ReconcilerConfig{
		AccountingObserver: observer,
		AccountingWindow:   time.Minute,
		LeaseDuration:      2 * time.Second,
		MaxAttempts:        3,
		OperationTimeout:   500 * time.Millisecond,
		Observer:           observer,
		PriceSchedule:      adminTestPriceSchedule(),
		Provider:           adapter,
		RetryDelay:         time.Minute,
		Store:              store,
		WorkerID:           workerID,
	})
	if err != nil {
		t.Fatal(err)
	}
	return reconciler
}

func requireProtocolReconcile(t *testing.T, ctx context.Context, reconciler *Reconciler) {
	t.Helper()
	processed, err := reconciler.ReconcileOnce(ctx)
	if err != nil || !processed {
		t.Fatalf("ReconcileOnce = %t, %v", processed, err)
	}
}

func requireProtocolOperationSucceeded(
	t *testing.T,
	ctx context.Context,
	store *Store,
	request EnsureRuntimeRequest,
) {
	t.Helper()
	operation, err := store.RuntimeOperation(ctx, request.IdempotencyKey)
	if err != nil || operation.Status != RuntimeOperationSucceeded {
		t.Fatalf("runtime operation = %+v, %v", operation, err)
	}
	observation, err := store.ProviderObservation(ctx, request.RuntimeName)
	if err != nil || observation.Resources != request.Resources ||
		observation.URLAccess != runtimeprovider.URLAccessAuthenticated {
		t.Fatalf("provider observation = %+v, %v", observation, err)
	}
}

type scriptedSpritesAPI struct {
	t                   *testing.T
	mu                  sync.Mutex
	runtimes            map[string]spritessdk.SpriteInfo
	totalRequestCount   int
	createCalls         int
	updateCalls         int
	inspectStatus       int
	createStatus        int
	ambiguousCreate     bool
	failNextInspection  bool
	malformedInspection bool
	blockInspection     bool
}

func newScriptedSpritesAPI(t *testing.T) *scriptedSpritesAPI {
	t.Helper()
	return &scriptedSpritesAPI{t: t, runtimes: make(map[string]spritessdk.SpriteInfo)}
}

func (api *scriptedSpritesAPI) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	api.t.Helper()
	api.mu.Lock()
	api.totalRequestCount++
	api.mu.Unlock()
	if request.Header.Get("Authorization") != "Bearer scripted-provider-token" {
		response.WriteHeader(http.StatusUnauthorized)
		return
	}
	switch {
	case request.Method == http.MethodPost && request.URL.Path == "/v1/sprites":
		api.handleCreate(response, request)
	case request.Method == http.MethodGet:
		api.handleInspect(response, request)
	case request.Method == http.MethodPut:
		api.handleUpdate(response, request)
	default:
		response.WriteHeader(http.StatusNotFound)
	}
}

func (api *scriptedSpritesAPI) handleCreate(response http.ResponseWriter, request *http.Request) {
	var payload spritessdk.CreateSpriteRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		api.t.Errorf("decode create request: %v", err)
		response.WriteHeader(http.StatusBadRequest)
		return
	}
	api.mu.Lock()
	api.createCalls++
	status := api.createStatus
	api.createStatus = 0
	if status != 0 {
		api.mu.Unlock()
		response.WriteHeader(status)
		_, _ = response.Write([]byte(`{"error":"provider capacity unavailable"}`))
		return
	}
	api.runtimes[payload.Name] = scriptedSpriteInfo(payload.Name, payload.Labels, payload.Config)
	ambiguous := api.ambiguousCreate
	if ambiguous {
		api.ambiguousCreate = false
		api.failNextInspection = true
	}
	api.mu.Unlock()
	if ambiguous {
		response.WriteHeader(http.StatusInternalServerError)
		_, _ = response.Write([]byte(`{"error":"ambiguous create"}`))
		return
	}
	response.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(response).Encode(spritessdk.CreateSpriteResponse{Name: payload.Name})
}

func (api *scriptedSpritesAPI) handleInspect(response http.ResponseWriter, request *http.Request) {
	name := runtimeNameFromProviderPath(request.URL.Path)
	api.mu.Lock()
	if api.blockInspection {
		api.blockInspection = false
		api.mu.Unlock()
		<-request.Context().Done()
		return
	}
	if api.inspectStatus != 0 {
		status := api.inspectStatus
		api.inspectStatus = 0
		api.mu.Unlock()
		response.WriteHeader(status)
		_, _ = response.Write([]byte(`{"error":"provider inspection unavailable"}`))
		return
	}
	if api.malformedInspection {
		api.malformedInspection = false
		api.mu.Unlock()
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"name":`))
		return
	}
	if api.failNextInspection {
		api.failNextInspection = false
		api.mu.Unlock()
		response.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	runtime, found := api.runtimes[name]
	api.mu.Unlock()
	if !found {
		response.WriteHeader(http.StatusNotFound)
		return
	}
	response.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(response).Encode(runtime)
}

func (api *scriptedSpritesAPI) handleUpdate(response http.ResponseWriter, request *http.Request) {
	name := runtimeNameFromProviderPath(request.URL.Path)
	var payload spritessdk.UpdateURLSettingsRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		api.t.Errorf("decode URL settings request: %v", err)
		response.WriteHeader(http.StatusBadRequest)
		return
	}
	api.mu.Lock()
	runtime, found := api.runtimes[name]
	if found {
		runtime.URLSettings = payload.URLSettings
		api.runtimes[name] = runtime
		api.updateCalls++
	}
	api.mu.Unlock()
	if !found {
		response.WriteHeader(http.StatusNotFound)
		return
	}
	response.WriteHeader(http.StatusOK)
}

func (api *scriptedSpritesAPI) seed(request EnsureRuntimeRequest) {
	identity, err := runtimeprovider.ManagedIdentityFromName(request.RuntimeName)
	if err != nil {
		api.t.Fatal(err)
	}
	config := &spritessdk.SpriteConfig{
		CPUs: 1, RamMB: 512, StorageGB: 10,
	}
	api.mu.Lock()
	api.runtimes[request.RuntimeName] = scriptedSpriteInfo(
		request.RuntimeName, identity.Labels, config,
	)
	api.mu.Unlock()
}

func (api *scriptedSpritesAPI) callCounts() (int, int) {
	api.mu.Lock()
	defer api.mu.Unlock()
	return api.createCalls, api.updateCalls
}

func (api *scriptedSpritesAPI) totalCalls() int {
	api.mu.Lock()
	defer api.mu.Unlock()
	return api.totalRequestCount
}

func scriptedSpriteInfo(
	name string,
	labels []string,
	config *spritessdk.SpriteConfig,
) spritessdk.SpriteInfo {
	return spritessdk.SpriteInfo{
		ID: "provider-" + name, Name: name, Status: "running",
		Config: config, Labels: append([]string(nil), labels...),
		URLSettings:   &spritessdk.URLSettings{Auth: "sprite"},
		PrimaryRegion: "yyz",
	}
}

func runtimeNameFromProviderPath(path string) string {
	const prefix = "/v1/sprites/"
	if len(path) <= len(prefix) || path[:len(prefix)] != prefix {
		return ""
	}
	return path[len(prefix):]
}
