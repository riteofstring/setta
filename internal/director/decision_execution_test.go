package director

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// recordedExecution is a Director execution port that records what it was asked
// to do. It is the boundary's own contract suite: every adapter is handed the
// same requests, so a managed runtime has to accept exactly these.
type recordedExecution struct {
	starts   []WorkstreamStartRequest
	sends    []WorkDeliveryRequest
	queues   []WorkDeliveryRequest
	steers   []SteerRunRequest
	recovers []RecoverRunRequest
	fail     error
}

func (execution *recordedExecution) StartWorkstream(_ context.Context, request WorkstreamStartRequest) error {
	execution.starts = append(execution.starts, request)
	return execution.fail
}

func (execution *recordedExecution) SendWork(_ context.Context, request WorkDeliveryRequest) error {
	execution.sends = append(execution.sends, request)
	return execution.fail
}

func (execution *recordedExecution) QueueWork(_ context.Context, request WorkDeliveryRequest) error {
	execution.queues = append(execution.queues, request)
	return execution.fail
}

func (execution *recordedExecution) SteerRun(_ context.Context, request SteerRunRequest) error {
	execution.steers = append(execution.steers, request)
	return execution.fail
}

func (execution *recordedExecution) RecoverRun(_ context.Context, request RecoverRunRequest) error {
	execution.recovers = append(execution.recovers, request)
	return execution.fail
}

func newExecutorForTest(
	t *testing.T,
	harness *registryHarness,
	registry *Registry,
	execution WorkstreamExecution,
) *DecisionExecutor {
	t.Helper()
	executor, err := NewDecisionExecutor(
		registry,
		execution,
		WithExecutorClock(harness.clock),
		WithExecutorIdentity(harness.identity),
	)
	if err != nil {
		t.Fatalf("NewDecisionExecutor: %v", err)
	}
	return executor
}

func routedFor(t *testing.T, registry *Registry, decision DirectorDecision) RoutedIntent {
	t.Helper()
	decisionContext, err := registry.DecisionContext(decisionIntentFixture())
	if err != nil {
		t.Fatalf("DecisionContext: %v", err)
	}
	return RoutedIntent{
		Intent:     decisionContext.Intent,
		Context:    decisionContext,
		Resolution: DecisionResolvedByModel,
		Decision:   &decision,
	}
}

// TestSendingWorkAddressesTheDurableSubstrate proves the execution port is
// handed the conversation, folder, and run the app minted, and that the durable
// decision naming that workstream is committed with it.
func TestSendingWorkAddressesTheDurableSubstrate(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	idle := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:             DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{WorkstreamID: idle, AuthoredInput: "rewrite the parser"},
	}))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if executed.WorkstreamID == nil || *executed.WorkstreamID != idle {
		t.Fatalf("executed workstream = %v, want %s", executed.WorkstreamID, idle)
	}
	if len(execution.sends) != 1 {
		t.Fatalf("execution sends = %+v", execution.sends)
	}
	sent := execution.sends[0]
	if sent.ConversationID != "conversation-idle" ||
		sent.WorkspaceID != workspaceID ||
		sent.Text != "rewrite the parser" ||
		sent.RunID == "" {
		t.Fatalf("sent work = %+v", sent)
	}
	registry.Close()

	restarted := harness.start()
	decisions := requireDecisionContext(t, restarted).RecentDecisions
	if len(decisions) != 1 ||
		decisions[0].Decision != DirectorDecisionSendToWorkstream ||
		decisions[0].TargetWorkstreamID == nil ||
		*decisions[0].TargetWorkstreamID != idle {
		t.Fatalf("committed decisions = %+v", decisions)
	}
}

// TestSteeringNamesTheActiveRunTheAppKnowsAbout proves the run being steered is
// trusted state rather than something the decision claimed.
func TestSteeringNamesTheActiveRunTheAppKnowsAbout(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	active := harness.createConversation("conversation-active", "Release notes", &workspaceID)
	harness.startTurn("conversation-active", "turn-active-1")
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	if _, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:     DirectorDecisionSteerRun,
		SteerRun: &SteerRunDecision{WorkstreamID: active, AuthoredInput: "shorter, please"},
	})); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if len(execution.steers) != 1 || execution.steers[0].TargetRunID != "turn-active-1" {
		t.Fatalf("steered %+v", execution.steers)
	}
	if execution.steers[0].DecisionID == "" {
		t.Fatal("steering does not name the decision that changed the run")
	}

	if _, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:           DirectorDecisionQueueBehindRun,
		QueueBehindRun: &QueueBehindRunDecision{WorkstreamID: active, AuthoredInput: "then publish it"},
	})); err != nil {
		t.Fatalf("Execute queue: %v", err)
	}
	if len(execution.queues) != 1 || execution.queues[0].ConversationID != "conversation-active" {
		t.Fatalf("queued %+v", execution.queues)
	}
}

