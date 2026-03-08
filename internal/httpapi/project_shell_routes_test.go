package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func TestRegisterProjectShellRoutesReturnsAllProjectMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-beta",
		Projects: map[string]projectstate.Project{
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	notificationRuntime := newProjectNotificationRuntimeForTest(t)
	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, notificationRuntime.service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadAllProjectMetadata, strings.NewReader("null"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectshell.AllProjectMetadata
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode all project metadata payload: %v", err)
	}
	if payload.DefaultProjectConfigID == nil || *payload.DefaultProjectConfigID != "project-beta" {
		t.Fatalf("expected default project-beta, got %#v", payload.DefaultProjectConfigID)
	}
	if len(payload.ProjectMetadata) != 2 {
		t.Fatalf("expected two project metadata entries, got %#v", payload.ProjectMetadata)
	}
	if payload.ProjectMetadata[0].ID != "project-alpha" || payload.ProjectMetadata[1].ID != "project-beta" {
		t.Fatalf("unexpected metadata order %#v", payload.ProjectMetadata)
	}
}

func TestRegisterProjectShellRoutesLoadsProjectConfigByName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	notificationRuntime := newProjectNotificationRuntimeForTest(t)
	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, notificationRuntime.service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"Alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectview.SingleConfig
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode project config payload: %v", err)
	}
	if payload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %q", payload.ProjectConfig.ID)
	}
	if payload.ProjectConfig.Name != "Alpha" {
		t.Fatalf("expected Alpha, got %q", payload.ProjectConfig.Name)
	}
}

func TestRegisterProjectShellRoutesReturnsNotFoundForMissingProjectConfig(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	notificationRuntime := newProjectNotificationRuntimeForTest(t)
	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, notificationRuntime.service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadProjectConfig, strings.NewReader(`{"projectConfigName":"Missing"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "project_config_not_found") {
		t.Fatalf("expected project_config_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectShellRoutesBlocksLauncherMode(t *testing.T) {
	t.Parallel()

	handler := newProjectShellRouteTestHandler(t, config.ModeLauncher, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteLoadAllProjectMetadata, strings.NewReader("null"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Launcher mode does not allow this endpoint.") {
		t.Fatalf("unexpected launcher-mode body %q", response.Body.String())
	}
}

func TestRegisterProjectShellRoutesCreatesProjectConfig(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateProjectConfig, strings.NewReader(`{"previewImgColor":"bg-orange-500/60 dark:bg-orange-600/30"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var createdName string
	if err := json.Unmarshal(response.Body.Bytes(), &createdName); err != nil {
		t.Fatalf("decode created project payload: %v", err)
	}
	if createdName != "Project" {
		t.Fatalf("expected created name Project, got %q", createdName)
	}
	if len(projectRuntime.Snapshot().Document.Projects) != 1 {
		t.Fatalf("expected one created project, got %#v", projectRuntime.Snapshot().Document.Projects)
	}
}

func TestRegisterProjectShellRoutesSavesProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntime(t.Context(), store)
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.SetProjectName("project-alpha", "Unsaved Alpha"); err != nil {
			return projectstate.Document{}, err
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSaveProject, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload project store: %v", err)
	}
	if got := reloaded.Projects["project-alpha"].Name; got != "Unsaved Alpha" {
		t.Fatalf("expected persisted Unsaved Alpha, got %q", got)
	}
}

func TestRegisterProjectShellRoutesSaveAsClonesProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(t.Context(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
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
			},
		},
	}); err != nil {
		t.Fatalf("seed project store: %v", err)
	}

	projectRuntime, err := projectstate.OpenRuntime(t.Context(), store)
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSaveAsNewProjectConfig, strings.NewReader(`{"projectConfigId":"project-alpha","newConfigName":"Cloned Alpha","withRefs":true,"frontendOpId":"save-as-op-1"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	reloaded, err := store.Load(t.Context())
	if err != nil {
		t.Fatalf("reload project store: %v", err)
	}
	if len(reloaded.Projects) != 2 {
		t.Fatalf("expected two persisted projects, got %#v", reloaded.Projects)
	}
}

func TestRegisterProjectShellRoutesRejectsInvalidSaveAsNameWithDetail(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSaveAsNewProjectConfig, strings.NewReader(`{"projectConfigId":"project-alpha","newConfigName":"home","withRefs":false}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid save-as payload: %v", err)
	}
	if payload["detail"] != "Project name 'home' is reserved." {
		t.Fatalf("unexpected invalid save-as payload %#v", payload)
	}
}

