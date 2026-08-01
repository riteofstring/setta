package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"setta/internal/agent"
)

func TestServiceCreatesEphemeralSideForkForParentConversation(t *testing.T) {
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

	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parentID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	assertActiveSideConversation(t, side, working, profile)
	assertSideCarrierRequest(t, runtime, profile)
	assertSideContextInjection(t, service, runtime, side, "hold")
	assertSideCreationEvents(t, service, workspaceID, parentID, working.EventCursor)
	assertSideAbsentFromNavigator(t, service, workspaceID, side.ID)
	assertParentExecutionUnchangedBySide(t, working, created)

	if _, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parentID); !IsCommandConflict(err) {
		t.Fatalf("duplicate side error = %T %v, want conflict", err, err)
	}
	if starts := sideCarrierStarts(runtime); len(starts) != 1 {
		t.Fatalf("duplicate side reached provider: %+v", starts)
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
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parentID)
	if err != nil {
		t.Fatalf("CreateSideConversation: %v", err)
	}
	side := requireOnlySideConversation(t, created)
	frame, serialized := assertSideContextInjection(t, service, runtime, side, "hold side context")
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
	if len(frame.Artifacts) != 1 || frame.Artifacts[0].Title != "Side context result" {
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
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Rejected side context")
	runtime.injectErr = errors.New("scripted side context rejection")
	_, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parent.Conversation.ID)
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
		side.DisposedAt == nil {
		t.Fatalf("failed side injection audit = %+v", side)
	}
	if side.Failure.Message != sidePreparationFailureMessage ||
		strings.Contains(side.Failure.Message, "scripted side context rejection") {
		t.Fatalf("failed side injection exposed provider diagnostics: %+v", side.Failure)
	}
	// The carrier was unsubscribed, so nothing is owed cleanup and the registry
	// keeps no entry for a side that never became usable.
	if _, live := service.carriers.Lookup(side.ID); live {
		t.Fatalf("rejected side kept a carrier registered")
	}
	if unsubscribed := runtime.unsubscribedThreads(); len(unsubscribed) != 1 {
		t.Fatalf("unsubscribed side threads = %v, side = %+v", unsubscribed, side)
	}
}

