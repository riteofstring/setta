package conversation

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/speech"
	"setta/internal/workspace"
)

func TestServiceRunsDurableConversationCommandsAndReload(t *testing.T) {
	appDataDir := t.TempDir()
	store, service, runtime, workspaceID := newConversationServiceTestHarness(t, appDataDir)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	created, subscription := createSubscribedServiceTopic(t, ctx, service, workspaceID)
	defer subscription.Unsubscribe()
	conversationID := created.Conversation.ID
	exerciseQueuedServiceTurns(t, ctx, service, runtime, workspaceID, conversationID, created, subscription)
	exerciseServiceApproval(t, ctx, service, runtime, workspaceID, conversationID)
	exerciseServiceCancellation(t, ctx, service, runtime, workspaceID, conversationID)
	assertReloadedServiceState(t, ctx, store, service, appDataDir, workspaceID, conversationID)
}

func createSubscribedServiceTopic(
	t *testing.T,
	ctx context.Context,
	service *Service,
	workspaceID string,
) (ConversationSnapshot, ConversationEventSubscription) {
	t.Helper()
	created, err := service.CreateTopic(ctx, workspaceID, "Durable lifecycle")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	subscription, err := service.SubscribeEvents(created.EventCursor, workspaceID, created.Conversation.ID)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	return created, subscription
}

func exerciseQueuedServiceTurns(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
	created ConversationSnapshot,
	subscription ConversationEventSubscription,
) {
	t.Helper()
	if _, err := service.SendTurn(ctx, workspaceID, conversationID, "hold"); err != nil {
		t.Fatalf("SendTurn hold: %v", err)
	}
	runtime.waitForStart(t, "hold")
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking && latestSnapshotTurn(snapshot).Status == TurnStatusRunning
	})
	if event := readServiceEvent(t, subscription); event.Sequence <= created.EventCursor.Sequence {
		t.Fatalf("first live event sequence = %d, want after %d", event.Sequence, created.EventCursor.Sequence)
	}

	if _, err := service.QueueTurn(ctx, workspaceID, conversationID, "queued artifact"); err != nil {
		t.Fatalf("QueueTurn: %v", err)
	}
	if _, err := service.QueueTurn(ctx, workspaceID, conversationID, "queued artifact two"); err != nil {
		t.Fatalf("QueueTurn second: %v", err)
	}
	if _, err := service.SteerTurn(ctx, workspaceID, conversationID, "finish held work"); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	runtime.waitForStart(t, "queued artifact")
	runtime.waitForStart(t, "queued artifact two")
	completed := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return len(snapshot.Turns.Turns) == 3 &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted &&
			len(snapshot.Queue) == 0 && len(snapshot.Artifacts.Artifacts) >= 3
	})
	if completed.Conversation.Status != ConversationStatusIdle {
		t.Fatalf("completed conversation status = %s, want idle", completed.Conversation.Status)
	}
}

func exerciseServiceApproval(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if _, err := service.SendTurn(ctx, workspaceID, conversationID, "approval"); err != nil {
		t.Fatalf("SendTurn approval: %v", err)
	}
	runtime.waitForStart(t, "approval")
	approval := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval
	})
	approvalID := latestPendingApprovalID(approval)
	if _, err := service.SubmitApproval(ctx, workspaceID, conversationID, ConversationApprovalResponse{
		ApprovalID: approvalID,
		Decision:   TrajectoryApprovalDecisionAnswered,
		Answers: []ConversationApprovalAnswer{{
			QuestionID: "scope",
			Answers:    []string{"focused"},
		}},
	}); err != nil {
		t.Fatalf("SubmitApproval: %v", err)
	}
	assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
}

