package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/terminals"
)

func TestRegisterTerminalRoutesDeletesRequestedTerminalSessions(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietHTTPTestCatCommand(t),
	})
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-b", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietHTTPTestCatCommand(t),
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response payload, got %q", response.Body.String())
	}

	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "")); ok {
		t.Fatal("expected section-a terminal session to be deleted")
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-b", "")); !ok {
		t.Fatal("expected section-b terminal session to remain")
	}
}

func TestRegisterTerminalRoutesIgnoresUnknownTerminalSections(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["missing"]}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterTerminalRoutesRejectsBlankSectionID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":[""]}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_terminal_section"`) {
		t.Fatalf("expected invalid_terminal_section error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesBlocksDeploymentMode(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := modes.NewPolicy(config.ModeShare)
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: policy,
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: policy,
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesInterruptsOnlyMatchingProjectSessions(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	scriptPath := writeHTTPInterruptibleScript(t)

	sessionA := terminals.BuildTerminalID("section-a", "")
	sessionB := terminals.BuildTerminalID("section-b", "")

	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         sessionA,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         sessionB,
		ProjectID:  "project-b",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})

	attachmentA := attachHTTPTestTerminal(t, terminalService, sessionA)
	attachmentB := attachHTTPTestTerminal(t, terminalService, sessionB)
	prepareHTTPInterruptShell(t, terminalService, sessionA, attachmentA)
	prepareHTTPInterruptShell(t, terminalService, sessionB, attachmentB)

	startHTTPInterruptibleForegroundJob(t, terminalService, sessionA, attachmentA, scriptPath)
	startHTTPInterruptibleForegroundJob(t, terminalService, sessionB, attachmentB, scriptPath)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload InterruptTerminalProcessesResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode interrupt response: %v", err)
	}
	if payload.InterruptedSessionCount != 1 {
		t.Fatalf("expected one interrupted session, got %#v", payload)
	}

	outputA := waitForHTTPTestOutputContains(t, attachmentA, "CHILD_EXIT:130")
	if !strings.Contains(outputA, "CHILD_INTERRUPTED") {
		t.Fatalf("expected project-a terminal to report interrupt, got %q", outputA)
	}

	ensureNoHTTPTestOutputContains(t, attachmentB, "CHILD_INTERRUPTED", 300*time.Millisecond)
}

func TestRegisterTerminalRoutesRejectsBlankInterruptProjectID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":""}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_id"`) {
		t.Fatalf("expected invalid_project_id error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesBlocksInterruptInDeploymentMode(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := modes.NewPolicy(config.ModeShare)
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: policy,
		Register: func(r chi.Router) {
			if err := RegisterTerminalRoutes(r, TerminalRouteDependencies{
				ModePolicy: policy,
				Terminals:  terminalService,
			}); err != nil {
				t.Fatalf("register terminal routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func newHTTPTestTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{
		Logger: observability.NewLogger(0, io.Discard),
	})
	if err != nil {
		t.Fatalf("new terminal service: %v", err)
	}

	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(shutdownCtx); err != nil {
			t.Fatalf("close terminal service: %v", err)
		}
	})

	return service
}

func openHTTPTestTerminal(t *testing.T, service *terminals.Service, options terminals.OpenOptions) {
	t.Helper()

	if _, created, err := service.Open(options); err != nil {
		t.Fatalf("open terminal %q: %v", options.ID, err)
	} else if !created {
		t.Fatalf("expected terminal %q to be created", options.ID)
	}
}

func attachHTTPTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func addHTTPTestAuthCookie(t *testing.T, request *http.Request, authService *auth.Service) {
	t.Helper()

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})
}

func quietHTTPTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireHTTPTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func interactiveHTTPTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireHTTPTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func requireHTTPTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func prepareHTTPInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForHTTPTestOutputContains(t, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeHTTPInterruptibleScript(t *testing.T) string {
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

func startHTTPInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteHTTP(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForHTTPTestOutputContains(t, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForHTTPTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
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

func ensureNoHTTPTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string, duration time.Duration) {
	t.Helper()

	timeout := time.NewTimer(duration)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				return
			}
			if strings.Contains(string(chunk), needle) {
				t.Fatalf("did not expect output %q, got chunk %q", needle, string(chunk))
			}
		case <-timeout.C:
			return
		}
	}
}

func shellSingleQuoteHTTP(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func skipIfTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
