package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/notifications"
	"setta/internal/observability"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/watchcode"
	"setta/internal/wsapi"
)

func TestAppServesProjectShellReadRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-beta"
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "Beta",
		}
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	metadataRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadAllProjectMetadata, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new metadata request: %v", err)
	}
	metadataRequest.Header.Set("Content-Type", "application/json")
	metadataRequest.AddCookie(authCookie)

	metadataResponse, err := http.DefaultClient.Do(metadataRequest)
	if err != nil {
		t.Fatalf("load all project metadata: %v", err)
	}
	defer metadataResponse.Body.Close()
	if metadataResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(metadataResponse.Body)
		t.Fatalf("expected metadata 200, got %d with body %q", metadataResponse.StatusCode, string(body))
	}

	var metadataPayload projectshell.AllProjectMetadata
	if err := json.NewDecoder(metadataResponse.Body).Decode(&metadataPayload); err != nil {
		t.Fatalf("decode metadata payload: %v", err)
	}
	if metadataPayload.DefaultProjectConfigID == nil || *metadataPayload.DefaultProjectConfigID != "project-beta" {
		t.Fatalf("expected default project-beta, got %#v", metadataPayload.DefaultProjectConfigID)
	}
	if len(metadataPayload.ProjectMetadata) != 2 {
		t.Fatalf("expected two metadata entries, got %#v", metadataPayload.ProjectMetadata)
	}
	if metadataPayload.ProjectMetadata[0].ID != "project-alpha" || metadataPayload.ProjectMetadata[1].ID != "project-beta" {
		t.Fatalf("unexpected metadata ordering %#v", metadataPayload.ProjectMetadata)
	}

	projectRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"Alpha"}`))
	if err != nil {
		t.Fatalf("new project request: %v", err)
	}
	projectRequest.Header.Set("Content-Type", "application/json")
	projectRequest.AddCookie(authCookie)

	projectResponse, err := http.DefaultClient.Do(projectRequest)
	if err != nil {
		t.Fatalf("load project config: %v", err)
	}
	defer projectResponse.Body.Close()
	if projectResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(projectResponse.Body)
		t.Fatalf("expected project config 200, got %d with body %q", projectResponse.StatusCode, string(body))
	}

	var projectPayload projectview.SingleConfig
	if err := json.NewDecoder(projectResponse.Body).Decode(&projectPayload); err != nil {
		t.Fatalf("decode project payload: %v", err)
	}
	if projectPayload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", projectPayload.ProjectConfig.ID)
	}
	if projectPayload.ProjectConfig.Name != "Alpha" {
		t.Fatalf("expected Alpha, got %q", projectPayload.ProjectConfig.Name)
	}
}

func TestAppLoadProjectConfigServesDedicatedSettingsProjectRuntime(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	authCookie := newAppTestAuthCookie(t, app)

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	var loadSettingsPayload projectview.SingleConfig
	if err := json.NewDecoder(loadSettingsResponse.Body).Decode(&loadSettingsPayload); err != nil {
		t.Fatalf("decode settings project payload: %v", err)
	}
	if loadSettingsPayload.ProjectConfig.ID != settingsstate.SettingsProjectID {
		t.Fatalf("expected settings project id %q, got %q", settingsstate.SettingsProjectID, loadSettingsPayload.ProjectConfig.ID)
	}
	if loadSettingsPayload.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected settings project name %q, got %q", settingsstate.SettingsProjectName, loadSettingsPayload.ProjectConfig.Name)
	}
	if len(loadSettingsPayload.Sections) != 46 {
		t.Fatalf("expected 46 settings sections, got %d", len(loadSettingsPayload.Sections))
	}
	if len(loadSettingsPayload.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes, got %d", len(loadSettingsPayload.ProjectConfig.ViewModes))
	}
	if loadSettingsPayload.ProjectConfig.ActiveViewModeID == nil || *loadSettingsPayload.ProjectConfig.ActiveViewModeID == "" {
		t.Fatal("expected settings project active view mode id")
	}

	latestStateRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new settings latest-state request: %v", err)
	}
	latestStateRequest.Header.Set("Content-Type", "application/json")
	latestStateRequest.AddCookie(authCookie)

	latestStateResponse, err := http.DefaultClient.Do(latestStateRequest)
	if err != nil {
		t.Fatalf("get settings latest project state: %v", err)
	}
	defer latestStateResponse.Body.Close()
	if latestStateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(latestStateResponse.Body)
		t.Fatalf("expected settings latest state 200, got %d with body %q", latestStateResponse.StatusCode, string(body))
	}

	var latestStatePayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(latestStateResponse.Body).Decode(&latestStatePayload); err != nil {
		t.Fatalf("decode settings latest project state payload: %v", err)
	}
	if latestStatePayload.ProjectState.ProjectConfig.ID != settingsstate.SettingsProjectID {
		t.Fatalf("expected latest-state settings project id %q, got %q", settingsstate.SettingsProjectID, latestStatePayload.ProjectState.ProjectConfig.ID)
	}
	if latestStatePayload.ProjectState.ProjectConfig.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected latest-state settings project name %q, got %q", settingsstate.SettingsProjectName, latestStatePayload.ProjectState.ProjectConfig.Name)
	}
}

func TestAppSettingsProjectLoadRoutesRehydrateFromLiveSettingsSnapshot(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	authCookie := newAppTestAuthCookie(t, app)

	settingsDocument := app.SettingsState().Snapshot().Document
	settingsDocument["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"
	saveSettingsBody, err := json.Marshal(httpapi.SaveSettingsRequest{Settings: settingsDocument})
	if err != nil {
		t.Fatalf("marshal save settings request: %v", err)
	}

	saveSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveSettings, strings.NewReader(string(saveSettingsBody)))
	if err != nil {
		t.Fatalf("new save settings request: %v", err)
	}
	saveSettingsRequest.Header.Set("Content-Type", "application/json")
	saveSettingsRequest.AddCookie(authCookie)

	saveSettingsResponse, err := http.DefaultClient.Do(saveSettingsRequest)
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	defer saveSettingsResponse.Body.Close()
	if saveSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveSettingsResponse.Body)
		t.Fatalf("expected save settings 200, got %d with body %q", saveSettingsResponse.StatusCode, string(body))
	}

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config after settings save: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	var loadSettingsPayload projectview.SingleConfig
	if err := json.NewDecoder(loadSettingsResponse.Body).Decode(&loadSettingsPayload); err != nil {
		t.Fatalf("decode settings load payload: %v", err)
	}
	if got := settingsProjectViewCodeObjValue(t, loadSettingsPayload, "settings-codeobj-impl__backend__backend__renameRefactorMode"); got != "NEVER_RENAME" {
		t.Fatalf("expected load renameRefactorMode NEVER_RENAME, got %q", got)
	}

	latestStateRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new latest-state request: %v", err)
	}
	latestStateRequest.Header.Set("Content-Type", "application/json")
	latestStateRequest.AddCookie(authCookie)

	latestStateResponse, err := http.DefaultClient.Do(latestStateRequest)
	if err != nil {
		t.Fatalf("get latest project state after settings save: %v", err)
	}
	defer latestStateResponse.Body.Close()
	if latestStateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(latestStateResponse.Body)
		t.Fatalf("expected latest project state 200, got %d with body %q", latestStateResponse.StatusCode, string(body))
	}

	var latestStatePayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(latestStateResponse.Body).Decode(&latestStatePayload); err != nil {
		t.Fatalf("decode latest-state payload: %v", err)
	}
	if got := settingsProjectViewCodeObjValue(t, latestStatePayload.ProjectState, "settings-codeobj-impl__backend__backend__renameRefactorMode"); got != "NEVER_RENAME" {
		t.Fatalf("expected latest-state renameRefactorMode NEVER_RENAME, got %q", got)
	}
}

func TestAppSettingsProjectLoadRoutesRepairAndPersistMissingRequiredViewMode(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	authCookie := newAppTestAuthCookie(t, app)

	loadSettingsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new settings load request: %v", err)
	}
	loadSettingsRequest.Header.Set("Content-Type", "application/json")
	loadSettingsRequest.AddCookie(authCookie)

	loadSettingsResponse, err := http.DefaultClient.Do(loadSettingsRequest)
	if err != nil {
		t.Fatalf("load settings project config: %v", err)
	}
	defer loadSettingsResponse.Body.Close()
	if loadSettingsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loadSettingsResponse.Body)
		t.Fatalf("expected settings project config 200, got %d with body %q", loadSettingsResponse.StatusCode, string(body))
	}

	deleteViewModeRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteViewMode, strings.NewReader(`{"projectConfigId":"settings","viewModeId":"settings-all"}`))
	if err != nil {
		t.Fatalf("new delete view mode request: %v", err)
	}
	deleteViewModeRequest.Header.Set("Content-Type", "application/json")
	deleteViewModeRequest.AddCookie(authCookie)

	deleteViewModeResponse, err := http.DefaultClient.Do(deleteViewModeRequest)
	if err != nil {
		t.Fatalf("delete settings view mode: %v", err)
	}
	defer deleteViewModeResponse.Body.Close()
	if deleteViewModeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteViewModeResponse.Body)
		t.Fatalf("expected delete view mode 200, got %d with body %q", deleteViewModeResponse.StatusCode, string(body))
	}

	server.Close()
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app after delete: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new restarted app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	restartedServer := httptest.NewServer(restartedApp.Handler())
	defer restartedServer.Close()

	restartedAuthCookie := newAppTestAuthCookie(t, restartedApp)

	restartedLoadRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted settings load request: %v", err)
	}
	restartedLoadRequest.Header.Set("Content-Type", "application/json")
	restartedLoadRequest.AddCookie(restartedAuthCookie)

	restartedLoadResponse, err := http.DefaultClient.Do(restartedLoadRequest)
	if err != nil {
		t.Fatalf("load restarted settings project config: %v", err)
	}
	defer restartedLoadResponse.Body.Close()
	if restartedLoadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLoadResponse.Body)
		t.Fatalf("expected restarted settings project config 200, got %d with body %q", restartedLoadResponse.StatusCode, string(body))
	}

	var restartedLoadPayload projectview.SingleConfig
	if err := json.NewDecoder(restartedLoadResponse.Body).Decode(&restartedLoadPayload); err != nil {
		t.Fatalf("decode restarted settings project payload: %v", err)
	}
	if len(restartedLoadPayload.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes after repair, got %d", len(restartedLoadPayload.ProjectConfig.ViewModes))
	}
	if _, ok := restartedLoadPayload.ProjectConfig.ViewModes["settings-all"]; !ok {
		t.Fatal("expected restarted settings payload to restore settings-all view mode")
	}

	restartedLatestRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted latest-state request: %v", err)
	}
	restartedLatestRequest.Header.Set("Content-Type", "application/json")
	restartedLatestRequest.AddCookie(restartedAuthCookie)

	restartedLatestResponse, err := http.DefaultClient.Do(restartedLatestRequest)
	if err != nil {
		t.Fatalf("load restarted latest settings project state: %v", err)
	}
	defer restartedLatestResponse.Body.Close()
	if restartedLatestResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLatestResponse.Body)
		t.Fatalf("expected restarted latest settings project state 200, got %d with body %q", restartedLatestResponse.StatusCode, string(body))
	}

	var restartedLatestPayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(restartedLatestResponse.Body).Decode(&restartedLatestPayload); err != nil {
		t.Fatalf("decode restarted latest settings project payload: %v", err)
	}
	if len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected latest settings payload to expose 5 repaired view modes, got %d", len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes))
	}
	if _, ok := restartedLatestPayload.ProjectState.ProjectConfig.ViewModes["settings-all"]; !ok {
		t.Fatal("expected restarted latest settings payload to restore settings-all view mode")
	}

	persistedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	persistedProject, err := persistedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("persisted settings project by id: %v", err)
	}
	if len(persistedProject.ViewModes) != 5 {
		t.Fatalf("expected persisted repaired settings project to have 5 view modes, got %d", len(persistedProject.ViewModes))
	}
	if _, ok := persistedProject.ViewModes["settings-all"]; !ok {
		t.Fatal("expected persisted repaired settings project to restore settings-all view mode")
	}
}

func TestAppSettingsProjectLoadRoutesRepairDeletedActiveViewModeAndReprojectLayout(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	delete(settingsProject.ViewModes, "settings-core")
	settingsProject.ActiveViewModeID = "settings-core"
	settingsProject.IsEditingViewMode = true
	settingsProject.Viewport = &projectstate.Viewport{X: 80, Y: 40, Zoom: 1.3}
	settingsProject.ViewportInitialized = true
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("restart app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	restartedServer := httptest.NewServer(restartedApp.Handler())
	defer restartedServer.Close()

	restartedAuthCookie := newAppTestAuthCookie(t, restartedApp)

	restartedLoadRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted settings load request: %v", err)
	}
	restartedLoadRequest.Header.Set("Content-Type", "application/json")
	restartedLoadRequest.AddCookie(restartedAuthCookie)

	restartedLoadResponse, err := http.DefaultClient.Do(restartedLoadRequest)
	if err != nil {
		t.Fatalf("load restarted settings project config: %v", err)
	}
	defer restartedLoadResponse.Body.Close()
	if restartedLoadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLoadResponse.Body)
		t.Fatalf("expected restarted settings project config 200, got %d with body %q", restartedLoadResponse.StatusCode, string(body))
	}

	var restartedLoadPayload projectview.SingleConfig
	if err := json.NewDecoder(restartedLoadResponse.Body).Decode(&restartedLoadPayload); err != nil {
		t.Fatalf("decode restarted settings project payload: %v", err)
	}
	if len(restartedLoadPayload.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected 5 settings view modes after repair, got %d", len(restartedLoadPayload.ProjectConfig.ViewModes))
	}
	if restartedLoadPayload.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected repaired settings load payload to exit view-edit mode")
	}
	if restartedLoadPayload.ProjectConfig.ActiveViewModeID == nil {
		t.Fatal("expected repaired settings load payload to expose an active view mode")
	}
	activeLoadViewMode, ok := restartedLoadPayload.ProjectConfig.ViewModes[*restartedLoadPayload.ProjectConfig.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected repaired active view mode %q to exist", *restartedLoadPayload.ProjectConfig.ActiveViewModeID)
	}
	if !reflect.DeepEqual(restartedLoadPayload.ProjectConfig.TopLevelSections, activeLoadViewMode.TopLevelSections) {
		t.Fatal("expected repaired settings load payload to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(restartedLoadPayload.ProjectConfig.Viewport, activeLoadViewMode.Viewport) {
		t.Fatal("expected repaired settings load payload to reproject the active view mode viewport")
	}
	if restartedLoadPayload.ProjectConfig.ViewportInitialized != activeLoadViewMode.ViewportInitialized {
		t.Fatal("expected repaired settings load payload to reproject viewportInitialized")
	}

	restartedLatestRequest, err := http.NewRequest(http.MethodPost, restartedServer.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"settings"}`))
	if err != nil {
		t.Fatalf("new restarted latest-state request: %v", err)
	}
	restartedLatestRequest.Header.Set("Content-Type", "application/json")
	restartedLatestRequest.AddCookie(restartedAuthCookie)

	restartedLatestResponse, err := http.DefaultClient.Do(restartedLatestRequest)
	if err != nil {
		t.Fatalf("load restarted latest settings project state: %v", err)
	}
	defer restartedLatestResponse.Body.Close()
	if restartedLatestResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartedLatestResponse.Body)
		t.Fatalf("expected restarted latest settings project state 200, got %d with body %q", restartedLatestResponse.StatusCode, string(body))
	}

	var restartedLatestPayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(restartedLatestResponse.Body).Decode(&restartedLatestPayload); err != nil {
		t.Fatalf("decode restarted latest settings project payload: %v", err)
	}
	if len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes) != 5 {
		t.Fatalf("expected latest settings payload to expose 5 repaired view modes, got %d", len(restartedLatestPayload.ProjectState.ProjectConfig.ViewModes))
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected repaired latest settings payload to exit view-edit mode")
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID == nil {
		t.Fatal("expected repaired latest settings payload to expose an active view mode")
	}
	activeLatestViewMode, ok := restartedLatestPayload.ProjectState.ProjectConfig.ViewModes[*restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected latest repaired active view mode %q to exist", *restartedLatestPayload.ProjectState.ProjectConfig.ActiveViewModeID)
	}
	if !reflect.DeepEqual(restartedLatestPayload.ProjectState.ProjectConfig.TopLevelSections, activeLatestViewMode.TopLevelSections) {
		t.Fatal("expected repaired latest settings payload to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(restartedLatestPayload.ProjectState.ProjectConfig.Viewport, activeLatestViewMode.Viewport) {
		t.Fatal("expected repaired latest settings payload to reproject the active view mode viewport")
	}
	if restartedLatestPayload.ProjectState.ProjectConfig.ViewportInitialized != activeLatestViewMode.ViewportInitialized {
		t.Fatal("expected repaired latest settings payload to reproject viewportInitialized")
	}

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open repaired settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load repaired settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("repaired settings project by id: %v", err)
	}
	if repairedProject.IsEditingViewMode {
		t.Fatal("expected repaired persisted settings project to exit view-edit mode")
	}
	activePersistedViewMode, ok := repairedProject.ViewModes[repairedProject.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected persisted repaired active view mode %q to exist", repairedProject.ActiveViewModeID)
	}
	if !reflect.DeepEqual(repairedProject.TopLevelSections, activePersistedViewMode.TopLevelSections) {
		t.Fatal("expected repaired persisted settings project to reproject the active view mode layout")
	}
	if !reflect.DeepEqual(repairedProject.Viewport, activePersistedViewMode.Viewport) {
		t.Fatal("expected repaired persisted settings project to reproject the active view mode viewport")
	}
	if repairedProject.ViewportInitialized != activePersistedViewMode.ViewportInitialized {
		t.Fatal("expected repaired persisted settings project to reproject viewportInitialized")
	}
}