// TestCreatingARootWorkstreamHappensInNoWorkstream proves a create decision is
// committed before the workstream it names exists, and that the workstream's
// app-scoped identity is derived from the conversation it runs on.
func TestCreatingARootWorkstreamHappensInNoWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	harness.createConversation("conversation-idle", "Parser rewrite", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, createRootDecisionFixture(
		DecisionResourceScope{
			Kind:   WorkstreamResourceScopeFolder,
			Folder: &DecisionFolderResource{WorkspaceID: registryTestWorkspaceID},
		},
	)))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if len(execution.starts) != 1 {
		t.Fatalf("execution starts = %+v", execution.starts)
	}
	started := execution.starts[0]
	if started.Origin.Kind != WorkstreamCreationRoot ||
		started.Origin.ParentConversationID != "" ||
		started.WorkspaceID == nil ||
		*started.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("started workstream = %+v", started)
	}
	expected, err := WorkstreamIDForConversation(started.ConversationID)
	if err != nil {
		t.Fatalf("WorkstreamIDForConversation: %v", err)
	}
	if executed.WorkstreamID == nil || *executed.WorkstreamID != expected {
		t.Fatalf("executed workstream = %v, want %s", executed.WorkstreamID, expected)
	}
	if len(execution.sends) != 1 || execution.sends[0].ConversationID != started.ConversationID {
		t.Fatalf("initial work = %+v", execution.sends)
	}
	registry.Close()

	// The decision reached the durable log before the conversation record the
	// registry derives the new workstream from, which is why it happened in no
	// workstream. Committing that record now is what the execution port does,
	// and the fold has to survive the order.
	harness.createConversation(started.ConversationID, "Migration draft", &workspaceID)
	restarted := harness.start()
	decisions := requireDecisionContext(t, restarted).RecentDecisions
	if len(decisions) != 1 ||
		decisions[0].Decision != DirectorDecisionCreateWorkstream ||
		decisions[0].TargetWorkstreamID == nil ||
		*decisions[0].TargetWorkstreamID != expected {
		t.Fatalf("committed decisions = %+v", decisions)
	}
}

// TestFolderlessWorkOpensADurableResourceRequest proves a folderless workstream
// is not an execution failure. It exists, it is selectable, and what it lacks
// becomes an actionable durable request rather than an error.
func TestFolderlessWorkOpensADurableResourceRequest(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Run the tests", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:             DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{WorkstreamID: folderless, AuthoredInput: "run the tests"},
	}))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if len(execution.sends) != 0 {
		t.Fatalf("folderless work reached the execution port: %+v", execution.sends)
	}
	if executed.ResourceRequestID == nil {
		t.Fatal("folderless work opened no resource request")
	}
	if !strings.Contains(executed.PublicText, "folder") {
		t.Fatalf("resource request summary = %q", executed.PublicText)
	}
	registry.Close()

	restarted := harness.start()
	snapshot, err := restarted.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.UnresolvedResourceRequests) != 1 ||
		snapshot.UnresolvedResourceRequests[0].ID != *executed.ResourceRequestID ||
		snapshot.UnresolvedResourceRequests[0].Status != ResourceRequestStatusRequested {
		t.Fatalf("durable resource requests = %+v", snapshot.UnresolvedResourceRequests)
	}
	if snapshot.Aggregates.AwaitingResourceCount != 1 {
		t.Fatalf("aggregates = %+v", snapshot.Aggregates)
	}
}

