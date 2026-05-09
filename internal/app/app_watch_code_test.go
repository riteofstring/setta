package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/watchcodecontracts"
)

func TestAppIDEStartupSyncsWatchCodeServiceFromSavedProjectState(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
		Folders: []projectstate.WatchCodeFolder{
			{Path: "pkg", Recursive: true},
		},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}
	writeAppGeneratedPythonCodeFixture(t, cfg, "Alpha")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCodeRef.Current() == nil {
		t.Fatal("expected IDE app to start watch code service")
	}

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	watchFile := filepath.Join(watchDir, "watch.py")
	if err := os.WriteFile(watchFile, []byte("def watch(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-alpha", "pkg.watch.watch:function", watchFile)
}

func TestAppIDEStartupSkipsWatchCodeServiceWithoutProvider(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}
	writeAppGeneratedPythonCodeFixture(t, cfg, "Alpha")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect IDE app without watch code provider to start watch code service")
	}
	snapshot := app.ProjectStates().Main().Snapshot()
	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) {
		t.Fatalf("expected existing watch code project data to remain readable, got %#v", projectData)
	}
}

func TestAppPluginEnableStartsWatchCodeService(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)
	writeDisabledAppPluginState(t, cfg, testAppWatchCodeProviderPluginID)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}
	writeAppGeneratedPythonCodeFixture(t, cfg, "Alpha")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect disabled watch code provider to start the service")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	postAppPluginLifecycle(t, app, server.URL, httpapi.RoutePluginsEnable, `{"pluginId":"`+testAppWatchCodeProviderPluginID+`"}`)

	if app.watchCodeRef.Current() == nil {
		t.Fatal("expected enabling the provider to start the watch code service")
	}

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	watchFile := filepath.Join(watchDir, "watch.py")
	if err := os.WriteFile(watchFile, []byte("def watch(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-alpha", "pkg.watch.watch:function", watchFile)
}

func TestAppWatchCodeProviderChangeReplacesRunningService(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	const providerPluginID = "setta-watch-code"
	const alternateProviderID = "alternate-watch-code"
	installAppRepoPlugin(t, cfg, providerPluginID)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	for _, providerID := range []string{providerPluginID, alternateProviderID} {
		setAppWatchCodePluginProjectDataForProvider(t, &document, providerID, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"pkg/watch.py"},
		})
	}
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}
	writeAppGeneratedPythonCodeFixture(t, cfg, "Alpha")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	initialService := app.watchCodeRef.Current()
	if initialService == nil {
		t.Fatal("expected active Watch Code provider to start service")
	}
	if providerID := app.watchCodeRef.CurrentProviderID(); providerID != providerPluginID {
		t.Fatalf("expected initial provider %q, got %q", providerPluginID, providerID)
	}

	app.pluginRuntime.watchCodeCapabilities.Set(plugins.PluginWatchCodeCapabilities{
		PluginID:      alternateProviderID,
		PluginEnabled: true,
		Python:        true,
		ProviderSelection: &plugins.PluginWatchCodeProviderSelection{
			Status:           plugins.PluginWatchCodeProviderSelectionStatusActive,
			SelectedPluginID: stringPointer(alternateProviderID),
			ActivePluginIDs:  []string{alternateProviderID},
		},
	})
	if err := app.pluginRuntime.reconcileWatchCodeService(context.Background()); err != nil {
		t.Fatalf("reconcile watch code service after provider change: %v", err)
	}
	if nextService := app.watchCodeRef.Current(); nextService == nil || nextService == initialService {
		t.Fatalf("expected provider change to replace service, initial=%p next=%p", initialService, nextService)
	}
	if providerID := app.watchCodeRef.CurrentProviderID(); providerID != alternateProviderID {
		t.Fatalf("expected provider %q after change, got %q", alternateProviderID, providerID)
	}
}

