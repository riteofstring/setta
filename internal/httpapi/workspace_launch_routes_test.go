package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/modes"
	"setta/internal/sshx"
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

type httpTestSSHRuntime struct {
	connectInputs  []sshx.ConnectWorkspaceInput
	connectResult  sshx.RemoteConnectResult
	connectErr     error
	rollbackInputs []sshx.RollbackRemoteWorkspaceInput
	rollbackErr    error
}

func (s *httpTestSSHRuntime) ConnectWorkspaceSession(input sshx.ConnectWorkspaceInput) (sshx.RemoteConnectResult, error) {
	s.connectInputs = append(s.connectInputs, input)
	if s.connectErr != nil {
		return sshx.RemoteConnectResult{}, s.connectErr
	}
	return s.connectResult, nil
}

func (s *httpTestSSHRuntime) RollbackRemoteWorkspaceLaunch(input sshx.RollbackRemoteWorkspaceInput) error {
	s.rollbackInputs = append(s.rollbackInputs, input)
	return s.rollbackErr
}

type workspaceLaunchTestServices struct {
	authService    *auth.Service
	trustedOrigins *frontendorigins.Service
	intentService  *workspacelaunch.IntentService
	launchService  *workspacelaunch.LocalLaunchService
	sessions       *httpTestSessionLauncher
	ssh            *httpTestSSHRuntime
}

func TestRegisterWorkspaceLaunchRoutesCreatesIntent(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
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

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
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

func TestRegisterWorkspaceLaunchRoutesCreateIntentValidatesWorkspaceAndReturnURLBoundaries(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	for _, testCase := range []struct {
		name            string
		payload         string
		origin          string
		expectedCode    string
		expectedMessage string
	}{
		{
			name:            "missing workspace root",
			payload:         `{"launchRequest":{},"returnUrl":"http://127.0.0.1:3000/home"}`,
			origin:          "http://127.0.0.1:3000",
			expectedCode:    "BadRequest",
			expectedMessage: "launchRequest.workspaceRoot is required.",
		},
		{
			name:            "whitespace workspace root",
			payload:         `{"launchRequest":{"workspaceRoot":"   "},"returnUrl":"http://127.0.0.1:3000/home"}`,
			origin:          "http://127.0.0.1:3000",
			expectedCode:    "BadRequest",
			expectedMessage: "launchRequest.workspaceRoot is required.",
		},
		{
			name:            "disallowed return url origin",
			payload:         `{"launchRequest":{"workspaceRoot":"/tmp/workspace"},"returnUrl":"http://evil.example:9001/home"}`,
			origin:          "http://127.0.0.1:3000",
			expectedCode:    "BadRequest",
			expectedMessage: "returnUrl origin is not allowed.",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, RouteCreateWorkspaceLaunchIntent, strings.NewReader(testCase.payload))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", testCase.origin)

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
			if payload.Error == nil || payload.Error.Code != testCase.expectedCode || payload.Error.Message != testCase.expectedMessage {
				t.Fatalf("unexpected error payload %#v", payload)
			}
		})
	}
}

func TestRegisterWorkspaceLaunchRoutesCreateIntentAllowsTrustedReturnURLOrigin(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)
	currentSession, ok := services.authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	if _, err := services.trustedOrigins.TrustOrigin(
		"http://trusted.example:9001",
		currentSession.Metadata.ID,
		time.Unix(1_710_000_000, 0).UTC().Add(time.Hour).Unix(),
	); err != nil {
		t.Fatalf("trust return origin: %v", err)
	}

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"/tmp/workspace"},"returnUrl":"http://trusted.example:9001/home"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://launcher.example:7999")

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
		t.Fatalf("expected successful trusted-origin payload, got %#v", payload)
	}
}

