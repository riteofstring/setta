package director

import (
	"context"
	"errors"
	"testing"

	"setta/internal/conversation"
)

// The three direct commands are written the way the shell issues them: dispatch
// what the user pointed at, then read what reached the execution port and what
// the pushed stream says. Nothing here routes through the Director, because none
// of these three is a request the app has to interpret.

func cancelRun(workstreamID string, runID string) DirectorIntent {
	return DirectorIntent{
		Kind:      DirectorIntentCancelRun,
		CancelRun: &DirectorCancelRunIntent{WorkstreamID: workstreamID, RunID: runID},
	}
}

func resolveApproval(
	approvalID string,
	decision conversation.TrajectoryApprovalDecision,
	answers []conversation.ConversationApprovalAnswer,
) DirectorIntent {
	return DirectorIntent{
		Kind: DirectorIntentResolveApproval,
		ResolveApproval: &DirectorResolveApprovalIntent{
			ApprovalID: approvalID,
			Decision:   decision,
			Answers:    answers,
		},
	}
}

func resolveResourceRequest(requestID string, workspaceID string) DirectorIntent {
	return DirectorIntent{
		Kind: DirectorIntentResolveResourceRequest,
		ResolveResourceRequest: &DirectorResolveResourceRequestIntent{
			RequestID:   requestID,
			WorkspaceID: workspaceID,
		},
	}
}

// TestCancelStopsTheRunTheUserSaw proves a cancel addresses the run it names.
// The port receives the durable substrate that run executes on, and a cancel
// naming a run the workstream has moved past is rejected rather than redirected
// onto whatever is active by then — that successor is work the user never chose
// to stop.
func TestCancelStopsTheRunTheUserSaw(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	running := harness.createConversation("conversation-running", "Data import", &workspaceID)
	harness.startTurn("conversation-running", "turn-running-1")
	registry := harness.start()
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)

	receipt := dispatch(t, center, cancelRun(running, "turn-running-1"))
	if receipt.Kind != DirectorIntentCancelRun ||
		receipt.Submit != nil ||
		receipt.SelectedWorkstreamID != nil {
		t.Fatalf("receipt = %+v", receipt)
	}
	if len(execution.cancels) != 1 {
		t.Fatalf("execution cancels = %+v", execution.cancels)
	}
	cancelled := execution.cancels[0]
	if cancelled.ConversationID != "conversation-running" ||
		cancelled.WorkspaceID != workspaceID ||
		cancelled.RunID != "turn-running-1" {
		t.Fatalf("cancelled run = %+v", cancelled)
	}

	_, err := center.Dispatch(context.Background(), cancelRun(running, "turn-running-2"))
	if !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("cancelling a run the workstream is not carrying returned %v", err)
	}
	if len(execution.cancels) != 1 {
		t.Fatalf("a rejected cancel reached the execution port: %+v", execution.cancels)
	}
}

// TestCancelRejectsAWorkstreamWithNoRun proves an idle workstream is not
// cancellable. There is no run to stop, so the request is the caller's mistake
// rather than something the app repairs by stopping something else.
func TestCancelRejectsAWorkstreamWithNoRun(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	idle := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)

	if _, err := center.Dispatch(context.Background(), cancelRun(idle, "turn-idle-1")); !errors.Is(
		err,
		ErrDirectorIntentRejected,
	) {
		t.Fatalf("cancelling an idle workstream returned %v", err)
	}
	if len(execution.cancels) != 0 {
		t.Fatalf("a rejected cancel reached the execution port: %+v", execution.cancels)
	}
}

