package agent

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/codexapp"
	"setta/internal/runtimeaccounting"
)

func TestInitializeParamsPreservesProductionCapabilities(t *testing.T) {
	params := initializeParams("test-version")
	if params.Capabilities == nil {
		t.Fatal("initialize capabilities are nil")
	}
	capabilities := params.Capabilities
	if capabilities.ExperimentalApi == nil || !*capabilities.ExperimentalApi {
		t.Fatalf("experimental API capability = %v, want true", capabilities.ExperimentalApi)
	}
	if capabilities.RequestAttestation == nil || *capabilities.RequestAttestation {
		t.Fatalf("request attestation capability = %v, want false", capabilities.RequestAttestation)
	}
	if capabilities.OptOutNotificationMethods == nil {
		t.Fatal("opt-out notification methods are nil")
	}
	methods := *capabilities.OptOutNotificationMethods
	if len(methods) != 1 || methods[0] != codexapp.CodexNotificationThreadStarted {
		t.Fatalf("opt-out notification methods = %v, want [%s]", methods, codexapp.CodexNotificationThreadStarted)
	}
}

func TestRuntimeThreadPrimitivesAndModelCatalog(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	thread := assertFakeThreadLifecycle(t, ctx, runtime)
	assertFakeThreadDiscovery(t, ctx, runtime)
	assertFakeForkAndCleanup(t, ctx, runtime, thread)
	assertFakeModelResolution(t, ctx, runtime)
	assertFakeReconciliation(t, ctx, runtime, thread)
}

func TestRuntimeStartsAndResumesDurableRestrictedThread(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request := RestrictedThreadRequest{
		WorkspaceRoot: t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-narrator-test",
			ReasoningEffort: "low",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeNever,
		},
		DeveloperInstructions: "You are Setta's restricted global master.",
	}

	thread, err := runtime.StartRestrictedThread(ctx, request)
	if err != nil {
		t.Fatalf("StartRestrictedThread: %v", err)
	}
	if thread.ID == "" || thread.Ephemeral || thread.Model != request.Invocation.Model ||
		thread.CWD != request.WorkspaceRoot {
		t.Fatalf("restricted thread = %+v", thread)
	}
	resumed, err := runtime.ResumeRestrictedThread(ctx, thread.ID, request)
	if err != nil {
		t.Fatalf("ResumeRestrictedThread: %v", err)
	}
	if resumed.ID != thread.ID || resumed.Model != request.Invocation.Model || resumed.Ephemeral {
		t.Fatalf("resumed restricted thread = %+v", resumed)
	}
}

func TestRestrictedThreadRejectsUnresolvedOrPrivilegedInvocation(t *testing.T) {
	request := RestrictedThreadRequest{
		WorkspaceRoot: t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-master-test",
			ReasoningEffort: "medium",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeNever,
		},
		DeveloperInstructions: "You are Setta's restricted global master.",
	}
	request.Invocation.Model = ""
	request.Invocation.ModelSelectionProviderDefault = true
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "catalog-resolved exact model") {
		t.Fatalf("provider-default validation error = %v", err)
	}
	request.Invocation.ModelSelectionProviderDefault = false
	request.Invocation.Model = "gpt-master-test"
	request.Invocation.PermissionMode = PermissionModeWorkspaceWrite
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Fatalf("privileged validation error = %v", err)
	}
}

func TestRestrictedThreadUnsubscribesProviderResumeThatDriftsPolicy(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request := RestrictedThreadRequest{
		WorkspaceRoot: t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-narrator-test",
			ReasoningEffort: "low",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeNever,
		},
		DeveloperInstructions: "You are Setta's restricted global master.",
	}
	threadID := "thread-restricted-response-drift"
	if _, err := runtime.ResumeRestrictedThread(ctx, threadID, request); err == nil ||
		!strings.Contains(err.Error(), "permission mode") {
		t.Fatalf("restricted resume policy drift error = %v", err)
	}
	status, err := runtime.UnsubscribeThreadWithStatus(ctx, threadID)
	if err != nil {
		t.Fatalf("read rejected resume subscription status: %v", err)
	}
	if status != ThreadUnsubscribeStatusNotSubscribed {
		t.Fatalf("rejected resume subscription status = %s, want %s", status, ThreadUnsubscribeStatusNotSubscribed)
	}
}

