package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/runchains"
)

const routeAgentRunWaitTimeout = 5 * time.Second

func TestRegisterAgentRunRoutesListsRuns(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, nil)
	first := newAgentRunRouteTestRun("run-b", "chat-b", "project-b", agentruns.RunStatusCompleted)
	second := newAgentRunRouteTestRun("run-a", "chat-a", "project-a", agentruns.RunStatusRunning)
	if err := fixture.runs.Save(first); err != nil {
		t.Fatalf("save first run: %v", err)
	}
	if err := fixture.runs.Save(second); err != nil {
		t.Fatalf("save second run: %v", err)
	}

	handler := fixture.handler
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

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, nil)
	handler := fixture.handler
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

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, nil)
	run := newAgentRunRouteTestRun("run-a", "chat-a", "project-a", agentruns.RunStatusRunning)
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	handler := fixture.handler
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

func TestRegisterAgentRunRoutesStartsManagedRun(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{
		result: agentruns.ExecutionResult{
			Outputs: map[string]any{
				"messages": []any{},
			},
		},
	})
	if err := fixture.profiles.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: routeAgentRunStringPointer("engine-primary"),
		},
	}); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartAgentRun, strings.NewReader(`{"profileId":"profile-alpha","inputs":{"prompt":"hello","allowUnscoped":true}}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode started run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running run, got %#v", started)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), routeAgentRunWaitTimeout)
	defer cancel()
	completed, err := fixture.runtime.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for managed run: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run, got %#v", completed)
	}
	if fixture.executor == nil || fixture.executor.calls != 1 {
		t.Fatalf("expected one executor call, got %#v", fixture.executor)
	}
}

func TestRegisterAgentRunRoutesStopsManagedRun(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &blockingRouteAgentRunExecutor{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
	})
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: routeAgentRunStringPointer("engine-primary"),
	}
	if err := fixture.profiles.Write([]agentprofiles.Profile{profile}); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}

	startedRun, err := fixture.runtime.StartRun(profile, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("start managed run directly: %v", err)
	}
	select {
	case <-fixture.blocking.started:
	case <-time.After(routeAgentRunWaitTimeout):
		t.Fatal("timed out waiting for managed run start")
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStopAgentRun, strings.NewReader(`{"runId":"`+startedRun.ID+`"}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var stopped agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &stopped); err != nil {
		t.Fatalf("decode stopped run: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled run, got %#v", stopped)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), routeAgentRunWaitTimeout)
	defer cancel()
	waited, err := fixture.runtime.WaitForRun(waitCtx, startedRun.ID)
	if err != nil {
		t.Fatalf("wait for cancelled run: %v", err)
	}
	if waited.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled terminal run, got %#v", waited)
	}
}

// The stop route should preserve the typed not-found response when the caller
// targets a managed run id that does not exist.
func TestRegisterAgentRunRoutesReturnsNotFoundForMissingManagedRunStop(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{})
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStopAgentRun, strings.NewReader(`{"runId":"run-missing"}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing managed stop error: %v", err)
	}
	if payload.Error.Code != "agent_run_not_found" {
		t.Fatalf("expected agent_run_not_found, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesStartsManagedRunChain(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{
		result: agentruns.ExecutionResult{
			Outputs: map[string]any{
				"messages": []any{},
				"result":   "ok",
			},
		},
	})

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartRunChain, strings.NewReader(`{
		"spec":{
			"id":"chain-alpha",
			"name":"Chain Alpha",
			"steps":[
				{
					"id":"step-alpha",
					"name":"Step Alpha",
					"engineConfigId":"engine-primary",
					"prompt":"hello"
				}
			]
		},
		"inputs":{"allowUnscoped":true}
	}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode started run chain: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running run chain, got %#v", started)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), routeAgentRunWaitTimeout)
	defer cancel()
	completed, err := fixture.chains.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for run chain: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run chain, got %#v", completed)
	}
	steps, ok := completed.Outputs["steps"].([]any)
	if !ok || len(steps) != 1 {
		t.Fatalf("expected one step summary, got %#v", completed.Outputs["steps"])
	}
}