func TestRegisterWorkspaceLaunchRoutesCreateIntentMapsTypedStoreErrors(t *testing.T) {
	t.Parallel()

	baseServices := newWorkspaceLaunchTestServices(t)

	t.Run("store unavailable", func(t *testing.T) {
		t.Parallel()

		runtimeRootPath := filepath.Join(t.TempDir(), "runtime-root-file")
		if err := os.WriteFile(runtimeRootPath, []byte("not a directory"), 0o644); err != nil {
			t.Fatalf("write runtime-root file: %v", err)
		}
		intentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
			RuntimeRoot: runtimeRootPath,
			Now:         func() time.Time { return time.Unix(1_710_000_000, 0).UTC() },
		})
		if err != nil {
			t.Fatalf("new intent service: %v", err)
		}

		router := chi.NewRouter()
		if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
			ModePolicy: modes.NewPolicy(config.ModeIDE),
			Auth:       baseServices.authService,
			Intents:    intentService,
			Launch:     baseServices.launchService,
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

		var payload createWorkspaceLaunchIntentResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if payload.Ok || payload.Error == nil || payload.Error.Code != "LaunchIntentStoreUnavailable" {
			t.Fatalf("expected store unavailable payload, got %#v", payload)
		}
	})

	t.Run("store invalid", func(t *testing.T) {
		t.Parallel()

		runtimeRoot := filepath.Join(t.TempDir(), "runtime")
		if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
			t.Fatalf("mkdir runtime root: %v", err)
		}
		if err := os.WriteFile(filepath.Join(runtimeRoot, "workspace_launch_intents.json"), []byte("{not-json"), 0o644); err != nil {
			t.Fatalf("write invalid store payload: %v", err)
		}
		intentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
			RuntimeRoot: runtimeRoot,
			Now:         func() time.Time { return time.Unix(1_710_000_000, 0).UTC() },
		})
		if err != nil {
			t.Fatalf("new intent service: %v", err)
		}

		router := chi.NewRouter()
		if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
			ModePolicy: modes.NewPolicy(config.ModeIDE),
			Auth:       baseServices.authService,
			Intents:    intentService,
			Launch:     baseServices.launchService,
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

		var payload createWorkspaceLaunchIntentResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if payload.Ok || payload.Error == nil || payload.Error.Code != "LaunchIntentStoreInvalid" {
			t.Fatalf("expected store invalid payload, got %#v", payload)
		}
	})

	t.Run("capacity exceeded", func(t *testing.T) {
		t.Parallel()

		intentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
			RuntimeRoot:   filepath.Join(t.TempDir(), "runtime"),
			Now:           func() time.Time { return time.Unix(1_710_000_000, 0).UTC() },
			MaxPerSession: 1,
			MaxTotal:      1,
		})
		if err != nil {
			t.Fatalf("new intent service: %v", err)
		}

		router := chi.NewRouter()
		if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
			ModePolicy: modes.NewPolicy(config.ModeIDE),
			Auth:       baseServices.authService,
			Intents:    intentService,
			Launch:     baseServices.launchService,
		}); err != nil {
			t.Fatalf("register workspace launch routes: %v", err)
		}

		makeRequest := func() createWorkspaceLaunchIntentResponse {
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
			return payload
		}

		if payload := makeRequest(); !payload.Ok {
			t.Fatalf("expected first intent creation to succeed, got %#v", payload)
		}
		if payload := makeRequest(); payload.Ok || payload.Error == nil || payload.Error.Code != "LaunchIntentStoreCapacityExceeded" {
			t.Fatalf("expected capacity payload, got %#v", payload)
		}
	})
}

func TestRegisterWorkspaceLaunchRoutesLaunchesWorkspaceFromIntent(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
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
	if !services.trustedOrigins.IsTrustedOrigin("http://127.0.0.1:61234", "abc123") {
		t.Fatal("expected launched workspace origin to be trusted for current session")
	}
}