func TestRegisterProjectShellRoutesDeletesProjectConfigs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-beta",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
			"project-beta": {
				ID:   "project-beta",
				Name: "Beta",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteProjectConfigs, strings.NewReader(`{"ids":["project-beta"]}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	snapshot := projectRuntime.Snapshot()
	if _, ok := snapshot.Document.Projects["project-beta"]; ok {
		t.Fatalf("expected deleted project-beta, got %#v", snapshot.Document.Projects)
	}
	if snapshot.Document.DefaultProjectID != "project-alpha" {
		t.Fatalf("expected default project-alpha, got %q", snapshot.Document.DefaultProjectID)
	}
}

func TestRegisterProjectShellRoutesRenamesProjectConfig(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetProjectConfigName, strings.NewReader(`{"projectConfigId":"project-alpha","newName":"Renamed Alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	if got := projectRuntime.Snapshot().Document.Projects["project-alpha"].Name; got != "Renamed Alpha" {
		t.Fatalf("expected renamed project, got %q", got)
	}
}

func TestRegisterProjectShellRoutesRejectsInvalidProjectRenameWithDetail(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, newProjectNotificationRuntimeForTest(t).service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetProjectConfigName, strings.NewReader(`{"projectConfigId":"project-alpha","newName":"home"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid rename payload: %v", err)
	}
	if payload["detail"] != "Project name 'home' is reserved." {
		t.Fatalf("unexpected invalid rename payload %#v", payload)
	}
}

func TestRegisterProjectShellRoutesReturnsProjectNotifications(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}
	notificationRuntime := newProjectNotificationRuntimeForTest(t)
	if err := notificationRuntime.store.Write([]notifications.Notification{
		{
			ID:              "notification-1",
			ProjectConfigID: "project-alpha",
			Type:            notifications.TypeInfo,
			Message:         "Alpha note",
			Timestamp:       "2026-03-10T10:00:00Z",
		},
		{
			ID:              "notification-2",
			ProjectConfigID: "project-beta",
			Type:            notifications.TypeWarning,
			Message:         "Beta note",
			Timestamp:       "2026-03-10T11:00:00Z",
		},
	}); err != nil {
		t.Fatalf("seed notifications: %v", err)
	}

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, notificationRuntime.service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetNotifications, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload []notifications.Notification
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode notifications payload: %v", err)
	}
	if len(payload) != 1 || payload[0].ID != "notification-1" {
		t.Fatalf("unexpected notifications payload %#v", payload)
	}
}

func TestRegisterProjectShellRoutesDeletesNotification(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	service, err := projectshell.NewService(projectshell.ServiceOptions{ProjectState: projectRuntime})
	if err != nil {
		t.Fatalf("new project shell service: %v", err)
	}
	notificationRuntime := newProjectNotificationRuntimeForTest(t)
	if err := notificationRuntime.store.Write([]notifications.Notification{
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

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service, notificationRuntime.service)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteNotification, strings.NewReader(`{"notificationId":"notification-1"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	remaining, err := notificationRuntime.store.List()
	if err != nil {
		t.Fatalf("list remaining notifications: %v", err)
	}
	if len(remaining) != 0 {
		t.Fatalf("expected notification delete, got %#v", remaining)
	}
}

func newProjectShellRouteTestHandler(t *testing.T, mode config.Mode, shell ProjectShellService, notificationService ProjectNotificationService) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectShellRoutes(r, ProjectShellRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				Shell:         shell,
				Notifications: notificationService,
			}); err != nil {
				t.Fatalf("register project shell routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

type projectNotificationRuntimeForTest struct {
	store   *notifications.Store
	service *notifications.Service
}

func newProjectNotificationRuntimeForTest(t *testing.T) projectNotificationRuntimeForTest {
	t.Helper()

	store, err := notifications.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new notification store: %v", err)
	}
	service, err := notifications.NewService(notifications.ServiceOptions{Store: store})
	if err != nil {
		t.Fatalf("new notification service: %v", err)
	}
	return projectNotificationRuntimeForTest{
		store:   store,
		service: service,
	}
}
