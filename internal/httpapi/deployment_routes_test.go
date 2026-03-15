package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterDeploymentRoutesCreatesShareSession(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterDeploymentRoutes(r, DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeShare),
				Deployment: deploymentRuntime,
			}); err != nil {
				t.Fatalf("register deployment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteShareDeploymentCurrentSession, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ShareDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share session response: %v", err)
	}
	if payload.ShareSessionID != "generated-share" {
		t.Fatalf("expected generated share session id, got %q", payload.ShareSessionID)
	}
	if payload.DeploymentName != "demo-share" || payload.DeploymentVersion != "v1" {
		t.Fatalf("unexpected deployment identity %#v", payload)
	}
	if payload.DefaultProjectConfigID != "project-alpha" {
		t.Fatalf("expected default project id project-alpha, got %q", payload.DefaultProjectConfigID)
	}
	if len(payload.ProjectMetadata) != 2 {
		t.Fatalf("expected two project metadata entries, got %#v", payload.ProjectMetadata)
	}
	if !deploymentRuntime.HasSession(payload.ShareSessionID) {
		t.Fatal("expected created share session to exist in deployment runtime")
	}
}

func TestRegisterDeploymentRoutesReusesExistingShareSessionFromHeader(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")

	session, err := deploymentRuntime.CreateSessionWithID("share-a")
	if err != nil {
		t.Fatalf("create initial session: %v", err)
	}
	now = now.Add(2 * time.Minute)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterDeploymentRoutes(r, DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeShare),
				Deployment: deploymentRuntime,
			}); err != nil {
				t.Fatalf("register deployment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteShareDeploymentCurrentSession, nil)
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ShareDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share session response: %v", err)
	}
	if payload.ShareSessionID != "share-a" {
		t.Fatalf("expected reused session id share-a, got %q", payload.ShareSessionID)
	}

	touched, ok := deploymentRuntime.Session("share-a")
	if !ok {
		t.Fatal("expected share session to remain in deployment runtime")
	}
	if !touched.LastSeenAt.After(session.LastSeenAt) {
		t.Fatalf("expected reused session last-seen after %v, got %v", session.LastSeenAt, touched.LastSeenAt)
	}
}

func TestRegisterDeploymentRoutesReplacesUnknownShareSessionID(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterDeploymentRoutes(r, DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeShare),
				Deployment: deploymentRuntime,
			}); err != nil {
				t.Fatalf("register deployment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteShareDeploymentCurrentSession, nil)
	request.Header.Set(modes.ShareSessionHeaderName, "missing-session")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ShareDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share session response: %v", err)
	}
	if payload.ShareSessionID != "generated-share" {
		t.Fatalf("expected unknown session to be replaced with generated-share, got %q", payload.ShareSessionID)
	}
	if payload.ShareSessionID == "missing-session" {
		t.Fatal("did not expect unknown incoming session id to be reused")
	}
}

func TestRegisterDeploymentRoutesCreatesAppSessionResponse(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeApp, &now, "generated-app")

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "app", info: RuntimeInfo{Mode: "app"}},
		ModePolicy: modes.NewPolicy(config.ModeApp),
		Register: func(r chi.Router) {
			if err := RegisterDeploymentRoutes(r, DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeApp),
				Deployment: deploymentRuntime,
			}); err != nil {
				t.Fatalf("register deployment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteAppDeploymentCurrentSession, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload AppDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app session response: %v", err)
	}
	if payload.ShareSessionID != "generated-app" {
		t.Fatalf("expected generated app session id, got %q", payload.ShareSessionID)
	}
	if !payload.AppPolicy.AllowRun {
		t.Fatal("expected app policy to allow runs")
	}
}

func TestRegisterDeploymentRoutesCurrentSessionStartsDefaultDeploymentListener(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        config.ModeApp,
		Now:         &now,
		GeneratedID: "generated-app",
		ListenerEntrypoint: `def build_listener(listener):
    return None
`,
	})
	handler := newDeploymentRouteTestHandler(t, config.ModeApp, deploymentRuntime)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteAppDeploymentCurrentSession, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload AppDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app current-session response: %v", err)
	}

	waitForHTTPDeploymentListenerHandleCount(t, deploymentRuntime, 1)
	assertHTTPDeploymentListenerHandle(t, deploymentRuntime, payload.ShareSessionID, "project-alpha")
}

