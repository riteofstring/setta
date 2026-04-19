package appsubsystem

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/deployments"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

const providerTestPluginID = "setta-json-render-app-gen"

func TestBuildScopedUISettingEntriesUsesBackendRuntime(t *testing.T) {
	t.Helper()

	store, runtime, settaFilesRoot := openProviderTestRuntime(t, projectstate.NewDocument())
	storage := appdefinition.MustStorageForPlugin(providerTestPluginID)
	requestedEndpoints := []string{}

	entries, err := BuildScopedUISettingEntries(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:      providerTestPluginID,
			PluginEnabled: true,
		},
		runtime,
		providerTestBackendInvoker{
			invoke: func(
				ctx context.Context,
				request plugins.BackendListenerEndpointRequest,
			) (any, bool, error) {
				requestedEndpoints = append(requestedEndpoints, request.EndpointName)
				switch request.EndpointName {
				case "appsubsystem_get_effective_app_definition":
					return appdefinition.AppDefinition{
						CatalogID:      "catalog-a",
						AppSpecVersion: "v1",
						AppSpecPath:    "frontend/app.json",
					}, true, nil
				case "appsubsystem_get_effective_app_spec_path":
					return "frontend/app.json", true, nil
				case "appsubsystem_get_effective_app_theme_mode":
					return "light", true, nil
				case "appsubsystem_compare_and_set_catalog_id":
					document, err := store.Load(context.Background())
					if err != nil {
						t.Fatalf("load persisted document: %v", err)
					}
					document = storage.WithStoredDocumentAppDefinition(
						document,
						mustMarshalProviderTestDefinition(t, appdefinition.AppDefinition{
							CatalogID:      "catalog-b",
							AppSpecVersion: "v1",
							AppSpecPath:    "frontend/app.json",
						}),
					)
					if err := store.Save(context.Background(), document); err != nil {
						t.Fatalf("save persisted document: %v", err)
					}
					return projectstate.CompareAndSetResult[string]{
						OldValue: "catalog-a",
						NewValue: "catalog-b",
					}, true, nil
				default:
					t.Fatalf("unexpected UI settings endpoint %q", request.EndpointName)
					return nil, false, nil
				}
			},
		},
	)
	if err != nil {
		t.Fatalf("build scoped UI setting entries: %v", err)
	}

	catalogEntry := providerTestRuntimeEntryByID(t, entries, "core.app.catalog_id")
	value, err := catalogEntry.ReadValue(context.Background(), "project-alpha")
	if err != nil {
		t.Fatalf("read catalog ui setting: %v", err)
	}
	if value != "catalog-a" {
		t.Fatalf("expected catalog-a, got %#v", value)
	}

	result, err := catalogEntry.WriteValue(
		context.Background(),
		"project-alpha",
		"catalog-b",
		"catalog-a",
	)
	if err != nil {
		t.Fatalf("write catalog ui setting: %v", err)
	}
	if !result.Changed || result.NewValue != "catalog-b" {
		t.Fatalf("unexpected mutation result %#v", result)
	}

	live := mustDecodeProviderTestDefinition(
		t,
		storage.StoredDocumentAppDefinitionRaw(runtime.Snapshot().Document),
	)
	if live.CatalogID != "catalog-b" {
		t.Fatalf("expected runtime catalog sync, got %#v", live)
	}
	if !slices.Contains(requestedEndpoints, "appsubsystem_get_effective_app_definition") ||
		!slices.Contains(requestedEndpoints, "appsubsystem_compare_and_set_catalog_id") {
		t.Fatalf("expected backend adapter endpoints, got %#v", requestedEndpoints)
	}
	if _, err := os.Stat(filepath.Join(settaFilesRoot, projectstate.MainFileName)); err != nil {
		t.Fatalf("expected persisted project state at %s: %v", settaFilesRoot, err)
	}
}

