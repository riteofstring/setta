package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os/exec"
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

func requireHTTPTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func skipIfTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
