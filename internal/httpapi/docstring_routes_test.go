package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
)

func TestRegisterDocstringRoutesConvertsDocstringsInIDEMode(t *testing.T) {
	t.Parallel()

	handler := newDocstringRouteTestHandler(t, config.ModeIDE)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDocstringToMarkdown,
		strings.NewReader(`{"docstring":"Summary line.\n\nArgs:\n    x: value\n"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode docstring markdown payload: %v", err)
	}
	want := "Summary line.\n\n#### Args\n\n- `x`: value\n"
	if payload != want {
		t.Fatalf("unexpected markdown payload:\nwant: %q\ngot:  %q", want, payload)
	}
}

func TestRegisterDocstringRoutesRejectsUnknownFormats(t *testing.T) {
	t.Parallel()

	handler := newDocstringRouteTestHandler(t, config.ModeIDE)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDocstringToMarkdown,
		strings.NewReader(`{"docstring":"__init__"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"unknown_docstring_format"`) {
		t.Fatalf("expected unknown-format error code, got %q", response.Body.String())
	}
}

func TestRegisterDocstringRoutesRejectsShareMode(t *testing.T) {
	t.Parallel()

	handler := newDocstringRouteTestHandler(t, config.ModeShare)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDocstringToMarkdown,
		strings.NewReader(`{"docstring":"just text"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
}

func newDocstringRouteTestHandler(t *testing.T, mode config.Mode) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterDocstringRoutes(r, DocstringRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
			}); err != nil {
				t.Fatalf("register docstring routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new docstring route handler: %v", err)
	}
	return handler
}
