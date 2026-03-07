package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/terminals"
)

func TestAppServesFoundationRoutes(t *testing.T) {
	t.Parallel()

	cfg := config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         "/tmp/workspace",
			SettaHome:             "/tmp/.setta",
			ProfileLookupHome:     "/tmp/.setta",
			SettaFilesRoot:        "/tmp/workspace/setta_files",
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           "/tmp/workspace/setta_files/runtime",
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: "/tmp/.setta/setta_files",
			AutoMode:             config.AutoModeCreateLocal,
		},
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
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

	response, err := http.Get(server.URL + "/api/runtimeInfo")
	if err != nil {
		t.Fatalf("get runtime info: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	var payload httpapi.RuntimeInfo
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode runtime info: %v", err)
	}
	if payload.Mode != "launcher" {
		t.Fatalf("expected mode launcher, got %q", payload.Mode)
	}
	if payload.Paths.SettaFilesLocation != "local" {
		t.Fatalf("expected local files location, got %q", payload.Paths.SettaFilesLocation)
	}
}

func TestAppShutdownStopsRuntime(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	stopped := make(chan struct{})
	app.Runtime().Go("wait", func(ctx context.Context) error {
		defer close(stopped)
		<-ctx.Done()
		return nil
	})

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := app.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("runtime task did not stop")
	}
}

func TestAppWiresSeparateProjectStateRuntimes(t *testing.T) {
	t.Parallel()

	cfg := testConfig(t)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	projectStates := app.ProjectStates()
	if projectStates == nil {
		t.Fatal("expected project state registry")
	}
	if app.Terminals() == nil {
		t.Fatal("expected terminal service")
	}

	paths := projectStates.Paths()
	if paths.Main != filepath.Join(cfg.Paths.SettaFilesRoot, "project.json") {
		t.Fatalf("expected main project path %q, got %q", filepath.Join(cfg.Paths.SettaFilesRoot, "project.json"), paths.Main)
	}
	if paths.Settings != filepath.Join(cfg.Paths.SettaFilesRoot, "setta-settings-project.json") {
		t.Fatalf("expected settings project path %q, got %q", filepath.Join(cfg.Paths.SettaFilesRoot, "setta-settings-project.json"), paths.Settings)
	}

	if _, err := projectStates.Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}
	if _, err := projectStates.Settings().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["settings-home"] = projectstate.Project{
			ID:   "settings-home",
			Name: "Settings Home",
		}
		document.DefaultProjectID = "settings-home"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate settings runtime: %v", err)
	}

	mainSnapshot, err := projectStates.Main().Save(context.Background())
	if err != nil {
		t.Fatalf("save main runtime: %v", err)
	}
	settingsSnapshot, err := projectStates.Settings().Save(context.Background())
	if err != nil {
		t.Fatalf("save settings runtime: %v", err)
	}

	if mainSnapshot.Revision != 2 {
		t.Fatalf("expected main revision 2, got %d", mainSnapshot.Revision)
	}
	if settingsSnapshot.Revision != 2 {
		t.Fatalf("expected settings revision 2, got %d", settingsSnapshot.Revision)
	}
	if _, ok := settingsSnapshot.Document.Projects["project-alpha"]; ok {
		t.Fatal("did not expect main project in settings runtime")
	}
}

func TestAppServesDeleteTerminalsRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

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

	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post delete terminals: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if _, ok := app.Terminals().Session(terminals.BuildTerminalID("section-a", "")); ok {
		t.Fatal("expected terminal session to be deleted")
	}
}

func testConfig(t *testing.T) config.Config {
	t.Helper()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")

	return config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         workspaceRoot,
			SettaHome:             settaHome,
			ProfileLookupHome:     settaHome,
			SettaFilesRoot:        settaFilesRoot,
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           filepath.Join(settaFilesRoot, "runtime"),
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: filepath.Join(settaHome, "setta_files"),
			AutoMode:             config.AutoModeCreateLocal,
		},
	}
}

func prepareAppCurrentSession(t *testing.T, cfg config.Config) {
	t.Helper()

	sessionID := "abc123"
	t.Setenv("SETTA_SESSION_ID", sessionID)

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write session secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          cfg.Paths.WorkspaceRoot,
		WorkspacePathCanonical: cfg.Paths.WorkspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            cfg.Paths.RuntimeRoot,
		ServerMode:             string(cfg.Server.Mode),
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal session metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write session metadata: %v", err)
	}
}

func quietAppTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireAppTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func requireAppTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func skipIfAppTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