func TestAppStartupFailsClosedOnMissingRequiredSettingsSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	removeSettingsProjectSectionByName(&settingsProject, "spreadsheetSectionDefault")
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	_, err = New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err == nil {
		t.Fatal("expected app startup to fail when a required settings section is missing")
	}
	if !strings.Contains(err.Error(), "Missing settings section spreadsheetSectionDefault.") {
		t.Fatalf("expected missing settings section error, got %v", err)
	}
}

func TestAppStartupBackfillsMissingCodeObjWithinExistingSettingsSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	if err := app.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}

	settingsStore, err := projectstate.NewStore(filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted settings project store: %v", err)
	}
	settingsDocument, err := settingsStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted settings project document: %v", err)
	}
	settingsProject := settingsDocument.Projects[settingsstate.SettingsProjectID]
	if err := removeSettingsProjectCodeObjectByID(
		&settingsProject,
		"settings-section-impl__backend",
		"settings-codeobj__backend__backend__renameRefactorMode",
		"settings-codeobj-variant__backend__backend__renameRefactorMode",
		"settings-codeobj-impl__backend__backend__renameRefactorMode",
		"settings-codeobj-impl__backend__backend",
	); err != nil {
		t.Fatalf("remove settings code object: %v", err)
	}
	settingsDocument.Projects[settingsstate.SettingsProjectID] = settingsProject
	if err := settingsStore.Save(context.Background(), settingsDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}

	restartedApp, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("restart app: %v", err)
	}
	t.Cleanup(func() {
		if err := restartedApp.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown restarted app: %v", err)
		}
	})

	repairedStore, err := projectstate.NewStore(restartedApp.ProjectStates().Paths().Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open repaired settings project store: %v", err)
	}
	repairedDocument, err := repairedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load repaired settings project document: %v", err)
	}
	repairedProject, err := repairedDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("repaired settings project by id: %v", err)
	}
	if _, ok := repairedProject.CodeObjs["settings-codeobj__backend__backend__renameRefactorMode"]; !ok {
		t.Fatal("expected startup repair to restore backend.renameRefactorMode code object")
	}
}

