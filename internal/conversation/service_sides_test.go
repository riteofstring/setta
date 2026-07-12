package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"
)

func TestServiceCreatesEphemeralSideForkForParentPane(t *testing.T) {
	store, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Side parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	working := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			latestSnapshotTurn(snapshot).ProviderTurnID != nil
	})
	profile := sideAgentOverride("gpt-side-exact")
	persistSideAgentOverride(t, store, parentID, profile)

	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID, "pane-side")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	assertActiveSideConversation(t, side, working, profile)
	assertSideForkRequest(t, runtime, working, profile)
	assertSideContextInjection(t, runtime, side, "hold")
	assertSideCreationEvents(t, service, workspaceID, parentID, working.EventCursor)
	assertSideAbsentFromNavigator(t, service, workspaceID, side.ID)
	assertParentExecutionUnchangedBySide(t, working, created)

	if _, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID, "pane-side"); !IsCommandConflict(err) {
		t.Fatalf("duplicate pane side error = %T %v, want conflict", err, err)
	}
	if len(runtime.sideForkRequests()) != 1 {
		t.Fatalf("duplicate pane reached provider: %+v", runtime.sideForkRequests())
	}
	if _, err := service.StopTurn(ctx, workspaceID, parentID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
}

func TestServiceInjectsTypedAuthoritativeSideContextBeforeActivation(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Typed side context")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	if _, err := service.sendTestTurn(ctx, workspaceID, parentID, "hold side context"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold side context")
	working := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWaitingForApproval &&
			containsTrajectoryKind(snapshot.Trajectory.Events, TrajectoryEventPlanChanged) &&
			containsTrajectoryKind(snapshot.Trajectory.Events, TrajectoryEventActivityProgressed) &&
			containsTrajectoryKind(snapshot.Trajectory.Events, TrajectoryEventArtifactEmitted) &&
			containsTrajectoryKind(snapshot.Trajectory.Events, TrajectoryEventApprovalRequested)
	})
	if _, err := service.steerTestTurn(ctx, workspaceID, parentID, "Keep the active constraint authoritative."); err != nil {
		t.Fatalf("SteerTurn: %v", err)
	}
	steered := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return containsTrajectoryKind(snapshot.Trajectory.Events, TrajectoryEventTurnSteered)
	})
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID, "pane-typed-context")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	frame, serialized := assertSideContextInjection(t, runtime, side, "hold side context")
	assertTypedSideContextFrame(t, frame, steered.Conversation.LastTrajectorySequence, working)
	assertSideContextSanitized(t, serialized)
	if _, err := service.StopTurn(ctx, workspaceID, parentID); err != nil {
		t.Fatalf("StopTurn: %v", err)
	}
}

func assertTypedSideContextFrame(
	t *testing.T,
	frame SideInFlightContextFrame,
	wantSourceSequence int,
	working ConversationSnapshot,
) {
	t.Helper()
	if frame.SourceTrajectorySequence != wantSourceSequence || frame.CurrentObjective == nil {
		t.Fatalf("side in-flight context frame = %+v, working = %+v", frame, working)
	}
	if frame.CurrentObjective.Input.Text != "hold side context" || frame.CurrentObjective.Status != TurnStatusRunning {
		t.Fatalf("side current objective = %+v", frame.CurrentObjective)
	}
	if len(frame.AcceptedSteering) != 1 ||
		frame.AcceptedSteering[0].Input.Text != "Keep the active constraint authoritative." {
		t.Fatalf("side accepted steering = %+v", frame.AcceptedSteering)
	}
	if frame.CurrentPlan == nil {
		t.Fatalf("side current plan = nil")
	}
	if len(frame.ActiveActivities) != 1 || frame.ActiveActivities[0].Command == nil ||
		*frame.ActiveActivities[0].Command != "sleep 12" {
		t.Fatalf("side active activities = %+v", frame.ActiveActivities)
	}
	if len(frame.PendingApprovals) != 1 || frame.PendingApprovals[0].Title != "Allow inspection" {
		t.Fatalf("side pending approvals = %+v", frame.PendingApprovals)
	}
	if len(frame.Artifacts) != 1 || frame.Artifacts[0].URI != "/tmp/side-context-result.md" {
		t.Fatalf("side artifacts = %+v", frame.Artifacts)
	}
}