func TestRegisterDeploymentRoutesLoadsShareDeploymentStateFromOverlaySession(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        config.ModeShare,
		Now:         &now,
		GeneratedID: "generated-share",
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("resolve share overlay: %v", err)
	}
	if _, err := overlay.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.Name = "Alpha Overlay"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate share overlay: %v", err)
	}

	handler := newDeploymentRouteTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(http.MethodGet, "/api/share/deployments/demo-share/v1/state", nil)
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	request = setDeploymentRouteParams(request, "demo-share", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload deploymentProjectStateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share state response: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected default project config id project-alpha, got %q", payload.ProjectState.ProjectConfig.ID)
	}
	if payload.ProjectState.ProjectConfig.Name != "Alpha Overlay" {
		t.Fatalf("expected overlay project name Alpha Overlay, got %q", payload.ProjectState.ProjectConfig.Name)
	}
	if len(payload.CompletedOpIDs) != 0 || len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected empty op ids, got completed=%v pending=%v", payload.CompletedOpIDs, payload.PendingOpIDs)
	}
}

func TestRegisterDeploymentRoutesLoadsShareDeploymentProjectConfig(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        config.ModeShare,
		Now:         &now,
		GeneratedID: "generated-share",
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newDeploymentRouteTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/share/deployments/demo-share/v1/project_config",
		strings.NewReader(`{"projectConfigId":"project-beta"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	request = setDeploymentRouteParams(request, "demo-share", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload deploymentProjectStateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share project config response: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-beta" {
		t.Fatalf("expected project-beta config, got %q", payload.ProjectState.ProjectConfig.ID)
	}
}

func TestRegisterDeploymentRoutesShareProjectConfigStartsExplicitDeploymentListener(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        config.ModeShare,
		Now:         &now,
		GeneratedID: "generated-share",
		ListenerEntrypoint: `def build_listener(listener):
    return None
`,
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	handler := newDeploymentRouteTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(http.MethodPost, "/api/share/deployments/demo-share/v1/project_config", strings.NewReader(`{"projectConfigId":"project-beta"}`))
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	request = setDeploymentRouteParams(request, "demo-share", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	waitForHTTPDeploymentListenerHandleCount(t, deploymentRuntime, 1)
	assertHTTPDeploymentListenerHandle(t, deploymentRuntime, "share-a", "project-beta")
}

func TestRegisterDeploymentRoutesShareStateRequiresSession(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")
	handler := newDeploymentRouteTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(http.MethodGet, "/api/share/deployments/demo-share/v1/state", nil)
	request = setDeploymentRouteParams(request, "demo-share", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing session response: %v", err)
	}
	if payload.Error.Code != "missing_share_session" {
		t.Fatalf("expected missing_share_session, got %q", payload.Error.Code)
	}
}

func TestRegisterDeploymentRoutesShareProjectConfigRejectsUnknownConfig(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	handler := newDeploymentRouteTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/share/deployments/demo-share/v1/project_config",
		strings.NewReader(`{"projectConfigId":"missing-project"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	request = setDeploymentRouteParams(request, "demo-share", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode unknown config response: %v", err)
	}
	if payload.Error.Code != "project_config_not_found" {
		t.Fatalf("expected project_config_not_found, got %q", payload.Error.Code)
	}
}

func TestRegisterDeploymentRoutesRejectUnknownFieldsOnProjectConfigLoad(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name           string
		mode           config.Mode
		sessionID      string
		path           string
		deploymentName string
		body           string
	}{
		{
			name:           "share project config",
			mode:           config.ModeShare,
			sessionID:      "share-a",
			path:           "/api/share/deployments/demo-share/v1/project_config",
			deploymentName: "demo-share",
			body:           `{"projectConfigId":"project-alpha","unexpected":true}`,
		},
		{
			name:           "app project config",
			mode:           config.ModeApp,
			sessionID:      "app-a",
			path:           "/api/app/deployments/demo-app/v1/project_config",
			deploymentName: "demo-app",
			body:           `{"projectConfigId":"project-alpha","unexpected":true}`,
		},
	}

	for _, testCase := range tests {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:           testCase.mode,
				Now:            &now,
				GeneratedID:    "generated-" + string(testCase.mode),
				DeploymentName: testCase.deploymentName,
			})
			if _, err := deploymentRuntime.CreateSessionWithID(testCase.sessionID); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newDeploymentRouteTestHandler(t, testCase.mode, deploymentRuntime)

			request := httptest.NewRequest(http.MethodPost, testCase.path, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, testCase.sessionID)
			request = setDeploymentRouteParams(request, testCase.deploymentName, "v1")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected invalid project-config payload 400, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode invalid project-config response: %v", err)
			}
			if payload.Error.Code != "invalid_json" {
				t.Fatalf("expected invalid_json error code, got %#v", payload)
			}
		})
	}
}

