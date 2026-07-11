package conversation

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/workspace"
)

func TestConversationServiceRunsIndependentConversationsAndPromotesQueuedTurns(t *testing.T) {
	service, runtime := newConversationServiceTestFixture(t)
	ctx := context.Background()
	first := createServiceTestConversation(t, service, "First topic")
	second := createServiceTestConversation(t, service, "Second topic")

	firstRunning, err := service.Send(ctx, SendConversationInputRequest{WorkspaceID: "workspace_test", ConversationID: first.Conversation.ID, Input: AuthoredInput{Text: "hold first"}})
	if err != nil || firstRunning.Conversation.Status != ConversationStatusWorking {
		t.Fatalf("send first = %+v, %v", firstRunning, err)
	}
	secondRunning, err := service.Send(ctx, SendConversationInputRequest{WorkspaceID: "workspace_test", ConversationID: second.Conversation.ID, Input: AuthoredInput{Text: "hold second"}})
	if err != nil || secondRunning.Conversation.Status != ConversationStatusWorking {
		t.Fatalf("send second = %+v, %v", secondRunning, err)
	}
	runtime.waitStarted(t, first.Conversation.ID)
	runtime.waitStarted(t, second.Conversation.ID)

	queued, err := service.Send(ctx, SendConversationInputRequest{WorkspaceID: "workspace_test", ConversationID: first.Conversation.ID, Input: AuthoredInput{Text: "queued follow-up"}})
	if err != nil {
		t.Fatalf("queue follow-up: %v", err)
	}
	if len(queued.Queue) != 1 || queued.Queue[0].Ordinal != 1 {
		t.Fatalf("queued turns = %+v, want one contiguous item", queued.Queue)
	}
	if runtime.maxActiveCount() != 2 {
		t.Fatalf("max concurrent provider turns = %d, want 2", runtime.maxActiveCount())
	}

	runtime.release(first.Conversation.ID)
	runtime.release(second.Conversation.ID)
	runtime.waitCompleted(t, first.Conversation.ID)
	runtime.waitCompleted(t, second.Conversation.ID)
	runtime.waitStarted(t, first.Conversation.ID)
	runtime.waitCompleted(t, first.Conversation.ID)

	final, err := service.ReadSnapshot(ctx, "workspace_test", first.Conversation.ID)
	if err != nil {
		t.Fatalf("ReadSnapshot final: %v", err)
	}
	if final.Conversation.Status != ConversationStatusIdle || len(final.Queue) != 0 {
		t.Fatalf("final conversation = %+v queue=%+v", final.Conversation, final.Queue)
	}
	if len(final.Turns.Turns) != 2 || final.Turns.Turns[0].Status != TurnStatusCompleted || final.Turns.Turns[1].Status != TurnStatusCompleted {
		t.Fatalf("final turns = %+v", final.Turns.Turns)
	}
	if final.Conversation.LastTrajectorySequence < 10 {
		t.Fatalf("trajectory sequence = %d, want complete streamed lifecycle", final.Conversation.LastTrajectorySequence)
	}
}

func TestConversationServiceSteeringApprovalAndInterruptionStayConversationScoped(t *testing.T) {
	service, runtime := newConversationServiceTestFixture(t)
	ctx := context.Background()
	snapshot := createServiceTestConversation(t, service, "Approval topic")
	conversationID := snapshot.Conversation.ID
	_, err := service.Send(ctx, SendConversationInputRequest{WorkspaceID: "workspace_test", ConversationID: conversationID, Input: AuthoredInput{Text: "approval hold"}})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	runtime.waitStarted(t, conversationID)
	runtime.waitApproval(t, conversationID)

	steered, err := service.Steer(ctx, SteerConversationRequest{WorkspaceID: "workspace_test", ConversationID: conversationID, Input: AuthoredInput{Text: "use the safer path"}})
	if err != nil || steered.Conversation.Status != ConversationStatusWorking {
		t.Fatalf("Steer = %+v, %v", steered, err)
	}
	approved, err := service.SubmitApproval(ctx, SubmitConversationApprovalRequest{
		WorkspaceID: "workspace_test", ConversationID: conversationID,
		ApprovalID: "approval_test", Decision: ApprovalSubmissionAccept, Answers: []ApprovalSubmissionAnswer{},
	})
	if err != nil || approved.Conversation.Status != ConversationStatusWorking {
		t.Fatalf("SubmitApproval = %+v, %v", approved, err)
	}
	runtime.waitCompleted(t, conversationID)

	_, err = service.Send(ctx, SendConversationInputRequest{WorkspaceID: "workspace_test", ConversationID: conversationID, Input: AuthoredInput{Text: "hold interrupt"}})
	if err != nil {
		t.Fatalf("Send interruptible: %v", err)
	}
	runtime.waitStarted(t, conversationID)
	if _, err := service.Stop(ctx, StopConversationRequest{WorkspaceID: "workspace_test", ConversationID: conversationID}); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	runtime.waitCompleted(t, conversationID)
	final, err := service.ReadSnapshot(ctx, "workspace_test", conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	last := final.Turns.Turns[len(final.Turns.Turns)-1]
	if last.Status != TurnStatusCancelled || final.Conversation.Status != ConversationStatusIdle {
		t.Fatalf("interrupted final state = turn %s conversation %s", last.Status, final.Conversation.Status)
	}
	if got := runtime.steering(conversationID); got != "use the safer path" {
		t.Fatalf("steering = %q", got)
	}
}

func createServiceTestConversation(t *testing.T, service *Service, title string) ConversationSnapshot {
	t.Helper()
	snapshot, err := service.Create(context.Background(), CreateConversationRequest{WorkspaceID: "workspace_test", Title: title})
	if err != nil {
		t.Fatalf("Create %s: %v", title, err)
	}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("created snapshot: %v", err)
	}
	return snapshot
}