func TestAppPluginDisableStopsWatchCodeServiceAndPreservesData(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
		Folders: []projectstate.WatchCodeFolder{
			{Path: "pkg", Recursive: true},
		},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}
	writeAppGeneratedPythonCodeFixture(t, cfg, "Alpha")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() == nil {
		t.Fatal("expected active watch code provider to start the service")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	postAppPluginLifecycle(t, app, server.URL, httpapi.RoutePluginsDisable, `{"pluginId":"`+testAppWatchCodeProviderPluginID+`"}`)

	if app.watchCodeRef.Current() != nil {
		t.Fatal("expected disabling the provider to stop the watch code service")
	}
	projectData := readAppWatchCodePluginProjectData(t, app.ProjectStates().Main().Snapshot().Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) ||
		!reflect.DeepEqual(projectData.Folders, []projectstate.WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected disabling provider to preserve plugin data, got %#v", projectData)
	}
}

func TestAppPluginUninstallStopsWatchCodeServiceAndPreservesData(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
		Folders: []projectstate.WatchCodeFolder{
			{Path: "pkg", Recursive: true},
		},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}
	writeAppGeneratedPythonCodeFixture(t, cfg, "Alpha")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() == nil {
		t.Fatal("expected active watch code provider to start the service")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)
	postAppPluginLifecycle(t, app, server.URL, httpapi.RoutePluginsUninstall, `{"pluginId":"`+testAppWatchCodeProviderPluginID+`","scope":"workspace"}`)

	if app.watchCodeRef.Current() != nil {
		t.Fatal("expected uninstalling the provider to stop the watch code service")
	}
	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request after watch code provider uninstall: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)
	runtimeHTTPResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after watch code provider uninstall: %v", err)
	}
	defer runtimeHTTPResponse.Body.Close()
	if runtimeHTTPResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(runtimeHTTPResponse.Body)
		t.Fatalf("expected plugin runtime 200 after watch code provider uninstall, got %d with body %q", runtimeHTTPResponse.StatusCode, string(payload))
	}
	var runtimeResponse plugins.PluginRuntimeResponse
	if err := json.NewDecoder(runtimeHTTPResponse.Body).Decode(&runtimeResponse); err != nil {
		t.Fatalf("decode plugin runtime after watch code provider uninstall: %v", err)
	}
	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected uninstalled watch code provider to be unavailable, got %#v", watchCode)
	}
	if watchCode.ProviderSelection == nil ||
		watchCode.ProviderSelection.Status != plugins.PluginWatchCodeProviderSelectionStatusNoProvider {
		t.Fatalf("expected no watch code provider selection after uninstall, got %#v", watchCode.ProviderSelection)
	}
	backendRouteRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api/plugins/"+testAppWatchCodeProviderPluginID+"/watch-code/inputs",
		strings.NewReader(`{"projectConfigId":"project-alpha","folders":[],"files":[]}`),
	)
	if err != nil {
		t.Fatalf("new watch code backend route request after uninstall: %v", err)
	}
	backendRouteRequest.Header.Set("Content-Type", "application/json")
	backendRouteRequest.AddCookie(authCookie)
	backendRouteResponse, err := http.DefaultClient.Do(backendRouteRequest)
	if err != nil {
		t.Fatalf("post watch code backend route after uninstall: %v", err)
	}
	defer backendRouteResponse.Body.Close()
	if backendRouteResponse.StatusCode != http.StatusNotFound {
		payload, _ := io.ReadAll(backendRouteResponse.Body)
		t.Fatalf("expected watch code backend route to disappear after uninstall, got %d with body %q", backendRouteResponse.StatusCode, string(payload))
	}
	projectData := readAppWatchCodePluginProjectData(t, app.ProjectStates().Main().Snapshot().Document, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) ||
		!reflect.DeepEqual(projectData.Folders, []projectstate.WatchCodeFolder{{Path: "pkg", Recursive: true}}) {
		t.Fatalf("expected uninstalling provider to preserve plugin data, got %#v", projectData)
	}
}

