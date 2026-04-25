package appdefinition

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"setta/internal/appsubsystem/appspec"
	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

func TestBackendRuntimeSetAppDefinitionSyncsPersistedState(t *testing.T) {
	t.Helper()

	store, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}
	appSpec := backendRuntimeTestAppSpec("v2")

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointSetAppDefinition {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}

			return MutationResult{
				AppSpec:       appSpec,
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	snapshot, result, err := service.SetAppDefinition(context.Background(), SetInput{
		AppSpec:        appSpec,
		AppSpecVersion: &expectedDefinition.AppSpecVersion,
		CatalogID:      &expectedDefinition.CatalogID,
		AppSpecPath:    &expectedDefinition.AppSpecPath,
	})
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}
	if result.AppDefinition == nil || result.AppDefinition.AppSpecPath != expectedDefinition.AppSpecPath {
		t.Fatalf("unexpected mutation result %#v", result)
	}

	raw := storage.StoredDocumentAppDefinitionRaw(snapshot.Document)
	got := mustDecodeBackendRuntimeTestDefinition(t, raw)
	if got.AppSpecPath != expectedDefinition.AppSpecPath || got.CatalogID != expectedDefinition.CatalogID {
		t.Fatalf("expected snapshot app definition %#v, got %#v", expectedDefinition, got)
	}

	live := mustDecodeBackendRuntimeTestDefinition(
		t,
		storage.StoredDocumentAppDefinitionRaw(runtime.Snapshot().Document),
	)
	if live.AppSpecVersion != expectedDefinition.AppSpecVersion {
		t.Fatalf("expected live runtime sync %#v, got %#v", expectedDefinition, live)
	}
	persistedAppSpec, err := appSpecStore.Read(filepath.Dir(store.Path()), expectedDefinition.AppSpecPath)
	if err != nil {
		t.Fatalf("read persisted app spec: %v", err)
	}
	if persistedAppSpec == nil {
		t.Fatal("expected host sync to persist app spec")
	}
}

func TestBackendRuntimeSetAppDefinitionPreservesNewerLiveProjectState(t *testing.T) {
	store, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}
	appSpec := backendRuntimeTestAppSpec("v2")

	if _, err := runtime.MutateWithContext(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		next := document.Clone()
		next.Projects["project-alpha"] = backendRuntimeTestProject("In Memory Project")
		return next, nil
	}); err != nil {
		t.Fatalf("mutate live project state: %v", err)
	}

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointSetAppDefinition {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}

			return MutationResult{
				AppSpec:       appSpec,
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	snapshot, _, err := service.SetAppDefinition(context.Background(), SetInput{
		AppSpec:        appSpec,
		AppSpecVersion: &expectedDefinition.AppSpecVersion,
		CatalogID:      &expectedDefinition.CatalogID,
		AppSpecPath:    &expectedDefinition.AppSpecPath,
	})
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	if project.Name != "In Memory Project" {
		t.Fatalf("expected in-memory project name to be preserved, got %#v", project.Name)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load merged persisted document: %v", err)
	}
	if persisted.Projects["project-alpha"].Name != "In Memory Project" {
		t.Fatalf("expected merged persisted project name, got %#v", persisted.Projects["project-alpha"].Name)
	}
	if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(persisted)); got.CatalogID != expectedDefinition.CatalogID {
		t.Fatalf("expected merged persisted app definition %#v, got %#v", expectedDefinition, got)
	}
}