func removeSettingsProjectSectionByName(project *projectstate.Project, sectionName string) {
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		return
	}

	variantID := project.SectionVariantMap[sectionID]
	delete(project.SectionVariantMap, sectionID)
	delete(project.Sections, sectionID)
	delete(project.TopLevelSections, sectionID)
	filteredSectionIDs := make([]string, 0, len(project.TopLevelSectionIDs))
	for _, topLevelSectionID := range project.TopLevelSectionIDs {
		if topLevelSectionID == sectionID {
			continue
		}
		filteredSectionIDs = append(filteredSectionIDs, topLevelSectionID)
	}
	project.TopLevelSectionIDs = filteredSectionIDs

	if variantID != "" {
		sectionVariant := project.SectionVariants[variantID]
		delete(project.SectionVariants, variantID)
		if sectionVariant.ImplID != "" {
			delete(project.SectionImpls, sectionVariant.ImplID)
		}
	}

	for viewModeID, viewMode := range project.ViewModes {
		delete(viewMode.VisibilityBySectionID, sectionID)
		delete(viewMode.TopLevelSections, sectionID)
		project.ViewModes[viewModeID] = viewMode
	}
}

func removeSettingsProjectCodeObjectByID(
	project *projectstate.Project,
	sectionImplID string,
	codeObjID string,
	codeObjVariantID string,
	codeObjImplID string,
	parentCodeObjImplID string,
) error {
	delete(project.CodeObjs, codeObjID)
	delete(project.CodeObjVariants, codeObjVariantID)
	delete(project.CodeObjImpls, codeObjImplID)

	sectionImpl := project.SectionImpls[sectionImplID]
	var sectionPayload map[string]any
	if err := json.Unmarshal(sectionImpl.Payload, &sectionPayload); err != nil {
		return err
	}
	codeObjVariantMap, ok := sectionPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		return errors.New("settings section payload missing codeObjVariantMap")
	}
	delete(codeObjVariantMap, codeObjID)
	encodedSectionPayload, err := json.Marshal(sectionPayload)
	if err != nil {
		return err
	}
	sectionImpl.Payload = encodedSectionPayload
	project.SectionImpls[sectionImplID] = sectionImpl

	parentImpl := project.CodeObjImpls[parentCodeObjImplID]
	var parentPayload map[string]any
	if err := json.Unmarshal(parentImpl.Payload, &parentPayload); err != nil {
		return err
	}
	rawChildren, ok := parentPayload["children"].([]any)
	if !ok {
		return errors.New("settings parent code object payload missing children")
	}
	filteredChildren := make([]string, 0, len(rawChildren))
	for _, rawChild := range rawChildren {
		childID, ok := rawChild.(string)
		if !ok {
			return errors.New("settings parent code object child must be a string")
		}
		if childID == codeObjID {
			continue
		}
		filteredChildren = append(filteredChildren, childID)
	}
	parentPayload["children"] = filteredChildren
	encodedParentPayload, err := json.Marshal(parentPayload)
	if err != nil {
		return err
	}
	parentImpl.Payload = encodedParentPayload
	project.CodeObjImpls[parentCodeObjImplID] = parentImpl
	return nil
}