func TestAppSetWatchCodeCoreRouteIsAbsent(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect watch code service without provider")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api/setWatchCodeEnabled",
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post old set watch code route: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.StatusCode, string(body))
	}
	if !strings.Contains(string(body), `"code":"not_found"`) {
		t.Fatalf("expected not_found response, got %q", string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if !projectData.IsEmpty() {
		t.Fatalf("expected watch code state to remain unchanged, got %#v", projectData)
	}
}

func TestAppWatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	const providerPluginID = "setta-watch-code"
	installAppRepoPlugin(t, cfg, providerPluginID)

	trackedDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	settaFilesDir := filepath.Join(cfg.Paths.SettaFilesRoot, "ignored")
	runtimeDir := filepath.Join(cfg.Paths.RuntimeRoot, "ignored")
	for path, content := range map[string]string{
		filepath.Join(trackedDir, "tracked.py"):    "def tracked(value):\n    return value\n",
		filepath.Join(settaFilesDir, "ignored.py"): "def setta_ignored(value):\n    return value\n",
		filepath.Join(runtimeDir, "ignored.py"):    "def runtime_ignored(value):\n    return value\n",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", filepath.Dir(path), err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}
	settaFilesRel, err := filepath.Rel(cfg.Paths.WorkspaceRoot, settaFilesDir)
	if err != nil {
		t.Fatalf("rel setta files dir: %v", err)
	}
	runtimeRel, err := filepath.Rel(cfg.Paths.WorkspaceRoot, runtimeDir)
	if err != nil {
		t.Fatalf("rel runtime dir: %v", err)
	}

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	inputsPayload := fmt.Sprintf(
		`{"projectConfigId":"project-alpha","folders":[{"path":"pkg","recursive":true},{"path":%q,"recursive":true},{"path":%q,"recursive":true}],"files":[],"frontendOpId":"watch-inputs-op"}`,
		filepath.ToSlash(settaFilesRel),
		filepath.ToSlash(runtimeRel),
	)
	inputsResponse := postAppWatchCodePluginRoute(t, server.URL, cookie, providerPluginID, "inputs", inputsPayload)
	defer inputsResponse.Body.Close()
	if inputsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(inputsResponse.Body)
		t.Fatalf("expected inputs route 200, got %d with body %q", inputsResponse.StatusCode, string(body))
	}
	var routeBody struct {
		ProjectData projectstate.WatchCodePluginProjectData `json:"projectData"`
	}
	if err := json.NewDecoder(inputsResponse.Body).Decode(&routeBody); err != nil {
		t.Fatalf("decode inputs route response: %v", err)
	}
	if len(routeBody.ProjectData.Folders) != 3 || len(routeBody.ProjectData.Files) != 0 {
		t.Fatalf("expected configured project data in response, got %#v", routeBody.ProjectData)
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	projectData, _, err := snapshot.Document.WatchCodePluginProjectData(providerPluginID, "project-alpha")
	if err != nil {
		t.Fatalf("read live watch code plugin data: %v", err)
	}
	if _, ok := projectData.BaselineByPath[filepath.Join(trackedDir, "tracked.py")]; !ok {
		t.Fatalf("expected tracked file baseline, got %#v", projectData.BaselineByPath)
	}
	for _, ignored := range []string{
		filepath.Join(settaFilesDir, "ignored.py"),
		filepath.Join(runtimeDir, "ignored.py"),
	} {
		if _, ok := projectData.BaselineByPath[ignored]; ok {
			t.Fatalf("expected ignored root path %q to stay out of baseline %#v", ignored, projectData.BaselineByPath)
		}
	}
	status := app.ProjectStates().Main().FrontendOpStatus()
	if !slices.Contains(status.Completed, "watch-inputs-op") {
		t.Fatalf("expected completed frontend op in live runtime status, got %#v", status)
	}

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.Name = "Alpha Renamed"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("perform unrelated app runtime save: %v", err)
	}
	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project state paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted project state: %v", err)
	}
	persistedProjectData, _, err := persisted.WatchCodePluginProjectData(providerPluginID, "project-alpha")
	if err != nil {
		t.Fatalf("read persisted watch code plugin data: %v", err)
	}
	if !reflect.DeepEqual(persistedProjectData.Files, projectData.Files) ||
		!reflect.DeepEqual(persistedProjectData.Folders, projectData.Folders) {
		t.Fatalf("expected plugin data to survive app save, got %#v", persistedProjectData)
	}
}