func TestForkThreadParamsPinsReasoningAndClearsInheritedServiceTier(t *testing.T) {
	params, err := forkThreadParams(ForkThreadRequest{
		ParentThreadID: "thread-parent",
		WorkspaceRoot:  t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-5.6-luna",
			ReasoningEffort: "medium",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeOnRequest,
		},
		Ephemeral: true,
	})
	if err != nil {
		t.Fatalf("forkThreadParams: %v", err)
	}
	if params.Config == nil || string((*params.Config)["model_reasoning_effort"]) != `"medium"` {
		t.Fatalf("fork config = %+v", params.Config)
	}
	if params.ServiceTier == nil {
		t.Fatal("fork service tier override was omitted instead of explicitly cleared")
	}
	encoded, err := json.Marshal(params)
	if err != nil {
		t.Fatalf("marshal fork params: %v", err)
	}
	if !strings.Contains(string(encoded), `"serviceTier":null`) {
		t.Fatalf("fork params = %s, want explicit null service tier", encoded)
	}
}

func TestValidateForkThreadResponseRejectsProviderSettingDrift(t *testing.T) {
	workspaceRoot := t.TempDir()
	effort := codexapp.ReasoningEffort("medium")
	defaultTier := "default"
	request := ForkThreadRequest{
		ParentThreadID: "thread-parent",
		WorkspaceRoot:  workspaceRoot,
		Invocation: Invocation{
			Model:           "gpt-5.6-luna",
			ReasoningEffort: "medium",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeOnRequest,
		},
		Ephemeral: true,
	}
	valid := codexapp.ThreadForkResponse{
		ApprovalPolicy:  json.RawMessage(`"on-request"`),
		CWD:             codexapp.AbsolutePathBuf(workspaceRoot),
		Model:           "gpt-5.6-luna",
		ReasoningEffort: &effort,
		Sandbox:         json.RawMessage(`{"networkAccess":false,"type":"readOnly"}`),
		ServiceTier:     &defaultTier,
		Thread:          codexapp.Thread{CWD: codexapp.AbsolutePathBuf(workspaceRoot)},
	}
	if err := validateForkThreadResponse(request, valid); err != nil {
		t.Fatalf("valid fork response: %v", err)
	}

	otherEffort := codexapp.ReasoningEffort("high")
	fastTier := "fast"
	otherRoot := t.TempDir()
	tests := []struct {
		name   string
		mutate func(*codexapp.ThreadForkResponse)
		want   string
	}{
		{name: "model", mutate: func(response *codexapp.ThreadForkResponse) { response.Model = "gpt-other" }, want: "model"},
		{name: "reasoning", mutate: func(response *codexapp.ThreadForkResponse) { response.ReasoningEffort = &otherEffort }, want: "reasoning effort"},
		{name: "service tier", mutate: func(response *codexapp.ThreadForkResponse) { response.ServiceTier = &fastTier }, want: "service tier"},
		{name: "approval", mutate: func(response *codexapp.ThreadForkResponse) { response.ApprovalPolicy = json.RawMessage(`"never"`) }, want: "approval mode"},
		{name: "sandbox", mutate: func(response *codexapp.ThreadForkResponse) {
			response.Sandbox = json.RawMessage(`{"type":"workspaceWrite"}`)
		}, want: "permission mode"},
		{name: "cwd", mutate: func(response *codexapp.ThreadForkResponse) { response.CWD = codexapp.AbsolutePathBuf(otherRoot) }, want: "cwd"},
		{name: "thread cwd", mutate: func(response *codexapp.ThreadForkResponse) { response.Thread.CWD = codexapp.AbsolutePathBuf(otherRoot) }, want: "thread cwd"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := valid
			test.mutate(&response)
			err := validateForkThreadResponse(request, response)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validation error = %v, want %q", err, test.want)
			}
		})
	}
}

