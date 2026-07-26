package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLiveCodexRuntimeFreshStructuredCall(t *testing.T) {
	requireLiveCodex(t)
	runtime := NewRuntime(Config{
		ExcludedEnv: []string{"OPENAI_API_KEY"},
		Version:     "live-structured-test",
	})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		if err := runtime.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	requireLiveRoleModels(t, runtime, ctx)
	schema, err := json.Marshal(map[string]any{
		"type": "object",
		"properties": map[string]any{
			"answer": map[string]any{
				"type": "string",
				"enum": []string{"FRESH_STRUCTURED_OK"},
			},
		},
		"required":             []string{"answer"},
		"additionalProperties": false,
	})
	if err != nil {
		t.Fatalf("marshal live structured schema: %v", err)
	}
	result, err := runtime.RunFreshStructuredCall(ctx, FreshStructuredCallRequest{
		ID:            "live-fresh-structured-call",
		WorkspaceRoot: t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-5.4-mini",
			ReasoningEffort: "low",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeNever,
		},
		DeveloperInstructions: "Read the instruction field and return the exact requested answer in the schema.",
		Input:                 json.RawMessage(`{"instruction":"Return FRESH_STRUCTURED_OK."}`),
		OutputSchema:          schema,
	})
	if err != nil {
		t.Fatalf("RunFreshStructuredCall: %v", err)
	}
	var output struct {
		Answer string `json:"answer"`
	}
	if err := json.Unmarshal(result.Output, &output); err != nil {
		t.Fatalf("decode live structured output: %v", err)
	}
	if output.Answer != "FRESH_STRUCTURED_OK" || result.ProviderThreadID == "" || result.ProviderTurnID == "" {
		t.Fatalf("live structured result = %+v, output=%s", result, result.Output)
	}
}

func TestLiveCodexRuntimeEphemeralThreadLifecycleAndDiscoveryIsolation(t *testing.T) {
	requireLiveCodex(t)
	fixture := newLiveFixture(t)
	fixture.otherThreadID = runLiveConcurrentTurns(t, fixture)
	verifyLiveEphemeralDiscoveryIsolation(t, fixture)
}

type liveFixture struct {
	runtime       *Runtime
	ctx           context.Context
	workspace     string
	invocation    Invocation
	thread        Thread
	otherThreadID string
	uniqueTerm    string
}

func requireLiveCodex(t *testing.T) {
	t.Helper()
	if os.Getenv("SETTA_LIVE_CODEX") != "1" {
		t.Skip("set SETTA_LIVE_CODEX=1 to run the ChatGPT-authenticated Codex integration")
	}
	if _, err := exec.LookPath("codex"); err != nil {
		t.Skip("Codex CLI is unavailable")
	}
}

func newLiveFixture(t *testing.T) liveFixture {
	t.Helper()
	runtime := NewRuntime(Config{
		ExcludedEnv: []string{"OPENAI_API_KEY"},
		Version:     "live-test",
	})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		if err := runtime.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	t.Cleanup(cancel)
	requireLiveRoleModels(t, runtime, ctx)

	workspace := t.TempDir()
	invocation := Invocation{
		Model:           "gpt-5.4-mini",
		ReasoningEffort: "low",
		PermissionMode:  PermissionModeReadOnly,
		ApprovalMode:    ApprovalModeNever,
	}
	thread, err := runtime.StartThread(ctx, StartThreadRequest{
		WorkspaceRoot: workspace,
		Invocation:    invocation,
		Ephemeral:     true,
	})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}
	uniqueTerm := fmt.Sprintf("setta-live-topic-%d", time.Now().UnixNano())
	first := runLiveTurn(t, runtime, ctx, liveTurnRequest(
		"live-conversation-a",
		"live-turn-a1",
		thread.ID,
		workspace,
		invocation,
		"Reply with exactly FIRST_OK. Tracking token: "+uniqueTerm,
	))
	if first.Outcome != TurnOutcomeCompleted {
		t.Fatalf("first RunTurn = %+v", first)
	}
	second := runLiveTurn(t, runtime, ctx, liveTurnRequest(
		"live-conversation-a",
		"live-turn-a2",
		thread.ID,
		workspace,
		invocation,
		"Reply with exactly SECOND_OK.",
	))
	if second.Outcome != TurnOutcomeCompleted {
		t.Fatalf("second RunTurn = %+v", second)
	}
	return liveFixture{
		runtime:    runtime,
		ctx:        ctx,
		workspace:  workspace,
		invocation: invocation,
		thread:     thread,
		uniqueTerm: uniqueTerm,
	}
}

func requireLiveRoleModels(t *testing.T, runtime *Runtime, ctx context.Context) {
	t.Helper()
	models, err := runtime.ListModels(ctx, nil, MaxThreadPageSize, true)
	if err != nil {
		if liveAuthUnavailable(err) {
			t.Skipf("ChatGPT authentication is unavailable: %v", err)
		}
		t.Fatalf("ListModels: %v", err)
	}
	for _, required := range []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4-mini"} {
		if !modelPageContains(models, required) {
			t.Fatalf("live model catalog does not contain required role model %s", required)
		}
	}
}