func TestRegisterDeploymentRoutesLoadsAppDeploymentStateWithDefinitionAndSpec(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:           config.ModeApp,
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
		Document: projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			AppDefinition: &projectstate.AppDefinition{
				CatalogID:   "catalog-demo",
				AppSpecPath: "app_specs/spec.json",
				Routes: []projectstate.AppRoute{
					{Path: "/", Name: "Home"},
				},
			},
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
		},
		ExtraFiles: map[string]any{
			filepath.Join("app_specs", "spec.json"): map[string]any{
				"title": "Demo App",
				"pages": []any{
					map[string]any{"path": "/"},
				},
			},
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("app-a"); err != nil {
		t.Fatalf("create app session: %v", err)
	}

	handler := newDeploymentRouteTestHandler(t, config.ModeApp, deploymentRuntime)

	request := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-app/v1/state", nil)
	request.Header.Set(modes.ShareSessionHeaderName, "app-a")
	request = setDeploymentRouteParams(request, "demo-app", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appDeploymentStateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app state response: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected default app project id project-alpha, got %q", payload.ProjectState.ProjectConfig.ID)
	}
	if payload.AppDefinition == nil || payload.AppDefinition.CatalogID != "catalog-demo" {
		t.Fatalf("expected app definition with catalog-demo, got %#v", payload.AppDefinition)
	}
	specObject, ok := payload.AppSpec.(map[string]any)
	if !ok {
		t.Fatalf("expected app spec object, got %#v", payload.AppSpec)
	}
	if specObject["title"] != "Demo App" {
		t.Fatalf("expected app spec title Demo App, got %#v", payload.AppSpec)
	}
	if !payload.AppPolicy.AllowRun {
		t.Fatal("expected app policy to allow runs")
	}
}

