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
	starts    []WorkstreamStartRequest
	sends     []WorkDeliveryRequest
	queues    []WorkDeliveryRequest
	steers    []SteerRunRequest
	cancels   []CancelRunRequest
	approvals []ResolveApprovalRequest
	renames   []RenameWorkstreamRequest
	archives  []ArchiveWorkstreamRequest
	bindings  []BindWorkstreamResourceRequest
	recovers  []RecoverRunRequest
	fail      error
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

func (execution *recordedExecution) CancelRun(_ context.Context, request CancelRunRequest) error {
	execution.cancels = append(execution.cancels, request)
	return execution.fail
}

func (execution *recordedExecution) ResolveApproval(_ context.Context, request ResolveApprovalRequest) error {
	execution.approvals = append(execution.approvals, request)
	return execution.fail
}

func (execution *recordedExecution) RenameWorkstream(_ context.Context, request RenameWorkstreamRequest) error {
	execution.renames = append(execution.renames, request)
	return execution.fail
}

func (execution *recordedExecution) ArchiveWorkstream(_ context.Context, request ArchiveWorkstreamRequest) error {
	execution.archives = append(execution.archives, request)
	return execution.fail
}

func (execution *recordedExecution) BindWorkstreamResource(
	_ context.Context,
	request BindWorkstreamResourceRequest,
) error {
	execution.bindings = append(execution.bindings, request)
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

func routedFor(t *testing.T, registry *Registry, decision DirectorDecision) AuthorizedDecision {
	t.Helper()
	decisionContext, err := registry.DecisionContext(decisionIntentFixture())
	if err != nil {
		t.Fatalf("DecisionContext: %v", err)
	}
	return AuthorizedDecision{
		Intent:   decisionContext.Intent,
		Context:  decisionContext,
		Decision: decision,
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
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:         idle,
			AuthoredInput:        "rewrite the parser",
			WorkspaceRequirement: WorkspaceRequired,
		},
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
		sent.WorkspaceID == nil ||
		*sent.WorkspaceID != workspaceID ||
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
		Kind: DirectorDecisionQueueBehindRun,
		QueueBehindRun: &QueueBehindRunDecision{
			WorkstreamID:         active,
			AuthoredInput:        "then publish it",
			WorkspaceRequirement: WorkspaceRequired,
		},
	})); err != nil {
		t.Fatalf("Execute queue: %v", err)
	}
	if len(execution.queues) != 1 || execution.queues[0].ConversationID != "conversation-active" {
		t.Fatalf("queued %+v", execution.queues)
	}
}

func TestSteeringRejectsARunPromotedAfterTheDecisionContext(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	active := harness.createConversation("conversation-active", "Release notes", &workspaceID)
	harness.startTurn("conversation-active", "turn-active-1")
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)
	routed := routedFor(t, registry, DirectorDecision{
		Kind:     DirectorDecisionSteerRun,
		SteerRun: &SteerRunDecision{WorkstreamID: active, AuthoredInput: "shorter, please"},
	})
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.completeTurn("conversation-active", "turn-active-1")
	awaitWorkstreamStatus(t, subscription, active, WorkstreamStatusCompleted)
	harness.startTurn("conversation-active", "turn-active-2")
	awaitWorkstreamStatus(t, subscription, active, WorkstreamStatusRunning)

	if _, err := executor.Execute(context.Background(), routed); err == nil ||
		!errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("stale steer produced %v, want ErrDirectorIntentRejected", err)
	}
	if len(execution.steers) != 0 {
		t.Fatalf("stale steer reached execution: %+v", execution.steers)
	}
}

// TestCreatingARootWorkstreamHappensInNoWorkstream proves a create decision is
// committed before the workstream it names exists, that the workstream's
// app-scoped identity is derived from the conversation it runs on, and that the
// workstream the request created is the one the user ends up looking at.
func TestCreatingARootWorkstreamHappensInNoWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	harness.createConversation("conversation-idle", "Parser rewrite", nil)
	registry := harness.start()
	execution := &publishingStartExecution{harness: harness}
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
	if started.WorkspaceID == nil ||
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
	if executed.SelectedWorkstreamID == nil || *executed.SelectedWorkstreamID != expected {
		t.Fatalf("the created workstream is not selected: %+v", executed)
	}
	if len(execution.sends) != 1 || execution.sends[0].ConversationID != started.ConversationID {
		t.Fatalf("initial work = %+v", execution.sends)
	}
	registry.Close()

	// The decision reached the durable log before the conversation record the
	// registry derives the new workstream from, which is why it happened in no
	// workstream. The fold has to survive that order across a restart.
	restarted := harness.start()
	decisions := requireDecisionContext(t, restarted).RecentDecisions
	if len(decisions) != 1 ||
		decisions[0].Decision != DirectorDecisionCreateWorkstream ||
		decisions[0].TargetWorkstreamID == nil ||
		*decisions[0].TargetWorkstreamID != expected {
		t.Fatalf("committed decisions = %+v", decisions)
	}
}