func settingsProjectViewCodeObjValue(t *testing.T, payload projectview.SingleConfig, implID string) string {
	t.Helper()

	rawPayload, ok := payload.CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected code object impl %q", implID)
	}
	var decoded struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(rawPayload, &decoded); err != nil {
		t.Fatalf("decode code object impl %q: %v", implID, err)
	}
	return decoded.Value
}

func TestAppServesProjectShellRenameAndNotificationRoutes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	notificationStore, err := notifications.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new notification store: %v", err)
	}
	if err := notificationStore.Write([]notifications.Notification{
		{
			ID:              "notification-1",
			ProjectConfigID: "project-alpha",
			Type:            notifications.TypeInfo,
			Message:         "Alpha note",
			Timestamp:       "2026-03-10T10:00:00Z",
		},
	}); err != nil {
		t.Fatalf("seed notifications: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	renameRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigName, strings.NewReader(`{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`))
	if err != nil {
		t.Fatalf("new rename request: %v", err)
	}
	renameRequest.Header.Set("Content-Type", "application/json")
	renameRequest.AddCookie(authCookie)

	renameResponse, err := http.DefaultClient.Do(renameRequest)
	if err != nil {
		t.Fatalf("rename project config: %v", err)
	}
	defer renameResponse.Body.Close()
	if renameResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(renameResponse.Body)
		t.Fatalf("expected rename 200, got %d with body %q", renameResponse.StatusCode, string(body))
	}

	persistedDocumentStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	persistedDocument, err := persistedDocumentStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if got := persistedDocument.Projects["project-alpha"].Name; got != "Renamed Alpha" {
		t.Fatalf("expected persisted renamed project, got %q", got)
	}

	getNotificationsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetNotifications, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new get notifications request: %v", err)
	}
	getNotificationsRequest.Header.Set("Content-Type", "application/json")
	getNotificationsRequest.AddCookie(authCookie)

	getNotificationsResponse, err := http.DefaultClient.Do(getNotificationsRequest)
	if err != nil {
		t.Fatalf("get notifications: %v", err)
	}
	defer getNotificationsResponse.Body.Close()
	if getNotificationsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getNotificationsResponse.Body)
		t.Fatalf("expected notifications 200, got %d with body %q", getNotificationsResponse.StatusCode, string(body))
	}

	var notificationsPayload []notifications.Notification
	if err := json.NewDecoder(getNotificationsResponse.Body).Decode(&notificationsPayload); err != nil {
		t.Fatalf("decode notifications payload: %v", err)
	}
	if len(notificationsPayload) != 1 || notificationsPayload[0].ID != "notification-1" {
		t.Fatalf("unexpected notifications payload %#v", notificationsPayload)
	}

	deleteNotificationRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteNotification, strings.NewReader(`{"notificationId":"notification-1"}`))
	if err != nil {
		t.Fatalf("new delete notification request: %v", err)
	}
	deleteNotificationRequest.Header.Set("Content-Type", "application/json")
	deleteNotificationRequest.AddCookie(authCookie)

	deleteNotificationResponse, err := http.DefaultClient.Do(deleteNotificationRequest)
	if err != nil {
		t.Fatalf("delete notification: %v", err)
	}
	defer deleteNotificationResponse.Body.Close()
	if deleteNotificationResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteNotificationResponse.Body)
		t.Fatalf("expected delete notification 200, got %d with body %q", deleteNotificationResponse.StatusCode, string(body))
	}

	var deleteNotificationPayload httpapi.DeleteNotificationResponse
	if err := json.NewDecoder(deleteNotificationResponse.Body).Decode(&deleteNotificationPayload); err != nil {
		t.Fatalf("decode delete notification payload: %v", err)
	}
	if !deleteNotificationPayload.Success {
		t.Fatalf("expected delete notification success true, got %#v", deleteNotificationPayload)
	}

	remainingNotifications, err := notificationStore.List()
	if err != nil {
		t.Fatalf("list remaining notifications: %v", err)
	}
	if len(remainingNotifications) != 0 {
		t.Fatalf("expected deleted notifications, got %#v", remainingNotifications)
	}
}