func TestAppWatchCodePluginRouteRejectsUnsupportedFolderPropertiesWithoutMutation(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	const providerPluginID = "setta-watch-code"
	installAppRepoPlugin(t, cfg, providerPluginID)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	server := httptest.NewServer(app.Handler())
	defer server.Close()

	initialRevision := app.ProjectStates().Main().Snapshot().Revision
	response := postAppWatchCodePluginRoute(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		providerPluginID,
		"inputs",
		`{"projectConfigId":"project-alpha","folders":[{"path":"pkg","recursive":true,"extra":"rejected"}],"files":[]}`,
	)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read invalid inputs response: %v", err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected inputs route 400, got %d with body %q", response.StatusCode, string(body))
	}
	var payload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode invalid inputs response: %v", err)
	}
	if payload.Error.Code != "invalid_watch_code_input" {
		t.Fatalf("expected invalid_watch_code_input, got %q with body %q", payload.Error.Code, string(body))
	}

	liveSnapshot := app.ProjectStates().Main().Snapshot()
	if liveSnapshot.Revision != initialRevision {
		t.Fatalf("expected rejected Watch Code route not to mutate revision %d, got %d", initialRevision, liveSnapshot.Revision)
	}
	liveProjectData := readAppWatchCodePluginProjectDataForProvider(t, liveSnapshot.Document, providerPluginID, "project-alpha")
	if !liveProjectData.IsEmpty() {
		t.Fatalf("expected live watch-code plugin data to remain empty, got %#v", liveProjectData)
	}
	persistedProjectData := readPersistedAppWatchCodePluginProjectDataForProvider(t, cfg, providerPluginID, "project-alpha")
	if !persistedProjectData.IsEmpty() {
		t.Fatalf("expected persisted watch-code plugin data to remain empty, got %#v", persistedProjectData)
	}
}

func TestAppWatchCodePluginRouteRejectsLegacyInputFieldNamesWithoutMutation(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	const providerPluginID = "setta-watch-code"
	installAppRepoPlugin(t, cfg, providerPluginID)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	server := httptest.NewServer(app.Handler())
	defer server.Close()

	initialRevision := app.ProjectStates().Main().Snapshot().Revision
	response := postAppWatchCodePluginRoute(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		providerPluginID,
		"inputs",
		`{"projectConfigId":"project-alpha","watchCodeFolders":[{"path":"pkg","recursive":true}],"watchCodeFiles":[]}`,
	)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read legacy inputs response: %v", err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected inputs route 400, got %d with body %q", response.StatusCode, string(body))
	}

	liveSnapshot := app.ProjectStates().Main().Snapshot()
	if liveSnapshot.Revision != initialRevision {
		t.Fatalf("expected rejected legacy field names not to mutate revision %d, got %d", initialRevision, liveSnapshot.Revision)
	}
	liveProjectData := readAppWatchCodePluginProjectDataForProvider(t, liveSnapshot.Document, providerPluginID, "project-alpha")
	if !liveProjectData.IsEmpty() {
		t.Fatalf("expected live watch-code plugin data to remain empty, got %#v", liveProjectData)
	}
}

func TestAppWatchCodePluginRouteRejectsProviderMissingRouteContractWithoutMutation(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	const providerPluginID = testAppWatchCodeProviderPluginID
	installAppWatchCodeProviderFixtureWithRouteSuffixes(t, cfg, []string{})

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	setAppWatchCodePluginProjectDataForProvider(t, &document, providerPluginID, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() != nil {
		t.Fatal("expected incomplete Watch Code provider not to start service")
	}
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	runtimePayload := fetchAppPluginRuntime(t, server.URL, cookie)
	watchCode := runtimePayload.FeatureCapabilities.WatchCode
	if watchCode.ProviderSelection == nil ||
		watchCode.ProviderSelection.Status != plugins.PluginWatchCodeProviderSelectionStatusInvalidProvider ||
		!slices.Equal(watchCode.ProviderSelection.InvalidPluginIDs, []string{providerPluginID}) ||
		watchCode.PluginEnabled ||
		watchCode.PluginID != "" {
		t.Fatalf("expected incomplete provider to be invalid and inactive, got %#v", watchCode)
	}

	initialRevision := app.ProjectStates().Main().Snapshot().Revision
	response := postAppWatchCodePluginRoute(
		t,
		server.URL,
		cookie,
		providerPluginID,
		watchcodecontracts.BackendRouteSuffixInputs,
		`{"projectConfigId":"project-alpha","folders":[],"files":[]}`,
	)
	defer response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected incomplete provider route to be absent, got %d with body %q", response.StatusCode, string(body))
	}
	if revision := app.ProjectStates().Main().Snapshot().Revision; revision != initialRevision {
		t.Fatalf("expected incomplete provider route not to mutate revision %d, got %d", initialRevision, revision)
	}
	projectData := readAppWatchCodePluginProjectDataForProvider(t, app.ProjectStates().Main().Snapshot().Document, providerPluginID, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) {
		t.Fatalf("expected incomplete provider route not to mutate plugin data, got %#v", projectData)
	}
}

