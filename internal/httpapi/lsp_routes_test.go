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
	"setta/internal/projectstate"
)

// The diagnostics route should return the current project-scoped payload from
// the Go-owned registry after validating that the project exists.
func TestRegisterLSPRoutesReturnsLatestDiagnosticsSnapshot(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diagnostics.UpdateCodeSection("project-alpha", "section-1", []projectstate.LSPDiagnostic{
		testHTTPAPILSPDiagnostic("fixture-ts"),
	})

	handler := newLSPRouteTestHandler(t, config.ModeIDE, projectRuntime, diagnostics)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.LSPDiagnosticsPayload
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode diagnostics payload: %v", err)
	}
	if payload.ProjectID != "project-alpha" {
		t.Fatalf("unexpected diagnostics project id %q", payload.ProjectID)
	}
	if len(payload.CodeSections["section-1"]) != 1 {
		t.Fatalf("expected one section diagnostic, got %#v", payload.CodeSections)
	}
}

// IDE-only diagnostics routes should stay unavailable in non-IDE modes.
func TestRegisterLSPRoutesRejectsShareModeRequests(t *testing.T) {
	t.Parallel()

	handler := newLSPRouteTestHandler(t, config.ModeShare, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
}

func newLSPRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	diagnostics *projectstate.LSPDiagnosticsRegistry,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLSPRoutes(r, LSPRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				ProjectState: projectRuntime,
				Diagnostics:  diagnostics,
			}); err != nil {
				t.Fatalf("register lsp routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func testHTTPAPILSPDiagnostic(code string) projectstate.LSPDiagnostic {
	severity := 1
	source := "fixture-ts-lsp"
	uri := "file:///tmp/example.py"
	return projectstate.LSPDiagnostic{
		Message:  "Fixture TypeScript diagnostic",
		Severity: &severity,
		Code:     code,
		Source:   &source,
		Range: projectstate.LSPDiagnosticRange{
			Start: projectstate.LSPDiagnosticPosition{Line: 0, Character: 0},
			End:   projectstate.LSPDiagnosticPosition{Line: 0, Character: 1},
		},
		URI: &uri,
	}
}
