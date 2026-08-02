package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/codexapp"
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

func TestFreshStructuredCleanupReturnsTypedInterruptionFailure(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := runtime.RunFreshStructuredCall(
		ctx,
		fakeFreshStructuredCallRequest(t, `{"mode":"tool-cleanup-fail"}`),
	)
	if err == nil || !IsStructuredTurnCleanupError(err) ||
		!strings.Contains(err.Error(), "scripted structured cleanup failure") {
		t.Fatalf("RunFreshStructuredCall cleanup error = %v", err)
	}
}

func TestFreshStructuredCallIgnoresBestEffortLagMarkers(t *testing.T) {
	runtime := newFakeRuntime(t)
	base := Event{
		ConversationID:   "conversation-structured",
		TurnID:           "turn-structured",
		ProviderThreadID: "thread-structured",
		ProviderTurnID:   "provider-turn-structured",
	}
	lag := codexapp.Event{
		Kind: codexapp.EventLag,
		Lag:  &codexapp.LagEvent{SkippedCount: 3},
	}

	terminal, err := runtime.handleFreshStructuredProviderEvent(lag, base, &[]string{})
	if err != nil || terminal != nil {
		t.Fatalf("structured lag marker produced terminal=%+v error=%v", terminal, err)
	}
	matched, err := freshStructuredTerminalNotification(
		lag,
		base.ProviderThreadID,
		base.ProviderTurnID,
	)
	if err != nil || matched {
		t.Fatalf("cleanup lag marker produced matched=%v error=%v", matched, err)
	}
}

func TestFreshStructuredCallAcceptsNormalizedExecutionMetadata(t *testing.T) {
	runtime := newTestRuntime()
	base := providerNotificationTestBase()
	for _, testCase := range []struct {
		name    string
		message codexapp.Message
	}{
		{
			name: "healthy thread lifecycle",
			message: providerNotificationMessage(
				t,
				codexapp.CodexNotificationThreadStatusChanged,
				map[string]any{
					"status":   map[string]any{"type": "active", "activeFlags": []string{}},
					"threadId": base.ProviderThreadID,
				},
			),
		},
		{
			name: "provider validation evidence",
			message: providerNotificationMessage(
				t,
				codexapp.CodexNotificationModelVerification,
				map[string]any{
					"threadId":      base.ProviderThreadID,
					"turnId":        base.ProviderTurnID,
					"verifications": []string{"trustedAccessForCyber"},
				},
			),
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			terminal, err := runtime.handleFreshStructuredProviderEvent(
				codexapp.Event{Kind: codexapp.EventNotification, Message: testCase.message},
				base,
				&[]string{},
			)
			if err != nil || terminal != nil {
				t.Fatalf("normalized metadata produced terminal=%+v error=%v", terminal, err)
			}
		})
	}
}

func TestFreshStructuredCallRejectsUnavailableNormalizedLifecycle(t *testing.T) {
	runtime := newTestRuntime()
	base := providerNotificationTestBase()
	message := providerNotificationMessage(
		t,
		codexapp.CodexNotificationThreadStatusChanged,
		map[string]any{
			"status":   map[string]any{"type": "systemError"},
			"threadId": base.ProviderThreadID,
		},
	)

	terminal, err := runtime.handleFreshStructuredProviderEvent(
		codexapp.Event{Kind: codexapp.EventNotification, Message: message},
		base,
		&[]string{},
	)
	if terminal != nil || !IsProviderLifecycleError(err) {
		t.Fatalf("unavailable lifecycle produced terminal=%+v error=%v", terminal, err)
	}
}

func TestFreshStructuredCallRequiresStrictIsolationContract(t *testing.T) {
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
	request.TokenUsageAttribution.Model = "different-model"
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("mismatched token attribution error = %v", err)
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

func TestFreshStructuredCallRejectsAndUnsubscribesProviderIsolationDrift(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request := fakeFreshStructuredCallRequest(t, `{"mode":"success"}`)
	request.DeveloperInstructions = "SIMULATE_STRUCTURED_RESPONSE_DRIFT"

	if _, err := runtime.RunFreshStructuredCall(ctx, request); err == nil ||
		!strings.Contains(err.Error(), "runtime workspace roots") {
		t.Fatalf("fresh structured isolation drift error = %v", err)
	}
	status, err := runtime.UnsubscribeThreadWithStatus(ctx, "thread-1")
	if err != nil {
		t.Fatalf("read rejected structured thread subscription status: %v", err)
	}
	if status != ThreadUnsubscribeStatusNotSubscribed {
		t.Fatalf("rejected structured thread subscription status = %s, want %s", status, ThreadUnsubscribeStatusNotSubscribed)
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
		TokenUsageAttribution: TokenUsageAttribution{
			Bucket:          TokenUsageBucketSystem,
			Role:            TokenUsageRoleNarrator,
			InvocationID:    "narrator-invocation-test",
			Model:           "gpt-narrator-test",
			ReasoningEffort: "low",
		},
		DeveloperInstructions: "Return the requested structured test result.",
		Input:                 json.RawMessage(input),
		OutputSchema:          schema,
	}
}
