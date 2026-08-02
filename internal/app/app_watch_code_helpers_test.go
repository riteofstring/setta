package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"setta/internal/config"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/watchcodecontracts"
)

type appWatchCodeRouteFixturePaths struct {
	trackedDir    string
	settaFilesDir string
	runtimeDir    string
	settaFilesRel string
	runtimeRel    string
}

func writeAppWatchCodeRouteFixtureFiles(t *testing.T, cfg config.Config) appWatchCodeRouteFixturePaths {
	t.Helper()

	paths := appWatchCodeRouteFixturePaths{
		trackedDir:    filepath.Join(cfg.Paths.WorkspaceRoot, "pkg"),
		settaFilesDir: filepath.Join(cfg.Paths.SettaFilesRoot, "ignored"),
		runtimeDir:    filepath.Join(cfg.Paths.RuntimeRoot, "ignored"),
	}
	for path, content := range map[string]string{
		filepath.Join(paths.trackedDir, "tracked.py"):    "def tracked(value):\n    return value\n",
		filepath.Join(paths.settaFilesDir, "ignored.py"): "def setta_ignored(value):\n    return value\n",
		filepath.Join(paths.runtimeDir, "ignored.py"):    "def runtime_ignored(value):\n    return value\n",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", filepath.Dir(path), err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}
	var err error
	paths.settaFilesRel, err = filepath.Rel(cfg.Paths.WorkspaceRoot, paths.settaFilesDir)
	if err != nil {
		t.Fatalf("rel setta files dir: %v", err)
	}
	paths.runtimeRel, err = filepath.Rel(cfg.Paths.WorkspaceRoot, paths.runtimeDir)
	if err != nil {
		t.Fatalf("rel runtime dir: %v", err)
	}
	return paths
}

func seedAppWatchCodePythonProject(t *testing.T, cfg config.Config) {
	t.Helper()

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
}

func startAppServerWithAuthCookie(t *testing.T, cfg config.Config) (*App, *httptest.Server, *http.Cookie) {
	t.Helper()

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
	t.Cleanup(server.Close)
	return app, server, newAppTestAuthCookie(t, app)
}

func readAppWatchCodeInputsRouteProjectData(
	t *testing.T,
	response *http.Response,
) projectstate.WatchCodePluginProjectData {
	t.Helper()
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected inputs route 200, got %d with body %q", response.StatusCode, string(body))
	}
	var routeBody struct {
		ProjectData projectstate.WatchCodePluginProjectData `json:"projectData"`
	}
	if err := json.NewDecoder(response.Body).Decode(&routeBody); err != nil {
		t.Fatalf("decode inputs route response: %v", err)
	}
	return routeBody.ProjectData
}

func assertAppWatchCodeConfiguredProjectData(t *testing.T, projectData projectstate.WatchCodePluginProjectData) {
	t.Helper()

	if len(projectData.Folders) != 3 || len(projectData.Files) != 0 {
		t.Fatalf("expected configured project data in response, got %#v", projectData)
	}
}

func readLiveAppWatchCodePluginProjectData(
	t *testing.T,
	app *App,
	pluginID string,
	projectID string,
) projectstate.WatchCodePluginProjectData {
	t.Helper()

	snapshot := app.ProjectStates().Main().Snapshot()
	projectData, _, err := snapshot.Document.WatchCodePluginProjectData(pluginID, projectID)
	if err != nil {
		t.Fatalf("read live watch code plugin data: %v", err)
	}
	return projectData
}

func assertAppWatchCodeBaselineIgnoresReservedRoots(
	t *testing.T,
	projectData projectstate.WatchCodePluginProjectData,
	paths appWatchCodeRouteFixturePaths,
) {
	t.Helper()

	if _, ok := projectData.BaselineByPath[filepath.Join(paths.trackedDir, "tracked.py")]; !ok {
		t.Fatalf("expected tracked file baseline, got %#v", projectData.BaselineByPath)
	}
	for _, ignored := range []string{
		filepath.Join(paths.settaFilesDir, "ignored.py"),
		filepath.Join(paths.runtimeDir, "ignored.py"),
	} {
		if _, ok := projectData.BaselineByPath[ignored]; ok {
			t.Fatalf("expected ignored root path %q to stay out of baseline %#v", ignored, projectData.BaselineByPath)
		}
	}
}

func assertAppFrontendOpCompleted(t *testing.T, app *App, frontendOpID string) {
	t.Helper()

	status := app.ProjectStates().Main().FrontendOpStatus()
	if !slices.Contains(status.Completed, frontendOpID) {
		t.Fatalf("expected completed frontend op in live runtime status, got %#v", status)
	}
}

func renameAppProjectAndSave(t *testing.T, app *App, projectID string, name string) {
	t.Helper()

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects[projectID]
		project.Name = name
		document.Projects[projectID] = project
		return document, nil
	}); err != nil {
		t.Fatalf("perform unrelated app runtime save: %v", err)
	}
}

func assertPersistedAppWatchCodeProjectDataMatches(
	t *testing.T,
	cfg config.Config,
	pluginID string,
	want projectstate.WatchCodePluginProjectData,
) {
	t.Helper()

	persisted := readPersistedAppWatchCodePluginProjectDataForProvider(t, cfg, pluginID, "project-alpha")
	if !reflect.DeepEqual(persisted.Files, want.Files) ||
		!reflect.DeepEqual(persisted.Folders, want.Folders) {
		t.Fatalf("expected plugin data to survive app save, got %#v", persisted)
	}
}

func seedAppLauncherWatchCodeProviderData(t *testing.T, cfg config.Config, providerPluginID string) {
	t.Helper()

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
}

func assertLauncherWatchCodeProviderUnavailable(
	t *testing.T,
	runtimePayload plugins.PluginRuntimeResponse,
	providerPluginID string,
) {
	t.Helper()

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
	providerStatus := findPluginRuntimeStatus(runtimePayload.Status.Plugins, providerPluginID)
	if providerStatus == nil {
		t.Fatalf("expected %s plugin status, got %#v", providerPluginID, runtimePayload.Status.Plugins)
	}
	blocked := providerStatus.BlockedCapabilities
	if len(blocked) != 1 || blocked[0].Capability != "registerWatchCodeBackend" || blocked[0].Reason != plugins.PluginBlockedCapabilityReasonModePolicy {
		t.Fatalf("expected launcher mode to block registerWatchCodeBackend, got %#v", blocked)
	}
}

func findPluginRuntimeStatus(statuses []plugins.PluginStatusEntry, pluginID string) *plugins.PluginStatusEntry {
	for i := range statuses {
		if statuses[i].PluginID == pluginID {
			return &statuses[i]
		}
	}
	return nil
}

func assertLauncherWatchCodeRouteFailsClosed(t *testing.T, response *http.Response) {
	t.Helper()
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
}

func assertLauncherWatchCodeProjectUnchanged(
	t *testing.T,
	app *App,
	providerPluginID string,
	initialRevision uint64,
) {
	t.Helper()

	snapshot := app.ProjectStates().Main().Snapshot()
	if snapshot.Revision != initialRevision {
		t.Fatalf("expected launcher Watch Code route not to mutate revision %d, got %d", initialRevision, snapshot.Revision)
	}
	projectData := readAppWatchCodePluginProjectDataForProvider(t, snapshot.Document, providerPluginID, "project-alpha")
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/watch.py"}) {
		t.Fatalf("expected launcher Watch Code route not to mutate plugin data, got %#v", projectData)
	}
}