// TestResolvingAnApprovalAnswersOnItsOwnRun proves the app resolves what the
// approval belongs to. The shell names only the approval; the workstream, the
// conversation, the folder, and the run it is waiting on all come from the same
// durable fold the rail drew the approval from.
func TestResolvingAnApprovalAnswersOnItsOwnRun(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	harness.createConversation("conversation-approving", "Schema migration", &workspaceID)
	harness.startTurn("conversation-approving", "turn-approving-1")
	harness.acceptInput("conversation-approving", "turn-approving-1", "migrate the schema")
	harness.requestApproval("conversation-approving", "turn-approving-1", "approval-migrate")
	registry := harness.start()
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)

	answers := []conversation.ConversationApprovalAnswer{}
	dispatch(t, center, resolveApproval("approval-migrate", conversation.TrajectoryApprovalDecisionApproved, answers))

	if len(execution.approvals) != 1 {
		t.Fatalf("execution approvals = %+v", execution.approvals)
	}
	resolved := execution.approvals[0]
	if resolved.ConversationID != "conversation-approving" ||
		resolved.WorkspaceID != workspaceID ||
		resolved.RunID != "turn-approving-1" ||
		resolved.ApprovalID != "approval-migrate" ||
		resolved.Decision != conversation.TrajectoryApprovalDecisionApproved {
		t.Fatalf("resolved approval = %+v", resolved)
	}
	if len(resolved.Answers) != 0 {
		t.Fatalf("an approve decision carried answers: %+v", resolved.Answers)
	}
}

// TestResolvingAnApprovalCarriesStructuredAnswers proves the boundary can answer
// the approvals a run cannot continue without. A command center that could only
// approve or deny would leave every structured-input approval unanswerable.
func TestResolvingAnApprovalCarriesStructuredAnswers(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	harness.createConversation("conversation-asking", "Deploy", &workspaceID)
	harness.startTurn("conversation-asking", "turn-asking-1")
	harness.acceptInput("conversation-asking", "turn-asking-1", "deploy the service")
	harness.requestStructuredApproval("conversation-asking", "turn-asking-1", "approval-token")
	registry := harness.start()
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)

	answers := []conversation.ConversationApprovalAnswer{
		{QuestionID: "question-token", Answers: []string{"hunter2"}},
	}
	dispatch(t, center, resolveApproval("approval-token", conversation.TrajectoryApprovalDecisionAnswered, answers))

	if len(execution.approvals) != 1 {
		t.Fatalf("execution approvals = %+v", execution.approvals)
	}
	resolved := execution.approvals[0]
	if len(resolved.Answers) != 1 ||
		resolved.Answers[0].QuestionID != "question-token" ||
		len(resolved.Answers[0].Answers) != 1 ||
		resolved.Answers[0].Answers[0] != "hunter2" {
		t.Fatalf("structured answers = %+v", resolved.Answers)
	}

	// The secret the answer carried reaches the provider path that asked for it
	// and nothing else: the app-scoped record says only that an answer was
	// secret, so the rail can explain why the resolution is not shown.
	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.UnresolvedApprovals) != 1 || !snapshot.UnresolvedApprovals[0].Secret {
		t.Fatalf("app-scoped approvals = %+v", snapshot.UnresolvedApprovals)
	}
}

// TestResolvingAnApprovalRejectsAnEndedRun proves an approval whose run is over
// cannot be answered. The provider request it belonged to is gone, so answering
// it would be the app claiming to have done something it could not.
func TestResolvingAnApprovalRejectsAnEndedRun(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	stopped := harness.createConversation("conversation-stopped", "Backfill", &workspaceID)
	harness.startTurn("conversation-stopped", "turn-stopped-1")
	harness.acceptInput("conversation-stopped", "turn-stopped-1", "backfill the table")
	harness.requestApproval("conversation-stopped", "turn-stopped-1", "approval-backfill")
	registry := harness.start()
	execution := &recordedExecution{}
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.endTurn("conversation-stopped", "turn-stopped-1", conversation.TurnStatusCancelled, nil)
	awaitWorkstreamStatus(t, subscription, stopped, WorkstreamStatusBlocked)

	_, err := center.Dispatch(
		context.Background(),
		resolveApproval("approval-backfill", conversation.TrajectoryApprovalDecisionApproved, nil),
	)
	if !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("answering an approval on an ended run returned %v", err)
	}
	if len(execution.approvals) != 0 {
		t.Fatalf("a rejected approval reached the execution port: %+v", execution.approvals)
	}
}