func TestBackendRuntimeSetAppDefinitionRebasesBlockedDeferredPersist(t *testing.T) {
	blockedSaveStarted := make(chan struct{}, 1)
	releaseBlockedSave := make(chan struct{})
	store, runtime := openPersistedBackendRuntimeTestProjectWithOptions(t, projectstate.RuntimeOptions{
		BeforeSave: func(_ context.Context, snapshot projectstate.Snapshot) error {
			if snapshot.Revision != 2 {
				return nil
			}
			select {
			case blockedSaveStarted <- struct{}{}:
			default:
			}
			<-releaseBlockedSave
			return nil
		},
	})
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}
	appSpec := backendRuntimeTestAppSpec("v2")

	if _, err := runtime.MutateAndPersistLater(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		next := document.Clone()
		next.Projects["project-alpha"] = backendRuntimeTestProject("Deferred Project")
		return next, nil
	}); err != nil {
		t.Fatalf("queue deferred persist: %v", err)
	}
	<-blockedSaveStarted

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointSetAppDefinition {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}

			return MutationResult{
				AppSpec:       appSpec,
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	resultCh := make(chan error, 1)
	go func() {
		_, _, err := service.SetAppDefinition(context.Background(), SetInput{
			AppSpec:        appSpec,
			AppSpecVersion: &expectedDefinition.AppSpecVersion,
			CatalogID:      &expectedDefinition.CatalogID,
			AppSpecPath:    &expectedDefinition.AppSpecPath,
		})
		resultCh <- err
	}()

	releaseBlockedSave <- struct{}{}
	if err := <-resultCh; err != nil {
		t.Fatalf("set app definition with blocked deferred persist: %v", err)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after merge: %v", err)
	}
	if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(persisted)); got.CatalogID != expectedDefinition.CatalogID {
		t.Fatalf("expected merged app definition %#v, got %#v", expectedDefinition, got)
	}
	if persisted.Projects["project-alpha"].Name != "Deferred Project" {
		t.Fatalf("expected deferred project state to remain merged, got %#v", persisted.Projects["project-alpha"].Name)
	}
}

func TestBackendRuntimeSetAppDefinitionRollsBackAppSpecWhenHostPersistFails(t *testing.T) {
	store, runtime := openPersistedBackendRuntimeTestProjectWithOptions(t, projectstate.RuntimeOptions{
		BeforeSave: func(context.Context, projectstate.Snapshot) error {
			return errors.New("host persist failed")
		},
	})
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}
	appSpec := backendRuntimeTestAppSpec("v2")

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointSetAppDefinition {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}
			return MutationResult{
				AppSpec:       appSpec,
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	_, _, err := service.SetAppDefinition(
		projectstate.ContextWithFrontendOpID(context.Background(), "failed-app-op"),
		SetInput{
			AppSpec:        appSpec,
			AppSpecVersion: &expectedDefinition.AppSpecVersion,
			CatalogID:      &expectedDefinition.CatalogID,
			AppSpecPath:    &expectedDefinition.AppSpecPath,
		},
	)
	if err == nil || err.Error() != "host persist failed" {
		t.Fatalf("expected host persist failure, got %v", err)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after failed mutation: %v", err)
	}
	if raw := storage.StoredDocumentAppDefinitionRaw(persisted); len(raw) != 0 {
		t.Fatalf("expected persisted app definition to remain unchanged, got %s", string(raw))
	}
	if raw := storage.StoredDocumentAppDefinitionRaw(runtime.Snapshot().Document); len(raw) != 0 {
		t.Fatalf("expected live app definition to roll back, got %s", string(raw))
	}
	persistedAppSpec, err := appSpecStore.Read(filepath.Dir(store.Path()), expectedDefinition.AppSpecPath)
	if err != nil {
		t.Fatalf("read app spec after rollback: %v", err)
	}
	if persistedAppSpec != nil {
		t.Fatalf("expected app spec write to roll back, got %#v", persistedAppSpec)
	}
	_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("consume frontend ops: %v", err)
	}
	if len(ops.Pending) != 0 || len(ops.Completed) != 0 {
		t.Fatalf("expected failed frontend op to remain incomplete, got %#v", ops)
	}
}