func assertFakeThreadLifecycle(t *testing.T, ctx context.Context, runtime *Runtime) Thread {
	t.Helper()
	thread, err := runtime.StartThread(ctx, StartThreadRequest{
		WorkspaceRoot: t.TempDir(),
		Invocation:    testInvocation(),
	})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}
	if thread.ID == "" || thread.Model != "gpt-agent-test" {
		t.Fatalf("started thread = %+v", thread)
	}
	resumed, err := runtime.ResumeThread(ctx, thread.ID)
	if err != nil || resumed.ID != thread.ID {
		t.Fatalf("ResumeThread = %+v, %v", resumed, err)
	}
	read, err := runtime.ReadThread(ctx, thread.ID, true)
	if err != nil || read.ID != thread.ID || read.TurnCount != 1 {
		t.Fatalf("ReadThread = %+v, %v", read, err)
	}
	return thread
}

func assertFakeThreadDiscovery(t *testing.T, ctx context.Context, runtime *Runtime) {
	t.Helper()
	listed, err := runtime.ListThreads(ctx, ListThreadsRequest{Limit: 10})
	if err != nil || len(listed.Data) == 0 {
		t.Fatalf("ListThreads = %+v, %v", listed, err)
	}
	searched, err := runtime.SearchThreads(ctx, SearchThreadsRequest{Limit: 10, SearchTerm: "topic"})
	if err != nil || len(searched.Data) != 1 || searched.Data[0].Snippet != "matching topic" {
		t.Fatalf("SearchThreads = %+v, %v", searched, err)
	}
}

func assertFakeForkAndCleanup(t *testing.T, ctx context.Context, runtime *Runtime, thread Thread) {
	t.Helper()
	lastTurnID := "turn-history"
	forked, err := runtime.ForkThread(ctx, ForkThreadRequest{
		ParentThreadID: thread.ID,
		LastTurnID:     &lastTurnID,
		WorkspaceRoot:  t.TempDir(),
		Invocation:     testInvocation(),
	})
	if err != nil || forked.ID == thread.ID || forked.ForkedFromID == nil || *forked.ForkedFromID != thread.ID {
		t.Fatalf("ForkThread = %+v, %v", forked, err)
	}
	if err := runtime.InjectItems(ctx, forked.ID, []InjectedTextItem{{Role: "user", Text: "Side conversation boundary."}}); err != nil {
		t.Fatalf("InjectItems: %v", err)
	}
	if err := runtime.UnsubscribeThread(ctx, forked.ID); err != nil {
		t.Fatalf("UnsubscribeThread: %v", err)
	}
	status, err := runtime.UnsubscribeThreadWithStatus(ctx, "thread-not-loaded")
	if err != nil || status != ThreadUnsubscribeStatusNotLoaded {
		t.Fatalf("UnsubscribeThreadWithStatus = %s, %v", status, err)
	}
	terminated, err := runtime.TerminateBackgroundProcess(ctx, thread.ID, "process-1")
	if err != nil || !terminated {
		t.Fatalf("TerminateBackgroundProcess = %t, %v", terminated, err)
	}
}

func assertFakeModelResolution(t *testing.T, ctx context.Context, runtime *Runtime) {
	t.Helper()
	models, err := runtime.ListModels(ctx, nil, 20, false)
	if err != nil || len(models.Data) != 2 || models.Data[0].ID != "gpt-agent-test" {
		t.Fatalf("ListModels = %+v, %v", models, err)
	}
	resolved, err := runtime.ResolveInvocation(ctx, Invocation{
		ModelSelectionProviderDefault: true,
		PermissionMode:                PermissionModeReadOnly,
		ApprovalMode:                  ApprovalModeNever,
	})
	if err != nil || resolved.Model != "gpt-agent-test" || resolved.ReasoningEffort != "high" {
		t.Fatalf("ResolveInvocation = %+v, %v", resolved, err)
	}
	_, err = runtime.ResolveInvocation(ctx, Invocation{
		Model:          "missing-model",
		PermissionMode: PermissionModeReadOnly,
		ApprovalMode:   ApprovalModeNever,
	})
	if err == nil {
		t.Fatal("ResolveInvocation accepted a missing exact model")
	}
}