func TestAppSetProjectConfigNameRouteBroadcastsProjectAndMetadataUpdates(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	renameRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigName, strings.NewReader(`{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`))
	if err != nil {
		t.Fatalf("new rename request: %v", err)
	}
	renameRequest.Header.Set("Content-Type", "application/json")
	renameRequest.AddCookie(authCookie)

	renameResponse, err := http.DefaultClient.Do(renameRequest)
	if err != nil {
		t.Fatalf("rename project config: %v", err)
	}
	defer renameResponse.Body.Close()
	if renameResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(renameResponse.Body)
		t.Fatalf("expected rename 200, got %d with body %q", renameResponse.StatusCode, string(body))
	}

	var (
		foundProjectUpdate  bool
		foundMetadataUpdate bool
	)
	for range 6 {
		envelope := readAppRouteEnvelope(t, conn)
		switch envelope.MessageType {
		case realtime.MessageTypeUpdateFrontendProjectState:
			var payload realtime.ProjectStateUpdateContent
			if err := json.Unmarshal(envelope.Content, &payload); err != nil {
				t.Fatalf("decode project update payload: %v", err)
			}
			if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
				t.Fatalf("unexpected project update %#v", payload)
			}
			if payload.ProjectState.ProjectConfig.Name != "Renamed Alpha" {
				t.Fatalf("expected renamed project update, got %#v", payload)
			}
			foundProjectUpdate = true
		case realtime.MessageTypeAllProjectMetadata:
			var payload projectshell.AllProjectMetadata
			if err := json.Unmarshal(envelope.Content, &payload); err != nil {
				t.Fatalf("decode metadata update payload: %v", err)
			}
			if len(payload.ProjectMetadata) != 1 || payload.ProjectMetadata[0].Name != "Renamed Alpha" {
				t.Fatalf("unexpected metadata update %#v", payload)
			}
			foundMetadataUpdate = true
		}
		if foundProjectUpdate && foundMetadataUpdate {
			break
		}
	}

	if !foundProjectUpdate {
		t.Fatal("expected project-state websocket update after rename")
	}
	if !foundMetadataUpdate {
		t.Fatal("expected all-project-metadata websocket update after rename")
	}

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeAllProjectMetadata, 250*time.Millisecond)
}

