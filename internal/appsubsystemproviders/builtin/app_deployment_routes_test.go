package settajsonrenderappgenbackend

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
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appdeploymenthttp"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
)

func TestAppDeploymentRoutePublicNamesRemainFrozen(t *testing.T) {
	t.Parallel()

	if httpapi.RouteAppDeploymentCurrentSession != "/app/deployments/current/session" {
		t.Fatalf("expected app current-session route to remain frozen, got %q", httpapi.RouteAppDeploymentCurrentSession)
	}
	if httpapi.RouteAppDeploymentState != "/app/deployments/{deploymentName}/{version}/state" {
		t.Fatalf("expected app state route to remain frozen, got %q", httpapi.RouteAppDeploymentState)
	}
	if httpapi.RouteAppDeploymentProjectConfig != "/app/deployments/{deploymentName}/{version}/project_config" {
		t.Fatalf("expected app project-config route to remain frozen, got %q", httpapi.RouteAppDeploymentProjectConfig)
	}
}

func TestBuildFrontendHTTPOpenAPIDocumentIncludesPluginAppDeploymentRoutes(t *testing.T) {
	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildAppDeploymentRouteRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}

	currentSession := document.Paths[httpapi.RouteAppDeploymentCurrentSession].Post
	if currentSession == nil {
		t.Fatalf("expected %s post operation", httpapi.RouteAppDeploymentCurrentSession)
	}
	if currentSession.OperationID != "getAppDeploymentCurrentSession" {
		t.Fatalf("app current-session operation id = %q, want %q", currentSession.OperationID, "getAppDeploymentCurrentSession")
	}
	if got := currentSession.Extensions["x-setta-mode-requirement"]; got != "app" {
		t.Fatalf("app current-session mode requirement = %#v, want %q", got, "app")
	}

	state := document.Paths[httpapi.RouteAppDeploymentState].Get
	if state == nil {
		t.Fatalf("expected %s get operation", httpapi.RouteAppDeploymentState)
	}
	if state.OperationID != "getAppDeploymentState" {
		t.Fatalf("app state operation id = %q, want %q", state.OperationID, "getAppDeploymentState")
	}

	projectConfig := document.Paths[httpapi.RouteAppDeploymentProjectConfig].Post
	if projectConfig == nil {
		t.Fatalf("expected %s post operation", httpapi.RouteAppDeploymentProjectConfig)
	}
	if projectConfig.OperationID != "getAppDeploymentProjectConfig" {
		t.Fatalf("app project-config operation id = %q, want %q", projectConfig.OperationID, "getAppDeploymentProjectConfig")
	}
}

func TestRegisterAppDeploymentRoutesCreatesSessionResponse(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
	})

	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)
	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteAppDeploymentCurrentSession, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdeploymenthttp.AppDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app session response: %v", err)
	}
	if payload.ShareSessionID != "generated-app" {
		t.Fatalf("expected generated app session id, got %q", payload.ShareSessionID)
	}
	if payload.DeploymentName != "demo-app" || payload.DeploymentVersion != "v1" {
		t.Fatalf("unexpected app deployment identity %#v", payload)
	}
	if payload.DefaultProjectConfigID != "project-alpha" {
		t.Fatalf("expected default app project id project-alpha, got %q", payload.DefaultProjectConfigID)
	}
	if len(payload.ProjectMetadata) != 2 {
		t.Fatalf("expected two app project metadata entries, got %#v", payload.ProjectMetadata)
	}
	if payload.ProjectMetadata[0].ID != "project-alpha" || payload.ProjectMetadata[1].ID != "project-beta" {
		t.Fatalf("unexpected app project metadata order %#v", payload.ProjectMetadata)
	}
	if !payload.AppPolicy.AllowRun {
		t.Fatal("expected app policy to allow runs")
	}
	if payload.Manifest == nil {
		t.Fatal("expected app bootstrap manifest")
	}
	if payload.Manifest.DeploymentType != deployments.TypeApp {
		t.Fatalf("expected app bootstrap manifest type %q, got %#v", deployments.TypeApp, payload.Manifest)
	}
}

func TestRegisterAppDeploymentRoutesReusesExistingSessionFromHeader(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
	})

	session, err := deploymentRuntime.CreateSessionWithID("app-a")
	if err != nil {
		t.Fatalf("create initial app session: %v", err)
	}
	now = now.Add(2 * time.Minute)

	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)
	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteAppDeploymentCurrentSession, nil)
	request.Header.Set(modes.ShareSessionHeaderName, "app-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdeploymenthttp.AppDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app session response: %v", err)
	}
	if payload.ShareSessionID != "app-a" {
		t.Fatalf("expected reused session id app-a, got %q", payload.ShareSessionID)
	}

	touched, ok := deploymentRuntime.Session("app-a")
	if !ok {
		t.Fatal("expected app session to remain in deployment runtime")
	}
	if !touched.LastSeenAt.After(session.LastSeenAt) {
		t.Fatalf("expected reused session last-seen after %v, got %v", session.LastSeenAt, touched.LastSeenAt)
	}
}