func assertFakeReconciliation(t *testing.T, ctx context.Context, runtime *Runtime, thread Thread) {
	t.Helper()
	result, active, err := runtime.ReconcileTurn(ctx, thread.ID, "turn-history")
	if err != nil || active || result.Outcome != TurnOutcomeCompleted {
		t.Fatalf("ReconcileTurn = %+v, active=%t, err=%v", result, active, err)
	}
}

func TestRuntimeRunsSequentialAndConcurrentConversationTurns(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	workspace := t.TempDir()
	threads := make([]Thread, 2)
	for index := range threads {
		thread, err := runtime.StartThread(ctx, StartThreadRequest{WorkspaceRoot: workspace, Invocation: testInvocation()})
		if err != nil {
			t.Fatalf("StartThread %d: %v", index, err)
		}
		threads[index] = thread
	}

	results := make(chan TurnResult, 2)
	errorsFound := make(chan error, 2)
	sinks := []*recordingEventSink{{}, {}}
	var turns sync.WaitGroup
	for index := range threads {
		turns.Add(1)
		go func() {
			defer turns.Done()
			result, err := runtime.RunTurn(ctx, testTurnRequest(index, threads[index].ID, workspace, "normal"), sinks[index])
			results <- result
			errorsFound <- err
		}()
	}
	turns.Wait()
	close(results)
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Errorf("RunTurn: %v", err)
		}
	}
	for result := range results {
		if result.Outcome != TurnOutcomeCompleted {
			t.Errorf("turn result = %+v", result)
		}
	}
	for index, sink := range sinks {
		assertEventKinds(t, index, sink.snapshot(), []EventKind{
			EventKindTurnStarted,
			EventKindPlanChanged,
			EventKindActivityStarted,
			EventKindAgentTextDelta,
			EventKindAgentTextCompleted,
			EventKindActivityCompleted,
			EventKindTurnTerminal,
		})
	}

	secondSink := &recordingEventSink{}
	second, err := runtime.RunTurn(ctx, testTurnRequest(2, threads[0].ID, workspace, "normal"), secondSink)
	if err != nil || second.Outcome != TurnOutcomeCompleted {
		t.Fatalf("second sequential RunTurn = %+v, %v", second, err)
	}
}