func assertSideContextSanitized(t *testing.T, serialized string) {
	t.Helper()
	for _, forbidden := range []string{
		"PRIVATE_REASONING_MUST_NOT_ENTER_SIDE_CONTEXT",
		`"providerItemId"`,
		`"providerThreadId"`,
		`"providerTurnId"`,
		`"processId"`,
	} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("side context contains forbidden %q: %s", forbidden, serialized)
		}
	}
}

func TestServiceFailsSideWhenContextInjectionIsRejected(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Rejected side context")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	runtime.injectErr = errors.New("scripted side context rejection")
	_, err = service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-rejected-context")
	if err == nil || !strings.Contains(err.Error(), "scripted side context rejection") {
		t.Fatalf("CreateSideConversation injection error = %v", err)
	}
	snapshot, readErr := service.ReadSnapshot(ctx, workspaceID, parent.Conversation.ID)
	if readErr != nil {
		t.Fatalf("ReadSnapshot: %v", readErr)
	}
	side := requireOnlySideConversation(t, snapshot)
	if side.Status != SideConversationStatusFailed ||
		side.Failure == nil ||
		side.Failure.Code != "side_context_injection_failed" ||
		side.ProviderThreadID == nil ||
		side.ResolvedSideAgentInvocation.ProviderReferences.ThreadID == nil ||
		*side.ResolvedSideAgentInvocation.ProviderReferences.ThreadID != *side.ProviderThreadID {
		t.Fatalf("failed side injection audit = %+v", side)
	}
	unsubscribed := runtime.unsubscribedThreads()
	if len(unsubscribed) != 1 || unsubscribed[0] != *side.ProviderThreadID {
		t.Fatalf("unsubscribed side threads = %v, side = %+v", unsubscribed, side)
	}
}