func exerciseServiceCancellation(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if _, err := service.SendTurn(ctx, workspaceID, conversationID, "hold cancel"); err != nil {
		t.Fatalf("SendTurn cancel: %v", err)
	}
	runtime.waitForStart(t, "hold cancel")
	if _, err := service.StopTurn(ctx, workspaceID, conversationID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
	terminal := assertServiceSnapshot(t, service, workspaceID, conversationID, func(snapshot ConversationSnapshot) bool {
		return latestSnapshotTurn(snapshot).Status == TurnStatusCancelled
	})
	if terminal.Conversation.Status != ConversationStatusIdle {
		t.Fatalf("cancelled conversation status = %s, want idle", terminal.Conversation.Status)
	}
}

func assertReloadedServiceState(
	t *testing.T,
	ctx context.Context,
	store *Store,
	service *Service,
	appDataDir string,
	workspaceID string,
	conversationID string,
) {
	t.Helper()
	if err := service.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}
	reopened, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	reloaded, err := reopened.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot after reload: %v", err)
	}
	if latestSnapshotTurn(reloaded).Status != TurnStatusCancelled || len(reloaded.Artifacts.Artifacts) < 2 {
		t.Fatalf("reloaded snapshot lost terminal/artifact state: %+v", reloaded)
	}
}

func newConversationServiceTestHarness(
	t *testing.T,
	appDataDir string,
	additionalOptions ...ServiceOption,
) (*Store, *Service, *serviceTestAgentRuntime, string) {
	t.Helper()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if _, err := store.EnsureMasterVoiceSelection(
		context.Background(),
		speech.DefaultMasterVoiceSelection("2026-07-11T20:00:00Z"),
	); err != nil {
		t.Fatalf("EnsureMasterVoiceSelection: %v", err)
	}
	workspaceRoot := t.TempDir()
	workspaceID := "workspace-service"
	runtime := newServiceTestAgentRuntime()
	var idMu sync.Mutex
	idCounts := map[string]int{}
	var clockMu sync.Mutex
	now := time.Date(2026, 7, 11, 20, 0, 0, 0, time.UTC)
	options := []ServiceOption{
		WithServiceIDGenerator(func(prefix string) (string, error) {
			idMu.Lock()
			defer idMu.Unlock()
			idCounts[prefix]++
			return fmt.Sprintf("%s-%d", prefix, idCounts[prefix]), nil
		}),
		WithServiceClock(func() time.Time {
			clockMu.Lock()
			defer clockMu.Unlock()
			now = now.Add(time.Second)
			return now
		}),
	}
	options = append(options, additionalOptions...)
	service, err := NewService(
		store,
		serviceTestWorkspaceResolver{summary: workspace.WorkspaceSummary{
			ID:       workspaceID,
			RootPath: filepath.Clean(workspaceRoot),
		}},
		runtime,
		options...,
	)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return store, service, runtime, workspaceID
}

type serviceTestWorkspaceResolver struct {
	summary workspace.WorkspaceSummary
}

func (resolver serviceTestWorkspaceResolver) ResolveActiveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != resolver.summary.ID {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not active: %s", id)
	}
	return resolver.summary, nil
}

type serviceTestAgentRuntime struct {
	mu              sync.Mutex
	controls        map[string]chan string
	controlLog      []string
	forkErr         error
	forkRequests    []agent.ForkThreadRequest
	forkResponse    *agent.Thread
	injectErr       error
	injections      []serviceTestInjection
	lastApproval    *agent.ApprovalResponse
	resolveRequests []agent.Invocation
	runRequests     []agent.TurnRequest
	started         chan string
	threads         int
	turns           int
	unsubscribed    []string
}

type serviceTestInjection struct {
	threadID string
	items    []agent.InjectedTextItem
}

func newServiceTestAgentRuntime() *serviceTestAgentRuntime {
	return &serviceTestAgentRuntime{
		controls: map[string]chan string{},
		started:  make(chan string, MaxSnapshotQueuedTurns+4),
	}
}

func (runtime *serviceTestAgentRuntime) ResolveInvocation(
	_ context.Context,
	request agent.Invocation,
) (agent.ResolvedInvocation, error) {
	runtime.mu.Lock()
	runtime.resolveRequests = append(runtime.resolveRequests, request)
	runtime.mu.Unlock()
	return agent.ResolvedInvocation{
		Requested:       request,
		Model:           request.Model,
		ReasoningEffort: request.ReasoningEffort,
		ServiceTier:     request.ServiceTier,
		PermissionMode:  request.PermissionMode,
		ApprovalMode:    request.ApprovalMode,
	}, nil
}