func TestRuntimeSerializesConcurrentTurnsWhenWorkloadLeasesAreEnabled(t *testing.T) {
	manager := &testWorkloadLeaseManager{}
	reporter := &testWorkloadLeaseReporter{}
	runtime := newFakeRuntimeWithConfig(t, Config{
		WorkloadLeaseManager:  manager,
		WorkloadLeaseReporter: reporter,
		WorkloadLeaseTTL:      2 * time.Minute,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	workspace := t.TempDir()
	threads := make([]Thread, 2)
	for index := range threads {
		thread, err := runtime.StartThread(ctx, StartThreadRequest{
			WorkspaceRoot: workspace,
			Invocation:    testInvocation(),
		})
		if err != nil {
			t.Fatalf("StartThread %d: %v", index, err)
		}
		threads[index] = thread
	}

	firstCtx, cancelFirst := context.WithCancel(ctx)
	firstSink := newSignalingEventSink()
	firstDone := make(chan error, 1)
	go func() {
		_, err := runtime.RunTurn(
			firstCtx,
			testTurnRequest(0, threads[0].ID, workspace, "hold"),
			firstSink,
		)
		firstDone <- err
	}()
	firstSink.waitForKind(t, EventKindTurnStarted)
	manager.requireCalls(t, 1, 0, 0)

	secondSink := newSignalingEventSink()
	secondResult := make(chan TurnResult, 1)
	secondDone := make(chan error, 1)
	go func() {
		result, err := runtime.RunTurn(
			ctx,
			testTurnRequest(1, threads[1].ID, workspace, "normal"),
			secondSink,
		)
		secondResult <- result
		secondDone <- err
	}()
	select {
	case err := <-secondDone:
		t.Fatalf("second leased turn finished while the first was active: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if events := secondSink.snapshot(); len(events) != 0 {
		t.Fatalf("second leased turn emitted events while the first was active: %+v", events)
	}
	manager.requireCalls(t, 1, 0, 0)

	cancelFirst()
	if err := <-firstDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled first leased turn = %v, want context canceled", err)
	}
	if err := <-secondDone; err != nil {
		t.Fatalf("second leased turn after slot release: %v", err)
	}
	if result := <-secondResult; result.Outcome != TurnOutcomeCompleted {
		t.Fatalf("second leased turn result = %+v", result)
	}
	manager.requireCalls(t, 2, 0, 2)
	reporter.requireActions(
		t,
		runtimeaccounting.EventBegin,
		runtimeaccounting.EventEnd,
		runtimeaccounting.EventBegin,
		runtimeaccounting.EventEnd,
	)
}

func TestRuntimeHandlesDynamicToolCalls(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	workspace := t.TempDir()
	tool := DynamicTool{
		Namespace:            "setta",
		NamespaceDescription: "Setta tools.",
		Name:                 "emit_artifact",
		Description:          "Emit an artifact.",
		InputSchema:          json.RawMessage(`{"type":"object","properties":{"answer":{"type":"string"}}}`),
	}
	var handled DynamicToolCall
	tool.Handler = func(ctx context.Context, call DynamicToolCall) (DynamicToolResult, error) {
		if err := ctx.Err(); err != nil {
			return DynamicToolResult{}, err
		}
		handled = call
		var arguments struct {
			Answer string `json:"answer"`
		}
		if err := json.Unmarshal(call.Arguments, &arguments); err != nil {
			return DynamicToolResult{}, err
		}
		if arguments.Answer != "ok" {
			return DynamicToolResult{}, errors.New("dynamic tool arguments drifted")
		}
		return DynamicToolResult{
			ContentItems: []DynamicToolContentItem{{
				Type: "inputText",
				Text: "dynamic tool acknowledged",
			}},
			Success: true,
		}, nil
	}
	thread, err := runtime.StartThread(ctx, StartThreadRequest{
		WorkspaceRoot: workspace,
		Invocation:    testInvocation(),
		DynamicTools:  []DynamicTool{tool},
	})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}
	request := testTurnRequest(0, thread.ID, workspace, "dynamic tool")
	request.DynamicTools = []DynamicTool{tool}
	sink := &recordingEventSink{}
	result, err := runtime.RunTurn(ctx, request, sink)
	if err != nil || result.Outcome != TurnOutcomeCompleted {
		t.Fatalf("RunTurn = %+v, %v", result, err)
	}
	if handled.CallID == "" ||
		handled.ConversationID != request.ConversationID ||
		handled.TurnID != request.TurnID ||
		handled.ProviderThreadID != thread.ID ||
		handled.ProviderTurnID != result.ProviderTurnID ||
		handled.Namespace != "setta" ||
		handled.Tool != "emit_artifact" {
		t.Fatalf("dynamic tool call = %+v, result = %+v", handled, result)
	}
	assertEventKinds(t, 0, sink.snapshot(), []EventKind{
		EventKindTurnStarted,
		EventKindTurnTerminal,
	})
}

func TestRuntimeReturnsDynamicToolHandlerErrorsAsToolFailures(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	workspace := t.TempDir()
	tool := DynamicTool{
		Namespace:            "setta",
		NamespaceDescription: "Setta tools.",
		Name:                 "emit_artifact",
		Description:          "Emit an artifact.",
		InputSchema:          json.RawMessage(`{"type":"object","properties":{"answer":{"type":"string"}}}`),
		Handler: func(ctx context.Context, call DynamicToolCall) (DynamicToolResult, error) {
			if err := ctx.Err(); err != nil {
				return DynamicToolResult{}, err
			}
			var arguments struct {
				Answer string `json:"answer"`
			}
			if err := json.Unmarshal(call.Arguments, &arguments); err != nil {
				return DynamicToolResult{}, err
			}
			if arguments.Answer != "ok" {
				return DynamicToolResult{}, errors.New("dynamic tool arguments drifted")
			}
			return DynamicToolResult{
				ContentItems: []DynamicToolContentItem{{
					Type: "inputText",
					Text: "dynamic tool acknowledged",
				}},
				Success: true,
			}, nil
		},
	}
	thread, err := runtime.StartThread(ctx, StartThreadRequest{
		WorkspaceRoot: workspace,
		Invocation:    testInvocation(),
		DynamicTools:  []DynamicTool{tool},
	})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}
	request := testTurnRequest(0, thread.ID, workspace, "dynamic tool failure")
	request.DynamicTools = []DynamicTool{tool}
	sink := &recordingEventSink{}
	result, err := runtime.RunTurn(ctx, request, sink)
	if err != nil || result.Outcome != TurnOutcomeCompleted {
		t.Fatalf("RunTurn with failed dynamic tool result = %+v, %v", result, err)
	}
	assertEventKinds(t, 0, sink.snapshot(), []EventKind{
		EventKindTurnStarted,
		EventKindTurnTerminal,
	})
}

