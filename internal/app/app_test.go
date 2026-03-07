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

func TestAppServesInterruptTerminalProcessesRoute(t *testing.T) {
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

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    interactiveAppTestBashCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	}

	attachment := attachAppTestTerminal(t, app.Terminals(), sessionID)
	prepareAppInterruptShell(t, app.Terminals(), sessionID, attachment)
	scriptPath := writeAppInterruptibleScript(t)
	startAppInterruptibleForegroundJob(t, app.Terminals(), sessionID, attachment, scriptPath)

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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
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
		t.Fatalf("post interrupt terminal processes: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload httpapi.InterruptTerminalProcessesResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode interrupt response: %v", err)
	}
	if payload.InterruptedSessionCount != 1 {
		t.Fatalf("expected one interrupted session, got %#v", payload)
	}

	output := waitForAppTestOutputContains(t, attachment, "CHILD_EXIT:130")
	if !strings.Contains(output, "CHILD_INTERRUPTED") {
		t.Fatalf("expected terminal to report interrupt, got %q", output)
	}
}

func TestAppServesRunCodeRoute(t *testing.T) {
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

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
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
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(impl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeRouteRejectsUnsupportedCLIID(t *testing.T) {
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

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

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

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","cliId":"cli-1"}`))
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
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if !strings.Contains(string(body), `"code":"unsupported_run_code_cli"`) {
		t.Fatalf("expected unsupported_run_code_cli error, got %q", string(body))
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

func seedAppRunCodeProject(t *testing.T, app *App, cfg config.Config, source string) {
	t.Helper()

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte(source), 0o644); err != nil {
		t.Fatalf("write run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "helper.py"), []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper.py: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
				"helper-section",
			},
			SectionVariantMap: map[string]string{
				"code-section":   "code-variant",
				"helper-section": "helper-variant",
			},
			Sections: map[string]projectstate.Section{
				"code-section": {
					ID:               "code-section",
					Name:             "Runner",
					VariantIDs:       []string{"code-variant"},
					DefaultVariantID: "code-variant",
				},
				"helper-section": {
					ID:               "helper-section",
					Name:             "Helper",
					VariantIDs:       []string{"helper-variant"},
					DefaultVariantID: "helper-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"code-variant": {
					ID:     "code-variant",
					ImplID: "code-impl",
				},
				"helper-variant": {
					ID:     "helper-variant",
					ImplID: "helper-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"code-impl": {
					ID:   "code-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"helper-impl": {
					ID:   "helper-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/helper.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
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

func interactiveAppTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireAppTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func attachAppTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func prepareAppInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForAppTestOutputContains(t, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeAppInterruptibleScript(t *testing.T) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "interruptible-child.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"trap 'printf \"CHILD_INTERRUPTED\\n\"; exit 130' INT",
		"printf 'CHILD_RUNNING\\n'",
		"while :; do sleep 1; done",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write interruptible script: %v", err)
	}
	return scriptPath
}

func startAppInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteApp(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForAppTestOutputContains(t, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForAppTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func shellSingleQuoteApp(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
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