func TestNewAppPublishServiceUsesBackendValidationRuntime(t *testing.T) {
	t.Helper()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	storage := appdefinition.MustStorageForPlugin(providerTestPluginID)
	initialDefinition := appdefinition.AppDefinition{
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecVersion: "v1",
		AppSpecPath:    appspec.MustForPlugin(providerTestPluginID).DefaultPath(),
	}
	initialDocument := storage.WithStoredDocumentAppDefinition(
		projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": {
					ID:   "project-alpha",
					Name: "Alpha",
				},
			},
		},
		mustMarshalProviderTestDefinition(t, initialDefinition),
	)
	_, runtime, _ := openProviderTestRuntimeAtRoot(t, settaFilesRoot, initialDocument)

	if err := appspec.MustForPlugin(providerTestPluginID).Write(
		settaFilesRoot,
		initialDefinition.AppSpecPath,
		map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
		},
	); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	catalogRoot, err := deployments.DefaultCatalogRoot(settaFilesRoot)
	if err != nil {
		t.Fatalf("default catalog root: %v", err)
	}
	catalog, err := deployments.NewCatalog(deployments.CatalogOptions{Root: catalogRoot})
	if err != nil {
		t.Fatalf("new deployment catalog: %v", err)
	}

	providerSourcePath := filepath.Join(t.TempDir(), "provider-plugin")
	if err := os.MkdirAll(providerSourcePath, 0o755); err != nil {
		t.Fatalf("mkdir provider source path: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(providerSourcePath, "setta.plugin.json"),
		[]byte("{\"id\":\"setta-json-render-app-gen\"}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write provider manifest: %v", err)
	}

	requestedEndpoints := []string{}
	publisher, err := NewAppPublishService(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:             providerTestPluginID,
			PluginEnabled:        true,
			AppDeploymentRuntime: true,
		},
		deployments.AppPublisherOptions{
			Catalog:          catalog,
			SettaFilesRoot:   settaFilesRoot,
			WorkspaceRoot:    workspaceRoot,
			PluginSourcePath: providerSourcePath,
			Now: func() time.Time {
				return time.Date(2026, time.April, 22, 12, 0, 0, 0, time.UTC)
			},
		},
		runtime,
		providerTestBackendInvoker{
			invoke: func(
				ctx context.Context,
				request plugins.BackendListenerEndpointRequest,
			) (any, bool, error) {
				requestedEndpoints = append(requestedEndpoints, request.EndpointName)
				if request.EndpointName != "appsubsystem_validate_app_definition" {
					t.Fatalf("unexpected publish endpoint %q", request.EndpointName)
				}
				return appdefinition.ValidationResult{}, true, nil
			},
		},
	)
	if err != nil {
		t.Fatalf("new app publish service: %v", err)
	}

	result, err := publisher.Publish(context.Background(), deployments.AppPublishRequest{
		DeploymentName: "demo-app",
		ProjectID:      "project-alpha",
		ProjectState:   runtime,
	})
	if err != nil {
		t.Fatalf("publish app deployment: %v", err)
	}
	if result.Manifest.DeploymentType != deployments.TypeApp {
		t.Fatalf("expected app deployment type, got %#v", result.Manifest)
	}
	if !slices.Equal(requestedEndpoints, []string{"appsubsystem_validate_app_definition"}) {
		t.Fatalf("expected validate endpoint only, got %#v", requestedEndpoints)
	}
}

type providerTestBackendInvoker struct {
	invoke func(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error)
}

func (s providerTestBackendInvoker) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request plugins.BackendListenerEndpointRequest,
) (any, bool, error) {
	if s.invoke == nil {
		return nil, false, nil
	}
	return s.invoke(ctx, request)
}

func openProviderTestRuntime(
	t *testing.T,
	document projectstate.Document,
) (*projectstate.Store, *projectstate.Runtime, string) {
	t.Helper()
	return openProviderTestRuntimeAtRoot(t, t.TempDir(), document)
}

func openProviderTestRuntimeAtRoot(
	t *testing.T,
	settaFilesRoot string,
	document projectstate.Document,
) (*projectstate.Store, *projectstate.Runtime, string) {
	t.Helper()

	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), document); err != nil {
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
	return store, runtime, settaFilesRoot
}

func providerTestRuntimeEntryByID(
	t *testing.T,
	entries []uisettings.RuntimeEntry,
	settingID string,
) uisettings.RuntimeEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.Metadata.SettingID == settingID {
			return entry
		}
	}
	t.Fatalf("missing runtime entry %q", settingID)
	return uisettings.RuntimeEntry{}
}

func mustMarshalProviderTestDefinition(
	t *testing.T,
	definition appdefinition.AppDefinition,
) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(definition)
	if err != nil {
		t.Fatalf("marshal app definition: %v", err)
	}
	return projectstate.RawJSON(encoded)
}

func mustDecodeProviderTestDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	t.Helper()

	var definition appdefinition.AppDefinition
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode app definition: %v", err)
	}
	return definition
}