func TestRuntimeSteersInterruptsAndResolvesApproval(t *testing.T) {
	runtime := newFakeRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	workspace := t.TempDir()
	thread, err := runtime.StartThread(ctx, StartThreadRequest{WorkspaceRoot: workspace, Invocation: testInvocation()})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}

	t.Run("steer", func(t *testing.T) {
		sink := newSignalingEventSink()
		result := make(chan TurnResult, 1)
		errResult := make(chan error, 1)
		request := testTurnRequest(10, thread.ID, workspace, "hold")
		go func() {
			turnResult, turnErr := runtime.RunTurn(ctx, request, sink)
			result <- turnResult
			errResult <- turnErr
		}()
		started := sink.waitForKind(t, EventKindTurnStarted)
		if err := runtime.SteerTurn(ctx, TurnControlRequest{
			ConversationID:   request.ConversationID,
			ProviderThreadID: request.ProviderThreadID,
			ProviderTurnID:   started.ProviderTurnID,
			ClientInputID:    "input-steer",
			Text:             "continue with steering",
		}); err != nil {
			t.Fatalf("SteerTurn: %v", err)
		}
		if err := <-errResult; err != nil {
			t.Fatalf("steered RunTurn: %v", err)
		}
		if turnResult := <-result; turnResult.Outcome != TurnOutcomeCompleted {
			t.Fatalf("steered result = %+v", turnResult)
		}
	})

	t.Run("interrupt", func(t *testing.T) {
		sink := newSignalingEventSink()
		result := make(chan TurnResult, 1)
		errResult := make(chan error, 1)
		request := testTurnRequest(11, thread.ID, workspace, "interrupt")
		go func() {
			turnResult, turnErr := runtime.RunTurn(ctx, request, sink)
			result <- turnResult
			errResult <- turnErr
		}()
		started := sink.waitForKind(t, EventKindTurnStarted)
		if err := runtime.InterruptTurn(ctx, TurnControlRequest{
			ConversationID:   request.ConversationID,
			ProviderThreadID: request.ProviderThreadID,
			ProviderTurnID:   started.ProviderTurnID,
		}); err != nil {
			t.Fatalf("InterruptTurn: %v", err)
		}
		if err := <-errResult; err != nil {
			t.Fatalf("interrupted RunTurn: %v", err)
		}
		if turnResult := <-result; turnResult.Outcome != TurnOutcomeInterrupted {
			t.Fatalf("interrupted result = %+v", turnResult)
		}
	})

	t.Run("approval", func(t *testing.T) {
		sink := newSignalingEventSink()
		result := make(chan TurnResult, 1)
		errResult := make(chan error, 1)
		request := testTurnRequest(12, thread.ID, workspace, "approval")
		go func() {
			turnResult, turnErr := runtime.RunTurn(ctx, request, sink)
			result <- turnResult
			errResult <- turnErr
		}()
		approvalEvent := sink.waitForKind(t, EventKindApprovalRequested)
		if err := runtime.SubmitApproval(ApprovalResponse{
			RequestID: approvalEvent.Approval.ID,
			Decision:  ApprovalDecisionAccept,
			Answers:   []ApprovalAnswer{{QuestionID: "scope", Answers: []string{"focused"}}},
		}); err != nil {
			t.Fatalf("SubmitApproval: %v", err)
		}
		if err := <-errResult; err != nil {
			t.Fatalf("approved RunTurn: %v", err)
		}
		if turnResult := <-result; turnResult.Outcome != TurnOutcomeCompleted {
			t.Fatalf("approved result = %+v", turnResult)
		}
	})
}