func TestAppSetDefaultProjectRouteBroadcastsMetadataUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		}
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "Beta",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetAsDefaultProject, strings.NewReader(`{"projectConfigId":"project-beta"}`))
	if err != nil {
		t.Fatalf("new set default request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("set default project: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected set default 200, got %d with body %q", response.StatusCode, string(body))
	}

	persistedDocumentStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	persistedDocument, err := persistedDocumentStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if persistedDocument.DefaultProjectID != "project-beta" {
		t.Fatalf("expected persisted default project-beta, got %q", persistedDocument.DefaultProjectID)
	}

	metadataEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 8)
	var metadataPayload projectshell.AllProjectMetadata
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode metadata payload: %v", err)
	}
	if metadataPayload.DefaultProjectConfigID == nil || *metadataPayload.DefaultProjectConfigID != "project-beta" {
		t.Fatalf("expected websocket default project-beta, got %#v", metadataPayload.DefaultProjectConfigID)
	}

	assertNoAppRouteEnvelopeOfType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 250*time.Millisecond)
}

func TestAppServesProjectShellLifecycleRoutes(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		document.Projects["project-alpha"] = appProjectShellTestProjectWithWindowing()
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	createRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteCreateProjectConfig, strings.NewReader(`{"previewImgColor":"bg-orange-500/60 dark:bg-orange-600/30"}`))
	if err != nil {
		t.Fatalf("new create request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("create project config: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected create 200, got %d with body %q", createResponse.StatusCode, string(body))
	}

	var createdName string
	if err := json.NewDecoder(createResponse.Body).Decode(&createdName); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createdName == "" {
		t.Fatal("expected non-empty created name")
	}

	persistedStore, err := projectstate.NewStore(app.ProjectStates().Paths().Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open persisted project store: %v", err)
	}
	persistedDocument, err := persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after create: %v", err)
	}

	createdProjectID := ""
	for projectID, project := range persistedDocument.Projects {
		if project.Name == createdName {
			createdProjectID = projectID
			if len(project.ViewModes) != 1 {
				t.Fatalf("expected created project to have one view mode, got %#v", project.ViewModes)
			}
			assertAppDefaultGeneratedPythonProjectScaffold(t, project)
		}
	}
	if createdProjectID == "" {
		t.Fatalf("expected created project in %#v", persistedDocument.Projects)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.SetProjectName("project-alpha", "Unsaved Alpha"); err != nil {
			return projectstate.Document{}, err
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate runtime before save: %v", err)
	}

	saveRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveProject, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new save request: %v", err)
	}
	saveRequest.Header.Set("Content-Type", "application/json")
	saveRequest.AddCookie(authCookie)

	saveResponse, err := http.DefaultClient.Do(saveRequest)
	if err != nil {
		t.Fatalf("save project: %v", err)
	}
	defer saveResponse.Body.Close()
	if saveResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveResponse.Body)
		t.Fatalf("expected save 200, got %d with body %q", saveResponse.StatusCode, string(body))
	}

	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after save: %v", err)
	}
	if got := persistedDocument.Projects["project-alpha"].Name; got != "Unsaved Alpha" {
		t.Fatalf("expected persisted Unsaved Alpha, got %q", got)
	}

	saveAsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveAsNewProjectConfig, strings.NewReader(`{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true}`))
	if err != nil {
		t.Fatalf("new save-as request: %v", err)
	}
	saveAsRequest.Header.Set("Content-Type", "application/json")
	saveAsRequest.AddCookie(authCookie)

	saveAsResponse, err := http.DefaultClient.Do(saveAsRequest)
	if err != nil {
		t.Fatalf("save as new project config: %v", err)
	}
	defer saveAsResponse.Body.Close()
	if saveAsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveAsResponse.Body)
		t.Fatalf("expected save-as 200, got %d with body %q", saveAsResponse.StatusCode, string(body))
	}

	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after save-as: %v", err)
	}
	clonedProjectID := ""
	for projectID, project := range persistedDocument.Projects {
		if project.Name == "Cloned Alpha" {
			clonedProjectID = projectID
		}
	}
	if clonedProjectID == "" {
		t.Fatalf("expected cloned project in %#v", persistedDocument.Projects)
	}
	clonedProject := persistedDocument.Projects[clonedProjectID]
	if clonedProject.ProjectChatWindowing == nil {
		t.Fatal("expected cloned live windowing state")
	}
	if len(clonedProject.ProjectChatWindowing.Order) != 0 || clonedProject.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected withRefs save-as to seed empty live windowing, got %#v", clonedProject.ProjectChatWindowing)
	}
	if clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID != nil {
		t.Fatalf("expected saved window-space chat id cleared, got %#v", clonedProject.WindowSpaces["space-1"].WindowsByID["chat-window"].ChatID)
	}

	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         "delete-project-terminal",
		ProjectID:  clonedProjectID,
		AllowInput: false,
	}); err != nil {
		t.Fatalf("open terminal session: %v", err)
	}
	if _, ok := app.Terminals().Session("delete-project-terminal"); !ok {
		t.Fatal("expected terminal session to exist before delete")
	}

	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["`+clonedProjectID+`"]}`))
	if err != nil {
		t.Fatalf("new delete request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("delete project configs: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected delete 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	if _, ok := app.Terminals().Session("delete-project-terminal"); ok {
		t.Fatal("expected project delete to reclaim terminal session")
	}

	persistedDocument, err = persistedStore.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document after delete: %v", err)
	}
	if _, ok := persistedDocument.Projects[clonedProjectID]; ok {
		t.Fatalf("expected deleted project removed from persisted document, got %#v", persistedDocument.Projects)
	}
	if _, ok := persistedDocument.Projects[createdProjectID]; !ok {
		t.Fatalf("expected created project to remain after delete, got %#v", persistedDocument.Projects)
	}
}

func TestAppProjectRuntimeCreateProjectDefaultScaffold(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	snapshot, createdProjectID, _, err := app.ProjectStates().Main().CreateProject(
		context.Background(),
		"bg-orange-500/60 dark:bg-orange-600/30",
	)
	if err != nil {
		t.Fatalf("create project through app runtime: %v", err)
	}
	project, err := snapshot.Document.ProjectByID(createdProjectID)
	if err != nil {
		t.Fatalf("lookup created project: %v", err)
	}
	assertAppDefaultGeneratedPythonProjectScaffold(t, project)
}

func assertAppDefaultGeneratedPythonProjectScaffold(t *testing.T, project projectstate.Project) {
	t.Helper()

	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != string(projectstate.CodeLanguagePython) {
		t.Fatalf("expected created project to persist the default python codegen target, got %#v", project.CodegenTargets)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected created project generated code binding")
	}
	if project.GeneratedCodeBinding.Path != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected created project generated code path %q", project.GeneratedCodeBinding.Path)
	}
	if len(project.TopLevelSectionIDs) != 1 || len(project.TopLevelSections) != 1 {
		t.Fatalf("expected created project to persist one top-level generated section, got ids=%#v layouts=%#v", project.TopLevelSectionIDs, project.TopLevelSections)
	}
	sectionID := project.TopLevelSectionIDs[0]
	section, ok := project.Sections[sectionID]
	if !ok {
		t.Fatalf("expected persisted created section %q, got %#v", sectionID, project.Sections)
	}
	if section.Name != "Generated Python Code" {
		t.Fatalf("expected persisted created section name Generated Python Code, got %q", section.Name)
	}
	if project.ProjectChatWindowing == nil {
		t.Fatal("expected persisted created project chat windowing state")
	}
	if len(project.ProjectChatWindowing.InstancesByID) != 0 {
		t.Fatalf("expected no created project chat windows, got %#v", project.ProjectChatWindowing.InstancesByID)
	}
	if len(project.ProjectChatWindowing.Order) != 0 {
		t.Fatalf("expected empty created project chat window order, got %#v", project.ProjectChatWindowing.Order)
	}
	if project.ProjectChatWindowing.NextInstanceNumber != 1 {
		t.Fatalf("expected next instance number 1, got %d", project.ProjectChatWindowing.NextInstanceNumber)
	}
}

func TestAppProjectShellLifecycleRoutesBroadcastMetadataAndSaveNotification(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	createRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteCreateProjectConfig, strings.NewReader(`{"previewImgColor":"bg-orange-500/60 dark:bg-orange-600/30"}`))
	if err != nil {
		t.Fatalf("new create request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)

	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("create project config: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected create 200, got %d with body %q", createResponse.StatusCode, string(body))
	}

	metadataEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 8)
	var metadataPayload projectshell.AllProjectMetadata
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode create metadata payload: %v", err)
	}
	if len(metadataPayload.ProjectMetadata) != 2 {
		t.Fatalf("expected two projects after create, got %#v", metadataPayload.ProjectMetadata)
	}

	saveAsRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveAsNewProjectConfig, strings.NewReader(`{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true}`))
	if err != nil {
		t.Fatalf("new save-as request: %v", err)
	}
	saveAsRequest.Header.Set("Content-Type", "application/json")
	saveAsRequest.AddCookie(authCookie)

	saveAsResponse, err := http.DefaultClient.Do(saveAsRequest)
	if err != nil {
		t.Fatalf("save as new project config: %v", err)
	}
	defer saveAsResponse.Body.Close()
	if saveAsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveAsResponse.Body)
		t.Fatalf("expected save-as 200, got %d with body %q", saveAsResponse.StatusCode, string(body))
	}

	metadataEnvelope = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 8)
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode save-as metadata payload: %v", err)
	}
	clonedProjectID := ""
	foundClonedProject := false
	for _, metadata := range metadataPayload.ProjectMetadata {
		if metadata.Name == "Cloned Alpha" {
			foundClonedProject = true
			clonedProjectID = metadata.ID
		}
	}
	if !foundClonedProject {
		t.Fatalf("expected Cloned Alpha in metadata %#v", metadataPayload.ProjectMetadata)
	}

	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["`+clonedProjectID+`"]}`))
	if err != nil {
		t.Fatalf("new delete request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("delete project configs: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected delete 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	metadataEnvelope = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAllProjectMetadata, 8)
	if err := json.Unmarshal(metadataEnvelope.Content, &metadataPayload); err != nil {
		t.Fatalf("decode delete metadata payload: %v", err)
	}
	for _, metadata := range metadataPayload.ProjectMetadata {
		if metadata.Name == "Cloned Alpha" {
			t.Fatalf("did not expect deleted project in metadata %#v", metadataPayload.ProjectMetadata)
		}
	}

	saveRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSaveProject, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new save request: %v", err)
	}
	saveRequest.Header.Set("Content-Type", "application/json")
	saveRequest.AddCookie(authCookie)

	saveResponse, err := http.DefaultClient.Do(saveRequest)
	if err != nil {
		t.Fatalf("save project: %v", err)
	}
	defer saveResponse.Body.Close()
	if saveResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(saveResponse.Body)
		t.Fatalf("expected save 200, got %d with body %q", saveResponse.StatusCode, string(body))
	}

	notificationEnvelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeNotification, 4)
	var notificationPayload realtime.NotificationContent
	if err := json.Unmarshal(notificationEnvelope.Content, &notificationPayload); err != nil {
		t.Fatalf("decode save notification payload: %v", err)
	}
	if notificationPayload.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected save notification for project-alpha, got %#v", notificationPayload)
	}
	if notificationPayload.Type != realtime.NotificationTypeSave {
		t.Fatalf("expected save notification type, got %#v", notificationPayload)
	}
	if notificationPayload.Message != "Saved!" {
		t.Fatalf("unexpected save notification payload %#v", notificationPayload)
	}
	if notificationPayload.Temporary {
		t.Fatalf("expected non-temporary save notification, got %#v", notificationPayload)
	}
	if notificationPayload.Timestamp == "" {
		t.Fatalf("expected save notification timestamp, got %#v", notificationPayload)
	}
}