func TestServicePersistsFailedSideWhenProviderRejectsFork(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Failed side parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	runtime.forkErr = errors.New("scripted side fork failure")
	_, err = service.createRouterSideConversationForTest(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-failed-side")

	if err == nil || !strings.Contains(err.Error(), "scripted side fork failure") {
		t.Fatalf("CreateSideConversation failure = %v", err)
	}
	snapshot, readErr := service.ReadSnapshot(ctx, workspaceID, parent.Conversation.ID)
	if readErr != nil {
		t.Fatalf("ReadSnapshot: %v", readErr)
	}
	side := requireOnlySideConversation(t, snapshot)
	if side.Status != SideConversationStatusFailed ||
		side.Failure == nil ||
		side.Failure.Code != "side_thread_fork_failed" ||
		side.ResolvedSideAgentInvocation.Outcome != InvocationOutcomeFailed {
		t.Fatalf("failed side state = %+v", side)
	}
}

func TestServiceRefreshesParentStatusWhenSidePreparationFinishes(t *testing.T) {
	t.Run("activation", func(t *testing.T) {
		_, service, runtime, workspaceID := newReviewServiceHarness(t)
		ctx := context.Background()
		prepared, working := prepareSideBeforeParentStartsWorking(
			t,
			ctx,
			service,
			runtime,
			workspaceID,
			"pane-activation-status",
		)
		subscription, err := service.SubscribeEvents(
			working.EventCursor,
			workspaceID,
			prepared.parentConversationID,
		)
		if err != nil {
			t.Fatalf("SubscribeEvents: %v", err)
		}
		defer subscription.Unsubscribe()
		thread, err := runtime.ForkThread(ctx, agent.ForkThreadRequest{
			ParentThreadID:        prepared.parentThreadID,
			WorkspaceRoot:         prepared.workspaceRoot,
			Invocation:            prepared.invocation,
			Ephemeral:             true,
			DeveloperInstructions: sideAgentDeveloperInstructions,
		})
		if err != nil {
			t.Fatalf("ForkThread: %v", err)
		}
		if err := service.activateSideConversation(ctx, prepared, thread); err != nil {
			t.Fatalf("activateSideConversation: %v", err)
		}
		assertSideUpdateParentStatus(t, readServiceEvent(t, subscription), ConversationStatusWorking)
		if _, err := service.DisposeSideConversation(
			ctx,
			workspaceID,
			prepared.parentConversationID,
			prepared.side.ParentPaneID,
			prepared.side.ID,
		); err != nil {
			t.Fatalf("DisposeSideConversation: %v", err)
		}
	})

	t.Run("failure", func(t *testing.T) {
		_, service, runtime, workspaceID := newReviewServiceHarness(t)
		ctx := context.Background()
		prepared, working := prepareSideBeforeParentStartsWorking(
			t,
			ctx,
			service,
			runtime,
			workspaceID,
			"pane-failure-status",
		)
		subscription, err := service.SubscribeEvents(
			working.EventCursor,
			workspaceID,
			prepared.parentConversationID,
		)
		if err != nil {
			t.Fatalf("SubscribeEvents: %v", err)
		}
		defer subscription.Unsubscribe()
		cause := errors.New("scripted delayed fork failure")
		if err := service.failPreparingSideConversation(
			prepared,
			"side_thread_fork_failed",
			nil,
			false,
			cause,
		); !errors.Is(err, cause) {
			t.Fatalf("failPreparingSideConversation = %v, want %v", err, cause)
		}
		assertSideUpdateParentStatus(t, readServiceEvent(t, subscription), ConversationStatusWorking)
	})
}

func prepareSideBeforeParentStartsWorking(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	parentPaneID string,
) (preparedSideConversation, ConversationSnapshot) {
	t.Helper()
	parent, err := service.CreateTopic(ctx, workspaceID, "Side preparation status")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		t.Fatalf("ResolveActiveWorkspace: %v", err)
	}
	profile, resolved, invocation, err := service.resolveSideAgentInvocation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
	)
	if err != nil {
		t.Fatalf("resolveSideAgentInvocation: %v", err)
	}
	prepared, err := service.persistPreparingSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		parentPaneID,
		workspaceSummary.RootPath,
		profile,
		resolved,
		invocation,
		nil,
		BranchDecisionSourceConversationRouter,
	)
	if err != nil {
		t.Fatalf("persistPreparingSideConversation: %v", err)
	}
	if prepared.side.ParentStatus != ConversationStatusIdle {
		t.Fatalf("preparing parent status = %s, want idle", prepared.side.ParentStatus)
	}
	if _, err := service.sendTestTurn(ctx, workspaceID, parent.Conversation.ID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	working := assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking
	})
	return prepared, working
}

func assertSideUpdateParentStatus(
	t *testing.T,
	event ConversationEvent,
	want ConversationStatus,
) {
	t.Helper()
	payload, ok := event.Payload.(*ConversationSideConversationUpdatedEventPayload)
	if !ok {
		t.Fatalf("event payload = %T, want side update", event.Payload)
	}
	if payload.SideConversation.ParentStatus != want {
		t.Fatalf("side update parent status = %s, want %s", payload.SideConversation.ParentStatus, want)
	}
}

func TestServiceRejectsInvalidSideForkWithoutUnsubscribingParent(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Invalid side parent")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentThreadID := parent.ThreadBinding.ThreadID
	runtime.forkResponse = &agent.Thread{
		ID:           parentThreadID,
		SessionID:    "session-parent-reused",
		Model:        "gpt-5.6-luna",
		Ephemeral:    true,
		ForkedFromID: &parentThreadID,
	}
	_, err = service.createRouterSideConversationForTest(ctx, workspaceID, parent.Conversation.ID, "pane-invalid")
	if err == nil || !strings.Contains(err.Error(), "reused the parent thread id") {
		t.Fatalf("CreateSideConversation invalid provider result = %v", err)
	}
	if unsubscribed := runtime.unsubscribedThreads(); len(unsubscribed) != 0 {
		t.Fatalf("invalid side fork unsubscribed parent: %v", unsubscribed)
	}
}