func TestRegisterAgentRunRoutesStopsManagedRunChain(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &blockingRouteAgentRunExecutor{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
	})
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartRunChain, strings.NewReader(`{
		"spec":{
			"id":"chain-alpha",
			"name":"Chain Alpha",
			"steps":[
				{
					"id":"step-alpha",
					"name":"Step Alpha",
					"engineConfigId":"engine-primary",
					"prompt":"hello"
				}
			]
		},
		"inputs":{"allowUnscoped":true}
	}`))
	response := httptest.NewRecorder()
	fixture.handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode started run chain: %v", err)
	}
	select {
	case <-fixture.blocking.started:
	case <-time.After(routeAgentRunWaitTimeout):
		t.Fatal("timed out waiting for run-chain child execution start")
	}

	stopRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteStopRunChain, strings.NewReader(`{"runId":"`+started.ID+`"}`))
	stopResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(stopResponse, stopRequest)
	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopped agentruns.Run
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopped); err != nil {
		t.Fatalf("decode stopped run chain: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled run chain, got %#v", stopped)
	}
	waitCtx, cancel := context.WithTimeout(context.Background(), routeAgentRunWaitTimeout)
	defer cancel()
	waited, err := fixture.chains.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for stopped run chain: %v", err)
	}
	if waited.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled terminal run chain, got %#v", waited)
	}
}

func TestRegisterAgentRunRoutesReturnsNotFoundForMissingRun(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, nil)
	handler := fixture.handler
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