func TestAgentRuntimeFakeAppServer(t *testing.T) {
	if os.Getenv("SETTA_AGENT_FAKE_APP_SERVER") != "1" {
		return
	}
	runFakeAgentAppServer()
}

func newFakeRuntime(t *testing.T) *Runtime {
	t.Helper()
	return newFakeRuntimeWithConfig(t, Config{})
}

func newFakeRuntimeWithConfig(t *testing.T, config Config) *Runtime {
	t.Helper()
	config.Command = os.Args[0]
	config.Args = []string{"-test.run=TestAgentRuntimeFakeAppServer", "--"}
	config.Env = append(os.Environ(), "SETTA_AGENT_FAKE_APP_SERVER=1")
	config.Version = "test"
	runtime := NewRuntime(config)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := runtime.Shutdown(ctx); err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("Shutdown: %v", err)
		}
	})
	return runtime
}

func testInvocation() Invocation {
	return Invocation{
		Model:           "gpt-agent-test",
		ReasoningEffort: "high",
		PermissionMode:  PermissionModeWorkspaceWrite,
		ApprovalMode:    ApprovalModeOnRequest,
	}
}

func testTurnRequest(index int, threadID string, workspace string, text string) TurnRequest {
	return TurnRequest{
		ConversationID:   "conversation-" + string(rune('a'+index)),
		TurnID:           "turn-setta-" + string(rune('a'+index)),
		ProviderThreadID: threadID,
		ClientInputID:    "input-" + string(rune('a'+index)),
		Text:             text,
		WorkspaceRoot:    workspace,
		Invocation:       testInvocation(),
	}
}

type recordingEventSink struct {
	mu     sync.Mutex
	events []Event
}

func (sink *recordingEventSink) HandleAgentEvent(event Event) error {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	sink.events = append(sink.events, event)
	return nil
}

func (sink *recordingEventSink) snapshot() []Event {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	return append([]Event{}, sink.events...)
}

type signalingEventSink struct {
	recordingEventSink
	events chan Event
}

func newSignalingEventSink() *signalingEventSink {
	return &signalingEventSink{events: make(chan Event, 32)}
}

func (sink *signalingEventSink) HandleAgentEvent(event Event) error {
	if err := sink.recordingEventSink.HandleAgentEvent(event); err != nil {
		return err
	}
	sink.events <- event
	return nil
}

func (sink *signalingEventSink) waitForKind(t *testing.T, kind EventKind) Event {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		select {
		case event := <-sink.events:
			if event.Kind == kind {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for event %s; events = %+v", kind, sink.snapshot())
		}
	}
}

func assertEventKinds(t *testing.T, index int, events []Event, want []EventKind) {
	t.Helper()
	got := make([]EventKind, 0, len(events))
	for _, event := range events {
		got = append(got, event.Kind)
	}
	if len(got) != len(want) {
		t.Fatalf("sink %d event kinds = %v, want %v", index, got, want)
	}
	for eventIndex := range want {
		if got[eventIndex] != want[eventIndex] {
			t.Fatalf("sink %d event kinds = %v, want %v", index, got, want)
		}
	}
}