func TestRegisterAppDeploymentRoutesReplacesUnknownSessionID(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
	})

	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)
	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteAppDeploymentCurrentSession, nil)
	request.Header.Set(modes.ShareSessionHeaderName, "missing-session")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdeploymenthttp.AppDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app session response: %v", err)
	}
	if payload.ShareSessionID != "generated-app" {
		t.Fatalf("expected unknown session to be replaced with generated-app, got %q", payload.ShareSessionID)
	}
	if payload.ShareSessionID == "missing-session" {
		t.Fatal("did not expect unknown incoming session id to be reused")
	}
}

func TestRegisterAppDeploymentRoutesCurrentSessionStartsDefaultDeploymentListener(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:         &now,
		GeneratedID: "generated-app",
		ListenerEntrypoint: `def build_listener(listener):
    return None
`,
	})
	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)

	request := httptest.NewRequest(http.MethodPost, "/api"+httpapi.RouteAppDeploymentCurrentSession, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdeploymenthttp.AppDeploymentSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode app current-session response: %v", err)
	}

	waitForPluginAppDeploymentListenerHandleCount(t, deploymentRuntime, 1)
	assertPluginAppDeploymentListenerHandle(t, deploymentRuntime, payload.ShareSessionID, "project-alpha")
}

func TestRegisterAppDeploymentRoutesLoadsAppDeploymentStateWithDefinitionAndSpec(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	appSpecPath := appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("spec.json")
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
		Document: withStoredDocumentAppDefinition(projectstate.Document{
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
		}, mustEncodeStoredAppDefinition(t, &appdefinition.AppDefinition{
			CatalogID:   "catalog-demo",
			AppSpecPath: appSpecPath,
			Routes: []appdefinition.AppRoute{
				{Path: "/", Name: "Home"},
			},
		})),
		ExtraFiles: map[string]any{
			filepath.FromSlash(appSpecPath): map[string]any{
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

	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)
	request := httptest.NewRequest(http.MethodGet, "/api/app/deployments/demo-app/v1/state", nil)
	request.Header.Set(modes.ShareSessionHeaderName, "app-a")
	request = setPluginAppDeploymentRouteParams(request, "demo-app", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdeploymenthttp.AppDeploymentStateResponse
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

func TestRegisterAppDeploymentRoutesLoadsAppDeploymentProjectConfig(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	appSpecPath := appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("spec.json")
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
		Document: withStoredDocumentAppDefinition(projectstate.Document{
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
		}, mustEncodeStoredAppDefinition(t, &appdefinition.AppDefinition{
			AppSpecPath: appSpecPath,
			Routes: []appdefinition.AppRoute{
				{Path: "/"},
			},
		})),
		ExtraFiles: map[string]any{
			filepath.FromSlash(appSpecPath): map[string]any{
				"title": "Demo App",
			},
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("app-a"); err != nil {
		t.Fatalf("create app session: %v", err)
	}

	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/app/deployments/demo-app/v1/project_config",
		strings.NewReader(`{"projectConfigId":"project-beta"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "app-a")
	request = setPluginAppDeploymentRouteParams(request, "demo-app", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload appdeploymenthttp.AppDeploymentStateResponse
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

func TestRegisterAppDeploymentRoutesRejectUnknownFieldsOnProjectConfigLoad(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := openPluginAppDeploymentRuntimeWithOptions(t, pluginAppDeploymentRuntimeOptions{
		Now:            &now,
		GeneratedID:    "generated-app",
		DeploymentName: "demo-app",
	})
	if _, err := deploymentRuntime.CreateSessionWithID("app-a"); err != nil {
		t.Fatalf("create app session: %v", err)
	}

	handler := newAppDeploymentRouteTestHandler(t, deploymentRuntime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/app/deployments/demo-app/v1/project_config",
		strings.NewReader(`{"projectConfigId":"project-alpha","unexpected":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "app-a")
	request = setPluginAppDeploymentRouteParams(request, "demo-app", "v1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid project-config payload 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid project-config response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error code, got %#v", payload)
	}
}

func buildAppDeploymentRouteRegistrationsForTest(
	_ httpapi.FrontendAPIRouteDependencies,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.FrontendAPIRouteRegistrations{
		Deployment: []httpapi.FrontendAPIRouteContribution{
			{
				Family: "app deployment",
				Register: func(router chi.Router) error {
					return RegisterAppDeploymentRoutes(router, httpapi.DeploymentRouteDependencies{
						ModePolicy: modes.NewPolicy(config.ModeApp),
					}, ProviderPluginID)
				},
			},
		},
	}
}

type pluginAppDeploymentRuntimeOptions struct {
	Now                *time.Time
	GeneratedID        string
	DeploymentName     string
	DeploymentVersion  string
	Document           projectstate.Document
	Policy             map[string]any
	ExtraFiles         map[string]any
	ListenerEntrypoint string
}

type pluginAppDeploymentRouteInfoService struct{}

func (pluginAppDeploymentRouteInfoService) ServerMode(context.Context) string {
	return string(config.ModeApp)
}

func (pluginAppDeploymentRouteInfoService) RuntimeInfo(context.Context) httpapi.RuntimeInfo {
	return httpapi.RuntimeInfo{Mode: string(config.ModeApp)}
}

func (pluginAppDeploymentRouteInfoService) SDKRuntimeHandshake(context.Context) pythonsdkcontracts.RunningBackendVersionHandshake {
	return pythonsdkcontracts.RunningBackendVersionHandshake{}
}

func newAppDeploymentRouteTestHandler(t *testing.T, deploymentRuntime *deployments.Runtime) http.Handler {
	t.Helper()

	handler, err := httpapi.NewHandler(httpapi.Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       pluginAppDeploymentRouteInfoService{},
		ModePolicy: modes.NewPolicy(config.ModeApp),
		Register: func(r chi.Router) {
			if err := RegisterAppDeploymentRoutes(r, httpapi.DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeApp),
				Deployment: deploymentRuntime,
			}, ProviderPluginID); err != nil {
				t.Fatalf("register app deployment routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new app deployment route handler: %v", err)
	}
	return handler
}

func openPluginAppDeploymentRuntimeWithOptions(t *testing.T, opts pluginAppDeploymentRuntimeOptions) *deployments.Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	if opts.Now == nil {
		now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
		opts.Now = &now
	}
	if opts.GeneratedID == "" {
		opts.GeneratedID = "generated-app"
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
	writePluginAppDeploymentDocument(t, filepath.Join(root, projectstate.MainFileName), document)

	policy := opts.Policy
	if policy == nil {
		policy = map[string]any{}
	}
	if _, ok := policy["allowRun"]; !ok {
		policy["allowRun"] = true
	}
	deploymentName := opts.DeploymentName
	if deploymentName == "" {
		deploymentName = "demo-app"
	}
	deploymentVersion := opts.DeploymentVersion
	if deploymentVersion == "" {
		deploymentVersion = "v1"
	}
	defaultProjectID := document.DefaultProjectID
	if defaultProjectID == "" {
		defaultProjectID = "project-alpha"
	}
	writePluginAppDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         deploymentName,
		"deploymentType":         "app",
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
	writePluginAppDeploymentJSON(t, filepath.Join(root, "policy.json"), policy)
	for relativePath, payload := range opts.ExtraFiles {
		writePluginAppDeploymentJSON(t, filepath.Join(root, relativePath), payload)
	}
	if strings.TrimSpace(opts.ListenerEntrypoint) != "" {
		writePluginAppDeploymentFile(t, filepath.Join(root, "listener", "app.py"), opts.ListenerEntrypoint)
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
		ListenerPython: pluginAppDeploymentPython(t),
	})
	if err != nil {
		t.Fatalf("open app deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close app deployment runtime: %v", err)
		}
	})
	return deploymentRuntime
}

func setPluginAppDeploymentRouteParams(request *http.Request, deploymentName string, version string) *http.Request {
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("deploymentName", deploymentName)
	routeContext.URLParams.Add("version", version)
	return request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
}

func writePluginAppDeploymentDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize deployment document: %v", err)
	}
	writePluginAppDeploymentJSON(t, path, normalized)
}

func writePluginAppDeploymentJSON(t *testing.T, path string, payload any) {
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

func writePluginAppDeploymentFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir deployment file dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write deployment file: %v", err)
	}
}

func waitForPluginAppDeploymentListenerHandleCount(t *testing.T, runtime *deployments.Runtime, expected int) {
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

func assertPluginAppDeploymentListenerHandle(t *testing.T, runtime *deployments.Runtime, sessionID string, projectID string) {
	t.Helper()

	if !runtime.HasDeploymentListenerHandle(sessionID, projectID) {
		t.Fatalf("expected deployment listener handle for %s/%s", sessionID, projectID)
	}
}

func pluginAppDeploymentPython(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app deployment routes test file")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
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