func TestBackendRuntimeCompareAndSetChangedRebasesBlockedDeferredPersist(t *testing.T) {
	blockedSaveStarted := make(chan struct{}, 1)
	releaseBlockedSave := make(chan struct{})
	var blockDeferredSave atomic.Bool
	store, runtime := openPersistedBackendRuntimeTestProjectWithOptions(t, projectstate.RuntimeOptions{
		BeforeSave: func(_ context.Context, snapshot projectstate.Snapshot) error {
			if !blockDeferredSave.Load() || snapshot.Revision != 3 {
				return nil
			}
			select {
			case blockedSaveStarted <- struct{}{}:
			default:
			}
			<-releaseBlockedSave
			return nil
		},
	})
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	initialDefinition := AppDefinition{
		AppSpecVersion: "v1",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}
	expectedDefinition := initialDefinition
	expectedDefinition.AppSpecVersion = "v2"
	appSpec := map[string]any{
		"root": map[string]any{"key": "root", "type": "Stack"},
	}

	initialService := NewAppDefinitionService(runtime, pluginID)
	if _, _, err := initialService.SetAppDefinition(context.Background(), SetInput{
		AppSpec:        appSpec,
		AppSpecVersion: &initialDefinition.AppSpecVersion,
		CatalogID:      &initialDefinition.CatalogID,
		AppSpecPath:    &initialDefinition.AppSpecPath,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	blockDeferredSave.Store(true)
	if _, err := runtime.MutateAndPersistLater(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		next := document.Clone()
		next.Projects["project-alpha"] = backendRuntimeTestProject("Deferred Project")
		return next, nil
	}); err != nil {
		t.Fatalf("queue deferred persist: %v", err)
	}
	<-blockedSaveStarted

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointCompareAndSetSpecVersion {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}
			return CompareAndSetMutationResult{
				CompareResult: CompareAndSetStringResult{
					OldValue: "v1",
					NewValue: "v2",
				},
				AppSpec:       appSpec,
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	resultCh := make(chan error, 1)
	go func() {
		_, _, err := service.CompareAndSetAppDefinitionSpecVersion(
			context.Background(),
			"v2",
			backendRuntimeTestStringPointer("v1"),
		)
		resultCh <- err
	}()

	releaseBlockedSave <- struct{}{}
	if err := <-resultCh; err != nil {
		t.Fatalf("changed compare-and-set with blocked deferred persist: %v", err)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after compare-and-set: %v", err)
	}
	if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(persisted)); got.AppSpecVersion != "v2" {
		t.Fatalf("expected changed app definition %#v, got %#v", expectedDefinition, got)
	}
	if persisted.Projects["project-alpha"].Name != "Deferred Project" {
		t.Fatalf("expected deferred project state to remain merged, got %#v", persisted.Projects["project-alpha"].Name)
	}
}

func TestBackendRuntimeCompareAndSetRejectsStaleProviderPlan(t *testing.T) {
	store, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	owner := NewAppDefinitionService(runtime, pluginID)
	catalogID := appspec.DefaultCatalogID
	appSpecPath := appSpecStore.DefaultPath()
	v1 := "v1"
	v2 := "v2"
	v3 := "v3"

	seedBackendRuntimeTestAppDefinition(t, owner, catalogID, appSpecPath, v3)

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			t.Fatalf("provider should not be invoked after owner rejects stale expected value for %q", request.EndpointName)
			return nil, false, nil
		},
	})

	_, _, err := service.CompareAndSetAppDefinitionSpecVersion(
		projectstate.ContextWithFrontendOpID(context.Background(), "stale-cas-op"),
		v2,
		backendRuntimeTestStringPointer(v1),
	)
	if err == nil {
		t.Fatal("expected stale compare-and-set to fail")
	}
	var mismatch *projectstate.ExpectedOldValueMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected ExpectedOldValueMismatchError, got %T (%v)", err, err)
	}
	if mismatch.ExpectedOldValue != v1 || mismatch.ObservedOldValue != v3 {
		t.Fatalf("unexpected mismatch values %#v", mismatch)
	}

	assertBackendRuntimeTestPersistedAppDefinition(
		t,
		store,
		storage,
		appSpecStore,
		appSpecPath,
		v3,
		v3,
	)
	_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("consume frontend ops: %v", err)
	}
	if len(ops.Pending) != 0 || len(ops.Completed) != 0 {
		t.Fatalf("expected failed stale compare-and-set frontend op to remain incomplete, got %#v", ops)
	}
}