func TestServiceSideSnapshotRetainsOpenSideOverBoundedFailedHistory(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Bounded side history")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	runtime.forkErr = errors.New("scripted bounded side failure")
	firstFailedSideID := ""
	for index := 0; index < MaxSnapshotSideConversations+3; index++ {
		_, err := service.createRouterSideConversationForTest(
			ctx,
			workspaceID,
			parentID,
			fmt.Sprintf("pane-failed-%02d", index))

		if err == nil || !strings.Contains(err.Error(), "scripted bounded side failure") {
			t.Fatalf("CreateSideConversation failure %d = %v", index, err)
		}
		if index == 0 {
			snapshot, readErr := service.ReadSnapshot(ctx, workspaceID, parentID)
			if readErr != nil {
				t.Fatalf("ReadSnapshot after first failure: %v", readErr)
			}
			firstFailedSideID = requireOnlySideConversation(t, snapshot).ID
		}
	}
	runtime.forkErr = nil
	created, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID, "pane-active-newest")
	if err != nil {
		t.Fatalf("CreateSideConversation active: %v", err)
	}
	active := created.SideConversations[len(created.SideConversations)-1]
	if len(created.SideConversations) != MaxSnapshotSideConversations ||
		active.ParentPaneID != "pane-active-newest" ||
		active.Status != SideConversationStatusActive ||
		containsSideConversation(created.SideConversations, firstFailedSideID) {
		t.Fatalf("bounded side snapshot = %+v", created.SideConversations)
	}
}

func TestServiceUsesAuthoritativeOpenSideStateOutsideBoundedSnapshot(t *testing.T) {
	store, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Authoritative side state")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	firstSideID := ""
	latest := ConversationSnapshot{}
	for index := 0; index < MaxSnapshotSideConversations+1; index++ {
		latest, err = service.createRouterSideConversationForTest(
			ctx,
			workspaceID,
			parentID,
			fmt.Sprintf("pane-open-%02d", index))

		if err != nil {
			t.Fatalf("CreateSideConversation %d: %v", index, err)
		}
		if index == 0 {
			firstSideID = requireOnlySideConversation(t, latest).ID
		}
	}
	if containsSideConversation(latest.SideConversations, firstSideID) {
		t.Fatalf("precondition failed: oldest open side remained in bounded snapshot: %+v", latest.SideConversations)
	}
	providerCalls := len(runtime.sideForkRequests())
	if _, err := service.createRouterSideConversationForTest(ctx, workspaceID, parentID, "pane-open-00"); !IsCommandConflict(err) {
		t.Fatalf("duplicate old pane error = %T %v, want conflict", err, err)
	}
	if got := len(runtime.sideForkRequests()); got != providerCalls {
		t.Fatalf("duplicate old pane reached provider: calls=%d want=%d", got, providerCalls)
	}
	if _, err := service.SendSideConversationTurn(
		ctx,
		workspaceID,
		parentID,
		firstSideID,
		"old side remains addressable",
	); err != nil {
		t.Fatalf("SendSideConversationTurn omitted side: %v", err)
	}
	runtime.waitForStart(t, "old side remains addressable")
	deadline := time.Now().Add(3 * time.Second)
	var firstSide SideConversation
	for {
		firstSide, err = store.readSideConversation(
			ctx,
			parentID,
			firstSideID,
			latest.Conversation.Status,
		)
		if err != nil {
			t.Fatalf("read omitted side after turn: %v", err)
		}
		if firstSide.ActiveTurnID == nil && firstSide.LastEventSequence > 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for omitted side turn: %+v", firstSide)
		}
		time.Sleep(5 * time.Millisecond)
	}
	if _, err := service.DisposeSideConversation(
		ctx,
		workspaceID,
		parentID,
		"pane-open-00",
		firstSideID,
	); err != nil {
		t.Fatalf("DisposeSideConversation omitted side: %v", err)
	}
	firstSide, err = store.readSideConversation(
		ctx,
		parentID,
		firstSideID,
		latest.Conversation.Status,
	)
	if err != nil {
		t.Fatalf("read omitted side after disposal: %v", err)
	}
	if firstSide.DisposedAt == nil {
		t.Fatalf("omitted side was not disposed: %+v", firstSide)
	}
}

func containsSideConversation(sides []SideConversation, sideID string) bool {
	for _, side := range sides {
		if side.ID == sideID {
			return true
		}
	}
	return false
}

func sideAgentOverride(modelID string) RoleProfile {
	profile := DefaultSideAgentRoleProfile()
	profile.ModelSelection = ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID}
	profile.ReasoningEffort = ReasoningEffortXHigh
	return profile
}