func TestAppSetCallableRouteSyncsActiveWatchCodeProviderRegistry(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": appWatchCodeCallableRegistryProject(t),
		},
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Registry: map[string]projectstate.WatchCodeRegistryEntry{
			"pkg.target.target_callable:function": {
				CallableName:  "target_callable",
				Kind:          projectstate.WatchCodeCallableKindFunction,
				SignatureHash: "sig",
				BodyHash:      "body",
				SourcePath:    "pkg/target.py",
			},
		},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCallable,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","callableName":"target_callable","refetchParams":false}`),
	)
	if err != nil {
		t.Fatalf("new setCallable request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post setCallable: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected setCallable 200, got %d with body %q", response.StatusCode, string(body))
	}

	projectData := readAppWatchCodePluginProjectData(t, app.ProjectStates().Main().Snapshot().Document, "project-alpha")
	entry := projectData.Registry["pkg.target.target_callable:function"]
	if !reflect.DeepEqual(entry.SectionIDs, []string{"callable-section"}) || entry.SectionsCount != 1 {
		t.Fatalf("expected active provider registry membership, got %#v", entry)
	}
}

func TestAppMainRuntimeSaveSyncsWatchCodeServiceConfigs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	pluginRoot := installAppWatchCodeProviderFixtureWithRouteSuffixes(t, cfg, watchcodecontracts.BackendRouteSuffixes())
	rewriteAppPluginManifest(t, pluginRoot, func(payload map[string]any) {
		ensureAppPluginManifestCapability(payload, "registerCodegenTarget")
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCodeRef.Current() == nil {
		t.Fatal("expected IDE app to start watch code service")
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"pkg/watch.py"},
			Folders: []projectstate.WatchCodeFolder{
				{Path: "pkg/nested", Recursive: false},
			},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save main runtime: %v", err)
	}

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "nested")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	watchFile := filepath.Join(watchDir, "nested_watch.py")
	if err := os.WriteFile(watchFile, []byte("def nested_watch(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-alpha", "pkg.nested.nested_watch.nested_watch:function", watchFile)
}

func TestAppWatchCodeRuntimeAppliesFileCreateAndDeleteCallbacks(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Folders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
	}

	watchFile := filepath.Join(watchDir, "created.py")
	if err := os.WriteFile(watchFile, []byte("def created(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.created.created:function"]
		if !ok || entry.SourcePath != watchFile || len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
			return false
		}
		_, ok = project.Sections[entry.SectionIDs[0]]
		return ok
	})

	if err := os.Remove(watchFile); err != nil {
		t.Fatalf("remove watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(_ projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		return len(projectData.Registry) == 0 && len(projectData.BaselineByPath) == 0
	})
}

func TestAppSetCodeRouteAppliesWatchCodeBoundSectionUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", projectData.Registry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}
	if _, ok := project.Sections[entry.SectionIDs[0]]; !ok {
		t.Fatalf("expected callable section %q to exist", entry.SectionIDs[0])
	}

	codeObjNames := map[string]struct{}{}
	for _, codeObj := range project.CodeObjs {
		codeObjNames[codeObj.Name] = struct{}{}
	}
	if _, ok := codeObjNames["sorted"]; !ok {
		t.Fatalf("expected callable code object after setCode route, got %#v", codeObjNames)
	}
}

