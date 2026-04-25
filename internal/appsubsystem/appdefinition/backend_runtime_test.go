package appdefinition

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

func TestBackendRuntimeSetAppDefinitionSyncsPersistedState(t *testing.T) {
	t.Helper()

	store, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      "catalog-next",
		AppSpecPath:    "frontend/custom.json",
	}

	service := NewBackendRuntime(runtime, pluginID, backendRuntimeInvokerStub{
		invoke: func(
			ctx context.Context,
			request plugins.BackendListenerEndpointRequest,
		) (any, bool, error) {
			if request.EndpointName != backendruntime.ListenerEndpointSetAppDefinition {
				t.Fatalf("unexpected endpoint %q", request.EndpointName)
			}

			document, err := store.Load(context.Background())
			if err != nil {
				t.Fatalf("load persisted document: %v", err)
			}
			document = storage.WithStoredDocumentAppDefinition(
				document,
				mustMarshalBackendRuntimeTestDefinition(t, expectedDefinition),
			)
			if err := store.Save(context.Background(), document); err != nil {
				t.Fatalf("save persisted document: %v", err)
			}

			return MutationResult{
				AppSpec: map[string]any{
					"root": map[string]any{"key": "root", "type": "Stack"},
				},
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	snapshot, result, err := service.SetAppDefinition(context.Background(), SetInput{
		AppSpec: map[string]any{
			"root": map[string]any{"key": "root", "type": "Stack"},
		},
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
}

func TestBackendRuntimeSetAppDefinitionPreservesNewerLiveProjectState(t *testing.T) {
	store, runtime := openPersistedBackendRuntimeTestProject(t)
	pluginID := "setta-json-render-app-gen"
	storage := MustStorageForPlugin(pluginID)
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      "catalog-next",
		AppSpecPath:    "frontend/custom.json",
	}

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

			document, err := store.Load(context.Background())
			if err != nil {
				t.Fatalf("load persisted document: %v", err)
			}
			document = storage.WithStoredDocumentAppDefinition(
				document,
				mustMarshalBackendRuntimeTestDefinition(t, expectedDefinition),
			)
			if err := store.Save(context.Background(), document); err != nil {
				t.Fatalf("save persisted document: %v", err)
			}

			return MutationResult{
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	snapshot, _, err := service.SetAppDefinition(context.Background(), SetInput{})
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
	expectedDefinition := AppDefinition{
		AppSpecVersion: "v2",
		CatalogID:      "catalog-next",
		AppSpecPath:    "frontend/custom.json",
	}

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

			document, err := store.Load(context.Background())
			if err != nil {
				t.Fatalf("load persisted document: %v", err)
			}
			document = storage.WithStoredDocumentAppDefinition(
				document,
				mustMarshalBackendRuntimeTestDefinition(t, expectedDefinition),
			)
			if err := store.Save(context.Background(), document); err != nil {
				t.Fatalf("save persisted document: %v", err)
			}

			return MutationResult{
				AppDefinition: &expectedDefinition,
			}, true, nil
		},
	})

	resultCh := make(chan error, 1)
	go func() {
		_, _, err := service.SetAppDefinition(context.Background(), SetInput{})
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

func TestBackendRuntimeMapsExpectedOldValueMismatch(t *testing.T) {
	t.Helper()

	_, runtime := openPersistedBackendRuntimeTestProject(t)
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
		"catalog-next",
		backendRuntimeTestStringPointer("catalog-old"),
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
			return projectstate.CompareAndSetResult[string]{
				OldValue: "v1",
				NewValue: "v1",
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
