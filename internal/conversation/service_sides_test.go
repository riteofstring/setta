package conversation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

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
	if _, err := service.SendTurn(ctx, workspaceID, parentID, "hold"); err != nil {
		t.Fatalf("SendTurn: %v", err)
	}
	runtime.waitForStart(t, "hold")
	working := assertServiceSnapshot(t, service, workspaceID, parentID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusWorking &&
			latestSnapshotTurn(snapshot).ProviderTurnID != nil
	})
	profile := sideAgentOverride("gpt-side-exact")
	persistSideAgentOverride(t, store, parentID, profile)

	created, err := service.CreateSideConversation(ctx, workspaceID, parentID, "pane-side")
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	assertActiveSideConversation(t, side, working, profile)
	assertSideForkRequest(t, runtime, working, profile)
	assertSideCreationEvents(t, service, workspaceID, parentID, working.EventCursor)
	assertSideAbsentFromNavigator(t, service, workspaceID, side.ID)
	assertParentExecutionUnchangedBySide(t, working, created)

	if _, err := service.CreateSideConversation(ctx, workspaceID, parentID, "pane-side"); !IsCommandConflict(err) {
		t.Fatalf("duplicate pane side error = %T %v, want conflict", err, err)
	}
	if len(runtime.sideForkRequests()) != 1 {
		t.Fatalf("duplicate pane reached provider: %+v", runtime.sideForkRequests())
	}
	if _, err := service.StopTurn(ctx, workspaceID, parentID); err != nil {
		t.Fatalf("StopTurn: %v", err)
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
	_, err = service.CreateSideConversation(
		ctx,
		workspaceID,
		parent.Conversation.ID,
		"pane-failed-side",
	)
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
	_, err = service.CreateSideConversation(ctx, workspaceID, parent.Conversation.ID, "pane-invalid")
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
		_, err := service.CreateSideConversation(
			ctx,
			workspaceID,
			parentID,
			fmt.Sprintf("pane-failed-%02d", index),
		)
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
	created, err := service.CreateSideConversation(ctx, workspaceID, parentID, "pane-active-newest")
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

func TestServiceChecksOpenPaneAgainstAuthoritativeSideState(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent, err := service.CreateTopic(ctx, workspaceID, "Authoritative side state")
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	parentID := parent.Conversation.ID
	firstSideID := ""
	latest := ConversationSnapshot{}
	for index := 0; index < MaxSnapshotSideConversations+1; index++ {
		latest, err = service.CreateSideConversation(
			ctx,
			workspaceID,
			parentID,
			fmt.Sprintf("pane-open-%02d", index),
		)
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
	if _, err := service.CreateSideConversation(ctx, workspaceID, parentID, "pane-open-00"); !IsCommandConflict(err) {
		t.Fatalf("duplicate old pane error = %T %v, want conflict", err, err)
	}
	if got := len(runtime.sideForkRequests()); got != providerCalls {
		t.Fatalf("duplicate old pane reached provider: calls=%d want=%d", got, providerCalls)
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
	parentTurn := latestSnapshotTurn(parent)
	if side.ParentConversationID != parent.Conversation.ID ||
		side.ParentPaneID != "pane-side" ||
		side.SourceTrajectorySequence != parent.Conversation.LastTrajectorySequence ||
		side.SourceProviderTurnID == nil ||
		parentTurn.ProviderTurnID == nil ||
		*side.SourceProviderTurnID != *parentTurn.ProviderTurnID ||
		side.Status != SideConversationStatusActive ||
		side.ProviderThreadID == nil {
		t.Fatalf("active side linkage = %+v, parent = %+v", side, parent)
	}
	invocation := side.ResolvedSideAgentInvocation
	if invocation.Role != RoleSideAgent ||
		invocation.Requested.ModelSelection.ModelID == nil ||
		*invocation.Requested.ModelSelection.ModelID != *profile.ModelSelection.ModelID ||
		invocation.Resolved.ModelID != *profile.ModelSelection.ModelID ||
		invocation.Resolved.ReasoningEffort != profile.ReasoningEffort ||
		invocation.Resolved.PermissionProfile.ProviderPermissionProfile != ":read-only" ||
		invocation.Resolved.PermissionProfile.WorkspaceMutation ||
		invocation.Outcome != InvocationOutcomeRunning ||
		invocation.ProviderReferences.ThreadID == nil ||
		*invocation.ProviderReferences.ThreadID != *side.ProviderThreadID {
		t.Fatalf("side invocation = %+v", invocation)
	}
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