func (runtime *serviceTestAgentRuntime) StartThread(
	context.Context,
	agent.StartThreadRequest,
) (agent.Thread, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.threads++
	return agent.Thread{
		ID:        fmt.Sprintf("provider-thread-%d", runtime.threads),
		SessionID: fmt.Sprintf("session-%d", runtime.threads),
		Model:     "gpt-5.6-sol",
	}, nil
}

func (runtime *serviceTestAgentRuntime) ForkThread(
	_ context.Context,
	request agent.ForkThreadRequest,
) (agent.Thread, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.forkRequests = append(runtime.forkRequests, request)
	if runtime.forkErr != nil {
		return agent.Thread{}, runtime.forkErr
	}
	if runtime.forkResponse != nil {
		return *runtime.forkResponse, nil
	}
	runtime.threads++
	parentThreadID := request.ParentThreadID
	return agent.Thread{
		ID:           fmt.Sprintf("provider-thread-%d", runtime.threads),
		SessionID:    fmt.Sprintf("session-%d", runtime.threads),
		Model:        request.Invocation.Model,
		Ephemeral:    request.Ephemeral,
		ForkedFromID: &parentThreadID,
	}, nil
}

func (runtime *serviceTestAgentRuntime) InjectItems(
	_ context.Context,
	threadID string,
	items []agent.InjectedTextItem,
) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	copyItems := append([]agent.InjectedTextItem{}, items...)
	runtime.injections = append(runtime.injections, serviceTestInjection{threadID: threadID, items: copyItems})
	return runtime.injectErr
}

func (runtime *serviceTestAgentRuntime) RunTurn(
	ctx context.Context,
	request agent.TurnRequest,
	sink agent.EventSink,
) (agent.TurnResult, error) {
	runtime.mu.Lock()
	runtime.turns++
	runtime.runRequests = append(runtime.runRequests, request)
	providerTurnID := fmt.Sprintf("provider-turn-%d", runtime.turns)
	control := make(chan string, 1)
	runtime.controls[providerTurnID] = control
	runtime.mu.Unlock()
	base := agent.Event{
		ConversationID:   request.ConversationID,
		TurnID:           request.TurnID,
		ProviderThreadID: request.ProviderThreadID,
		ProviderTurnID:   providerTurnID,
	}
	started := base
	started.Kind = agent.EventKindTurnStarted
	if err := sink.HandleAgentEvent(started); err != nil {
		return agent.TurnResult{}, err
	}
	runtime.started <- request.Text
	return runtime.runTestTurnScenario(ctx, request.Text, sink, base, control)
}

func (runtime *serviceTestAgentRuntime) runTestTurnScenario(
	ctx context.Context,
	text string,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) (agent.TurnResult, error) {
	switch text {
	case "approval", "secret approval":
		if err := runtime.runApprovalScenario(ctx, text == "secret approval", sink, base, control); err != nil {
			return agent.TurnResult{}, err
		}
	case "hold side context":
		if err := runtime.emitSideContextScenario(sink, base); err != nil {
			return agent.TurnResult{}, err
		}
		return runtime.runSideContextHeldScenario(ctx, sink, base, control)
	case "subagent":
		if err := runtime.emitSubagentLifecycle(sink, base); err != nil {
			return agent.TurnResult{}, err
		}
	case "missing terminal":
		return agent.TurnResult{
			ProviderThreadID: base.ProviderThreadID,
			ProviderTurnID:   base.ProviderTurnID,
			Outcome:          agent.TurnOutcomeCompleted,
		}, nil
	case "mismatched provider scope":
		mismatched := base
		mismatched.ProviderThreadID = "provider-thread-other"
		mismatched.Kind = agent.EventKindAgentTextCompleted
		mismatched.Text = &agent.TextEvent{
			ProviderItemID: "message-mismatched",
			Text:           "must not persist",
		}
		if err := sink.HandleAgentEvent(mismatched); err != nil {
			return agent.TurnResult{}, err
		}
	case "hold", "hold cancel", "hold fail", "hold after failure":
		return runtime.runHeldScenario(ctx, text, sink, base, control)
	}
	return runtime.emitCompletedTurn(sink, base, text)
}

