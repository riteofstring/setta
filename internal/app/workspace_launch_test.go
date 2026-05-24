package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/localsessions"
	"setta/internal/observability"
)

func TestAppIDEModeCreatesWorkspaceLaunchIntentsOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	bootstrapToken, err := app.authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/__setta__/bootstrap/consume",
		strings.NewReader(`{"token":"`+bootstrapToken+`"}`),
	)
	if err != nil {
		t.Fatalf("new bootstrap consume request: %v", err)
	}
	consumeRequest.Header.Set("Content-Type", "application/json")

	consumeResponse, err := http.DefaultClient.Do(consumeRequest)
	if err != nil {
		t.Fatalf("post bootstrap consume: %v", err)
	}
	defer consumeResponse.Body.Close()
	if consumeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(consumeResponse.Body)
		t.Fatalf("expected bootstrap consume 200, got %d with body %q", consumeResponse.StatusCode, string(body))
	}
	cookies := consumeResponse.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected auth cookie, got %d", len(cookies))
	}

	launchIntentRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"`+cfg.Paths.WorkspaceRoot+`"},"returnUrl":"http://127.0.0.1:3000/home"}`),
	)
	if err != nil {
		t.Fatalf("new create workspace launch intent request: %v", err)
	}
	launchIntentRequest.Header.Set("Content-Type", "application/json")
	launchIntentRequest.Header.Set("Origin", "http://127.0.0.1:3000")
	launchIntentRequest.AddCookie(cookies[0])

	launchIntentResponse, err := http.DefaultClient.Do(launchIntentRequest)
	if err != nil {
		t.Fatalf("post create workspace launch intent: %v", err)
	}
	defer launchIntentResponse.Body.Close()
	if launchIntentResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(launchIntentResponse.Body)
		t.Fatalf("expected launch intent 200, got %d with body %q", launchIntentResponse.StatusCode, string(body))
	}

	var payload struct {
		Ok                bool    `json:"ok"`
		LaunchIntentToken *string `json:"launchIntentToken"`
		RequestedAt       *int64  `json:"requestedAt"`
	}
	if err := json.NewDecoder(launchIntentResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode launch intent payload: %v", err)
	}
	if !payload.Ok || payload.LaunchIntentToken == nil || strings.TrimSpace(*payload.LaunchIntentToken) == "" {
		t.Fatalf("unexpected launch intent payload %#v", payload)
	}
	if payload.RequestedAt == nil || *payload.RequestedAt <= 0 {
		t.Fatalf("expected requestedAt in launch intent payload, got %#v", payload)
	}
}

func TestAppIDEModeRejectsWorkspaceLaunchWithoutIntentTokenOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	bootstrapToken, err := app.authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/__setta__/bootstrap/consume",
		strings.NewReader(`{"token":"`+bootstrapToken+`"}`),
	)
	if err != nil {
		t.Fatalf("new bootstrap consume request: %v", err)
	}
	consumeRequest.Header.Set("Content-Type", "application/json")

	consumeResponse, err := http.DefaultClient.Do(consumeRequest)
	if err != nil {
		t.Fatalf("post bootstrap consume: %v", err)
	}
	defer consumeResponse.Body.Close()
	if consumeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(consumeResponse.Body)
		t.Fatalf("expected bootstrap consume 200, got %d with body %q", consumeResponse.StatusCode, string(body))
	}
	cookies := consumeResponse.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected auth cookie, got %d", len(cookies))
	}

	launchRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteLaunch,
		strings.NewReader(`{"workspaceRoot":"`+cfg.Paths.WorkspaceRoot+`"}`),
	)
	if err != nil {
		t.Fatalf("new launch request: %v", err)
	}
	launchRequest.Header.Set("Content-Type", "application/json")
	launchRequest.Header.Set("Origin", "http://127.0.0.1:3000")
	launchRequest.AddCookie(cookies[0])

	launchResponse, err := http.DefaultClient.Do(launchRequest)
	if err != nil {
		t.Fatalf("post launch request: %v", err)
	}
	defer launchResponse.Body.Close()
	if launchResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(launchResponse.Body)
		t.Fatalf("expected launch 200, got %d with body %q", launchResponse.StatusCode, string(body))
	}

	var payload struct {
		Ok        bool   `json:"ok"`
		ReturnURL string `json:"returnUrl"`
		Error     *struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(launchResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode launch payload: %v", err)
	}
	if payload.Ok {
		t.Fatalf("expected failed launch payload, got %#v", payload)
	}
	if payload.Error == nil || payload.Error.Code != "BadRequest" {
		t.Fatalf("expected bad request error, got %#v", payload)
	}
	if payload.ReturnURL != "http://127.0.0.1:3000/home" {
		t.Fatalf("expected safe return URL, got %#v", payload)
	}
}

func TestAppIDEModeLaunchesRemoteWorkspaceOverHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	repoRoot := appTestRepoRoot(t)
	backendPath := filepath.Join(repoRoot, "backend")
	existingPythonPath := strings.TrimSpace(os.Getenv("PYTHONPATH"))
	if existingPythonPath == "" {
		t.Setenv("PYTHONPATH", backendPath)
	} else {
		t.Setenv("PYTHONPATH", backendPath+string(os.PathListSeparator)+existingPythonPath)
	}
	t.Setenv("SETTA_SSH_BIN", filepath.Join(repoRoot, "scripts", "test", "ssh"))
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	t.Setenv("SETTA_RUNTIME_ROOT", "/remote/runtime")
	t.Setenv("SETTA_FILES_LOCATION", "global")

	remoteWorkspace := filepath.Join(t.TempDir(), "remote-workspace")
	if err := os.MkdirAll(remoteWorkspace, 0o755); err != nil {
		t.Fatalf("create remote workspace: %v", err)
	}
	remoteSessionsRoot := filepath.Join(t.TempDir(), "remote-sessions")
	remoteSession := createAppRemoteSSHSession(t, remoteSessionsRoot, remoteWorkspace)
	t.Setenv("SETTA_SESSIONS_ROOT", remoteSessionsRoot)
	t.Setenv("SETTA_SESSION_ID", remoteSession.ID)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	bootstrapToken, err := app.authService.MintBootstrapToken(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint bootstrap token: %v", err)
	}

	consumeRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/__setta__/bootstrap/consume",
		strings.NewReader(`{"token":"`+bootstrapToken+`"}`),
	)
	if err != nil {
		t.Fatalf("new bootstrap consume request: %v", err)
	}
	consumeRequest.Header.Set("Content-Type", "application/json")

	consumeResponse, err := http.DefaultClient.Do(consumeRequest)
	if err != nil {
		t.Fatalf("post bootstrap consume: %v", err)
	}
	defer consumeResponse.Body.Close()
	if consumeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(consumeResponse.Body)
		t.Fatalf("expected bootstrap consume 200, got %d with body %q", consumeResponse.StatusCode, string(body))
	}
	cookies := consumeResponse.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected auth cookie, got %d", len(cookies))
	}

	launchIntentRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteCreateWorkspaceLaunchIntent,
		strings.NewReader(`{"launchRequest":{"workspaceRoot":"`+remoteWorkspace+`","sshTarget":"user@host","localPort":61000},"returnUrl":"http://launcher.example:7999/home"}`),
	)
	if err != nil {
		t.Fatalf("new create workspace launch intent request: %v", err)
	}
	launchIntentRequest.Header.Set("Content-Type", "application/json")
	launchIntentRequest.Header.Set("Origin", "http://launcher.example:7999")
	launchIntentRequest.AddCookie(cookies[0])

	launchIntentResponse, err := http.DefaultClient.Do(launchIntentRequest)
	if err != nil {
		t.Fatalf("post create workspace launch intent: %v", err)
	}
	defer launchIntentResponse.Body.Close()
	if launchIntentResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(launchIntentResponse.Body)
		t.Fatalf("expected launch intent 200, got %d with body %q", launchIntentResponse.StatusCode, string(body))
	}

	var intentPayload struct {
		Ok                bool    `json:"ok"`
		LaunchIntentToken *string `json:"launchIntentToken"`
	}
	if err := json.NewDecoder(launchIntentResponse.Body).Decode(&intentPayload); err != nil {
		t.Fatalf("decode launch intent payload: %v", err)
	}
	if !intentPayload.Ok || intentPayload.LaunchIntentToken == nil {
		t.Fatalf("unexpected launch intent payload %#v", intentPayload)
	}

	launchRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteLaunch,
		strings.NewReader(`{"launchIntentToken":"`+*intentPayload.LaunchIntentToken+`"}`),
	)
	if err != nil {
		t.Fatalf("new launch request: %v", err)
	}
	launchRequest.Header.Set("Content-Type", "application/json")
	launchRequest.Header.Set("Origin", "http://launcher.example:7999")
	launchRequest.AddCookie(cookies[0])

	launchResponse, err := http.DefaultClient.Do(launchRequest)
	if err != nil {
		t.Fatalf("post launch request: %v", err)
	}
	defer launchResponse.Body.Close()
	if launchResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(launchResponse.Body)
		t.Fatalf("expected launch 200, got %d with body %q", launchResponse.StatusCode, string(body))
	}

	var payload struct {
		Ok                   bool    `json:"ok"`
		BootstrapURLFragment *string `json:"bootstrapUrlFragment"`
		WorkspaceRoot        *string `json:"workspaceRoot"`
		SettaFilesLocation   *string `json:"settaFilesLocation"`
		RemoteCmdResolved    *string `json:"remoteCmdResolved"`
		SessionID            *string `json:"sessionId"`
		Error                *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(launchResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode launch payload: %v", err)
	}
	if !payload.Ok || payload.BootstrapURLFragment == nil {
		t.Fatalf("expected successful launch payload, got %#v", payload)
	}
	if payload.Error != nil {
		t.Fatalf("expected no launch error, got %#v", payload.Error)
	}
	if payload.WorkspaceRoot == nil || *payload.WorkspaceRoot != remoteSession.WorkspacePathCanonical {
		t.Fatalf("expected remote workspace root, got %#v", payload.WorkspaceRoot)
	}
	if payload.SettaFilesLocation == nil || *payload.SettaFilesLocation != "global" {
		t.Fatalf("expected resolved remote setta files location global, got %#v", payload.SettaFilesLocation)
	}
	if payload.RemoteCmdResolved == nil || *payload.RemoteCmdResolved != "setta" {
		t.Fatalf("expected resolved remote command, got %#v", payload.RemoteCmdResolved)
	}
	if payload.SessionID == nil || *payload.SessionID != remoteSession.ID {
		t.Fatalf("expected remote session id %q, got %#v", remoteSession.ID, payload.SessionID)
	}

	parsedURL, err := url.Parse(*payload.BootstrapURLFragment)
	if err != nil {
		t.Fatalf("parse bootstrap URL fragment: %v", err)
	}
	if parsedURL.Host != "127.0.0.1:61000" {
		t.Fatalf("expected local tunnel bootstrap host 127.0.0.1:61000, got %q", parsedURL.Host)
	}
	hashParams, err := url.ParseQuery(parsedURL.Fragment)
	if err != nil {
		t.Fatalf("parse bootstrap fragment params: %v", err)
	}
	if hashParams.Get("lo") != "http://launcher.example:7999" {
		t.Fatalf("expected launcher origin handoff, got %#v", hashParams)
	}
	if strings.TrimSpace(hashParams.Get("lop")) == "" {
		t.Fatalf("expected launcher origin proof in bootstrap URL, got %#v", hashParams)
	}
}

func createAppRemoteSSHSession(t *testing.T, sessionsRoot string, workspaceRoot string) auth.SessionMetadata {
	t.Helper()

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: sessionsRoot,
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}
	session, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      workspaceRoot,
		Host:               "127.0.0.1",
		Port:               61234,
		PID:                os.Getpid(),
		SettaFilesLocation: "local",
		RuntimeRoot:        "/remote/runtime",
		ServerMode:         "ide",
	})
	if err != nil {
		t.Fatalf("create remote ssh session: %v", err)
	}
	return session
}
