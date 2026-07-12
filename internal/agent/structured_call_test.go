package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestRuntimeRunsFreshRestrictedStructuredCall(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request := fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)

	result, err := runtime.RunFreshStructuredCall(ctx, request)
	if err != nil {
		t.Fatalf("RunFreshStructuredCall: %v", err)
	}
	if result.ProviderThreadID == "" || result.ProviderTurnID == "" {
		t.Fatalf("fresh structured provider references = %+v", result)
	}
	if string(result.Output) != `{"answer":"STRUCTURED_OK"}` {
		t.Fatalf("fresh structured output = %s", result.Output)
	}
	listed, err := runtime.ListThreads(ctx, ListThreadsRequest{Limit: 20})
	if err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	if threadPageContains(listed, result.ProviderThreadID) {
		t.Fatalf("ephemeral fresh structured thread %s appeared in durable thread list", result.ProviderThreadID)
	}
}

func TestFreshStructuredCallRunsWhilePrimaryConversationTurnIsActive(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	workspace := t.TempDir()
	thread, err := runtime.StartThread(ctx, StartThreadRequest{
		WorkspaceRoot: workspace,
		Invocation:    testInvocation(),
	})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}
	sink := newSignalingEventSink()
	primaryResult := make(chan TurnResult, 1)
	primaryError := make(chan error, 1)
	primaryRequest := testTurnRequest(20, thread.ID, workspace, "hold")
	go func() {
		result, runErr := runtime.RunTurn(ctx, primaryRequest, sink)
		primaryResult <- result
		primaryError <- runErr
	}()
	started := sink.waitForKind(t, EventKindTurnStarted)

	structuredRequest := fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)
	structuredRequest.WorkspaceRoot = workspace
	if _, err := runtime.RunFreshStructuredCall(ctx, structuredRequest); err != nil {
		t.Fatalf("RunFreshStructuredCall during primary turn: %v", err)
	}
	if err := runtime.InterruptTurn(ctx, TurnControlRequest{
		ConversationID:   primaryRequest.ConversationID,
		ProviderThreadID: thread.ID,
		ProviderTurnID:   started.ProviderTurnID,
	}); err != nil {
		t.Fatalf("InterruptTurn: %v", err)
	}
	if err := <-primaryError; err != nil {
		t.Fatalf("primary RunTurn: %v", err)
	}
	if result := <-primaryResult; result.Outcome != TurnOutcomeInterrupted {
		t.Fatalf("primary turn result = %+v", result)
	}
}

func TestRuntimeRejectsFreshStructuredProviderActivityAndMultipleOutputs(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		message string
	}{
		{name: "tool activity", input: `{"mode":"tool"}`, message: "disallowed provider activity activity_started"},
		{name: "multiple outputs", input: `{"mode":"double"}`, message: "2 completed assistant messages"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			runtime := newFakeRuntime(t)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_, err := runtime.RunFreshStructuredCall(ctx, fakeFreshStructuredCallRequest(t, test.input))
			if err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("RunFreshStructuredCall error = %v, want %q", err, test.message)
			}
		})
	}
}

func TestFreshStructuredCleanupRejectsRequestsAndWaitsForTerminal(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := runtime.RunFreshStructuredCall(
		ctx,
		fakeFreshStructuredCallRequest(t, `{"mode":"tool-cleanup-request"}`),
	)
	if err == nil || !strings.Contains(err.Error(), "disallowed provider activity activity_started") {
		t.Fatalf("RunFreshStructuredCall error = %v, want disallowed activity", err)
	}
	if strings.Contains(err.Error(), "interrupt unfinished fresh structured call") {
		t.Fatalf("cleanup abandoned interrupted turn after rejecting provider request: %v", err)
	}
}

func TestFreshStructuredCallRequiresStrictRestrictedContract(t *testing.T) {
	request := fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)
	request.Invocation.PermissionMode = PermissionModeWorkspaceWrite
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Fatalf("unsafe permission error = %v", err)
	}

	request = fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)
	request.Invocation.Model = ""
	request.Invocation.ModelSelectionProviderDefault = true
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "catalog-resolved exact model") {
		t.Fatalf("provider-default model error = %v", err)
	}

	request = fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)
	request.Invocation.ReasoningEffort = ""
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "reasoning effort must be exact") {
		t.Fatalf("unresolved reasoning effort error = %v", err)
	}

	request = fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)
	request.OutputSchema = json.RawMessage(`{
		"type":"object",
		"properties":{"answer":{"type":"string"}},
		"required":[],
		"additionalProperties":false
	}`)
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "require every property") {
		t.Fatalf("non-strict schema error = %v", err)
	}
}

func fakeFreshStructuredCallRequest(t *testing.T, input string) FreshStructuredCallRequest {
	t.Helper()
	schema, err := json.Marshal(map[string]any{
		"type": "object",
		"properties": map[string]any{
			"answer": map[string]any{
				"type": "string",
				"enum": []string{"STRUCTURED_OK", "FIRST", "SECOND"},
			},
		},
		"required":             []string{"answer"},
		"additionalProperties": false,
	})
	if err != nil {
		t.Fatalf("marshal structured schema: %v", err)
	}
	return FreshStructuredCallRequest{
		ID:            "fresh-structured-test",
		WorkspaceRoot: t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-narrator-test",
			ReasoningEffort: "low",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeNever,
		},
		DeveloperInstructions: "Return the requested structured test result.",
		Input:                 json.RawMessage(input),
		OutputSchema:          schema,
	}
}