func TestRegisterDeploymentRoutesLoadsAppDeploymentProjectConfig(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:           config.ModeApp,
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
		Document: projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			AppDefinition: &projectstate.AppDefinition{
				AppSpecPath: "app_specs/spec.json",
				Routes: []projectstate.AppRoute{
					{Path: "/"},
				},
			},
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
		},
		ExtraFiles: map[string]any{
			filepath.Join("app_specs", "spec.json"): map[string]any{
				"title": "Demo App",
			},
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("app-a"); err != nil {
		t.Fatalf("create app session: %v", err)
	}

	handler := newDeploymentRouteTestHandler(t, config.ModeApp, deploymentRuntime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/app/deployments/demo-app/v1/project_config",
		strings.NewReader(`{"projectConfigId":"project-beta"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "app-a")
	request = setDeploymentRouteParams(request, "demo-app", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appDeploymentStateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app project config response: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-beta" {
		t.Fatalf("expected project-beta config, got %q", payload.ProjectState.ProjectConfig.ID)
	}
	if payload.AppDefinition == nil {
		t.Fatal("expected app definition on app project config response")
	}
}

type httpTestDeploymentRuntimeOptions struct {
	Mode               config.Mode
	Now                *time.Time
	GeneratedID        string
	DeploymentName     string
	DeploymentVersion  string
	Document           projectstate.Document
	Policy             map[string]any
	ExtraFiles         map[string]any
	ListenerEntrypoint string
}

func newDeploymentRouteTestHandler(t *testing.T, mode config.Mode, deploymentRuntime *deployments.Runtime) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterDeploymentRoutes(r, DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Deployment: deploymentRuntime,
			}); err != nil {
				t.Fatalf("register deployment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newHTTPTestDeploymentRuntime(t *testing.T, mode config.Mode, now *time.Time, generatedID string) *deployments.Runtime {
	t.Helper()
	return newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:        mode,
		Now:         now,
		GeneratedID: generatedID,
	})
}

func newHTTPTestDeploymentRuntimeWithOptions(t *testing.T, opts httpTestDeploymentRuntimeOptions) *deployments.Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	if opts.Now == nil {
		now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
		opts.Now = &now
	}
	if opts.GeneratedID == "" {
		opts.GeneratedID = "generated-session"
	}
	document := opts.Document
	if document.SchemaVersion == 0 {
		document = projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
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
		}
	}
	writeHTTPDeploymentDocument(t, filepath.Join(root, projectstate.MainFileName), document)

	deploymentType := "share"
	policy := opts.Policy
	if policy == nil {
		policy = map[string]any{}
	}
	if opts.Mode == config.ModeApp {
		deploymentType = "app"
		if _, ok := policy["allowRun"]; !ok {
			policy["allowRun"] = true
		}
	}
	deploymentName := opts.DeploymentName
	if deploymentName == "" {
		deploymentName = "demo-share"
	}
	deploymentVersion := opts.DeploymentVersion
	if deploymentVersion == "" {
		deploymentVersion = "v1"
	}
	defaultProjectID := document.DefaultProjectID
	if defaultProjectID == "" {
		defaultProjectID = "project-alpha"
	}
	writeHTTPDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         deploymentName,
		"deploymentType":         deploymentType,
		"defaultProjectConfigId": defaultProjectID,
		"deploymentVersion":      deploymentVersion,
		"listener": func() any {
			if strings.TrimSpace(opts.ListenerEntrypoint) == "" {
				return nil
			}
			return map[string]any{
				"entrypoint": "listener/app.py",
				"enabled":    true,
			}
		}(),
	})
	writeHTTPDeploymentJSON(t, filepath.Join(root, "policy.json"), policy)
	for relativePath, payload := range opts.ExtraFiles {
		writeHTTPDeploymentJSON(t, filepath.Join(root, relativePath), payload)
	}
	if strings.TrimSpace(opts.ListenerEntrypoint) != "" {
		writeHTTPDeploymentFile(t, filepath.Join(root, "listener", "app.py"), opts.ListenerEntrypoint)
	}

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return (*opts.Now).UTC()
		},
		IDGenerator: func() string {
			return opts.GeneratedID
		},
		ListenerHost:   "127.0.0.1",
		ListenerPort:   65535,
		ListenerPython: httpTestDeploymentPython(t),
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func setDeploymentRouteParams(request *http.Request, deploymentName string, version string) *http.Request {
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("deploymentName", deploymentName)
	routeContext.URLParams.Add("version", version)
	return request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
}

func writeHTTPDeploymentDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize deployment document: %v", err)
	}
	writeHTTPDeploymentJSON(t, path, normalized)
}

func writeHTTPDeploymentJSON(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal deployment json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment json dir: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write deployment json: %v", err)
	}
}

func writeHTTPDeploymentFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment file dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write deployment file: %v", err)
	}
}

func waitForHTTPDeploymentListenerHandleCount(t *testing.T, runtime *deployments.Runtime, expected int) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if runtime.DeploymentListenerHandleCount() == expected {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Fatalf("expected %d deployment listener handles, got %d", expected, runtime.DeploymentListenerHandleCount())
}

func assertHTTPDeploymentListenerHandle(t *testing.T, runtime *deployments.Runtime, sessionID string, projectID string) {
	t.Helper()

	if !runtime.HasDeploymentListenerHandle(sessionID, projectID) {
		t.Fatalf("expected deployment listener handle for %s/%s", sessionID, projectID)
	}
}

func httpTestDeploymentPython(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve deployment routes test file")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return ""
}
