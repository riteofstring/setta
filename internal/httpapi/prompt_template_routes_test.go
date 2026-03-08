package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/prompttemplates"
)

func TestRegisterPromptTemplateRoutesListsTemplates(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:          "template-1",
		Name:        "Greeting",
		Description: "Greeting template",
		Template:    "Hello {{ name }}",
		InputSchema: map[string]any{"name": map[string]any{"type": "string"}},
		Metadata:    map[string]any{"category": "greeting"},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetPromptTemplates, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var templates []prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &templates); err != nil {
		t.Fatalf("decode templates: %v", err)
	}
	if len(templates) != 1 {
		t.Fatalf("expected one template, got %#v", templates)
	}
	if templates[0].Format != prompttemplates.FormatJinja {
		t.Fatalf("expected default format, got %#v", templates[0])
	}
	if templates[0].Metadata["category"] != "greeting" {
		t.Fatalf("expected metadata, got %#v", templates[0])
	}
}

func TestRegisterPromptTemplateRoutesReturnsEmptyList(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetPromptTemplates, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var templates []prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &templates); err != nil {
		t.Fatalf("decode templates: %v", err)
	}
	if len(templates) != 0 {
		t.Fatalf("expected empty templates, got %#v", templates)
	}
}

func TestRegisterPromptTemplateRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeShare, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetPromptTemplates, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "mode_forbidden" {
		t.Fatalf("expected mode_forbidden, got %#v", payload)
	}
}

func newPromptTemplateRouteTestHandler(t *testing.T, mode config.Mode, store *prompttemplates.Store) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterPromptTemplateRoutes(r, PromptTemplateRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Templates:  store,
			}); err != nil {
				t.Fatalf("register prompt template routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newPromptTemplateRouteTestStore(t *testing.T) *prompttemplates.Store {
	t.Helper()

	store, err := prompttemplates.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	return store
}
