package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

func TestRegisterListenerRoutesRejectsUnknownProjectConfig(t *testing.T) {
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

	handler := newListenerRouteTestHandler(t, config.ModeIDE, projectRuntime, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteForceRefreshListener,
		strings.NewReader(`{"projectConfigId":"missing-project"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if payload.Error.Code != "project_config_not_found" {
		t.Fatalf("expected project_config_not_found, got %q", payload.Error.Code)
	}
}

func TestRegisterListenerRoutesShareForceRefreshRequiresSession(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")
	handler := newListenerRouteTestHandler(t, config.ModeShare, nil, deploymentRuntime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteForceRefreshListener,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
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

func newListenerRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterListenerRoutes(r, ListenerRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				ShareSessions: deploymentRuntime,
				ProjectState:  projectRuntime,
				Deployment:    deploymentRuntime,
				ListenerBroadcaster: realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
					WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
				}),
			}); err != nil {
				t.Fatalf("register listener routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}
