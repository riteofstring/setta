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

func newHTTPTestDeploymentRuntime(t *testing.T, mode config.Mode, now *time.Time, generatedID string) *deployments.Runtime {
	t.Helper()

	root := t.TempDir()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	document := projectstate.Document{
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
	writeHTTPDeploymentDocument(t, filepath.Join(root, projectstate.MainFileName), document)

	deploymentType := "share"
	policy := map[string]any{}
	if mode == config.ModeApp {
		deploymentType = "app"
		policy["allowRun"] = true
	}
	writeHTTPDeploymentJSON(t, filepath.Join(root, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         deploymentType,
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	})
	writeHTTPDeploymentJSON(t, filepath.Join(root, "policy.json"), policy)

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: root,
		RuntimeRoot:    runtimeRoot,
		Now: func() time.Time {
			return (*now).UTC()
		},
		IDGenerator: func() string {
			return generatedID
		},
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
