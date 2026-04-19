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
		projectstate.RuntimeOptions{},
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
