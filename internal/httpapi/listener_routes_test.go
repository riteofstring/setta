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

	handler := newListenerRouteTestHandler(t, config.ModeIDE, projectRuntime, nil, nil)

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
	handler := newListenerRouteTestHandler(t, config.ModeShare, nil, deploymentRuntime, nil)

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

func TestRegisterListenerRoutesReturnsCoverageSnapshot(t *testing.T) {
	t.Parallel()

	// The listener coverage route should expose the current registry state in
	// the structured dependency-key format the frontend already consumes.
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

	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
	})
	if err := broadcaster.Registry().UpsertRegistration(
		"listener-a",
		"project-alpha",
		map[string]realtime.ListenerCallback{
			"cb-param": {
				Dependencies:   []string{"section-a.param-a"},
				DependencyMode: realtime.ListenerDependencyModeAlways,
			},
			"cb-refresh-only": {
				Dependencies:   []string{"section-b"},
				DependencyMode: realtime.ListenerDependencyModeRefreshOnly,
			},
		},
		"",
	); err != nil {
		t.Fatalf("register listener: %v", err)
	}
	handler := newListenerRouteTestHandler(t, config.ModeIDE, projectRuntime, nil, broadcaster)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetListenerCoverage,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload realtime.ListenerCoverageSnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode listener coverage response: %v", err)
	}
	if payload.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha snapshot, got %q", payload.ProjectID)
	}
	if payload.HasRealtimeWildcard {
		t.Fatal("expected no realtime wildcard")
	}
	if len(payload.Dependencies) != 1 {
		t.Fatalf("expected 1 dependency, got %#v", payload.Dependencies)
	}
	if payload.Dependencies[0] != (realtime.ListenerCoverageDependency{Type: realtime.DependencyKeyTypeSectionParam, SectionID: "section-a", CodeObjID: "param-a"}) {
		t.Fatalf("unexpected dependency %#v", payload.Dependencies[0])
	}
}

func TestRegisterListenerRoutesShareCoverageRespectsSessionScope(t *testing.T) {
	t.Parallel()

	// Share-mode coverage reads should include matching-session plus shared
	// registrations and exclude other deployment sessions.
	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	deploymentRuntime := newHTTPTestDeploymentRuntime(t, config.ModeShare, &now, "generated-share")
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
	})
	for _, registration := range []struct {
		connectionID   string
		shareSessionID string
		dependency     string
	}{
		{connectionID: "listener-share-a", shareSessionID: "share-a", dependency: "section-a"},
		{connectionID: "listener-share-b", shareSessionID: "share-b", dependency: "section-b"},
		{connectionID: "listener-shared", shareSessionID: "", dependency: "section-shared"},
	} {
		if err := broadcaster.Registry().UpsertRegistration(
			registration.connectionID,
			"project-alpha",
			map[string]realtime.ListenerCallback{
				"cb": {
					Dependencies:   []string{registration.dependency},
					DependencyMode: realtime.ListenerDependencyModeAlways,
				},
			},
			registration.shareSessionID,
		); err != nil {
			t.Fatalf("register %s: %v", registration.connectionID, err)
		}
	}

	handler := newListenerRouteTestHandler(t, config.ModeShare, nil, deploymentRuntime, broadcaster)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetListenerCoverage,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload realtime.ListenerCoverageSnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share listener coverage response: %v", err)
	}
	if len(payload.Dependencies) != 2 {
		t.Fatalf("expected 2 dependencies, got %#v", payload.Dependencies)
	}
	if payload.Dependencies[0] != (realtime.ListenerCoverageDependency{Type: realtime.DependencyKeyTypeSection, SectionID: "section-a"}) {
		t.Fatalf("unexpected first dependency %#v", payload.Dependencies[0])
	}
	if payload.Dependencies[1] != (realtime.ListenerCoverageDependency{Type: realtime.DependencyKeyTypeSection, SectionID: "section-shared"}) {
		t.Fatalf("unexpected second dependency %#v", payload.Dependencies[1])
	}
}

func newListenerRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	broadcaster *realtime.ListenerBroadcaster,
) http.Handler {
	t.Helper()

	if broadcaster == nil {
		broadcaster = realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
			WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterListenerRoutes(r, ListenerRouteDependencies{
				ModePolicy:          modes.NewPolicy(mode),
				ShareSessions:       deploymentRuntime,
				ProjectState:        projectRuntime,
				Deployment:          deploymentRuntime,
				ListenerBroadcaster: broadcaster,
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