func runLiveTurn(t *testing.T, runtime *Runtime, ctx context.Context, request TurnRequest) TurnResult {
	t.Helper()
	result, err := runtime.RunTurn(ctx, request, &recordingEventSink{})
	if err != nil {
		t.Fatalf("RunTurn: %v", err)
	}
	return result
}

func runLiveConcurrentTurns(t *testing.T, fixture liveFixture) string {
	t.Helper()
	otherThread, err := fixture.runtime.StartThread(fixture.ctx, StartThreadRequest{
		WorkspaceRoot: fixture.workspace,
		Invocation:    fixture.invocation,
		Ephemeral:     true,
	})
	if err != nil {
		t.Fatalf("StartThread concurrent: %v", err)
	}
	var concurrent sync.WaitGroup
	concurrentErrors := make(chan error, 2)
	for index, providerThreadID := range []string{fixture.thread.ID, otherThread.ID} {
		concurrent.Add(1)
		go runLiveConcurrentTurn(&concurrent, concurrentErrors, fixture, index, providerThreadID)
	}
	concurrent.Wait()
	close(concurrentErrors)
	for err := range concurrentErrors {
		if err != nil {
			t.Fatalf("concurrent RunTurn: %v", err)
		}
	}
	return otherThread.ID
}

func runLiveConcurrentTurn(
	waitGroup *sync.WaitGroup,
	errors chan<- error,
	fixture liveFixture,
	index int,
	providerThreadID string,
) {
	defer waitGroup.Done()
	conversationID := fmt.Sprintf("live-conversation-concurrent-%d", index)
	turnID := fmt.Sprintf("live-turn-concurrent-%d", index)
	result, err := fixture.runtime.RunTurn(
		fixture.ctx,
		liveTurnRequest(
			conversationID,
			turnID,
			providerThreadID,
			fixture.workspace,
			fixture.invocation,
			"Reply with exactly CONCURRENT_OK.",
		),
		&recordingEventSink{},
	)
	if err == nil && result.Outcome != TurnOutcomeCompleted {
		err = fmt.Errorf("unexpected concurrent outcome %s", result.Outcome)
	}
	errors <- err
}

func verifyLiveEphemeralDiscoveryIsolation(t *testing.T, fixture liveFixture) {
	t.Helper()
	if _, err := fixture.runtime.ReadThread(fixture.ctx, fixture.thread.ID, true); err == nil ||
		!strings.Contains(err.Error(), "ephemeral threads do not support includeTurns") {
		t.Fatalf("ephemeral ReadThread error = %v, want provider includeTurns constraint", err)
	}
	listed, err := fixture.runtime.ListThreads(
		fixture.ctx,
		ListThreadsRequest{Limit: MaxThreadPageSize},
	)
	if err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	for _, threadID := range []string{fixture.thread.ID, fixture.otherThreadID} {
		if threadPageContains(listed, threadID) {
			t.Fatalf("ListThreads contains ephemeral thread %s: %+v", threadID, listed)
		}
	}
	tokenListed, err := fixture.runtime.ListThreads(
		fixture.ctx,
		ListThreadsRequest{
			Limit:      MaxThreadPageSize,
			SearchTerm: &fixture.uniqueTerm,
		},
	)
	if err != nil {
		t.Fatalf("ListThreads by prompt token: %v", err)
	}
	if len(tokenListed.Data) != 0 {
		t.Fatalf("ListThreads found ephemeral prompt token %q: %+v", fixture.uniqueTerm, tokenListed)
	}
	searched, err := fixture.runtime.SearchThreads(
		fixture.ctx,
		SearchThreadsRequest{
			Limit:      MaxThreadPageSize,
			SearchTerm: fixture.uniqueTerm,
		},
	)
	if err != nil {
		t.Fatalf("SearchThreads: %v", err)
	}
	if len(searched.Data) != 0 {
		t.Fatalf("SearchThreads found ephemeral prompt token %q: %+v", fixture.uniqueTerm, searched)
	}
}

func liveTurnRequest(
	conversationID string,
	turnID string,
	threadID string,
	workspace string,
	invocation Invocation,
	text string,
) TurnRequest {
	return TurnRequest{
		ConversationID:   conversationID,
		TurnID:           turnID,
		ProviderThreadID: threadID,
		ClientInputID:    turnID + "-input",
		Text:             text,
		WorkspaceRoot:    workspace,
		Invocation:       invocation,
	}
}

func liveAuthUnavailable(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "not logged in") ||
		strings.Contains(message, "authentication") ||
		strings.Contains(message, "unauthorized") ||
		strings.Contains(message, "login required")
}

func modelPageContains(page ModelPage, modelID string) bool {
	for _, model := range page.Data {
		if model.ID == modelID {
			return true
		}
	}
	return false
}

func threadPageContains(page ThreadPage, threadID string) bool {
	for _, thread := range page.Data {
		if thread.ID == threadID {
			return true
		}
	}
	return false
}