func TestAppSetCodeRouteSkipsWatchCodeBoundSectionUpdateWithoutProvider(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect watch code service without provider")
	}

	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	target, err := snapshot.Document.ResolveFormatCodeTarget("project-alpha", "section-main")
	if err != nil {
		t.Fatalf("resolve updated code target: %v", err)
	}
	if target.Code != "def sorted(iterable):\n    return iterable\n" {
		t.Fatalf("expected setCode to update code without provider, got %q", target.Code)
	}
	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if len(projectData.Registry) != 0 || len(projectData.BaselineByPath) != 0 {
		t.Fatalf("expected watch code state to remain inert without provider, got registry %#v baseline %#v", projectData.Registry, projectData.BaselineByPath)
	}
}

func TestAppSetCodeRoutePublishesMissingArgDiagnosticsForRootWatchCodeBoundSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	seedAppRootWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save root watch code bound project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	recordedStates := []string{
		"def cool_fn",
		"def cool_fn()",
		"def cool_fn(,)",
		"def cool_fn()",
		"def cool_fn(a)",
		"def cool_fn(a,)",
		"def cool_fn(a,b)",
		"def cool_fn(a,b,)",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c):\n    print(\"dog\")\n",
	}
	for _, state := range recordedStates {
		request, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteSetCode,
			strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":`+strconv.Quote(state)+`}`),
		)
		if err != nil {
			t.Fatalf("new setCode request for %q: %v", state, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(cookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post setCode for %q: %v", state, err)
		}
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			response.Body.Close()
			t.Fatalf("expected setCode 200 for %q, got %d with body %q", state, response.StatusCode, string(body))
		}
		response.Body.Close()
	}

	waitForAppCondition(t, 15*time.Second, func() bool {
		payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
		if generatedDiagnosticsContain(payload, `Arguments missing for parameters "a", "b", "c"`) {
			return true
		}
		return generatedDiagnosticsContain(payload, "watch_code_test")
	})

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry, got %#v", projectData.Registry)
	}

	payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, project, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q, got payload %#v", paramName, payload)
		}
	}
}

func TestAppSavePublishesMissingArgDiagnosticsForExistingRootWatchCodeCallable(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	if err := project.SetCode("section-main", "def cool_fn(a,b,c):\n    print(\"dog\")\n"); err != nil {
		t.Fatalf("set root watch code source: %v", err)
	}
	projectData := projectstate.WatchCodePluginProjectData{
		Files: []string{"watch_code_test.py"},
	}.Normalized()
	if _, err := project.ApplyWatchCodeBoundSectionUpdate(context.Background(), &projectData, "section-main", cfg.Paths.WorkspaceRoot, nil); err != nil {
		t.Fatalf("apply root watch code bound update: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
		return document, nil
	}); err != nil {
		t.Fatalf("seed existing root watch code callable project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save existing root watch code callable project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	waitForAppCondition(t, 15*time.Second, func() bool {
		payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
		if generatedDiagnosticsContain(payload, `Arguments missing for parameters "a", "b", "c"`) {
			return true
		}
		return generatedDiagnosticsContain(payload, "watch_code_test")
	})

	snapshot := app.ProjectStates().Main().Snapshot()
	project = snapshot.Document.Projects["project-alpha"]
	projectData = readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after save, got %#v", projectData.Registry)
	}
	payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, project, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q after save, got payload %#v", paramName, payload)
		}
	}
}

func TestAppFormatCodeRouteAppliesWatchCodeBoundSectionUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	addRepoVenvRuffToPath(t)
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().SetCode(
		context.Background(),
		"project-alpha",
		"section-main",
		"def sorted( iterable ):\n return iterable\n",
	); err != nil {
		t.Fatalf("seed app set_code before route format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post format code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after formatCode route: %v", err)
	}
	snapshot := app.ProjectStates().Main().Snapshot()
	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry, ok := projectData.Registry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", projectData.Registry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}

	payload := mustDecodedProjectPayloadValue(t, project.SectionImpls["impl-main"].Payload)
	if got := payload["code"]; got != "def sorted(iterable):\n    return iterable\n" {
		t.Fatalf("expected formatted code payload, got %#v", got)
	}
}