func (runtime *serviceTestAgentRuntime) emitSideContextScenario(
	sink agent.EventSink,
	base agent.Event,
) error {
	reasoning := base
	reasoning.Kind = agent.EventKindReasoningSummary
	reasoning.Text = &agent.TextEvent{
		ProviderItemID: "provider-reasoning-side-context",
		Text:           "PRIVATE_REASONING_MUST_NOT_ENTER_SIDE_CONTEXT",
	}
	if err := sink.HandleAgentEvent(reasoning); err != nil {
		return err
	}
	explanation := "Inspect the active parent state without changing it."
	plan := base
	plan.Kind = agent.EventKindPlanChanged
	plan.Plan = &agent.PlanEvent{
		Explanation: &explanation,
		Steps: []agent.PlanStep{
			{Step: "Inspect authoritative state", Status: "inProgress"},
			{Step: "Finish parent work", Status: "pending"},
		},
	}
	if err := sink.HandleAgentEvent(plan); err != nil {
		return err
	}
	artifact := base
	artifact.Kind = agent.EventKindActivityCompleted
	artifact.Activity = &agent.ActivityEvent{
		ProviderItemID: "provider-artifact-side-context",
		Kind:           agent.ActivityKindArtifact,
		Status:         "completed",
		Title:          "Side context result",
		Summary:        "/tmp/side-context-result.md",
	}
	if err := sink.HandleAgentEvent(artifact); err != nil {
		return err
	}
	activity := base
	activity.Kind = agent.EventKindActivityStarted
	activity.Activity = &agent.ActivityEvent{
		ProviderItemID: "provider-command-side-context",
		Kind:           agent.ActivityKindCommand,
		Status:         "inProgress",
		Title:          "sleep 12",
	}
	if err := sink.HandleAgentEvent(activity); err != nil {
		return err
	}
	activity.Kind = agent.EventKindActivityUpdated
	activity.Activity.Summary = "Waiting for the active parent command."
	if err := sink.HandleAgentEvent(activity); err != nil {
		return err
	}
	approval := base
	approval.Kind = agent.EventKindApprovalRequested
	approval.Approval = &agent.ApprovalRequest{
		ID:             "provider-approval-side-context",
		ProviderItemID: "provider-approval-item-side-context",
		Kind:           agent.ApprovalKindCommand,
		Title:          "Allow inspection",
		Body:           "Approve the parent inspection command.",
		Command:        "inspect parent",
	}
	return sink.HandleAgentEvent(approval)
}

func (runtime *serviceTestAgentRuntime) runSideContextHeldScenario(
	ctx context.Context,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) (agent.TurnResult, error) {
	for {
		select {
		case action := <-control:
			switch action {
			case "steer":
				continue
			case "interrupt":
				return runtime.emitTerminal(sink, base, agent.TurnOutcomeInterrupted)
			default:
				return agent.TurnResult{}, fmt.Errorf("unsupported side context control %q", action)
			}
		case <-ctx.Done():
			return agent.TurnResult{}, ctx.Err()
		}
	}
}

