package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
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

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service)
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

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service)
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

	handler := newProjectShellRouteTestHandler(t, config.ModeIDE, service)
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

	handler := newProjectShellRouteTestHandler(t, config.ModeLauncher, nil)
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

func newProjectShellRouteTestHandler(t *testing.T, mode config.Mode, shell ProjectShellService) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectShellRoutes(r, ProjectShellRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Shell:      shell,
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