// TestSupplyingAFolderClosesTheRequestAndBindsTheWorkstream proves the affordance
// the pane world could only derive from a routing failure code is now a durable
// request the user answers. The substrate gains the folder, the workstream's
// scope changes, and the request stops being outstanding.
func TestSupplyingAFolderClosesTheRequestAndBindsTheWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Run the tests", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:             DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{WorkstreamID: folderless, AuthoredInput: "run the tests"},
	}))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if executed.ResourceRequestID == nil {
		t.Fatal("folderless work opened no resource request")
	}
	requestID := *executed.ResourceRequestID
	awaitResourceRequest(t, subscription, requestID, ResourceRequestStatusRequested)

	dispatch(t, center, resolveResourceRequest(requestID, registryTestWorkspaceID))

	if len(execution.bindings) != 1 ||
		execution.bindings[0].ConversationID != "conversation-folderless" ||
		execution.bindings[0].WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("execution bindings = %+v", execution.bindings)
	}
	resolved := awaitResourceRequest(t, subscription, requestID, ResourceRequestStatusResolved)
	if resolved.ResolvedBinding == nil ||
		resolved.ResolvedBinding.Folder == nil ||
		resolved.ResolvedBinding.Folder.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("resolved request carries no binding: %+v", resolved)
	}

	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.UnresolvedResourceRequests) != 0 {
		t.Fatalf("resolved request is still outstanding: %+v", snapshot.UnresolvedResourceRequests)
	}
	if snapshot.Aggregates.AwaitingResourceCount != 0 {
		t.Fatalf("aggregates = %+v", snapshot.Aggregates)
	}
	scope := findEntry(t, snapshot, folderless).Workstream.ResourceScope
	if scope.Kind != WorkstreamResourceScopeFolder ||
		scope.Folder == nil ||
		scope.Folder.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("workstream scope = %+v", scope)
	}

	// A request the user already answered is not an affordance any more, so
	// answering it twice is rejected instead of binding the folder again.
	if _, err := center.Dispatch(
		context.Background(),
		resolveResourceRequest(requestID, registryTestWorkspaceID),
	); !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("resolving a closed request returned %v", err)
	}
}

// TestSupplyingAnUnofferedFolderIsRejected proves the folder is authorized the
// same way a Director decision's scope is: against the folders the app can reach
// right now. A workspace id nothing is offering never becomes a binding.
func TestSupplyingAnUnofferedFolderIsRejected(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-unoffered", "Run the tests", nil)
	registry := harness.start()
	execution := &recordedExecution{}
	executor := newExecutorForTest(t, harness, registry, execution)
	center := newSubmittingCommandCenter(t, harness, registry, unreachableDecisionCaller{}, execution)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	executed, err := executor.Execute(context.Background(), routedFor(t, registry, DirectorDecision{
		Kind:             DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{WorkstreamID: folderless, AuthoredInput: "run the tests"},
	}))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	awaitResourceRequest(t, subscription, *executed.ResourceRequestID, ResourceRequestStatusRequested)

	_, err = center.Dispatch(
		context.Background(),
		resolveResourceRequest(*executed.ResourceRequestID, "workspace-nowhere"),
	)
	if !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("supplying an unoffered folder returned %v", err)
	}
	if len(execution.bindings) != 0 {
		t.Fatalf("a rejected binding reached the execution port: %+v", execution.bindings)
	}
}

// awaitResourceRequest blocks until the registry has folded the request into the
// state it reports at the requested status. The registry follows the durable log,
// so a request is answerable once its opening has been pushed — which is also
// when the shell first sees it.
func awaitResourceRequest(
	t *testing.T,
	subscription DirectorEventSubscription,
	requestID string,
	status ResourceRequestStatus,
) ResourceRequest {
	t.Helper()
	for {
		event := awaitEvent(t, subscription, DirectorEventResourceRequestUpdated)
		request := event.ResourceRequestUpdated.ResourceRequest
		if request.ID == requestID && request.Status == status {
			return request
		}
	}
}
