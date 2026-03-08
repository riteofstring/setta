package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
)

func TestRegisterStatusRoutesReturnsBackendInitStatus(t *testing.T) {
	t.Parallel()

	// The live startup poll should get a stable ready payload from the Go app.
	readyAt := time.Date(2026, time.March, 9, 12, 34, 56, 0, time.UTC)
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		AuthRefreshWindowSeconds: 3600,
		WorktreeName:             "go-rewrite",
		ReadyAt:                  readyAt,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetBackendInitStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected backend init status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload backendInitStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode backend init status payload: %v", err)
	}
	if !payload.IsReady {
		t.Fatalf("expected backend to report ready, got %#v", payload)
	}
	if len(payload.Events) != 1 || payload.Events[0].Message != "Go backend ready" {
		t.Fatalf("expected a single ready event, got %#v", payload.Events)
	}
	if !payload.Events[0].Timestamp.Equal(readyAt) {
		t.Fatalf("expected ready timestamp %s, got %s", readyAt, payload.Events[0].Timestamp)
	}
	if payload.WorktreeName == nil || *payload.WorktreeName != "go-rewrite" {
		t.Fatalf("expected worktree name go-rewrite, got %#v", payload.WorktreeName)
	}
	if payload.AuthCookieRefreshWindowSeconds != 3600 {
		t.Fatalf("expected auth refresh window 3600, got %d", payload.AuthCookieRefreshWindowSeconds)
	}
}

func TestRegisterStatusRoutesReturnsAuthRefreshStatus(t *testing.T) {
	t.Parallel()

	// Websocket refresh polling only needs the auth refresh window contract.
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		AuthRefreshWindowSeconds: 120,
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAuthRefreshStatus, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected auth refresh status 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload authRefreshStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode auth refresh status payload: %v", err)
	}
	if payload.AuthCookieRefreshWindowSeconds != 120 {
		t.Fatalf("expected auth refresh window 120, got %d", payload.AuthCookieRefreshWindowSeconds)
	}
}

func TestRegisterStatusRoutesReturnsSettaHomeInfoInIDEMode(t *testing.T) {
	t.Parallel()

	// Workspace switching depends on the current Setta home and active files root scope.
	handler := newStatusRouteTestHandler(t, config.ModeIDE, StatusRouteDependencies{
		ModePolicy:               modes.NewPolicy(config.ModeIDE),
		SettaHome:                "/tmp/.setta-development",
		GlobalSettaFilesBase:     "/tmp/.setta-development/setta_files",
		ActiveSettaFilesLocation: "custom",
		SettaFilesRoot:           "/tmp/workspace/setta_files_dev",
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetSettaHomeInfo, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected setta home info 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload settaHomeInfoResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode setta home info payload: %v", err)
	}
	if payload.SettaHome != "/tmp/.setta-development" {
		t.Fatalf("expected setta home /tmp/.setta-development, got %q", payload.SettaHome)
	}
	if payload.GlobalSettaFilesBase != "/tmp/.setta-development/setta_files" {
		t.Fatalf("unexpected global setta files base %q", payload.GlobalSettaFilesBase)
	}
	if payload.ActiveSettaFilesLocation == nil || *payload.ActiveSettaFilesLocation != "custom" {
		t.Fatalf("expected custom files location, got %#v", payload.ActiveSettaFilesLocation)
	}
	if payload.LLMConfigPath != "/tmp/workspace/setta_files_dev/llm_config.json" {
		t.Fatalf("unexpected llm config path %q", payload.LLMConfigPath)
	}
}

func TestRegisterStatusRoutesBlocksSettaHomeInfoOutsideIDEMode(t *testing.T) {
	t.Parallel()

	// The launcher scope read stays IDE-only because the live caller is the IDE workspace switcher.
	for _, mode := range []config.Mode{config.ModeLauncher, config.ModeShare, config.ModeApp} {
		mode := mode
		t.Run(string(mode), func(t *testing.T) {
			t.Parallel()

			handler := newStatusRouteTestHandler(t, mode, StatusRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
			})

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetSettaHomeInfo, nil)
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected setta home info 403 in mode %s, got %d with body %q", mode, response.Code, response.Body.String())
			}
		})
	}
}

func newStatusRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	deps StatusRouteDependencies,
) http.Handler {
	t.Helper()

	deps.ModePolicy = modes.NewPolicy(mode)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterStatusRoutes(r, deps); err != nil {
				t.Fatalf("register status routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new status route handler: %v", err)
	}
	return handler
}