func TestAppDeleteProjectConfigsSyncsWatchCodeServiceConfigs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/alpha.py"},
			},
			"project-beta": {
				ID:               "project-beta",
				Name:             "Beta",
				WatchCodeEnabled: true,
				WatchCodeFolders: []projectstate.WatchCodeFolder{
					{Path: "pkg/beta", Recursive: true},
				},
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	expectedBefore := map[string]watchcode.ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Files: []string{
				filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "alpha.py"),
			},
		},
		"project-beta": {
			Enabled: true,
			Folders: []watchcode.FolderInput{
				{Path: filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "beta"), Recursive: true},
			},
		},
	}
	if got := app.watchCode.ConfigSnapshots(); !reflect.DeepEqual(got, expectedBefore) {
		t.Fatalf("expected initial watch code configs %#v, got %#v", expectedBefore, got)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	deleteRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["project-beta"]}`))
	if err != nil {
		t.Fatalf("new delete request: %v", err)
	}
	deleteRequest.Header.Set("Content-Type", "application/json")
	deleteRequest.AddCookie(authCookie)

	deleteResponse, err := http.DefaultClient.Do(deleteRequest)
	if err != nil {
		t.Fatalf("delete project configs: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("expected delete 200, got %d with body %q", deleteResponse.StatusCode, string(body))
	}

	expectedAfter := map[string]watchcode.ConfigSnapshot{
		"project-alpha": {
			Enabled: true,
			Files: []string{
				filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "alpha.py"),
			},
		},
	}
	if got := app.watchCode.ConfigSnapshots(); !reflect.DeepEqual(got, expectedAfter) {
		t.Fatalf("expected watch code configs after delete %#v, got %#v", expectedAfter, got)
	}
}

func appProjectShellTestProjectWithWindowing() projectstate.Project {
	return projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: true,
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
			},
		},
		ActiveViewModeID: "focus",
		WindowSpaces: map[string]projectstate.WindowSpaceConfig{
			"space-1": {
				ID:        "space-1",
				Name:      "Copied Layout",
				SortIndex: 0,
				Order:     []string{"chat-window"},
				WindowsByID: map[string]projectstate.WindowSpaceWindow{
					"chat-window": {
						SurfaceKind:      projectstate.WindowSpaceSurfaceKindProjectChat,
						Mode:             projectstate.ChatWindowModeProjectAI,
						Title:            appProjectShellTestStringPointer("Project Chat"),
						ChatID:           appProjectShellTestStringPointer("saved-chat"),
						ZIndex:           2,
						NormalizedBounds: projectstate.NormalizedFloatingWindowBounds{X: 0.1, Y: 0.2, Width: 0.5, Height: 0.4},
					},
				},
			},
		},
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{
				"project-window": {
					InstanceID: "project-window",
					Placement:  projectstate.ChatWindowPlacementFloating,
					Mode:       projectstate.ChatWindowModeProjectAI,
					Title:      appProjectShellTestStringPointer("Project Chat"),
					ChatID:     appProjectShellTestStringPointer("live-chat"),
					ZIndex:     4,
					Bounds: projectstate.ChatWindowBounds{
						X:      48,
						Y:      64,
						Width:  520,
						Height: 360,
					},
				},
			},
			Order:              []string{"project-window"},
			NextInstanceNumber: 3,
		},
	}
}

func appProjectShellTestStringPointer(value string) *string {
	return &value
}