func TestBackendRuntimeReplansProviderMutationAgainstQueuedDocument(t *testing.T) {
	t.Helper()

	type mutationCase struct {
		name     string
		endpoint string
		run      func(Runtime, context.Context) (projectstate.Snapshot, MutationResult, error)
	}
	cases := []mutationCase{
		{
			name:     "set",
			endpoint: backendruntime.ListenerEndpointSetAppDefinition,
			run: func(service Runtime, ctx context.Context) (projectstate.Snapshot, MutationResult, error) {
				return service.SetAppDefinition(ctx, SetInput{
					AppSpec: backendRuntimeTestAppSpec("v2"),
				})
			},
		},
		{
			name:     "stream",
			endpoint: backendruntime.ListenerEndpointStreamAppDefinition,
			run: func(service Runtime, ctx context.Context) (projectstate.Snapshot, MutationResult, error) {
				return service.StreamAppDefinition(ctx, StreamInput{
					Patches: `{"op":"set","path":"/elements/heading/props/text","value":"v2"}`,
				})
			},
		},
		{
			name:     "update",
			endpoint: backendruntime.ListenerEndpointUpdateAppDefinition,
			run: func(service Runtime, ctx context.Context) (projectstate.Snapshot, MutationResult, error) {
				return service.UpdateAppDefinition(ctx, map[string]any{
					"elements": map[string]any{
						"heading": map[string]any{
							"props": map[string]any{
								"text": "v2",
							},
						},
					},
				})
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store, runtime := openPersistedBackendRuntimeTestProject(t)
			pluginID := "setta-json-render-app-gen"
			storage := MustStorageForPlugin(pluginID)
			appSpecStore := appspec.MustForPlugin(pluginID)
			owner := NewAppDefinitionService(runtime, pluginID)
			catalogID := appspec.DefaultCatalogID
			appSpecPath := appSpecStore.DefaultPath()
			v1 := "v1"
			v3 := "v3"

			seedBackendRuntimeTestAppDefinition(t, owner, catalogID, appSpecPath, v1)
			seedBackendRuntimeTestAppDefinition(t, owner, catalogID, appSpecPath, v3)

			providerDefinition := AppDefinition{
				AppSpecVersion: v1,
				CatalogID:      catalogID,
				AppSpecPath:    appSpecPath,
			}
			service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
				invoke: func(
					ctx context.Context,
					request plugins.BackendListenerEndpointRequest,
				) (any, bool, error) {
					if request.EndpointName != tc.endpoint {
						t.Fatalf("unexpected endpoint %q", request.EndpointName)
					}
					return MutationResult{
						AppSpec:       backendRuntimeTestAppSpec("provider-stale"),
						AppDefinition: &providerDefinition,
					}, true, nil
				},
			})

			snapshot, result, err := tc.run(service, context.Background())
			if err != nil {
				t.Fatalf("run provider-backed mutation: %v", err)
			}
			if result.AppDefinition == nil || result.AppDefinition.AppSpecVersion != v3 {
				t.Fatalf("expected committed result to preserve v3 definition, got %#v", result.AppDefinition)
			}
			if label := backendRuntimeTestAppSpecLabel(t, result.AppSpec); label != "v2" {
				t.Fatalf("expected committed result app spec v2, got %q", label)
			}
			if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(snapshot.Document)); got.AppSpecVersion != v3 {
				t.Fatalf("expected snapshot app definition to preserve v3, got %#v", got)
			}
			assertBackendRuntimeTestPersistedAppDefinition(
				t,
				store,
				storage,
				appSpecStore,
				appSpecPath,
				v3,
				"v2",
			)
		})
	}
}

