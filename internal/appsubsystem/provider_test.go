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
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

const providerTestPluginID = "setta-json-render-app-gen"

func TestBuildScopedUISettingEntriesUsesBackendRuntime(t *testing.T) {
	t.Helper()

	_, runtime, settaFilesRoot := openProviderTestRuntime(t, projectstate.NewDocument())
	storage := appdefinition.MustStorageForPlugin(providerTestPluginID)
	defaultAppSpecPath := appspec.MustForPlugin(providerTestPluginID).DefaultPath()
	requestedEndpoints := []string{}

	entries, err := BuildScopedUISettingEntries(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:       providerTestPluginID,
			PluginEnabled:  true,
			AppAuthoringUI: true,
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
						AppSpecPath:    defaultAppSpecPath,
					}, true, nil
				case "appsubsystem_get_app_definition":
					return appdefinition.ReadResult{
						AppDefinition: &appdefinition.AppDefinition{
							CatalogID:      "catalog-b",
							AppSpecVersion: "v1",
							AppSpecPath:    defaultAppSpecPath,
						},
					}, true, nil
				case "appsubsystem_get_effective_app_spec_path":
					return defaultAppSpecPath, true, nil
				case "appsubsystem_get_effective_app_theme_mode":
					return "light", true, nil
				case "appsubsystem_compare_and_set_catalog_id":
					return appdefinition.CompareAndSetMutationResult{
						CompareResult: appdefinition.CompareAndSetStringResult{
							OldValue: "catalog-a",
							NewValue: "catalog-b",
						},
						AppSpec: map[string]any{
							"root": map[string]any{
								"key":  "root",
								"type": "Stack",
							},
							"elements": map[string]any{},
						},
						AppDefinition: &appdefinition.AppDefinition{
							CatalogID:      "catalog-b",
							AppSpecVersion: "v1",
							AppSpecPath:    defaultAppSpecPath,
						},
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

func TestBuildScopedUISettingEntriesRequiresAppAuthoringUI(t *testing.T) {
	_, runtime, _ := openProviderTestRuntime(t, projectstate.NewDocument())

	entries, err := BuildScopedUISettingEntries(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:      providerTestPluginID,
			PluginEnabled: true,
		},
		runtime,
		providerTestBackendInvoker{},
	)
	if err != nil {
		t.Fatalf("build scoped ui setting entries without app authoring ui: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no app ui settings without app authoring ui capability, got %#v", entries)
	}
}

func TestBuildMCPToolRegistrationsFollowAppSubsystemFeatureBits(t *testing.T) {
	_, runtime, _ := openProviderTestRuntime(t, projectstate.NewDocument())

	catalogOnly, err := BuildMCPToolRegistrations(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:               providerTestPluginID,
			PluginEnabled:          true,
			AppGenerationChatModes: true,
			AppAuthoringUI:         false,
			AppDeploymentRuntime:   false,
			AppPreviewUI:           false,
		},
		runtime,
		providerTestBackendInvoker{},
	)
	if err != nil {
		t.Fatalf("build catalog-only mcp tool registrations: %v", err)
	}
	if !slices.Equal(providerTestToolNames(catalogOnly), []string{
		"get_app_catalog",
		"list_app_components",
	}) {
		t.Fatalf("expected only app generation catalog tools, got %#v", providerTestToolNames(catalogOnly))
	}

	noTools, err := BuildMCPToolRegistrations(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:      providerTestPluginID,
			PluginEnabled: true,
		},
		runtime,
		providerTestBackendInvoker{},
	)
	if err != nil {
		t.Fatalf("build empty mcp tool registrations: %v", err)
	}
	if len(noTools) != 0 {
		t.Fatalf("expected no app subsystem tools without feature bits, got %#v", noTools)
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

	requestedEndpoints := []string{}
	packagedTargets := []string{}
	publisher, err := NewAppPublishService(
		plugins.PluginAppSubsystemCapabilities{
			PluginID:             providerTestPluginID,
			PluginEnabled:        true,
			AppDeploymentRuntime: true,
		},
		deployments.AppPublisherOptions{
			Catalog:        catalog,
			SettaFilesRoot: settaFilesRoot,
			WorkspaceRoot:  workspaceRoot,
			PackageProviderPlugin: func(targetRoot string) (deployments.AppProviderPackageState, error) {
				packagedTargets = append(packagedTargets, targetRoot)
				if err := os.MkdirAll(targetRoot, 0o755); err != nil {
					return deployments.AppProviderPackageState{}, err
				}
				if err := os.WriteFile(filepath.Join(targetRoot, "packaged.txt"), []byte("packaged\n"), 0o644); err != nil {
					return deployments.AppProviderPackageState{}, err
				}
				return deployments.AppProviderPackageState{
					EnabledPluginIDs: []string{providerTestPluginID},
					PluginConfigByID: map[string]any{},
				}, nil
			},
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
	if len(packagedTargets) != 1 {
		t.Fatalf("expected provider packager to run once, got %#v", packagedTargets)
	}
	if _, err := os.Stat(filepath.Join(packagedTargets[0], "packaged.txt")); err != nil {
		t.Fatalf("expected provider packager output: %v", err)
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

func providerTestToolNames(registrations []mcpx.ToolRegistration) []string {
	names := make([]string, 0, len(registrations))
	for _, registration := range registrations {
		names = append(names, registration.Spec.Name)
	}
	return names
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