func TestAppBoundCodeFileRuntimeAppliesWatchCodeReloads(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code bound project: %v", err)
	}
	time.Sleep(400 * time.Millisecond)

	boundPath := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(boundPath), 0o755); err != nil {
		t.Fatalf("mkdir bound file parent: %v", err)
	}
	updatedSource := "def existing(value):\n    return value\n\n\ndef external_added(value):\n    return value\n"
	if err := os.WriteFile(boundPath, []byte(updatedSource), 0o644); err != nil {
		t.Fatalf("write bound file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry["pkg.bound.external_added:function"]
		if !ok || len(entry.SectionIDs) != 1 {
			return false
		}
		boundSection, ok, err := project.ResolveWatchCodeBoundSection(projectData, "section-main", cfg.Paths.WorkspaceRoot)
		if err != nil || !ok {
			return false
		}
		return boundSection.Code == updatedSource
	})
}

func TestAppLauncherDoesNotStartWatchCodeService(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect launcher mode to start watch code service")
	}
}

func TestAppLauncherModeBlocksWatchCodeProviderHost(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeLauncher
	prepareAppCurrentSession(t, cfg)
	const providerPluginID = "setta-watch-code"
	installAppRepoPlugin(t, cfg, providerPluginID)
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	setAppWatchCodePluginProjectDataForProvider(t, &document, providerPluginID, "project-alpha", projectstate.WatchCodePluginProjectData{
		Files: []string{"pkg/watch.py"},
	})
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if app.watchCodeRef.Current() != nil {
		t.Fatal("did not expect launcher mode to start watch code service")
	}
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	runtimePayload := fetchAppPluginRuntime(t, server.URL, cookie)
	if runtimePayload.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities")
	}
	watchCode := runtimePayload.FeatureCapabilities.WatchCode
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected launcher Watch Code provider to be unavailable, got %#v", watchCode)
	}
	if watchCode.ProviderSelection == nil ||
		watchCode.ProviderSelection.Status != plugins.PluginWatchCodeProviderSelectionStatusInvalidProvider ||
		!slices.Equal(watchCode.ProviderSelection.InvalidPluginIDs, []string{providerPluginID}) {
		t.Fatalf("expected launcher Watch Code provider to be an invalid unavailable candidate, got %#v", watchCode.ProviderSelection)
	}
	var providerStatus *plugins.PluginStatusEntry
	for i := range runtimePayload.Status.Plugins {
		if runtimePayload.Status.Plugins[i].PluginID == providerPluginID {
			providerStatus = &runtimePayload.Status.Plugins[i]
			break
		}
	}
	if providerStatus == nil {
		t.Fatalf("expected %s plugin status, got %#v", providerPluginID, runtimePayload.Status.Plugins)
	}
	blocked := providerStatus.BlockedCapabilities
	if len(blocked) != 1 || blocked[0].Capability != "registerWatchCodeBackend" || blocked[0].Reason != plugins.PluginBlockedCapabilityReasonModePolicy {
		t.Fatalf("expected launcher mode to block registerWatchCodeBackend, got %#v", blocked)
	}

	initialRevision := app.ProjectStates().Main().Snapshot().Revision
	response := postAppWatchCodePluginRoute(
		t,
		server.URL,
		cookie,
		providerPluginID,
		"inputs",
		`{"projectConfigId":"project-alpha","folders":[],"files":[]}`,
	)
	defer response.Body.Close()
	if response.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected launcher Watch Code route to fail closed with 409, got %d with body %q", response.StatusCode, string(body))
	}
	var payload struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode launcher Watch Code fail-closed response: %v", err)
	}
	if payload.Error.Code != watchcodecontracts.BackendErrorProviderRequired ||
		payload.Error.Message != projectstate.ErrWatchCodeProviderPluginIDRequired.Error() {
		t.Fatalf("expected Go-host provider-required response, got %#v", payload.Error)
	}
	if revision := app.ProjectStates().Main().Snapshot().Revision; revision != initialRevision {
		t.Fatalf("expected launcher Watch Code route not to mutate revision %d, got %d", initialRevision, revision)
	}
	projectData := readAppWatchCodePluginProjectDataForProvider(t, app.ProjectStates().Main().Snapshot().Document, providerPluginID, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) {
		t.Fatalf("expected launcher Watch Code route not to mutate plugin data, got %#v", projectData)
	}
}