func TestBackendRuntimeCompareAndSetChangedRollsBackAppSpecWhenHostPersistFails(t *testing.T) {
	store, runtime := openPersistedBackendRuntimeTestProjectWithOptions(t, projectstate.RuntimeOptions{
		BeforeSave: func(context.Context, projectstate.Snapshot) error {
			return errors.New("host persist failed")
		},
	})
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecStore.DefaultPath(),
	}

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointCompareAndSetSpecVersion {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}
			return CompareAndSetMutationResult{
				CompareResult: CompareAndSetStringResult{
					OldValue: "v1",
					NewValue: "v2",
				},
				AppSpec: map[string]any{
					"root": map[string]any{"key": "root", "type": "Stack"},
				},
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	_, _, err := service.CompareAndSetAppDefinitionSpecVersion(
		projectstate.ContextWithFrontendOpID(context.Background(), "failed-cas-op"),
		"v2",
		backendRuntimeTestStringPointer("v1"),
	)
	if err == nil || err.Error() != "host persist failed" {
		t.Fatalf("expected host persist failure, got %v", err)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after failed compare-and-set: %v", err)
	}
	if raw := storage.StoredDocumentAppDefinitionRaw(persisted); len(raw) != 0 {
		t.Fatalf("expected persisted app definition to remain unchanged, got %s", string(raw))
	}
	if raw := storage.StoredDocumentAppDefinitionRaw(runtime.Snapshot().Document); len(raw) != 0 {
		t.Fatalf("expected live app definition to roll back, got %s", string(raw))
	}
	appSpec, err := appSpecStore.Read(filepath.Dir(store.Path()), expectedDefinition.AppSpecPath)
	if err != nil {
		t.Fatalf("read app spec after rollback: %v", err)
	}
	if appSpec != nil {
		t.Fatalf("expected app spec write to roll back, got %#v", appSpec)
	}
	_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("consume frontend ops: %v", err)
	}
	if len(ops.Pending) != 0 || len(ops.Completed) != 0 {
		t.Fatalf("expected failed frontend op to remain incomplete, got %#v", ops)
	}
}

