package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
	"setta/internal/workspacelaunch"
)

func TestRegisterWorkspaceLaunchRoutesCreatesIntent(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: currentSession.Metadata.RuntimeRoot,
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	intentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
		RuntimeRoot:    currentSession.Metadata.RuntimeRoot,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.Mode(currentSession.Metadata.ServerMode)),
		Auth:       authService,
		Intents:    intentService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"/tmp/workspace"},"returnUrl":"http://127.0.0.1:3000/home"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://127.0.0.1:3000")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload createWorkspaceLaunchIntentResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !payload.Ok || payload.LaunchIntentToken == nil || strings.TrimSpace(*payload.LaunchIntentToken) == "" {
		t.Fatalf("expected launch intent token payload, got %#v", payload)
	}
	if payload.RequestedAt == nil || *payload.RequestedAt <= 0 {
		t.Fatalf("expected requestedAt, got %#v", payload)
	}
}

func TestRegisterWorkspaceLaunchRoutesRejectsNestedIntentToken(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: currentSession.Metadata.RuntimeRoot,
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	intentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
		RuntimeRoot:    currentSession.Metadata.RuntimeRoot,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.Mode(currentSession.Metadata.ServerMode)),
		Auth:       authService,
		Intents:    intentService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"launchIntentToken":"nested","workspaceRoot":"/tmp/workspace"},"returnUrl":"http://127.0.0.1:3000/home"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://127.0.0.1:3000")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload createWorkspaceLaunchIntentResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Ok {
		t.Fatalf("expected failure payload, got %#v", payload)
	}
	if payload.Error == nil || payload.Error.Code != "BadRequest" {
		t.Fatalf("expected bad request payload, got %#v", payload)
	}
}

func TestRegisterWorkspaceLaunchRoutesSkipsDeploymentMode(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Auth:       newTestAuthService(t),
		Intents:    &workspacelaunch.IntentService{},
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, RouteCreateWorkspaceLaunchIntent, nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected route to be absent in deployment mode, got %d", response.Code)
	}
}