// TestRecoveringRestartsTheWorkThatFailed proves recovery acts on the run a
// durable failure interrupted rather than on text the decision supplied, and
// that the durable recovery fact retires the failure it addressed.
func TestRecoveringRestartsTheWorkThatFailed(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	failed := harness.createConversation("conversation-failed", "Data import", &workspaceID)
	harness.startTurn("conversation-failed", "turn-failed-1")
	failure := harness.failTurn("conversation-failed", "turn-failed-1", "the run ended before it finished importing")
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	if _, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:        DirectorDecisionRecoverPath,
		RecoverPath: &RecoverPathDecision{WorkstreamID: failed, FailureEventID: failure.ID},
	})); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if len(execution.recovers) != 1 || execution.recovers[0].FailedRunID != "turn-failed-1" {
		t.Fatalf("recovered %+v", execution.recovers)
	}
	registry.Close()

	restarted := harness.start()
	target := requireDecisionTarget(t, requireDecisionContext(t, restarted), failed)
	if len(target.RecoverableFailures) != 0 {
		t.Fatalf("a recovered failure is still offered: %+v", target.RecoverableFailures)
	}
}

// TestRepliesAreDurableWithoutAWorkstream proves the Director's own dialogue is
// committed: the answer is what the user was told, and the question is what
// their next request is answering after a restart.
func TestRepliesAreDurableWithoutAWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	first := harness.createConversation("conversation-first", "Parser rewrite", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	answered, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:           DirectorDecisionAnswerDirectly,
		AnswerDirectly: &AnswerDirectlyDecision{Text: "One workstream is idle and nothing is blocked."},
	}))
	if err != nil {
		t.Fatalf("Execute answer: %v", err)
	}
	if answered.WorkstreamID != nil {
		t.Fatalf("an answer happened in workstream %v", answered.WorkstreamID)
	}
	if answered.PublicText != "One workstream is idle and nothing is blocked." {
		t.Fatalf("answer text = %q", answered.PublicText)
	}
	if _, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind: DirectorDecisionAskClarification,
		AskClarification: &AskClarificationDecision{
			Question: "Should I steer the running work or queue this after it?",
		},
	})); err != nil {
		t.Fatalf("Execute clarification: %v", err)
	}
	if len(execution.sends)+len(execution.starts)+len(execution.steers) != 0 {
		t.Fatal("a reply reached the execution port")
	}
	registry.Close()

	restarted := harness.start()
	resumed := requireDecisionContext(t, restarted)
	if resumed.Clarification == nil ||
		!strings.Contains(resumed.Clarification.Question, "steer the running work") {
		t.Fatalf("pending clarification = %+v", resumed.Clarification)
	}
	if len(resumed.Clarification.CandidateWorkstreamIDs) != 1 ||
		resumed.Clarification.CandidateWorkstreamIDs[0] != first {
		t.Fatalf("clarification candidates = %v", resumed.Clarification.CandidateWorkstreamIDs)
	}
	if len(resumed.RecentDecisions) != 2 {
		t.Fatalf("recent decisions = %+v", resumed.RecentDecisions)
	}
}

// TestBlockedRoutingCommitsNoDecision proves a request the app could not route
// produces a public sentence and no durable claim that it decided anything.
func TestBlockedRoutingCommitsNoDecision(t *testing.T) {
	harness := newRegistryHarness(t)
	harness.createConversation("conversation-idle", "Parser rewrite", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	executed, err := executor.Execute(context.Background(), RoutedIntent{
		Intent:        decisionIntentFixture(),
		Resolution:    DecisionResolvedAsBlocked,
		PublicSummary: "This request could not be routed to any workstream.",
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if executed.Decision != nil || executed.PublicText == "" {
		t.Fatalf("blocked receipt = %+v", executed)
	}
	registry.Close()

	restarted := harness.start()
	if decisions := requireDecisionContext(t, restarted).RecentDecisions; len(decisions) != 0 {
		t.Fatalf("blocked routing committed decisions %+v", decisions)
	}
}

// TestExecutionFailuresSurfaceRatherThanBecomeProductState proves only a
// missing resource becomes a durable request. Anything else is a runtime
// condition the caller decides about.
func TestExecutionFailuresSurfaceRatherThanBecomeProductState(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	idle := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{fail: errors.New("provider is unreachable")}
	executor := newExecutorForTest(t, harness, registry, execution)

	_, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:             DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{WorkstreamID: idle, AuthoredInput: "rewrite the parser"},
	}))
	if err == nil || !strings.Contains(err.Error(), "provider is unreachable") {
		t.Fatalf("execution failure = %v", err)
	}
	registry.Close()

	restarted := harness.start()
	snapshot, err := restarted.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.UnresolvedResourceRequests) != 0 {
		t.Fatalf("an unreachable provider became a resource request: %+v", snapshot.UnresolvedResourceRequests)
	}
}