func TestBackendRuntimeRejectsInvalidProviderMutationResults(t *testing.T) {
	t.Helper()

	type mutationCase struct {
		name     string
		endpoint string
		run      func(Runtime, context.Context) error
	}
	cases := []mutationCase{
		{
			name:     "set app definition",
			endpoint: backendruntime.ListenerEndpointSetAppDefinition,
			run: func(service Runtime, ctx context.Context) error {
				version := "v2"
				catalogID := appspec.DefaultCatalogID
				_, _, err := service.SetAppDefinition(ctx, SetInput{
					AppSpec:        backendRuntimeTestAppSpec("v2"),
					AppSpecVersion: &version,
					CatalogID:      &catalogID,
				})
				return err
			},
		},
		{
			name:     "stream app definition",
			endpoint: backendruntime.ListenerEndpointStreamAppDefinition,
			run: func(service Runtime, ctx context.Context) error {
				_, _, err := service.StreamAppDefinition(ctx, StreamInput{
					Patches: `{"op":"set","path":"/elements/heading/props/text","value":"v2"}`,
				})
				return err
			},
		},
		{
			name:     "update app definition",
			endpoint: backendruntime.ListenerEndpointUpdateAppDefinition,
			run: func(service Runtime, ctx context.Context) error {
				_, _, err := service.UpdateAppDefinition(ctx, map[string]any{
					"elements": map[string]any{
						"heading": map[string]any{
							"props": map[string]any{
								"text": "v2",
							},
						},
					},
				})
				return err
			},
		},
		{
			name:     "changed compare-and-set",
			endpoint: backendruntime.ListenerEndpointCompareAndSetSpecVersion,
			run: func(service Runtime, ctx context.Context) error {
				_, _, err := service.CompareAndSetAppDefinitionSpecVersion(
					ctx,
					"v2",
					backendRuntimeTestStringPointer("v1"),
				)
				return err
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store, runtime := openPersistedBackendRuntimeTestProject(t)
			pluginID := "setta-json-render-app-gen"
			storage := MustStorageForPlugin(pluginID)
			appSpecStore := appspec.MustForPlugin(pluginID)
			definition := AppDefinition{
				AppSpecVersion: "v2",
				CatalogID:      appspec.DefaultCatalogID,
				AppSpecPath:    appSpecStore.DefaultPath(),
			}
			invalidAppSpec := backendRuntimeInvalidMultiRunAppSpec()
			seedBackendRuntimeTestAppDefinition(
				t,
				NewAppDefinitionService(runtime, pluginID),
				appspec.DefaultCatalogID,
				appSpecStore.DefaultPath(),
				"v1",
			)

			service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
				invoke: func(
					ctx context.Context,
					request plugins.BackendListenerEndpointRequest,
				) (any, bool, error) {
					if request.EndpointName != tc.endpoint {
						t.Fatalf("unexpected endpoint %q", request.EndpointName)
					}
					if tc.endpoint == backendruntime.ListenerEndpointCompareAndSetSpecVersion {
						return CompareAndSetMutationResult{
							CompareResult: CompareAndSetStringResult{
								OldValue: "v1",
								NewValue: "v2",
							},
							AppSpec:       invalidAppSpec,
							AppDefinition: &definition,
						}, true, nil
					}
					return MutationResult{
						AppSpec:       invalidAppSpec,
						AppDefinition: &definition,
					}, true, nil
				},
			})

			err := tc.run(
				service,
				projectstate.ContextWithFrontendOpID(context.Background(), "invalid-provider-op"),
			)
			if err == nil || !strings.Contains(err.Error(), "can only include one run action") {
				t.Fatalf("expected invalid provider app spec error, got %v", err)
			}

			persisted, err := store.Load(context.Background())
			if err != nil {
				t.Fatalf("load persisted document after invalid mutation: %v", err)
			}
			if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(persisted)); got.AppSpecVersion != "v1" {
				t.Fatalf("expected persisted app definition to remain at v1, got %#v", got)
			}
			if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(runtime.Snapshot().Document)); got.AppSpecVersion != "v1" {
				t.Fatalf("expected live app definition to remain at v1, got %#v", got)
			}
			appSpec, err := appSpecStore.Read(filepath.Dir(store.Path()), definition.AppSpecPath)
			if err != nil {
				t.Fatalf("read app spec after invalid mutation: %v", err)
			}
			if label := backendRuntimeTestAppSpecLabel(t, appSpec); label != "v1" {
				t.Fatalf("expected invalid app spec write to be skipped, got %q", label)
			}
			_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
			if err != nil {
				t.Fatalf("consume frontend ops: %v", err)
			}
			if len(ops.Pending) != 0 || len(ops.Completed) != 0 {
				t.Fatalf("expected failed frontend op to remain incomplete, got %#v", ops)
			}
		})
	}
}

