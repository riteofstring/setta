package externalagents

import (
	"testing"

	"setta/internal/agentruns"
)

func assertStartedExternalChatResult(t *testing.T, fixture sendServiceFixture, result StartChatResult) {
	t.Helper()

	if result.ChatID == "" {
		t.Fatal("expected chat id")
	}
	if result.Run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running status, got %#v", result.Run)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	assertStartedExternalChatInputs(t, fixture.executor.last.Inputs)
	assertPersistedExternalChatRun(t, fixture, result)
	assertLiveExternalChatState(t, fixture, result.Run.ID)
}

func assertStartedExternalChatInputs(t *testing.T, inputs map[string]any) {
	t.Helper()

	expectedInputs := map[string]any{
		"permissionMode":        "minimal",
		"searchEnabled":         false,
		"frontendAffinityToken": "frontend-external",
		"approvalPolicy":        "on-request",
		"sandboxPolicy":         "workspace-write",
		"effort":                "low",
		"summary":               "none",
		"stateMachineRunId":     "workflow-run-1",
	}
	for key, expected := range expectedInputs {
		if got := inputs[key]; got != expected {
			t.Fatalf("unexpected %s %#v", key, got)
		}
	}

	systemPrompt, _ := inputs["systemPrompt"].(string)
	if systemPrompt == "" {
		t.Fatal("expected system prompt")
	}
	for _, expectedText := range []string{
		"## Runtime execution settings",
		"- permissionMode: minimal",
		"## Required completion gate for create/scaffold work",
	} {
		if !containsText(systemPrompt, expectedText) {
			t.Fatalf("expected system prompt to contain %q, got %q", expectedText, systemPrompt)
		}
	}
}

func assertPersistedExternalChatRun(t *testing.T, fixture sendServiceFixture, result StartChatResult) {
	t.Helper()

	persisted, err := fixture.runs.Load(result.Run.ID)
	if err != nil {
		t.Fatalf("load persisted run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected persisted running status, got %#v", persisted)
	}
	if got := resolveRunInputString(persisted, "chatId"); got != result.ChatID {
		t.Fatalf("expected persisted chat id %q, got %q", result.ChatID, got)
	}
	if len(persisted.Events) == 0 || persisted.Events[len(persisted.Events)-1].Type != "run_started" {
		t.Fatalf("expected run_started event, got %#v", persisted.Events)
	}
}

func assertLiveExternalChatState(t *testing.T, fixture sendServiceFixture, runID string) {
	t.Helper()

	liveState, err := fixture.runtime.GetLiveChatState(runID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if liveState == nil || !liveState.WaitingForResponse {
		t.Fatalf("expected live waiting state, got %#v", liveState)
	}
	if len(liveState.Messages) != 1 {
		t.Fatalf("expected one live message, got %#v", liveState.Messages)
	}
}