func persistSideAgentOverride(
	t *testing.T,
	store *Store,
	conversationID string,
	profile RoleProfile,
) {
	t.Helper()
	override := RoleProfileOverride{
		ScopeKind: RoleProfileScopeConversation,
		ScopeID:   conversationID,
		Profile:   profile,
		UpdatedAt: testTimeLater,
	}
	_, err := store.Transact(context.Background(), "side-agent-override", func(transaction *WriteTransaction) error {
		if err := transaction.UpsertRoleProfileOverride(override); err != nil {
			return err
		}
		_, err := transaction.AppendCommittedEvent(transactionTestEventDraft(
			"side-agent-override-event",
			"side-agent-override",
			override,
		))
		return err
	})
	if err != nil {
		t.Fatalf("persist side agent override: %v", err)
	}
}

func requireOnlySideConversation(t *testing.T, snapshot ConversationSnapshot) SideConversation {
	t.Helper()
	if len(snapshot.SideConversations) != 1 {
		t.Fatalf("side conversations = %+v, want one", snapshot.SideConversations)
	}
	return snapshot.SideConversations[0]
}

func assertActiveSideConversation(
	t *testing.T,
	side SideConversation,
	parent ConversationSnapshot,
	profile RoleProfile,
) {
	t.Helper()
	assertActiveSideLinkage(t, side, parent)
	assertActiveSideInvocation(t, side, profile)
}

func assertActiveSideLinkage(t *testing.T, side SideConversation, parent ConversationSnapshot) {
	t.Helper()
	parentTurn := latestSnapshotTurn(parent)
	if side.ParentConversationID != parent.Conversation.ID ||
		side.ParentPaneID != "pane-side" ||
		side.DecisionSource != BranchDecisionSourceConversationRouter ||
		side.SourceTrajectorySequence != parent.Conversation.LastTrajectorySequence ||
		side.SourceProviderTurnID == nil ||
		parentTurn.ProviderTurnID == nil ||
		*side.SourceProviderTurnID != *parentTurn.ProviderTurnID ||
		side.Status != SideConversationStatusActive ||
		side.ProviderThreadID == nil {
		t.Fatalf("active side linkage = %+v, parent = %+v", side, parent)
	}
}

func assertActiveSideInvocation(t *testing.T, side SideConversation, profile RoleProfile) {
	t.Helper()
	invocation := side.ResolvedSideAgentInvocation
	if invocation.Role != RoleSideAgent ||
		invocation.Requested.ModelSelection.ModelID == nil ||
		*invocation.Requested.ModelSelection.ModelID != *profile.ModelSelection.ModelID ||
		invocation.Resolved.ModelID != *profile.ModelSelection.ModelID ||
		invocation.Resolved.ReasoningEffort != profile.ReasoningEffort ||
		invocation.Resolved.PermissionProfile.ProviderPermissionProfile != ":read-only" ||
		invocation.Resolved.PermissionProfile.WorkspaceMutation ||
		invocation.ContextUsage.InputBytes <= 0 ||
		invocation.ContextUsage.EstimatedInputTokens <= 0 ||
		invocation.Outcome != InvocationOutcomeRunning ||
		invocation.ProviderReferences.ThreadID == nil ||
		*invocation.ProviderReferences.ThreadID != *side.ProviderThreadID {
		t.Fatalf("side invocation = %+v", invocation)
	}
}

func assertSideContextInjection(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	side SideConversation,
	wantObjective string,
) (SideInFlightContextFrame, string) {
	t.Helper()
	injections := runtime.injectedThreadItems()
	if len(injections) != 1 || side.ProviderThreadID == nil || injections[0].threadID != *side.ProviderThreadID {
		t.Fatalf("side context injections = %+v, side = %+v", injections, side)
	}
	items := injections[0].items
	if len(items) != 2 ||
		items[0].Role != "user" ||
		!strings.Contains(items[0].Text, "Side conversation boundary.") ||
		!strings.Contains(items[0].Text, "inherited history") ||
		items[1].Role != "developer" ||
		!strings.HasPrefix(items[1].Text, sideInFlightContextFrameHeader+"\n") {
		t.Fatalf("side injected items = %+v", items)
	}
	serialized := strings.TrimPrefix(items[1].Text, sideInFlightContextFrameHeader+"\n")
	var frame SideInFlightContextFrame
	if err := json.Unmarshal([]byte(serialized), &frame); err != nil {
		t.Fatalf("decode side context frame: %v\n%s", err, serialized)
	}
	if err := frame.Validate(); err != nil {
		t.Fatalf("validate side context frame: %v\n%+v", err, frame)
	}
	if frame.CurrentObjective == nil || frame.CurrentObjective.Input.Text != wantObjective {
		t.Fatalf("side current objective = %+v, want %q", frame.CurrentObjective, wantObjective)
	}
	return frame, serialized
}