func TestRegisterWorkspaceLaunchRoutesLaunchUsesStoredRequestFromIntent(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	intentRequest := httptest.NewRequest(
		http.MethodPost,
		RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"/tmp/workspace","settaHome":"/tmp/custom/.setta","settaFilesLocation":"global","runtimeRoot":"/tmp/custom-runtime"},"returnUrl":"http://launcher.example:7999/home"}`),
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
	if !payload.Ok {
		t.Fatalf("expected successful launch payload, got %#v", payload)
	}
	if len(services.sessions.captured) != 1 {
		t.Fatalf("expected one local launch, got %d", len(services.sessions.captured))
	}
	if services.sessions.captured[0].WorkspaceRoot != "/tmp/workspace" {
		t.Fatalf("expected stored workspace root, got %#v", services.sessions.captured[0])
	}
	if services.sessions.captured[0].SettaHome != "/tmp/custom/.setta" {
		t.Fatalf("expected stored setta home, got %#v", services.sessions.captured[0])
	}
	if services.sessions.captured[0].RuntimeRoot != "/tmp/custom-runtime" {
		t.Fatalf("expected stored runtime root, got %#v", services.sessions.captured[0])
	}
	if services.sessions.captured[0].SettaFilesLocation == nil || *services.sessions.captured[0].SettaFilesLocation != "global" {
		t.Fatalf("expected stored setta files location, got %#v", services.sessions.captured[0])
	}
}

func TestRegisterWorkspaceLaunchRoutesLaunchesRemoteWorkspaceFromIntent(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)
	services.ssh.connectResult = sshx.RemoteConnectResult{
		BootstrapURLFragment: "http://127.0.0.1:61000/__setta__/bootstrap#token=remote-tok",
		Session: sshx.RemoteSessionSummary{
			ID:                     "remote-session-id",
			WorkspacePath:          "/remote/workspace",
			WorkspacePathCanonical: "/remote/workspace",
			Host:                   "127.0.0.1",
			Port:                   61234,
			PID:                    12345,
			StartedAt:              time.Unix(1_710_000_000, 0).UTC(),
			ServerMode:             sshx.RemoteServerModeIDE,
		},
		StartedNew:          false,
		RemoteCommand:       "setta",
		SettaFilesLocation:  "global",
		SettaFilesRoot:      "/remote/state",
		RuntimeRoot:         "/remote/runtime",
		SettaHome:           "/remote/home/.setta",
		Profile:             "dev",
		LauncherOriginProof: "proof",
	}

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
	}); err != nil {
		t.Fatalf("register workspace launch routes: %v", err)
	}

	intentRequest := httptest.NewRequest(
		http.MethodPost,
		RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host","localPort":61000},"returnUrl":"http://launcher.example:7999/home"}`),
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
	if payload.RemoteCmdResolved == nil || *payload.RemoteCmdResolved != "setta" {
		t.Fatalf("expected resolved remote command, got %#v", payload.RemoteCmdResolved)
	}
	if payload.WorkspaceRoot == nil || *payload.WorkspaceRoot != "/remote/workspace" {
		t.Fatalf("expected remote workspace root, got %#v", payload.WorkspaceRoot)
	}
	if len(services.sessions.captured) != 0 {
		t.Fatalf("expected no local session launches, got %d", len(services.sessions.captured))
	}
	if !services.trustedOrigins.IsTrustedOrigin("http://127.0.0.1:61000", "abc123") {
		t.Fatal("expected launched remote origin to be trusted for current session")
	}
}

func TestRegisterWorkspaceLaunchRoutesRequiresIntentToken(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
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

	services := newWorkspaceLaunchTestServices(t)

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
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

func TestRegisterWorkspaceLaunchRoutesLaunchMapsTypedOutdatedSettingsError(t *testing.T) {
	t.Parallel()

	services := newWorkspaceLaunchTestServices(t)
	services.sessions.err = &launcher.SessionLaunchError{
		Code:    "OutdatedProjectSettings",
		Message: "This workspace uses an older Setta settings/project format (missing settings section spreadsheetSectionDefault). Please migrate the project metadata and try again.",
	}

	router := chi.NewRouter()
	if err := RegisterWorkspaceLaunchRoutes(router, WorkspaceLaunchRouteDependencies{
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Auth:       services.authService,
		Intents:    services.intentService,
		Launch:     services.launchService,
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
	if payload.Ok {
		t.Fatalf("expected failure payload, got %#v", payload)
	}
	if payload.Error == nil || payload.Error.Code != "OutdatedProjectSettings" {
		t.Fatalf("expected typed outdated settings payload, got %#v", payload)
	}
	if !strings.Contains(payload.Error.Message, "spreadsheetSectionDefault") {
		t.Fatalf("expected missing section detail, got %#v", payload)
	}
	if payload.ReturnURL == nil || *payload.ReturnURL != "http://launcher.example:7999/home" {
		t.Fatalf("expected stored return URL, got %#v", payload.ReturnURL)
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

func newWorkspaceLaunchTestServices(t *testing.T) workspaceLaunchTestServices {
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
	ssh := &httpTestSSHRuntime{}
	launchService, err := workspacelaunch.NewLocalLaunchService(workspacelaunch.LocalLaunchServiceOptions{
		DefaultSettaHome: "/tmp/.setta",
		Intents:          intentService,
		TrustedOrigins:   trustedOrigins,
		Sessions:         sessions,
		SSH:              ssh,
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

	return workspaceLaunchTestServices{
		authService:    authService,
		trustedOrigins: trustedOrigins,
		intentService:  intentService,
		launchService:  launchService,
		sessions:       sessions,
		ssh:            ssh,
	}
}