// TestWorkNeedingTheUsersFilesOpensADurableResourceRequest proves the folder
// request is driven by what the delivery declared it needs. Work that needs the
// user's own files, on a workstream with none, becomes an actionable durable
// request rather than an error.
func TestWorkNeedingTheUsersFilesOpensADurableResourceRequest(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Run the tests", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:         folderless,
			AuthoredInput:        "run the tests",
			WorkspaceRequirement: WorkspaceRequired,
		},
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
	if !strings.Contains(executed.Summary, "folder") {
		t.Fatalf("resource request summary = %q", executed.Summary)
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

// TestWorkNeedingNoFilesRunsWithoutAFolder proves an optional delivery is not
// held up by a workstream having no folder. The work reaches the execution port
// naming no workspace, and the user is asked for nothing.
func TestWorkNeedingNoFilesRunsWithoutAFolder(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Draft the brief", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:         folderless,
			AuthoredInput:        "draft five artifacts about the plan",
			WorkspaceRequirement: WorkspaceOptional,
		},
	}))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if executed.ResourceRequestID != nil {
		t.Fatalf("artifact work asked the user for a folder: %+v", executed)
	}
	if len(execution.sends) != 1 {
		t.Fatalf("execution sends = %+v", execution.sends)
	}
	if execution.sends[0].WorkspaceID != nil {
		t.Fatalf("unbound delivery named a workspace: %+v", execution.sends[0])
	}
	if execution.sends[0].Text != "draft five artifacts about the plan" {
		t.Fatalf("sent work = %+v", execution.sends[0])
	}
	registry.Close()

	restarted := harness.start()
	snapshot, err := restarted.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.UnresolvedResourceRequests) != 0 || snapshot.Aggregates.AwaitingResourceCount != 0 {
		t.Fatalf("unbound artifact work left the user a request: %+v", snapshot.UnresolvedResourceRequests)
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

func TestExecutionRejectsAuthorizedDecisionDriftBeforeEffects(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	workstreamID := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)
	base := routedFor(t, registry, DirectorDecision{
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:         workstreamID,
			AuthoredInput:        "rewrite the parser",
			WorkspaceRequirement: WorkspaceRequired,
		},
	})

	mismatched := base
	mismatched.Intent.Text = "different request"
	unauthorized := base
	unauthorized.Decision = DirectorDecision{
		Kind: DirectorDecisionSteerRun,
		SteerRun: &SteerRunDecision{
			WorkstreamID:  workstreamID,
			AuthoredInput: "change course",
		},
	}
	malformed := base
	malformed.Decision = DirectorDecision{Kind: DirectorDecisionCreateWorkstream}

	for name, routed := range map[string]AuthorizedDecision{
		"context mismatch":          mismatched,
		"unauthorized target state": unauthorized,
		"malformed decision":        malformed,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := executor.Execute(context.Background(), routed); err == nil {
				t.Fatal("invalid authorized contract was executed")
			}
		})
	}
	if len(execution.sends)+len(execution.queues)+len(execution.steers)+len(execution.starts) != 0 {
		t.Fatalf("invalid authorized contracts reached execution: %+v", execution)
	}
}

func TestExecutionRejectsCommandsAfterRegistryStops(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	workstreamID := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)
	routed := routedFor(t, registry, DirectorDecision{
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:         workstreamID,
			AuthoredInput:        "rewrite the parser",
			WorkspaceRequirement: WorkspaceRequired,
		},
	})
	if err := registry.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if _, err := registry.DecisionContext(decisionIntentFixture()); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("DecisionContext after close error = %v", err)
	}
	if _, err := registry.ExecutionTarget(workstreamID); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("ExecutionTarget after close error = %v", err)
	}
	if _, err := registry.SelectWorkstream(context.Background(), workstreamID); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("SelectWorkstream after close error = %v", err)
	}
	if _, err := registry.OfferedFolderResource(workspaceID); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("OfferedFolderResource after close error = %v", err)
	}
	if _, err := executor.Execute(context.Background(), routed); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Execute after close error = %v", err)
	}
	if len(execution.sends) != 0 {
		t.Fatalf("stopped registry reached execution: %+v", execution.sends)
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
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:         idle,
			AuthoredInput:        "rewrite the parser",
			WorkspaceRequirement: WorkspaceRequired,
		},
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
