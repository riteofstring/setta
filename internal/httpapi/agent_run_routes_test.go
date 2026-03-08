package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestRegisterAgentRunRoutesGetsRun(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	run := newAgentRunRouteTestRun("run-a", "chat-a", "project-a", agentruns.RunStatusRunning)
	if err := store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	handler := newAgentRunRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgentRun, strings.NewReader(`{"runId":"run-a"}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var loaded agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &loaded); err != nil {
		t.Fatalf("decode run: %v", err)
	}
	if loaded.ID != "run-a" || loaded.Status != agentruns.RunStatusRunning {
		t.Fatalf("unexpected run %#v", loaded)
	}
}

func TestRegisterAgentRunRoutesReturnsNotFoundForMissingRun(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	handler := newAgentRunRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgentRun, strings.NewReader(`{"runId":"run-missing"}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_run_not_found" {
		t.Fatalf("expected agent_run_not_found, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesRejectsMissingRunID(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	handler := newAgentRunRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgentRun, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "run_id_required" {
		t.Fatalf("expected run_id_required, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newAgentRunRouteTestStore(t)
	handler := newAgentRunRouteTestHandler(t, config.ModeShare, store)
	testCases := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodGet, path: RouteGetAgentRuns},
		{method: http.MethodPost, path: RouteGetAgentRun, body: `{"runId":"run-a"}`},
	}

	for _, testCase := range testCases {
		request := httptest.NewRequest(testCase.method, "/api"+testCase.path, strings.NewReader(testCase.body))
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if response.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
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