func TestRegisterAgentRunRoutesReturnsNotFoundForMissingProfileOnStart(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{})
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartAgentRun, strings.NewReader(`{"profileId":"missing-profile","inputs":{"allowUnscoped":true}}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_profile_not_found" {
		t.Fatalf("expected agent_profile_not_found, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesRejectsExternalAgentProfileOnStart(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{})
	externalConfigID := "external-primary"
	if err := fixture.engines.Write([]agentruns.EngineConfig{
		{
			ID:                    "engine-primary",
			Name:                  "External",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &externalConfigID,
		},
	}); err != nil {
		t.Fatalf("write external engine config: %v", err)
	}
	if err := fixture.profiles.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: routeAgentRunStringPointer("engine-primary"),
		},
	}); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartAgentRun, strings.NewReader(`{"profileId":"profile-alpha","inputs":{"allowUnscoped":true}}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "managed_llm_engine_required" {
		t.Fatalf("expected managed_llm_engine_required, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesReturnsExternalStepUnavailableWhenNoExternalRuntimeIsWired(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{})
	if err := fixture.engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: routeAgentRunStringPointer("primary"),
		},
		{
			ID:                    "engine-external",
			Name:                  "External",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: routeAgentRunStringPointer("external-primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartRunChain, strings.NewReader(`{
		"spec":{
			"id":"chain-alpha",
			"name":"Chain Alpha",
			"steps":[{"id":"step-alpha","name":"Step Alpha","engineConfigId":"engine-external"}]
		},
		"inputs":{"allowUnscoped":true}
	}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "external_run_chain_unavailable" {
		t.Fatalf("expected external_run_chain_unavailable, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesStartsExternalRunChainStepWhenExternalRuntimeIsWired(t *testing.T) {
	t.Parallel()

	external := &routeExternalRunner{}
	fixture := newAgentRunRouteFixtureWithExternal(t, config.ModeIDE, &routeAgentRunExecutor{}, external)
	if err := fixture.engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: routeAgentRunStringPointer("primary"),
		},
		{
			ID:                    "engine-external",
			Name:                  "External",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: routeAgentRunStringPointer("external-primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartRunChain, strings.NewReader(`{
		"spec":{
			"id":"chain-alpha",
			"name":"Chain Alpha",
			"steps":[{"id":"step-alpha","name":"Step Alpha","engineConfigId":"engine-external","prompt":"hello"}]
		},
		"inputs":{"allowUnscoped":true}
	}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode started run chain: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running chain, got %#v", started)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := fixture.chains.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for external run chain: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed chain, got %#v", completed)
	}
	if len(external.startCalls) != 1 || len(external.waitCalls) != 1 {
		t.Fatalf("expected one external step start/wait, got %#v / %#v", external.startCalls, external.waitCalls)
	}
}

func TestRegisterAgentRunRoutesRejectsInvalidRunChainInputsOnStart(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{})
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartRunChain, strings.NewReader(`{
		"spec":{
			"id":"chain-alpha",
			"name":"Chain Alpha",
			"steps":[
				{
					"id":"step-alpha",
					"name":"Step Alpha",
					"engineConfigId":"engine-primary",
					"prompt":"hello",
					"inputs":{"allowUnscoped":"yes"}
				}
			]
		},
		"inputs":{}
	}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_run_chain_inputs" {
		t.Fatalf("expected invalid_run_chain_inputs, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesRejectsMissingRunID(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, nil)
	handler := fixture.handler
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

func TestRegisterAgentRunRoutesRejectsMissingProfileIDOnStart(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, &routeAgentRunExecutor{})
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteStartAgentRun, strings.NewReader(`{"inputs":{"allowUnscoped":true}}`))
	response := httptest.NewRecorder()

	fixture.handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "profile_id_required" {
		t.Fatalf("expected profile_id_required, got %#v", payload)
	}
}

func TestRegisterAgentRunRoutesReturnUnavailableWhenManagedRuntimeDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeIDE, nil)
	startRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteStartAgentRun, strings.NewReader(`{"profileId":"profile-alpha","inputs":{"allowUnscoped":true}}`))
	startResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(startResponse, startRequest)
	if startResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	stopRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteStopAgentRun, strings.NewReader(`{"runId":"run-a"}`))
	stopResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(stopResponse, stopRequest)
	if stopResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	startChainRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteStartRunChain, strings.NewReader(`{"spec":{"id":"chain-a","name":"Chain A","steps":[]}}`))
	startChainResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(startChainResponse, startChainRequest)
	if startChainResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", startChainResponse.Code, startChainResponse.Body.String())
	}
	stopChainRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteStopRunChain, strings.NewReader(`{"runId":"chain-a"}`))
	stopChainResponse := httptest.NewRecorder()
	fixture.handler.ServeHTTP(stopChainResponse, stopChainRequest)
	if stopChainResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", stopChainResponse.Code, stopChainResponse.Body.String())
	}
}

func TestRegisterAgentRunRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	fixture := newAgentRunRouteFixture(t, config.ModeShare, nil)
	testCases := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodGet, path: RouteGetAgentRuns},
		{method: http.MethodPost, path: RouteGetAgentRun, body: `{"runId":"run-a"}`},
		{method: http.MethodPost, path: RouteStartAgentRun, body: `{"profileId":"profile-a","inputs":{"allowUnscoped":true}}`},
		{method: http.MethodPost, path: RouteStopAgentRun, body: `{"runId":"run-a"}`},
		{method: http.MethodPost, path: RouteStartRunChain, body: `{"spec":{"id":"chain-a","name":"Chain A","steps":[]}}`},
		{method: http.MethodPost, path: RouteStopRunChain, body: `{"runId":"chain-a"}`},
	}

	for _, testCase := range testCases {
		request := httptest.NewRequest(testCase.method, "/api"+testCase.path, strings.NewReader(testCase.body))
		response := httptest.NewRecorder()

		fixture.handler.ServeHTTP(response, request)

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

type blockingRouteAgentRunExecutor struct {
	started chan struct{}
	release chan struct{}
}

func (e *blockingRouteAgentRunExecutor) Execute(ctx context.Context, _ agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	if e.started != nil {
		select {
		case e.started <- struct{}{}:
		default:
		}
	}
	if e.release == nil {
		return agentruns.ExecutionResult{Outputs: map[string]any{"messages": []any{}}}, nil
	}
	select {
	case <-e.release:
		return agentruns.ExecutionResult{Outputs: map[string]any{"messages": []any{}}}, nil
	case <-ctx.Done():
		return agentruns.ExecutionResult{}, ctx.Err()
	}
}

type routeExternalRunner struct {
	validateCalls []map[string]any
	startCalls    []map[string]any
	waitCalls     []string
	stopCalls     []string
	validateErr   error
	disabled      bool
}

func (r *routeExternalRunner) Disabled() bool {
	return r.disabled
}

func (r *routeExternalRunner) ValidateRun(_ agentprofiles.Profile, inputs map[string]any) error {
	r.validateCalls = append(r.validateCalls, cloneAgentRunRouteMap(inputs))
	return r.validateErr
}

func (r *routeExternalRunner) StartRun(_ context.Context, profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
	r.startCalls = append(r.startCalls, cloneAgentRunRouteMap(inputs))
	run := agentruns.NewRun(routeAgentRunStringPointer(profile.ID), inputs, time.Date(2026, 3, 9, 19, 0, 0, 0, time.UTC))
	return run, nil
}

func (r *routeExternalRunner) StopRun(runID string) (agentruns.Run, error) {
	r.stopCalls = append(r.stopCalls, runID)
	run := agentruns.NewRun(nil, map[string]any{}, time.Date(2026, 3, 9, 19, 0, 0, 0, time.UTC))
	run.ID = runID
	run.Status = agentruns.RunStatusCancelled
	return run, nil
}

func (r *routeExternalRunner) WaitForRun(_ context.Context, runID string) (agentruns.Run, error) {
	r.waitCalls = append(r.waitCalls, runID)
	run := agentruns.NewRun(nil, map[string]any{}, time.Date(2026, 3, 9, 19, 0, 0, 0, time.UTC))
	run.ID = runID
	run.Status = agentruns.RunStatusCompleted
	run.Outputs = map[string]any{"messages": []any{}}
	return run, nil
}

type agentRunRouteFixture struct {
	handler  http.Handler
	profiles *agentprofiles.Store
	engines  *agentruns.EngineStore
	runs     *agentruns.RunStore
	service  *agentruns.Service
	runtime  *agentruns.Runtime
	chains   *runchains.Runtime
	executor *routeAgentRunExecutor
	blocking *blockingRouteAgentRunExecutor
}

func newAgentRunRouteFixture(t *testing.T, mode config.Mode, executor agentruns.Executor) agentRunRouteFixture {
	return newAgentRunRouteFixtureWithExternal(t, mode, executor, nil)
}

func newAgentRunRouteFixtureWithExternal(t *testing.T, mode config.Mode, executor agentruns.Executor, external *routeExternalRunner) agentRunRouteFixture {
	t.Helper()

	root := t.TempDir()
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: routeAgentRunStringPointer("primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	store, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	llmRuntime.UpdateAPIKeys(map[string]string{"OPENAI_API_KEY": "secret"})
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState:           projectRuntime,
		Engines:                engines,
		Runs:                   store,
		LLM:                    llmRuntime,
		Executor:               executor,
		CompletionGuardEnabled: true,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 19, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new managed agent run service: %v", err)
	}
	runtime, err := agentruns.NewRuntime(agentruns.RuntimeOptions{Service: service})
	if err != nil {
		t.Fatalf("new managed runtime: %v", err)
	}
	var externalRuntime interface {
		Disabled() bool
		ValidateRun(agentprofiles.Profile, map[string]any) error
		StartRun(context.Context, agentprofiles.Profile, map[string]any) (agentruns.Run, error)
		StopRun(string) (agentruns.Run, error)
		WaitForRun(context.Context, string) (agentruns.Run, error)
	}
	if external != nil {
		externalRuntime = external
	}

	chains, err := runchains.NewRuntime(runchains.RuntimeOptions{
		Runs:         store,
		Engines:      engines,
		Profiles:     profiles,
		ProjectState: projectRuntime,
		Managed:      runtime,
		External:     externalRuntime,
		TemporaryIDs: routeTemporaryIDs{},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 19, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new run-chain runtime: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAgentRunRoutes(r, AgentRunRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Profiles:   profiles,
				Runs:       store,
				Managed:    runtime,
				Chains:     chains,
			}); err != nil {
				t.Fatalf("register agent run routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	fixture := agentRunRouteFixture{
		handler:  handler,
		profiles: profiles,
		engines:  engines,
		runs:     store,
		service:  service,
		runtime:  runtime,
		chains:   chains,
	}
	if typed, ok := executor.(*routeAgentRunExecutor); ok {
		fixture.executor = typed
	}
	if typed, ok := executor.(*blockingRouteAgentRunExecutor); ok {
		fixture.blocking = typed
	}
	return fixture
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

func cloneAgentRunRouteMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

type routeTemporaryIDs struct{}

func (routeTemporaryIDs) EnsureTemporaryID(canonicalID string) (string, error) {
	return canonicalID, nil
}

func (routeTemporaryIDs) Snapshot() (map[string]string, error) {
	return map[string]string{}, nil
}