func TestServicePersistsFailedSideWhenProviderRejectsCarrier(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Failed side parent")
	runtime.startErr = errors.New("scripted side carrier failure")
	_, err := service.createDirectorSideConversationForTest(
		ctx,
		workspaceID,
		parent.Conversation.ID)

	if err == nil || !strings.Contains(err.Error(), "scripted side carrier failure") {
		t.Fatalf("CreateSideConversation failure = %v", err)
	}
	snapshot, readErr := service.ReadSnapshot(ctx, workspaceID, parent.Conversation.ID)
	if readErr != nil {
		t.Fatalf("ReadSnapshot: %v", readErr)
	}
	side := requireOnlySideConversation(t, snapshot)
	if side.Status != SideConversationStatusFailed ||
		side.Failure == nil ||
		side.Failure.Code != "side_carrier_start_failed" ||
		side.ResolvedSideAgentInvocation.Outcome != InvocationOutcomeFailed {
		t.Fatalf("failed side state = %+v", side)
	}
	if side.Failure.Message != sidePreparationFailureMessage ||
		strings.Contains(side.Failure.Message, "scripted side carrier failure") {
		t.Fatalf("failed side start exposed provider diagnostics: %+v", side.Failure)
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
		thread, err := runtime.StartThread(ctx, agent.StartThreadRequest{
			WorkspaceRoot:         prepared.workspaceRoot,
			Invocation:            prepared.invocation,
			Ephemeral:             true,
			DeveloperInstructions: sideAgentDeveloperInstructions,
		})
		if err != nil {
			t.Fatalf("StartThread: %v", err)
		}
		carrier := Carrier{OwnerID: prepared.side.ID, ThreadID: thread.ID}
		if err := service.activateSideConversation(ctx, prepared, carrier); err != nil {
			t.Fatalf("activateSideConversation: %v", err)
		}
		assertSideUpdateParentStatus(t, readServiceEvent(t, subscription), ConversationStatusWorking)
		if _, err := service.DisposeSideConversation(
			ctx,
			workspaceID,
			prepared.parentConversationID,
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
			"side_carrier_start_failed",
			nil,
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
) (preparedSideConversation, ConversationSnapshot) {
	t.Helper()
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Side preparation status")
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
		workspaceSummary.RootPath,
		profile,
		resolved,
		invocation,
		nil,
		BranchDecisionSourceDirector,
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

func TestServiceSideSnapshotRetainsOpenSideOverBoundedFailedHistory(t *testing.T) {
	_, service, runtime, workspaceID := newReviewServiceHarness(t)
	ctx := context.Background()
	parent := createLinkedParentForSideTest(t, ctx, service, runtime, workspaceID, "Bounded side history")
	parentID := parent.Conversation.ID
	runtime.startErr = errors.New("scripted bounded side failure")
	firstFailedSideID := ""
	for index := 0; index < MaxSnapshotSideConversations+3; index++ {
		_, err := service.createDirectorSideConversationForTest(
			ctx,
			workspaceID,
			parentID)

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
	runtime.startErr = nil
	created, err := service.createDirectorSideConversationForTest(ctx, workspaceID, parentID)
	if err != nil {
		t.Fatalf("CreateSideConversation active: %v", err)
	}
	active := created.SideConversations[len(created.SideConversations)-1]
	if len(created.SideConversations) != MaxSnapshotSideConversations ||
		active.Status != SideConversationStatusActive ||
		containsSideConversation(created.SideConversations, firstFailedSideID) {
		t.Fatalf("bounded side snapshot = %+v", created.SideConversations)
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

func createLinkedParentForSideTest(
	t *testing.T,
	ctx context.Context,
	service *Service,
	runtime *serviceTestAgentRuntime,
	workspaceID string,
	title string,
) ConversationSnapshot {
	t.Helper()
	parent, err := service.CreateTopic(ctx, workspaceID, title)
	if err != nil {
		t.Fatalf("CreateTopic: %v", err)
	}
	setupText := "parent foundation: " + title
	if _, err := service.sendTestTurn(ctx, workspaceID, parent.Conversation.ID, setupText); err != nil {
		t.Fatalf("SendTurn parent foundation: %v", err)
	}
	runtime.waitForStart(t, setupText)
	return assertServiceSnapshot(t, service, workspaceID, parent.Conversation.ID, func(snapshot ConversationSnapshot) bool {
		return snapshot.Conversation.Status == ConversationStatusIdle &&
			latestSnapshotTurn(snapshot).Status == TurnStatusCompleted
	})
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

func requireOpenSideConversation(t *testing.T, snapshot ConversationSnapshot) SideConversation {
	t.Helper()
	open := make([]SideConversation, 0, 1)
	for _, side := range snapshot.SideConversations {
		if side.DisposedAt == nil {
			open = append(open, side)
		}
	}
	if len(open) != 1 {
		t.Fatalf("open side conversations = %+v, want one", open)
	}
	return open[0]
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
		side.DecisionSource != BranchDecisionSourceDirector ||
		side.SourceTrajectorySequence != parent.Conversation.LastTrajectorySequence ||
		side.SourceTurnID == nil ||
		*side.SourceTurnID != parentTurn.ID ||
		side.Status != SideConversationStatusActive ||
		side.DisposedAt != nil {
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
		invocation.Outcome != InvocationOutcomeRunning ||
		invocation.ProviderReferences.TurnID != nil {
		t.Fatalf("side invocation = %+v", invocation)
	}
}

func assertSideContextInjection(
	t *testing.T,
	service *Service,
	runtime *serviceTestAgentRuntime,
	side SideConversation,
	wantObjective string,
) (SideInFlightContextFrame, string) {
	t.Helper()
	// The side's carrier is process-local, so the registry — not the durable
	// record — is what names the thread its context was replayed into.
	carrier, live := service.carriers.Lookup(side.ID)
	if !live {
		t.Fatalf("active side has no registered carrier: %+v", side)
	}
	allInjections := runtime.injectedThreadItems()
	sideInjections := make([]serviceTestInjection, 0, 1)
	for _, injection := range allInjections {
		if injection.threadID == carrier.ThreadID {
			sideInjections = append(sideInjections, injection)
		}
	}
	if len(sideInjections) != 1 {
		t.Fatalf("side context injections = %+v, side = %+v", allInjections, side)
	}
	items := sideInjections[0].items
	if len(items) < 2 {
		t.Fatalf("side injected items = %+v", items)
	}
	// The replayed parent history comes first; the boundary and the typed frame
	// always close the injection.
	boundary := items[len(items)-2]
	context := items[len(items)-1]
	if boundary.Role != "user" ||
		!strings.Contains(boundary.Text, "Side conversation boundary.") ||
		!strings.Contains(boundary.Text, "parent conversation's history") ||
		context.Role != "developer" ||
		!strings.HasPrefix(context.Text, sideInFlightContextFrameHeader+"\n") {
		t.Fatalf("side injected items = %+v", items)
	}
	serialized := strings.TrimPrefix(context.Text, sideInFlightContextFrameHeader+"\n")
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

// sideCarrierStarts reports the carriers started for side conversations. The
// parent's own carrier is started with the topic agent's instructions, so the
// side-agent contract is what tells the two apart.
func sideCarrierStarts(runtime *serviceTestAgentRuntime) []agent.StartThreadRequest {
	starts := make([]agent.StartThreadRequest, 0)
	for _, request := range runtime.startThreadRequests() {
		if strings.Contains(request.DeveloperInstructions, "ephemeral side conversation") {
			starts = append(starts, request)
		}
	}
	return starts
}

func assertSideCarrierRequest(
	t *testing.T,
	runtime *serviceTestAgentRuntime,
	profile RoleProfile,
) {
	t.Helper()
	requests := sideCarrierStarts(runtime)
	if len(requests) != 1 {
		t.Fatalf("side carrier starts = %+v, want one", requests)
	}
	request := requests[0]
	if !request.Ephemeral ||
		!request.EnableShellTools ||
		request.Invocation.Model != *profile.ModelSelection.ModelID ||
		request.Invocation.ReasoningEffort != string(profile.ReasoningEffort) ||
		request.Invocation.PermissionMode != agent.PermissionModeReadOnly ||
		request.Invocation.ApprovalMode != agent.ApprovalModeNever {
		t.Fatalf("side carrier request = %+v", request)
	}
	resolutions := runtime.invocationResolutions()
	foundSideResolution := false
	for _, resolution := range resolutions {
		if resolution.Model == request.Invocation.Model &&
			resolution.PermissionMode == agent.PermissionModeReadOnly {
			foundSideResolution = true
		}
	}
	if !foundSideResolution {
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
