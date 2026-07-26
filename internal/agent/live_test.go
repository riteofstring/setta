package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLiveCodexRuntimeFreshStructuredCall(t *testing.T) {
	requireLiveCodex(t)
	runtime := NewRuntime(Config{ExcludedEnv: []string{"OPENAI_API_KEY"}, Version: "live-structured-test"})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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

func TestLiveCodexRuntimeDurableRestrictedThread(t *testing.T) {
	requireLiveCodex(t)
	runtime := NewRuntime(Config{ExcludedEnv: []string{"OPENAI_API_KEY"}, Version: "live-restricted-thread-test"})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := runtime.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	requireLiveRoleModels(t, runtime, ctx)
	request := RestrictedThreadRequest{
		WorkspaceRoot: t.TempDir(),
		Invocation: Invocation{
			Model:           "gpt-5.6-terra",
			ReasoningEffort: "medium",
			PermissionMode:  PermissionModeReadOnly,
			ApprovalMode:    ApprovalModeNever,
		},
		DeveloperInstructions: "You are Setta's restricted global master. Wait for a constrained Setta routing turn.",
	}
	thread, err := runtime.StartRestrictedThread(ctx, request)
	if err != nil {
		t.Fatalf("StartRestrictedThread: %v", err)
	}
	if thread.ID == "" || thread.Ephemeral || thread.Model != request.Invocation.Model {
		t.Fatalf("live restricted thread = %+v", thread)
	}
	firstTurn := runLiveRestrictedStructuredTurn(
		t,
		runtime,
		ctx,
		request,
		thread.ID,
		"live-durable-structured-one",
		"DURABLE_STRUCTURED_ONE_OK",
	)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	if err := runtime.Shutdown(shutdownCtx); err != nil {
		shutdownCancel()
		t.Fatalf("shutdown restricted thread runtime before resume: %v", err)
	}
	shutdownCancel()
	runtime = NewRuntime(Config{ExcludedEnv: []string{"OPENAI_API_KEY"}, Version: "live-restricted-thread-resume-test"})
	resumed, err := runtime.ResumeRestrictedThread(ctx, thread.ID, request)
	if err != nil {
		t.Fatalf("ResumeRestrictedThread: %v", err)
	}
	if resumed.ID != thread.ID || resumed.Ephemeral || resumed.Model != request.Invocation.Model {
		t.Fatalf("live resumed restricted thread = %+v", resumed)
	}
	secondTurn := runLiveRestrictedStructuredTurn(
		t,
		runtime,
		ctx,
		request,
		thread.ID,
		"live-durable-structured-two",
		"DURABLE_STRUCTURED_TWO_OK",
	)
	if firstTurn.ProviderThreadID != secondTurn.ProviderThreadID ||
		firstTurn.ProviderTurnID == secondTurn.ProviderTurnID {
		t.Fatalf("durable structured turn continuity drifted: first=%+v second=%+v", firstTurn, secondTurn)
	}
	if err := runtime.UnsubscribeThread(ctx, thread.ID); err != nil {
		t.Fatalf("UnsubscribeThread: %v", err)
	}
}

func runLiveRestrictedStructuredTurn(
	t *testing.T,
	runtime *Runtime,
	ctx context.Context,
	thread RestrictedThreadRequest,
	threadID string,
	requestID string,
	expected string,
) RestrictedStructuredTurnResult {
	t.Helper()
	schema, err := json.Marshal(map[string]any{
		"type": "object",
		"properties": map[string]any{
			"answer": map[string]any{"type": "string", "enum": []string{expected}},
		},
		"required":             []string{"answer"},
		"additionalProperties": false,
	})
	if err != nil {
		t.Fatalf("marshal durable structured schema: %v", err)
	}
	result, err := runtime.RunRestrictedStructuredTurn(ctx, RestrictedStructuredTurnRequest{
		ID:               requestID,
		ProviderThreadID: threadID,
		WorkspaceRoot:    thread.WorkspaceRoot,
		Invocation:       thread.Invocation,
		Input:            json.RawMessage(fmt.Sprintf(`{"instruction":"Return exactly %s."}`, expected)),
		OutputSchema:     schema,
	})
	if err != nil {
		t.Fatalf("RunRestrictedStructuredTurn: %v", err)
	}
	var output struct {
		Answer string `json:"answer"`
	}
	if err := json.Unmarshal(result.Output, &output); err != nil {
		t.Fatalf("decode durable structured output: %v", err)
	}
	if output.Answer != expected || result.ProviderThreadID != threadID || result.ProviderTurnID == "" {
		t.Fatalf("durable structured result = %+v output=%s", result, result.Output)
	}
	return result
}

func TestLiveCodexRuntimeThreadLifecycleAndActiveForkSnapshot(t *testing.T) {
	requireLiveCodex(t)
	fixture := newLiveFixture(t)
	runLiveConcurrentTurns(t, fixture)
	verifyLiveDiscovery(t, fixture)
	durableFork := createLiveDurableFork(t, fixture)
	characterizeLiveActiveFork(t, fixture, durableFork)
}

type liveFixture struct {
	runtime    *Runtime
	ctx        context.Context
	workspace  string
	invocation Invocation
	thread     Thread
	second     TurnResult
	uniqueTerm string
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
	runtime := NewRuntime(Config{ExcludedEnv: []string{"OPENAI_API_KEY"}, Version: "live-test"})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
	thread, err := runtime.StartThread(ctx, StartThreadRequest{WorkspaceRoot: workspace, Invocation: invocation})
	if err != nil {
		t.Fatalf("StartThread: %v", err)
	}
	uniqueTerm := fmt.Sprintf("setta-live-topic-%d", time.Now().UnixNano())
	first := runLiveTurn(t, runtime, ctx, liveTurnRequest("live-conversation-a", "live-turn-a1", thread.ID, workspace, invocation, "Reply with exactly FIRST_OK. Tracking token: "+uniqueTerm))
	if first.Outcome != TurnOutcomeCompleted {
		t.Fatalf("first RunTurn = %+v", first)
	}
	second := runLiveTurn(t, runtime, ctx, liveTurnRequest("live-conversation-a", "live-turn-a2", thread.ID, workspace, invocation, "Reply with exactly SECOND_OK."))
	if second.Outcome != TurnOutcomeCompleted {
		t.Fatalf("second RunTurn = %+v", second)
	}
	return liveFixture{runtime: runtime, ctx: ctx, workspace: workspace, invocation: invocation, thread: thread, second: second, uniqueTerm: uniqueTerm}
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

func runLiveConcurrentTurns(t *testing.T, fixture liveFixture) {
	t.Helper()
	otherThread, err := fixture.runtime.StartThread(fixture.ctx, StartThreadRequest{WorkspaceRoot: fixture.workspace, Invocation: fixture.invocation})
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
}

func runLiveConcurrentTurn(waitGroup *sync.WaitGroup, errors chan<- error, fixture liveFixture, index int, providerThreadID string) {
	defer waitGroup.Done()
	conversationID := fmt.Sprintf("live-conversation-concurrent-%d", index)
	turnID := fmt.Sprintf("live-turn-concurrent-%d", index)
	result, err := fixture.runtime.RunTurn(fixture.ctx, liveTurnRequest(conversationID, turnID, providerThreadID, fixture.workspace, fixture.invocation, "Reply with exactly CONCURRENT_OK."), &recordingEventSink{})
	if err == nil && result.Outcome != TurnOutcomeCompleted {
		err = fmt.Errorf("unexpected concurrent outcome %s", result.Outcome)
	}
	errors <- err
}

func verifyLiveDiscovery(t *testing.T, fixture liveFixture) {
	t.Helper()
	read, err := fixture.runtime.ReadThread(fixture.ctx, fixture.thread.ID, true)
	if err != nil || len(read.Turns) < 3 {
		t.Fatalf("ReadThread = %+v, %v", read, err)
	}
	listed, err := fixture.runtime.ListThreads(fixture.ctx, ListThreadsRequest{Limit: MaxThreadPageSize})
	if err != nil || !threadPageContains(listed, fixture.thread.ID) {
		t.Fatalf("ListThreads does not contain %s: %+v, %v", fixture.thread.ID, listed, err)
	}
	searched, err := fixture.runtime.SearchThreads(fixture.ctx, SearchThreadsRequest{Limit: MaxThreadPageSize, SearchTerm: fixture.uniqueTerm})
	if err != nil || !searchPageContains(searched, fixture.thread.ID) {
		t.Fatalf("SearchThreads does not contain %s: %+v, %v", fixture.thread.ID, searched, err)
	}
}

func createLiveDurableFork(t *testing.T, fixture liveFixture) Thread {
	t.Helper()
	durableFork, err := fixture.runtime.ForkThread(fixture.ctx, ForkThreadRequest{
		ParentThreadID: fixture.thread.ID,
		LastTurnID:     &fixture.second.ProviderTurnID,
		WorkspaceRoot:  fixture.workspace,
		Invocation:     fixture.invocation,
	})
	if err != nil {
		t.Fatalf("completed-turn ForkThread: %v", err)
	}
	if err := fixture.runtime.InjectItems(fixture.ctx, durableFork.ID, []InjectedTextItem{{Role: "user", Text: "Injected boundary marker: DURABLE_FORK_BOUNDARY."}}); err != nil {
		t.Fatalf("InjectItems: %v", err)
	}
	return durableFork
}

type liveActiveParent struct {
	sink   *signalingEventSink
	result <-chan TurnResult
	err    <-chan error
	done   <-chan struct{}
}

type liveForkSnapshots struct {
	completedBoundary Thread
	audit             Thread
	auditAtFork       []ThreadTurn
	active            Thread
	activeAtFork      []ThreadTurn
}

func characterizeLiveActiveFork(t *testing.T, fixture liveFixture, _ Thread) {
	t.Helper()
	fixture = newLiveActiveFixture(t, fixture)
	parent := startLiveActiveParent(fixture)
	waitForLiveParentActivity(t, parent)
	drainLiveParentSignals(parent)
	sideInvocation := liveSideInvocation()
	forks := createLiveActiveForks(t, fixture, parent, sideInvocation)
	assertLiveDurableAuditSnapshot(t, forks.auditAtFork)
	assertLiveEphemeralForkResponseSnapshot(t, forks.activeAtFork)
	awaitLiveActiveParent(t, parent)
	assertLiveForkIsolation(t, fixture, forks, sideInvocation)
	logLiveForkCharacterization(t, forks)
	unsubscribeLiveForks(t, fixture, forks)
}

func waitForLiveParentActivity(t *testing.T, parent liveActiveParent) {
	t.Helper()
	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()
	for {
		select {
		case event := <-parent.sink.events:
			if event.Kind == EventKindActivityStarted {
				return
			}
		case <-parent.done:
			events := parent.sink.snapshot()
			for _, event := range events {
				if event.Kind == EventKindActivityStarted {
					return
				}
			}
			t.Fatalf("active parent completed before starting provider activity; events = %+v", events)
		case <-timer.C:
			t.Fatalf("timed out waiting for active parent provider activity; events = %+v", parent.sink.snapshot())
		}
	}
}

func newLiveActiveFixture(t *testing.T, fixture liveFixture) liveFixture {
	t.Helper()
	invocation := livePrimaryAgentInvocation()
	thread, err := fixture.runtime.StartThread(fixture.ctx, StartThreadRequest{
		WorkspaceRoot: fixture.workspace,
		Invocation:    invocation,
	})
	if err != nil {
		t.Fatalf("StartThread active-fork characterization: %v", err)
	}
	baseline := runLiveTurn(t, fixture.runtime, fixture.ctx, liveTurnRequest(
		"live-conversation-active",
		"live-turn-active-baseline",
		thread.ID,
		fixture.workspace,
		invocation,
		"Reply with exactly ACTIVE_BASELINE_OK.",
	))
	if baseline.Outcome != TurnOutcomeCompleted {
		t.Fatalf("active-fork baseline RunTurn = %+v", baseline)
	}
	fixture.invocation = invocation
	fixture.thread = thread
	fixture.second = baseline
	return fixture
}

func drainLiveParentSignals(parent liveActiveParent) {
	go func() {
		for {
			select {
			case <-parent.sink.events:
			case <-parent.done:
				return
			}
		}
	}()
}

func startLiveActiveParent(fixture liveFixture) liveActiveParent {
	sink := newSignalingEventSink()
	result := make(chan TurnResult, 1)
	errors := make(chan error, 1)
	done := make(chan struct{})
	go func() {
		defer close(done)
		turnResult, err := fixture.runtime.RunTurn(fixture.ctx, liveTurnRequest(
			"live-conversation-active",
			"live-turn-active",
			fixture.thread.ID,
			fixture.workspace,
			fixture.invocation,
			"Before using a tool, send the public commentary marker ACTIVE_PARENT_STARTING. Then use the shell command tool to run `sleep 12`. Do not answer without running it. After it finishes, reply with exactly ACTIVE_PARENT_FINISHED.",
		), sink)
		result <- turnResult
		errors <- err
	}()
	return liveActiveParent{sink: sink, result: result, err: errors, done: done}
}

func livePrimaryAgentInvocation() Invocation {
	return Invocation{
		Model:           "gpt-5.6-sol",
		ReasoningEffort: "high",
		PermissionMode:  PermissionModeWorkspaceWrite,
		ApprovalMode:    ApprovalModeOnRequest,
	}
}

func liveSideInvocation() Invocation {
	return Invocation{
		Model:           "gpt-5.6-luna",
		ReasoningEffort: "medium",
		PermissionMode:  PermissionModeReadOnly,
		ApprovalMode:    ApprovalModeOnRequest,
	}
}

func createLiveActiveForks(t *testing.T, fixture liveFixture, parent liveActiveParent, sideInvocation Invocation) liveForkSnapshots {
	t.Helper()
	completedBoundary := forkLiveThread(t, fixture, ForkThreadRequest{
		ParentThreadID:        fixture.thread.ID,
		LastTurnID:            &fixture.second.ProviderTurnID,
		WorkspaceRoot:         fixture.workspace,
		Invocation:            sideInvocation,
		Ephemeral:             true,
		DeveloperInstructions: "This is an isolated live side-conversation characterization.",
	})
	assertLiveForkDidNotWait(t, parent.done, "completed-boundary fork")
	audit := forkLiveThread(t, fixture, ForkThreadRequest{
		ParentThreadID: fixture.thread.ID,
		WorkspaceRoot:  fixture.workspace,
		Invocation:     sideInvocation,
	})
	auditAtFork := append([]ThreadTurn{}, audit.Turns...)
	assertLiveForkDidNotWait(t, parent.done, "unbounded active-turn audit fork")
	active := forkLiveThread(t, fixture, ForkThreadRequest{
		ParentThreadID:        fixture.thread.ID,
		WorkspaceRoot:         fixture.workspace,
		Invocation:            sideInvocation,
		Ephemeral:             true,
		DeveloperInstructions: "This is an isolated live side-conversation characterization.",
	})
	activeAtFork := append([]ThreadTurn{}, active.Turns...)
	assertLiveForkDidNotWait(t, parent.done, "ephemeral active-turn fork")
	contextFrame := liveSideContextFrame(t, fixture.workspace)
	if err := fixture.runtime.InjectItems(fixture.ctx, active.ID, []InjectedTextItem{
		{Role: "user", Text: "Active side boundary marker."},
		{
			Role: "developer",
			Text: "Setta authoritative side context reference.\n" + contextFrame,
		},
	}); err != nil {
		t.Fatalf("active-fork InjectItems: %v", err)
	}
	return liveForkSnapshots{completedBoundary: completedBoundary, audit: audit, auditAtFork: auditAtFork, active: active, activeAtFork: activeAtFork}
}

func liveSideContextFrame(t *testing.T, workspace string) string {
	t.Helper()
	frame := map[string]any{
		"type":                     "side_in_flight_context_frame",
		"sourceTrajectorySequence": 1,
		"currentObjective": map[string]any{
			"input":    map[string]string{"text": "Run the active parent command."},
			"delivery": "normal",
			"status":   "running",
		},
		"acceptedSteering": []any{},
		"currentPlan":      nil,
		"activeActivities": []any{
			map[string]any{
				"startedAtSequence":     1,
				"lastUpdatedAtSequence": 1,
				"kind":                  "command",
				"title":                 "sleep 12",
				"command":               "sleep 12",
				"cwd":                   workspace,
				"server":                nil,
				"tool":                  nil,
				"namespace":             nil,
				"latestProgress":        "Command is running.",
				"latestOutput":          nil,
			},
		},
		"pendingApprovals": []any{},
		"artifacts":        []any{},
	}
	encoded, err := json.Marshal(frame)
	if err != nil {
		t.Fatalf("encode live side context frame: %v", err)
	}
	return string(encoded)
}

func forkLiveThread(t *testing.T, fixture liveFixture, request ForkThreadRequest) Thread {
	t.Helper()
	thread, err := fixture.runtime.ForkThread(fixture.ctx, request)
	if err != nil {
		t.Fatalf("ForkThread: %v", err)
	}
	return thread
}

func assertLiveForkDidNotWait(t *testing.T, done <-chan struct{}, description string) {
	t.Helper()
	select {
	case <-done:
		t.Fatalf("%s waited for the active parent", description)
	default:
	}
}

func assertLiveDurableAuditSnapshot(t *testing.T, snapshot []ThreadTurn) {
	t.Helper()
	thread := Thread{Turns: snapshot}
	if !threadHistoryContains(thread, "ACTIVE_PARENT_FINISHED") {
		t.Fatalf("unbounded active-turn snapshot omitted current user input: %+v", snapshot)
	}
	if !threadHistoryAgentMessageContains(thread, "ACTIVE_PARENT_STARTING") {
		t.Fatalf("unbounded active-turn snapshot omitted public commentary: %+v", snapshot)
	}
	if threadHistoryHasType(snapshot, "commandExecution") {
		t.Fatalf("active-turn snapshot unexpectedly contains the in-flight command; update the recorded provider characterization: %+v", snapshot)
	}
	status, found := threadHistoryTurnStatusContainingItem(snapshot, "userMessage", "ACTIVE_PARENT_FINISHED")
	if !found || status != "interrupted" {
		t.Fatalf("active-turn snapshot source turn status = %q/%t, want interrupted: %+v", status, found, snapshot)
	}
}

func assertLiveEphemeralForkResponseSnapshot(t *testing.T, snapshot []ThreadTurn) {
	t.Helper()
	thread := Thread{Turns: snapshot}
	if !threadHistoryContains(thread, "ACTIVE_PARENT_FINISHED") {
		t.Fatalf("ephemeral active-turn response omitted current user input: %+v", snapshot)
	}
	if !threadHistoryAgentMessageContains(thread, "ACTIVE_PARENT_STARTING") {
		t.Fatalf("ephemeral active-turn response omitted public commentary: %+v", snapshot)
	}
	if threadHistoryHasType(snapshot, "commandExecution") {
		t.Fatalf("ephemeral active-turn response unexpectedly contains the in-flight command: %+v", snapshot)
	}
	status, found := threadHistoryTurnStatusContainingItem(snapshot, "userMessage", "ACTIVE_PARENT_FINISHED")
	if !found || status != "inProgress" {
		t.Fatalf("ephemeral active-turn response source turn status = %q/%t, want inProgress: %+v", status, found, snapshot)
	}
}

func awaitLiveActiveParent(t *testing.T, parent liveActiveParent) {
	t.Helper()
	if err := <-parent.err; err != nil {
		t.Fatalf("active parent RunTurn: %v", err)
	}
	if result := <-parent.result; result.Outcome != TurnOutcomeCompleted {
		t.Fatalf("active parent outcome = %+v", result)
	}
	if got := latestCompletedText(parent.sink.snapshot()); !strings.Contains(got, "ACTIVE_PARENT_FINISHED") {
		t.Fatalf("active parent final reply = %q, want the ACTIVE_PARENT_FINISHED marker", got)
	}
}

func assertLiveForkIsolation(t *testing.T, fixture liveFixture, forks liveForkSnapshots, sideInvocation Invocation) {
	t.Helper()
	auditAfterParent, err := fixture.runtime.ReadThread(fixture.ctx, forks.audit.ID, true)
	if err != nil {
		t.Fatalf("read active audit fork after parent completion: %v", err)
	}
	if !reflect.DeepEqual(forks.auditAtFork, auditAfterParent.Turns) {
		t.Fatalf("later parent events leaked into durable audit snapshot: at fork=%+v after=%+v", forks.auditAtFork, auditAfterParent.Turns)
	}
	if threadHistoryAgentMessageContains(auditAfterParent, "ACTIVE_PARENT_FINISHED") {
		t.Fatal("later parent assistant output leaked into the active-turn fork snapshot")
	}
	if threadHistoryAgentMessageContains(Thread{Turns: forks.activeAtFork}, "ACTIVE_PARENT_FINISHED") {
		t.Fatal("ephemeral active fork included later parent assistant output")
	}
	if _, err := fixture.runtime.ReadThread(fixture.ctx, forks.active.ID, true); err == nil || !strings.Contains(err.Error(), "ephemeral threads do not support includeTurns") {
		t.Fatalf("ephemeral active fork read error = %v, want provider includeTurns constraint", err)
	}
	probeLiveEphemeralFork(t, fixture, forks.active, sideInvocation)
}

func probeLiveEphemeralFork(t *testing.T, fixture liveFixture, activeFork Thread, sideInvocation Invocation) {
	t.Helper()
	sink := &recordingEventSink{}
	probe, err := fixture.runtime.RunTurn(fixture.ctx, liveTurnRequest(
		"live-conversation-active-side",
		"live-turn-active-side-probe",
		activeFork.ID,
		fixture.workspace,
		sideInvocation,
		"Inspect only the inherited history from before the side boundary. If an assistant message there contains the exact literal ACTIVE_PARENT_FINISHED, reply exactly YES. Otherwise reply exactly NO.",
	), sink)
	if err != nil || probe.Outcome != TurnOutcomeCompleted {
		t.Fatalf("ephemeral inherited-context probe = %+v, %v", probe, err)
	}
	if got := strings.TrimSpace(latestCompletedText(sink.snapshot())); got != "NO" {
		t.Fatalf("ephemeral active fork observed later parent output: probe reply = %q, want NO", got)
	}
}

func logLiveForkCharacterization(t *testing.T, forks liveForkSnapshots) {
	t.Helper()
	t.Logf(
		"active-turn fork characterization: ephemeral response turns=%d items=%d projected the source turn in progress, while the durable audit response turns=%d items=%d marked the cloned turn interrupted; both returned while the parent was active, included user input/commentary, omitted the in-flight command and later parent output, and left the parent to complete; completed-boundary fork turns=%d",
		len(forks.activeAtFork),
		threadItemCount(forks.activeAtFork),
		len(forks.auditAtFork),
		threadItemCount(forks.auditAtFork),
		len(forks.completedBoundary.Turns),
	)
}

func unsubscribeLiveForks(t *testing.T, fixture liveFixture, forks liveForkSnapshots) {
	t.Helper()
	for _, fork := range []Thread{forks.active, forks.audit, forks.completedBoundary} {
		if err := fixture.runtime.UnsubscribeThread(fixture.ctx, fork.ID); err != nil {
			t.Fatalf("UnsubscribeThread %s: %v", fork.ID, err)
		}
	}
}

func liveTurnRequest(conversationID string, turnID string, threadID string, workspace string, invocation Invocation, text string) TurnRequest {
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

func searchPageContains(page ThreadSearchPage, threadID string) bool {
	for _, result := range page.Data {
		if result.Thread.ID == threadID {
			return true
		}
	}
	return false
}

func threadHistoryContains(thread Thread, text string) bool {
	for _, turn := range thread.Turns {
		for _, item := range turn.Items {
			if strings.Contains(item.Text, text) {
				return true
			}
		}
	}
	return false
}

func threadHistoryAgentMessageContains(thread Thread, text string) bool {
	for _, turn := range thread.Turns {
		for _, item := range turn.Items {
			if item.Type == "agentMessage" && strings.Contains(item.Text, text) {
				return true
			}
		}
	}
	return false
}

func threadHistoryHasType(turns []ThreadTurn, itemType string) bool {
	for _, turn := range turns {
		for _, item := range turn.Items {
			if item.Type == itemType {
				return true
			}
		}
	}
	return false
}

func threadHistoryTurnStatusContainingItem(
	turns []ThreadTurn,
	itemType string,
	text string,
) (string, bool) {
	for _, turn := range turns {
		for _, item := range turn.Items {
			if item.Type == itemType && strings.Contains(item.Text, text) {
				return turn.Status, true
			}
		}
	}
	return "", false
}

func threadItemCount(turns []ThreadTurn) int {
	count := 0
	for _, turn := range turns {
		count += len(turn.Items)
	}
	return count
}

func latestCompletedText(events []Event) string {
	text := ""
	for _, event := range events {
		if event.Kind == EventKindAgentTextCompleted && event.Text != nil {
			text = event.Text.Text
		}
	}
	return text
}