func TestBackendRuntimeMapsExpectedOldValueMismatch(t *testing.T) {
	t.Helper()

	_, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "setta-json-render-app-gen"
	appSpecPath := appspec.MustForPlugin(pluginID).DefaultPath()
	catalogOld := appspec.DefaultCatalogID
	version := "v1"
	if _, _, err := NewAppDefinitionService(runtime, pluginID).SetAppDefinition(context.Background(), SetInput{
		AppSpec:        backendRuntimeTestAppSpec("v1"),
		AppSpecPath:    &appSpecPath,
		AppSpecVersion: &version,
		CatalogID:      &catalogOld,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}
	service := NewBackendRuntime(runtime, "setta-json-render-app-gen", backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			return nil, true, &plugins.BackendRuntimeError{
				Code:    backendruntime.ErrorCodeExpectedOldValueMismatch,
				Message: "stale app definition metadata",
				Details: map[string]any{
					"settingId":        "core.app.catalog_id",
					"expectedOldValue": "catalog-old",
					"observedOldValue": "catalog-new",
				},
			}
		},
	})

	_, _, err := service.CompareAndSetAppDefinitionCatalogID(
		context.Background(),
		catalogOld,
		backendRuntimeTestStringPointer(catalogOld),
	)
	if err == nil {
		t.Fatal("expected compare-and-set mismatch error")
	}

	var mismatch *projectstate.ExpectedOldValueMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected ExpectedOldValueMismatchError, got %T (%v)", err, err)
	}
	if mismatch.SettingID != "core.app.catalog_id" {
		t.Fatalf("unexpected mismatch error %#v", mismatch)
	}
	if mismatch.ExpectedOldValue != "catalog-old" || mismatch.ObservedOldValue != "catalog-new" {
		t.Fatalf("unexpected mismatch values %#v", mismatch)
	}
}

func TestBackendRuntimeCompareAndSetNoopCompletesFrontendOpID(t *testing.T) {
	_, runtime := openPersistedBackendRuntimeTestProject(t)
	service := NewBackendRuntime(runtime, "setta-json-render-app-gen", backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			return CompareAndSetMutationResult{
				CompareResult: CompareAndSetStringResult{
					OldValue: "v1",
					NewValue: "v1",
				},
			}, true, nil
		},
	})

	before := runtime.Snapshot()
	snapshot, result, err := service.CompareAndSetAppDefinitionSpecVersion(
		projectstate.ContextWithFrontendOpID(context.Background(), "backend-noop-op"),
		"v1",
		backendRuntimeTestStringPointer("v1"),
	)
	if err != nil {
		t.Fatalf("backend no-op compare-and-set: %v", err)
	}
	if result.OldValue != "v1" || result.NewValue != "v1" {
		t.Fatalf("unexpected no-op result %#v", result)
	}
	if snapshot.Revision != before.Revision {
		t.Fatalf("expected no-op revision %d, got %d", before.Revision, snapshot.Revision)
	}

	_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("consume frontend ops: %v", err)
	}
	if len(ops.Pending) != 0 || len(ops.Completed) != 1 || ops.Completed[0] != "backend-noop-op" {
		t.Fatalf("expected completed backend no-op frontend op, got %#v", ops)
	}
}

func TestBackendRuntimeScopesInvocationsToProviderPluginID(t *testing.T) {
	_, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "acme-app-provider"
	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.PluginID != pluginID {
				t.Fatalf("expected provider plugin id %q, got %#v", pluginID, request.PluginID)
			}
			if request.EndpointName != backendruntime.ListenerEndpointGetAppDefinition {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}
			return ReadResult{}, true, nil
		},
	})

	if _, err := service.GetAppDefinition(context.Background()); err != nil {
		t.Fatalf("get app definition: %v", err)
	}
}

type backendRuntimeInvokerStub struct {
	invoke func(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error)
}

func (s backendRuntimeInvokerStub) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request plugins.BackendListenerEndpointRequest,
) (any, bool, error) {
	if s.invoke == nil {
		return nil, false, nil
	}
	return s.invoke(ctx, request)
}

func openPersistedBackendRuntimeTestProject(t *testing.T) (*projectstate.Store, *projectstate.Runtime) {
	t.Helper()

	return openPersistedBackendRuntimeTestProjectWithOptions(t, projectstate.RuntimeOptions{})
}