func (runtime *serviceTestAgentRuntime) runApprovalScenario(
	ctx context.Context,
	secret bool,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) error {
	approval := base
	approval.Kind = agent.EventKindApprovalRequested
	approval.Approval = &agent.ApprovalRequest{
		ID: "approval-" + base.ProviderTurnID, ProviderItemID: "approval-item", Kind: agent.ApprovalKindUserInput,
		Title: "Scope", Body: "Choose scope", Questions: []agent.ApprovalQuestion{{
			ID: "scope", Header: "Scope", Question: "Which scope?", Options: []string{"focused"}, Secret: secret,
		}},
	}
	if err := sink.HandleAgentEvent(approval); err != nil {
		return err
	}
	select {
	case <-control:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (runtime *serviceTestAgentRuntime) runHeldScenario(
	ctx context.Context,
	text string,
	sink agent.EventSink,
	base agent.Event,
	control <-chan string,
) (agent.TurnResult, error) {
	var action string
	select {
	case action = <-control:
	case <-ctx.Done():
		return agent.TurnResult{}, ctx.Err()
	}
	if action == "interrupt" {
		return runtime.emitTerminal(sink, base, agent.TurnOutcomeInterrupted)
	}
	if text != "hold fail" {
		return runtime.emitCompletedTurn(sink, base, text)
	}
	message := "scripted held failure"
	terminal := base
	terminal.Kind = agent.EventKindTurnTerminal
	terminal.Terminal = &agent.TerminalEvent{Outcome: agent.TurnOutcomeFailed, Error: &message}
	if err := sink.HandleAgentEvent(terminal); err != nil {
		return agent.TurnResult{}, err
	}
	return agent.TurnResult{
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
		Outcome:          agent.TurnOutcomeFailed,
	}, nil
}

func (runtime *serviceTestAgentRuntime) emitSubagentLifecycle(
	sink agent.EventSink,
	base agent.Event,
) error {
	for _, status := range []string{"started", "interacted", "interrupted"} {
		event := base
		event.Kind = agent.EventKindActivityCompleted
		event.Activity = &agent.ActivityEvent{
			ProviderItemID: "subagent-item-" + status,
			Kind:           agent.ActivityKindSubagent,
			Status:         status,
			Title:          "reviewer",
			Summary:        "provider-subagent-thread",
		}
		if err := sink.HandleAgentEvent(event); err != nil {
			return err
		}
	}
	return nil
}

func (runtime *serviceTestAgentRuntime) emitCompletedTurn(
	sink agent.EventSink,
	base agent.Event,
	text string,
) (agent.TurnResult, error) {
	message := base
	message.Kind = agent.EventKindAgentTextCompleted
	message.Text = &agent.TextEvent{ProviderItemID: "message-" + base.ProviderTurnID, Text: "completed " + text}
	if err := sink.HandleAgentEvent(message); err != nil {
		return agent.TurnResult{}, err
	}
	artifact := base
	artifact.Kind = agent.EventKindActivityCompleted
	artifact.Activity = &agent.ActivityEvent{
		ProviderItemID: "artifact-" + base.ProviderTurnID,
		Kind:           agent.ActivityKindArtifact,
		Status:         "completed",
		Title:          "Result file",
		Summary:        "/tmp/result-" + base.ProviderTurnID + ".md",
	}
	if err := sink.HandleAgentEvent(artifact); err != nil {
		return agent.TurnResult{}, err
	}
	return runtime.emitTerminal(sink, base, agent.TurnOutcomeCompleted)
}

func (runtime *serviceTestAgentRuntime) emitTerminal(
	sink agent.EventSink,
	base agent.Event,
	outcome agent.TurnOutcome,
) (agent.TurnResult, error) {
	terminal := base
	terminal.Kind = agent.EventKindTurnTerminal
	terminal.Terminal = &agent.TerminalEvent{Outcome: outcome}
	if err := sink.HandleAgentEvent(terminal); err != nil {
		return agent.TurnResult{}, err
	}
	return agent.TurnResult{
		ProviderThreadID: base.ProviderThreadID,
		ProviderTurnID:   base.ProviderTurnID,
		Outcome:          outcome,
	}, nil
}

func (runtime *serviceTestAgentRuntime) SteerTurn(_ context.Context, request agent.TurnControlRequest) error {
	runtime.signal(request.ProviderTurnID, "steer")
	return nil
}

func (runtime *serviceTestAgentRuntime) InterruptTurn(_ context.Context, request agent.TurnControlRequest) error {
	runtime.signal(request.ProviderTurnID, "interrupt")
	return nil
}

func (runtime *serviceTestAgentRuntime) SubmitApproval(response agent.ApprovalResponse) error {
	runtime.mu.Lock()
	copy := response
	runtime.lastApproval = &copy
	runtime.mu.Unlock()
	providerTurnID := response.RequestID[len("approval-"):]
	runtime.signal(providerTurnID, "approval")
	return nil
}

func (runtime *serviceTestAgentRuntime) UnsubscribeThread(_ context.Context, threadID string) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.unsubscribed = append(runtime.unsubscribed, threadID)
	return nil
}

func (runtime *serviceTestAgentRuntime) signal(providerTurnID string, value string) {
	runtime.mu.Lock()
	control := runtime.controls[providerTurnID]
	runtime.controlLog = append(runtime.controlLog, providerTurnID+":"+value)
	runtime.mu.Unlock()
	control <- value
}

func (runtime *serviceTestAgentRuntime) controlsSent() []string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]string{}, runtime.controlLog...)
}