func newConversationServiceTestFixture(t *testing.T) (*Service, *serviceTestAgentRuntime) {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	runtime := newServiceTestAgentRuntime()
	ids := map[string]int{}
	service, err := NewService(ServiceConfig{
		Store: store, Agent: runtime,
		WorkspaceResolver: serviceTestWorkspaceResolver{root: t.TempDir()},
		NewID: func(prefix string) (string, error) {
			ids[prefix]++
			return fmt.Sprintf("%s_test_%d", prefix, ids[prefix]), nil
		},
	})
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return service, runtime
}

type serviceTestWorkspaceResolver struct{ root string }

func (resolver serviceTestWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != "workspace_test" {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace not found: %s", id)
	}
	return workspace.WorkspaceSummary{ID: id, RootPath: resolver.root, DisplayName: "Test"}, nil
}

type serviceTestAgentRuntime struct {
	mu                sync.Mutex
	nextThread        int
	active            int
	maxActive         int
	started           map[string]chan struct{}
	completed         map[string]chan struct{}
	releases          map[string]chan struct{}
	approvals         map[string]chan struct{}
	approvalResponses map[string]chan struct{}
	steered           map[string]string
	interrupted       map[string]bool
	registryChanged   chan struct{}
	injected          []agent.InjectedTextItem
	unsubscribed      []string
}

func newServiceTestAgentRuntime() *serviceTestAgentRuntime {
	return &serviceTestAgentRuntime{
		started: map[string]chan struct{}{}, completed: map[string]chan struct{}{},
		releases: map[string]chan struct{}{}, approvals: map[string]chan struct{}{},
		approvalResponses: map[string]chan struct{}{}, steered: map[string]string{}, interrupted: map[string]bool{},
		registryChanged: make(chan struct{}),
	}
}

func (runtime *serviceTestAgentRuntime) ResolveInvocation(_ context.Context, invocation agent.Invocation) (agent.ResolvedInvocation, error) {
	return agent.ResolvedInvocation{Requested: invocation, Model: invocation.Model, ReasoningEffort: invocation.ReasoningEffort, ServiceTier: invocation.ServiceTier, PermissionMode: invocation.PermissionMode, ApprovalMode: invocation.ApprovalMode}, nil
}

func (runtime *serviceTestAgentRuntime) ListModels(context.Context, *string, int, bool) (agent.ModelPage, error) {
	return agent.ModelPage{Data: []agent.Model{}}, nil
}

func (runtime *serviceTestAgentRuntime) StartThread(_ context.Context, _ agent.StartThreadRequest) (agent.Thread, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.nextThread++
	id := fmt.Sprintf("provider_thread_%d", runtime.nextThread)
	return agent.Thread{ID: id, SessionID: "session_" + id}, nil
}

func (runtime *serviceTestAgentRuntime) ForkThread(_ context.Context, request agent.ForkThreadRequest) (agent.Thread, error) {
	runtime.mu.Lock()
	runtime.nextThread++
	threadID := fmt.Sprintf("provider_thread_%d", runtime.nextThread)
	runtime.mu.Unlock()
	parent := request.ParentThreadID
	return agent.Thread{
		ID: threadID, SessionID: "provider_session_" + threadID,
		CWD: request.WorkspaceRoot, Model: DefaultAgentModelID,
		ModelProvider: "openai", Status: "idle", Ephemeral: request.Ephemeral,
		ForkedFromID: &parent, ParentThreadID: &parent,
	}, nil
}

func (runtime *serviceTestAgentRuntime) InjectItems(_ context.Context, _ string, items []agent.InjectedTextItem) error {
	runtime.mu.Lock()
	runtime.injected = append(runtime.injected, items...)
	runtime.mu.Unlock()
	return nil
}