func openPersistedBackendRuntimeTestProjectWithOptions(
	t *testing.T,
	options projectstate.RuntimeOptions,
) (*projectstate.Store, *projectstate.Runtime) {
	t.Helper()

	store, err := projectstate.NewStore(
		filepath.Join(t.TempDir(), projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), projectstate.NewDocument()); err != nil {
		t.Fatalf("save project store: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(
		context.Background(),
		store,
		options,
	)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return store, runtime
}

func backendRuntimeTestProject(name string) projectstate.Project {
	windowing := projectstate.DefaultProjectChatWindowingState()
	return projectstate.Project{
		ID:                   "project-alpha",
		Name:                 name,
		ProjectChatWindowing: &windowing,
	}
}

func mustMarshalBackendRuntimeTestDefinition(t *testing.T, definition AppDefinition) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(definition)
	if err != nil {
		t.Fatalf("marshal app definition: %v", err)
	}
	return projectstate.RawJSON(encoded)
}

func mustDecodeBackendRuntimeTestDefinition(t *testing.T, raw projectstate.RawJSON) AppDefinition {
	t.Helper()

	var definition AppDefinition
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode app definition: %v", err)
	}
	return definition
}

func backendRuntimeTestStringPointer(value string) *string {
	return &value
}

func backendRuntimeInvalidMultiRunAppSpec() map[string]any {
	return map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"children": []any{
				map[string]any{
					"key":  "run-1",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				map[string]any{
					"key":  "run-2",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run again",
						"action": "run",
					},
				},
			},
		},
		"elements": map[string]any{},
	}
}

func backendRuntimeTestAppSpec(label string) map[string]any {
	return map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{
				"key":      "root",
				"type":     "Stack",
				"children": []any{"heading"},
			},
			"heading": map[string]any{
				"key":  "heading",
				"type": "Heading",
				"props": map[string]any{
					"text": label,
				},
			},
		},
	}
}

func seedBackendRuntimeTestAppDefinition(
	t *testing.T,
	owner Runtime,
	catalogID string,
	appSpecPath string,
	version string,
) {
	t.Helper()

	if _, _, err := owner.SetAppDefinition(context.Background(), SetInput{
		AppSpec:        backendRuntimeTestAppSpec(version),
		AppSpecVersion: &version,
		CatalogID:      &catalogID,
		AppSpecPath:    &appSpecPath,
	}); err != nil {
		t.Fatalf("seed app definition %q: %v", version, err)
	}
}

func assertBackendRuntimeTestPersistedAppDefinition(
	t *testing.T,
	store *projectstate.Store,
	storage DocumentStorage,
	appSpecStore appspec.Store,
	appSpecPath string,
	wantVersion string,
	wantAppSpecLabel string,
) {
	t.Helper()

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if got := mustDecodeBackendRuntimeTestDefinition(t, storage.StoredDocumentAppDefinitionRaw(persisted)); got.AppSpecVersion != wantVersion {
		t.Fatalf("expected persisted app definition version %q, got %#v", wantVersion, got)
	}
	appSpec, err := appSpecStore.Read(filepath.Dir(store.Path()), appSpecPath)
	if err != nil {
		t.Fatalf("read persisted app spec: %v", err)
	}
	if label := backendRuntimeTestAppSpecLabel(t, appSpec); label != wantAppSpecLabel {
		t.Fatalf("expected persisted app spec label %q, got %q", wantAppSpecLabel, label)
	}
}

func backendRuntimeTestAppSpecLabel(t *testing.T, appSpec any) string {
	t.Helper()

	appSpecObject, ok := appSpec.(map[string]any)
	if !ok {
		t.Fatalf("expected app spec object, got %#v", appSpec)
	}
	elements, ok := appSpecObject["elements"].(map[string]any)
	if !ok {
		t.Fatalf("expected app spec elements object, got %#v", appSpecObject["elements"])
	}
	heading, ok := elements["heading"].(map[string]any)
	if !ok {
		t.Fatalf("expected heading element object, got %#v", elements["heading"])
	}
	props, ok := heading["props"].(map[string]any)
	if !ok {
		t.Fatalf("expected heading props object, got %#v", heading["props"])
	}
	label, ok := props["text"].(string)
	if !ok {
		t.Fatalf("expected heading text string, got %#v", props["text"])
	}
	return label
}
