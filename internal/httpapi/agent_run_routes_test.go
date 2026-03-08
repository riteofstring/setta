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
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/modes"
)

func TestRegisterAgentRunRoutesListsRuns(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	first := newAgentRunRouteTestRun("run-b", "chat-b", "project-b", agentruns.RunStatusCompleted)
	second := newAgentRunRouteTestRun("run-a", "chat-a", "project-a", agentruns.RunStatusRunning)
	if err := store.Save(first); err != nil {
		t.Fatalf("save first run: %v", err)
	}
	if err := store.Save(second); err != nil {
		t.Fatalf("save second run: %v", err)
	}

	handler := newAgentRunRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAgentRuns, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var runs []agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &runs); err != nil {
		t.Fatalf("decode runs: %v", err)
	}
	if len(runs) != 2 {
		t.Fatalf("expected two runs, got %#v", runs)
	}
	if runs[0].ID != "run-a" || runs[1].ID != "run-b" {
		t.Fatalf("expected lexicographic run ordering, got %#v", runs)
	}
	if got := runs[0].Inputs["chatId"]; got != "chat-a" {
		t.Fatalf("expected chat-a input, got %#v", got)
	}
}

func TestRegisterAgentRunRoutesReturnsEmptyList(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	handler := newAgentRunRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAgentRuns, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var runs []agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &runs); err != nil {
		t.Fatalf("decode runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected empty run list, got %#v", runs)
	}
}

func TestRegisterAgentRunRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	handler := newAgentRunRouteTestHandler(t, config.ModeShare, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAgentRuns, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if response.Body.String() == "" {
		t.Fatal("expected error payload")
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "mode_forbidden" {
		t.Fatalf("expected mode_forbidden, got %#v", payload)
	}
}

func newAgentRunRouteTestHandler(t *testing.T, mode config.Mode, store *agentruns.RunStore) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAgentRunRoutes(r, AgentRunRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Runs:       store,
			}); err != nil {
				t.Fatalf("register agent run routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newAgentRunRouteTestStore(t *testing.T) *agentruns.RunStore {
	t.Helper()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	return store
}

func newAgentRunRouteTestRun(runID string, chatID string, projectConfigID string, status agentruns.RunStatus) agentruns.Run {
	now := time.Date(2026, 3, 9, 19, 0, 0, 0, time.UTC)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "external_agent_chat",
		"chatId":          chatID,
		"projectConfigId": projectConfigID,
	}, now)
	run.ID = runID
	run.Status = status
	run.Outputs = map[string]any{
		"toolType": "codex",
	}
	return run
}