func (runtime *serviceTestAgentRuntime) UnsubscribeThread(_ context.Context, threadID string) error {
	runtime.mu.Lock()
	runtime.unsubscribed = append(runtime.unsubscribed, threadID)
	runtime.mu.Unlock()
	return nil
}

func (runtime *serviceTestAgentRuntime) RunTurn(_ context.Context, request agent.TurnRequest, sink agent.EventSink) (agent.TurnResult, error) {
	providerTurnID := "provider_" + request.TurnID
	runtime.begin(request.ConversationID)
	defer runtime.end(request.ConversationID)
	if err := sink.HandleAgentEvent(agent.Event{Kind: agent.EventKindTurnStarted, ConversationID: request.ConversationID, TurnID: request.TurnID, ProviderThreadID: request.ProviderThreadID, ProviderTurnID: providerTurnID}); err != nil {
		return agent.TurnResult{}, err
	}
	runtime.signalStarted(request.ConversationID)
	if request.Text == "approval hold" {
		if err := runtime.emitApproval(request, providerTurnID, sink); err != nil {
			return agent.TurnResult{}, err
		}
		runtime.waitForApproval(request.ConversationID)
	}
	if strings.HasPrefix(request.Text, "hold") {
		runtime.waitForRelease(request.ConversationID)
	}
	outcome := agent.TurnOutcomeCompleted
	if runtime.wasInterrupted(request.ConversationID) {
		outcome = agent.TurnOutcomeInterrupted
	}
	if outcome == agent.TurnOutcomeCompleted {
		textEvent := agent.Event{Kind: agent.EventKindAgentTextCompleted, ConversationID: request.ConversationID, TurnID: request.TurnID, ProviderThreadID: request.ProviderThreadID, ProviderTurnID: providerTurnID, Text: &agent.TextEvent{ProviderItemID: "message_" + request.TurnID, Text: "Completed " + request.Text}}
		if err := sink.HandleAgentEvent(textEvent); err != nil {
			return agent.TurnResult{}, err
		}
	}
	terminal := agent.Event{Kind: agent.EventKindTurnTerminal, ConversationID: request.ConversationID, TurnID: request.TurnID, ProviderThreadID: request.ProviderThreadID, ProviderTurnID: providerTurnID, Terminal: &agent.TerminalEvent{Outcome: outcome}}
	if err := sink.HandleAgentEvent(terminal); err != nil {
		return agent.TurnResult{}, err
	}
	return agent.TurnResult{ProviderThreadID: request.ProviderThreadID, ProviderTurnID: providerTurnID, Outcome: outcome}, nil
}

func (runtime *serviceTestAgentRuntime) ObserveTurn(context.Context, agent.ObserveTurnRequest, agent.EventSink) (agent.TurnResult, error) {
	return agent.TurnResult{}, fmt.Errorf("unexpected ObserveTurn")
}

func (runtime *serviceTestAgentRuntime) ReconcileTurn(context.Context, string, string) (agent.TurnResult, bool, error) {
	return agent.TurnResult{}, false, fmt.Errorf("unexpected ReconcileTurn")
}

func (runtime *serviceTestAgentRuntime) SteerTurn(_ context.Context, request agent.TurnControlRequest) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.steered[request.ConversationID] = request.Text
	return nil
}

func (runtime *serviceTestAgentRuntime) InterruptTurn(_ context.Context, request agent.TurnControlRequest) error {
	runtime.mu.Lock()
	runtime.interrupted[request.ConversationID] = true
	channel := runtime.releases[request.ConversationID]
	runtime.mu.Unlock()
	closeSignal(channel)
	return nil
}

func (runtime *serviceTestAgentRuntime) SubmitApproval(response agent.ApprovalResponse) error {
	runtime.mu.Lock()
	channel := runtime.approvalResponses["conversation_test_1"]
	if channel == nil {
		for _, candidate := range runtime.approvalResponses {
			channel = candidate
			break
		}
	}
	runtime.mu.Unlock()
	closeSignal(channel)
	return nil
}

func (runtime *serviceTestAgentRuntime) emitApproval(request agent.TurnRequest, providerTurnID string, sink agent.EventSink) error {
	runtime.mu.Lock()
	approvalSignal := make(chan struct{})
	responseSignal := make(chan struct{})
	runtime.approvals[request.ConversationID] = approvalSignal
	runtime.approvalResponses[request.ConversationID] = responseSignal
	runtime.notifyRegistryChangedLocked()
	runtime.mu.Unlock()
	event := agent.Event{
		Kind: agent.EventKindApprovalRequested, ConversationID: request.ConversationID,
		TurnID: request.TurnID, ProviderThreadID: request.ProviderThreadID, ProviderTurnID: providerTurnID,
		Approval: &agent.ApprovalRequest{
			ID: "approval_test", ProviderItemID: "command_test", Kind: agent.ApprovalKindCommand,
			Title: "Approve command", Body: "Run the test command", Command: "true", Path: "/tmp",
		},
	}
	if err := sink.HandleAgentEvent(event); err != nil {
		return err
	}
	close(approvalSignal)
	return nil
}