func (runtime *serviceTestAgentRuntime) durableForkRequests() []agent.ForkThreadRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.ForkThreadRequest{}, runtime.forkRequests...)
}

func (runtime *serviceTestAgentRuntime) sideForkRequests() []agent.ForkThreadRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	requests := make([]agent.ForkThreadRequest, 0)
	for _, request := range runtime.forkRequests {
		if request.Ephemeral {
			requests = append(requests, request)
		}
	}
	return requests
}

func (runtime *serviceTestAgentRuntime) invocationResolutions() []agent.Invocation {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.Invocation{}, runtime.resolveRequests...)
}

func (runtime *serviceTestAgentRuntime) turnRequests() []agent.TurnRequest {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.TurnRequest{}, runtime.runRequests...)
}

func (runtime *serviceTestAgentRuntime) unsubscribedThreads() []string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]string{}, runtime.unsubscribed...)
}

func (runtime *serviceTestAgentRuntime) injectedThreadItems() []serviceTestInjection {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	result := make([]serviceTestInjection, 0, len(runtime.injections))
	for _, injection := range runtime.injections {
		result = append(result, serviceTestInjection{
			threadID: injection.threadID,
			items:    append([]agent.InjectedTextItem{}, injection.items...),
		})
	}
	return result
}

func (runtime *serviceTestAgentRuntime) submittedApproval() *agent.ApprovalResponse {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if runtime.lastApproval == nil {
		return nil
	}
	copy := *runtime.lastApproval
	return &copy
}

func (runtime *serviceTestAgentRuntime) waitForStart(t *testing.T, text string) {
	t.Helper()
	select {
	case got := <-runtime.started:
		if got != text {
			t.Fatalf("started turn text = %q, want %q", got, text)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for turn %q to start", text)
	}
}

func assertServiceSnapshot(
	t *testing.T,
	service *Service,
	workspaceID string,
	conversationID string,
	done func(ConversationSnapshot) bool,
) ConversationSnapshot {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		snapshot, err := service.ReadSnapshot(context.Background(), workspaceID, conversationID)
		if err != nil {
			t.Fatalf("ReadSnapshot: %v", err)
		}
		if done(snapshot) {
			return snapshot
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for snapshot state: %+v", snapshot)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func latestSnapshotTurn(snapshot ConversationSnapshot) ConversationTurn {
	return snapshot.Turns.Turns[len(snapshot.Turns.Turns)-1]
}

func latestPendingApprovalID(snapshot ConversationSnapshot) string {
	for index := len(snapshot.Trajectory.Events) - 1; index >= 0; index-- {
		if approval := snapshot.Trajectory.Events[index].ApprovalRequested; approval != nil {
			return approval.Approval.ID
		}
	}
	return ""
}

func readServiceEvent(t *testing.T, subscription ConversationEventSubscription) ConversationEvent {
	t.Helper()
	select {
	case event := <-subscription.Events():
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for conversation event")
		return ConversationEvent{}
	}
}
