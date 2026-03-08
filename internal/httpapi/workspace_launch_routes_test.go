package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/modes"
	"setta/internal/workspacelaunch"
)

type httpTestSessionLauncher struct {
	captured []launcher.IDELaunchInput
	result   launcher.IDELaunchResult
	err      error
}

func (s *httpTestSessionLauncher) EnsureSession(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
	s.captured = append(s.captured, input)
	if s.err != nil {
		return launcher.IDELaunchResult{}, s.err
	}
	return s.result, nil
}

func TestRegisterWorkspaceLaunchRoutesCreatesIntent(t *testing.T) {
	t.Parallel()

	authService, _, intentService, launchService := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       authService,
		Intents:    intentService,
		Launch:     launchService,
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

	authService, _, intentService, launchService := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       authService,
		Intents:    intentService,
		Launch:     launchService,
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

func TestRegisterWorkspaceLaunchRoutesLaunchesWorkspaceFromIntent(t *testing.T) {
	t.Parallel()

	authService, trustedOrigins, intentService, launchService := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       authService,
		Intents:    intentService,
		Launch:     launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	intentRequest := httptest.NewRequest(
		http.MethodPost,
		RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"/tmp/workspace"},"returnUrl":"http://launcher.example:7999/home"}`),
	)
	intentRequest.Header.Set("Content-Type", "application/json")
	intentRequest.Header.Set("Origin", "http://launcher.example:7999")
	intentResponse := httptest.NewRecorder()
	router.ServeHTTP(intentResponse, intentRequest)
	if intentResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", intentResponse.Code, intentResponse.Body.String())
	}

	var intentPayload createWorkspaceLaunchIntentResponse
	if err := json.Unmarshal(intentResponse.Body.Bytes(), &intentPayload); err != nil {
		t.Fatalf("decode intent response: %v", err)
	}
	if !intentPayload.Ok || intentPayload.LaunchIntentToken == nil {
		t.Fatalf("expected launch intent token, got %#v", intentPayload)
	}

	launchRequest := httptest.NewRequest(
		http.MethodPost,
		RouteLaunch,
		strings.NewReader(`{"launchIntentToken":"`+*intentPayload.LaunchIntentToken+`"}`),
	)
	launchRequest.Header.Set("Content-Type", "application/json")
	launchRequest.Header.Set("Origin", "http://launcher.example:7999")
	launchResponseRecorder := httptest.NewRecorder()
	router.ServeHTTP(launchResponseRecorder, launchRequest)
	if launchResponseRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", launchResponseRecorder.Code, launchResponseRecorder.Body.String())
	}

	var payload launchResponse
	if err := json.Unmarshal(launchResponseRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode launch response: %v", err)
	}
	if !payload.Ok || payload.BootstrapURLFragment == nil {
		t.Fatalf("expected successful launch payload, got %#v", payload)
	}
	if payload.ReturnURL == nil || *payload.ReturnURL != "http://launcher.example:7999/home" {
		t.Fatalf("expected stored return URL, got %#v", payload.ReturnURL)
	}
	if payload.Session == nil || payload.Session.ID != "workspace-session" {
		t.Fatalf("expected session payload, got %#v", payload.Session)
	}
	if !trustedOrigins.IsTrustedOrigin("http://127.0.0.1:61234", "abc123") {
		t.Fatal("expected launched workspace origin to be trusted for current session")
	}
}

func TestRegisterWorkspaceLaunchRoutesRequiresIntentToken(t *testing.T) {
	t.Parallel()

	authService, _, intentService, launchService := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       authService,
		Intents:    intentService,
		Launch:     launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		RouteLaunch,
		strings.NewReader(`{"workspaceRoot":"/tmp/workspace"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://launcher.example:7999")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launchResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode launch response: %v", err)
	}
	if payload.Ok {
		t.Fatalf("expected failure payload, got %#v", payload)
	}
	if payload.Error == nil || payload.Error.Code != "BadRequest" {
		t.Fatalf("expected bad request error payload, got %#v", payload)
	}
	if payload.ReturnURL == nil || *payload.ReturnURL != "http://launcher.example:7999/home" {
		t.Fatalf("expected safe return URL, got %#v", payload.ReturnURL)
	}
}

func TestRegisterWorkspaceLaunchRoutesRejectsInlineOverrides(t *testing.T) {
	t.Parallel()

	authService, _, intentService, launchService := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       authService,
		Intents:    intentService,
		Launch:     launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		RouteLaunch,
		strings.NewReader(`{"launchIntentToken":"token","workspaceRoot":"/tmp/workspace"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://launcher.example:7999")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload launchResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode launch response: %v", err)
	}
	if payload.Ok {
		t.Fatalf("expected failure payload, got %#v", payload)
	}
	if payload.Error == nil || payload.Error.Code != "BadRequest" {
		t.Fatalf("expected bad request error payload, got %#v", payload)
	}
}

func TestRegisterWorkspaceLaunchRoutesSkipsDeploymentMode(t *testing.T) {
	t.Parallel()

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Auth:       newTestAuthService(t),
		Intents:    &workspacelaunch.IntentService{},
		Launch:     &workspacelaunch.LocalLaunchService{},
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, RouteCreateWorkspaceLaunchIntent, nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected route to be absent in deployment mode, got %d", response.Code)
	}
}

func newWorkspaceLaunchTestServices(t *testing.T) (*auth.Service, *frontendorigins.Service, *workspacelaunch.IntentService, *workspacelaunch.LocalLaunchService) {
	t.Helper()

	authService := newTestAuthService(t)
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	now := time.Unix(1_710_000_000, 0).UTC()
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: currentSession.Metadata.RuntimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	intentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
		RuntimeRoot:    currentSession.Metadata.RuntimeRoot,
		TrustedOrigins: trustedOrigins,
		Now:            func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	sessions := &httpTestSessionLauncher{
		result: launcher.IDELaunchResult{
			Session: auth.SessionMetadata{
				ID:                     "workspace-session",
				WorkspacePath:          "/tmp/workspace",
				WorkspacePathCanonical: "/tmp/workspace",
				Host:                   "127.0.0.1",
				Port:                   61234,
				PID:                    12345,
				StartedAt:              now,
			},
			Secret: []byte("workspace-secret"),
			Paths: config.Paths{
				WorkspaceRoot:         "/tmp/workspace",
				SettaHome:             "/tmp/.setta",
				SettaFilesRoot:        "/tmp/workspace/setta_files",
				ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
				RuntimeRoot:           "/tmp/workspace/setta_files/runtime",
			},
			StartedNew: true,
		},
	}
	launchService, err := workspacelaunch.NewLocalLaunchService(workspacelaunch.LocalLaunchServiceOptions{
		DefaultSettaHome: "/tmp/.setta",
		Intents:          intentService,
		TrustedOrigins:   trustedOrigins,
		Sessions:         sessions,
		Now:              func() time.Time { return now },
		MintBootstrapToken: func(sessionID string, secret []byte, issuedAt time.Time) (string, error) {
			if sessionID == "" || len(secret) == 0 || issuedAt.IsZero() {
				return "", auth.ErrInvalidBootstrapToken
			}
			return "tok", nil
		},
		ResolveLauncherSessionAuthExpiry: func(time.Time) (int64, error) {
			_, payload, err := authService.MintAuthCookie(now)
			if err != nil {
				return 0, err
			}
			return payload.Exp, nil
		},
	})
	if err != nil {
		t.Fatalf("new local launch service: %v", err)
	}

	return authService, trustedOrigins, intentService, launchService
}