func (runtime *serviceTestAgentRuntime) begin(conversationID string) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.active++
	if runtime.active > runtime.maxActive {
		runtime.maxActive = runtime.active
	}
	if runtime.started[conversationID] == nil {
		runtime.started[conversationID] = make(chan struct{}, 4)
	}
	if runtime.completed[conversationID] == nil {
		runtime.completed[conversationID] = make(chan struct{}, 4)
	}
	runtime.releases[conversationID] = make(chan struct{})
	runtime.notifyRegistryChangedLocked()
}

func (runtime *serviceTestAgentRuntime) end(conversationID string) {
	runtime.mu.Lock()
	runtime.active--
	completed := runtime.completed[conversationID]
	runtime.mu.Unlock()
	completed <- struct{}{}
}

func (runtime *serviceTestAgentRuntime) signalStarted(conversationID string) {
	runtime.mu.Lock()
	channel := runtime.started[conversationID]
	runtime.mu.Unlock()
	channel <- struct{}{}
}

func (runtime *serviceTestAgentRuntime) waitForRelease(conversationID string) {
	runtime.mu.Lock()
	channel := runtime.releases[conversationID]
	runtime.mu.Unlock()
	<-channel
}

func (runtime *serviceTestAgentRuntime) waitForApproval(conversationID string) {
	runtime.mu.Lock()
	channel := runtime.approvalResponses[conversationID]
	runtime.mu.Unlock()
	<-channel
}

func (runtime *serviceTestAgentRuntime) release(conversationID string) {
	runtime.mu.Lock()
	channel := runtime.releases[conversationID]
	runtime.mu.Unlock()
	closeSignal(channel)
}

func closeSignal(channel chan struct{}) {
	if channel == nil {
		return
	}
	select {
	case <-channel:
	default:
		close(channel)
	}
}

func (runtime *serviceTestAgentRuntime) waitStarted(t *testing.T, conversationID string) {
	t.Helper()
	channel := runtime.registeredSignal(t, conversationID, runtime.started, "provider turn start")
	waitTestSignal(t, channel, "provider turn start")
}

func (runtime *serviceTestAgentRuntime) waitCompleted(t *testing.T, conversationID string) {
	t.Helper()
	channel := runtime.registeredSignal(t, conversationID, runtime.completed, "provider turn completion")
	waitTestSignal(t, channel, "provider turn completion")
}

func (runtime *serviceTestAgentRuntime) waitApproval(t *testing.T, conversationID string) {
	t.Helper()
	channel := runtime.registeredSignal(t, conversationID, runtime.approvals, "provider approval")
	waitTestSignal(t, channel, "provider approval")
}

func (runtime *serviceTestAgentRuntime) registeredSignal(t *testing.T, conversationID string, signals map[string]chan struct{}, description string) <-chan struct{} {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for {
		runtime.mu.Lock()
		channel := signals[conversationID]
		changed := runtime.registryChanged
		runtime.mu.Unlock()
		if channel != nil {
			return channel
		}
		select {
		case <-changed:
		case <-deadline.C:
			t.Fatalf("timed out waiting for %s registration", description)
		}
	}
}

func (runtime *serviceTestAgentRuntime) notifyRegistryChangedLocked() {
	close(runtime.registryChanged)
	runtime.registryChanged = make(chan struct{})
}

func waitTestSignal(t *testing.T, channel <-chan struct{}, description string) {
	t.Helper()
	if channel == nil {
		t.Fatalf("%s channel is unavailable", description)
	}
	select {
	case <-channel:
	case <-time.After(3 * time.Second):
		t.Fatalf("timed out waiting for %s", description)
	}
}

func (runtime *serviceTestAgentRuntime) maxActiveCount() int {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.maxActive
}

func (runtime *serviceTestAgentRuntime) wasInterrupted(conversationID string) bool {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.interrupted[conversationID]
}

func (runtime *serviceTestAgentRuntime) steering(conversationID string) string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return runtime.steered[conversationID]
}

func (runtime *serviceTestAgentRuntime) injectedItems() []agent.InjectedTextItem {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]agent.InjectedTextItem{}, runtime.injected...)
}

func (runtime *serviceTestAgentRuntime) wasUnsubscribed(threadID string) bool {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	for _, candidate := range runtime.unsubscribed {
		if candidate == threadID {
			return true
		}
	}
	return false
}