func containsTrajectoryKind(events []TrajectoryEvent, kind TrajectoryEventKind) bool {
	for _, event := range events {
		if event.Kind == kind {
			return true
		}
	}
	return false
}

func assertSideForkRequest(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	parent ConversationSnapshot,
	profile RoleProfile,
) {
	t.Helper()
	requests := runtime.sideForkRequests()
	if len(requests) != 1 {
		t.Fatalf("side fork requests = %+v, want one", requests)
	}
	request := requests[0]
	if request.ParentThreadID != parent.ThreadBinding.ThreadID ||
		request.LastTurnID != nil ||
		!request.Ephemeral ||
		request.Invocation.Model != *profile.ModelSelection.ModelID ||
		request.Invocation.ReasoningEffort != string(profile.ReasoningEffort) ||
		request.Invocation.PermissionMode != agent.PermissionModeReadOnly ||
		request.Invocation.ApprovalMode != agent.ApprovalModeOnRequest ||
		!strings.Contains(request.DeveloperInstructions, "ephemeral side conversation") {
		t.Fatalf("side fork request = %+v", request)
	}
	resolutions := runtime.invocationResolutions()
	if len(resolutions) == 0 || resolutions[len(resolutions)-1].Model != request.Invocation.Model {
		t.Fatalf("side profile resolution requests = %+v", resolutions)
	}
}

func assertSideCreationEvents(
	t *testing.T,
	service *Service,
	workspaceID string,
	conversationID string,
	cursor ConversationEventCursor,
) {
	t.Helper()
	subscription, err := service.SubscribeEvents(cursor, workspaceID, conversationID)
	if err != nil {
		t.Fatalf("SubscribeEvents: %v", err)
	}
	defer subscription.Unsubscribe()
	statuses := make([]SideConversationStatus, 0, 2)
	for event := range subscription.Events() {
		payload, ok := event.Payload.(*ConversationSideConversationUpdatedEventPayload)
		if !ok {
			continue
		}
		statuses = append(statuses, payload.SideConversation.Status)
		if len(statuses) == 2 {
			break
		}
	}
	if len(statuses) != 2 ||
		statuses[0] != SideConversationStatusPreparing ||
		statuses[1] != SideConversationStatusActive {
		t.Fatalf("side creation event statuses = %v", statuses)
	}
}

func assertSideAbsentFromNavigator(
	t *testing.T,
	service *Service,
	workspaceID string,
	sideID string,
) {
	t.Helper()
	page, err := service.ListNavigatorPage(context.Background(), workspaceID, "", nil, 20)
	if err != nil {
		t.Fatalf("ListNavigatorPage: %v", err)
	}
	for _, item := range page.Items {
		if item.Conversation.ID == sideID {
			t.Fatalf("side conversation entered navigator: %+v", item)
		}
	}
}

func assertParentExecutionUnchangedBySide(
	t *testing.T,
	before ConversationSnapshot,
	after ConversationSnapshot,
) {
	t.Helper()
	if after.Conversation.Status != before.Conversation.Status ||
		after.Conversation.LastTrajectorySequence != before.Conversation.LastTrajectorySequence ||
		len(after.Turns.Turns) != len(before.Turns.Turns) ||
		latestSnapshotTurn(after).Status != latestSnapshotTurn(before).Status ||
		len(after.Trajectory.Events) != len(before.Trajectory.Events) {
		t.Fatalf("parent execution changed by side: before=%+v after=%+v", before, after)
	}
}
